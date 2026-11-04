import { useMemo, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import { useCachedRange } from '../../Pages/Reports/useCachedRange';
import { loadCatalogueSalesForRange, loadCatalogueOrdersForRange } from './catalogueSalesCache';
import {
  loadCatalogueExpensesForRange,
  loadPosExpensesForRange,
} from '../../Pages/Reports/ExpenseReport/expenseRangeCache';
import { useStockTransfers } from '../../Pages/hooks/useStockTransfer';
import { toPnlBill } from '../../Pages/Reports/PNLReportComponents/pnlReport.utils';
import { loadOpeningBalancesForRange } from '../../Pages/Reports/CustomerReportComponents/customerReportCache';

// Headline numbers for the Catalogue Reports hub (last 30 days). Reads go
// through the same range caches as the report pages, so the hub warms them.
export function useCatalogueReportsOverview() {
  const { currentUser, loading: authLoading } = useAuth();
  const companyId = currentUser?.companyId;
  const { items, itemsLoading } = useCatalogueData();

  // Fixed window, computed once per visit so the cache key stays stable.
  const [last30] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start: start.getTime(), end: end.getTime() };
  });

  const sales = useCachedRange(loadCatalogueSalesForRange, companyId, last30, authLoading);
  const allOrders = useCachedRange(loadCatalogueOrdersForRange, companyId, last30, authLoading);
  // Stock transfers: "this month", fixed once per visit so the cache key stays stable.
  const [thisMonth] = useState(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start: start.getTime(), end: end.getTime() };
  });
  const stockTransfers = useStockTransfers(companyId, thisMonth);
  const catExpenses = useCachedRange(loadCatalogueExpensesForRange, companyId, last30, authLoading);
  const posExpenses = useCachedRange(loadPosExpensesForRange, companyId, last30, authLoading);
  const openingBalances = useCachedRange(loadOpeningBalancesForRange, companyId, last30, authLoading);

  console.log('hub sales', sales.records);
  const stats = useMemo(() => {
    const inLast30 = (t: number) => t >= last30.start && t <= last30.end;
    const salesList = sales.records.filter((s) => inLast30(s.createdAt));
    const expenseList = [...catExpenses.records, ...posExpenses.records].filter((e) => inLast30(e.date));

    const salesTotal = salesList.reduce((s, b) => s + b.totalAmount, 0);
    const cost = salesList.map(toPnlBill).reduce((s, b) => s + b.cost, 0);
    const expenseTotal = expenseList.reduce((s, e) => s + e.amount, 0);
    const net = salesTotal - cost - expenseTotal;

    return {
      sales: { total: salesTotal, bills: salesList.length },
      customers: new Set(
        allOrders.records
          .filter((o) => inLast30(o.createdAt))
          .map((o) => o.partyName?.trim().toLowerCase())
          .filter((n) => n && n !== 'n/a'),
      ).size,
      expenses: { total: expenseTotal, entries: expenseList.length },
      profit: { net, margin: salesTotal > 0 ? (net / salesTotal) * 100 : 0 },
      dueToYou:
        allOrders.records
          .filter((o) => inLast30(o.createdAt))
          .reduce((s, o) => s + Math.max(0, o.dueAmount ?? 0), 0) +
        openingBalances.records
          .filter((ob) => inLast30(ob.createdAt) && ob.balanceType !== 'advance')
          .reduce((s, ob) => s + Math.max(0, ob.dueAmount ?? ob.amount ?? 0), 0),
      items: items.length,
      transfersThisMonth: stockTransfers.transfers.filter(
        (t) => t.type === 'transfer' && t.date >= thisMonth.start && t.date <= thisMonth.end,
      ).length,
    };
  }, [sales.records, allOrders.records, openingBalances.records, catExpenses.records, posExpenses.records, items, last30, stockTransfers.transfers, thisMonth]);

  const ready = {
    sales: !sales.isLoading,
    customers: !allOrders.isLoading,
    parties: !allOrders.isLoading && !openingBalances.isLoading,
    expenses: !catExpenses.isLoading && !posExpenses.isLoading,
    profit: !sales.isLoading && !catExpenses.isLoading && !posExpenses.isLoading,
    transfers: !stockTransfers.loading,
    items: !itemsLoading,
  };
  return { stats, ready };
}