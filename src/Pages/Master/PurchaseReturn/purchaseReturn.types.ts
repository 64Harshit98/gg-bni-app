import type { Item, PurchaseItem as OriginalPurchaseItem } from '../../../constants/models';
import type { CartItem } from '../../../Components/CartItem';

// Moved verbatim from PurchaseReturn.tsx (was defined inline around L35-49).
// The shape of a purchase document as read back for the return flow — a
// trimmed-down view of the `purchases` collection, not the same interface
// as PurchaseDocumentData in ../Purchase/purchase.types (that one is the
// save-time DB shape; this one is what PurchaseReturn.tsx actually reads).
export interface PurchaseData {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyNumber?: string;
  partyAddress?: string;
  taxType?: 'inclusive' | 'exclusive' | 'exempt';
  partyGstin?: string;
  items: OriginalPurchaseItem[];
  totalAmount: number;
  manualDiscount?: number;
  createdAt: any;
  isReturned?: boolean;
  paymentMethods?: { [key: string]: number };
}

// Moved verbatim from PurchaseReturn.tsx (was defined inline around L51-66).
// Represents one line of the ORIGINAL purchase, normalized for display/edit
// in the "Select Return Items" list.
export interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  mrp: number;
  tax?: number;
  hsnSac?: string;
  barcode?: string;
  unit?: string;
  stock?: number;
  maxReturnQuantity?: number;
  unitMultiplier?: number;
}

// Moved verbatim from PurchaseReturn.tsx (was defined inline around L68-78).
// Represents one line of NEW items received during an exchange.
export interface ReturnCartItem extends CartItem {
  originalItemId: string;
  unitPrice: number;
  amount: number;
  mrp: number;
  tax?: number;
  hsnSac?: string;
  barcode?: string;
  unit?: string;
  stock?: number;
}

// Moved verbatim from PurchaseReturn.tsx (was defined inline around L80-86).
// Unified Party interface (Customers/Suppliers DB).
export interface Party {
  id?: string;
  name: string;
  number: string;
  [key: string]: any;
}

// Re-exported for convenience so callers of the calculations file don't
// need a separate import from constants/models.
export type { Item };
