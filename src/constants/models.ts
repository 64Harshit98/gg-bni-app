// src/constants/models.ts

export interface Item {
  id?: string;
  name: string;
  mrp: number;
  purchasePrice: number;
  discount: number;
  purchasediscount?: number;
  tax: number;
  taxRate?: number;
  itemGroupId: string;
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
  description?: string;
}

export interface ItemGroup {
  id?: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface PurchaseItem {
  id: string;
  name: string;
  purchasePrice: number;
  quantity: number;
  stock?: number;
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
}