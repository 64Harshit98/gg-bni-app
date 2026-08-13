import type { SalesItem as OriginalSalesItem } from '../../../constants/models';

// Moved verbatim from SalesReturn.tsx (was defined inline above the
// component, ~L33-81). None of these four extend a shared base type from
// constants/models.ts the way Sales' SalesItem / Purchase's PurchaseItem do
// — SalesReturn only borrows `SalesItem as OriginalSalesItem` from models.ts
// (to type SalesData.items), it doesn't extend it.

export interface SalesData {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyNumber: string;
  items: OriginalSalesItem[];
  totalAmount: number;
  subtotal: number;
  discount: number;
  manualDiscount?: number;
  createdAt: any;
  isReturned?: boolean;
  paymentMethods?: { [key: string]: number };
  taxType?: string;
}

export interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
  maxReturnQuantity: number;
  unitMultiplier?: number;
}

export interface ExchangeItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
  discount: number;
  salesPrice?: number;
  customPrice?: number | string;
  unitMultiplier?: number;
  moq?: number;
}

export interface Customer {
  id?: string;
  name: string;
  number: string;
  [key: string]: any;
}
