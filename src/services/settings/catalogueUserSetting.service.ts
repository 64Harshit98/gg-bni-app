/**
 * Data-access layer for the Catalogue "Manage Users" settings page. Wraps
 * the Firestore reads/writes previously made directly inside
 * `Catalogue/Settings/CatalogueUserSetting.tsx` behind small, typed
 * functions.
 */
import { collection, doc, getDocs, query, updateDoc } from 'firebase/firestore';

import { db } from '../../lib/Firebase';

export interface CompanyUser {
  uid: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  role?: string;
  companyId?: string;
}

export interface CompanyUserUpdate {
  name: string;
  phoneNumber: string;
  role: string;
}

/** Fetches every user document under the company's `users` subcollection. */
export async function fetchCompanyUsers(companyId: string): Promise<CompanyUser[]> {
  try {
    const usersCollectionRef = collection(db, 'companies', companyId, 'users');
    const querySnapshot = await getDocs(query(usersCollectionRef));

    return querySnapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        name: data.name || '',
        email: data.email || '',
        phoneNumber: data.phoneNumber || '',
        role: data.role || '',
        companyId: data.companyId || '',
      } as CompanyUser;
    });
  } catch (err) {
    console.error('catalogueUserSetting.service: failed to fetch users', err);
    throw err;
  }
}

/** Updates a single user's editable fields (name, phone, role). */
export async function updateCompanyUser(
  companyId: string,
  uid: string,
  data: CompanyUserUpdate,
): Promise<void> {
  try {
    const userDocRef = doc(db, 'companies', companyId, 'users', uid);
    await updateDoc(userDocRef, { ...data });
  } catch (err) {
    console.error('catalogueUserSetting.service: failed to update user', err);
    throw err;
  }
}
