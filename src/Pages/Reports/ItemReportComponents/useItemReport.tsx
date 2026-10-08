import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../../../context/auth-context';
import { useCatalogueData } from '../../../context/CatalogueDataContext';
import { getFirestoreOperations } from '../../../lib/ItemsFirebase';
import type { Item, ItemGroup } from '../../../constants/models';
import { State } from '../../../enums';

export default function useItemReport() {
  const { currentUser, loading: authLoading } = useAuth();

  const firestoreApi = useMemo(() => {
    if (currentUser?.companyId) {
      return getFirestoreOperations(currentUser.companyId);
    }
    return null;
  }, [currentUser?.companyId]);

  const { items: catalogueItems, itemsLoading: catalogueItemsLoading, itemGroups: catalogueItemGroups, itemGroupsLoading: catalogueGroupsLoading } = useCatalogueData();
  // Local mirrors (not direct context reads) — deleteItem/deleteItemsByCategory/
  // deleteAllItems below optimistically remove items/groups from these ahead
  // of the shared listener echoing the deletes back.
  const [items, setItems] = useState<Item[]>(catalogueItems);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>(catalogueItemGroups);
  useEffect(() => { setItems(catalogueItems); }, [catalogueItems]);
  useEffect(() => { setItemGroups(catalogueItemGroups); }, [catalogueItemGroups]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // State for the Generic Modal (Success/Error messages)
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean;
    type: State;
    message: string;
  }>({
    isOpen: false,
    type: State.INFO,
    message: '',
  });

  // State for the Download Selection Modal
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  const [itemGroupId, setItemGroupId] = useState<string>('');
  const [appliedItemGroupId, setAppliedItemGroupId] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{
    key: keyof Item;
    direction: 'asc' | 'desc';
  }>({ key: 'name', direction: 'asc' });
  const [isListVisible, setIsListVisible] = useState(false);

  // items/itemGroups now come from the shared CatalogueDataContext instead
  // of this hook fetching them itself (mirrored into local state above).
  useEffect(() => {
    setIsLoading(authLoading || catalogueItemsLoading || catalogueGroupsLoading);
  }, [authLoading, catalogueItemsLoading, catalogueGroupsLoading]);

  const deleteItemsByCategory = async (categoryId: string) => {
    if (!firestoreApi) return;
    setIsLoading(true);
    try {
      // 1. Find all items that belong to this category and delete them
      const itemsToDelete = items.filter(item => item.itemGroupId === categoryId);
      await Promise.all(
        itemsToDelete.map(item => {
          if (item.id) return firestoreApi.deleteItem(item.id);
          return Promise.resolve();
        })
      );

      // 2. Delete the Item Group (Category) itself
      // Note: Make sure 'deleteItemGroup' matches the method name in your ItemsFirebase.ts
      await firestoreApi.deleteItemGroup(categoryId);

      // 3. Update local state to remove items and the group
      setItems(prevItems => prevItems.filter(item => item.itemGroupId !== categoryId));
      setItemGroups(prevGroups => prevGroups.filter(group => group.id !== categoryId));

      // 4. Reset the dropdown selection since this category no longer exists
      if (appliedItemGroupId === categoryId) setAppliedItemGroupId('');
      if (itemGroupId === categoryId) setItemGroupId('');

      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Category and its items deleted successfully.',
      });
    } catch (err) {
      console.error("Error deleting category:", err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to delete category and items.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAllItems = async () => {
    if (!firestoreApi) return;
    setIsLoading(true);
    try {
      // 1. Delete all items from Firebase
      await Promise.all(
        items.map(item => {
          if (item.id) return firestoreApi.deleteItem(item.id);
          return Promise.resolve();
        })
      );

      // 2. Delete all Item Groups (Categories) from Firebase
      await Promise.all(
        itemGroups.map(group => {
          if (group.id) return firestoreApi.deleteItemGroup(group.id);
          return Promise.resolve();
        })
      );

      // 3. Clear all local state
      setItems([]);
      setItemGroups([]);
      setAppliedItemGroupId('');
      setItemGroupId('');

      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Entire inventory and all categories deleted successfully.',
      });
    } catch (err) {
      console.error("Error clearing inventory:", err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to delete inventory.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // --- NEW: Add the deleteItem function here ---
  const deleteItem = async (itemId: string) => {
    if (!firestoreApi) throw new Error("Firestore API not initialized");

    // 1. Delete from Firebase 
    // (Make sure 'deleteItem' matches the exact method name in your ItemsFirebase file)
    await firestoreApi.deleteItem(itemId);

    // 2. Update local state to remove the item from the list instantly
    setItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
  };
  // ---------------------------------------------

  return {
    items,
    appliedItemGroupId,
    sortConfig,
    setAppliedItemGroupId,
    setSortConfig,
    itemGroups,
    itemGroupId,
    setItemGroupId,
    setIsListVisible,
    isListVisible,
    setIsDownloadModalOpen,
    setFeedbackModal,
    isLoading,
    feedbackModal,
    isDownloadModalOpen,
    deleteItem,
    deleteItemsByCategory,
    deleteAllItems,
  };
}