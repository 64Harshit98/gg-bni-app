import { collection, doc, getDocs, query, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { db } from '../../lib/Firebase';

export interface AppUser {
  uid: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  role?: string;
  companyId?: string;
  photoURL?: string;
  profilePicture?: string;
}

export type AppUserEditableFields = Pick<AppUser, 'name' | 'phoneNumber' | 'role'>;

/** Lists every user document under a company's `users` subcollection. */
export async function fetchCompanyUsers(companyId: string): Promise<AppUser[]> {
  try {
    const usersCollectionRef = collection(db, 'companies', companyId, 'users');
    const snapshot = await getDocs(query(usersCollectionRef));

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        uid: docSnap.id,
        name: data.name || '',
        email: data.email || '',
        phoneNumber: data.phoneNumber || '',
        role: data.role || '',
        companyId: data.companyId || '',
        photoURL: data.photoURL || '',
        profilePicture: data.profilePicture || '',
      } satisfies AppUser;
    });
  } catch (err) {
    console.error('Error fetching users:', err);
    throw err;
  }
}

/** Updates a company user's editable profile fields. */
export async function updateCompanyUser(
  companyId: string,
  uid: string,
  data: AppUserEditableFields,
): Promise<void> {
  try {
    const userDocRef = doc(db, 'companies', companyId, 'users', uid);
    await updateDoc(userDocRef, data);
  } catch (err) {
    console.error('Error updating user:', err);
    throw err;
  }
}

/** Calls the secure `deleteUserAccount` Cloud Function to remove a user's Auth + Firestore records. */
export async function deleteCompanyUser(companyId: string, targetUid: string): Promise<void> {
  try {
    const functions = getFunctions();
    const deleteUserFunction = httpsCallable(functions, 'deleteUserAccount');
    await deleteUserFunction({ targetUid, companyId });
  } catch (err) {
    console.error('Error deleting user:', err);
    throw err;
  }
}
