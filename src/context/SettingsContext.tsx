import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
    collection,
    query,
    where,
    onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useAuth } from './auth-context';

export interface SalesSettings {
    companyId?: string;
    settingType?: 'sales';
    enableTax?: boolean;
    salesViewType?: 'card' | 'list';
    enableSalesmanSelection?: boolean;
    gstScheme?: 'regular' | 'composition' | 'none'; // 'none' means tax is disabled
    taxType?: 'inclusive' | 'exclusive';
    defaultTaxRate?: number;
    enableRounding?: boolean;
    enforceExactMRP?: boolean;
    enableItemWiseDiscount?: boolean;
    lockDiscountEntry?: boolean;
    lockSalePriceEntry?: boolean;
    defaultDiscount?: number;
    allowNegativeStock?: boolean;
    allowDueBilling?: boolean;
    requireCustomerName?: boolean;
    requireCustomerMobile?: boolean;
    voucherName?: string;
    voucherPrefix?: string;
    currentVoucherNumber?: number;
    copyVoucherAfterSaving?: boolean;
    enforceMRP?: boolean;
    enableBarcodePrinting?: boolean;
    cartInsertionOrder?: 'top' | 'bottom';
    lockTaxToggle?: boolean;

}

export interface PurchaseSettings {
    companyId?: string;
    settingType?: 'purchase';

    // Replaced enableTax and defaultTaxRate
    gstScheme?: 'regular' | 'composition' | 'none';
    taxType?: 'inclusive' | 'exclusive'; // This applies to regular AND composition

    defaultDiscount?: number;
    inputMRP?: boolean;
    zeroValueValidation?: boolean;
    enableBarcodePrinting?: boolean;
    copyVoucherAfterSaving?: boolean;
    roundingOff?: boolean;

    voucherName?: string;
    voucherPrefix?: string;
    currentVoucherNumber?: number;

    purchaseViewType?: 'card' | 'list';

    requireSupplierName?: boolean;
    requireSupplierMobile?: boolean;
}

export interface ItemSettings {
    companyId?: string;
    settingType?: 'item';
    requirePurchasePrice?: boolean;
    requireDiscount?: boolean;
    requireTax?: boolean;
    requireBarcode?: boolean;
    requireRestockQuantity?: boolean;
    autoGenerateBarcode?: boolean;
}


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

const getDefaultSalesSettings = (companyId: string): SalesSettings => ({
    companyId: companyId,
    settingType: 'sales',
    salesViewType: 'list',
    enableSalesmanSelection: true,
    enableTax: true,
    taxType: 'exclusive',
    defaultTaxRate: 0,
    enableRounding: true,
    enforceExactMRP: false,
    enableItemWiseDiscount: true,
    lockDiscountEntry: false,
    lockSalePriceEntry: false,
    allowNegativeStock: false,
    allowDueBilling: true,
    requireCustomerName: true,
    requireCustomerMobile: false,
    voucherName: 'Sales',
    voucherPrefix: 'SLS-',
    currentVoucherNumber: 1,
    cartInsertionOrder: 'top',
    lockTaxToggle: false,
    defaultDiscount: 0,
    copyVoucherAfterSaving: false,
    enforceMRP: false,
    enableBarcodePrinting: false,
});

const getDefaultPurchaseSettings = (companyId: string): PurchaseSettings => ({
    companyId: companyId,
    settingType: 'purchase',
    taxType: 'exclusive',
    gstScheme: 'regular',
    defaultDiscount: 0,
    inputMRP: true,
    zeroValueValidation: true,
    enableBarcodePrinting: false,
    copyVoucherAfterSaving: false,
    roundingOff: false,
    voucherName: 'Purchase',
    voucherPrefix: 'PUR-',
    currentVoucherNumber: 1,
    purchaseViewType: 'list',
    requireSupplierName: true,
    requireSupplierMobile: false,
});

const getDefaultItemSettings = (companyId: string): ItemSettings => ({
    companyId: companyId,
    settingType: 'item',
    requirePurchasePrice: false,
    requireDiscount: false,
    requireTax: false,
    requireBarcode: false,
    requireRestockQuantity: false,
    autoGenerateBarcode: true,
});


