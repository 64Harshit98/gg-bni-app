import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { transactiontypes } from '../constants/Transactiontype';
import { Modal } from '../constants/Modal';
import { State } from '../enums';
import { db } from '../lib/Firebase';
import {
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    increment as firebaseIncrement,
    collection,
    query,
    where,
    getDocs,
    limit
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';

export interface PaymentDetails { [key: string]: number; }

export interface ExpenseItem {
    name: string;
    amount: number;
}
export interface TransportDetails {
    transportName: string;
    grRrNo: string;
    grRrDate: string;
    vehicleNo: string;
    stationFrom: string;
    pinCode: string;
}
const INDIAN_STATES = [
    "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
    "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
    "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
    "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
    "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal"
];

export interface PaymentCompletionData {
    paymentDetails: PaymentDetails;
    partyName: string;
    partyNumber: string;
    discount: number;
    finalAmount: number;
    appliedCredit: number;
    appliedDebit: number;
    partyAddress?: string;
    partyGST?: string;
    revDiscount?: number;
    method?: string;
    shippingName?: string;
    shippingNumber?: string;
    shippingAddress?: string;
    shippingGST?: string;
    expenses?: ExpenseItem[];
    narration?: string;
    placeOfSupply?: string;
    shippingState?: string;
    partyPinCode?: string;
    shippingPinCode?: string;
    transportDetails?: TransportDetails;
    printBill?: boolean;
    sendWhatsApp?: boolean;
}

interface PaymentDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    mode?: 'sale' | 'purchase' | 'calculator';
    subtotal: number;
    totalTax?: number;
    billTotal: number;
    originalBillTotal?: number;
    totalQuantity?: number;
    totalItemDiscount?: number;
    onPaymentComplete: (data: PaymentCompletionData) => Promise<void>;
    isPartyNameEditable?: boolean;
    initialPartyName?: string;
    initialPartyNumber?: string;
    initialPaymentMethods?: PaymentDetails | { [key: string]: any };
    requireCustomerName?: boolean;
    requireCustomerMobile?: boolean;
    initialDiscount?: number;
    allowDueBilling?: boolean;
    initialShippingName?: string;
    initialShippingNumber?: string;
    initialShippingAddress?: string;
    initialShippingGST?: string;
    initialExpenses?: ExpenseItem[];
    initialNarration?: string;
    enableShippingDetails?: boolean;
    enableExtraExpense?: boolean;
    enableNarration?: boolean;
    enableCustomerDetails?: boolean;
    enableTransportDetails?: boolean;
    initialTransportDetails?: TransportDetails;
    initialPartyAddress?: string;
    initialPartyGST?: string;
    initialPlaceOfSupply?: string;
    initialShippingState?: string;
    initialPartyPinCode?: string;
    initialShippingPinCode?: string;
    taxMode?: 'inclusive' | 'exclusive' | 'exempt';
    onTaxModeChange?: (mode: 'inclusive' | 'exclusive' | 'exempt') => void;
    isTaxToggleLocked?: boolean;
    totalMrp?: number;
    showBillOptions?: boolean;
    // Sales Setting cap on the Bill Discount field below — 0/undefined means no cap.
    maxBillDiscountValue?: number;
    maxBillDiscountType?: 'percent' | 'amount';
}

// --- SESSION STORAGE KEYS ---
const SESSION_STORAGE_NAME_KEY = 'sessionPartyName';
const SESSION_STORAGE_NUMBER_KEY = 'sessionPartyNumber';
const SESSION_STORAGE_ADDRESS_KEY = 'sessionPartyAddress';
const SESSION_STORAGE_GST_KEY = 'sessionPartyGST';
const SESSION_STORAGE_STATE_KEY = 'sessionPartyState';
const SESSION_STORAGE_SHIPPING_NAME_KEY = 'sessionShippingName';
const SESSION_STORAGE_SHIPPING_NUMBER_KEY = 'sessionShippingNumber';
const SESSION_STORAGE_SHIPPING_ADDRESS_KEY = 'sessionShippingAddress';
const SESSION_STORAGE_SHIPPING_GST_KEY = 'sessionShippingGST';
const SESSION_STORAGE_SHIPPING_STATE_KEY = 'sessionShippingState';
const SESSION_STORAGE_SAME_AS_BILLING_KEY = 'sessionIsSameAsBilling';
const SESSION_STORAGE_EXPENSES_KEY = 'sessionExpenses';
const SESSION_STORAGE_NARRATION_KEY = 'sessionNarration';
const SESSION_STORAGE_PAYMENTS_KEY = 'sessionSelectedPayments';
const SESSION_STORAGE_TRANSPORT_KEY = 'sessionTransportDetails';
const SESSION_STORAGE_PIN_KEY = 'sessionPartyPinCode';
const SESSION_STORAGE_SHIPPING_PIN_KEY = 'sessionShippingPinCode';

// GSTIN starts with a 2-digit state code
const GST_STATE_CODES: { [state: string]: string } = {
    "Jammu and Kashmir": "01", "Himachal Pradesh": "02", "Punjab": "03", "Chandigarh": "04", "Uttarakhand": "05",
    "Haryana": "06", "Delhi": "07", "Rajasthan": "08", "Uttar Pradesh": "09", "Bihar": "10", "Sikkim": "11",
    "Arunachal Pradesh": "12", "Nagaland": "13", "Manipur": "14", "Mizoram": "15", "Tripura": "16", "Meghalaya": "17",
    "Assam": "18", "West Bengal": "19", "Jharkhand": "20", "Odisha": "21", "Chhattisgarh": "22", "Madhya Pradesh": "23",
    "Gujarat": "24", "Dadra and Nagar Haveli and Daman and Diu": "26", "Maharashtra": "27", "Karnataka": "29", "Goa": "30",
    "Lakshadweep": "31", "Kerala": "32", "Tamil Nadu": "33", "Puducherry": "34", "Andaman and Nicobar Islands": "35",
    "Telangana": "36", "Andhra Pradesh": "37", "Ladakh": "38",
};
const STATE_BY_GST_CODE: { [code: string]: string } = Object.keys(GST_STATE_CODES).reduce((acc, name) => {
    acc[GST_STATE_CODES[name]] = name;
    return acc;
}, {} as { [code: string]: string });

interface PartySuggestion {
    name: string;
    number: string;
    address?: string;
    gstNumber?: string;
    creditBalance?: number;
    debitBalance?: number;
    shippingName?: string;
    shippingNumber?: string;
    shippingAddress?: string;
    shippingGST?: string;
    state?: string;
    shippingState?: string;
    pinCode?: string;
    shippingPinCode?: string;
}

// --- UI-ONLY HELPERS (SELLAR design) ---
const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (n: number) => (Math.abs(n % 1) < 0.005 ? n.toFixed(0) : n.toFixed(2));

const FIELD_CLS = 'w-full h-10 px-3 text-sm text-[#0f172b] placeholder:text-[#5b6b86] rounded-sm border border-[#7a8aa3] bg-white outline-none focus:border-[#155dfc] focus:ring-2 focus:ring-[#155dfc]/20';
const LABEL_CLS = 'block text-xs font-medium text-[#45556c] mb-1';
const OVERLINE_CLS = 'text-[11px] leading-4 font-semibold tracking-[0.08em] uppercase text-[#5b6b86]';
const BTN_TEXT_PRIMARY = 'justify-self-start inline-flex items-center gap-1.5 h-8 px-3 text-[13px] font-medium text-[#155dfc] hover:bg-[#e6eeff] rounded-sm transition-colors';
const DISC_BOX = 'flex items-center gap-1 h-10 px-2.5 rounded-sm border border-[#7a8aa3]';
const SEG_WRAP = 'flex p-[3px] gap-0.5 bg-[#f5f7ff] border border-[#dfe6fb] rounded-sm';
const SEG_ON = 'bg-white text-[#155dfc] shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]';
const SEG_OFF = 'text-[#45556c] hover:text-[#0f172b]';

