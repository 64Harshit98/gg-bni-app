import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../../lib/Firebase';
import type { Item } from '../../../../constants/models';
import type { User } from '../../../../Role/permission';
import { PLAN_ALLOWED_FEATURES } from '../../../Settings/SalesSetting';
import { useCatalogueData } from '../../../../context/CatalogueDataContext';

interface UseSalesCatalogueAndSettingsParams {
    currentUser: any;
    authLoading: boolean;
    dbOperations: any;
    rawSettings: any;
    loadingSettings: boolean;
    isEditMode: boolean;
    invoiceToEdit: any;
}

// Owns the settings/invoice-counter fetch + the page-specific parts of the
// original data-fetch effect. items/workers/itemGroups themselves now come
// from CatalogueDataContext (shared app-wide, one live listener each)
// instead of being fetched here per-page — that shared provider is what
// actually fixes the "stuck on loading" race this hook used to have: this
// hook's own effect no longer stacks 3 sequential Firestore calls behind
// pageIsLoading, so there's much less here for auth-object churn to re-fire
// into an overlapping fetch. See CatalogueDataContext.tsx for the full story.
export const useSalesCatalogueAndSettings = ({
    currentUser,
    authLoading,
    dbOperations: _dbOperations,
    rawSettings,
    loadingSettings,
    isEditMode,
    invoiceToEdit,
}: UseSalesCatalogueAndSettingsParams) => {
    const { items: catalogueItems, itemsLoading, workers, workersLoading, itemGroups, itemGroupsLoading } = useCatalogueData();

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

    // Local mirror of the shared catalogue items — kept as real state (not a
    // direct read of context) because callers (useSalesCart, useSalesPayment)
    // need to optimistically mutate it (barcode link, item-edit-drawer save,
    // post-sale stock decrement) ahead of the shared listener echoing the
    // write back. Re-synced from context whenever the shared list updates.
    const [availableItems, setAvailableItems] = useState<Item[]>(catalogueItems);
    useEffect(() => {
        setAvailableItems(catalogueItems);
    }, [catalogueItems]);

    const [error, setError] = useState<string | null>(null);

    const [selectedWorker, setSelectedWorker] = useState<User | null>(null);
    const [settingsDocId, setSettingsDocId] = useState<string | null>(null);

    const itemGroupMap = useMemo(() => {
        const map: Record<string, string> = {};
        itemGroups.forEach((g) => { if (g.id) map[g.id] = g.name || 'Unknown Group'; });
        return map;
    }, [itemGroups]);

    const pageIsLoading = authLoading || loadingSettings || itemsLoading || workersLoading || itemGroupsLoading;

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

    // --- Settings doc id lookup + real-time invoice counter (multi-tab fix) ---
    // Page-specific, unrelated to the shared catalogue data above.
    useEffect(() => {
        const companyId = currentUser?.companyId;
        if (!companyId) return;

        const findSettingsDocId = async () => {
            try {
                const settingsQuery = query(collection(db, 'companies', companyId, 'settings'), where('settingType', '==', 'sales'));
                const settingsSnapshot = await getDocs(settingsQuery);
                if (!settingsSnapshot.empty) setSettingsDocId(settingsSnapshot.docs[0].id);
                setError(null);
            } catch (err) {
                console.error(err);
                setError('Failed to load initial page data.');
            }
        };
        findSettingsDocId();

        let unsubscribeCounter: () => void = () => { };

        if (!isEditMode) {
            const counterRef = doc(db, 'companies', companyId, 'counters', 'invoiceCounter');
            const settingsRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');

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
        } else if (invoiceToEdit?.invoiceNumber) {
            // In edit mode, we use the saved number, NOT the live counter
            setInvoiceNumber(invoiceToEdit.invoiceNumber);
        }

        return () => unsubscribeCounter();
    }, [currentUser?.companyId, isEditMode, invoiceToEdit]);

    // --- Default salesman selection — runs once, the first time the shared
    // workers list is ready, same as the old one-shot fetchData used to.
    // Guarded by a ref (not just `workers.length`) because `workers` is now a
    // LIVE list: without the guard, any later edit to a worker elsewhere would
    // re-run this and silently stomp on whatever the user has since chosen.
    const workerDefaultInitialized = useRef(false);
    useEffect(() => {
        if (workersLoading || workerDefaultInitialized.current) return;
        workerDefaultInitialized.current = true;

        if (isEditMode) {
            const originalSalesman = workers.find((u) => u.uid === invoiceToEdit?.salesmanId);
            setSelectedWorker(originalSalesman || null);
        } else {
            const savedSalesmanUid = sessionStorage.getItem('sales_salesman_draft');
            if (savedSalesmanUid) {
                const savedWorker = workers.find((u) => u.uid === savedSalesmanUid);
                setSelectedWorker(savedWorker || null);
            } else {
                const currentUserAsWorker = workers.find((u) => u.uid === currentUser?.uid);
                setSelectedWorker(currentUserAsWorker || null);
            }
        }
    }, [workersLoading, workers, isEditMode, invoiceToEdit, currentUser]);

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
        pageIsLoading,
        error,
        workers,
        selectedWorker, setSelectedWorker,
        settingsDocId,
        itemGroupMap,
    };
};
