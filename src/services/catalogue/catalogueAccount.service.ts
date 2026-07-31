import { db } from '../../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface CatalogueUserProfile {
  name: string;
  email: string;
  profilePicture: string;
}

/** Fetches the logged-in user's profile document for the catalogue account page. */
export async function fetchCatalogueUserProfile(
  companyId: string,
  userId: string,
): Promise<CatalogueUserProfile | null> {
  try {
    const userDocRef = doc(db, 'companies', companyId, 'users', userId);
    const userDocSnap = await getDoc(userDocRef);
    return userDocSnap.exists() ? (userDocSnap.data() as CatalogueUserProfile) : null;
  } catch (err) {
    console.error('Failed to fetch user profile:', err);
    throw err;
  }
}

/** Returns the number of days remaining until the company's subscription expiry, or null if unknown. */
export async function fetchSubscriptionDaysRemaining(companyId: string): Promise<number | null> {
  try {
    const companyRef = doc(db, 'companies', companyId);
    const snap = await getDoc(companyRef);
    if (!snap.exists()) return null;

    const expiry = snap.data().expiryDate;
    if (!expiry) return null;

    const expiryDate: Date = expiry.toDate ? expiry.toDate() : new Date(expiry);
    const diffMs = expiryDate.getTime() - new Date().getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  } catch (err) {
    console.error('Failed to fetch subscription expiry:', err);
    throw err;
  }
}
