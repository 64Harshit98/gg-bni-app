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
import { get, set, update } from 'idb-keyval';
import type { Item, ItemGroup } from '../constants/models';
import { Role, type User } from '../Role/permission';

// A Firestore Timestamp in memory, a plain { seconds } once it has been through IndexedDB
const toMillis = (value: any): number => value?.toMillis?.() ?? (value?.seconds ?? 0) * 1000;

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
  const DELETED_TIME_KEY = `pos_deleted_sync_time_${companyId}`;

  // Tombstones newer than the last one applied. With none applied yet this reads
  // them all once, which also clears items an earlier delete left in the cache.
  const tombstonesQuery = (lastDeletedTime?: string) => {
    const deletedRef = collection(companyRef, 'deletedItems');
    return lastDeletedTime ? query(deletedRef, where('deletedAt', '>', new Date(lastDeletedTime))) : query(deletedRef);
  };

  // Merges into the cache as one IndexedDB transaction, so the items listener,
  // the tombstone listener and syncItems can't overwrite each other's changes.
  const mergeIntoCache = async (docs: { id: string; data: () => unknown }[]): Promise<Item[]> => {
    let mergedItems: Item[] = [];
    await update<Item[]>(STORE_KEY, (cached = []) => {
      const itemMap = new Map(cached.map(i => [i.id, i]));
      docs.forEach(doc => {
        const newItem = { id: doc.id, ...(doc.data() as Item) };
        if (newItem.isDeleted) {
          itemMap.delete(newItem.id);
        } else {
          itemMap.set(newItem.id, newItem);
        }
      });
      mergedItems = Array.from(itemMap.values());
      return mergedItems;
    });
    return mergedItems;
  };

  // Removes tombstoned items from the cache. Barcodes are item ids, so an item
  // updated after its tombstone was added back under the same id and stays.
  const applyTombstones = async (tombstones: { id: string; data: () => any }[]) => {
    // deletedAt is null on this device until the server confirms the delete
    const deletedAtById = new Map(tombstones.map(t => [t.id, toMillis(t.data().deletedAt) || Infinity]));
    let remaining: Item[] = [];
    let removed = false;
    await update<Item[]>(STORE_KEY, (cached = []) => {
      remaining = cached.filter(item => {
        const deletedAt = deletedAtById.get(item.id!);
        return deletedAt === undefined || toMillis(item.updatedAt) > deletedAt;
      });
      removed = remaining.length !== cached.length;
      return remaining;
    });

    const newest = Math.max(0, ...tombstones.map(t => toMillis(t.data().deletedAt)));
    if (newest) await set(DELETED_TIME_KEY, new Date(newest).toISOString());
    return { remaining, removed };
  };

  return {
    listenToItems: (onData: (items: Item[]) => void) => {
      let cancelled = false;
      let unsubscribeItems = () => { };
      let unsubscribeDeletes = () => { };

      (async () => {
        try {
          const localItems: Item[] = (await get(STORE_KEY)) || [];
          onData(localItems.filter(i => !i.isDeleted));
        } catch (e) {
          console.error("Error loading initial cache", e);
        }

        const lastSyncTime = await get(TIME_KEY);
        const lastDeletedTime = await get(DELETED_TIME_KEY);
        if (cancelled) return;

        let q;
        if (lastSyncTime) {
          console.log(`[Listener] Listening for updates since: ${lastSyncTime}`);
          const lastDate = new Date(lastSyncTime);
          q = query(itemRef, where('updatedAt', '>', lastDate));
        } else {
          console.log(`[Listener] First time sync. Listening to full collection.`);
          q = query(itemRef);
        }

        unsubscribeItems = onSnapshot(q, async (snapshot) => {
          if (snapshot.empty) return;

          const mergedItems = await mergeIntoCache(snapshot.docs);
          await set(TIME_KEY, new Date().toISOString());

          console.log(`[Listener] Synced ${snapshot.size} changes. Total items: ${mergedItems.length}`);

          onData(mergedItems.filter(i => !i.isDeleted));
        }, (error) => {
          console.error("Live Sync Error:", error);
        });

        // A hard-deleted item never shows up in the updatedAt query above,
        // so deletes only reach the cache through their tombstones.
        unsubscribeDeletes = onSnapshot(tombstonesQuery(lastDeletedTime), async (snapshot) => {
          if (snapshot.empty) return;

          const { remaining, removed } = await applyTombstones(snapshot.docs);
          if (removed) onData(remaining.filter(i => !i.isDeleted));
        }, (error) => {
          console.error("Live Delete Sync Error:", error);
        });
      })();

      return () => {
        cancelled = true;
        unsubscribeItems();
        unsubscribeDeletes();
      };
    },


    syncItems: async (): Promise<Item[]> => {
      const lastSyncTime = await get(TIME_KEY);
      const lastDeletedTime = await get(DELETED_TIME_KEY);

      // Fetch new/updated items
      const itemsQuery = lastSyncTime
        ? query(itemRef, where('updatedAt', '>', new Date(lastSyncTime)))
        : query(itemRef);
      const itemsSnapshot = await getDocs(itemsQuery);

      // Fetch tombstones for anything deleted since the last one applied
      const deletedSnapshot = await getDocs(tombstonesQuery(lastDeletedTime));

      await mergeIntoCache(itemsSnapshot.docs);
      const { remaining } = await applyTombstones(deletedSnapshot.docs);
      await set(TIME_KEY, new Date().toISOString());

      return remaining;
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
      const tombstoneRef = doc(collection(companyRef, 'deletedItems'), id);

      const batch = writeBatch(db);

      // 1. Hard delete the actual item
      batch.delete(docRef);

      // 2. Log the deletion time so offline devices can catch up
      batch.set(tombstoneRef, { deletedAt: serverTimestamp() });

      await batch.commit();

      // 3. Drop it from this device's cache now, without waiting on the listener
      await update<Item[]>(STORE_KEY, (cached = []) => cached.filter(item => item.id !== id));
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
        const addressParts = [data.streetAddress, data.city, data.state, data.postalCode].filter(Boolean).join(' ');
        const finalAddress = addressParts || data.address || "Address not available";

        return {
          name: (data.businessName as string) || "Company Name",
          address: finalAddress,
          state: (data.state as string) || "",
          phoneNumber: (data.phoneNumber as string) || "",
          accountHolderName: (data.accountHolderName as string) || "",
          accountNumber: (data.accountNumber as string) || "",
          ifscCode: (data.ifscCode as string) || "",
          bankName: (data.bankName as string) || "",
          email: (data.email as string) || "",
          gstin: (data.gstin as string) || "",
          msmeNumber: (data.msmeUdyamNumber as string) || "",
          panNumber: (data.panNumber as string) || "",
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
