/**
 * Data-access layer for the Catalogue Sales Settings page. Wraps the
 * Firestore reads/writes previously made directly inside
 * `Catalogue/Settings/CatalogueSalesSetting.tsx` behind small, typed
 * functions. Behavior (default-seeding on first load, GSTIN lookup/merge
 * before allowing a Regular/Composition GST scheme) is preserved exactly as
 * it was before extraction.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import { db } from '../../lib/Firebase';
import {
  type CatalogueSalesSettings,
  getDefaultCatalogueSalesSettings,
} from '../../Catalogue/Settings/catalogueSalesSetting.types';

const salesSettingsDocRef = (companyId: string) =>
  doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');

const businessInfoDocRef = (companyId: string) =>
  doc(db, 'companies', companyId, 'business_info', companyId);

/** Loads the catalogue sales settings doc, seeding it with defaults on first visit. */
export async function fetchOrCreateCatalogueSalesSettings(
  companyId: string,
): Promise<CatalogueSalesSettings> {
  try {
    const ref = salesSettingsDocRef(companyId);
    const docSnap = await getDoc(ref);
    const defaultSettings = getDefaultCatalogueSalesSettings(companyId);

    if (docSnap.exists()) {
      return { ...defaultSettings, ...docSnap.data() } as CatalogueSalesSettings;
    }

    await setDoc(ref, defaultSettings);
    return defaultSettings;
  } catch (err) {
    console.error('catalogueSalesSetting.service: failed to fetch/create settings', err);
    throw err;
  }
}

/** Persists the catalogue sales settings doc (merge write). */
export async function saveCatalogueSalesSettings(
  companyId: string,
  settings: CatalogueSalesSettings,
): Promise<void> {
  try {
    await setDoc(
      salesSettingsDocRef(companyId),
      {
        ...settings,
        companyId,
        settingType: 'catalogueSales' as const,
        updatedAt: new Date(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error('catalogueSalesSetting.service: failed to save settings', err);
    throw err;
  }
}

/** Reads the company's saved GSTIN (if any) from the business profile doc. */
export async function fetchBusinessGstin(companyId: string): Promise<string | undefined> {
  try {
    const snap = await getDoc(businessInfoDocRef(companyId));
    return snap.exists() ? (snap.data().gstin as string | undefined) : undefined;
  } catch (err) {
    console.error('catalogueSalesSetting.service: failed to check business GST info', err);
    throw err;
  }
}

/** Saves the GSTIN to the business profile doc (merge write). */
export async function saveBusinessGstin(companyId: string, gstin: string): Promise<void> {
  try {
    await setDoc(
      businessInfoDocRef(companyId),
      { gstin, updatedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.error('catalogueSalesSetting.service: failed to save GST number', err);
    throw err;
  }
}
