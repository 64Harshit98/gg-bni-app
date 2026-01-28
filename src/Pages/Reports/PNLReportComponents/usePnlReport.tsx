import { useEffect, useState } from 'react';
import { collection, query, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import {
  type Transaction,
  type Item,
  type TransactionDetail,
} from './pnlReport.utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/auth-context';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';

export const usePnlReport = (companyId: string | undefined) => {
  const [sales, setSales] = useState<Transaction[]>([]);
  const [itemsMap, setItemsMap] = useState<Map<string, Item>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    const itemsCollectionRef = collection(db, 'companies', companyId, 'items');
    const qItems = query(itemsCollectionRef);

    const unsubscribeItems = onSnapshot(
      qItems,
      (snapshot) => {
        const newItemsMap = new Map<string, Item>();
        snapshot.docs.forEach((doc) => {
          newItemsMap.set(doc.id, {
            id: doc.id,
            purchasePrice: doc.data().purchasePrice || 0,
          });
        });
        setItemsMap(newItemsMap);
      },
      (_err) => setError('Failed to fetch item data.'),
    );

    const salesCollectionRef = collection(db, 'companies', companyId, 'sales');
    const qSales = query(salesCollectionRef);

    const unsubscribeSales = onSnapshot(
      qSales,
      (snapshot) => {
        if (itemsMap.size === 0 && snapshot.size > 0) return;

        setSales(
          snapshot.docs.map((doc) => {
            const saleData = doc.data();
            const costOfGoodsSold = (saleData.items || []).reduce(
              (sum: number, item: { id: string; quantity: number }) => {
                const itemDetails = itemsMap.get(item.id);
                const itemCost = itemDetails ? itemDetails.purchasePrice : 0;
                return sum + itemCost * (item.quantity || 0);
              },
              0,
            );

            return {
              id: doc.id,
              totalAmount: saleData.totalAmount || 0,
              createdAt:
                saleData.createdAt instanceof Timestamp
                  ? saleData.createdAt.toDate()
                  : new Date(),
              invoiceNumber: saleData.invoiceNumber || 'N/A',
              partyName: saleData.partyName || 'N/A',
              costOfGoodsSold: costOfGoodsSold,
              items: saleData.items || [],
            };
          }),
        );
        setLoading(false);
      },
      (_err) => setError('Failed to fetch sales data.'),
    );

    return () => {
      unsubscribeItems();
      unsubscribeSales();
    };
  }, [companyId, itemsMap]);

  return { sales, loading, error };
};

export function usePnlStates() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const [datePreset, setDatePreset] = useState<string>('today');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState({ start: '', end: '' });
  const [isListVisible, setIsListVisible] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof TransactionDetail;
    direction: 'asc' | 'desc';
  }>({ key: 'createdAt', direction: 'desc' });

  useEffect(() => {
    const today = new Date();
    const formattedToday = formatDateForInput(today);
    setStartDate(formattedToday);
    setEndDate(formattedToday);
    const startTimestamp = new Date(formattedToday);
    startTimestamp.setHours(0, 0, 0, 0);
    const endTimestamp = new Date(formattedToday);
    endTimestamp.setHours(23, 59, 59, 999);
    setAppliedFilters({
      start: startTimestamp.toISOString(),
      end: endTimestamp.toISOString(),
    });
  }, []);

  return {
    navigate,
    currentUser,
    authLoading,
    datePreset,
    setDatePreset,
    startDate,
    endDate,
    appliedFilters,
    setAppliedFilters,
    isListVisible,
    setIsListVisible,
    sortConfig,
    setSortConfig,
    setStartDate,
    setEndDate,
  };
}
