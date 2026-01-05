import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useAuth } from './auth-context';
import type { SalesSettings } from '../Pages/Settings/SalesSetting';
import { getDefaultSalesSettings } from '../Pages/Settings/SalesSetting';
import type { PurchaseSettings } from '../Pages/Settings/Purchasesetting';
import { getDefaultPurchaseSettings } from '../Pages/Settings/Purchasesetting';
import type { ItemSettings } from '../Pages/Settings/ItemSetting';
import { getDefaultItemSettings } from '../Pages/Settings/ItemSetting';

// Define the shape of the SettingsContext
interface SettingsContextType {
  salesSettings: SalesSettings | null;
  purchaseSettings: PurchaseSettings | null;
  itemSettings: ItemSettings | null;
  loadingSettings: boolean;
}

// Create the context
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// SettingsProvider component
export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [salesSettings, setSalesSettings] = useState<SalesSettings | null>(null);
  const [purchaseSettings, setPurchaseSettings] = useState<PurchaseSettings | null>(null);
  const [itemSettings, setItemSettings] = useState<ItemSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);

  useEffect(() => {
    if (!currentUser?.companyId) {
      setLoadingSettings(false);
      return;
    }

    const companyId = currentUser.companyId;

    const fetchSettings = async () => {
      setLoadingSettings(true);
      try {
        // Fetch Sales Settings
        const salesDocRef = doc(db, 'companies', companyId, 'settings', 'sales-settings');
        const salesDocSnap = await getDoc(salesDocRef);
        if (salesDocSnap.exists()) {
          setSalesSettings(salesDocSnap.data() as SalesSettings);
        } else {
          setSalesSettings(getDefaultSalesSettings(companyId));
        }

        // Fetch Purchase Settings
        const purchaseDocRef = doc(db, 'companies', companyId, 'settings', 'purchase-settings');
        const purchaseDocSnap = await getDoc(purchaseDocRef);
        if (purchaseDocSnap.exists()) {
          setPurchaseSettings(purchaseDocSnap.data() as PurchaseSettings);
        } else {
          setPurchaseSettings(getDefaultPurchaseSettings(companyId));
        }

        // Fetch Item Settings
        const itemDocRef = doc(db, 'companies', companyId, 'settings', 'item-settings');
        const itemDocSnap = await getDoc(itemDocRef);
        if (itemDocSnap.exists()) {
          setItemSettings(itemDocSnap.data() as ItemSettings);
        } else {
          setItemSettings(getDefaultItemSettings(companyId));
        }
      } catch (error) {
        console.error('Error fetching settings:', error);
      } finally {
        setLoadingSettings(false);
      }
    };

    fetchSettings();
  }, [currentUser?.companyId]);

  const value: SettingsContextType = {
    salesSettings,
    purchaseSettings,
    itemSettings,
    loadingSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

// Custom hooks
export const useSalesSettings = (): { salesSettings: SalesSettings | null; loadingSettings: boolean } => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSalesSettings must be used within a SettingsProvider');
  }
  return { salesSettings: context.salesSettings, loadingSettings: context.loadingSettings };
};

export const usePurchaseSettings = (): { purchaseSettings: PurchaseSettings | null; loadingSettings: boolean } => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('usePurchaseSettings must be used within a SettingsProvider');
  }
  return { purchaseSettings: context.purchaseSettings, loadingSettings: context.loadingSettings };
};

export const useItemSettings = (): { itemSettings: ItemSettings | null; loadingSettings: boolean } => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useItemSettings must be used within a SettingsProvider');
  }
  return { itemSettings: context.itemSettings, loadingSettings: context.loadingSettings };
};
