import type { SalesItem as OriginalSalesItem } from '../../../constants/models';

// Moved verbatim from Sales.tsx (was defined inline around L36-60). Extends
// the base SalesItem from constants/models with all the extra fields the
// Sales cart/calculator UI actually reads/writes.
export interface SalesItem extends OriginalSalesItem {
    isEditable: boolean;
    customPrice?: number | string;
    discount2?: number;
    taxableAmount?: number;
    taxAmount?: number;
    taxRate?: number;
    taxType?: 'inclusive' | 'exclusive' | 'none';
    purchasePrice: number;
    tax: number;
    itemGroupId: string;
    salesPrice: number;
    stock: number;
    amount: number;
    barcode: string;
    restockQuantity: number;
    productId: string;
    unit?: string;
    unitMultiplier?: number;
    moq?: number;
    packetSize?: number | undefined;
    isCustomAmount?: boolean;
    isStagedCalcItem?: boolean;
    addedAt?: number;   // 👈 NEW:
}

// Formalized shape of the invoice/sale-data object built in
// handleSavePayment (the object passed to runTransaction's set/update for
// the `sales` collection) and consumed by preparePdfData/handleSendWhatsapp/
// handlePrintAction. Based only on fields actually read or written across
// those call sites in Sales.tsx — not an idealized schema. Kept with an
// index signature because a handful of optional/legacy fields (e.g. fields
// copied through from PaymentCompletionData, or added conditionally only in
// the "new invoice" vs "edit" branch of saveOperation) don't have a single
// consistent shape across every call site, and forcing them into named
// fields risked misrepresenting what's actually guaranteed to exist.
export interface SalesInvoice {
    id?: string;
    invoiceNumber?: string;
    createdAt?: any; // Date | Firestore Timestamp | serverTimestamp() sentinel, depending on call site
    updatedAt?: any;
    items: any[];
    subtotal?: number;
    discount?: number;
    manualDiscount?: number;
    revDiscount?: number;
    roundOff?: number;
    taxableAmount?: number;
    taxAmount?: number;
    gstScheme?: string;
    taxType?: string;
    totalAmount?: number;
    amount?: number; // used in the lighter-weight `invoiceData` shape passed to preparePdfData after a fresh save
    paymentMethods?: Record<string, number> | any;
    dueAmount?: number;
    partyName?: string;
    partyNumber?: string;
    partyAddress?: string;
    partyGstin?: string;
    placeOfSupply?: string;
    shippingState?: string;
    shippingName?: string;
    shippingNumber?: string;
    shippingAddress?: string;
    shippingGST?: string;
    salesmanId?: string;
    salesmanName?: string;
    expenses?: { id?: string | number; name: string; amount: number }[];
    narration?: string;
    transportDetails?: any;
    userId?: string;
    companyId?: string;
    voucherName?: string;
    [key: string]: any;
}
