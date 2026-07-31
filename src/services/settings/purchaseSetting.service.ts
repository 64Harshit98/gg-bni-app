/**
 * Data-access layer for the Purchase Settings page. Wraps the Firestore
 * reads/writes previously made directly inside
 * `Pages/Settings/Purchasesetting.tsx` behind small, typed functions.
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

export interface PurchaseSettings {
  companyId?: string;
  settingType: 'purchase';
  defaultDiscount: number;
  inputMRP: boolean;
  zeroValueValidation: boolean;
  enableBarcodePrinting: boolean;
  copyVoucherAfterSaving: boolean;
  roundingOff: boolean;
  enableDiscount2?: boolean;
  voucherName: string;
  voucherPrefix: string;
  currentVoucherNumber: number;
  purchaseViewType: 'card' | 'list';
  requireSupplierName: boolean;
  requireSupplierMobile: boolean;
  cartInsertionOrder?: 'top' | 'bottom';
  cardViewWithPhoto?: boolean;
}

export const getDefaultPurchaseSettings = (companyId: string): PurchaseSettings => ({
  companyId,
  settingType: 'purchase',
  defaultDiscount: 0,
  inputMRP: false,
  zeroValueValidation: true,
  enableBarcodePrinting: true,
  copyVoucherAfterSaving: false,
  roundingOff: false,
  enableDiscount2: false,
  voucherName: 'Purchase',
  voucherPrefix: 'PUR',
  currentVoucherNumber: 1,
  purchaseViewType: 'list',
  requireSupplierName: true,
  requireSupplierMobile: false,
  cartInsertionOrder: 'top',
  cardViewWithPhoto: true,
});

const purchaseSettingsDocRef = (companyId: string) => doc(db, 'companies', companyId, 'settings', 'purchase-settings');
const purchaseCounterDocRef = (companyId: string) => doc(db, 'companies', companyId, 'counters', 'purchaseCounter');

/**
 * Loads the purchase settings doc (creating it with defaults on first
 * visit) merged with the live voucher counter value.
 */
export async function fetchPurchaseSettings(companyId: string): Promise<PurchaseSettings> {
  try {
    const settingsDocRef = purchaseSettingsDocRef(companyId);
    const counterDocRef = purchaseCounterDocRef(companyId);

    const [docSnap, counterSnap] = await Promise.all([getDoc(settingsDocRef), getDoc(counterDocRef)]);

    const defaultSettings = getDefaultPurchaseSettings(companyId);
    let mergedSettings: PurchaseSettings = { ...defaultSettings };

    if (docSnap.exists()) {
      mergedSettings = { ...mergedSettings, ...(docSnap.data() as Partial<PurchaseSettings>) };
    } else {
      await setDoc(settingsDocRef, defaultSettings);
    }

    const counterNumber = counterSnap.exists() ? (counterSnap.data() as { currentNumber?: number }).currentNumber : undefined;
    if (counterNumber !== undefined) {
      mergedSettings.currentVoucherNumber = counterNumber;
    } else {
      await setDoc(counterDocRef, { currentNumber: defaultSettings.currentVoucherNumber }, { merge: true });
    }

    return mergedSettings;
  } catch (error) {
    console.error('purchaseSetting.service: failed to fetch purchase settings', error);
    throw error;
  }
}

/** Persists the purchase settings doc and the voucher counter doc together. */
export async function savePurchaseSettings(companyId: string, settings: PurchaseSettings): Promise<void> {
  try {
    const settingsRef = purchaseSettingsDocRef(companyId);
    const counterRef = purchaseCounterDocRef(companyId);

    const { currentVoucherNumber, ...restOfSettings } = settings;

    const settingsToSave = {
      ...restOfSettings,
      companyId,
      settingType: 'purchase' as const,
    };

    await Promise.all([
      setDoc(settingsRef, settingsToSave, { merge: true }),
      setDoc(counterRef, { currentNumber: currentVoucherNumber }, { merge: true }),
    ]);
  } catch (error) {
    console.error('purchaseSetting.service: failed to save purchase settings', error);
    throw error;
  }
}

/** Reads the live backend voucher counter, used when resetting voucher numbering to default. */
export async function fetchPurchaseVoucherCounter(companyId: string): Promise<number> {
  try {
    const counterSnap = await getDoc(purchaseCounterDocRef(companyId));
    const currentNumber = counterSnap.exists() ? (counterSnap.data() as { currentNumber?: number }).currentNumber : undefined;
    return currentNumber ?? 1;
  } catch (error) {
    console.error('purchaseSetting.service: failed to fetch voucher counter', error);
    throw error;
  }
}
