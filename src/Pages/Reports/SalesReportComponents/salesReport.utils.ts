export const formatDate = (timestamp: number): string => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

export const formatDateForInput = (date: Date): string => {
  // Use local time methods to prevent UTC timezone shifting
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};
interface SalesItem {
  name: string;
  mrp: number;
  quantity: number;
}
interface PaymentMethods {
  [key: string]: number;
}
export interface SaleRecord {
  id: string;
  partyName: string;
  invoiceNumber: string;
  totalAmount: number;
  paymentMethods: PaymentMethods;
  createdAt: number;
  items: SalesItem[];
  [key: string]: any;
}
