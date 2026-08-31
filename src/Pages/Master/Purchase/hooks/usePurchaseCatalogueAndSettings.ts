import { useState, useEffect, useRef } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import type { Item } from '../../../../constants/models';
import { useLiveItemsStock } from '../../../hooks/useLiveItemsStock';
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
    // of the big data-fetch effect below needs to call setItems(validatedItems)
    // once it loads the purchase-to-edit. Threading it in here (rather than
    // moving `items`/`setItems` into this hook) avoids a circular dependency
    // between this hook and usePurchaseCart. See the note in usePurchaseCart.
    setItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
}

// Owns the settings-doc-id lookup, invoice-number/date state, availableItems
// fetch + useLiveItemsStock, itemGroups fetch, pageIsLoading/error, the
// billTaxType state, and edit-mode purchase hydration (editModeData) — moved
// verbatim from Purchase.tsx (was L63-246). Unlike Sales.tsx, Purchase's
// data-fetch effect and its edit-mode item hydration are a SINGLE effect
// (there's no separate "load items into cart" effect to split out) — so the
// whole effect lives here, with `setItems` threaded in as a param so it can
// still populate the cart on edit-mode load without moving `items` itself
// out of usePurchaseCart.
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
    const [availableItems, setAvailableItems] = useState<Item[]>([]);
    const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
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
    const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});

    const [editModeData, setEditModeData] = useState<Purchase | null>(null);
    const [_settingsDocId, setSettingsDocId] = useState<string | null>(null);

    // Keeps availableItems' `stock` field live-synced — see useLiveItemsStock.ts
    useLiveItemsStock(currentUser?.companyId, dbOperations, setAvailableItems);

    useEffect(() => {
        setPageIsLoading(authLoading || loadingPurchaseSettings);
    }, [authLoading, loadingPurchaseSettings]);

    useEffect(() => {
        if (pageIsLoading || !dbOperations || !currentUser?.companyId) return;

        const companyId = currentUser.companyId;

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

        findSettingsDocId();

        const initializePage = async () => {
            try {
                const fetchedItems = await dbOperations.syncItems();

                let groupMap: Record<string, string> = {};
                if (currentUser?.companyId) {
                    try {
                        const groupsRef = collection(db, 'companies', currentUser.companyId, 'itemGroups');
                        const groupsSnap = await getDocs(groupsRef);
                        groupsSnap.docs.forEach(doc => {
                            const data = doc.data();
                            groupMap[doc.id] = data.name || data.groupName || 'Unknown Group';
                        });
                    } catch (e) { console.error("Error fetching groups", e); }
                }
                setItemGroupMap(groupMap);
                setAvailableItems(fetchedItems);

                if (purchaseIdToEdit) {
                    const purchaseDocRef = doc(db, 'companies', companyId, 'purchases', purchaseIdToEdit);
                    const docSnap = await getDoc(purchaseDocRef);

                    if (docSnap.exists()) {
                        const purchaseData = { id: docSnap.id, ...docSnap.data() } as Purchase;
                        setInvoiceNumber(purchaseData.invoiceNumber);

                        if (purchaseData.taxType) {
                            setBillTaxType((purchaseData.taxType === 'exempt' ? 'none' : purchaseData.taxType) as TaxOption);
                        }

                        const validatedItems = (purchaseData.items || []).map((item: any) => {
                            const masterItem = fetchedItems.find((i: any) => i.id === (item.productId || item.id));
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
                    } else {
                        throw new Error("Purchase document not found.");
                    }
                } else {
                    setEditModeData(null);
                }
                setError(null);
            } catch (err: any) {
                console.error('Failed to initialize page:', err);
                setError('Failed to load data. Navigating back.');
                setTimeout(() => navigate(-1), 3000);
            }
        };

        initializePage();
        return () => unsubscribeCounter();
    }, [dbOperations, currentUser, purchaseIdToEdit, pageIsLoading, navigate]);

    return {
        availableItems, setAvailableItems,
        pageIsLoading, setPageIsLoading,
        error, setError,
        invoiceNumber, setInvoiceNumber,
        isInvoiceNumberManuallyEdited,
        invoiceDate, setInvoiceDate,
        billTaxType, setBillTaxType,
        itemGroupMap, setItemGroupMap,
        editModeData, setEditModeData,
        _settingsDocId, setSettingsDocId,
    };
};
