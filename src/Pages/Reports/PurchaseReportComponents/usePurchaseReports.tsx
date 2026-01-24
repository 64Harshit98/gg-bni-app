import { useState, useEffect } from 'react';
import { type PurchaseRecord } from './purchaseReports.utils';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
import { useAuth } from '../../../context/auth-context';
import { db } from '../../../lib/Firebase';
import {
  collection,
  query,
  where,
  getDocs,
  Timestamp,
} from 'firebase/firestore';

export default function usePurchaseReports() {
  const { currentUser, loading: authLoading } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
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
    key: keyof PurchaseRecord;
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
    if (!appliedFilters) {
      setIsLoading(false);
      setPurchases([]);
      return;
    }

    const companyId = currentUser.companyId;
    const start = new Date(appliedFilters.start);
    const end = new Date(appliedFilters.end);

    const fetchPurchases = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const q = query(
          collection(db, 'companies', companyId, 'purchases'),
          where('createdAt', '>=', Timestamp.fromDate(start)),
          where('createdAt', '<=', Timestamp.fromDate(end)),
        );
        const querySnapshot = await getDocs(q);
        const fetchedPurchases: PurchaseRecord[] = querySnapshot.docs.map(
          (doc) => {
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
          },
        );
        setPurchases(fetchedPurchases);
      } catch (err) {
        console.error('Error fetching purchases:', err);
        setError('Failed to load purchase report.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchPurchases();
  }, [currentUser, authLoading, appliedFilters]);

  return {
    isListVisible,
    setIsListVisible,
    sortConfig,
    setSortConfig,
    setCustomStartDate,
    setCustomEndDate,
    customStartDate,
    customEndDate,
    setAppliedFilters,
    appliedFilters,
    purchases,
    isLoading,
    authLoading,
    error,
    datePreset,
    setDatePreset,
  };
}
