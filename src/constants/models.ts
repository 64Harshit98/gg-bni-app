export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  partyName?: string;
  partyNumber?: string;
  totalAmount: number;
  items: any[]; // You can be more specific if you have a SalesItem type
  dueAmount?: number;             
  status: 'Paid' | 'Unpaid';     
  type: 'Debit' | 'Credit';  
  createdAt?: any;
  salesmanId?: string;
  taxType?: string;
  manualDiscount?: number;
  partyAddress?: string;
  partyGstin?: string;
  shippingName?: string;
  shippingAddress?: string;
  shippingNumber?: string;
  shippingGST?: string;
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  narration?: string;
  salesmanName?: string;
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
  firestoreDocId?: string;
  packetSize?: number;
  unitMultiplier?: number;
  moq?:number;
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
  productId?:string
}

export interface PdfData {
  printFormat?: 'A4' | 'THERMAL58';
  gstScheme: string;
  taxType: string;
  companyName: string;
  companyAddress: string;
  companyContact: string;
  companyEmail: string;
  companyLogoBase64?: string;
  signatureBase64: string;
  companyGstin: string;
  msmeNumber: string;
  panNumber: string;
  billDiscount: number;
  upiId: string;
  billTo: { name: string; address: string; phone: string; gstin: string };
  shipTo?: { name: string; address: string; phone: string; gstin?: string };
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  narration?: string;
  invoice: { number: string; date: string; billedBy: string; roNumber: string };
  items: any[];
  terms: string;
  finalAmount: number;
  isEstimate?: boolean;
  bankDetails: { accountName: string; accountNumber: string; bankName: string; ifsc: string };
}