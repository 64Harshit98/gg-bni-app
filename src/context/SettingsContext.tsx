import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useAuth } from './auth-context';
import { useDispatch } from 'react-redux';
import type { AppDispatch } from '../store/store';
import {
    setSalesSettings as reduxSetSalesSettings,
    setPurchaseSettings as reduxSetPurchaseSettings,
    setItemSettings as reduxSetItemSettings,
    clearSettings,
} from '../store/settingsSlice';
import { type SalesSettings, getDefaultSalesSettings } from '../Pages/Settings/SalesSetting';
import { type PurchaseSettings, getDefaultPurchaseSettings } from '../Pages/Settings/Purchasesetting';
import { type ItemSettings, getDefaultItemSettings } from '../Pages/Settings/ItemSetting';
import { type CatalogueSalesSettings, getDefaultCatalogueSalesSettings } from '../Catalogue/Settings/CatalogueSalesSetting';

interface SettingsContextType {
    salesSettings: SalesSettings | null;
    purchaseSettings: PurchaseSettings | null;
    itemSettings: ItemSettings | null;
    catalogueSettings: CatalogueSalesSettings | null;
    loadingCatalogueSettings: boolean;
    loadingSalesSettings: boolean;
    loadingPurchaseSettings: boolean;
    loadingItemSettings: boolean;
    isLoadingSettings: boolean;
}

/**
 * Recursively converts any Firestore Timestamp (identified by the presence of
 * `seconds` + `nanoseconds`) to an ISO string so the value is safe to store
 * in Redux (which requires fully serializable state).
 */
