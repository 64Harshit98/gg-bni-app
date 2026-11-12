import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import {
  createRangeCache,
  toPlain,
  type RangeLoadResult,
} from '../../Pages/Reports/reportRangeCache';
import type { SaleRecord } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';

// Catalogue completed orders ("sales"), cached per date range — see reportRangeCache.ts.
// Orders use the POS SaleRecord shape so the POS report helpers work as-is.
export type CatalogueSaleRecord = SaleRecord;

const mapOrder = (snap: QueryDocumentSnapshot): CatalogueSaleRecord => {
  const data = snap.data();
  return {
    id: snap.id,
    partyName: data.userName || data.billingDetails?.name || 'N/A',
    partyNumber: '',
    invoiceNumber: data.orderId || snap.id, // the Order ID shown in the report
        totalAmount: Number(data.totalAmount) || 0,
    dueAmount: Math.max(0, (Number(data.totalAmount) || 0) - (Number(data.paidAmount) || 0)),
    status: data.status || '',
    paymentMethods: toPlain(data.paymentMethods || {}),
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
    items: toPlain(data.items || []),
  };
};

const ordersCache = createRangeCache<CatalogueSaleRecord>({
  name: 'catalogueOrdersReportCache',
  collectionName: 'Orders',
  mapDoc: mapOrder,
});

const isCountedOrder = (o: CatalogueSaleRecord) => o.status === 'Completed' || o.status === 'Paid';

// The cache keeps every order in the range; only Completed / Paid ones count as sales.
export const loadCatalogueSalesForRange = async (
  companyId: string,
  start: number,
  end: number,
  options?: { force?: boolean },
): Promise<RangeLoadResult<CatalogueSaleRecord>> => {
  const result = await ordersCache.load(companyId, start, end, options);
  return { ...result, records: result.records.filter(isCountedOrder) };
};

// Every order except "Upcoming", same set the Party ledger uses (for dues).
export const loadCatalogueOrdersForRange = async (
  companyId: string,
  start: number,
  end: number,
  options?: { force?: boolean },
): Promise<RangeLoadResult<CatalogueSaleRecord>> => {
  const result = await ordersCache.load(companyId, start, end, options);
  return { ...result, records: result.records.filter((o) => o.status !== 'Upcoming') };
};

export const clearCatalogueSalesCache = ordersCache.clear;