import { Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { createRangeCache, toPlain } from '../reportRangeCache';
import type { PurchaseRecord } from './purchaseReports.utils';

// Purchase report data, cached per date range — see reportRangeCache.ts.

const mapPurchase = (snap: QueryDocumentSnapshot): PurchaseRecord => {
  const data = snap.data();
  return {
    id: snap.id,
    partyName: data.partyName || '',
    partyNumber: data.partyNumber || '',
    invoiceNumber: data.invoiceNumber || '',
    supplierBillNumber: data.supplierBillNumber || '',
    totalAmount: data.totalAmount || 0,
    taxAmount: Number(data.taxAmount) || 0,
    dueAmount: Number(data.paymentMethods?.due ?? data.dueAmount ?? 0) || 0,
    paymentMethods: toPlain(data.paymentMethods || {}),
    createdAt:
      data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
    items: toPlain(data.items || []),
  };
};

const purchaseCache = createRangeCache<PurchaseRecord>({
  name: 'purchaseReportCache',
  collectionName: 'purchases',
  mapDoc: mapPurchase,
});

export const loadPurchasesForRange = purchaseCache.load;
export const clearPurchaseReportCache = purchaseCache.clear;
