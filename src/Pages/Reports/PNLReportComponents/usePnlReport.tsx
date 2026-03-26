import { useEffect, useState } from 'react';
import { collection, query, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import {
  type Transaction,
  type TransactionDetail,
} from './pnlReport.utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/auth-context';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';

export const usePnlReport = (companyId: string | undefined) => {
  const [sales, setSales] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    const salesRef = collection(db, 'companies', companyId, 'sales');
    const qSales = query(salesRef);

    const unsubscribe = onSnapshot(qSales, (snapshot) => {
      const processedSales: Transaction[] = snapshot.docs.map((doc) => {
        const data = doc.data();

        // Calculate directly from the bill's own item data
        const costOfGoodsSold = (data.items || []).reduce(
          (sum: number, billItem: any) => {
            const unitCost = Number(billItem.purchasePrice) || 0;
            return sum + (unitCost * (billItem.quantity || 0));
          },
          0
        );

        return {
          id: doc.id,
          totalAmount: data.totalAmount || 0,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(),
          invoiceNumber: data.invoiceNumber || 'N/A',
          partyName: data.partyName || 'Cash Sale',
          costOfGoodsSold: costOfGoodsSold,
          items: data.items || [],
        };
      });

      setSales(processedSales);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError("Failed to load sales.");
    });

    return () => unsubscribe();
  }, [companyId]);

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
