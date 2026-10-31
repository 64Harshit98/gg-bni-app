import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../../context/auth-context';
import { formatDateForInput, getPresetRange } from '../SalesReportComponents/salesReport.utils';
import { loadSalesForRange } from '../SalesReportComponents/salesReportCache';
import { useCachedRange } from '../useCachedRange';
import {
  loadCustomerCredits,
  loadCustomersCreatedForRange,
  loadOpeningBalancesForRange,
} from './customerReportCache';

// Sales come from the shared per-range sales cache; opening balances and newly
// added customers are cached per range too. This report used to keep live
// listeners on sales (5,000 docs), openingBalances (5,000) and every customer.
export default function useCustomerReport() {
  const { currentUser, loading: authLoading } = useAuth();
  const companyId = currentUser?.companyId;

  const [datePreset, setDatePreset] = useState('fy');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
  // Default: current financial year (1 Apr → today)
  const range = getPresetRange('fy')!;

  setStartDate(formatDateForInput(range.start));
  setEndDate(formatDateForInput(range.end));
  setAppliedFilters({ start: range.start.getTime(), end: range.end.getTime() });
}, []);

  const salesState = useCachedRange(loadSalesForRange, companyId, appliedFilters, authLoading);
  const obState = useCachedRange(loadOpeningBalancesForRange, companyId, appliedFilters, authLoading);
  const newCustomersState = useCachedRange(loadCustomersCreatedForRange, companyId, appliedFilters, authLoading);

  // Credit balances aren't date based: read once per visit / refresh.
  const [credits, setCredits] = useState<Awaited<ReturnType<typeof loadCustomerCredits>>>([]);
  const [creditsToken, setCreditsToken] = useState(0);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    loadCustomerCredits(companyId)
      .then((list) => { if (!cancelled) setCredits(list); })
      .catch((err) => console.error('Failed to load customer credits', err));
    return () => { cancelled = true; };
  }, [companyId, creditsToken]);

  const parts = [salesState, obState, newCustomersState];
  const updatedTimes = parts.map((p) => p.lastUpdated).filter((t): t is number => t !== null);

  const { refresh: refreshSales } = salesState;
  const { refresh: refreshOb } = obState;
  const { refresh: refreshNew } = newCustomersState;
  const refresh = useCallback(() => {
    refreshSales();
    refreshOb();
    refreshNew();
    setCreditsToken((t) => t + 1);
  }, [refreshSales, refreshOb, refreshNew]);

  return {
    currentUser,
    authLoading,
    datePreset,
    setDatePreset,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    appliedFilters,
    setAppliedFilters,
    sales: salesState.records,
    openingBalances: obState.records,
    newCustomers: newCustomersState.records,
    credits,
    isLoading: parts.some((p) => p.isLoading),
    isFetching: parts.some((p) => p.isFetching),
    // The oldest part decides how fresh the page is.
    lastUpdated: updatedTimes.length ? Math.min(...updatedTimes) : null,
    error: parts.map((p) => p.error).find(Boolean) ?? null,
    refresh,
  };
}
