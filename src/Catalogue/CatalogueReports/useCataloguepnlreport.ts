import { useCallback, useEffect, useMemo, useState } from 'react';
import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { useAuth, useDatabase } from '../../context/auth-context';
import { formatDateForInput, type SaleRecord } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import { createRangeCache } from '../../Pages/Reports/reportRangeCache';
import {
  loadCatalogueExpensesForRange,
  loadPosExpensesForRange,
} from '../../Pages/Reports/ExpenseReport/expenseRangeCache';
import { useCachedRange } from '../../Pages/Reports/useCachedRange';
import type { PnlBill } from '../../Pages/Reports/PNLReportComponents/pnlReport.utils';

/* ---------- CATALOGUE ORDERS: per-range cache ---------- */
// Same pattern as expenseRangeCache / salesReportCache: one cached read per
// date range instead of a live listener on the whole `Orders` collection.
// `Orders.createdAt` is a Firestore Timestamp (see old catalogue usePnlReport).

interface CatalogueOrderRecord {
  id: string;
  status: string;
  partyName: string;
  invoiceNumber: string;
  totalAmount: number;
  createdAt: number;
  items: Array<{ id?: string; quantity?: number; [key: string]: any }>;
}

const mapOrder = (snap: QueryDocumentSnapshot): CatalogueOrderRecord => {
  const data = snap.data();
  return {
    id: snap.id,
    status: data.status || '',
    partyName: data.partyName || 'N/A',
    invoiceNumber: data.invoiceNumber || 'N/A',
    totalAmount: Number(data.totalAmount) || 0,
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Number(data.createdAt) || 0,
    items: data.items || [],
  };
};

const catalogueOrderCache = createRangeCache<CatalogueOrderRecord>({
  name: 'catalogueOrdersRangeCache',
  collectionName: 'Orders',
  mapDoc: mapOrder,
  dateField: 'createdAt',
  toQueryValue: (ms: number) => Timestamp.fromMillis(ms),
  timeOf: (o) => o.createdAt,
});

export const loadCatalogueOrdersForRange = catalogueOrderCache.load;
// Call this wherever an order's status/items/amount is changed, same as clearExpenseRangeCache.
export const clearCatalogueOrdersRangeCache = (companyId: string | null | undefined) =>
  catalogueOrderCache.clear(companyId);

// Only these orders count as sales (filtered here, not in the query, so no composite index is needed).
const SALE_STATUSES = ['Completed', 'Paid'];

/* ---------- HOOK (same return shape as POS usePnlReport) ---------- */
export function useCataloguePnlReport() {
  const { currentUser, loading: authLoading } = useAuth();
  const companyId = currentUser?.companyId;
  const dbOperations = useDatabase();

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

  // Purchase prices come from the shared idb-backed items sync (cheap after first sync),
  // exactly like the old catalogue hook did.
  const [purchasePrices, setPurchasePrices] = useState<Map<string, number>>(new Map());
  const [itemsReady, setItemsReady] = useState(false);
  useEffect(() => {
    if (!companyId || !dbOperations) return;
    const unsubscribe = dbOperations.listenToItems((liveItems) => {
      const next = new Map<string, number>();
      liveItems.forEach((item) => {
        if (item.id) next.set(item.id, Number((item as any).purchasePrice) || 0);
      });
      setPurchasePrices(next);
      setItemsReady(true);
    });
    return unsubscribe;
  }, [companyId, dbOperations]);

  const ordersState = useCachedRange(loadCatalogueOrdersForRange, companyId, appliedFilters, authLoading);
  const posExpenses = useCachedRange(loadPosExpensesForRange, companyId, appliedFilters, authLoading);
  const catExpenses = useCachedRange(loadCatalogueExpensesForRange, companyId, appliedFilters, authLoading);

  // Orders -> SaleRecord, with each item's purchasePrice filled in so toPnlBill can work out cost.
  const sales = useMemo<SaleRecord[]>(
    () =>
      ordersState.records
        .filter((o) => SALE_STATUSES.includes(o.status))
        .map((o) => ({
          id: o.id,
          partyName: o.partyName,
          invoiceNumber: o.invoiceNumber,
          totalAmount: o.totalAmount,
          paymentMethods: {},
          createdAt: o.createdAt,
          items: o.items.map((item) => ({
            ...item,
            purchasePrice: item.id ? purchasePrices.get(item.id) || 0 : 0,
          })) as unknown as SaleRecord['items'],
        })),
    [ordersState.records, purchasePrices],
  );

  const expenses = useMemo(
    () => [...posExpenses.records, ...catExpenses.records],
    [posExpenses.records, catExpenses.records],
  );

  const parts = [ordersState, posExpenses, catExpenses];
  const updatedTimes = parts.map((p) => p.lastUpdated).filter((t): t is number => t !== null);

  const { refresh: refreshOrders } = ordersState;
  const { refresh: refreshPos } = posExpenses;
  const { refresh: refreshCat } = catExpenses;
  const refresh = useCallback(() => {
    refreshOrders();
    refreshPos();
    refreshCat();
  }, [refreshOrders, refreshPos, refreshCat]);

  // Don't show "everything has no cost" while the items map is still loading.
  const itemsPending = !!dbOperations && !itemsReady;

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
    sales,
    expenses,
    isLoading: parts.some((p) => p.isLoading) || itemsPending,
    isFetching: parts.some((p) => p.isFetching),
    lastUpdated: updatedTimes.length ? Math.min(...updatedTimes) : null,
    error: parts.map((p) => p.error).find(Boolean) ?? null,
    refresh,
  };
}