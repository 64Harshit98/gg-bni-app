import { Timestamp } from 'firebase/firestore';

export interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    mrp: number;
    discount?: number;
    discount2?: number;
    note: string;
    tax?: number;
    itemGroupId?: string;
    purchasePrice?: number;
    stock?: number;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
    restockQuantity?: number;
    finalPrice?: number;
    imageBase64?: string;
    imageUrl?: string
    salesPrice?: number
    unit?: string;
    unitMultiplier?: number;
    unitPrice?: number;
    moq?: number;
    itemId?: string;
    taxType?: string;
    effectiveUnitPrice?: number;
    customPrice?: number;
    taxRate?: number;
    taxableAmount?: number; // <-- Add this
    taxAmount?: number;
}

// 1. Updated Status Types
export type OrderStatus = 'Upcoming' | 'Confirmed' | 'Packed' | 'Completed' | 'Paid' | 'Cancelled';

export interface Order {
    id: string;
    orderId: string;
    totalAmount: number;
    userName: string;
    status: OrderStatus;
    paidAmount?: number;
    creditNoteAmount?: number;
    refundAmount?: number;
    createdAt: Date;
    time: string;
    items?: OrderItem[];
    billingDetails?: {
        address: string;
        phone: string;
        name: string;
        gstin: string;
        city?: string;
        state?: string;
    };
    shippingDetails?: any;
    userEmail?: string;
    userLoginPhone?: string;
    paymentMethod?: 'Cash' | 'UPI' | 'Card';
    paymentMethods?: { [key: string]: number };
    note?: string;
    specialInstruction?: string;
    manualDiscount?: number;
    discount?: number;
    expenses?: { id: number; name: string; amount: number }[];
    returnHistory?: {
        id: string;
        returnedAt: Date;
        returnedItems: any[];
        exchangeItems: any[];
        finalBalance: number;
        discountDeducted: number;
        modeOfReturn: string;
        paymentDetails?: any;
        partyName?: string;
        partyNumber?: string;
    }[];
    paymentStatus?: string
    updatedAt?: Date;
    type?: string;
    isLead?: boolean;
    totalTax?: number;      // <-- ADD THIS
    baseAmount?: number;
    // Bill-level tax context as it was at checkout/edit-save time — read by
    // display screens instead of the company's *current* settings, so an
    // order's numbers never reinterpret themselves after settings change.
    gstScheme?: string;
    taxType?: string;
    transportDetails?: {
        transportName: string;
        grRrNo: string;
        grRrDate: string;
        vehicleNo: string;
        stationFrom: string;
        pinCode: string;
    };
}

// Status tabs shown in the order timeline stepper. Module-level so it has a
// stable reference across renders (previously recreated in-component every
// render, which silently defeated statusCounts' memoization).
export const ORDER_STATUSES: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];

// ─── Sample orders shown ONLY while the tutorial is running, so the screen
//     never looks empty behind the walkthrough tooltips ──────────────────
export const SAMPLE_ORDERS: Order[] = [
    {
        id: 'sample-order-1',
        orderId: 'ORD-3001',
        totalAmount: 1850,
        userName: 'Anita Verma',
        status: 'Confirmed',
        paidAmount: 0,
        createdAt: new Date(),
        time: '11:05 AM, 07/07',
        userLoginPhone: '9876500011',
        billingDetails: {
            name: 'Anita Verma',
            address: '12 MG Road, Lucknow',
            phone: '9876500011',
            gstin: '',
            city: 'Lucknow',
            state: 'Uttar Pradesh',
        },
        items: [
            { id: 'so-i1', name: 'Sample Product A', quantity: 2, mrp: 500, finalPrice: 1000, note: '', unit: 'pcs' } as OrderItem,
            { id: 'so-i2', name: 'Sample Product B', quantity: 1, mrp: 850, finalPrice: 850, note: '', unit: 'pcs' } as OrderItem,
        ],
        paymentMethods: {},
        returnHistory: [],
        totalTax: 0,
        manualDiscount: 0,
        expenses: [],
    },
];
