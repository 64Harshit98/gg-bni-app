import { useEffect, useState } from 'react';
import { useAuth } from '../../../context/auth-context';
import type { Item, ItemGroup } from '../../../constants/models';
import { State } from '../../../enums';
import {
  deleteAllItemsService,
  deleteItemService,
  deleteItemsByCategoryService,
  fetchItemReportData,
} from '../../../services/reports/itemReport.service';

export interface FeedbackModalState {
  isOpen: boolean;
  type: State;
  message: string;
}

export interface ItemSortConfig {
  key: keyof Item;
  direction: 'asc' | 'desc';
}

export default function useItemReport() {
  const { currentUser, loading: authLoading } = useAuth();
  const companyId = currentUser?.companyId;

  const [items, setItems] = useState<Item[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // State for the Generic Modal (Success/Error messages)
  const [feedbackModal, setFeedbackModal] = useState<FeedbackModalState>({
    isOpen: false,
    type: State.INFO,
    message: '',
  });

  // State for the Download Selection Modal
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  const [itemGroupId, setItemGroupId] = useState<string>('');
  const [appliedItemGroupId, setAppliedItemGroupId] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<ItemSortConfig>({ key: 'name', direction: 'asc' });
  const [isListVisible, setIsListVisible] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setIsLoading(authLoading);
      return;
    }
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        const { items: fetchedItems, itemGroups: fetchedGroups } = await fetchItemReportData(companyId);
        setItems(fetchedItems);
        setItemGroups(fetchedGroups);
      } catch (err) {
        console.error(err);
        setFeedbackModal({
          isOpen: true,
          type: State.ERROR,
          message: 'Failed to load item data from the server.',
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchAllData();
  }, [companyId, authLoading]);

  const deleteItemsByCategory = async (categoryId: string) => {
    if (!companyId) return;
    setIsLoading(true);
    try {
      await deleteItemsByCategoryService(companyId, categoryId, items);

      setItems((prevItems) => prevItems.filter((item) => item.itemGroupId !== categoryId));
      setItemGroups((prevGroups) => prevGroups.filter((group) => group.id !== categoryId));

      if (appliedItemGroupId === categoryId) setAppliedItemGroupId('');
      if (itemGroupId === categoryId) setItemGroupId('');

      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Category and its items deleted successfully.',
      });
    } catch (err) {
      console.error('Error deleting category:', err);
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
    if (!companyId) return;
    setIsLoading(true);
    try {
      await deleteAllItemsService(companyId, items, itemGroups);

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
      console.error('Error clearing inventory:', err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to delete inventory.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const deleteItem = async (itemId: string) => {
    if (!companyId) throw new Error('Firestore API not initialized');

    await deleteItemService(companyId, itemId);
    setItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
  };

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
