import { doc, getDoc, setDoc } from 'firebase/firestore';

import { db } from '../../lib/Firebase';
import type { ShopHoursSettings } from '../../Pages/hooks/useShopHours';

const shopHoursRef = (companyId: string) => doc(db, 'companies', companyId, 'settings', 'shop-hours');

/** Loads the company's shop-hours settings, or `null` if never configured. */
export async function fetchShopHoursSettings(companyId: string): Promise<ShopHoursSettings | null> {
  try {
    const snap = await getDoc(shopHoursRef(companyId));
    return snap.exists() ? (snap.data() as ShopHoursSettings) : null;
  } catch (err) {
    console.error('Failed to load shop-hours settings', err);
    throw err;
  }
}

/** Persists (merges) the company's shop-hours settings. */
export async function saveShopHoursSettings(companyId: string, settings: ShopHoursSettings): Promise<void> {
  try {
    await setDoc(shopHoursRef(companyId), settings, { merge: true });
  } catch (err) {
    console.error('Failed to save shop-hours settings', err);
    throw err;
  }
}
