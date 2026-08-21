import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import type { Item } from '../../../../constants/models';
import type { User } from '../../../../Role/permission';
import { PLAN_ALLOWED_FEATURES } from '../../../Settings/SalesSetting';
import { useLiveItemsStock } from '../../../hooks/useLiveItemsStock';

interface UseSalesCatalogueAndSettingsParams {
    currentUser: any;
    authLoading: boolean;
    dbOperations: any;
    rawSettings: any;
    loadingSettings: boolean;
    isEditMode: boolean;
    invoiceToEdit: any;
}

// Owns the settings/invoice-counter/items-sync/workers/itemGroups fetch
// effects — moved verbatim from Sales.tsx (was L98-425: the salesSettings
// useMemo enforcing plan limits, the active-tax-mode preselect effect, the
// invoice-number onSnapshot counter listener + one-time data fetch
// (settingsDocId, availableItems via dbOperations.syncItems(), workers,
// itemGroups, selectedWorker restore), useLiveItemsStock, and the
// tax-mode/salesman sessionStorage draft-save effects). The edit-mode item
// hydration effect and the cart-items sessionStorage draft-save effect were
// NOT moved here even though they fall inside the same original line range —
// they mutate `items`, which is owned by useSalesCart, so moving them here
// would have required passing setItems back into this hook and created a
// circular dependency between the two hooks. They were moved into
// useSalesCart instead; behavior is unchanged, only which file declares them.
export const useSalesCatalogueAndSettings = ({
    currentUser,
    authLoading,
    dbOperations,
    rawSettings,
    loadingSettings,
    isEditMode,
    invoiceToEdit,
}: UseSalesCatalogueAndSettingsParams) => {
    // 👇 2. INSTANTLY ENFORCE PLAN LIMITS 👇
    const salesSettings = useMemo(() => {
        if (!rawSettings) return null;

        // Get the active plan using your exact data structure
        const activePlan = currentUser?.Subscription?.pack?.toLowerCase() || 'pos_basic';
        const allowedFeatures = PLAN_ALLOWED_FEATURES[activePlan] || PLAN_ALLOWED_FEATURES['pos_basic'];

        // If their saved view isn't allowed, force them to the first allowed view (e.g. 'calculator' for basic)
        const validView = allowedFeatures.allowedViews?.includes(rawSettings.salesViewType || 'list')
            ? rawSettings.salesViewType
            : allowedFeatures.allowedViews[0];

        return {
            ...rawSettings,
            salesViewType: validView,
        };
    }, [rawSettings, currentUser?.Subscription?.pack]);

    // --- Active Tax Mode State ---
    // This drives the entire calculation logic now
    const [activeTaxMode, setActiveTaxMode] = useState<'inclusive' | 'exclusive' | 'exempt'>('exclusive');

    const [invoiceNumber, setInvoiceNumber] = useState<string>('');
    const isInvoiceNumberManuallyEdited = useRef(false);
    const [invoiceDate, setInvoiceDate] = useState<string>(() => {
        // In edit mode, use the original invoice's date
        if (isEditMode && invoiceToEdit?.createdAt) {
            const original = new Date(invoiceToEdit.createdAt);
            if (!isNaN(original.getTime())) {
                const yyyy = original.getFullYear();
                const mm = String(original.getMonth() + 1).padStart(2, '0');
                const dd = String(original.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            }
        }
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    });

    const [availableItems, setAvailableItems] = useState<Item[]>([]);
    const [pageIsLoading, setPageIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [workers, setWorkers] = useState<User[]>([]);
    const [selectedWorker, setSelectedWorker] = useState<User | null>(null);
    const [settingsDocId, setSettingsDocId] = useState<string | null>(null);

    const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});

    // Logic: Always pre-select based on settings, but allow override.
    useEffect(() => {
        if (loadingSettings) return;

        if (isEditMode && invoiceToEdit?.taxType) {
            const savedType = invoiceToEdit.taxType;
            if (savedType === 'none') setActiveTaxMode('exempt');
            else if (savedType === 'inclusive' || savedType === 'exclusive') setActiveTaxMode(savedType);
        } else if (salesSettings) {
            // 1. Check session storage first — but only trust it while a bill is
            // actually in progress (cart has items). Settings sync live across tabs
            // (SettingsContext's onSnapshot), but this draft used to be honored
            // unconditionally, so any tab that had ever opened the Sales page (even
            // with an empty cart) would keep re-applying its old tax-mode draft
            // forever and never pick up a setting changed from another tab. Gating
            // on an in-progress cart keeps the "survive an accidental refresh
            // mid-bill" behavior while letting an idle/empty page always follow the
            // live setting.
            const savedTaxMode = sessionStorage.getItem('sales_tax_mode_draft');
            let hasCartItems = false;
            try {
                hasCartItems = JSON.parse(sessionStorage.getItem('sales_cart_draft') || '[]').length > 0;
            } catch {
                hasCartItems = false;
            }
            if (
                !isEditMode &&
                hasCartItems &&
                (savedTaxMode === 'inclusive' || savedTaxMode === 'exclusive' || savedTaxMode === 'exempt')
            ) {
                setActiveTaxMode(savedTaxMode);
            }
            // 2. Fallback to pre-select based on Settings
            else if (
                salesSettings.gstScheme === 'none' ||
                salesSettings.gstScheme === 'composition' ||
                // Calculator view is quick ad-hoc billing (raw amounts typed
                // in, no per-item tax breakdown) — it should never default to
                // Inclusive/Exclusive regardless of the company's GST scheme.
                salesSettings.salesViewType === 'calculator'
            ) {
                setActiveTaxMode('exempt');
            } else {
                setActiveTaxMode(salesSettings.taxType as any || 'exclusive');
            }
        }
    }, [loadingSettings, salesSettings, isEditMode, invoiceToEdit]);

    // ... (Data Fetching - Unchanged) ...
    useEffect(() => {
        const findSettingsDocId = async () => {
            if (currentUser?.companyId) {
                const settingsQuery = query(collection(db, 'companies', currentUser.companyId, 'settings'), where('settingType', '==', 'sales'));
                const settingsSnapshot = await getDocs(settingsQuery);
                if (!settingsSnapshot.empty) setSettingsDocId(settingsSnapshot.docs[0].id);
            }
        };
        findSettingsDocId();

        if (authLoading || !currentUser || !dbOperations || loadingSettings) {
            setPageIsLoading(authLoading || loadingSettings);
            return;
        }

        // --- REAL-TIME INVOICE LISTENER (Multi-tab Fix) ---
        let unsubscribeCounter: () => void = () => { };

        if (!isEditMode && currentUser?.companyId) {
            const counterRef = doc(db, 'companies', currentUser.companyId, 'counters', 'invoiceCounter');
            const settingsRef = doc(db, 'companies', currentUser.companyId, 'settings', 'sales-settings');

            unsubscribeCounter = onSnapshot(counterRef, async (docSnap) => {
                if (isInvoiceNumberManuallyEdited.current) return;
                const settingsSnap = await getDoc(settingsRef);
                const prefix = settingsSnap.exists() ? (settingsSnap.data().voucherPrefix || 'INV') : 'INV';

                if (docSnap.exists()) {
                    const nextNum = docSnap.data().currentNumber || 1;
                    setInvoiceNumber(`${prefix}-${nextNum}`);
                } else {
                    setInvoiceNumber(`${prefix}-1`);
                }
            });
        }

        const fetchData = async () => {
            try {
                setPageIsLoading(true);
                setError(null);
                const fetchedItems = await dbOperations.syncItems();
                setAvailableItems(fetchedItems);

                // If in edit mode, we use the saved number, NOT the live counter
                if (isEditMode && invoiceToEdit?.invoiceNumber) {
                    setInvoiceNumber(invoiceToEdit.invoiceNumber);
                }

                const fetchedWorkers = await dbOperations.getWorkers();
                setWorkers(fetchedWorkers);
                let groupMap: Record<string, string> = {};
                if (currentUser?.companyId) {
                    try {
                        const groupsRef = collection(db, 'companies', currentUser.companyId, 'itemGroups');
                        const groupsSnap = await getDocs(groupsRef);
                        groupsSnap.docs.forEach(doc => { const data = doc.data(); groupMap[doc.id] = data.name || data.groupName || 'Unknown Group'; });
                    } catch (e) { console.error(e); }
                }
                setItemGroupMap(groupMap);
                if (isEditMode) {
                    const originalSalesman = fetchedWorkers.find((u: User) => u.uid === invoiceToEdit?.salesmanId);
                    setSelectedWorker(originalSalesman || null);
                } else {
                    const savedSalesmanUid = sessionStorage.getItem('sales_salesman_draft');
                    if (savedSalesmanUid) {
                        const savedWorker = fetchedWorkers.find((u: User) => u.uid === savedSalesmanUid);
                        setSelectedWorker(savedWorker || null);
                    } else {
                        const currentUserAsWorker = fetchedWorkers.find((u: User) => u.uid === currentUser.uid);
                        setSelectedWorker(currentUserAsWorker || null);
                    }
                }
            } catch (err) {
                console.error(err);
                setError('Failed to load initial page data.');
            } finally {
                setPageIsLoading(false);
            }
        };

        fetchData();

        // Cleanup the listener when the component unmounts
        return () => unsubscribeCounter();

    }, [authLoading, currentUser, dbOperations, isEditMode, invoiceToEdit, loadingSettings]);

    // Keeps availableItems' `stock` field live-synced — see useLiveItemsStock.ts
    useLiveItemsStock(currentUser?.companyId, setAvailableItems);

    useEffect(() => {
        if (!isEditMode && activeTaxMode && !pageIsLoading) {
            // Only persist the draft while a bill is actually in progress — an idle
            // page with an empty cart has nothing worth protecting from a refresh,
            // and saving it here regardless was what caused the cross-tab "stuck on
            // old setting" bug (see the restore effect above for the full story).
            let hasCartItems = false;
            try {
                hasCartItems = JSON.parse(sessionStorage.getItem('sales_cart_draft') || '[]').length > 0;
            } catch {
                hasCartItems = false;
            }
            if (hasCartItems) {
                sessionStorage.setItem('sales_tax_mode_draft', activeTaxMode);
            } else {
                sessionStorage.removeItem('sales_tax_mode_draft');
            }
        }
    }, [activeTaxMode, isEditMode, pageIsLoading]);

    useEffect(() => {
        if (!isEditMode && !pageIsLoading) {
            if (selectedWorker) {
                sessionStorage.setItem('sales_salesman_draft', selectedWorker.uid);
            } else {
                sessionStorage.removeItem('sales_salesman_draft');
            }
        }
    }, [selectedWorker, isEditMode, pageIsLoading]);

    return {
        salesSettings,
        activeTaxMode, setActiveTaxMode,
        invoiceNumber, setInvoiceNumber,
        isInvoiceNumberManuallyEdited,
        invoiceDate, setInvoiceDate,
        availableItems, setAvailableItems,
        pageIsLoading, setPageIsLoading,
        error, setError,
        workers, setWorkers,
        selectedWorker, setSelectedWorker,
        settingsDocId, setSettingsDocId,
        itemGroupMap, setItemGroupMap,
    };
};
