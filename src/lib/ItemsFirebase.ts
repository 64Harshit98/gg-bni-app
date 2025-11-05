import { db } from './Firebase';
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDoc,
  serverTimestamp,
  writeBatch,
  getCountFromServer,
} from 'firebase/firestore';
import type { Item, ItemGroup } from '../constants/models';
import { Role, type User } from '../Role/permission';

/**
 * Fetches all publicly listed items for a specific company.
 * @param companyId The company ID from the URL.
 */
export const getItemsByCompany = async (companyId: string): Promise<Item[]> => {
  if (!companyId) {
    throw new Error("A valid companyId must be provided.");
  }
  // --- FIX: Use multi-tenant path ---
  const itemCollectionRef = collection(db, 'companies', companyId, 'items');
  const q = query(
    itemCollectionRef,
    where('isListed', '==', true) // Only fetch items marked for public listing
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Item) }));
};

/**
 * Fetches all item groups for a specific company.
 * @param companyId The company ID from the URL.
 */
export const getItemGroupsByCompany = async (companyId: string): Promise<ItemGroup[]> => {
  if (!companyId) {
    throw new Error("A valid companyId must be provided.");
  }
  // --- FIX: Use multi-tenant path ---
  const itemGroupCollectionRef = collection(db, 'companies', companyId, 'itemGroups');
  const q = query(itemGroupCollectionRef); // No 'where' needed
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as ItemGroup) }));
};

//================================================================================
// PATTERN 1: REMOVED
// The old, module-level functions (initializeDbOperations, etc.) were
// insecure and incompatible with your new multi-tenant rules.
// Your app is correctly using the Pattern 2 factory function below.
//================================================================================

//================================================================================
// PATTERN 2: FACTORY FUNCTION (RECOMMENDED)
//================================================================================

/**
 * ✅ RECOMMENDED: Factory Function for Firestore Operations.
 * Call this function with a companyId to get a set of database operations
 * that are securely scoped to that company.
 */
