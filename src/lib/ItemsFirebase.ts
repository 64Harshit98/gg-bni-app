import { db } from './Firebase';
import {
  collection,
  addDoc,
  setDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc, // Still used for non-sync items like groups
  query,
  where,
  getDoc,
  serverTimestamp,
  writeBatch,
  getCountFromServer
} from 'firebase/firestore';
import { get, set } from 'idb-keyval'; // High-performance local storage
import type { Item, ItemGroup } from '../constants/models';
import { Role, type User } from '../Role/permission';



export const getFirestoreOperations = (companyId: string) => {
  if (!companyId) {
    throw new Error("A valid companyId must be provided to initialize Firestore operations.");
  }

  const companyRef = doc(db, 'companies', companyId);
  const itemGroupRef = collection(companyRef, 'itemGroups');
  const itemRef = collection(companyRef, 'items');
  const usersRef = collection(companyRef, 'users');

  return {
    // ---------------------------------------------------------
    // 1. SYNC ITEMS (The "Delta Sync" Strategy)
    // ---------------------------------------------------------
    syncItems: async (): Promise<Item[]> => {
      // Dynamic keys ensure Company A data doesn't mix with Company B
      const STORE_KEY = `pos_items_${companyId}`;
      const TIME_KEY = `pos_sync_time_${companyId}`;

      // A. Load Local Data (Fast, 0 Cost)
      let localItems: Item[] = (await get(STORE_KEY)) || [];
      const lastSyncTime = await get(TIME_KEY);

      // B. Build Query: "Give me only what changed since last time"
      let q;
      if (lastSyncTime) {
        console.log(`[Sync] Checking for updates since: ${lastSyncTime}`);
        const lastDate = new Date(lastSyncTime);
        q = query(itemRef, where('updatedAt', '>', lastDate));
      } else {
        console.log(`[Sync] First time load. Fetching full database.`);
        q = query(itemRef);
      }

      // C. Fetch from Firestore
      const snapshot = await getDocs(q);

      // D. Optimization: If no updates, return local cache immediately
      if (snapshot.empty) {
        // Return only items that are NOT deleted
        return localItems.filter(i => !i.isDeleted);
      }

      // E. Merge Logic
      const fetchedItems = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Item) }));
      
      // Create a map of existing items for O(1) lookups
      const itemMap = new Map(localItems.map(i => [i.id, i]));

      fetchedItems.forEach(newItem => {
        if (newItem.isDeleted) {
          // If server says "deleted", remove from local map
          itemMap.delete(newItem.id);
        } else {
          // Otherwise add/update the item
          itemMap.set(newItem.id, newItem);
        }
      });

      // Convert back to array
      const mergedItems = Array.from(itemMap.values());

      // F. Save New State to Local Device
      await set(STORE_KEY, mergedItems);
      await set(TIME_KEY, new Date().toISOString());

      console.log(`[Sync] Updated. Total items available: ${mergedItems.length}`);
      
      // Return list without deleted items
      return mergedItems.filter(i => !i.isDeleted);
    },

    // ---------------------------------------------------------
    // 2. ITEM CRUD (Modified for Soft Deletes)
    // ---------------------------------------------------------

    createItem: async (
      item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'companyId'>,
      customId?: string
    ): Promise<string> => {
      const payload = {
        ...item,
        companyId,
        isDeleted: false, // Default to not deleted
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp() // Crucial for Sync
      };

      if (customId) {
        await setDoc(doc(itemRef, customId), payload);
        return customId;
      } else {
        const docRef = await addDoc(itemRef, payload);
        return docRef.id;
      }
    },

    updateItem: async (id: string, updates: Partial<Omit<Item, 'id' | 'createdAt' | 'companyId'>>): Promise<void> => {
      const docRef = doc(itemRef, id);
      await updateDoc(docRef, { 
        ...updates, 
        updatedAt: serverTimestamp() // Crucial: This triggers the sync for other users
      });
    },

    // CRITICAL CHANGE: Soft Delete instead of Physical Delete
    deleteItem: async (id: string): Promise<void> => {
      const docRef = doc(itemRef, id);
      await updateDoc(docRef, { 
        isDeleted: true, 
        updatedAt: serverTimestamp() 
      });
      // The next time syncItems() runs, it will see this flag and remove it locally.
    },

    // ---------------------------------------------------------
    // 3. OTHER HELPER FUNCTIONS (Preserved)
    // ---------------------------------------------------------

    getItemByBarcode: async (barcode: string): Promise<Item | null> => {
      // NOTE: For better performance, you should use syncItems() on the frontend 
      // and .find() the barcode there. But this serves as a fallback.
      const q = query(itemRef, where('barcode', '==', barcode), where('isDeleted', '==', false));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return { id: doc.id, ...(doc.data() as Item) };
      }
      return null;
    },

    getBusinessInfo: async () => {
      const docRef = doc(db, 'companies', companyId, 'business_info', companyId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const addressParts = [data.city, data.state, data.postalCode].filter(Boolean).join(' ');
        const finalAddress = addressParts || data.address || "Address not available";

        return {
          name: (data.businessName as string) || "Company Name",
          address: finalAddress,
          phoneNumber: (data.phoneNumber as string) || "",
          accountHolderName: (data.accountHolderName as string) || "",
          accountNumber: (data.accountNumber as string) || "",
          bankName: (data.bankName as string) || "",
          email: (data.email as string) || "",
          gstin: (data.gstin as string) || ""
        };
      } else {
        console.warn(`Business info not found for ${companyId}`);
        return { name: "", address: "", phoneNumber: "", email: "", gstin: "" };
      }
    },

    // --- ITEM GROUPS (These typically don't need delta sync as they are small lists) ---

    getDistinctItemGroupsFromItems: async (): Promise<ItemGroup[]> => {
        // Optimized: Just fetch groups directly. 
        // If you need perfect accuracy on "used" groups, stick to reading just ItemGroups
        // rather than reading all Items to check usage.
        const snapshot = await getDocs(itemGroupRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ItemGroup));
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

      batch.update(groupDocRef, { name: newName, updatedAt: serverTimestamp() });

      // Note: This reads items. For massive lists, consider running this in a Cloud Function
      const itemsQuery = query(itemRef, where('itemGroupId', '==', oldName));
      const itemsSnapshot = await getDocs(itemsQuery);

      itemsSnapshot.forEach(itemDoc => {
        batch.update(itemDoc.ref, { itemGroupId: newName, updatedAt: serverTimestamp() });
      });

      await batch.commit();
    },

    deleteItemGroupIfUnused: async (group: ItemGroup): Promise<void> => {
      const { id, name } = group;
      if (!id) throw new Error("Group ID is missing.");

      const itemsQuery = query(itemRef, where('itemGroupId', '==', name), where('isDeleted', '==', false));
      const countSnapshot = await getCountFromServer(itemsQuery);

      if (countSnapshot.data().count > 0) {
        throw new Error(`Cannot delete. This group is used by ${countSnapshot.data().count} item(s).`);
      }

      const groupDocRef = doc(itemGroupRef, id);
      await deleteDoc(groupDocRef);
    },

    // --- USERS ---

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
export const getItemsByCompany = async (companyId: string): Promise<Item[]> => {
  try {
    const itemsRef = collection(db, 'companies', companyId, 'items');
    
    // 2. QUERY: Only fetch items where isListed is true
    // Note: If you want to sort by name AND filter by isListed, you will need a Composite Index.
    // For now, this simple query works without a custom index.
    const q = query(itemsRef, where('isListed', '==', true));
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Item[];
  } catch (error) {
    console.error("Error fetching items:", error);
    throw new Error("Failed to fetch items for this catalogue.");
  }
};

export const getItemGroupsByCompany = async (companyId: string): Promise<ItemGroup[]> => {
  try {
    const groupsRef = collection(db, 'companies', companyId, 'itemGroups');
    const q = query(groupsRef); // Fetch all groups
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ItemGroup[];
  } catch (error) {
    console.error("Error fetching groups:", error);
    throw new Error("Failed to fetch categories.");
  }
};