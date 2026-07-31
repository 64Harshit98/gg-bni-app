/**
 * Data-access layer for the (shared POS + Catalogue) Item Settings page.
 * Wraps the Firestore reads/writes previously made directly inside
 * `Pages/Settings/ItemSetting.tsx` behind small, typed functions.
 */
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

export interface ItemSettings {
  companyId?: string;
  settingType: 'item';
  // Categorization & Media
  requireCategory: boolean;
  requireImage: boolean;
  requireHsnCode: boolean;
  // Pricing & Tax
  requirePurchasePrice: boolean;
  requireSaleDiscount: boolean;
  requirePurchaseDiscount: boolean;
  requireDiscount: boolean;
  requireTax: boolean;
  // Inventory & Measurement
  requireStock: boolean;
  requireRestockQuantity: boolean;
  requireMoq: boolean;
  requireUnit: boolean;
  // Barcode
  requireBarcode: boolean;
  autoGenerateBarcode: boolean;
}

export const getDefaultItemSettings = (companyId: string): ItemSettings => ({
  companyId,
  settingType: 'item',
  requireCategory: false,
  requireImage: false,
  requireHsnCode: false,
  requirePurchasePrice: false,
  requireSaleDiscount: false,
  requirePurchaseDiscount: false,
  requireDiscount: false,
  requireTax: false,
  requireStock: false,
  requireRestockQuantity: false,
  requireMoq: false,
  requireUnit: false,
  requireBarcode: false,
  autoGenerateBarcode: true,
});

const itemSettingsDocRef = (companyId: string) => doc(db, 'companies', companyId, 'settings', 'item-settings');

/** Loads the item settings doc, creating it with defaults on first visit. */
export async function fetchItemSettings(companyId: string): Promise<ItemSettings> {
  try {
    const settingsDocRef = itemSettingsDocRef(companyId);
    const docSnap = await getDoc(settingsDocRef);

    if (docSnap.exists()) {
      const existingData = docSnap.data() as Partial<ItemSettings>;
      return { ...getDefaultItemSettings(companyId), ...existingData };
    }

    const defaultSettings = getDefaultItemSettings(companyId);
    await setDoc(settingsDocRef, defaultSettings);
    return defaultSettings;
  } catch (error) {
    console.error('itemSetting.service: failed to fetch item settings', error);
    throw error;
  }
}

/** Persists the item settings doc. */
export async function saveItemSettings(companyId: string, settings: ItemSettings): Promise<void> {
  try {
    const settingsDocRef = itemSettingsDocRef(companyId);
    // firebase's updateDoc expects loosely-typed field values; this cast mirrors
    // the (necessary) `any` used before this module was extracted.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await updateDoc(settingsDocRef, settings as unknown as { [x: string]: any });
  } catch (error) {
    console.error('itemSetting.service: failed to save item settings', error);
    throw error;
  }
}
