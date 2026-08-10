import type { DocumentData } from 'firebase/firestore';

// ─── Sample data shown ONLY while the tutorial is running, so the screen
//     never looks empty behind the walkthrough tooltips ──────────────────
export interface InvoiceItem {
  id: string;
  name: string;
  quantity: number;
  finalPrice: number;
  mrp: number;
  barcode?: string;
  stock?: number;
  gst?: number;
  taxRate?: number;
  hsnSac?: string;
  effectiveUnitPrice?: number;
  unit?: string;
  discount?: number;
  discount2?: number;
  manualDiscount?: number;
  purchasePrice?: number;
  purchasediscount?: number;
  taxType?: string;
  taxAmount?: number;
  taxableAmount?: number;
  salesPrice?: number;
  discountPercentage?: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  time: string;
  status: 'Paid' | 'Unpaid';
  type: 'Debit' | 'Credit';
  partyName: string;
  partyNumber?: string;
  partyAddress?: string;
  partyGstin?: string;
  createdAt: Date;
  dueAmount?: number;
  items?: InvoiceItem[];
  paymentMethods?: DocumentData;
  paymentHistory?: any[];
  returnHistory?: DocumentData[];
  returnedItemsSnapshot?: any[];
  salesmanId?: string | null;
  salesmanName?: string;
  manualDiscount?: number;
  taxType?: string;
  gstScheme?: string;
  subtotal?: number;
  taxAmount?: number;
  taxableAmount?: number;
  totalDiscount?: number;
  roundingOff?: number;
  voucherName?: string;
  shippingName?: string;
  shippingNumber?: string;
  shippingAddress?: string;
  shippingGST?: string;
  placeOfSupply?: string;
  expenses?: { name: string; amount: number }[];
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  narration?: string;
  transportDetails?: {
    transportName?: string;
    grRrNo?: string;
    grRrDate?: string;
    vehicleNo?: string;
    stationFrom?: string;
    pinCode?: string;
  };
}

export interface PdfData {
  printFormat?: 'A4' | 'THERMAL58';
  enableTriplicate?: boolean;
  enableItemImages?: boolean; // NEW
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
  placeOfSupply?: string;
  companyState?: string;       // <-- ADD THIS
  billDiscount: number;
  discountDisplayFormat?: 'amount' | 'percentage';
  enableDiscount2?: boolean;
  upiId: string;
  billTo: {
    name: string;
    address: string;
    phone: string;
    gstin: string;
  };
  shipTo?: {
    name: string;
    address: string;
    phone: string;
    gstin?: string;
  };
  expenses: { name: string; amount: number }[];
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  narration?: string;
  transportDetails?: {
    transportName?: string;
    grRrNo?: string;
    grRrDate?: string;
    vehicleNo?: string;
    stationFrom?: string;
    pinCode?: string;
  };
  invoice: {
    number: string;
    date: string;
    billedBy: string;
    roNumber: string;
  };
  items: any[];
  terms: string;
  finalAmount: number;
  advance?: number;
  due?: number;
  previousBalance?: number;
  isEstimate?: boolean;
  bankDetails: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    ifsc: string;
  };
}

export const SAMPLE_INVOICES: Invoice[] = [
  {
    id: 'sample-1',
    invoiceNumber: 'INV-1001',
    amount: 2450,
    time: '10:45 AM, 07/07',
    status: 'Paid',
    type: 'Credit',
    partyName: 'Rahul Traders',
    partyNumber: '9876543210',
    createdAt: new Date(),
    dueAmount: 0,
    items: [
      { id: 'i1', name: 'Sample Item A', quantity: 2, finalPrice: 1200, mrp: 700, unit: 'Pcs' },
      { id: 'i2', name: 'Sample Item B', quantity: 1, finalPrice: 1250, mrp: 1250, unit: 'Pcs' },
    ],
    paymentMethods: { cash: 2450, due: 0 },
    paymentHistory: [],
    returnHistory: [],
  },
];
