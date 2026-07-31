import { useEffect, useState } from 'react';
import {
  type Transaction,
  type TransactionDetail,
} from './pnlReport.utils';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/auth-context';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
import { subscribeToPnlSales } from '../../../services/reports/pnlReport.service';

export const usePnlReport = (companyId: string | undefined) => {
  const [sales, setSales] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const unsubscribe = subscribeToPnlSales(
      companyId,
      (processedSales) => {
        setSales(processedSales);
        setLoading(false);
      },
      () => {
        setError('Failed to load sales.');
        setLoading(false);
      },
    );

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
