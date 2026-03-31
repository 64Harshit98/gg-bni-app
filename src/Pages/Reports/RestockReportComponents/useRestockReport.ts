import { useEffect, useState } from 'react';
import { useAuth, useDatabase } from '../../../context/auth-context';
import { type ItemDoc } from './restockReport.utils';

const useRestockReport = () => {
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();           

  const [items, setItems] = useState<ItemDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.companyId || !dbOperations) {
      setLoading(false);
      return;
    }

    const fetchItems = async () => {
      setLoading(true);
      try {
        // Uses local cache + incremental sync — no full Firestore reads
        const allItems = await dbOperations.syncItems();

        const lowStockItems = (allItems as ItemDoc[])
          .filter(item => (item.stock ?? 0) <= item.restockQuantity)
          .sort((a, b) => {
            const aDeficit = (a.stock || 0) - a.restockQuantity;
            const bDeficit = (b.stock || 0) - b.restockQuantity;
            return aDeficit - bDeficit;
          });

        setItems(lowStockItems);
      } catch (err: any) {
        console.error(err);
        setError(`Failed to load restock report: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, [currentUser?.companyId, dbOperations]);

  return { items, loading, error };
};

export default useRestockReport;