function sanitizeForRedux<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    // Duck-type Firestore Timestamp
    if (
        'seconds' in (obj as object) &&
        'nanoseconds' in (obj as object) &&
        typeof (obj as any).toDate === 'function'
    ) {
        return (obj as any).toDate().toISOString() as unknown as T;
    }
    if (Array.isArray(obj)) {
        return (obj as unknown[]).map(sanitizeForRedux) as unknown as T;
    }
    return Object.fromEntries(
        Object.entries(obj as object).map(([k, v]) => [k, sanitizeForRedux(v)])
    ) as T;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { currentUser } = useAuth();
    const dispatch = useDispatch<AppDispatch>();

    const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null);
    const [purchaseSettings, setPurchaseSettings] = useState<PurchaseSettings | null>(null);
    const [itemSettings, setItemSettings] = useState<ItemSettings | null>(null);

    const [loadingSalesSettings, setLoadingSalesSettings] = useState(true);
    const [loadingPurchaseSettings, setLoadingPurchaseSettings] = useState(true);
    const [loadingItemSettings, setLoadingItemSettings] = useState(true);

    const [catalogueSettings, setCatalogueSettings] = useState<CatalogueSalesSettings | null>(null);
    const [loadingCatalogueSettings, setLoadingCatalogueSettings] = useState(true);

    useEffect(() => {
        if (!currentUser?.companyId) {
            setLoadingCatalogueSettings(false);
            setCatalogueSettings(null);
            dispatch(clearSettings());
            return;
        }

        setLoadingCatalogueSettings(true);
        const companyId = currentUser.companyId;
        const docRef = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setCatalogueSettings(docSnap.data() as CatalogueSalesSettings);
            } else {
                // This ensures the app "sees" defaults even if DB is empty
                setCatalogueSettings(getDefaultCatalogueSalesSettings(companyId));
            }
            setLoadingCatalogueSettings(false);
        }, (error) => {
            console.error('Error fetching Catalogue Settings:', error);
            setCatalogueSettings(getDefaultCatalogueSalesSettings(companyId));
            setLoadingCatalogueSettings(false);
        });

        return () => unsubscribe();
    }, [currentUser?.companyId]);

    // --- FETCH SALES SETTINGS ---
    useEffect(() => {
        if (!currentUser?.companyId) {
            setLoadingSalesSettings(false);
            setSalesSettings(null);
            return;
        }

        setLoadingSalesSettings(true);
        const companyId = currentUser.companyId;

        // FIX: Target the exact document ID your page saves to
        const docRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');

        const unsubscribeSales = onSnapshot(docRef, (docSnap) => {
            const value = docSnap.exists()
                ? (docSnap.data() as SalesSettings)
                : (console.warn(`SettingsProvider: No 'sales' settings found. Using defaults.`), getDefaultSalesSettings(companyId));
            setSalesSettings(value);
            dispatch(reduxSetSalesSettings(sanitizeForRedux(value)));
            setLoadingSalesSettings(false);
        }, (error) => {
            console.error('Error fetching Sales Settings:', error);
            setSalesSettings(getDefaultSalesSettings(companyId));
            setLoadingSalesSettings(false);
        });

        return () => unsubscribeSales();
    }, [currentUser?.companyId]);

    // --- FETCH PURCHASE SETTINGS ---
    useEffect(() => {
        if (!currentUser?.companyId) {
            setLoadingPurchaseSettings(false);
            setPurchaseSettings(null);
            return;
        }

        setLoadingPurchaseSettings(true);
        const companyId = currentUser.companyId;

        // FIX: Target the exact document ID your page saves to
        const docRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');

        const unsubscribePurchase = onSnapshot(docRef, (docSnap) => {
            const value = docSnap.exists()
                ? (docSnap.data() as PurchaseSettings)
                : (console.warn(`SettingsProvider: No 'purchase' settings found. Using defaults.`), getDefaultPurchaseSettings(companyId));
            setPurchaseSettings(value);
            dispatch(reduxSetPurchaseSettings(sanitizeForRedux(value)));
            setLoadingPurchaseSettings(false);
        }, (error) => {
            console.error('Error fetching Purchase Settings:', error);
            setPurchaseSettings(getDefaultPurchaseSettings(companyId));
            setLoadingPurchaseSettings(false);
        });

        return () => unsubscribePurchase();
    }, [currentUser?.companyId]);

    // --- FETCH ITEM SETTINGS ---
    useEffect(() => {
        if (!currentUser?.companyId) {
            setLoadingItemSettings(false);
            setItemSettings(null);
            return;
        }

        setLoadingItemSettings(true);
        const companyId = currentUser.companyId;

        // FIX: Target the exact document ID your page saves to
        const docRef = doc(db, 'companies', companyId, 'settings', 'item-settings');

        const unsubscribeItem = onSnapshot(docRef, (docSnap) => {
            const value = docSnap.exists()
                ? (docSnap.data() as ItemSettings)
                : (console.warn(`SettingsProvider: No 'item' settings found. Using defaults.`), getDefaultItemSettings(companyId));
            setItemSettings(value);
            dispatch(reduxSetItemSettings(sanitizeForRedux(value)));
            setLoadingItemSettings(false);
        }, (error) => {
            console.error('Error fetching Item Settings:', error);
            setItemSettings(getDefaultItemSettings(companyId));
            setLoadingItemSettings(false);
        });

        return () => unsubscribeItem();
    }, [currentUser?.companyId]);


    const isLoadingSettings = loadingSalesSettings || loadingPurchaseSettings || loadingItemSettings || loadingCatalogueSettings;

    const contextValue = {
        salesSettings,
        purchaseSettings,
        itemSettings,
        catalogueSettings,
        loadingCatalogueSettings,
        loadingSalesSettings,
        loadingPurchaseSettings,
        loadingItemSettings,
        isLoadingSettings
    };

    return (
        <SettingsContext.Provider value={contextValue}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useCatalogueSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useCatalogueSettings must be used within a SettingsProvider');
    }
    return {
        catalogueSettings: context.catalogueSettings,
        loadingSettings: context.loadingCatalogueSettings
    };
};

export const useSalesSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSalesSettings must be used within a SettingsProvider');
    }
    return { salesSettings: context.salesSettings, loadingSettings: context.loadingSalesSettings };
};

export const usePurchaseSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('usePurchaseSettings must be used within a SettingsProvider');
    }
    return { purchaseSettings: context.purchaseSettings, loadingSettings: context.loadingPurchaseSettings };
};

export const useItemSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useItemSettings must be used within a SettingsProvider');
    }
    return { itemSettings: context.itemSettings, loadingSettings: context.loadingItemSettings };
};

export const useIsLoadingSettings = () => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useIsLoadingSettings must be used within a SettingsProvider');
    }
    return context.isLoadingSettings;
}