export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const { currentUser } = useAuth();

    const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null);
    const [purchaseSettings, setPurchaseSettings] = useState<PurchaseSettings | null>(null);
    const [itemSettings, setItemSettings] = useState<ItemSettings | null>(null); // Added Item state

    const [loadingSalesSettings, setLoadingSalesSettings] = useState(true);
    const [loadingPurchaseSettings, setLoadingPurchaseSettings] = useState(true);
    const [loadingItemSettings, setLoadingItemSettings] = useState(true); // Added Item loading state

    useEffect(() => {
        if (!currentUser?.companyId) {
            setLoadingSalesSettings(false);
            setSalesSettings(null);
            return;
        }
        setLoadingSalesSettings(true);
        const companyId = currentUser.companyId;

        // --- FIX: Use the correct multi-tenant path ---
        const settingsCollectionRef = collection(db, 'companies', companyId, 'settings');
        // --- FIX: No longer need to query by companyId, as it's in the path ---
        const qSales = query(settingsCollectionRef, where('settingType', '==', 'sales'));

        const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
            if (!snapshot.empty) {
                const docData = snapshot.docs[0].data() as SalesSettings;
                setSalesSettings(docData);
            } else {
                console.warn(`SettingsProvider: No 'sales' settings found for company ${companyId}. Using defaults.`);
                setSalesSettings(getDefaultSalesSettings(companyId));
            }
            setLoadingSalesSettings(false);
        }, (error) => {
            console.error('Error fetching Sales Settings:', error);
            setSalesSettings(getDefaultSalesSettings(companyId)); // Fallback on error
            setLoadingSalesSettings(false); // Also set loading to false on error
        });

        return () => unsubscribeSales();
    }, [currentUser?.companyId]);

    useEffect(() => {
        if (!currentUser?.companyId) {
            setLoadingPurchaseSettings(false);
            setPurchaseSettings(null);
            return;
        }
        setLoadingPurchaseSettings(true);
        const companyId = currentUser.companyId;

        // --- FIX: Use the correct multi-tenant path ---
        const settingsCollectionRef = collection(db, 'companies', companyId, 'settings');
        // --- FIX: No longer need to query by companyId, as it's in the path ---
        const qPurchase = query(settingsCollectionRef, where('settingType', '==', 'purchase'));

        const unsubscribePurchase = onSnapshot(qPurchase, (snapshot) => {
            if (!snapshot.empty) {
                const docData = snapshot.docs[0].data() as PurchaseSettings;
                setPurchaseSettings(docData);
            } else {
                console.warn(`SettingsProvider: No 'purchase' settings found for company ${companyId}. Using defaults.`);
                setPurchaseSettings(getDefaultPurchaseSettings(companyId));
            }
            setLoadingPurchaseSettings(false);
        }, (error) => {
            console.error('Error fetching Purchase Settings:', error);
            setPurchaseSettings(getDefaultPurchaseSettings(companyId)); // Fallback on error
            setLoadingPurchaseSettings(false);
        });

        return () => unsubscribePurchase();
    }, [currentUser?.companyId]);

    useEffect(() => {
        if (!currentUser?.companyId) {
            setLoadingItemSettings(false);
            setItemSettings(null);
            return;
        }
        setLoadingItemSettings(true);
        const companyId = currentUser.companyId;

        // --- FIX: Use the correct multi-tenant path ---
        const settingsCollectionRef = collection(db, 'companies', companyId, 'settings');
        // --- FIX: No longer need to query by companyId, as it's in the path ---
        const qItem = query(settingsCollectionRef, where('settingType', '==', 'item'));

        const unsubscribeItem = onSnapshot(qItem, (snapshot) => {
            if (!snapshot.empty) {
                const docData = snapshot.docs[0].data() as ItemSettings;
                setItemSettings(docData);
            } else {
                console.warn(`SettingsProvider: No 'item' settings found for company ${companyId}. Using defaults.`);
                setItemSettings(getDefaultItemSettings(companyId));
            }
            setLoadingItemSettings(false);
        }, (error) => {
            console.error('Error fetching Item Settings:', error);
            setItemSettings(getDefaultItemSettings(companyId)); // Fallback on error
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