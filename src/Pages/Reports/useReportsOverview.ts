import { useMemo, useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import { Permissions } from '../../enums';
import { useCachedRange } from './useCachedRange';
import { loadStockTransfersForRange } from './stockTransferCache';
import { loadSalesForRange } from './SalesReportComponents/salesReportCache';
import { loadPurchasesForRange } from './PurchaseReportComponents/purchaseReportCache';
import {
  loadCatalogueExpensesForRange,
  loadPosExpensesForRange,
} from './ExpenseReport/expenseRangeCache';
import {
  loadCustomersCreatedForRange,
  loadOpeningBalancesForRange,
} from './CustomerReportComponents/customerReportCache';
import { buildCustomerRows } from './CustomerReportComponents/customerReport.utils';
import { toPnlBill } from './PNLReportComponents/pnlReport.utils';
import { buildRestockRows } from './RestockReportComponents/restockReport.utils';

// Headline numbers for the Reports hub (last 30 days). Everything is read
// through the same per-range caches the report pages use, so opening the hub
// warms them for the reports — and only data the user may see is loaded.
export function useReportsOverview() {
  const { currentUser, loading: authLoading, hasPermission } = useAuth();
  const companyId = currentUser?.companyId;
  const { items, itemsLoading } = useCatalogueData();

  const can = {
    sales: hasPermission(Permissions.ViewSalesReport),
    purchases: hasPermission(Permissions.ViewPurchaseReport),
    expenses: hasPermission(Permissions.ViewExpenseReport),
    pnl: hasPermission(Permissions.ViewPNLReport),
    customers: hasPermission(Permissions.ViewCustomerReport),
    partyLedger: hasPermission(Permissions.ViewPartyLedger),
    items: hasPermission(Permissions.ViewItemReport),
    stockTransfers: hasPermission(Permissions.ViewStockTransferReport),
  };

  // Fixed windows, computed once per visit so the cache keys stay stable.
  const [last30] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start: start.getTime(), end: end.getTime() };
  });
  const [thisMonth] = useState(() => {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start: start.getTime(), end: end.getTime() };
  });

  // A null range skips the load entirely.
  const when = (allowed: boolean, range: { start: number; end: number }) => (allowed ? range : null);
  const needSales = can.sales || can.pnl || can.customers || can.partyLedger;
  const needExpenses = can.expenses || can.pnl;
  const needParties = can.customers || can.partyLedger;

  const sales = useCachedRange(loadSalesForRange, companyId, when(needSales, last30), authLoading);
  const purchases = useCachedRange(loadPurchasesForRange, companyId, when(can.purchases, last30), authLoading);
  const posExpenses = useCachedRange(loadPosExpensesForRange, companyId, when(needExpenses, last30), authLoading);
  const catExpenses = useCachedRange(loadCatalogueExpensesForRange, companyId, when(needExpenses, last30), authLoading);
  const openingBalances = useCachedRange(loadOpeningBalancesForRange, companyId, when(needParties, last30), authLoading);
  const newCustomers = useCachedRange(loadCustomersCreatedForRange, companyId, when(needParties, last30), authLoading);
  const transfers = useCachedRange(loadStockTransfersForRange, companyId, when(can.stockTransfers, thisMonth), authLoading);

  const stats = useMemo(() => {
    const inLast30 = (t: number) => t >= last30.start && t <= last30.end;
    const salesList = sales.records.filter((s) => inLast30(s.createdAt));
    const purchaseList = purchases.records.filter((p) => inLast30(p.createdAt));
    const expenseList = [...posExpenses.records, ...catExpenses.records].filter((e) => inLast30(e.date));

    const salesTotal = salesList.reduce((s, b) => s + b.totalAmount, 0);
    const cost = salesList.map(toPnlBill).reduce((s, b) => s + b.cost, 0);
    const expenseTotal = expenseList.reduce((s, e) => s + e.amount, 0);
    const net = salesTotal - cost - expenseTotal;

    const customerRows = buildCustomerRows({
      sales: salesList,
      openingBalances: openingBalances.records.filter((ob) => inLast30(ob.createdAt)),
      newCustomers: newCustomers.records.filter((c) => inLast30(c.createdAt)),
      credits: [],
    });

    return {
      sales: { total: salesTotal, bills: salesList.length },
      purchases: {
        total: purchaseList.reduce((s, p) => s + p.totalAmount, 0),
        bills: purchaseList.length,
      },
      expenses: { total: expenseTotal, entries: expenseList.length },
      profit: { net, margin: salesTotal > 0 ? (net / salesTotal) * 100 : 0 },
      customers: customerRows.length,
      dueToYou: customerRows.reduce((s, r) => s + r.due, 0),
      items: items.length,
      toRestock: buildRestockRows(items, []).length,
      transfersThisMonth: transfers.records.filter(
        (t) => t.type === 'transfer' && t.createdAt >= thisMonth.start && t.createdAt <= thisMonth.end,
      ).length,
    };
  }, [
    sales.records,
    purchases.records,
    posExpenses.records,
    catExpenses.records,
    openingBalances.records,
    newCustomers.records,
    transfers.records,
    items,
    last30,
    thisMonth,
  ]);

  const ready = {
    sales: !sales.isLoading,
    purchases: !purchases.isLoading,
    expenses: !posExpenses.isLoading && !catExpenses.isLoading,
    profit: !sales.isLoading && !posExpenses.isLoading && !catExpenses.isLoading,
    parties: !sales.isLoading && !openingBalances.isLoading && !newCustomers.isLoading,
    items: !itemsLoading,
    transfers: !transfers.isLoading,
  };

  return { can, stats, ready };
}
