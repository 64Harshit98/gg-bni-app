import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { Item } from '../../../constants/models';
import type { SalesItem, CalcKey } from './Salestypes';
import type { CartEntry } from '../../../Components/CardGrid';
import type { PaymentCompletionData } from '../../../Components/PaymentDrawer';
import type { User } from '../../../Role/permission';

// ─── Modal shape ──────────────────────────────────────────────────────────────
export interface ModalState {
    message: string;
    type: any; // State enum
    onConfirm?: () => void;
}

// ─── Shared props passed from Sales.tsx into every view ───────────────────────
export interface SalesViewProps {
    // ── Modal ──────────────────────────────────────────────────────────────────
    modal: ModalState | null;
    setModal: Dispatch<SetStateAction<ModalState | null>>;

    // ── Barcode scanner ────────────────────────────────────────────────────────
    isScannerOpen: boolean;
    setIsScannerOpen: Dispatch<SetStateAction<boolean>>;
    isBarcodeLinkModalOpen: boolean;
    barcodeToLink: string | null;
    isLinkingBarcode: boolean;
    closeBarcodeLinkModal: () => void;
    handleLinkScannedBarcode: (item: Item) => Promise<void>;
    handleBarcodeScanned: (barcode: string) => Promise<void>;

    // ── Header ─────────────────────────────────────────────────────────────────
    isEditMode: boolean;
    invoiceNumber: string;
    onInvoiceNumberChange: (val: string) => void;
    invoiceDate: string;
    onInvoiceDateChange: (val: string) => void;

    // ── Items / cart ───────────────────────────────────────────────────────────
    availableItems: Item[];
    cartEntries: CartEntry[];
    itemGroupMap: Record<string, string>;
    categories: string[];
    items: SalesItem[];
    setItems: Dispatch<SetStateAction<SalesItem[]>>;
    /** Filtered by selected category (list view). Same as `items` in card view. */
    displayItems: SalesItem[];
    addItemToCart: (item: Item) => void;
    handleQuantityChange: (id: string, qty: number) => void;
    handleDeleteItem: (id: string) => void;
    handleClearCart: () => void;
    handleDiscountChange: (id: string, val: string | number) => void;
    handleCustomPriceChange: (id: string, val: string | number) => void;
    handleCustomPriceBlur: (id: string) => void;

    // ── Lock / info ────────────────────────────────────────────────────────────
    isDiscountLocked: boolean;
    isPriceLocked: boolean;
    discountInfo: string | null;
    priceInfo: string | null;
    discountHandlers: { onPressStart: (id?: string) => void; onPressEnd: (id?: string) => void; onClick: (id?: string) => void };
    priceHandlers: { onPressStart: (id?: string) => void; onPressEnd: () => void; onClick: () => void };

    // ── Settings ───────────────────────────────────────────────────────────────
    salesSettings: any;
    hideMrp: boolean;
    isCardImageView: boolean;

    // ── Tax ────────────────────────────────────────────────────────────────────
    activeTaxMode: 'inclusive' | 'exclusive' | 'exempt';
    setActiveTaxMode: Dispatch<SetStateAction<'inclusive' | 'exclusive' | 'exempt'>>;
    taxToggleProps: {
        activeTaxMode: 'inclusive' | 'exclusive' | 'exempt';
        onTaxModeChange: Dispatch<SetStateAction<'inclusive' | 'exclusive' | 'exempt'>>;
        gstScheme: string | undefined;
        lockTaxToggle: boolean;
    };
    taxAmount: number;

    // ── Totals ─────────────────────────────────────────────────────────────────
    subtotal: number;
    totalDiscount: number;
    finalAmount: number;
    totalQuantity: number;
    roundOff: number;
    taxableAmount: number;

    // ── Footer ─────────────────────────────────────────────────────────────────
    footerProps: {
        totalQuantity: number;
        subtotal: number;
        totalDiscount: number;
        taxAmount: number;
        finalAmount: number;
        showTaxRow: boolean;
        taxLabel: string;
        actionLabel: string;
        onActionClick: () => void;
        disableAction: boolean;
    };
    isFooterExpanded: boolean;
    setIsFooterExpanded: Dispatch<SetStateAction<boolean>>;

    // ── Salesman ───────────────────────────────────────────────────────────────
    salesmanSelector: ReactNode;
    workers: User[];
    selectedWorker: User | null;
    setSelectedWorker: Dispatch<SetStateAction<User | null>>;

    // ── Payment drawer ─────────────────────────────────────────────────────────
    isDrawerOpen: boolean;
    setIsDrawerOpen: Dispatch<SetStateAction<boolean>>;
    drawerSharedProps: {
        subtotal: number;
        billTotal: number;
        onPaymentComplete: (data: PaymentCompletionData) => Promise<void>;
        totalItemDiscount: number;
        totalQuantity: number;
    };
    salesDrawerEditProps: Record<string, any>;
    handleSavePayment: (data: PaymentCompletionData) => Promise<void>;

    // ── Item edit drawer ───────────────────────────────────────────────────────
    selectedItemForEdit: Item | null;
    isItemDrawerOpen: boolean;
    handleOpenEditDrawer: (item: Item) => void;
    handleCloseEditDrawer: () => void;
    handleSaveSuccess: (updated: Partial<Item>) => void;

    // ── Bill success ───────────────────────────────────────────────────────────
    savedBillData: { id: string; number: string; invoiceData?: any } | null;
    setSavedBillData: Dispatch<SetStateAction<{ id: string; number: string; invoiceData?: any } | null>>;
    sendingPdf: boolean;
    handleSendWhatsapp: (invoice: any) => Promise<void>;

    // ── Current user ───────────────────────────────────────────────────────────
    currentUser: any;

    // ── Calculator-specific ────────────────────────────────────────────────────
    calcInput: string;
    setCalcInput: Dispatch<SetStateAction<string>>;
    stagedCalcInput: string;
    setStagedCalcInput: Dispatch<SetStateAction<string>>;
    parsedData: { items: SalesItem[]; total: number };
    liveTotal: number;
    liveItemCount: number;
    handlePointerDown: (key: CalcKey) => void;
    handlePointerUp: (key: CalcKey) => void;
    handlePointerLeave: (key: CalcKey) => void;
    handleKeypadPress: (key: CalcKey) => void;
    handleCheckoutClick: () => void;
}