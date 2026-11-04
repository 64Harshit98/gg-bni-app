import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { createRangeCache, toPlain } from '../reportRangeCache';
import type { SaleRecord } from './salesReport.utils';

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
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
    items: toPlain(data.items || []),
  };
};

const salesCache = createRangeCache<SaleRecord>({
  name: 'salesReportCache',
  collectionName: 'sales',
  mapDoc: mapSale,
});

export const loadSalesForRange = salesCache.load;
export const clearSalesReportCache = salesCache.clear;
