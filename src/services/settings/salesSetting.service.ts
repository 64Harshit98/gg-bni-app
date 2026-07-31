import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import { db } from '../../lib/Firebase';
import type { SalesSettings } from '../../Pages/Settings/SalesSetting';

const salesSettingsRef = (companyId: string) =>
  doc(db, 'companies', companyId, 'settings', 'sales-settings');

const invoiceCounterRef = (companyId: string) =>
  doc(db, 'companies', companyId, 'counters', 'invoiceCounter');

const businessInfoRef = (companyId: string) =>
  doc(db, 'companies', companyId, 'business_info', companyId);

export interface SalesSettingsBootstrap {
  settings: SalesSettings;
  counterNumber: number;
}

/**
 * Loads the company's sales settings + invoice counter, creating either
 * document with sane defaults the first time a company visits this page.
 */
export async function fetchOrCreateSalesSettings(
  companyId: string,
  defaults: SalesSettings,
): Promise<SalesSettingsBootstrap> {
  try {
    const [settingsSnap, counterSnap] = await Promise.all([
      getDoc(salesSettingsRef(companyId)),
      getDoc(invoiceCounterRef(companyId)),
    ]);

    let settings: SalesSettings = defaults;
    if (settingsSnap.exists()) {
      settings = { ...defaults, ...(settingsSnap.data() as Partial<SalesSettings>) };
    } else {
      await setDoc(salesSettingsRef(companyId), settings);
    }

    let counterNumber = settings.currentVoucherNumber ?? 1;
    const counterData = counterSnap.data();
    if (counterSnap.exists() && counterData?.currentNumber !== undefined) {
      counterNumber = counterData.currentNumber as number;
    } else {
      await setDoc(invoiceCounterRef(companyId), { currentNumber: counterNumber }, { merge: true });
    }

    return { settings, counterNumber };
  } catch (err) {
    console.error('Failed to fetch/create sales settings:', err);
    throw err;
  }
}

/** Persists the sales settings document and the invoice counter together. */
export async function saveSalesSettings(
  companyId: string,
  settingsToSave: Record<string, unknown>,
  counterNumber: number,
): Promise<void> {
  try {
    await Promise.all([
      setDoc(salesSettingsRef(companyId), settingsToSave, { merge: true }),
      setDoc(invoiceCounterRef(companyId), { currentNumber: counterNumber }, { merge: true }),
    ]);
  } catch (err) {
    console.error('Failed to save sales settings:', err);
    throw err;
  }
}

/** Reads the current backend invoice counter value (used by "Reset to default"). */
export async function fetchInvoiceCounter(companyId: string): Promise<number> {
  try {
    const snap = await getDoc(invoiceCounterRef(companyId));
    const currentNumber = snap.data()?.currentNumber;
    return snap.exists() && currentNumber ? (currentNumber as number) : 1;
  } catch (err) {
    console.error('Failed to fetch backend invoice counter:', err);
    throw err;
  }
}

/** Reads the company's saved GSTIN, if any, from the business profile. */
export async function fetchBusinessGstin(companyId: string): Promise<string | undefined> {
  try {
    const snap = await getDoc(businessInfoRef(companyId));
    return snap.exists() ? (snap.data().gstin as string | undefined) : undefined;
  } catch (err) {
    console.error('Failed to check business GST info:', err);
    throw err;
  }
}

/** Saves the company's GSTIN to the business profile. */
export async function saveBusinessGstin(companyId: string, gstin: string): Promise<void> {
  try {
    await setDoc(businessInfoRef(companyId), { gstin, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.error('Failed to save GST number:', err);
    throw err;
  }
}
