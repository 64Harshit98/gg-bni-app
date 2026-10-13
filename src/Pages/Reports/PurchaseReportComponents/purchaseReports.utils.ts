interface PurchaseItem {
  name: string;
  purchasePrice: number;
  quantity: number;
}

interface PaymentMethods {
  [key: string]: number;
}

export interface PurchaseRecord {
  id: string;
  partyName: string;
  partyNumber?: string;
  invoiceNumber?: string;
  supplierBillNumber?: string;
  totalAmount: number;
  taxAmount?: number;
  dueAmount?: number;
  paymentMethods: PaymentMethods;
  createdAt: number;
  items: PurchaseItem[];
  [key: string]: any;
}

export const formatDate = (timestamp: number): string => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

// Local date (toISOString() would shift to the previous day before 5:30 AM IST).
export { formatDateForInput } from '../SalesReportComponents/salesReport.utils';

export const getPurchaseItemCount = (purchase: PurchaseRecord): number =>
  (purchase.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

export const hasSupplier = (purchase: PurchaseRecord): boolean => {
  const name = (purchase.partyName || '').trim().toLowerCase();
  return !!name && name !== 'n/a' && name !== 'na';
};

export const getPurchaseDue = (purchase: PurchaseRecord): number =>
  Math.max(0, Math.min(purchase.dueAmount || 0, purchase.totalAmount));

// Supplier filter value for purchases without a supplier.
export const NO_SUPPLIER = '__none__';

export const supplierKey = (purchase: PurchaseRecord): string =>
  hasSupplier(purchase) ? purchase.partyName.trim().toLowerCase() : NO_SUPPLIER;
