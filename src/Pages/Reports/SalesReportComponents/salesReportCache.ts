import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { createRangeCache, toPlain } from '../reportRangeCache';
import type { SaleRecord } from './salesReport.utils';
import type { BillSeriesMode } from '../../../lib/billSeries';

// Sales report data, cached per date range — see reportRangeCache.ts.

const mapSale = (snap: QueryDocumentSnapshot): SaleRecord => {
  const data = snap.data();
  return {
    id: snap.id,
    partyName: data.partyName || 'N/A',
    partyNumber: data.partyNumber || '',
    invoiceNumber: data.invoiceNumber || 'N/A',
    totalAmount: data.totalAmount || 0,
        paymentMethods: data.paymentMethods || {},
    dueAmount: Number(data.dueAmount) || 0,
    salesmanId: data.salesmanId || '',
    salesmanName: data.salesmanName || '',
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
    items: toPlain(data.items || []),
    isExemptBill: Boolean(data.isExemptBill),
  };
};

const salesCache = createRangeCache<SaleRecord>({
  name: 'salesReportCache',
  collectionName: 'sales',
  mapDoc: mapSale,
});

const exemptSalesCache = createRangeCache<SaleRecord>({
  name: 'exemptSalesReportCache',
  collectionName: 'exemptSales',
  mapDoc: (snap) => ({ ...mapSale(snap), isExemptBill: true }),
});

export const loadSalesForRange = salesCache.load;
export const clearSalesReportCache = salesCache.clear;
export const loadExemptSalesForRange = exemptSalesCache.load;
export const clearExemptSalesReportCache = exemptSalesCache.clear;

// Regular + K bills together (the K button's third state). Each series keeps
// its own cache; this only merges the two lists, newest first.
export const loadAllSalesForRange: typeof salesCache.load = async (companyId, start, end, options) => {
  const [regular, exempt] = await Promise.all([
    salesCache.load(companyId, start, end, options),
    exemptSalesCache.load(companyId, start, end, options),
  ]);
  return {
    records: [...regular.records, ...exempt.records].sort((a, b) => b.createdAt - a.createdAt),
    fetchedAt: Math.min(regular.fetchedAt, exempt.fetchedAt),
    fromCache: regular.fromCache && exempt.fromCache,
  };
};

// Stable loader per series — useCachedRange re-fetches when the loader changes.
export const salesLoaderFor = (mode: BillSeriesMode) =>
  mode === 'exempt' ? loadExemptSalesForRange : mode === 'all' ? loadAllSalesForRange : loadSalesForRange;
