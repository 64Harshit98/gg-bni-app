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
  getCountFromServer,
  onSnapshot
} from 'firebase/firestore';
import { get, set } from 'idb-keyval';
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

  const STORE_KEY = `pos_items_${companyId}`;
  const TIME_KEY = `pos_sync_time_${companyId}`;

  return {
    listenToItems: (onData: (items: Item[]) => void) => {
      let unsubscribe = () => { };

      (async () => {
        try {
          const localItems: Item[] = (await get(STORE_KEY)) || [];
          onData(localItems.filter(i => !i.isDeleted));
        } catch (e) {
          console.error("Error loading initial cache", e);
        }

        const lastSyncTime = await get(TIME_KEY);
        let q;
        if (lastSyncTime) {
          console.log(`[Listener] Listening for updates since: ${lastSyncTime}`);
          const lastDate = new Date(lastSyncTime);
          q = query(itemRef, where('updatedAt', '>', lastDate));
        } else {
          console.log(`[Listener] First time sync. Listening to full collection.`);
          q = query(itemRef);
        }

        unsubscribe = onSnapshot(q, async (snapshot) => {
          if (snapshot.empty) return;

          const currentLocal: Item[] = (await get(STORE_KEY)) || [];
          const itemMap = new Map(currentLocal.map(i => [i.id, i]));

          snapshot.docs.forEach(doc => {
            const newItem = { id: doc.id, ...(doc.data() as Item) };
            if (newItem.isDeleted) {
              itemMap.delete(newItem.id);
            } else {
              itemMap.set(newItem.id, newItem);
            }
          });

          const mergedItems = Array.from(itemMap.values());

          await set(STORE_KEY, mergedItems);
          await set(TIME_KEY, new Date().toISOString());

          console.log(`[Listener] Synced ${snapshot.size} changes. Total items: ${mergedItems.length}`);

          onData(mergedItems.filter(i => !i.isDeleted));
        }, (error) => {
          console.error("Live Sync Error:", error);
        });
      })();

      return () => unsubscribe();
    },


    syncItems: async (): Promise<Item[]> => {
      let localItems: Item[] = (await get(STORE_KEY)) || [];
      const lastSyncTime = await get(TIME_KEY);

      let q;
      if (lastSyncTime) {
        const lastDate = new Date(lastSyncTime);
        q = query(itemRef, where('updatedAt', '>', lastDate));
      } else {
        q = query(itemRef);
      }

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return localItems.filter(i => !i.isDeleted);
      }

      const fetchedItems = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as Item) }));
      const itemMap = new Map(localItems.map(i => [i.id, i]));

      fetchedItems.forEach(newItem => {
        if (newItem.isDeleted) {
          itemMap.delete(newItem.id);
        } else {
          itemMap.set(newItem.id, newItem);
        }
      });

      const mergedItems = Array.from(itemMap.values());

      await set(STORE_KEY, mergedItems);
      await set(TIME_KEY, new Date().toISOString());

      return mergedItems.filter(i => !i.isDeleted);
    },


    createItem: async (
      item: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'companyId'>,
      customId?: string
    ): Promise<string> => {
      const payload = {
        ...item,
        companyId,
        isDeleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
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
        updatedAt: serverTimestamp()
      });
    },

    deleteItem: async (id: string): Promise<void> => {
      const docRef = doc(itemRef, id);
      await updateDoc(docRef, {
        isDeleted: true,
        updatedAt: serverTimestamp()
      });
    },


    getItemByBarcode: async (barcode: string): Promise<Item | null> => {
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
        return { name: "", address: "", phoneNumber: "", email: "", gstin: "" };
      }
    },


    getDistinctItemGroupsFromItems: async (): Promise<ItemGroup[]> => {
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
    const q = query(itemsRef, where('isListed', '==', true), where('isDeleted', '==', false));
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
    const q = query(groupsRef);
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
