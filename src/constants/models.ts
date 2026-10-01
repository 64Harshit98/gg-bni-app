export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  partyName?: string;
  partyNumber?: string;
  totalAmount: number;
  items: any[]; // You can be more specific if you have a SalesItem type
  createdAt?: any;
  salesmanId?: string;
  // Add other fields you use, like taxAmount, subtotal, etc.
}

export interface Item {
  id?: string;
  name: string;
  mrp: number;
  purchasePrice: number;
  discount: number;
  purchasediscount?: number;
  tax: number;
  taxRate?: number;
  itemGroupId?: string;
  itemGroupIds?: string[];
  isDeleted?: boolean;
  salesPrice: number;
  stock: number;
  amount?: number;
  barcode?: string;
  createdAt: number | object;
  updatedAt: number | object;
  category?: string;
  hsnSac?: string;
  gst?: number;
  unit?: string;
  companyId?: string | null;
  restockQuantity: number;
  isListed?: boolean;
    imageUrl?: string | null;
  imageUrls?: string[]; 
  description?: string;
  firestoreDocId?: string;
  packetSize?: number;
  unitMultiplier?: number;
  moq?: number;
  mrpOriginal?: number;
  mfgDate?: string;
  expDate?: string;
  variants?: string[];
  godownStock?: Record<string, number>;
  priceTiers?: PriceTier[];
  quantitySlabs?: QuantitySlab[];
}

export interface ItemGroup {
  id?: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  imageUrl?: string;
}

export interface PurchaseItem {
  id: string;
  name: string;
  purchasePrice: number;
  quantity: number;
  stock?: number;
  taxType?: 'inclusive' | 'exclusive' | 'exempt';
  taxRate?: number;
  tax?: number;
}

export interface Purchase {
  id: string;
  userId: string;
  partyName: string;
  partyNumber: string;
  invoiceNumber: string;
  items: PurchaseItem[];
  totalAmount: number;
  paymentMethods: {
    method: string;
    amount: number;
  }[];
  createdAt: any;
  companyId: string;
}

export interface PaymentMode {
  id: 'cash' | 'card' | 'upi' | 'due';
  name: string;
  description: string;
}

export interface PaymentDetails {
  [key: string]: number;
}

export interface PurchaseCompletionData {
  paymentDetails: PaymentDetails;
  discount: number;
  finalAmount: number;
}

export interface PaymentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  partyName: string;
  onPaymentComplete: (completionData: PurchaseCompletionData) => Promise<void>;
}

export interface SalesItem {
  id: string;
  name: string;
  mrp: number;
  quantity: number;
  discount?: number;
  discountPercentage?: number;
  finalPrice?: number;
  stock?: number;
  productId?: string
}

export interface PriceTier {
  id: string;
  label: string;              // "Piece", "Box of 10", "Combo Pack"
  quantity: number;           // kitne base pcs = 1 tier (e.g. 10, 3, 1)
  mrp: number;
  salesPrice: number;
  purchasePrice?: number;
  discount?: number;
  purchasediscount?: number;
    barcode?: string;           // is tier ka apna alag barcode (optional)
}

export interface QuantitySlab {
  id: string;
  minQty: number;
  maxQty: number | null;      // null = "and above"
  salesPrice: number;         // per-unit price for the WHOLE quantity when qty falls in this slab
}

/** Returns the slab matching this quantity, or null if none matches. */
export const getSlabForQty = (
  item: { quantitySlabs?: QuantitySlab[] },
  qty: number
): QuantitySlab | null => {
  const slabs = item.quantitySlabs;
  if (!slabs || slabs.length === 0) return null;
  return (
    slabs.find(s => qty >= s.minQty && (s.maxQty === null || qty <= s.maxQty)) ?? null
  );
};

/** Per-unit sales price before discount. Falls back to base salesPrice if no slab matches. */
export const getEffectiveSalesPrice = (
  item: { salesPrice: number; quantitySlabs?: QuantitySlab[] },
  qty: number
): number => getSlabForQty(item, qty)?.salesPrice ?? item.salesPrice;

/** Returns an English error message if slabs are invalid, otherwise null. */
export const validateQuantitySlabs = (
  slabs: QuantitySlab[],
  mrp: number
): string | null => {
  if (slabs.length === 0) return null;
  const sorted = [...slabs].sort((a, b) => a.minQty - b.minQty);

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (!s.minQty || s.minQty < 1) return 'Quantity slab "From Qty" must be at least 1.';
    if (s.maxQty !== null && s.maxQty < s.minQty) {
      return `Quantity slab starting at ${s.minQty}: "To Qty" cannot be less than "From Qty".`;
    }
    if (!s.salesPrice || s.salesPrice <= 0) {
      return `Quantity slab starting at ${s.minQty} needs a valid price.`;
    }
    if (mrp > 0 && s.salesPrice > mrp) {
      return `Quantity slab starting at ${s.minQty}: price cannot be greater than MRP.`;
    }
    if (s.maxQty === null && i !== sorted.length - 1) {
      return 'Only the last slab can be "and above" (blank To Qty).';
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.maxQty !== null && s.minQty !== prev.maxQty + 1) {
        return prev.maxQty >= s.minQty
          ? 'Quantity slabs cannot overlap.'
          : `Gap found between ${prev.maxQty} and ${s.minQty}. Slabs must be continuous.`;
      }
    }
  }
  return null;
};