import { useEffect, useState } from 'react';
import { db } from '../../../lib/Firebase';
import { useAuth } from '../../../context/auth-context';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { type ItemDoc } from './restockReport.utils';

const STOCK_THRESHOLD = 3;

const useRestockReport = () => {
  const { currentUser } = useAuth();

  const [items, setItems] = useState<ItemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.companyId) {
      setLoading(false);
      return;
    }

    const fetchItems = async () => {
      setLoading(true);
      try {
        const itemsQuery = query(
          collection(db, 'companies', currentUser.companyId, 'items'),
          where('stock', '<=', STOCK_THRESHOLD),
        );

        const snapshot = await getDocs(itemsQuery);

        const fetchedItems = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            }) as ItemDoc,
        );

        fetchedItems.sort(
          (a, b) =>
            (a.stock || 0) -
            a.restockQuantity -
            ((b.stock || 0) - b.restockQuantity),
        );

        setItems(fetchedItems);
      } catch (err: any) {
        console.error(err);
        setError(`Failed to load restock report: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [currentUser?.companyId]);

  return {
    items,
    loading,
    error,
  };
};

export default useRestockReport;
