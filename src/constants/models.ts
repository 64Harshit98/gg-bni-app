// src/constants/models.ts

export interface Item {
  id?: string; // Optional: Firestore document ID
  name: string;
  mrp: number; // Renamed from 'price' to 'mrp' to match your form
  purchasePrice: number;
  discount: number; // Store as a number (e.g., 0.10 for 10%, or 10 for 10%)
  tax: number; // Store as a number (e.g., 0.18 for 18%, or 18 for 18%)
  itemGroupId: string;
  amount?: number;
  barcode?: string; // Link to ItemGroup. This will be derived from 'Category'
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
  category?: string;
  hsnSac?: string; // HSN/SAC code
  gst?: number; // GST percentage
  unit?: string; // Unit of measure (e.g., Pcs.)
  companyId?: string | null; // Link to Company
  restockQuantity: number;
  stock: number;
}

export interface ItemGroup {
  id?: string; // Optional: Firestore document ID
  name: string;
  description: string;
  createdAt: number; // Timestamp
  updatedAt: number; // Timestamp
  // Add any other properties your item groups might have
}
export interface PurchaseItem {
  id: string;
  name: string;
  purchasePrice: number;
  quantity: number;
}
export interface Purchase {
  id: string;
  userId: string;
  partyName: string;
  partyNumber: string;
  invoiceNumber: string;
  items: {
    id: string;
    name: string;
    purchasePrice: number;
    quantity: number;
  }[];
  totalAmount: number;
  paymentMethods: {
    method: string;
    amount: number;
  }[];
  createdAt: any; // Or import firebase.firestore.Timestamp
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

// FIX: Added finalAmount to ensure the correct total is saved
export interface PurchaseCompletionData {
  paymentDetails: PaymentDetails;
  discount: number;
  finalAmount: number;
}

// --- The Payment Drawer Component ---
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
  discount?: number; // ++ ADD THIS LINE ++
  discountPercentage?: number; // ++ ADD THIS LINE ++
  finalPrice?: number;
}