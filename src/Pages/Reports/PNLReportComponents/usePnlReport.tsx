import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../../context/auth-context';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
import { loadSalesForRange } from '../SalesReportComponents/salesReportCache';
import {
  loadCatalogueExpensesForRange,
  loadPosExpensesForRange,
} from '../ExpenseReport/expenseRangeCache';
import { useCachedRange } from '../useCachedRange';
import type { PnlBill } from './pnlReport.utils';

// P&L reads the same per-range sales cache as the sales report (bills carry
// each item's purchasePrice), plus POS + catalogue expenses for the range.
// It used to keep a live listener on the whole `sales` collection.
export function usePnlReport() {
  const { currentUser, loading: authLoading } = useAuth();
  const companyId = currentUser?.companyId;

  const [datePreset, setDatePreset] = useState<string>('last30');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);
  const [isListVisible, setIsListVisible] = useState(true);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof PnlBill;
    direction: 'asc' | 'desc';
  }>({ key: 'createdAt', direction: 'desc' });

  useEffect(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    setStartDate(formatDateForInput(start));
    setEndDate(formatDateForInput(end));
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  }, []);

  const salesState = useCachedRange(loadSalesForRange, companyId, appliedFilters, authLoading);
  const posExpenses = useCachedRange(loadPosExpensesForRange, companyId, appliedFilters, authLoading);
  const catExpenses = useCachedRange(loadCatalogueExpensesForRange, companyId, appliedFilters, authLoading);

  const expenses = useMemo(
    () => [...posExpenses.records, ...catExpenses.records],
    [posExpenses.records, catExpenses.records],
  );

  const parts = [salesState, posExpenses, catExpenses];
  const updatedTimes = parts.map((p) => p.lastUpdated).filter((t): t is number => t !== null);

  const { refresh: refreshSales } = salesState;
  const { refresh: refreshPos } = posExpenses;
  const { refresh: refreshCat } = catExpenses;
  const refresh = useCallback(() => {
    refreshSales();
    refreshPos();
    refreshCat();
  }, [refreshSales, refreshPos, refreshCat]);

  return {
    authLoading,
    datePreset,
    setDatePreset,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    appliedFilters,
    setAppliedFilters,
    isListVisible,
    setIsListVisible,
    sortConfig,
    setSortConfig,
    sales: salesState.records,
    expenses,
    isLoading: parts.some((p) => p.isLoading),
    isFetching: parts.some((p) => p.isFetching),
    // The oldest part decides how fresh the page is.
    lastUpdated: updatedTimes.length ? Math.min(...updatedTimes) : null,
    error: parts.map((p) => p.error).find(Boolean) ?? null,
    refresh,
  };
}
