import { createRangeCache } from './reportRangeCache';
import type { StockTransfer } from '../hooks/useStockTransfer';

// Stock transfer history, cached per date range — see reportRangeCache.ts.
// Docs store createdAt and date as epoch ms. Purchases write rows to the same
// collection (type 'purchase-in'), so callers filter on `type`.

// By createdAt — the Reports hub's "N this month" count.
const stockTransferCache = createRangeCache<{ id: string; type: string; createdAt: number }>({
  name: 'stockTransferRangeCache',
  collectionName: 'stockTransfers',
  mapDoc: (snap) => {
    const data = snap.data();
    return { id: snap.id, type: String(data.type || ''), createdAt: Number(data.createdAt) || 0 };
  },
  toQueryValue: (ms) => ms,
});

// By the transfer / purchase date — the Stock transfer report's history tab.
const stockTransferHistoryCache = createRangeCache<StockTransfer>({
  name: 'stockTransferHistoryCache',
  collectionName: 'stockTransfers',
  mapDoc: (snap) => {
    const data = snap.data();
    return {
      id: snap.id,
      itemId: String(data.itemId || ''),
      itemName: String(data.itemName || ''),
      unit: data.unit || '',
      quantity: Number(data.quantity) || 0,
      type: data.type === 'purchase-in' || data.type === 'adjustment' ? data.type : 'transfer',
      fromGodownId: data.fromGodownId || '',
      fromGodownName: data.fromGodownName || '',
      toGodownId: String(data.toGodownId || ''),
      toGodownName: String(data.toGodownName || ''),
      date: Number(data.date) || 0,
      remarks: data.remarks || '',
      refInvoice: data.refInvoice || '',
      createdAt: Number(data.createdAt) || 0,
    };
  },
  dateField: 'date',
  toQueryValue: (ms) => ms,
  timeOf: (t) => t.date,
});

export const loadStockTransfersForRange = stockTransferCache.load;
export const loadStockTransferHistoryForRange = stockTransferHistoryCache.load;

export const clearStockTransferCache = async (companyId?: string | null) => {
  await Promise.all([stockTransferCache.clear(companyId), stockTransferHistoryCache.clear(companyId)]);
};
