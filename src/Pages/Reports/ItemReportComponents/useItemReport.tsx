import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../../../context/auth-context';
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

  const [items, setItems] = useState<Item[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
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

  useEffect(() => {
    if (!firestoreApi) {
      setIsLoading(authLoading);
      return;
    }
    const fetchAllData = async () => {
      setIsLoading(true);
      try {
        const [fetchedItems, fetchedGroups] = await Promise.all([
          firestoreApi.syncItems(),
          firestoreApi.getItemGroups(),
        ]);
        setItems(fetchedItems);
        setItemGroups(fetchedGroups);
      } catch (err) {
        console.error(err);
        // Use Generic Modal for Error
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
  }, [firestoreApi, authLoading]);

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
  };
}
