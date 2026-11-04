import { useState, useEffect } from 'react';
import {
  formatDateForInput,
  type PurchaseRecord,
} from './purchaseReports.utils';
import { useAuth } from '../../../context/auth-context';
import { loadPurchasesForRange } from './purchaseReportCache';
import { useCachedRange } from '../useCachedRange';

export default function usePurchaseReports() {
  const { currentUser, loading: authLoading } = useAuth();

  const [datePreset, setDatePreset] = useState<string>('last30');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [isListVisible, setIsListVisible] = useState(true);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof PurchaseRecord;
    direction: 'asc' | 'desc';
  }>({ key: 'createdAt', direction: 'desc' });

  useEffect(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    setCustomStartDate(formatDateForInput(start));
    setCustomEndDate(formatDateForInput(end));
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  }, []);

  const {
    records: purchases,
    isLoading,
    isFetching,
    lastUpdated,
    error,
    refresh,
  } = useCachedRange(loadPurchasesForRange, currentUser?.companyId, appliedFilters, authLoading);

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
    isFetching,
    lastUpdated,
    refresh,
    authLoading,
    error,
    datePreset,
    setDatePreset,
  };
}
