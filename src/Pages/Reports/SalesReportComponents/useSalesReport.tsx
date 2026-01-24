import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/auth-context';
import {
  collection,
  query,
  getDocs,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { formatDateForInput, type SaleRecord } from './salesReport.utils';

export default function useSalesReport() {
  const { currentUser, loading: authLoading } = useAuth();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState<string>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [isListVisible, setIsListVisible] = useState(false);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof SaleRecord;
    direction: 'asc' | 'desc';
  }>({ key: 'createdAt', direction: 'desc' });

  useEffect(() => {
    const today = new Date();
    const startDateStr = formatDateForInput(today);
    const endDateStr = formatDateForInput(today);
    setCustomStartDate(startDateStr);
    setCustomEndDate(endDateStr);
    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser?.companyId) {
      setIsLoading(false);
      setError('Company information not found. Please log in again.');
      return;
    }

    const companyId = currentUser.companyId;

    const fetchSales = async () => {
      setIsLoading(true);
      try {
        const q = query(
          collection(db, 'companies', companyId, 'sales'),
          orderBy('createdAt', 'desc'),
        );

        const querySnapshot = await getDocs(q);
        const fetchedSales: SaleRecord[] = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            partyName: data.partyName || 'N/A',
            totalAmount: data.totalAmount || 0,
            paymentMethods: data.paymentMethods || {},
            createdAt:
              data.createdAt instanceof Timestamp
                ? data.createdAt.toMillis()
                : Date.now(),
            items: data.items || [],
          };
        });
        setSales(fetchedSales);
      } catch (err) {
        console.error('Error fetching sales:', err);
        setError('Failed to load sales report.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSales();
  }, [currentUser, authLoading]);
  return {
    setDatePreset,
    setCustomStartDate,
    setCustomEndDate,
    customStartDate,
    customEndDate,
    setAppliedFilters,
    sortConfig,
    setSortConfig,
    appliedFilters,
    sales,
    isLoading,
    error,
    datePreset,
    isListVisible,
    setIsListVisible,
    authLoading,
  };
}
