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
  totalAmount: number;
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

export const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0];
};
