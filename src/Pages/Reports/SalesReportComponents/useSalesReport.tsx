import { useState, useEffect } from 'react';
import { useAuth } from '../../../context/auth-context';
import { formatDateForInput, type SaleRecord } from './salesReport.utils';
import { loadSalesForRange } from './salesReportCache';
import { useCachedRange } from '../useCachedRange';

export default function useSalesReport() {
  const { currentUser, loading: authLoading } = useAuth();

  const [datePreset, setDatePreset] = useState<string>('last30');
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
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const startDateStr = formatDateForInput(thirtyDaysAgo);
    const endDateStr = formatDateForInput(today);
    setCustomStartDate(startDateStr);
    setCustomEndDate(endDateStr);
    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  }, []);

  const {
    records: sales,
    isLoading,
    isFetching,
    lastUpdated,
    error,
    refresh,
  } = useCachedRange(loadSalesForRange, currentUser?.companyId, appliedFilters, authLoading);

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
    isFetching,
    lastUpdated,
    refresh,
    error,
    datePreset,
    isListVisible,
    setIsListVisible,
    authLoading,
  };
}
