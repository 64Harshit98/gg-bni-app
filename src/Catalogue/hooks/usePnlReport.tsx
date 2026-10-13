import { useEffect, useRef, useState } from 'react';
import { collection, query, onSnapshot, Timestamp, where } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import {
  type Transaction,
  type Item,
  type TransactionDetail,
} from '../../Pages/Reports/PNLReportComponents/pnlReport.utils';
import { useNavigate } from 'react-router-dom';
import { useAuth, useDatabase } from '../../context/auth-context';
import { formatDateForInput } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';

export const usePnlReport = (companyId: string | undefined) => {
  const [sales, setSales] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Held in a ref (not state) so the sales listener can read the latest
  // items map without being re-triggered by it — using it as reactive
  // state here previously caused this effect to tear down and
  // re-subscribe to the full items/Orders collections on every snapshot,
  // an infinite resubscribe loop.
  const itemsMapRef = useRef<Map<string, Item>>(new Map());
  const recomputeSalesRef = useRef<(() => void) | null>(null);
  const dbOperations = useDatabase();

  useEffect(() => {
    if (!companyId || !dbOperations) {
      setLoading(false);
      return;
    }

    let latestOrderDocs: any[] = [];

    const recomputeSales = () => {
      const itemsMap = itemsMapRef.current;
      const completedDocs = latestOrderDocs.filter((doc) => {
        const data = doc.data();
        return data.status === 'Completed' || data.status === 'Paid';
      });

      if (itemsMap.size === 0 && completedDocs.length > 0) return;

      setSales(
        completedDocs.map((doc) => {
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
    };
    recomputeSalesRef.current = recomputeSales;

    // Rides on the shared idb-keyval-backed items sync (dbOperations.listenToItems,
    // see ItemsFirebase.ts) instead of a raw full `items` collection listener —
    // after the first sync it only re-reads docs changed since last sync.
    const unsubscribeItems = dbOperations.listenToItems((liveItems) => {
      const newItemsMap = new Map<string, Item>();
      liveItems.forEach((item) => {
        if (!item.id) return;
        newItemsMap.set(item.id, {
          id: item.id,
          purchasePrice: (item as any).purchasePrice || 0,
        });
      });
      itemsMapRef.current = newItemsMap;
      recomputeSalesRef.current?.();
    });

    // Only Completed/Paid orders are ever used by this report, so filter
    // server-side instead of downloading every order regardless of status.
    const salesCollectionRef = collection(db, 'companies', companyId, 'Orders');
    const qSales = query(salesCollectionRef, where('status', 'in', ['Completed', 'Paid']));

    const unsubscribeSales = onSnapshot(
      qSales,
      (snapshot) => {
        latestOrderDocs = snapshot.docs;
        recomputeSales();
      },
      (_err) => setError('Failed to fetch sales data.'),
    );

    return () => {
      unsubscribeItems();
      unsubscribeSales();
    };
  }, [companyId, dbOperations]);

  return { sales, loading, error };
};

export function usePnlStates() {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const [datePreset, setDatePreset] = useState<string>('last30');
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
