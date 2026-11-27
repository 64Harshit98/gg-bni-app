import { useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { useCachedRange } from '../../Pages/Reports/useCachedRange';
import { formatDateForInput } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import { loadCatalogueSalesForRange, type CatalogueSaleRecord } from './catalogueSalesCache';

const last30Days = () => {
  const start = new Date();
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export default function useCatalogueSalesReport() {
  const { currentUser, loading: authLoading } = useAuth();

  const [datePreset, setDatePreset] = useState<string>('last30');
  const [customStartDate, setCustomStartDate] = useState(() => formatDateForInput(last30Days().start));
  const [customEndDate, setCustomEndDate] = useState(() => formatDateForInput(last30Days().end));
  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(() => {
    const { start, end } = last30Days();
    return { start: start.getTime(), end: end.getTime() };
  });
  const [sortConfig, setSortConfig] = useState<{
    key: keyof CatalogueSaleRecord;
    direction: 'asc' | 'desc';
  }>({ key: 'createdAt', direction: 'desc' });

  const { records, isLoading, isFetching, lastUpdated, error, refresh } = useCachedRange(
    loadCatalogueSalesForRange,
    currentUser?.companyId,
    appliedFilters,
    authLoading,
  );

  return {
    sales: records,
    isLoading,
    isFetching,
    lastUpdated,
    refresh,
    error,
    authLoading,
    datePreset,
    setDatePreset,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    appliedFilters,
    setAppliedFilters,
    sortConfig,
    setSortConfig,
  };
}