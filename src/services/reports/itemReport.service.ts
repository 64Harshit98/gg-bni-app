/**
 * Data-access layer for the Item Report page. Wraps the Firestore-backed
 * item/item-group operations (previously called directly from
 * `useItemReport.tsx` via `getFirestoreOperations`) behind small, typed
 * functions. Business logic (which items belong to a category, cascading
 * deletes) is preserved exactly as it was before extraction.
 */
import { getFirestoreOperations } from '../../lib/ItemsFirebase';
import type { Item, ItemGroup } from '../../constants/models';

export interface ItemReportData {
  items: Item[];
  itemGroups: ItemGroup[];
}

/** Fetches the full item list and item-group list for a company. */
export async function fetchItemReportData(companyId: string): Promise<ItemReportData> {
  try {
    const firestoreApi = getFirestoreOperations(companyId);
    const [items, itemGroups] = await Promise.all([
      firestoreApi.syncItems(),
      firestoreApi.getItemGroups(),
    ]);
    return { items, itemGroups };
  } catch (err) {
    console.error('itemReport.service: failed to fetch item report data', err);
    throw err;
  }
}

/** Deletes every item in `items` that belongs to `categoryId`, then deletes the category itself. */
export async function deleteItemsByCategoryService(
  companyId: string,
  categoryId: string,
  items: Item[],
): Promise<void> {
  try {
    const firestoreApi = getFirestoreOperations(companyId);
    const itemsToDelete = items.filter((item) => item.itemGroupId === categoryId);
    await Promise.all(
      itemsToDelete.map((item) => (item.id ? firestoreApi.deleteItem(item.id) : Promise.resolve())),
    );
    await firestoreApi.deleteItemGroup(categoryId);
  } catch (err) {
    console.error('itemReport.service: failed to delete category and its items', err);
    throw err;
  }
}

/** Deletes every item and every item group for a company (full inventory wipe). */
export async function deleteAllItemsService(
  companyId: string,
  items: Item[],
  itemGroups: ItemGroup[],
): Promise<void> {
  try {
    const firestoreApi = getFirestoreOperations(companyId);
    await Promise.all(
      items.map((item) => (item.id ? firestoreApi.deleteItem(item.id) : Promise.resolve())),
    );
    await Promise.all(
      itemGroups.map((group) => (group.id ? firestoreApi.deleteItemGroup(group.id) : Promise.resolve())),
    );
  } catch (err) {
    console.error('itemReport.service: failed to clear inventory', err);
    throw err;
  }
}

/** Deletes a single item by id. */
export async function deleteItemService(companyId: string, itemId: string): Promise<void> {
  const firestoreApi = getFirestoreOperations(companyId);
  await firestoreApi.deleteItem(itemId);
}
