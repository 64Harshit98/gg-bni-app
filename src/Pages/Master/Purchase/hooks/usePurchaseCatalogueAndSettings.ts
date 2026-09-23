import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import type { Item } from '../../../../constants/models';
import { useCatalogueData } from '../../../../context/CatalogueDataContext';
import type { Purchase, PurchaseItem, TaxOption } from '../purchase.types';

interface UsePurchaseCatalogueAndSettingsParams {
    currentUser: any;
    authLoading: boolean;
    dbOperations: any;
    purchaseSettings: any;
    loadingPurchaseSettings: boolean;
    purchaseIdToEdit: string | undefined;
    // Typed loosely (not react-router's NavigateFunction) since this file
    // doesn't otherwise depend on react-router-dom; only `navigate(-1)` is
    // ever called here.
    navigate: (path: any) => void;
    // Owned by usePurchaseCart, not this hook — the edit-mode hydration branch
    // of the data-fetch effect below needs to call setItems(validatedItems)
    // once it loads the purchase-to-edit. Threading it in here (rather than
    // moving `items`/`setItems` into this hook) avoids a circular dependency
    // between this hook and usePurchaseCart. See the note in usePurchaseCart.
    setItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
}

// Owns the settings-doc-id lookup, invoice-number/date state, itemGroupMap,
// pageIsLoading/error, the billTaxType state, and edit-mode purchase
// hydration (editModeData). items/itemGroups themselves now come from
// CatalogueDataContext (shared app-wide, one live listener each) instead of
// being fetched here per-page — this is also what fixes the pre-existing gap
// where `pageIsLoading` never actually tracked whether the item/group fetch
// had finished (it used to flip false as soon as auth+settings resolved,
// before the fetch even started, letting the page render before its data was
// ready). Now it's a straightforward composite of the loading flags that
// actually gate what's rendered.
export const usePurchaseCatalogueAndSettings = ({
    currentUser,
    authLoading,
    dbOperations,
    purchaseSettings,
    loadingPurchaseSettings,
    purchaseIdToEdit,
    navigate,
    setItems,
}: UsePurchaseCatalogueAndSettingsParams) => {
    const { items: catalogueItems, itemsLoading, itemGroups, itemGroupsLoading } = useCatalogueData();

    // Local mirror of the shared catalogue items — see the same note in
    // useSalesCatalogueAndSettings.ts. usePurchaseCart/usePurchasePayment
    // need to optimistically mutate this ahead of the shared listener
    // echoing their writes back.
    const [availableItems, setAvailableItems] = useState<Item[]>(catalogueItems);
    useEffect(() => {
        setAvailableItems(catalogueItems);
    }, [catalogueItems]);

    const [error, setError] = useState<string | null>(null);

    const [invoiceNumber, setInvoiceNumber] = useState<string>('');
    const isInvoiceNumberManuallyEdited = useRef(false);
    const [invoiceDate, setInvoiceDate] = useState<string>(() => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    });

    const [billTaxType, setBillTaxType] = useState<TaxOption>('exclusive');

    const itemGroupMap = useMemo(() => {
        const map: Record<string, string> = {};
        itemGroups.forEach((g) => { if (g.id) map[g.id] = g.name || 'Unknown Group'; });
        return map;
    }, [itemGroups]);

    const [editModeData, setEditModeData] = useState<Purchase | null>(null);
    const [_settingsDocId, setSettingsDocId] = useState<string | null>(null);

    const pageIsLoading = authLoading || loadingPurchaseSettings || itemsLoading || itemGroupsLoading;

    // --- Settings doc id lookup + real-time invoice counter — page-specific,
    // unrelated to the shared catalogue data above.
    useEffect(() => {
        const companyId = currentUser?.companyId;
        if (!dbOperations || !companyId) return;

        const findSettingsDocId = async () => {
            try {
                const settingsQuery = query(collection(db, 'companies', companyId, 'settings'), where('settingType', '==', 'purchase'));
                const settingsSnapshot = await getDocs(settingsQuery);
                if (!settingsSnapshot.empty) {
                    setSettingsDocId(settingsSnapshot.docs[0].id);
                }
            } catch (e) {
                console.error("Error finding settings doc ID:", e);
            }
        };
        findSettingsDocId();

        let unsubscribeCounter: () => void = () => { };

        if (!purchaseIdToEdit) {
            const counterRef = doc(db, 'companies', companyId, 'counters', 'purchaseCounter'); // Ensure 'purchaseCounter' matches your DB

            unsubscribeCounter = onSnapshot(counterRef, (docSnap) => {
                // Prevent overwriting if the user is typing their own number
                if (isInvoiceNumberManuallyEdited.current) return;

                // Note: If you use a dynamic prefix for purchases, you can fetch it from purchaseSettings here
                const prefix = purchaseSettings?.voucherPrefix || 'PUR';

                if (docSnap.exists()) {
                    const nextNum = docSnap.data().currentNumber || 1;
                    setInvoiceNumber(`${prefix}-${nextNum}`);
                } else {
                    setInvoiceNumber(`${prefix}-1`);
                }
            });
        }

        return () => unsubscribeCounter();
    }, [currentUser?.companyId, dbOperations, purchaseIdToEdit, purchaseSettings?.voucherPrefix]);

    // --- Edit-mode purchase hydration — waits on the shared items list
    // (needed to resolve each line's masterItem for tax-rate/unit fallback)
    // instead of re-fetching items itself.
    useEffect(() => {
        const companyId = currentUser?.companyId;

        if (!purchaseIdToEdit) {
            setEditModeData(null);
            return;
        }
        if (!companyId || itemsLoading) return;

        const hydrateEditMode = async () => {
            try {
                const purchaseDocRef = doc(db, 'companies', companyId, 'purchases', purchaseIdToEdit);
                const docSnap = await getDoc(purchaseDocRef);

                if (!docSnap.exists()) {
                    throw new Error("Purchase document not found.");
                }

                const purchaseData = { id: docSnap.id, ...docSnap.data() } as Purchase;
                setInvoiceNumber(purchaseData.invoiceNumber);

                if (purchaseData.taxType) {
                    setBillTaxType((purchaseData.taxType === 'exempt' ? 'none' : purchaseData.taxType) as TaxOption);
                }

                const validatedItems = (purchaseData.items || []).map((item: any) => {
                    const masterItem = catalogueItems.find((i: any) => i.id === (item.productId || item.id));
                    const recoveredTaxRate = (item.taxRate && item.taxRate > 0)
                        ? item.taxRate
                        : (masterItem?.tax ?? masterItem?.taxRate ?? 0);

                    // Use the saved transaction discount, NOT master item sale discount
                    const transactionDiscount = item.discount || 0;
                    const transactionDiscount2 = item.purchasediscount2 || 0;

                    return {
                        // FIX: Force a brand new unique ID for React list rendering
                        id: crypto.randomUUID(),
                        name: item.name || 'Unknown Item',
                        unit: item.unit || masterItem?.unit || '',
                        purchasePrice: item.purchasePrice || 0,
                        originalPurchasePrice: masterItem?.purchasePrice || 0,
                        quantity: item.quantity || 1,
                        mrp: item.mrp || 0,
                        discount: transactionDiscount,
                        purchasediscount: transactionDiscount,
                        purchasediscount2: transactionDiscount2,
                        barcode: item.barcode || '',
                        taxRate: recoveredTaxRate,
                        taxType: item.taxType,
                        taxAmount: item.taxAmount,
                        taxableAmount: item.taxableAmount,
                        stock: item.stock ?? item.Stock ?? 0,
                        productId: item.productId || item.id, // The real DB ID is safely kept here
                        isEditable: true,
                        unitMultiplier: item.unitMultiplier || 1
                    };
                });

                setEditModeData(purchaseData);
                setItems(validatedItems);
                setError(null);
            } catch (err: any) {
                console.error('Failed to initialize page:', err);
                setError('Failed to load data. Navigating back.');
                setTimeout(() => navigate(-1), 3000);
            }
        };

        hydrateEditMode();
    }, [purchaseIdToEdit, currentUser?.companyId, itemsLoading, catalogueItems, navigate, setItems]);

    return {
        availableItems, setAvailableItems,
        pageIsLoading,
        error, setError,
        invoiceNumber, setInvoiceNumber,
        isInvoiceNumberManuallyEdited,
        invoiceDate, setInvoiceDate,
        billTaxType, setBillTaxType,
        itemGroupMap,
        editModeData, setEditModeData,
        _settingsDocId, setSettingsDocId,
    };
};
