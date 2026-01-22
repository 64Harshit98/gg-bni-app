import { db } from './Firebase';
import {
  collection,
  addDoc,
  setDoc, // <--- ADDED THIS IMPORT
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

// ================================================================================
// PUBLIC STANDALONE FUNCTIONS (For Public Links/Invoices)
// ================================================================================

/**
 * Fetches all publicly listed items for a specific company.
 */
export const getItemsByCompany = async (companyId: string): Promise<Item[]> => {
  if (!companyId) throw new Error("A valid companyId must be provided.");

  const itemCollectionRef = collection(db, 'companies', companyId, 'items');
  const q = query(
    itemCollectionRef,
    where('isListed', '==', true)
  );
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Item) }));
};

/**
 * Fetches all item groups for a specific company.
 */
export const getItemGroupsByCompany = async (companyId: string): Promise<ItemGroup[]> => {
  if (!companyId) throw new Error("A valid companyId must be provided.");

  const itemGroupCollectionRef = collection(db, 'companies', companyId, 'itemGroups');
  const q = query(itemGroupCollectionRef);
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as ItemGroup) }));
};

// ================================================================================
// FACTORY FUNCTION (SECURE AUTHENTICATED OPERATIONS)
// ================================================================================

export const getFirestoreOperations = (companyId: string) => {
  if (!companyId) {
    throw new Error("A valid companyId must be provided to initialize Firestore operations.");
  }

  // --- References ---
  const companyRef = doc(db, 'companies', companyId);
  const itemGroupRef = collection(companyRef, 'itemGroups');
  const itemRef = collection(companyRef, 'items');
  const usersRef = collection(companyRef, 'users');

  return {
    // --- Business Info ---
    getBusinessInfo: async () => {
      const docRef = doc(db, 'companies', companyId, 'business_info', companyId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        // Safe address construction
        const addressParts = [data.city, data.state, data.postalCode].filter(Boolean).join(' ');
        const finalAddress = addressParts || data.address || "Address not available";

        return {
          name: (data.businessName as string) || "Company Name",
          address: finalAddress,
          phoneNumber: (data.phoneNumber as string) || "",
          accountHolderName: (data.accountHolderName as string) || "",
          accountNumber: (data.accountNumber as string) || "",
          bankName: (data.bankName as string) || "",
          // --- FIX: Added these fields to satisfy TypeScript in Invoice Page ---
          email: (data.email as string) || "",
          gstin: (data.gstin as string) || ""
        };
      } else {
        // Return empty structure to prevent crashes if doc is missing
        console.warn(`Business info not found for ${companyId}`);
        return { name: "", address: "", phoneNumber: "", email: "", gstin: "" };
      }
    },

    // --- Group Operations ---

    getDistinctItemGroupsFromItems: async (): Promise<ItemGroup[]> => {
      // 1. Get all items to find used Group Names
      const itemsSnapshot = await getDocs(itemRef);
      const groupNames = new Set<string>();

      itemsSnapshot.docs.forEach(doc => {
        const item = doc.data() as Item;
        if (item.itemGroupId) {
          groupNames.add(item.itemGroupId);
        }
      });

      if (groupNames.size === 0) return [];

      // 2. Fetch ALL groups
      // FIX: Removed 'where name in' because it crashes if you have > 10 groups.
      // Using memory filtering is safer here.
      const allGroupsSnapshot = await getDocs(itemGroupRef);
      const allGroups = allGroupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ItemGroup));

      // 3. Filter locally
      return allGroups.filter(group => groupNames.has(group.name));
    },

    createItemGroup: async (itemGroup: Omit<ItemGroup, 'id' | 'createdAt' | 'updatedAt' | 'companyId'>): Promise<string> => {
      const docRef = await addDoc(itemGroupRef, {
        ...itemGroup,
        companyId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return docRef.id;
    },

    getItemGroups: async (): Promise<ItemGroup[]> => {
      const snapshot = await getDocs(itemGroupRef);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as ItemGroup) }));
    },

    getItemGroupById: async (id: string): Promise<ItemGroup | null> => {
      const docRef = doc(itemGroupRef, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...(docSnap.data() as ItemGroup) } : null;
    },

    updateItemGroup: async (id: string, updates: Partial<Omit<ItemGroup, 'id' | 'createdAt' | 'companyId'>>): Promise<void> => {
      const docRef = doc(itemGroupRef, id);
      await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() });
    },

    deleteItemGroup: async (id: string): Promise<void> => {
      const docRef = doc(itemGroupRef, id);
      await deleteDoc(docRef);
    },

    updateGroupAndSyncItems: async (group: ItemGroup, newName: string): Promise<void> => {
      const { id, name: oldName } = group;
      if (!id) throw new Error("Group ID is missing.");

      const groupDocRef = doc(itemGroupRef, id);
      const batch = writeBatch(db);

      // Update Group Name
      batch.update(groupDocRef, { name: newName, updatedAt: serverTimestamp() });

      // Find items using the old name
      const itemsQuery = query(itemRef, where('itemGroupId', '==', oldName));
      const itemsSnapshot = await getDocs(itemsQuery);

      // Update items
      itemsSnapshot.forEach(itemDoc => {
        batch.update(itemDoc.ref, { itemGroupId: newName });
      });

      await batch.commit();
    },

    deleteItemGroupIfUnused: async (group: ItemGroup): Promise<void> => {
      const { id, name } = group;
      if (!id) throw new Error("Group ID is missing.");

      const itemsQuery = query(itemRef, where('itemGroupId', '==', name));
      const countSnapshot = await getCountFromServer(itemsQuery);

      if (countSnapshot.data().count > 0) {
        throw new Error(`Cannot delete. This group is used by ${countSnapshot.data().count} item(s).`);
      }

      const groupDocRef = doc(itemGroupRef, id);
      await deleteDoc(groupDocRef);
    },

    // --- Item Operations ---

    // UPDATED: Now accepts optional customId to prevent duplicates
    createItem: async (
      item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'companyId'>,
      customId?: string
    ): Promise<string> => {
      const payload = {
        ...item,
        companyId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (customId) {
        // Use setDoc to enforce the barcode as the ID
        await setDoc(doc(itemRef, customId), payload);
        return customId;
      } else {
        // Use addDoc for random ID
        const docRef = await addDoc(itemRef, payload);
        return docRef.id;
      }
    },

    getItems: async (): Promise<Item[]> => {
      const snapshot = await getDocs(itemRef);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Item) }));
    },

    getItemById: async (id: string): Promise<Item | null> => {
      const docRef = doc(itemRef, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...(docSnap.data() as Item) } : null;
    },

    getItemsByItemGroupId: async (itemGroupId: string): Promise<Item[]> => {
      const q = query(itemRef, where('itemGroupId', '==', itemGroupId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() as Item) }));
    },

    updateItem: async (id: string, updates: Partial<Omit<Item, 'id' | 'createdAt' | 'companyId'>>): Promise<void> => {
      const docRef = doc(itemRef, id);
      await updateDoc(docRef, { ...updates, updatedAt: serverTimestamp() });
    },

    deleteItem: async (id: string): Promise<void> => {
      const docRef = doc(itemRef, id);
      await deleteDoc(docRef);
    },

    getItemByBarcode: async (barcode: string): Promise<Item | null> => {
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
      const q = query(usersRef, where("role", "==", Role.Salesman));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as User[];
    },

    getWorkers: async (): Promise<User[]> => {
      const q = query(usersRef, where("role", "in", [Role.Salesman, Role.Manager]));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as User[];
    },
  };
};