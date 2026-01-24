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
