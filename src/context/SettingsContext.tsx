import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useAuth } from './auth-context';
import { type SalesSettings, getDefaultSalesSettings } from '../Pages/Settings/SalesSetting';
import { type PurchaseSettings, getDefaultPurchaseSettings } from '../Pages/Settings/Purchasesetting';
import { type ItemSettings, getDefaultItemSettings } from '../Pages/Settings/ItemSetting';

interface SettingsContextType {
    salesSettings: SalesSettings | null;
    purchaseSettings: PurchaseSettings | null;
    itemSettings: ItemSettings | null;
    loadingSalesSettings: boolean;
    loadingPurchaseSettings: boolean;
    loadingItemSettings: boolean;
    isLoadingSettings: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { currentUser } = useAuth();

    const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null);
    const [purchaseSettings, setPurchaseSettings] = useState<PurchaseSettings | null>(null);
    const [itemSettings, setItemSettings] = useState<ItemSettings | null>(null);

    const [loadingSalesSettings, setLoadingSalesSettings] = useState(true);
    const [loadingPurchaseSettings, setLoadingPurchaseSettings] = useState(true);
    const [loadingItemSettings, setLoadingItemSettings] = useState(true);

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
            if (docSnap.exists()) {
                setSalesSettings(docSnap.data() as SalesSettings);
            } else {
                console.warn(`SettingsProvider: No 'sales' settings found. Using defaults.`);
                setSalesSettings(getDefaultSalesSettings(companyId));
            }
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
            if (docSnap.exists()) {
                setPurchaseSettings(docSnap.data() as PurchaseSettings);
            } else {
                console.warn(`SettingsProvider: No 'purchase' settings found. Using defaults.`);
                setPurchaseSettings(getDefaultPurchaseSettings(companyId));
            }
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
            if (docSnap.exists()) {
                setItemSettings(docSnap.data() as ItemSettings);
            } else {
                console.warn(`SettingsProvider: No 'item' settings found. Using defaults.`);
                setItemSettings(getDefaultItemSettings(companyId));
            }
            setLoadingItemSettings(false);
        }, (error) => {
            console.error('Error fetching Item Settings:', error);
            setItemSettings(getDefaultItemSettings(companyId));
            setLoadingItemSettings(false);
        });

        return () => unsubscribeItem();
    }, [currentUser?.companyId]);


    const isLoadingSettings = loadingSalesSettings || loadingPurchaseSettings || loadingItemSettings;

    const contextValue = {
        salesSettings,
        purchaseSettings,
        itemSettings,
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