import type { SalesItem } from '../../../constants/models';

// Moved verbatim from Purchase.tsx (was defined inline around L35-52).
// Extends the base SalesItem from constants/models, dropping the sales-only
// derived fields and adding the purchase-specific ones the Purchase
// cart/calculator UI actually reads/writes.
export interface PurchaseItem extends Omit<SalesItem, 'finalPrice' | 'effectiveUnitPrice' | 'discountPercentage'> {
  purchasePrice: number | string;
  originalPurchasePrice?: number;
  purchasediscount?: number;
  purchasediscount2?: number;
  barcode?: string;
  taxRate?: number;
  taxType?: 'inclusive' | 'exclusive' | 'exempt';
  taxAmount?: number;
  taxableAmount?: number;
  stock: number;
  productId?: string;
  customPrice?: number | string;
  isEditable?: boolean;
  unitMultiplier?: number;
  unit?: string;
  addedAt?: number;
  tierId?: string;         // 👈 NEW
  tierLabel?: string;      // 👈 NEW
  tierQuantity?: number;   // 👈 NEW
  rateReviewedFor?: number; // cart-only: the rate the user tapped "Keep" on (supplier rate-change alert)
  // Saved on the purchase line when the supplier's rate changed (audit trail)
  lastRate?: number;
  rateChangePct?: number;
  rateReviewed?: boolean;
  // Supplier-wise fixed pricing (applied automatically when the supplier has a rule)
  supplierDiscountPct?: number;
  supplierDiscountSource?: 'item' | 'category' | 'default';
  supplierPricingFor?: string;        // supplier doc id the price was applied for
  supplierPricingName?: string;
  preSupplierPrice?: number | string; // cart-only: rate before it, restored by Revert
  preSupplierDiscount?: number;
  preSupplierDiscount2?: number;
  supplierPriceSkip?: string;         // cart-only: 'manual' or a supplier id the user reverted for
  itemGroupId?: string;
  itemGroupIds?: string[];
}

// Moved verbatim from Purchase.tsx (was defined inline around L54-78). The
// Firestore document shape for the `purchases` collection.
export interface PurchaseDocumentData {
  userId: string;
  partyName: string;
  partyNumber: string;
  partyAddress?: string;
  partyGstin?: string;
  invoiceNumber: string;
  items: PurchaseItem[];
  subtotal: number;
  totalDiscount?: number;
  taxableAmount?: number;
  taxAmount?: number;
  gstScheme?: 'regular' | 'composition' | 'none';
  taxType?: 'inclusive' | 'exclusive' | 'exempt';
  totalAmount: number;
  paymentMethods: { [key: string]: number };
  createdAt: any;
  companyId: string;
  voucherName?: string;
  roundingOff?: number;
  manualDiscount?: number;
  updatedAt?: any;
  extraExpenseAmount?: number;
}

export type Purchase = PurchaseDocumentData & { id: string };

// Moved verbatim from Purchase.tsx (was defined inline around L87).
export type TaxOption = 'inclusive' | 'exclusive' | 'exempt';
