import type { Item, SalesItem } from '../../../constants/models';
import type { State } from '../../../enums';
import type { CartEntry } from '../../../Components/CardGrid';
import type { PurchaseSettings } from '../../../Pages/Settings/Purchasesetting';

// ─── Core domain types ────────────────────────────────────────────────────────

export interface PurchaseItem extends Omit<SalesItem, 'finalPrice' | 'effectiveUnitPrice' | 'discountPercentage'> {
    purchasePrice: number | string;
    originalPurchasePrice?: number;
    purchasediscount?: number;
    barcode?: string;
    taxRate?: number;
    taxType?: 'inclusive' | 'exclusive' | 'none';
    taxAmount?: number;
    taxableAmount?: number;
    stock: number;
    productId?: string;
    customPrice?: number | string;
    isEditable?: boolean;
    unitMultiplier?: number;
}

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
    taxType?: 'inclusive' | 'exclusive' | 'none';
    totalAmount: number;
    paymentMethods: { [key: string]: number };
    createdAt: any;
    companyId: string;
    voucherName?: string;
    roundingOff?: number;
    manualDiscount?: number;
    updatedAt?: any;
}

export type Purchase = PurchaseDocumentData & { id: string };

export type TaxOption = 'inclusive' | 'exclusive' | 'none';

// ─── Shared props passed from PurchasePage down into each view ────────────────

export interface SharedViewProps {
    // Data
    items: PurchaseItem[];
    availableItems: Item[];
    cartEntries: CartEntry[];
    cartItemsAdapter: any[];            // pre-shaped for GenericCartList
    categories?: string[];
    itemGroupMap: Record<string, string>;


    // Item handlers
    onAddItem: (item: Item) => void;
    onItemSelected: (item: Item | null) => void;
    onQuantityChange: (id: string, qty: number) => void;
    onDeleteItem: (id: string) => void;
    onClearCart: () => void;
    onDiscountChange: (id: string, v: number | string) => void;
    onPriceChange: (id: string, val: string) => void;
    onPriceBlur: (id: string) => void;
    onOpenEditDrawer: (item: Item) => void;
    onScanBarcode: () => void;

    // UI state
    pageIsLoading: boolean;
    error: string | null;
    setModal: (modal: { message: string; type: State; onConfirm?: () => void } | null) => void;

    // Settings
    purchaseSettings: PurchaseSettings | null;
    applyPurchaseRounding: (amount: number, isRoundingEnabled: boolean) => number;

    // Injected layout sub-components (avoids prop-drilling tax state)
    SummaryPanel: React.FC;
    MobileFooter: React.FC;
}