const CloseIcon: React.FC<{ size?: number }> = ({ size = 18 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
);

const SvgIcon: React.FC<{ size?: number; children: React.ReactNode }> = ({ size = 16, children }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

// Pop-up dialog — SELLAR "payment drawer pop-ups" style: tinted icon + title/subtitle header,
// sunken footer with Cancel / primary action. Bottom sheet on mobile, centered card on desktop.
// Rendered through a portal ABOVE the drawer (z-[10001]).
// NOTE: React events bubble through portals, so every handler stops propagation so that
// clicks/touches inside never reach the drawer overlay (which closes the drawer).
const PopupDialog: React.FC<{
    tint: string;
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    onCancel: () => void;
    onSave: () => void;
    saveLabel?: string;
    onRemove?: () => void;
    removeLabel?: string;
    children: React.ReactNode;
}> = ({ tint, icon, title, subtitle, onCancel, onSave, saveLabel = 'Save', onRemove, removeLabel = 'Remove', children }) => {
    // Esc = Cancel
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onCancel]);

    return createPortal(
        <div
            className="fixed inset-0 z-[10001] flex items-end md:items-center justify-center md:p-4"
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            onTouchMove={(e) => e.stopPropagation()}
        >
            <div className="absolute inset-0 bg-[#020618]/50" />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                className="relative w-full max-w-lg md:max-w-[520px] bg-white rounded-sm md:rounded-sm shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] max-h-[90dvh] flex flex-col overflow-hidden text-left animate-slide-up md:animate-none"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#dfe6fb] flex-none">
                    <span className={`w-9 h-9 grid place-items-center rounded-sm flex-none ${tint}`}>{icon}</span>
                    <div className="flex-1 min-w-0">
                        <b className="block text-[17px] leading-6 font-semibold text-[#0f172b]">{title}</b>
                        {subtitle && <small className="block text-xs text-[#5b6b86]">{subtitle}</small>}
                    </div>
                    <button type="button" onClick={onCancel} aria-label="Close" className="w-10 h-10 grid place-items-center rounded-sm text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b] transition-colors">
                        <CloseIcon size={20} />
                    </button>
                </div>
                <div className="px-4 py-4 grid grid-cols-1 gap-3 overflow-y-auto min-h-0">{children}</div>
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#dfe6fb] bg-[#f5f7ff] flex-none">
                    {onRemove && (
                        <button type="button" onClick={onRemove} className="mr-auto inline-flex items-center gap-1.5 h-10 px-3 rounded-sm text-sm font-medium text-[#d5000c] hover:bg-[#ffeef0] transition-colors">
                            <SvgIcon size={16}><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" /></SvgIcon>
                            {removeLabel}
                        </button>
                    )}
                    <button type="button" onClick={onCancel} className="h-10 px-4 rounded-sm text-sm font-medium text-[#0f172b] hover:bg-[#e6eeff] transition-colors">Cancel</button>
                    <button type="button" onClick={onSave} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-sm bg-[#155dfc] hover:bg-[#1447e6] active:scale-[0.98] transition-all text-white text-sm font-semibold">
                        <SvgIcon size={16}><path d="M5 12.5l4.5 4.5L19 7" /></SvgIcon>
                        {saveLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// "Extras" row in the drawer (opens a pop-up)
const ExtraRow: React.FC<{ tint: string; icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }> = ({ tint, icon, title, subtitle, onClick }) => (
    <button
        type="button"
        aria-haspopup="dialog"
        onClick={onClick}
        className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 w-full px-3 py-2 rounded-sm border border-[#dfe6fb] bg-white text-left hover:bg-[#f5f7ff] transition-colors"
    >
        <span className={`w-8 h-8 grid place-items-center rounded-sm ${tint}`}>{icon}</span>
        <span className="min-w-0">
            <b className="block text-sm font-semibold text-[#0f172b]">{title}</b>
            <small className="block truncate text-xs text-[#5b6b86]">{subtitle}</small>
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-[#155dfc]">
            <SvgIcon size={14}><path d="M17 3l4 4L8 20H4v-4z" /></SvgIcon>
            Edit
        </span>
    </button>
);

// Dashed "add" chip for extras that are still empty
const AddChip: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
    <button
        type="button"
        aria-haspopup="dialog"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-full border-[1.5px] border-dashed border-[#7a8aa3] bg-white text-[13px] font-medium text-[#45556c] hover:bg-[#f5f7ff] transition-colors whitespace-nowrap"
    >
        <span className="text-[#155dfc] flex"><SvgIcon size={14}><path d="M12 5v14M5 12h14" /></SvgIcon></span>
        {label}
    </button>
);

const CheckRow: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
    <label className="inline-flex items-center gap-2 text-[13px] text-[#45556c] cursor-pointer select-none">
        <input type="checkbox" className="sr-only peer" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <i className="w-[18px] h-[18px] rounded-[5px] grid place-items-center not-italic flex-none bg-white border-[1.5px] border-[#7a8aa3] text-white transition-colors peer-checked:bg-[#155dfc] peer-checked:border-[#155dfc] peer-focus-visible:ring-2 peer-focus-visible:ring-[#155dfc]/30 [&>svg]:opacity-0 peer-checked:[&>svg]:opacity-100">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        </i>
        {label}
    </label>
);

const PAYMENT_UI: { [key: string]: { tint: string; bar: string; icon: React.ReactNode } } = {
    cash: {
        tint: 'bg-[#e9faef] text-[#008236]',
        bar: '#008236',
        icon: (<><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>),
    },
    upi: {
        tint: 'bg-[#e6eeff] text-[#155dfc]',
        bar: '#155dfc',
        icon: (<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2" />),
    },
    card: {
        tint: 'bg-[#ffe8f8] text-[#c4009a]',
        bar: '#c4009a',
        icon: (<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></>),
    },
    due: {
        tint: 'bg-[#fff3dd] text-[#bb4d00]',
        bar: '#bb4d00',
        icon: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
    },
};
const PAYMENT_UI_FALLBACK = PAYMENT_UI.card;

const SummaryRows: React.FC<{ rows: { label: React.ReactNode; value: string; success?: boolean; total?: boolean }[] }> = ({ rows }) => (
    <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-sm tabular-nums m-0">
        {rows.map((r, i) => (
            <React.Fragment key={i}>
                <dt className={`m-0 pr-4 ${r.total ? 'pt-2 border-t border-[#dfe6fb] font-semibold text-base text-[#0f172b]' : r.success ? 'text-[#008236]' : 'text-[#45556c]'}`}>{r.label}</dt>
                <dd className={`m-0 text-right ${r.total ? 'pt-2 border-t border-[#dfe6fb] font-semibold text-base text-[#0f172b]' : r.success ? 'text-[#008236]' : 'text-[#0f172b]'}`}>{r.value}</dd>
            </React.Fragment>
        ))}
    </dl>
);

const PaymentDrawer: React.FC<PaymentDrawerProps> = ({
    isOpen,
    onClose,
    mode = 'sale',
    billTotal,
    originalBillTotal,
    totalQuantity = 0,
    totalTax = 0,
    totalItemDiscount = 0,
    onPaymentComplete,
    initialPartyName,
    initialPartyNumber,
    initialPaymentMethods,
    requireCustomerName = false,
    requireCustomerMobile = false,
    allowDueBilling = false,
    initialDiscount = 0,
    initialShippingName,
    initialShippingNumber,
    initialShippingAddress,
    initialShippingGST,
    initialExpenses,
    initialNarration,
    enableShippingDetails = false,
    enableExtraExpense = false,
    enableNarration = false,
    enableCustomerDetails = false,
    enableTransportDetails = false,
    initialTransportDetails,
    initialPartyAddress,
    initialPartyGST,
    initialPlaceOfSupply,
    initialShippingState,
    initialPartyPinCode,
    initialShippingPinCode,
    taxMode = 'exclusive',
    onTaxModeChange,
    isTaxToggleLocked = false,
    totalMrp = 0,
    showBillOptions = true,
    maxBillDiscountValue = 0,
    maxBillDiscountType = 'percent',
}) => {
    const { currentUser } = useAuth();

    // --- COMPUTED PROPERTIES BASED ON MODE ---
    const isSale = mode === 'sale' || mode === 'calculator';
    const collectionName = isSale ? 'customers' : 'suppliers';
    const partyLabel = isSale ? 'Customer' : 'Supplier';
    const isCalculator = mode === 'calculator';
    const isPurchaseReturnMode = mode === 'purchase';

    // --- STATE ---
    const [partyName, setPartyName] = useState('');
    const [partyNumber, setPartyNumber] = useState('');
    const [partyAddress, setPartyAddress] = useState('');
    const [partyGST, setPartyGST] = useState('');
    //const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
    const [discount, setDiscount] = useState(0);
    const [discountPercent, setDiscountPercent] = useState(0);
    const [partyCredit, setPartyCredit] = useState(0);
    const [partyDebit, setPartyDebit] = useState(0);
    const [useCredit, setUseCredit] = useState(false);
    const [useDebit, setUseDebit] = useState(false);
    const [selectedPayments, setSelectedPayments] = useState<PaymentDetails>({});
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [pendingReturnAmount, setPendingReturnAmount] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isDiscountLocked, setIsDiscountLocked] = useState(true);
    const [partyState, setPartyState] = useState('');
    const [shippingState, setShippingState] = useState('');
    const [suggestions, setSuggestions] = useState<PartySuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeSearchField, setActiveSearchField] = useState<'name' | 'number'>('number');
    const searchTimeout = useRef<NodeJS.Timeout | null>(null);

    // Refs now point to the field wrapper (so the suggestions dropdown aligns with the full field)
    const numberInputRef = useRef<HTMLDivElement>(null);
    const nameInputRef = useRef<HTMLDivElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const shouldSaveToLocalStorage = useRef(true);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);
    // Values captured when a pop-up opens, so Cancel / Esc can restore them
    const popupSnapshot = useRef<any>(null);
    const [discountInfo, setDiscountInfo] = useState<string | null>(null);
    const [addressType, setAddressType] = useState<'billing' | 'shipping'>('billing');
    const [isSameAsBilling, setIsSameAsBilling] = useState(true);
    const [shippingName, setShippingName] = useState('');
    const [shippingNumber, setShippingNumber] = useState('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [shippingGST, setShippingGST] = useState('');
    const [partyPinCode, setPartyPinCode] = useState('');
    const [shippingPinCode, setShippingPinCode] = useState('');

    const [expenses, setExpenses] = useState<{ id: number; name: string; amount: number | '' }[]>([]);
    const [narration, setNarration] = useState('');
    //const [isNarrationExpanded, setIsNarrationExpanded] = useState(false);

    // NOTE: the "show...Modal" flags below control the pop-ups (GST & address, Note, Expense, Transport, Bill discount & tax)
    const [showTransportModal, setShowTransportModal] = useState(false);
    const [showGstAddressModal, setShowGstAddressModal] = useState(false);
    const [showNarrationModal, setShowNarrationModal] = useState(false);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [showDiscountTaxModal, setShowDiscountTaxModal] = useState(false);
    const [transportName, setTransportName] = useState('');
    const [grRrNo, setGrRrNo] = useState('');
    const [grRrDate, setGrRrDate] = useState('');
    const [vehicleNo, setVehicleNo] = useState('');
    const [stationFrom, setStationFrom] = useState('');
    const [pinCode, setPinCode] = useState('');
    const [printBill, setPrintBill] = useState(true);
    const [sendWhatsApp, setSendWhatsApp] = useState(true);

    const hasTransportDetails = !!(transportName.trim() || grRrNo.trim() || grRrDate.trim() || vehicleNo.trim() || stationFrom.trim() || pinCode.trim());
    // --- CALCULATIONS ---
    const liveTax = useMemo(() => {
        if (!billTotal || billTotal <= 0) return totalTax || 0;
        const ratio = Math.max(0, (billTotal - discount) / billTotal);
        return (totalTax || 0) * ratio;
    }, [totalTax, billTotal, discount]);

    const parsedExpense = expenses.reduce((sum, e) => sum + (parseFloat(e.amount.toString()) || 0), 0);
    const netPayable = useMemo(() => Math.round(Math.max(0, billTotal - discount + parsedExpense)), [billTotal, discount, parsedExpense]);

    const totalManualPayment = useMemo(() => {
        const sum = Object.values(selectedPayments).reduce((acc, amount) => acc + (amount || 0), 0);
        return parseFloat(sum.toFixed(2));
    }, [selectedPayments]);

    const appliedCreditAmount = useMemo(() => {
        if (!useCredit || partyCredit <= 0) return 0;
        const remainingAfterManual = Math.max(0, netPayable - totalManualPayment);
        return Math.min(remainingAfterManual, partyCredit);
    }, [useCredit, partyCredit, netPayable, totalManualPayment]);

    const appliedDebitAmount = useMemo(() => {
        if (!useDebit || partyDebit <= 0) return 0;
        const remainingAfterManualAndCredit = Math.max(0, netPayable - totalManualPayment - appliedCreditAmount);
        return Math.min(remainingAfterManualAndCredit, partyDebit);
    }, [useDebit, partyDebit, netPayable, totalManualPayment, appliedCreditAmount]);

    const totalPaymentReceived = useMemo(() => {
        return parseFloat((totalManualPayment + appliedCreditAmount + appliedDebitAmount).toFixed(2));
    }, [totalManualPayment, appliedCreditAmount, appliedDebitAmount]);

    const changeToReturn = useMemo(() => {
        const diff = totalPaymentReceived - netPayable;
        return diff > 0.01 ? parseFloat(diff.toFixed(2)) : 0;
    }, [totalPaymentReceived, netPayable]);

    const pendingAmount = useMemo(() => {
        const diff = netPayable - totalPaymentReceived;
        return diff > 0.01 ? parseFloat(diff.toFixed(2)) : 0;
    }, [netPayable, totalPaymentReceived]);

    // --- AUTO-SYNC SHIPPING DETAILS ---
    useEffect(() => {
        if (isSameAsBilling) {
            setShippingName(partyName);
            setShippingNumber(partyNumber);
            setShippingAddress(partyAddress);
            setShippingGST(partyGST);
            setShippingState(partyState);
            setShippingPinCode(partyPinCode);
        }
    }, [isSameAsBilling, partyName, partyNumber, partyAddress, partyGST, partyState, partyPinCode]);

    // --- LOCK BACKGROUND SCROLL WHILE DRAWER IS OPEN ---
    useEffect(() => {
        if (!isOpen) return;

        const scrollY = window.scrollY;
        document.body.style.position = 'fixed';
        document.body.style.top = `-${scrollY}px`;
        document.body.style.left = '0';
        document.body.style.right = '0';
        document.body.style.width = '100%';
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.left = '';
            document.body.style.right = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
            window.scrollTo(0, scrollY);
        };
    }, [isOpen]);
    // --- LIFECYCLE: MOUNT / SYNC INITIAL DATA & CACHE ---
    useEffect(() => {
        if (!isOpen) return;

        setIsSubmitting(false);
        const baseTotal = originalBillTotal && originalBillTotal > 0 ? originalBillTotal : billTotal;
        const originalPercent = initialDiscount && baseTotal > 0 ? (initialDiscount / baseTotal) * 100 : 0;
        const scaledDiscount = billTotal > 0 ? Math.round((originalPercent / 100) * billTotal) : 0;

        setDiscount(scaledDiscount);
        setDiscountPercent(parseFloat(originalPercent.toFixed(2)));
        setIsDiscountLocked(true);
        setPartyCredit(0);
        setUseCredit(false);
        setPartyDebit(0);
        setUseDebit(false);
        setSuggestions([]);
        setShowSuggestions(false);
        setAddressType('billing');

        // Setup fallbacks using props
        let finalName = initialPartyName || '';
        let finalNumber = initialPartyNumber || '';
        let finalAddress = initialPartyAddress || '';
        let finalGST = initialPartyGST || '';
        let finalState = initialPlaceOfSupply || '';
        let finalShippingName = initialShippingName || '';
        let finalShippingNumber = initialShippingNumber || '';
        let finalShippingAddress = initialShippingAddress || '';
        let finalShippingGST = initialShippingGST || '';
        let finalShippingState = initialShippingState || '';
        let finalPin = initialPartyPinCode || '';
        let finalShippingPin = initialShippingPinCode || '';
        let finalIsSameAsBilling = true; // default linked to billing
        let finalExpenses = initialExpenses && initialExpenses.length > 0
            ? initialExpenses.map((e, index) => ({ id: Date.now() + index, name: e.name, amount: e.amount }))
            : [];
        let finalNarration = initialNarration || '';
        let loadedPayments: PaymentDetails = {};
        let finalTransport: TransportDetails = initialTransportDetails || {
            transportName: '', grRrNo: '', grRrDate: '', vehicleNo: '', stationFrom: '', pinCode: ''
        };
        // In edit mode, always prefer the prop value
        if (initialPartyName || initialPartyNumber) {
            // Edit mode: use prop directly, ignore session storage
            // If this bill already had distinct shipping details saved earlier, keep them unlinked.
            // Otherwise default to "same as billing" so the box isn't empty.
            const hasDistinctShipping = !!(initialShippingName || initialShippingNumber || initialShippingAddress || initialShippingGST);
            finalIsSameAsBilling = !hasDistinctShipping;

            if (initialTransportDetails) {
                finalTransport = initialTransportDetails;
            }
        } else {
            // New bill mode: try session storage first, then prop
            const savedTransport = sessionStorage.getItem(SESSION_STORAGE_TRANSPORT_KEY);
            if (savedTransport) {
                try { finalTransport = JSON.parse(savedTransport); } catch (e) { }
            } else if (initialTransportDetails) {
                finalTransport = initialTransportDetails;
            }
        }
        if (initialPaymentMethods && Object.keys(initialPaymentMethods).length > 0) {
            Object.entries(initialPaymentMethods).forEach(([key, value]) => {
                if (key === 'due' || key === 'Credit Note' || key === 'Debit Note') return;
                const numVal = Number(value);
                if (!isNaN(numVal) && numVal > 0) loadedPayments[key] = numVal;
            });
        }

        if (finalName || finalNumber) {
            // EDIT MODE: Turn off auto-save so we don't overwrite any ongoing New Bill draft
            shouldSaveToLocalStorage.current = false;

            // Clear session values completely so the next New Bill flows fresh
            try {
                sessionStorage.removeItem(SESSION_STORAGE_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NUMBER_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_ADDRESS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_GST_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_STATE_KEY); sessionStorage.removeItem(SESSION_STORAGE_PIN_KEY); sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_PIN_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_NUMBER_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_ADDRESS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_GST_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_STATE_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SAME_AS_BILLING_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_EXPENSES_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NARRATION_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_PAYMENTS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_TRANSPORT_KEY);
            } catch (e) { }
        } else {
            // NEW BILL MODE: Enable automatic local caching
            shouldSaveToLocalStorage.current = true;
            try {
                finalName = sessionStorage.getItem(SESSION_STORAGE_NAME_KEY) || '';
                finalNumber = sessionStorage.getItem(SESSION_STORAGE_NUMBER_KEY) || '';
                finalAddress = sessionStorage.getItem(SESSION_STORAGE_ADDRESS_KEY) || '';
                finalGST = sessionStorage.getItem(SESSION_STORAGE_GST_KEY) || '';
                finalState = sessionStorage.getItem(SESSION_STORAGE_STATE_KEY) || '';
                finalShippingName = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_NAME_KEY) || '';
                finalShippingNumber = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_NUMBER_KEY) || '';
                finalShippingAddress = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_ADDRESS_KEY) || '';
                finalShippingGST = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_GST_KEY) || '';
                finalShippingState = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_STATE_KEY) || '';
                finalPin = sessionStorage.getItem(SESSION_STORAGE_PIN_KEY) || '';
                finalShippingPin = sessionStorage.getItem(SESSION_STORAGE_SHIPPING_PIN_KEY) || '';
                const savedSameAsBilling = sessionStorage.getItem(SESSION_STORAGE_SAME_AS_BILLING_KEY);
                finalIsSameAsBilling = savedSameAsBilling !== null ? savedSameAsBilling === 'true' : true;
                finalNarration = sessionStorage.getItem(SESSION_STORAGE_NARRATION_KEY) || '';

                const savedExpenses = sessionStorage.getItem(SESSION_STORAGE_EXPENSES_KEY);
                if (savedExpenses) finalExpenses = JSON.parse(savedExpenses);

                const savedPayments = sessionStorage.getItem(SESSION_STORAGE_PAYMENTS_KEY);
                if (savedPayments) loadedPayments = JSON.parse(savedPayments);

            } catch (e) { }
        }

        // Apply initialized parameters directly to state hook engines
        setPartyName(finalName);
        setPartyNumber(finalNumber);
        setPartyAddress(finalAddress);
        setPartyGST(finalGST);
        setPartyState(finalState);
        setShippingName(finalShippingName);
        setShippingNumber(finalShippingNumber);
        setShippingAddress(finalShippingAddress);
        setShippingGST(finalShippingGST);
        setShippingState(finalShippingState);
        setPartyPinCode(finalPin);
        setShippingPinCode(finalShippingPin);
        setIsSameAsBilling(finalIsSameAsBilling);
        setExpenses(finalExpenses);
        setNarration(finalNarration);
        setSelectedPayments(loadedPayments);

        setTransportName(finalTransport.transportName || '');
        setGrRrNo(finalTransport.grRrNo || '');
        setGrRrDate(finalTransport.grRrDate || '');
        setVehicleNo(finalTransport.vehicleNo || '');
        setStationFrom(finalTransport.stationFrom || '');
        setPinCode(finalTransport.pinCode || '');
        setShowGstAddressModal(false);
        setShowNarrationModal(false);
        setShowExpenseModal(false);

        if (isSale && finalNumber) searchParty(finalNumber, 'number');
        if (!isSale && finalName) searchParty(finalName, 'name');

    }, [isOpen, mode, billTotal, initialDiscount, originalBillTotal, initialPartyName, initialPartyNumber, initialPartyAddress, initialPartyGST, initialShippingName, initialShippingNumber, initialShippingAddress, initialShippingGST, initialNarration, initialTransportDetails, initialPlaceOfSupply, initialShippingState, initialPartyPinCode, initialShippingPinCode]);

    // --- AUTOMATIC SESSION SYNC EFFECT ---
    useEffect(() => {
        if (isOpen && !isSubmitting && shouldSaveToLocalStorage.current) {
            try {
                sessionStorage.setItem(SESSION_STORAGE_NAME_KEY, partyName);
                sessionStorage.setItem(SESSION_STORAGE_NUMBER_KEY, partyNumber);
                sessionStorage.setItem(SESSION_STORAGE_ADDRESS_KEY, partyAddress);
                sessionStorage.setItem(SESSION_STORAGE_GST_KEY, partyGST);
                sessionStorage.setItem(SESSION_STORAGE_STATE_KEY, partyState);
                sessionStorage.setItem(SESSION_STORAGE_PIN_KEY, partyPinCode);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_PIN_KEY, shippingPinCode);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_NAME_KEY, shippingName);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_NUMBER_KEY, shippingNumber);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_ADDRESS_KEY, shippingAddress);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_GST_KEY, shippingGST);
                sessionStorage.setItem(SESSION_STORAGE_SHIPPING_STATE_KEY, shippingState);
                sessionStorage.setItem(SESSION_STORAGE_SAME_AS_BILLING_KEY, String(isSameAsBilling));
                sessionStorage.setItem(SESSION_STORAGE_NARRATION_KEY, narration);
                sessionStorage.setItem(SESSION_STORAGE_EXPENSES_KEY, JSON.stringify(expenses));
                sessionStorage.setItem(SESSION_STORAGE_PAYMENTS_KEY, JSON.stringify(selectedPayments));
                sessionStorage.setItem(SESSION_STORAGE_TRANSPORT_KEY, JSON.stringify({
                    transportName, grRrNo, grRrDate, vehicleNo, stationFrom, pinCode
                }));
            } catch (e) { }
        }
    }, [
        partyName, partyNumber, partyAddress, partyGST, partyState,
        shippingName, shippingNumber, shippingAddress, shippingGST, shippingState, partyPinCode, shippingPinCode,
        isSameAsBilling, expenses, narration, selectedPayments, isOpen, isSubmitting, transportName, grRrNo, grRrDate, vehicleNo, stationFrom, pinCode
    ]);

    // --- CLOSE PARTY SUGGESTIONS ON OUTSIDE CLICK ---
    useEffect(() => {
        if (!showSuggestions) return;
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                suggestionsRef.current?.contains(target) ||
                nameInputRef.current?.contains(target) ||
                numberInputRef.current?.contains(target)
            ) {
                return;
            }
            setShowSuggestions(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showSuggestions]);

    const searchParty = async (term: string, field: 'name' | 'number') => {
        if (!term || term.length < 2 || !currentUser?.companyId) {
            setSuggestions([]); setShowSuggestions(false); return;
        }

        const companyId = currentUser.companyId;
        const partyRef = collection(db, 'companies', companyId, collectionName);
        const termLower = term.toLowerCase();
        const termCap = termLower.charAt(0).toUpperCase() + termLower.slice(1);

        try {
            const queries = [];
            queries.push(
                getDocs(query(partyRef, where(field, '>=', termLower), where(field, '<=', termLower + '\uf8ff'), limit(5)))
            );

            if (field === 'name' && termCap !== termLower) {
                queries.push(
                    getDocs(query(partyRef, where(field, '>=', termCap), where(field, '<=', termCap + '\uf8ff'), limit(5)))
                );
            }
            const snapshots = await Promise.all(queries);
            const resultsMap = new Map<string, PartySuggestion>();

            snapshots.forEach(snap => {
                snap.forEach(doc => {
                    if (!resultsMap.has(doc.id)) {
                        const data = doc.data();
                        resultsMap.set(doc.id, {
                            name: data.name || '',
                            number: data.number || doc.id,
                            address: data.address,
                            state: data.state || data.placeOfSupply,
                            shippingState: data.shippingState,
                            pinCode: data.pinCode,
                            shippingPinCode: data.shippingPinCode,
                            gstNumber: data.gstNumber,
                            creditBalance: data.creditBalance,
                            debitBalance: data.debitBalance,
                            shippingName: data.shippingName,
                            shippingNumber: data.shippingNumber,
                            shippingAddress: data.shippingAddress,
                            shippingGST: data.shippingGST,
                        });
                    }
                });
            });

            const results = Array.from(resultsMap.values());
            setSuggestions(results);
            setShowSuggestions(results.length > 0);

        } catch (err) {
            console.error(err);
        }
    };

    const handleInputChange = (value: string, type: 'name' | 'number') => {
        if (type === 'name') {
            setPartyName(value);
            setActiveSearchField('name');
            if (searchTimeout.current) clearTimeout(searchTimeout.current);
            searchTimeout.current = setTimeout(() => { searchParty(value, 'name'); }, 400);
        } else {
            setPartyNumber(value);
            setActiveSearchField('number');
            if (isSale) {
                if (searchTimeout.current) clearTimeout(searchTimeout.current);
                searchTimeout.current = setTimeout(() => { searchParty(value, 'number'); }, 400);
            } else {
                setSuggestions([]); setShowSuggestions(false);
            }
        }
    };

    const selectParty = (party: PartySuggestion) => {
        setPartyName(party.name);
        setPartyNumber(party.number);
        setPartyAddress(party.address || '');
        setPartyState(party.state || '');
        setPartyGST(party.gstNumber || '');
        setPartyCredit(party.creditBalance || 0);
        setPartyDebit(party.debitBalance || 0);
        setShippingName(party.shippingName || '');
        setShippingNumber(party.shippingNumber || '');
        setShippingAddress(party.shippingAddress || '');
        setShippingState(party.shippingState || '');
        setPartyPinCode(party.pinCode || '');
        setShippingPinCode(party.shippingPinCode || '');
        setShippingGST(party.shippingGST || '');
        setUseCredit(false);
        setUseDebit(false);
        setShowSuggestions(false);
    };

    const handleAmountChange = (modeId: string, amount: string) => {
        const numAmount = parseFloat(amount) || 0;
        setSelectedPayments(prev => ({ ...prev, [modeId]: Math.max(0, numAmount) }));
    };

    const handleFillRemaining = (modeId: string) => {
        const currentAmount = selectedPayments[modeId] || 0;
        const amountToFill = Math.max(0, pendingAmount);
        handleAmountChange(modeId, (currentAmount + amountToFill).toFixed(2));
    };

    const handleConfirm = async () => {
        if (pendingAmount > 0.01) {
            setModal({ message: `Mismatch: ₹${pendingAmount.toFixed(2)} remaining.`, type: State.ERROR });
            return;
        }

        const nonDuePaymentTotal = Object.entries(selectedPayments).reduce((acc, [key, value]) => {
            const isDue = key.toLowerCase().includes('due');
            return isDue ? acc : acc + (value || 0);
        }, 0);

        const dueInPayments = Object.entries(selectedPayments).reduce((acc, [key, value]) => {
            return key.toLowerCase().includes('due') ? acc + (value || 0) : acc;
        }, 0);

        if (dueInPayments > 0 && nonDuePaymentTotal + dueInPayments > netPayable + 0.01) {
            setModal({
                message: `Total entered (₹${(nonDuePaymentTotal + dueInPayments).toFixed(2)}) exceeds the bill of ₹${netPayable.toFixed(2)}. Reduce Due or other payment amounts.`,
                type: State.ERROR
            });
            return;
        }

        if (useCredit && appliedCreditAmount === 0 && partyCredit > 0) {
            setModal({
                message: `Credit note not needed — payment methods already cover the full bill of ₹${netPayable.toFixed(2)}.`,
                type: State.ERROR
            });
            return;
        }

        const dueAmount = Object.entries(selectedPayments).reduce((acc, [key, value]) => {
            return key.toLowerCase().includes('due') ? acc + (value || 0) : acc;
        }, 0);

        if (mode !== 'purchase' && partyNumber.trim().length > 0 && partyNumber.trim().length !== 10) {
            setModal({ message: `${partyLabel} Phone Number must be exactly 10 digits.`, type: State.ERROR });
            return;
        }

        if (mode === 'sale' && dueAmount > 0 && !partyNumber.trim()) {
            setModal({ message: `${partyLabel} Phone Number is required for Due Billing.`, type: State.ERROR });
            return;
        }
        if (mode === 'purchase' && dueAmount > 0 && (!partyName.trim() || !partyNumber.trim())) {
            setModal({ message: `${partyLabel} Name and Phone Number are required for Due Billing.`, type: State.ERROR });
            return;
        }

        if (changeToReturn > 0.01) {
            setPendingReturnAmount(changeToReturn);
            return;
        }

        await proceedWithSave();
    };

    const proceedWithSave = async () => {
        let revDiscount = 0;
        if (changeToReturn > 0.01) revDiscount = changeToReturn;

        const payloadToSave: PaymentDetails = {};
        transactiontypes.forEach((t) => { payloadToSave[t.id] = 0; });
        Object.entries(selectedPayments).forEach(([key, value]) => { payloadToSave[key] = value; });

        if (appliedCreditAmount > 0) payloadToSave['Credit Note'] = appliedCreditAmount;
        if (appliedDebitAmount > 0) payloadToSave['Debit Note'] = appliedDebitAmount;

        setIsSubmitting(true);
        shouldSaveToLocalStorage.current = false;

        try {
            const safePartyName = partyName ? partyName.trim() : '';
            const safePartyNumber = partyNumber ? partyNumber.trim() : '';
            const safePartyAddress = partyAddress ? partyAddress.trim() : '';
            const safePartyGST = partyGST ? partyGST.trim() : '';
            const safeShippingName = shippingName ? shippingName.trim() : '';
            const safeShippingNumber = shippingNumber ? shippingNumber.trim() : '';
            const safeShippingAddress = shippingAddress ? shippingAddress.trim() : '';
            const safeShippingGST = shippingGST ? shippingGST.trim() : '';
            const safePartyPinCode = partyPinCode ? partyPinCode.trim() : '';
            const safeShippingPinCode = shippingPinCode ? shippingPinCode.trim() : '';
            const formattedExpenses = expenses
                .filter(e => e.name.trim() || e.amount)
                .map(e => ({
                    name: e.name.trim(),
                    amount: parseFloat(e.amount.toString()) || 0
                }));
            const safeNarration = narration ? narration.trim() : '';
            const safeTransportDetails: TransportDetails = {
                transportName: transportName.trim(),
                grRrNo: grRrNo.trim(),
                grRrDate: grRrDate.trim(),
                vehicleNo: vehicleNo.trim(),
                stationFrom: stationFrom.trim(),
                pinCode: pinCode.trim(),
            };
            await onPaymentComplete({
                paymentDetails: payloadToSave || {},
                partyName: safePartyName,
                partyNumber: safePartyNumber,
                discount: discount || 0,
                finalAmount: netPayable || 0,
                appliedCredit: appliedCreditAmount || 0,
                appliedDebit: appliedDebitAmount || 0,
                partyAddress: safePartyAddress,
                partyGST: safePartyGST,
                revDiscount: revDiscount || 0,
                shippingName: safeShippingName,
                shippingNumber: safeShippingNumber,
                shippingAddress: safeShippingAddress,
                shippingGST: safeShippingGST,
                expenses: formattedExpenses,
                narration: safeNarration,
                placeOfSupply: partyState,
                shippingState: shippingState,
                partyPinCode: safePartyPinCode,
                shippingPinCode: safeShippingPinCode,
                transportDetails: hasTransportDetails ? safeTransportDetails : undefined,
                printBill: mode === 'sale' && showBillOptions ? printBill : undefined,
                sendWhatsApp: mode === 'sale' && showBillOptions ? sendWhatsApp : undefined,
            });

            const identifier = safePartyNumber || safePartyName;

            if (currentUser?.companyId && identifier) {
                const partyDocRef = doc(db, 'companies', currentUser.companyId, collectionName, identifier);

                // ✅ NEW: check if this party doc already has a createdAt. Stamp it ONLY the
                // first time (new doc, or an old doc that never got one) — never on repeat
                // bills — so date-range filtering in Party Ledger / Customer Report works
                // correctly for every party, whether they were made via billing or Opening
                // Balance.
                const existingPartySnap = await getDoc(partyDocRef);
                const needsCreatedAt = !existingPartySnap.exists() || !existingPartySnap.data()?.createdAt;
                const partyData: any = {
                    name: safePartyName,
                    number: safePartyNumber,
                    companyId: currentUser.companyId,
                    address: safePartyAddress,
                    state: partyState,
                    gstNumber: safePartyGST,
                    shippingName: safeShippingName,
                    shippingNumber: safeShippingNumber,
                    shippingAddress: safeShippingAddress,
                    shippingGST: safeShippingGST,
                    shippingState: shippingState,
                    pinCode: safePartyPinCode,
                    shippingPinCode: safeShippingPinCode,
                    updatedAt: serverTimestamp(),
                };
                if (needsCreatedAt) {
                    partyData.createdAt = serverTimestamp();
                }
                Object.keys(partyData).forEach(key => {
                    if (partyData[key] === undefined) delete partyData[key];
                });

                if (isSale) partyData.lastSaleAt = serverTimestamp();
                else partyData.lastPurchaseAt = serverTimestamp();

                if (appliedCreditAmount > 0) partyData.creditBalance = firebaseIncrement(-appliedCreditAmount);
                if (appliedDebitAmount > 0) partyData.debitBalance = firebaseIncrement(-appliedDebitAmount);

                await setDoc(partyDocRef, partyData, { merge: true });
            }

            // Cleanup storage references explicitly on success
            try {
                sessionStorage.removeItem(SESSION_STORAGE_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NUMBER_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_ADDRESS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_GST_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_STATE_KEY); sessionStorage.removeItem(SESSION_STORAGE_PIN_KEY); sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_PIN_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_NAME_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_NUMBER_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_ADDRESS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_GST_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SHIPPING_STATE_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_SAME_AS_BILLING_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_EXPENSES_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_NARRATION_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_PAYMENTS_KEY);
                sessionStorage.removeItem(SESSION_STORAGE_TRANSPORT_KEY);
            } catch (e) { }

            setPartyName(''); setPartyNumber(''); setSelectedPayments({});
            setShippingName(''); setShippingNumber(''); setShippingAddress(''); setShippingGST('');
            setPartyPinCode(''); setShippingPinCode('');
            setExpenses([]); setNarration('');
            setTransportName(''); setGrRrNo(''); setGrRrDate(''); setVehicleNo(''); setStationFrom(''); setPinCode('');

        } catch (error) {
            setModal({ message: (error as Error).message || 'Failed to save.', type: State.ERROR });
        } {
            setIsSubmitting(false);
        }
    };

    // GSTIN typed -> fill State from the first 2 digits (state code)
    const changeGstin = (value: string) => {
        const stateFromGstin = value.length >= 2 ? STATE_BY_GST_CODE[value.slice(0, 2)] : undefined;
        if (addressType === 'billing') {
            setPartyGST(value);
            if (stateFromGstin) setPartyState(stateFromGstin);
        } else {
            setShippingGST(value);
            setIsSameAsBilling(false);
            if (stateFromGstin) setShippingState(stateFromGstin);
        }
    };

    // --- POP-UP CONTROL (open / cancel / save) ---
    type PopupKey = 'gst' | 'expense' | 'note' | 'transport' | 'discount';

    const closePopups = () => {
        setShowGstAddressModal(false);
        setShowNarrationModal(false);
        setShowExpenseModal(false);
        setShowTransportModal(false);
        setShowDiscountTaxModal(false);
    };

    // Make sure no pop-up stays "open" while the drawer is closed
    useEffect(() => {
        if (!isOpen) closePopups();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const openPopup = (which: PopupKey) => {
        popupSnapshot.current = {
            partyGST, partyAddress, partyState, partyPinCode,
            shippingGST, shippingAddress, shippingState, shippingPinCode, isSameAsBilling,
            narration, expenses,
            transport: { transportName, grRrNo, grRrDate, vehicleNo, stationFrom, pinCode },
            discount, discountPercent, taxMode,
        };
        if (which === 'gst') setShowGstAddressModal(true);
        if (which === 'note') setShowNarrationModal(true);
        if (which === 'expense') {
            if (expenses.length === 0) setExpenses([{ id: Date.now(), name: '', amount: '' }]);
            setShowExpenseModal(true);
        }
        if (which === 'transport') setShowTransportModal(true);
        if (which === 'discount') setShowDiscountTaxModal(true);
    };

    const cancelPopup = (which: PopupKey) => {
        const snap = popupSnapshot.current;
        if (snap) {
            if (which === 'gst') {
                setPartyGST(snap.partyGST); setPartyAddress(snap.partyAddress); setPartyState(snap.partyState); setPartyPinCode(snap.partyPinCode);
                setShippingGST(snap.shippingGST); setShippingAddress(snap.shippingAddress); setShippingState(snap.shippingState); setShippingPinCode(snap.shippingPinCode);
                setIsSameAsBilling(snap.isSameAsBilling);
            } else if (which === 'note') {
                setNarration(snap.narration);
            } else if (which === 'expense') {
                setExpenses(snap.expenses);
            } else if (which === 'transport') {
                setTransportName(snap.transport.transportName); setGrRrNo(snap.transport.grRrNo); setGrRrDate(snap.transport.grRrDate);
                setVehicleNo(snap.transport.vehicleNo); setStationFrom(snap.transport.stationFrom); setPinCode(snap.transport.pinCode);
            } else if (which === 'discount') {
                setDiscount(snap.discount); setDiscountPercent(snap.discountPercent);
                if (snap.taxMode !== taxMode && onTaxModeChange) onTaxModeChange(snap.taxMode);
            }
        }
        closePopups();
    };

    const saveExpensePopup = () => {
        // drop rows that were left completely empty
        setExpenses(prev => prev.filter(e => e.name.trim() || e.amount));
        closePopups();
    };

    const removeGstPopup = () => {
        if (addressType === 'billing') { setPartyGST(''); setPartyAddress(''); setPartyState(''); setPartyPinCode(''); }
        else { setShippingGST(''); setShippingAddress(''); setShippingState(''); setShippingPinCode(''); setIsSameAsBilling(false); }
        closePopups();
    };

    const clearTransportPopup = () => {
        setTransportName(''); setGrRrNo(''); setGrRrDate(''); setVehicleNo(''); setStationFrom(''); setPinCode('');
        closePopups();
    };

    const handleDiscountPressStart = () => longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500);
    const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handleDiscountClick = () => { if (isDiscountLocked) { setDiscountInfo("Cannot edit"); setTimeout(() => setDiscountInfo(null), 3000); } };
    // Sales Setting cap on Bill Discount — 0/unset means no cap. Converts
    // whichever unit the owner configured (% or ₹) to both, against the
    // current bill total, so either input can be clamped directly.
    const getBillDiscountCap = () => {
        if (!maxBillDiscountValue || maxBillDiscountValue <= 0) return null;
        if (maxBillDiscountType === 'amount') {
            const maxAmount = maxBillDiscountValue;
            const maxPercent = billTotal > 0 ? (maxAmount / billTotal) * 100 : 0;
            return { maxAmount, maxPercent };
        }
        const maxPercent = maxBillDiscountValue;
        const maxAmount = (maxPercent / 100) * billTotal;
        return { maxAmount, maxPercent };
    };

    const handleDiscountAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let amt = parseFloat(e.target.value) || 0;
        if (amt < 0) amt = 0;
        const cap = getBillDiscountCap();
        if (cap && amt > cap.maxAmount) amt = cap.maxAmount;
        setDiscount(amt);
        setDiscountPercent(billTotal > 0 ? parseFloat(((amt / billTotal) * 100).toFixed(2)) : 0);
    };

    const handleDiscountPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let pct = parseFloat(e.target.value) || 0;
        if (pct > 100) pct = 100;
        if (pct < 0) pct = 0;
        const cap = getBillDiscountCap();
        if (cap && pct > cap.maxPercent) pct = cap.maxPercent;
        setDiscountPercent(pct);
        setDiscount(parseFloat(((pct / 100) * billTotal).toFixed(2)));
    };

    const renderSuggestions = () => {
        if (!showSuggestions || suggestions.length === 0) return null;
        const ref = activeSearchField === 'name' ? nameInputRef.current : numberInputRef.current;
        const rect = ref?.getBoundingClientRect();
        if (!rect) return null;

        return createPortal(
            <div
                ref={suggestionsRef}
                style={{
                    position: 'fixed',
                    top: rect.bottom + 4,
                    left: rect.left,
                    width: rect.width,
                    zIndex: 99999,
                }}
                className="bg-white border border-[#dfe6fb] shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] rounded-sm p-1.5 max-h-48 overflow-y-auto"
            >
                {suggestions.map((party, idx) => (
                    <div key={idx} className="px-2.5 py-2 hover:bg-[#e6eeff] rounded-sm cursor-pointer text-sm flex justify-between items-center gap-2" onClick={() => selectParty(party)}>
                        <div className="min-w-0">
                            <div className="font-semibold text-xs text-[#0f172b] truncate">{party.name}</div>
                            <div className="text-[10px] text-[#5b6b86]">{party.number}</div>
                        </div>
                        {(party.creditBalance ?? 0) > 0 && (<span className="text-[11px] font-medium text-[#008236] bg-[#e9faef] px-2 py-0.5 rounded-full whitespace-nowrap">Credit: ₹{party.creditBalance}</span>)}
                    </div>
                ))}
            </div>,
            document.body
        );
    };

    if (!isOpen) return null;

    // --- UI-ONLY DERIVED VALUES (allocation bar + status text) ---
    const knownPaymentIds = transactiontypes.map(t => t.id);
    const knownSum = knownPaymentIds.reduce((acc, id) => acc + (selectedPayments[id] || 0), 0);
    const otherManual = Math.max(0, totalManualPayment - knownSum);
    const allocationSegments = [
        ...transactiontypes.map(t => ({ key: t.id, amount: selectedPayments[t.id] || 0, color: (PAYMENT_UI[t.id] || PAYMENT_UI_FALLBACK).bar })),
        { key: 'other', amount: otherManual > 0.01 ? otherManual : 0, color: '#7a8aa3' },
        { key: 'credit', amount: appliedCreditAmount, color: '#5b6b86' },
        { key: 'debit', amount: appliedDebitAmount, color: '#94a3c8' },
    ].filter(s => s.amount > 0);
    const segPct = (n: number) => (netPayable > 0 ? Math.min(100, (n / netPayable) * 100) : 0);

    const statusText = changeToReturn > 0.01
        ? `Return ₹${fmt(changeToReturn)} to customer`
        : pendingAmount > 0.01
            ? `Allocate ₹${fmt(pendingAmount)} more to confirm`
            : 'Fully paid';
    const statusColor = changeToReturn > 0.01 ? 'text-[#bb4d00]' : pendingAmount > 0.01 ? 'text-[#bb4d00]' : 'text-[#008236]';
    const dueEntered = Object.entries(selectedPayments).reduce((acc, [key, value]) => (key.toLowerCase().includes('due') ? acc + (value || 0) : acc), 0);
    const dueNeedsParty = dueEntered > 0 && (
        mode === 'sale' ? !partyNumber.trim()
            : mode === 'purchase' ? (!partyName.trim() || !partyNumber.trim())
                : false
    );
    const dueRequirementText = mode === 'purchase'
        ? `${partyLabel} name and phone number are required for Due billing.`
        : `${partyLabel} phone number is required for Due billing.`;

    const billOptions = mode === 'sale' && showBillOptions ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <CheckRow checked={printBill} onChange={setPrintBill} label="Print bill" />
            <CheckRow checked={sendWhatsApp} onChange={setSendWhatsApp} label="Send on WhatsApp" />
        </div>
    ) : null;

    const taxModeLabel = taxMode.charAt(0).toUpperCase() + taxMode.slice(1);
    const subTotalValue = Math.max(0, netPayable - liveTax);

    const summaryRows = [
        { label: <>MRP total{totalQuantity > 0 ? ` (${totalQuantity} ${totalQuantity === 1 ? 'item' : 'items'})` : ''}</>, value: `₹${fmt(totalMrp)}` },
        { label: 'Item discounts', value: `− ₹${fmt(totalItemDiscount)}`, success: totalItemDiscount > 0 },
        { label: 'Bill discount', value: `₹${fmt(discount)}` },
        ...(parsedExpense > 0 ? [{ label: 'Extra expenses', value: `+ ₹${fmt(parsedExpense)}` }] : []),
        { label: 'Sub total', value: `₹${fmt(subTotalValue)}` },
        { label: `Tax · ${taxModeLabel}`, value: `₹${fmt(liveTax)}` },
        { label: 'To collect', value: `₹${fmt(netPayable)}`, total: true },
    ];

    const confirmContent = isSubmitting ? (
        <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Confirming...</>
    ) : (
        <>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            Confirm payment
        </>
    );
    const confirmBtnCls = 'w-full text-white rounded-sm font-semibold text-sm bg-[#155dfc] hover:bg-[#1447e6] active:scale-[0.98] transition-all disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2';

    const confirmContentMobile = isSubmitting ? confirmContent : (
        <>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
            Confirm payment · ₹{fmt(netPayable)}
        </>
    );

    const lockIcon = (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-[#5b6b86]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
        </svg>
    );

    const discountTaxIcon = <SvgIcon><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="7.5" cy="7.5" r="1.5" /></SvgIcon>;
    const gstIcon = <SvgIcon><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></SvgIcon>;
    const expenseIcon = <SvgIcon><path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" /><circle cx="16.5" cy="13.5" r="1.2" /></SvgIcon>;
    const noteIcon = <SvgIcon><path d="M17 3l4 4L8 20H4v-4z" /></SvgIcon>;
    const transportIcon = <SvgIcon><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.5" /><circle cx="17" cy="18" r="1.5" /></SvgIcon>;

    const TINT_BLUE = 'bg-[#e6eeff] text-[#155dfc]';
    const TINT_MAGENTA = 'bg-[#ffe8f8] text-[#c4009a]';
    const TINT_GREEN = 'bg-[#e9faef] text-[#008236]';
    const TINT_AMBER = 'bg-[#fff3dd] text-[#bb4d00]';

    // --- EXTRAS (each opens a pop-up) ---
    const showPartyExtras = enableCustomerDetails && !isCalculator;
    const showNoteExtra = showPartyExtras && isSale && enableNarration;
    const showExpenseExtra = showPartyExtras && isSale && enableExtraExpense;
    const showTransportExtra = showPartyExtras && enableTransportDetails;

    const curGST = addressType === 'billing' ? partyGST : shippingGST;
    const curAddress = addressType === 'billing' ? partyAddress : shippingAddress;
    const curState = addressType === 'billing' ? partyState : shippingState;
    const curPin = addressType === 'billing' ? partyPinCode : shippingPinCode;
    const hasGst = !!(curGST.trim() || curAddress.trim() || curState || curPin.trim());
    const gstSummary = [curGST.trim() && `GSTIN ${curGST.trim()}`, curState, curAddress.trim(), curPin.trim()].filter(Boolean).join(' · ');

    const filledExpenses = expenses.filter(e => e.name.trim() || e.amount);
    const hasExpense = filledExpenses.length > 0;
    const expenseSummary = `${filledExpenses[0]?.name?.trim() || 'Expense'}${filledExpenses.length > 1 ? ` +${filledExpenses.length - 1} more` : ''} · ₹${fmtShort(parsedExpense)} · added to bill`;

    const transportSummary = [transportName, grRrNo && `GR/RR ${grRrNo}`, grRrDate, vehicleNo, stationFrom, pinCode].filter(Boolean).join(' · ') || 'Transport details added';
    const discountRowSummary = `${discount > 0 ? `₹${fmtShort(discount)} off` : 'No discount'} · GST ${taxMode}`;

    const hasDiscountExtra = discount > 0;
    const showGstRow = showPartyExtras && hasGst;
    const showExpenseRow = showExpenseExtra && hasExpense;
    const showTransportRow = showTransportExtra && hasTransportDetails;
    const showNoteRow = showNoteExtra && !!narration;
    const anyRow = showGstRow || showExpenseRow || showTransportRow || showNoteRow || hasDiscountExtra;
    const anyAddChip = (showPartyExtras && !hasGst) || (showTransportExtra && !hasTransportDetails) || !hasDiscountExtra || (showNoteExtra && !narration) || (showExpenseExtra && !hasExpense);

    // Filled extras -> row with "Edit". Empty extras -> dashed "+" chip (like Note).
    const extrasBlock = (
        <>
            <div className={OVERLINE_CLS}>Extras <span className="normal-case tracking-normal font-normal">· each opens a pop-up</span></div>
            {anyRow && (
                <div className="grid gap-2">
                    {showGstRow && (
                        <ExtraRow tint={TINT_BLUE} icon={gstIcon} title="GST & address" subtitle={gstSummary} onClick={() => openPopup('gst')} />
                    )}
                    {showExpenseRow && (
                        <ExtraRow tint={TINT_MAGENTA} icon={expenseIcon} title="Shop expense" subtitle={expenseSummary} onClick={() => openPopup('expense')} />
                    )}
                    {showTransportRow && (
                        <ExtraRow tint={TINT_BLUE} icon={transportIcon} title="Transport details" subtitle={transportSummary} onClick={() => openPopup('transport')} />
                    )}
                    {showNoteRow && (
                        <ExtraRow tint={TINT_AMBER} icon={noteIcon} title="Note" subtitle={narration} onClick={() => openPopup('note')} />
                    )}
                    {hasDiscountExtra && (
                        <ExtraRow tint={TINT_GREEN} icon={discountTaxIcon} title="Bill discount & tax" subtitle={discountRowSummary} onClick={() => openPopup('discount')} />
                    )}
                </div>
            )}
            {anyAddChip && (
                <div className="flex flex-wrap gap-2">
                    {showPartyExtras && !hasGst && <AddChip label="GST & address" onClick={() => openPopup('gst')} />}
                    {showTransportExtra && !hasTransportDetails && <AddChip label="Transport details" onClick={() => openPopup('transport')} />}
                    {!hasDiscountExtra && <AddChip label="Bill discount & tax" onClick={() => openPopup('discount')} />}
                    {showNoteExtra && !narration && <AddChip label="Note" onClick={() => openPopup('note')} />}
                    {showExpenseExtra && !hasExpense && <AddChip label="Shop expense" onClick={() => openPopup('expense')} />}
                </div>
            )}
        </>
    );

    // --- POP-UPS ---
    const popups = (
        <>
            {showGstAddressModal && showPartyExtras && (
                <PopupDialog
                    tint={TINT_BLUE}
                    icon={gstIcon}
                    title="GST & address"
                    subtitle="Printed on this bill for the customer"
                    onCancel={() => cancelPopup('gst')}
                    onSave={closePopups}
                    onRemove={hasGst ? removeGstPopup : undefined}
                >
                    {isSale && enableShippingDetails && (
                        <div className={`${SEG_WRAP} justify-self-start`} role="group">
                            <button type="button" onClick={() => setAddressType('billing')} aria-pressed={addressType === 'billing'} className={`h-7 px-3 rounded-sm text-xs font-medium transition-all ${addressType === 'billing' ? SEG_ON : SEG_OFF}`}>Billing</button>
                            <button type="button" onClick={() => setAddressType('shipping')} aria-pressed={addressType === 'shipping'} className={`h-7 px-3 rounded-sm text-xs font-medium transition-all ${addressType === 'shipping' ? SEG_ON : SEG_OFF}`}>Shipping</button>
                        </div>
                    )}
                    <div>
                        <span className={LABEL_CLS}>GSTIN</span>
                        <input type="text" placeholder="15 characters" maxLength={15} value={curGST} onChange={(e) => changeGstin(e.target.value)} className={FIELD_CLS} />
                    </div>
                    <div>
                        <span className={LABEL_CLS}>Full address</span>
                        <input type="text" placeholder="Full address" value={curAddress} onChange={(e) => { if (addressType === 'billing') { setPartyAddress(e.target.value); } else { setShippingAddress(e.target.value); setIsSameAsBilling(false); } }} className={FIELD_CLS} />
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                        <div>
                            <span className={LABEL_CLS}>State</span>
                            <select value={curState} onChange={(e) => { if (addressType === 'billing') { setPartyState(e.target.value); } else { setShippingState(e.target.value); setIsSameAsBilling(false); } }} className={FIELD_CLS}>
                                <option value="">State</option>
                                {INDIAN_STATES.map(state => (<option key={state} value={state}>{state}{GST_STATE_CODES[state] ? ` (${GST_STATE_CODES[state]})` : ''}</option>))}
                            </select>
                        </div>
                        <div>
                            <span className={LABEL_CLS}>PIN</span>
                            <input type="text" inputMode="numeric" maxLength={6} placeholder="PIN" value={curPin} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); if (addressType === 'billing') { setPartyPinCode(v); } else { setShippingPinCode(v); setIsSameAsBilling(false); } }} className={FIELD_CLS} />
                        </div>
                    </div>
                    <div className="text-xs text-[#5b6b86]">State filled from GSTIN — IGST vs CGST+SGST is set automatically.</div>
                </PopupDialog>
            )}

            {showExpenseModal && showExpenseExtra && (
                <PopupDialog
                    tint={TINT_MAGENTA}
                    icon={expenseIcon}
                    title="Shop expense"
                    subtitle="Added to this bill"
                    onCancel={() => cancelPopup('expense')}
                    onSave={saveExpensePopup}
                    saveLabel={parsedExpense > 0 ? `Save expense · ₹${fmtShort(parsedExpense)}` : 'Save expense'}
                >
                    {expenses.map((expense, idx) => (
                        <div key={expense.id} className="grid grid-cols-[minmax(0,1fr)_110px_32px] items-end gap-2">
                            <div>
                                {idx === 0 && <span className={LABEL_CLS}>What for</span>}
                                <input type="text" placeholder="Expense name" value={expense.name} onChange={(e) => setExpenses(prev => prev.map(ex => ex.id === expense.id ? { ...ex, name: e.target.value } : ex))} className={FIELD_CLS} />
                            </div>
                            <div>
                                {idx === 0 && <span className={LABEL_CLS}>Amount</span>}
                                <div className="flex items-center gap-1 h-10 px-2.5 rounded-sm border border-[#7a8aa3] bg-white focus-within:border-[#155dfc] focus-within:ring-2 focus-within:ring-[#155dfc]/20">
                                    <i className="not-italic text-[#5b6b86] text-sm">₹</i>
                                    <input type="number" placeholder="0" value={expense.amount} onChange={(e) => setExpenses(prev => prev.map(ex => ex.id === expense.id ? { ...ex, amount: parseFloat(e.target.value) || '' } : ex))} className="w-full min-w-0 text-right text-sm font-semibold text-[#0f172b] bg-transparent outline-none tabular-nums placeholder:font-normal placeholder:text-[#5b6b86] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                                </div>
                            </div>
                            <button type="button" onClick={() => setExpenses(prev => prev.filter(ex => ex.id !== expense.id))} aria-label="Remove expense" className="w-8 h-10 grid place-items-center rounded-sm text-[#5b6b86] hover:bg-[#ffeef0] hover:text-[#d5000c] transition-colors"><CloseIcon size={16} /></button>
                        </div>
                    ))}
                    <button type="button" onClick={() => setExpenses(prev => [...prev, { id: Date.now(), name: '', amount: '' }])} className={BTN_TEXT_PRIMARY}>
                        <SvgIcon size={14}><path d="M12 5v14M5 12h14" /></SvgIcon>
                        Add another expense
                    </button>
                </PopupDialog>
            )}

            {showNarrationModal && showNoteExtra && (
                <PopupDialog
                    tint={TINT_AMBER}
                    icon={noteIcon}
                    title="Note"
                    subtitle="Shows on this bill"
                    onCancel={() => cancelPopup('note')}
                    onSave={closePopups}
                    saveLabel="Save note"
                >
                    <div>
                        <span className={LABEL_CLS}>Note on bill</span>
                        <textarea placeholder="e.g. Delivered to shop, 2 bags" value={narration} onChange={(e) => setNarration(e.target.value)} className="w-full p-3 text-sm leading-[21px] text-[#0f172b] placeholder:text-[#5b6b86] rounded-sm border border-[#7a8aa3] bg-white outline-none focus:border-[#155dfc] focus:ring-2 focus:ring-[#155dfc]/20 resize-none" rows={3} autoFocus />
                    </div>
                </PopupDialog>
            )}

            {showTransportModal && showTransportExtra && (
                <PopupDialog
                    tint={TINT_BLUE}
                    icon={transportIcon}
                    title="Transport details"
                    subtitle="Shown on the invoice"
                    onCancel={() => cancelPopup('transport')}
                    onSave={closePopups}
                    onRemove={hasTransportDetails ? clearTransportPopup : undefined}
                >
                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <label className={LABEL_CLS}>Transport name</label>
                            <input type="text" value={transportName} onChange={(e) => setTransportName(e.target.value)} placeholder="e.g. DP World Express Logistic" className={FIELD_CLS} />
                        </div>
                        <div>
                            <label className={LABEL_CLS}>GR/RR no.</label>
                            <input type="text" value={grRrNo} onChange={(e) => setGrRrNo(e.target.value)} className={FIELD_CLS} />
                        </div>
                        <div>
                            <label className={LABEL_CLS}>GR/RR date</label>
                            <input type="date" value={grRrDate} onChange={(e) => setGrRrDate(e.target.value)} className={FIELD_CLS} />
                        </div>
                        <div>
                            <label className={LABEL_CLS}>Vehicle no.</label>
                            <input type="text" value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} className={FIELD_CLS} />
                        </div>
                        <div>
                            <label className={LABEL_CLS}>PIN code</label>
                            <input type="text" maxLength={6} inputMode="numeric" value={pinCode} onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className={FIELD_CLS} />
                        </div>
                        <div className="col-span-2">
                            <label className={LABEL_CLS}>Station / from place</label>
                            <input type="text" value={stationFrom} onChange={(e) => setStationFrom(e.target.value)} className={FIELD_CLS} />
                        </div>
                    </div>
                </PopupDialog>
            )}

            {showDiscountTaxModal && (
                <PopupDialog
                    tint={TINT_GREEN}
                    icon={discountTaxIcon}
                    title="Bill discount & tax"
                    subtitle="Applies to the whole bill"
                    onCancel={() => cancelPopup('discount')}
                    onSave={closePopups}
                    saveLabel="Apply"
                >
                    <div
                        className="cursor-pointer"
                        onMouseDown={handleDiscountPressStart}
                        onMouseUp={handleDiscountPressEnd}
                        onMouseLeave={handleDiscountPressEnd}
                        onTouchStart={handleDiscountPressStart}
                        onTouchEnd={handleDiscountPressEnd}
                        onClick={handleDiscountClick}
                    >
                        <div className="flex items-center gap-1.5 mb-1">
                            <span className={`text-xs font-medium ${isDiscountLocked ? 'text-[#45556c]' : 'text-[#155dfc]'}`}>Bill discount</span>
                            {isDiscountLocked && lockIcon}
                            {discountInfo && (
                                <span className="text-[10px] text-[#d5000c] bg-[#ffeef0] px-1.5 rounded animate-pulse">{discountInfo}</span>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <div className={`${DISC_BOX} ${isDiscountLocked ? 'bg-[#f5f7ff]' : 'bg-white'}`}>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={discountPercent || ''}
                                    onChange={handleDiscountPercentChange}
                                    readOnly={isDiscountLocked}
                                    className={`w-full min-w-0 text-sm text-[#0f172b] bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${isDiscountLocked ? 'cursor-not-allowed' : 'font-semibold'}`}
                                />
                                <i className="not-italic text-[#5b6b86] text-sm">%</i>
                            </div>
                            <div className={`${DISC_BOX} ${isDiscountLocked ? 'bg-[#f5f7ff]' : 'bg-white'}`}>
                                <i className="not-italic text-[#5b6b86] text-sm">₹</i>
                                <input
                                    id="discount"
                                    type="number"
                                    placeholder="0"
                                    value={discount || ''}
                                    onChange={handleDiscountAmountChange}
                                    readOnly={isDiscountLocked}
                                    className={`w-full min-w-0 text-right text-sm text-[#0f172b] bg-transparent outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${isDiscountLocked ? 'cursor-not-allowed' : 'font-semibold'}`}
                                />
                            </div>
                        </div>
                        <div className="text-xs text-[#5b6b86] mt-1">{isDiscountLocked ? 'Press and hold to edit.' : 'Type either — the other fills in.'}</div>
                    </div>

                    <div>
                        <span className={LABEL_CLS}>GST on prices</span>
                        <div className={SEG_WRAP} role="group">
                            {(['exempt', 'inclusive', 'exclusive'] as const).map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => onTaxModeChange && onTaxModeChange(m)}
                                    disabled={isTaxToggleLocked}
                                    aria-pressed={taxMode === m}
                                    className={`flex-1 h-9 rounded-sm text-sm font-medium transition-all ${taxMode === m ? SEG_ON : SEG_OFF} ${isTaxToggleLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                    {m.charAt(0).toUpperCase() + m.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-between items-baseline px-3 py-2.5 rounded-sm bg-[#f5f7ff] text-[13px] text-[#45556c]">
                        <span>To collect</span>
                        <b className="text-lg font-semibold text-[#0f172b] tabular-nums">₹{fmt(netPayable)}</b>
                    </div>
                </PopupDialog>
            )}
        </>
    );

    return createPortal(
        <div
            className="fixed inset-0 z-[99] flex items-end justify-center md:items-stretch md:justify-end overscroll-none"
            onClick={onClose}
            onTouchMove={(e) => e.preventDefault()}
        >
            <div className="absolute inset-0 bg-[#020618]/45 transition-opacity" />

            {modal && <div className="absolute z-[10000]" onClick={(e) => e.stopPropagation()}><Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} /></div>}
            {pendingReturnAmount !== null && (
                <div className="absolute z-[10000]" onClick={(e) => e.stopPropagation()}>
                    <Modal
                        message={`You have returned ₹${pendingReturnAmount.toFixed(2)} to the customer. I confirm.`}
                        type={State.WARNING}
                        showConfirmButton
                        onClose={() => setPendingReturnAmount(null)}
                        onConfirm={() => { setPendingReturnAmount(null); void proceedWithSave(); }}
                    />
                </div>
            )}

            {/* Pop-ups (GST & address, Shop expense, Note, Transport, Bill discount & tax) */}
            {popups}

            <div className="relative w-full max-w-lg md:max-w-[760px] bg-white rounded-sm md:rounded-none shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] max-h-[90dvh] md:max-h-none md:h-full flex flex-col transform transition-transform duration-300 ease-out animate-slide-up" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-5 md:px-6 py-3 md:py-4 bg-white rounded-sm md:rounded-none border-b border-[#dfe6fb] sticky top-0 z-10 flex items-center justify-between">
                    <div className="w-10 h-1 bg-[#dfe6fb] rounded-full absolute top-1.5 left-1/2 -translate-x-1/2 md:hidden"></div>
                    <div className="mt-2 md:mt-0">
                        <h2 className="text-lg md:text-xl font-semibold text-[#0f172b] leading-tight">Take payment</h2>
                        {totalQuantity > 0 && (
                            <div className="text-xs text-[#5b6b86]">{totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}</div>
                        )}
                    </div>
                    <button onClick={onClose} aria-label="Close" className="w-10 h-10 mt-2 md:mt-0 grid place-items-center rounded-sm text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b] transition-colors">
                        <CloseIcon size={20} />
                    </button>
                </div>

                {/* MIDDLE SECTION */}
                <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden bg-white flex flex-col md:flex-row">

                    {/* LEFT COLUMN: Allocation, Payment methods, Customer */}
                    <div className="shrink-0 md:shrink md:flex-1 md:min-w-0 md:overflow-y-auto px-4 py-4 md:px-6 md:py-5 grid grid-cols-1 auto-rows-max gap-3.5 content-start">

                        {/* To collect (mobile only — desktop shows it in the right column) */}
                        <div className="md:hidden flex justify-between items-baseline">
                            <span className="text-sm text-[#45556c]">To collect</span>
                            <b className="text-[28px] leading-9 font-semibold tracking-tight text-[#0f172b] tabular-nums">₹{fmt(netPayable)}</b>
                        </div>

                        {/* Allocation bar */}
                        <div className="grid gap-1.5">
                            <div className="flex justify-between items-baseline gap-2 text-[13px]">
                                <span className="text-[#45556c]">Allocated <b className="text-[#0f172b]">₹{fmt(totalPaymentReceived)}</b> of ₹{fmt(netPayable)}</span>
                                {changeToReturn > 0.01 ? (
                                    <span className="text-[#0f172b]">Return <b className="text-[#bb4d00]">₹{fmt(changeToReturn)}</b></span>
                                ) : pendingAmount > 0.01 ? (
                                    <span className="text-[#0f172b]">Left <b className="text-[#bb4d00]">₹{fmt(pendingAmount)}</b></span>
                                ) : (
                                    <b className="inline-flex items-center gap-1 text-[#008236]">
                                        <SvgIcon size={14}><path d="M5 12.5l4.5 4.5L19 7" /></SvgIcon>
                                        Fully allocated
                                    </b>
                                )}
                            </div>
                            <div className="h-2 rounded-full bg-[#f5f7ff] overflow-hidden flex">
                                {allocationSegments.map(s => (
                                    <b key={s.key} className="block h-full transition-all duration-200" style={{ width: `${segPct(s.amount)}%`, background: s.color }} />
                                ))}
                            </div>
                        </div>

                        {/* Payment method rows */}
                        <div className="grid gap-2">
                            {transactiontypes.map((tx) => {
                                const isDueField = tx.id.toLowerCase().includes('due') || tx.name.toLowerCase().includes('due');
                                const isDisabled = isPurchaseReturnMode ? false : (isSale && isDueField && !allowDueBilling);
                                const ui = PAYMENT_UI[tx.id] || PAYMENT_UI_FALLBACK;
                                const amount = selectedPayments[tx.id] || 0;
                                const showFill = pendingAmount > 0.01 && !isDisabled;

                                return (
                                    <div
                                        key={tx.id}
                                        className={`grid grid-cols-[auto_minmax(0,1fr)_108px_64px] md:grid-cols-[auto_minmax(0,1fr)_132px_84px] items-center gap-2 md:gap-2.5 px-2.5 py-2 rounded-sm border border-[#dfe6fb] transition-shadow ${isDisabled
                                            ? 'bg-[#f5f7ff] opacity-60'
                                            : 'bg-white focus-within:border-[#155dfc] focus-within:shadow-[0_0_0_3px_#e6eeff]'}`}
                                    >
                                        <span className={`w-8 h-8 grid place-items-center rounded-sm ${ui.tint}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ui.icon}</svg>
                                        </span>
                                        <label htmlFor={tx.id} className="min-w-0 font-medium text-sm text-[#0f172b] cursor-pointer">
                                            <span className="block truncate">{tx.name}</span>
                                            <small className="block truncate text-[11px] leading-[15px] font-normal text-[#5b6b86]">
                                                {isDisabled ? 'Not available' : tx.description}
                                            </small>
                                        </label>
                                        <div className="flex items-center gap-1 h-10 px-2.5 rounded-sm border border-[#7a8aa3] bg-white">
                                            <i className="not-italic text-[#5b6b86] text-sm">₹</i>
                                            <input
                                                id={tx.id}
                                                type="number"
                                                inputMode="decimal"
                                                step="any"
                                                placeholder="0"
                                                disabled={isDisabled}
                                                value={selectedPayments[tx.id]?.toString() || ''}
                                                onChange={(e) => { if (!isDisabled) handleAmountChange(tx.id, e.target.value); }}
                                                className="w-full min-w-0 text-right text-sm font-semibold text-[#0f172b] bg-transparent outline-none tabular-nums placeholder:font-normal placeholder:text-[#5b6b86] disabled:cursor-not-allowed [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                            />
                                        </div>
                                        <div className="flex justify-end">
                                            {amount > 0 && !isDisabled ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleAmountChange(tx.id, '0')}
                                                    aria-label={`Clear ${tx.name}`}
                                                    className="w-8 h-8 grid place-items-center rounded-sm text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b] transition-colors"
                                                >
                                                    <CloseIcon size={16} />
                                                </button>
                                            ) : showFill ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleFillRemaining(tx.id)}
                                                    className="w-full h-8 px-2 rounded-sm border border-[#7a8aa3] bg-white hover:bg-[#f5f7ff] text-[13px] font-medium text-[#0f172b] whitespace-nowrap overflow-hidden text-ellipsis transition-colors"
                                                >
                                                    Fill<span className="hidden md:inline"> ₹{fmtShort(pendingAmount)}</span>
                                                </button>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Customer info */}
                        {enableCustomerDetails && (
                            <>
                                {!isCalculator && (
                                    <div className="flex justify-between items-center gap-2 pt-1">
                                        <div className={OVERLINE_CLS}>{partyLabel}{dueEntered > 0 && <span className="normal-case tracking-normal font-normal text-[#bb4d00]"> · required for due</span>}</div>
                                        {isSale && enableShippingDetails && (
                                            <div className={SEG_WRAP} role="group">
                                                <button onClick={() => setAddressType('billing')} aria-pressed={addressType === 'billing'} className={`h-7 px-3 rounded-sm text-xs font-medium transition-all ${addressType === 'billing' ? SEG_ON : SEG_OFF}`}>Billing</button>
                                                <button onClick={() => setAddressType('shipping')} aria-pressed={addressType === 'shipping'} className={`h-7 px-3 rounded-sm text-xs font-medium transition-all ${addressType === 'shipping' ? SEG_ON : SEG_OFF}`}>Shipping</button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!isCalculator && isSale && enableShippingDetails && addressType === 'shipping' && (
                                    <div className="flex items-center justify-end animate-in fade-in slide-in-from-top-1">
                                        <label className="flex items-center gap-2 cursor-pointer bg-[#e6eeff] px-3 py-1.5 rounded-sm">
                                            <input type="checkbox" checked={isSameAsBilling} onChange={(e) => { const isChecked = e.target.checked; setIsSameAsBilling(isChecked); if (!isChecked) { setShippingName(''); setShippingNumber(''); setShippingAddress(''); setShippingGST(''); setShippingPinCode(''); } }} className="w-4 h-4 accent-[#155dfc] rounded cursor-pointer" />
                                            <span className="text-xs font-medium text-[#155dfc]">Same as billing details</span>
                                        </label>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-2 md:gap-3 relative animate-in fade-in slide-in-from-top-2">
                                    <div ref={numberInputRef} className={`relative ${mode === 'purchase' ? 'order-2' : 'order-1'}`}>
                                        <label className={`flex items-center gap-2 h-10 px-3 rounded-sm border bg-white text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc] ${requireCustomerMobile && !partyNumber && addressType === 'billing' ? 'border-[#d5000c]' : 'border-[#7a8aa3]'}`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2" /></svg>
                                            <input
                                                type="tel"
                                                maxLength={mode === 'purchase' ? undefined : 10}
                                                placeholder={requireCustomerMobile ? "Phone number *" : "Phone number"}
                                                value={addressType === 'billing' ? partyNumber : shippingNumber}
                                                onChange={(e) => {
                                                    const val = e.target.value.replace(/\D/g, '');
                                                    const finalVal = mode === 'purchase' ? val : val.slice(0, 10);

                                                    if (addressType === 'billing') { handleInputChange(finalVal, 'number'); }
                                                    else { setShippingNumber(finalVal); setIsSameAsBilling(false); }
                                                }}
                                                onFocus={() => {
                                                    setActiveSearchField('number');
                                                    if (isSale && addressType === 'billing' && partyNumber.length >= 3) searchParty(partyNumber, 'number');
                                                }}
                                                className="flex-1 min-w-0 border-0 outline-none bg-transparent text-sm text-[#0f172b] placeholder:text-[#5b6b86]"
                                                autoComplete="off"
                                            />
                                        </label>
                                    </div>

                                    <div ref={nameInputRef} className={`relative ${mode === 'purchase' ? 'order-1' : 'order-2'}`}>
                                        <label className="flex items-center gap-2 h-10 px-3 rounded-sm border border-[#7a8aa3] bg-white text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc]">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                                            <input
                                                type="text"
                                                placeholder={requireCustomerName ? `${partyLabel} name *` : `${partyLabel} name`}
                                                value={addressType === 'billing' ? partyName : shippingName}
                                                onChange={(e) => {
                                                    if (addressType === 'billing') { handleInputChange(e.target.value, 'name'); }
                                                    else { setShippingName(e.target.value); setIsSameAsBilling(false); }
                                                }}
                                                onFocus={() => {
                                                    setActiveSearchField('name');
                                                    if (addressType === 'billing' && partyName.length >= 3) searchParty(partyName, 'name');
                                                }}
                                                className="flex-1 min-w-0 border-0 outline-none bg-transparent text-sm text-[#0f172b] placeholder:text-[#5b6b86]"
                                                autoComplete="off"
                                            />
                                        </label>
                                    </div>
                                    {addressType === 'billing' && renderSuggestions()}
                                </div>

                                {dueEntered > 0 && !dueNeedsParty && (
                                    <div className="flex items-start gap-2 p-2.5 rounded-sm bg-[#e6eeff] text-[#155dfc] text-xs font-medium">
                                        <SvgIcon size={16}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></SvgIcon>
                                        <span>₹{fmt(dueEntered)} will be added to {partyName.trim() || (partyNumber.trim() ? `${partyLabel.toLowerCase()} ${partyNumber.trim()}` : `this ${partyLabel.toLowerCase()}`)}&apos;s due.</span>
                                    </div>
                                )}

                                {dueNeedsParty && (
                                    <div className="flex items-start gap-2 p-2.5 rounded-sm bg-[#fff3dd] text-[#bb4d00] text-xs font-medium">
                                        <SvgIcon size={16}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></SvgIcon>
                                        <span>{dueRequirementText}</span>
                                    </div>
                                )}

                                {extrasBlock}

                                {/* Available Balances */}
                                {(partyCredit > 0 || partyDebit > 0) && (
                                    <div className="grid gap-2">
                                        <div className={OVERLINE_CLS}>Available balances</div>
                                        {partyCredit > 0 && (
                                            <label className="flex items-center gap-3 p-2.5 bg-white border border-[#dfe6fb] rounded-sm cursor-pointer">
                                                <span className="w-8 h-8 grid place-items-center rounded-sm bg-[#e9faef] text-[#008236] flex-none">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
                                                </span>
                                                <span className="flex-1 min-w-0 text-sm font-medium text-[#0f172b]">
                                                    Credit note
                                                    <small className="block text-[11px] leading-[15px] font-normal text-[#5b6b86]">Available ₹{partyCredit.toFixed(2)}</small>
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    <input type="checkbox" checked={useCredit} onChange={(e) => setUseCredit(e.target.checked)} className="w-4 h-4 accent-[#155dfc] rounded cursor-pointer" />
                                                    <span className="text-sm font-medium text-[#45556c]">Apply</span>
                                                </span>
                                            </label>
                                        )}
                                        {partyDebit > 0 && (
                                            <label className="flex items-center gap-3 p-2.5 bg-white border border-[#dfe6fb] rounded-sm cursor-pointer">
                                                <span className="w-8 h-8 grid place-items-center rounded-sm bg-[#ffeef0] text-[#d5000c] flex-none">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
                                                </span>
                                                <span className="flex-1 min-w-0 text-sm font-medium text-[#0f172b]">
                                                    Debit balance
                                                    <small className="block text-[11px] leading-[15px] font-normal text-[#5b6b86]">Available ₹{partyDebit.toFixed(2)}</small>
                                                </span>
                                                <span className="flex items-center gap-2">
                                                    <input type="checkbox" checked={useDebit} onChange={(e) => setUseDebit(e.target.checked)} className="w-4 h-4 accent-[#d5000c] rounded cursor-pointer" />
                                                    <span className="text-sm font-medium text-[#45556c]">Apply</span>
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                )}
                            </>
                        )}

                        {/* Extras fallback when customer details are disabled (keeps Bill discount & tax reachable) */}
                        {!enableCustomerDetails && extrasBlock}
                    </div>

                    {/* RIGHT COLUMN (desktop): To collect, summary, discount & tax, confirm */}
                    <aside className="hidden md:flex md:w-80 md:flex-none flex-col gap-3.5 p-5 bg-[#f5f7ff] border-l border-[#dfe6fb] overflow-y-auto [&>*]:shrink-0">
                        <div className="flex flex-col items-start">
                            <span className="text-sm text-[#45556c]">To collect</span>
                            <b className="text-[28px] leading-9 font-semibold tracking-tight text-[#0f172b] tabular-nums">₹{fmt(netPayable)}</b>
                        </div>

                        <SummaryRows rows={summaryRows} />

                        <div className="mt-auto grid gap-2.5 pt-3 border-t border-[#dfe6fb]">
                            {billOptions}
                            <div className={`text-center text-xs font-medium ${statusColor}`}>{statusText}</div>
                            <button
                                onClick={handleConfirm}
                                disabled={isSubmitting || pendingAmount > 0.01}
                                className={`${confirmBtnCls} h-[52px]`}
                            >
                                {confirmContent}
                            </button>
                        </div>
                    </aside>
                </div>

                {/* MOBILE FOOTER: hint + confirm */}
                <div className="md:hidden px-4 pt-3 pb-4 bg-white border-t border-[#dfe6fb] shadow-[0_-4px_15px_rgba(21,48,140,0.06)] z-20 grid gap-2">
                    {billOptions}
                    {(pendingAmount > 0.01 || changeToReturn > 0.01) && (
                        <div className={`text-center text-xs font-medium ${statusColor}`}>{statusText}</div>
                    )}
                    <button onClick={handleConfirm} disabled={isSubmitting || pendingAmount > 0.01} className={`${confirmBtnCls} h-[52px]`}>
                        {confirmContentMobile}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PaymentDrawer;