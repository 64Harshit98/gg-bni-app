import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc, collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import type { Item } from '../../constants/models';
import type { CatalogueSalesSettings } from '../../Catalogue/Settings/CatalogueSalesSetting';

/** Social links stored on a company's `business_info` doc, surfaced in the shop footer. */
export interface ShopSocialLinks {
  instagram?: string;
  facebook?: string;
  twitter?: string;
  gmail?: string;
  [key: string]: unknown;
}

/**
 * Fetches the pinned item ids for a company's shop
 * (`companies/{companyId}/settings/pinned_items`, shape `{ ids: string[] }`).
 * Returns `null` when the doc doesn't exist (as opposed to `[]` when it exists but is empty),
 * so callers can distinguish "no doc yet" from "doc with no pins" if needed.
 */
export async function fetchPinnedItemIds(companyId: string): Promise<string[] | null> {
  try {
    const ref = doc(db, 'companies', companyId, 'settings', 'pinned_items');
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return (snap.data().ids as string[] | undefined) || [];
  } catch (err) {
    console.error('Failed to load pinned items:', err);
    throw err;
  }
}

/** Persists the pinned item ids for a company's shop. */
export async function savePinnedItemIds(companyId: string, ids: string[]): Promise<void> {
  try {
    const ref = doc(db, 'companies', companyId, 'settings', 'pinned_items');
    await setDoc(ref, { ids }, { merge: true });
  } catch (err) {
    console.error('Failed to save pinned items:', err);
    throw err;
  }
}

/** Fetches a company's public subdomain (`companies/{companyId}.subdomain`) for building share URLs. */
export async function fetchCompanySubdomain(companyId: string): Promise<string | null> {
  try {
    const ref = doc(db, 'companies', companyId);
    const snap = await getDoc(ref);
    if (snap.exists() && snap.data().subdomain) {
      return snap.data().subdomain as string;
    }
    return null;
  } catch (err) {
    console.error('Error fetching subdomain for sharing:', err);
    throw err;
  }
}

/** Fetches the business's social links doc (`companies/{companyId}/business_info/{companyId}`). */
export async function fetchBusinessSocialLinks(companyId: string): Promise<ShopSocialLinks | null> {
  try {
    const ref = doc(db, 'companies', companyId, 'business_info', companyId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as ShopSocialLinks;
  } catch (err) {
    console.error('Error fetching business social links:', err);
    throw err;
  }
}

/** Fetches catalogue sales settings (`companies/{companyId}/settings/catalogue-sales-settings`). */
export async function fetchCatalogueSalesSettings(companyId: string): Promise<CatalogueSalesSettings | null> {
  try {
    const ref = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return snap.data() as CatalogueSalesSettings;
  } catch (err) {
    console.error('Error fetching catalogue sales settings:', err);
    throw err;
  }
}

/**
 * Subscribes to the live items collection for a company's shop
 * (`companies/{companyId}/items`), shaping each doc into an `Item`
 * (stock coerced to `Number`, `isListed` defaulted to `false`).
 * Returns the Firestore unsubscribe function.
 */
export function subscribeToShopItems(
  companyId: string,
  onItems: (items: Item[]) => void,
  onError: (err: unknown) => void,
): Unsubscribe {
  const itemsRef = collection(db, 'companies', companyId, 'items');
  return onSnapshot(
    itemsRef,
    (snapshot) => {
      const liveItemsList: Item[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        liveItemsList.push({
          ...data,
          id: docSnap.id,
          stock: data.stock !== undefined && data.stock !== null ? Number(data.stock) : 0,
          isListed: data.isListed ?? false,
        } as Item);
      });
      onItems(liveItemsList);
    },
    onError,
  );
}
