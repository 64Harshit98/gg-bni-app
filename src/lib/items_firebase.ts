// src/lib/firestore_operations.ts
import { db } from './firebase';
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
} from 'firebase/firestore';
import type { Item, ItemGroup } from '../constants/models';// --- ItemGroup CRUD Operations ---

const itemGroupCollectionRef = collection(db, 'itemGroups');

export const createItemGroup = async (
  itemGroup: Omit<ItemGroup, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  try {
    const docRef = await addDoc(itemGroupCollectionRef, {
      ...itemGroup,
      createdAt: Date.now(), // or serverTimestamp() for Firestore server timestamp
      updatedAt: Date.now(), // or serverTimestamp()
    });
    return docRef.id;
  } catch (e) {
    console.error('Error adding item group: ', e);
    throw e;
  }
};

export const getItemGroups = async (): Promise<ItemGroup[]> => {
  try {
    const q = query(itemGroupCollectionRef);
    const querySnapshot = await getDocs(q);
    const itemGroups: ItemGroup[] = [];
    querySnapshot.forEach((doc) => {
      itemGroups.push({ id: doc.id, ...(doc.data() as ItemGroup) });
    });
    return itemGroups;
  } catch (e) {
    console.error('Error getting item groups: ', e);
    throw e;
  }
};

export const getItemGroupById = async (id: string): Promise<ItemGroup | null> => {
    try {
        const docRef = doc(db, 'itemGroups', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...(docSnap.data() as ItemGroup) };
        } else {
            return null; // Document does not exist
        }
    } catch (e) {
        console.error('Error getting item group by ID: ', e);
        throw e;
    }
};


export const updateItemGroup = async (
  id: string,
  updates: Partial<Omit<ItemGroup, 'id' | 'createdAt'>>
): Promise<void> => {
  try {
    const itemGroupDoc = doc(db, 'itemGroups', id);
    await updateDoc(itemGroupDoc, {
      ...updates,
      updatedAt: Date.now(), // or serverTimestamp()
    });
  } catch (e) {
    console.error('Error updating item group: ', e);
    throw e;
  }
};

export const deleteItemGroup = async (id: string): Promise<void> => {
  try {
    const itemGroupDoc = doc(db, 'itemGroups', id);
    await deleteDoc(itemGroupDoc);
  } catch (e) {
    console.error('Error deleting item group: ', e);
    throw e;
  }
};

// --- Item CRUD Operations ---

const itemCollectionRef = collection(db, 'items');

export const createItem = async (
  item: Omit<Item, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  try {
    const docRef = await addDoc(itemCollectionRef, {
      ...item,
      createdAt: Date.now(), // or serverTimestamp()
      updatedAt: Date.now(), // or serverTimestamp()
    });
    return docRef.id;
  } catch (e) {
    console.error('Error adding item: ', e);
    throw e;
  }
};

export const getItems = async (): Promise<Item[]> => {
  try {
    const q = query(itemCollectionRef);
    const querySnapshot = await getDocs(q);
    const items: Item[] = [];
    querySnapshot.forEach((doc) => {
      items.push({ id: doc.id, ...(doc.data() as Item) });
    });
    return items;
  } catch (e) {
    console.error('Error getting items: ', e);
    throw e;
  }
};

export const getItemById = async (id: string): Promise<Item | null> => {
    try {
        const docRef = doc(db, 'items', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            return { id: docSnap.id, ...(docSnap.data() as Item) };
        } else {
            return null; // Document does not exist
        }
    } catch (e) {
        console.error('Error getting item by ID: ', e);
        throw e;
    }
};

export const getItemsByItemGroupId = async (itemGroupId: string): Promise<Item[]> => {
  try {
    const q = query(itemCollectionRef, where('itemGroupId', '==', itemGroupId));
    const querySnapshot = await getDocs(q);
    const items: Item[] = [];
    querySnapshot.forEach((doc) => {
      items.push({ id: doc.id, ...(doc.data() as Item) });
    });
    return items;
  } catch (e) {
    console.error('Error getting items by item group ID: ', e);
    throw e;
  }
};

export const updateItem = async (
  id: string,
  updates: Partial<Omit<Item, 'id' | 'createdAt'>>
): Promise<void> => {
  try {
    const itemDoc = doc(db, 'items', id);
    await updateDoc(itemDoc, {
      ...updates,
      updatedAt: Date.now(), // or serverTimestamp()
    });
  } catch (e) {
    console.error('Error updating item: ', e);
    throw e;
  }
};

export const deleteItem = async (id: string): Promise<void> => {
  try {
    const itemDoc = doc(db, 'items', id);
    await deleteDoc(itemDoc);
  } catch (e) {
    console.error('Error deleting item: ', e);
    throw e;
  }
};