export const getFirestoreOperations = (companyId: string) => {
  if (!companyId) {
    throw new Error("A valid companyId must be provided to initialize Firestore operations.");
  }

  // --- FIX: All collection paths are now multi-tenant ---
  const companyRef = doc(db, 'companies', companyId);
  const itemGroupRef = collection(companyRef, 'itemGroups');
  const itemRef = collection(companyRef, 'items');
  const usersRef = collection(companyRef, 'users');
  /**
   * Fetches the business info document.
   * Assumes the business_info doc ID is the same as the companyId.
   */
  const getBusinessInfo = async () => {
    // --- FIX: Simplified to fetch the specific doc ---
    // This path comes from your 'registerCompanyAndUser' Cloud Function
    const docRef = doc(db, 'companies', companyId, 'business_info', companyId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const businessPhoneNumber = data.phoneNumber || 'Your Phone Number';
      // Builds the address from city, state, and postalCode fields
      const address = `${data.city || ''}, ${data.state || ''} - ${data.postalCode || ''}`;

      return {
        name: data.businessName as string,
        address: address,
        phoneNumber: businessPhoneNumber,
      };
    } else {
      throw new Error(`Business information document not found for companyID: ${companyId}`);
    }
  };

  return {
    getBusinessInfo,

    getDistinctItemGroupsFromItems: async (): Promise<ItemGroup[]> => {
      // --- FIX: 'itemRef' is already the correct multi-tenant path ---
      const itemsSnapshot = await getDocs(itemRef);

      const groupNames = new Set<string>();
      itemsSnapshot.docs.forEach(doc => {
        const item = doc.data() as Item;
        if (item.itemGroupId && typeof item.itemGroupId === 'string') {
          groupNames.add(item.itemGroupId);
        }
      });

      if (groupNames.size === 0) {
        return [];
      }

      // --- FIX: 'itemGroupRef' is already the correct multi-tenant path ---
      const groupsQuery = query(itemGroupRef, where('name', 'in', Array.from(groupNames)));
      const groupsSnapshot = await getDocs(groupsQuery);

      return groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ItemGroup));
    },

    createItemGroup: async (itemGroup: Omit<ItemGroup, 'id' | 'createdAt' | 'updatedAt' | 'companyId'>): Promise<string> => {
      // 'companyId' field is redundant but harmless
      const docRef = await addDoc(itemGroupRef, { ...itemGroup, companyId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return docRef.id;
    },
    getItemGroups: async (): Promise<ItemGroup[]> => {
      // --- FIX: 'itemGroupRef' is already the correct multi-tenant path ---
      const snapshot = await getDocs(itemGroupRef);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as ItemGroup) }));
    },
    getItemGroupById: async (id: string): Promise<ItemGroup | null> => {
      // --- FIX: Build doc path directly ---
      const docRef = doc(db, 'companies', companyId, 'itemGroups', id);
      const docSnap = await getDoc(docRef);
      // Security rule handles permission, no 'verifyOwnership' needed
      return docSnap.exists() ? { id: docSnap.id, ...(docSnap.data() as ItemGroup) } : null;
    },
    updateItemGroup: async (id: string, updates: Partial<Omit<ItemGroup, 'id' | 'createdAt' | 'companyId'>>): Promise<void> => {
      // --- FIX: Build doc path directly ---
      const itemGroupDoc = doc(db, 'companies', companyId, 'itemGroups', id);
      await updateDoc(itemGroupDoc, { ...updates, updatedAt: serverTimestamp() });
    },
    deleteItemGroup: async (id: string): Promise<void> => {
      // --- FIX: Build doc path directly ---
      const itemGroupDoc = doc(db, 'companies', companyId, 'itemGroups', id);
      await deleteDoc(itemGroupDoc);
    },

    updateGroupAndSyncItems: async (group: ItemGroup, newName: string): Promise<void> => {
      const { id, name: oldName } = group;
      if (!id) throw new Error("Group ID is missing.");

      // --- FIX: Build doc path directly ---
      const groupDocRef = doc(db, 'companies', companyId, 'itemGroups', id);

      const batch = writeBatch(db);
      batch.update(groupDocRef, { name: newName, updatedAt: serverTimestamp() });

      // --- FIX: 'itemRef' is already the correct multi-tenant path ---
      const itemsQuery = query(itemRef, where('itemGroupId', '==', oldName));
      const itemsSnapshot = await getDocs(itemsQuery);
      itemsSnapshot.forEach(itemDoc => {
        batch.update(itemDoc.ref, { itemGroupId: newName });
      });

      await batch.commit();
    },

    deleteItemGroupIfUnused: async (group: ItemGroup): Promise<void> => {
      const { id, name } = group;
      if (!id) throw new Error("Group ID is missing.");

      // --- FIX: Build doc path directly ---
      const groupDocRef = doc(db, 'companies', companyId, 'itemGroups', id);

      // --- FIX: 'itemRef' is already the correct multi-tenant path ---
      const itemsQuery = query(itemRef, where('itemGroupId', '==', name));
      const countSnapshot = await getCountFromServer(itemsQuery);

      if (countSnapshot.data().count > 0) {
        throw new Error(`Cannot delete. This group is used by ${countSnapshot.data().count} item(s).`);
      }

      await deleteDoc(groupDocRef);
    },

    // --- Item Operations ---
    createItem: async (item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'companyId'>): Promise<string> => {
      // --- FIX: 'itemRef' is already the correct multi-tenant path ---
      const docRef = await addDoc(itemRef, { ...item, companyId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return docRef.id;
    },
    getItems: async (): Promise<Item[]> => {
      // --- FIX: 'itemRef' is already the correct multi-tenant path ---
      const snapshot = await getDocs(itemRef);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Item) }));
    },
    getItemById: async (id: string): Promise<Item | null> => {
      // --- FIX: Build doc path directly ---
      const docRef = doc(db, 'companies', companyId, 'items', id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...(docSnap.data() as Item) } : null;
    },
    getItemsByItemGroupId: async (itemGroupId: string): Promise<Item[]> => {
      // --- FIX: 'itemRef' is already the correct multi-tenant path ---
      const q = query(itemRef, where('itemGroupId', '==', itemGroupId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Item) }));
    },
    updateItem: async (id: string, updates: Partial<Omit<Item, 'id' | 'createdAt' | 'companyId'>>): Promise<void> => {
      // --- FIX: Build doc path directly ---
      const itemDoc = doc(db, 'companies', companyId, 'items', id);
      await updateDoc(itemDoc, { ...updates, updatedAt: serverTimestamp() });
    },
    deleteItem: async (id: string): Promise<void> => {
      // --- FIX: Build doc path directly ---
      const itemDoc = doc(db, 'companies', companyId, 'items', id);
      await deleteDoc(itemDoc);
    },
    getItemByBarcode: async (barcode: string): Promise<Item | null> => {
      // --- FIX: 'itemRef' is already the correct multi-tenant path ---
      const q = query(itemRef, where('barcode', '==', barcode));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...(doc.data() as Item) };
      }
      return null;
    },

    // --- User Operations ---
    getSalesmen: async (): Promise<User[]> => {
      // --- FIX: 'usersRef' is already the correct multi-tenant path ---
      const q = query(usersRef, where("role", "==", Role.Salesman));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as User[];
    },
    getWorkers: async (): Promise<User[]> => {
      // --- FIX: THIS WAS THE BUG. 'usersRef' is now the correct multi-tenant path ---
      const q = query(usersRef, where("role", "in", [Role.Salesman, Role.Manager]));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as User[];
    },
  };
};