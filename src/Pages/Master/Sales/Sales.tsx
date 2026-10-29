import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '../../../lib/Firebase';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import type { PaymentCompletionData } from '../../../Components/PaymentDrawer';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useDatabase } from '../../../context/auth-context';
import { ROUTES } from '../../../constants/routes.constants';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import BarcodeScanner from '../../../UseComponents/BarcodeScanner';
import PaymentDrawer from '../../../Components/PaymentDrawer';
import { Modal } from '../../../constants/Modal';
import { Permissions, ROLES, State, Variant } from '../../../enums';
import { CustomButton } from '../../../Components';
import { useSalesSettings } from '../../../context/SettingsContext';
import { Spinner } from '../../../constants/Spinner';
import { ItemEditDrawer } from '../../../Components/ItemDrawer';
import { GenericCartList } from '../../../Components/CartItem';
import BarcodeLinkModal from '../../../Components/BarcodeLinkModal';
import { AddUserModal } from '../../../Components/AddUserModal';
import { FiTrash2, FiX, FiEdit, FiCamera, FiDelete, FiSearch, FiChevronLeft, FiMoreVertical, FiCalendar, FiCheck, FiUser, FiUserPlus, FiChevronUp, FiChevronRight, FiMinus, FiSliders } from 'react-icons/fi';
import { GenericBillFooter } from '../../../Components/Footer';
import { CartLinesCompact } from '../../../Components/CartLinesCompact';
import { IconScanCircle, IconPrint } from '../../../constants/Icons';
import QRCode from 'react-qr-code';
import { FiSend } from 'react-icons/fi';
import CalcDisplay from '../../../Components/CalcDisplay';
import { useWhatsappProvider } from '../../Additional/Whatsapp/useWhatsappProvider';
import type { SalesItem } from './sales.types';
import { TierPickerModal } from '../../../Components/TierPickerModal';
import { hasMultiplePricing } from '../../utils/pricingUtils';
import type { Item } from '../../../constants/models';
import { applyRounding, calculateSaleTotals } from './sales.calculations';
import {
    useSalesCalculator,
    useSalesCart,
    useSalesCatalogueAndSettings,
    useSalesCommunication,
    useSalesPayment,
} from './hooks';

export type { SalesItem };

// Inside Sales component, add interface and button data
interface CalcKey {
    label: string;
    value: string;
    type: 'number' | 'operator' | 'function';
    icon?: React.ElementType;
    colClass?: string;
}

const calcKeys: CalcKey[][] = [
    // Row 1: %, -, delete
    [
        { label: '%', value: '%', type: 'operator', colClass: 'col-span-2' },
        { label: '-', value: '-', type: 'operator', colClass: 'col-span-2' },
        { label: '', value: 'Backspace', type: 'function', icon: FiDelete, colClass: 'col-span-4' }
    ],

    // Row 2: 1,2,3,*
    [
        { label: '1', value: '1', type: 'number', colClass: 'col-span-2' },
        { label: '2', value: '2', type: 'number', colClass: 'col-span-2' },
        { label: '3', value: '3', type: 'number', colClass: 'col-span-2' },
        { label: '×', value: '*', type: 'operator', colClass: 'col-span-2' }
    ],

    // Row 3: 4,5,6,+
    [
        { label: '4', value: '4', type: 'number', colClass: 'col-span-2' },
        { label: '5', value: '5', type: 'number', colClass: 'col-span-2' },
        { label: '6', value: '6', type: 'number', colClass: 'col-span-2' },
        { label: '+', value: '+', type: 'operator', colClass: 'col-span-2' }
    ],

    // Row 4: 7,8,9,.
    [
        { label: '7', value: '7', type: 'number', colClass: 'col-span-2' },
        { label: '8', value: '8', type: 'number', colClass: 'col-span-2' },
        { label: '9', value: '9', type: 'number', colClass: 'col-span-2' },
        { label: '.', value: '.', type: 'number', colClass: 'col-span-2' }
    ],

    // Row 5: 0,00
    [
        { label: '0', value: '0', type: 'number', colClass: 'col-span-4' },
        { label: '00', value: '00', type: 'number', colClass: 'col-span-4' }
    ]
];

// ── SELLAR design tokens (Tailwind arbitrary values) ──
const SHADOW_FLOAT = 'shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]';
const LABEL_CLS = 'text-[11px] font-semibold tracking-[.08em] uppercase text-[#5b6b86]';

const chipCls = (active: boolean) =>
    `inline-flex items-center h-[34px] px-3.5 rounded-full border text-[13px] font-medium whitespace-nowrap flex-shrink-0 cursor-pointer transition-colors ${active
        ? 'bg-[#0f172b] border-[#0f172b] text-white'
        : 'bg-white border-[#7a8aa3] text-[#45556c] hover:bg-[#f5f7ff]'
    }`;

const FIELD_CLS =
    'w-full h-12 md:h-[52px] pl-11 pr-10 bg-white border border-[#7a8aa3] rounded-sm text-[15px] font-medium text-[#0f172b] placeholder:text-[#5b6b86] outline-none transition-all focus:border-[#155dfc] focus:ring-4 focus:ring-[#e6eeff]';

const SCAN_BTN_CLS =
    'inline-flex items-center justify-center gap-2 h-12 md:h-[52px] w-12 md:w-auto md:px-4 flex-shrink-0 rounded-sm text-sm font-medium transition-colors bg-[#155dfc] text-white hover:bg-[#1447e6] md:bg-white md:text-[#0f172b] md:border md:border-[#7a8aa3] md:hover:bg-[#f5f7ff]';

const POPUP_INPUT_CLS =
    'w-full h-10 px-3 text-sm rounded-sm border border-[#7a8aa3] bg-white text-[#0f172b] placeholder:text-[#5b6b86] outline-none focus:border-[#155dfc] focus:ring-4 focus:ring-[#e6eeff]';

const SORT_OPTIONS = [
    { value: 'az', label: 'A → Z' },
    { value: 'za', label: 'Z → A' },
    { value: 'price_asc', label: 'Price ↑' },
    { value: 'price_desc', label: 'Price ↓' },
] as const;
interface CustomerSuggestion {
    name: string;
    number: string;
    creditBalance?: number;
}
const Sales: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser, loading: authLoading, hasPermission } = useAuth();
    const { provider: whatsappProvider } = useWhatsappProvider(currentUser?.companyId);
    const dbOperations = useDatabase();
    const { salesSettings: rawSettings, loadingSettings } = useSalesSettings();

    const invoiceToEdit = location.state?.invoiceData;
    const isEditMode = location.state?.isEditMode === true && !!invoiceToEdit;
    // "Add bill" from the party ledger opens a new bill with the customer filled in.
    const prefillParty = (location.state as { prefillParty?: { name: string; number: string } } | null)?.prefillParty;

    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [tierPickerItem, setTierPickerItem] = useState<Item | null>(null);

    // Customer — popup se fill hota hai, payment drawer ko starting details milti hain
    const [customerName, setCustomerName] = useState(prefillParty?.name ?? '');
    const [customerPhone, setCustomerPhone] = useState(prefillParty?.number ?? '');
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [customerDraft, setCustomerDraft] = useState({ name: '', phone: '' });
    // Customer popup suggestions (same behaviour as PaymentDrawer)
    const [customerSuggestions, setCustomerSuggestions] = useState<CustomerSuggestion[]>([]);
    const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
    const [activeSuggestField, setActiveSuggestField] = useState<'name' | 'number'>('number');
    const customerSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const customerPhoneWrapRef = useRef<HTMLDivElement>(null);
    const customerNameWrapRef = useRef<HTMLDivElement>(null);
    const customerSuggestionsRef = useRef<HTMLDivElement>(null);
    const closeCustomerModal = () => {
        setShowCustomerModal(false);
        setShowCustomerSuggestions(false);
        setCustomerSuggestions([]);
    };

    const openCustomerModal = () => {
        setCustomerDraft({ name: customerName, phone: customerPhone });
        setCustomerSuggestions([]);
        setShowCustomerSuggestions(false);
        setShowCustomerModal(true);
    };

    const saveCustomer = () => {
        const phone = customerDraft.phone.replace(/\D/g, '');
        if (phone && phone.length !== 10) {
            setModal({ message: 'Customer phone number must be exactly 10 digits.', type: State.ERROR });
            return;
        }
        setCustomerName(customerDraft.name.trim());
        setCustomerPhone(phone);
        closeCustomerModal();
    };

    const searchCustomer = async (term: string, field: 'name' | 'number') => {
        if (!term || term.length < 2 || !currentUser?.companyId) {
            setCustomerSuggestions([]);
            setShowCustomerSuggestions(false);
            return;
        }
        const partyRef = collection(db, 'companies', currentUser.companyId, 'customers');
        const termLower = term.toLowerCase();
        const termCap = termLower.charAt(0).toUpperCase() + termLower.slice(1);

        try {
            const queries = [
                getDocs(query(partyRef, where(field, '>=', termLower), where(field, '<=', termLower + '\uf8ff'), limit(5))),
            ];
            if (field === 'name' && termCap !== termLower) {
                queries.push(
                    getDocs(query(partyRef, where(field, '>=', termCap), where(field, '<=', termCap + '\uf8ff'), limit(5)))
                );
            }
            const snapshots = await Promise.all(queries);
            const map = new Map<string, CustomerSuggestion>();
            snapshots.forEach(snap => snap.forEach(d => {
                if (!map.has(d.id)) {
                    const data = d.data();
                    map.set(d.id, {
                        name: data.name || '',
                        number: data.number || d.id,
                        creditBalance: data.creditBalance,
                    });
                }
            }));
            const results = Array.from(map.values());
            setCustomerSuggestions(results);
            setShowCustomerSuggestions(results.length > 0);
        } catch (err) {
            console.error(err);
        }
    };

    const handleCustomerDraftChange = (value: string, field: 'name' | 'number') => {
        setActiveSuggestField(field);
        if (field === 'name') setCustomerDraft(d => ({ ...d, name: value }));
        else setCustomerDraft(d => ({ ...d, phone: value }));

        if (customerSearchTimeout.current) clearTimeout(customerSearchTimeout.current);
        customerSearchTimeout.current = setTimeout(() => searchCustomer(value, field), 400);
    };

    const selectCustomerSuggestion = (c: CustomerSuggestion) => {
        setCustomerDraft({ name: c.name, phone: (c.number || '').replace(/\D/g, '').slice(0, 10) });
        setShowCustomerSuggestions(false);
    };
    // Payment drawer me jo bhi fill ho, drawer band hone par yahan wapas dikhe
    const handleDrawerPartyChange = (name: string, number: string) => {
        setCustomerName(name);
        setCustomerPhone(number);
    };
    useEffect(() => {
        if (!showCustomerSuggestions) return;
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (
                customerSuggestionsRef.current?.contains(t) ||
                customerPhoneWrapRef.current?.contains(t) ||
                customerNameWrapRef.current?.contains(t)
            ) return;
            setShowCustomerSuggestions(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [showCustomerSuggestions]);
    // Edit mode me invoice ki party dikhani hai
    const customerDisplayName = isEditMode ? (invoiceToEdit?.partyName || '') : customerName;
    const customerDisplayPhone = isEditMode ? (invoiceToEdit?.partyNumber || '') : customerPhone;

    const {
        salesSettings,
        activeTaxMode, setActiveTaxMode,
        invoiceNumber, setInvoiceNumber,
        isInvoiceNumberManuallyEdited,
        invoiceDate, setInvoiceDate,
        availableItems, setAvailableItems,
        pageIsLoading,
        error,
        workers,
        selectedWorker, setSelectedWorker,
        settingsDocId,
        itemGroupMap,
    } = useSalesCatalogueAndSettings({
        currentUser,
        authLoading,
        dbOperations,
        rawSettings,
        loadingSettings,
        isEditMode,
        invoiceToEdit,
    });

    const {
        items, setItems,
        longPressTimer,
        cartListRef,
        isDiscountLocked,
        discountInfo,
        isPriceLocked,
        priceInfo,
        duplicateItemPrompt, setDuplicateItemPrompt,
        isScannerOpen, setIsScannerOpen,
        barcodeToLink,
        isBarcodeLinkModalOpen,
        isLinkingBarcode,
        selectedCategory, setSelectedCategory,
        gridSearchQuery, setGridSearchQuery,
        setCartSearchQuery,
        sortOrder, setSortOrder,
        selectedItemForEdit,
        isItemDrawerOpen,
        showClearCartConfirm, setShowClearCartConfirm,
        categories,
        sortedGridItems,
        displayItems,
        addItemToCart,
        handleClearCart,
        handleConfirmClearCart,
        handleItemSelected,
        handleIncreaseExistingQuantity,
        handleAddAsNewLine,
        closeBarcodeLinkModal,
        handleLinkScannedBarcode,
        handleBarcodeScanned,
        handleQuantityChange,
        handleDeleteItem,
        handleDiscountPressStart,
        handleDiscountPressEnd,
        handleDiscountClick,
        handlePricePressStart,
        handlePricePressEnd,
        handlePriceClick,
        handleDiscountChange,
        handleDiscount2Change,
        handleCustomPriceChange,
        handleCustomPriceBlur,
        handleOpenEditDrawer,
        handleCloseEditDrawer,
        handleSaveSuccess,
    } = useSalesCart({
        salesSettings,
        loadingSettings,
        isEditMode,
        invoiceToEdit,
        pageIsLoading,
        availableItems,
        setAvailableItems,
        dbOperations,
        setModal,
        companyId: currentUser?.companyId,
    });
    const handleAddOrPickTier = (item: Item) => {
        if (hasMultiplePricing(item)) {
            setTierPickerItem(item);
        } else {
            addItemToCart(item);
        }
    };
    const handleItemSelectedWrapper = (item: Item | null) => {
        if (item && hasMultiplePricing(item)) {
            setTierPickerItem(item);
            return;
        }
        handleItemSelected(item);
    };
    const userRole = currentUser?.role || '';
    const isManager = userRole === ROLES.MANAGER || userRole === ROLES.OWNER;
    const hideMrp = (salesSettings as any)?.hideMrp ?? false;

    const [showPhotos, setShowPhotos] = useState<boolean | null>(null);
    const isCardView = salesSettings?.salesViewType === 'card';
    const isCardImageView = isCardView && (showPhotos ?? (salesSettings?.cardViewWithPhoto !== false));
    const isCalculatorView = salesSettings?.salesViewType === 'calculator';
    // Filter button par blue dot: Photos/Compact ya sort default se alag ho
    const hasViewChanges =
        isCardImageView !== (salesSettings?.cardViewWithPhoto !== false) ||
        sortOrder !== SORT_OPTIONS[0].value;
    const showTaxRow = (activeTaxMode !== 'exempt');

    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [isFooterExpanded, setIsFooterExpanded] = useState(false);
    const [isTabletBreakdownOpen, setIsTabletBreakdownOpen] = useState(false);

    const gstSchemeDisplay = salesSettings?.gstScheme;

    const { subtotal, totalDiscount, taxAmount, finalAmount, totalQuantity, totalMrp } = useMemo(
        () => calculateSaleTotals(items, salesSettings, activeTaxMode, gstSchemeDisplay),
        [items, salesSettings, activeTaxMode, gstSchemeDisplay]
    );

    const amountToPayNow = useMemo(() => finalAmount, [finalAmount]);
    const netAmount = subtotal - totalDiscount;
    const taxableValue = activeTaxMode === 'inclusive' ? netAmount - taxAmount : netAmount;
    const roundOff = finalAmount - (activeTaxMode === 'inclusive' ? netAmount : netAmount + taxAmount);

    const {
        savedBillData, setSavedBillData,
        sendingPdf,
        printingPdf,
        showPrintSubMenu, setShowPrintSubMenu,
        enableTriplicate,
        isDrawerOpen, setIsDrawerOpen,
        handleSendWhatsapp,
        handleSendWhatsappSnapto,
        handlePrintAction,
        showSuccessModal,
        handleCloseQrModal,
    } = useSalesCommunication({
        currentUser,
        salesSettings,
        setModal,
        navigate,
        setItems,
    });

    const {
        calcInput, setCalcInput,
        stagedCalcInput, setStagedCalcInput,
        displayRef,
        handlePointerDown,
        handlePointerUp,
        handlePointerLeave,
        liveTotal,
        liveItemCount,
        handleKeypadPress,
        handleCheckoutClick,
    } = useSalesCalculator({
        items,
        setItems,
        salesSettings,
        setModal,
        isCalculatorView,
        setIsDrawerOpen,
        longPressTimer,
        isDrawerOpen,
        finalAmount,
    });

    const {
        handleProceedToPayment,
        handleSavePayment,
    } = useSalesPayment({
        currentUser,
        companyId: currentUser?.companyId,
        salesSettings,
        activeTaxMode,
        items,
        setItems,
        availableItems,
        setAvailableItems,
        selectedWorker,
        workers,
        isEditMode,
        invoiceToEdit,
        invoiceDate,
        invoiceNumber,
        setInvoiceNumber,
        isInvoiceNumberManuallyEdited,
        settingsDocId,
        subtotal,
        totalDiscount,
        finalAmount,
        setModal,
        setStagedCalcInput,
        setCalcInput,
        isDrawerOpen,
        setIsDrawerOpen,
        setSavedBillData,
        showSuccessModal,
    });

    // Print / WhatsApp ticks from PaymentDrawer — fire once the bill is saved
    const postSaveOptionsRef = useRef<{ printBill?: boolean; sendWhatsApp?: boolean } | null>(null);

    // Item tile long-press (touch) → opens edit drawer
    const tileHoldTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const tileHoldFired = useRef(false);

    const handleSavePaymentWithOptions = async (data: PaymentCompletionData) => {
        postSaveOptionsRef.current = isEditMode ? null : { printBill: data.printBill, sendWhatsApp: data.sendWhatsApp };
        try {
            await handleSavePayment(data);
        } catch (err) {
            postSaveOptionsRef.current = null;
            throw err;
        }
    };

    useEffect(() => {
        const opts = postSaveOptionsRef.current;
        if (!savedBillData || !opts) return;
        postSaveOptionsRef.current = null;
        const invoice = savedBillData.invoiceData;
        if (opts.sendWhatsApp && invoice?.partyNumber) {
            if (whatsappProvider === 'botmaster') handleSendWhatsapp(invoice);
            else if (whatsappProvider === 'snapto' || whatsappProvider === 'sellar') handleSendWhatsappSnapto(invoice);
        }
        if (opts.printBill) handlePrintAction(invoice, false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [savedBillData]);

    // Bill save hone ke baad customer reset — naya bill fresh shuru ho
    useEffect(() => {
        if (savedBillData && !isEditMode) {
            setCustomerName('');
            setCustomerPhone('');
        }
    }, [savedBillData, isEditMode]);

    if (pageIsLoading) return <div className="flex items-center justify-center h-screen"><Spinner /> <p className="ml-2">Loading...</p></div>;
    if (error) return <div className="flex flex-col items-center justify-center h-screen text-red-600"><p>{error}</p><button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-sm hover:bg-blue-600">Go Back</button></div>;
    const fmtINR = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ICON_BTN_CLS = 'inline-flex items-center justify-center w-10 h-10 rounded-sm text-[#45556c] hover:bg-[#f5f7ff] transition-colors flex-shrink-0';

    const renderMobileHeader = () => (
        <header className="md:hidden flex-shrink-0 bg-white border-b border-[#dfe6fb]">
            {/* Row 1: back + centered title */}
            <div className="flex items-center gap-1 h-14 px-2">
                <button type="button" onClick={() => navigate(-1)} aria-label="Back" className={ICON_BTN_CLS}>
                    <FiChevronLeft size={20} />
                </button>
                <div className="flex-1 min-w-0 flex items-baseline gap-2">
                    <h1 className="m-0 text-lg font-semibold leading-tight text-[#0f172b] whitespace-nowrap">
                        {isEditMode ? 'Edit sale' : 'New sale'}
                    </h1>
                    <span className="text-xs font-normal text-[#5b6b86] truncate">
                        {invoiceNumber}{invoiceDate ? ` · ${new Date(`${invoiceDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                    </span>
                </div>
                {/* List view has no second row, so the three dots stay here */}
                {!isCardView && (
                    <button type="button" onClick={() => setIsMoreOpen(true)} aria-label="More" className={`${ICON_BTN_CLS} ml-auto`}>
                        <FiMoreVertical size={20} />
                    </button>
                )}
            </div>

            {/* Row 2 (card view): sort/filter | search + camera | three dots */}
            {isCardView && (
                <div className="flex items-center gap-2 px-2 pb-3">
                    <button type="button" aria-label="View options" onClick={() => setIsFilterOpen(true)}
                        className="relative inline-flex items-center justify-center w-10 h-10 flex-shrink-0 rounded-sm border border-[#7a8aa3] bg-white text-[#0f172b]">
                        <FiSliders size={18} />
                        {hasViewChanges && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#155dfc] ring-2 ring-white" />}
                    </button>

                    <div className="flex flex-1 min-w-0 items-center h-10 rounded-sm border border-[#7a8aa3] bg-white overflow-hidden transition-all focus-within:border-[#155dfc] focus-within:ring-4 focus-within:ring-[#e6eeff]">
                        <FiSearch size={18} className="ml-3 text-[#5b6b86] flex-shrink-0" />
                        <input
                            type="text"
                            value={gridSearchQuery}
                            onChange={(e) => setGridSearchQuery(e.target.value)}
                            placeholder="Search item name or barcode"
                            className="flex-1 min-w-0 h-full px-2.5 bg-transparent border-0 outline-none text-[14px] font-medium text-[#0f172b] placeholder:text-[#5b6b86]"
                            autoComplete="off"
                        />
                        {gridSearchQuery && (
                            <button type="button" onClick={() => setGridSearchQuery('')} aria-label="Clear search"
                                className="p-1 mr-1 rounded-full text-[#5b6b86] hover:text-[#0f172b] hover:bg-[#f5f7ff] flex-shrink-0">
                                <FiX size={16} />
                            </button>
                        )}
                        <button type="button" aria-label="Scan barcode" onClick={() => setIsScannerOpen(true)}
                            className="h-full w-11 flex-shrink-0 inline-flex items-center justify-center bg-[#155dfc] text-white hover:bg-[#1447e6] transition-colors">
                            <IconScanCircle width={20} height={20} />
                        </button>
                    </div>

                    <button type="button" onClick={() => setIsMoreOpen(true)} aria-label="More" className={ICON_BTN_CLS}>
                        <FiMoreVertical size={20} />
                    </button>
                </div>
            )}
        </header>
    );
    // ───────────────────────── Header ─────────────────────────
    const renderHeader = () => (
        <div className="flex-shrink-0 bg-white border-b border-[#dfe6fb] px-4 py-3 md:px-6 md:py-4">
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
                <h1 className="m-0 mr-1 text-lg md:text-[22px] md:leading-[30px] font-semibold text-[#0f172b]">
                    {isEditMode ? 'Edit sale' : 'New sale'}
                </h1>

                <label className="inline-flex items-center gap-2 h-9 px-3 bg-white border border-[#7a8aa3] rounded-sm text-[13px] transition-all focus-within:border-[#155dfc] focus-within:ring-4 focus-within:ring-[#e6eeff]">
                    <span className="text-[11px] font-semibold tracking-[.06em] uppercase text-[#5b6b86]">Bill no.</span>
                    <input
                        type="text"
                        value={invoiceNumber}
                        aria-label="Invoice number"
                        onChange={(e) => {
                            isInvoiceNumberManuallyEdited.current = true;
                            setInvoiceNumber(e.target.value);
                        }}
                        className="w-24 bg-transparent border-0 outline-none font-semibold text-[#0f172b] tabular-nums"
                    />
                </label>

                <label className="inline-flex items-center gap-2 h-9 px-3 bg-white border border-[#7a8aa3] rounded-sm text-[13px] cursor-pointer transition-all focus-within:border-[#155dfc] focus-within:ring-4 focus-within:ring-[#e6eeff]">
                    <FiCalendar size={14} className="text-[#5b6b86] flex-shrink-0" />
                    <input
                        type="date"
                        value={invoiceDate}
                        aria-label="Invoice date"
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="bg-transparent border-0 outline-none font-semibold text-[#0f172b] cursor-pointer"
                    />
                </label>
                {isCardView && (
                    <div role="group" aria-label="Photos" className="ml-auto inline-flex p-[3px] gap-0.5 bg-[#f5f7ff] border border-[#dfe6fb] rounded-sm">
                        {([[true, 'Photos'], [false, 'Compact']] as const).map(([val, label]) => (
                            <button
                                key={label}
                                type="button"
                                aria-pressed={isCardImageView === val}
                                onClick={() => setShowPhotos(val)}
                                className={`h-7 px-3 rounded-sm text-xs font-medium transition-colors ${isCardImageView === val ? 'bg-white text-[#155dfc] shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]' : 'text-[#45556c] hover:text-[#0f172b]'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    // Grid-view search + scan (card view)
    const renderGridSearch = (autoFocus = false) => (
        <div className="flex gap-2 items-center">
            <div className="relative flex-1">
                <FiSearch size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5b6b86] pointer-events-none" />
                <input
                    type="text"
                    value={gridSearchQuery}
                    onChange={(e) => setGridSearchQuery(e.target.value)}
                    placeholder="Search item name or barcode"
                    className={FIELD_CLS}
                    autoComplete="off"
                    autoFocus={autoFocus}
                />
                {gridSearchQuery && (
                    <button
                        type="button"
                        onClick={() => setGridSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#5b6b86] hover:text-[#0f172b] hover:bg-[#f5f7ff] transition-colors"
                    >
                        <FiX size={16} />
                    </button>
                )}
            </div>
            <button type="button" onClick={() => setIsScannerOpen(true)} title="Scan barcode" aria-label="Scan barcode" className={SCAN_BTN_CLS}>
                <IconScanCircle width={20} height={20} />
                <span className="hidden md:inline">Scan</span>
            </button>
        </div>
    );

    // Phone only: Blinkit-style vertical category rail
    const renderCategoryRail = () => (
        <nav
            aria-label="Categories"
            className="md:hidden w-[88px] flex-shrink-0 overflow-y-auto bg-white border-r border-[#dfe6fb] scrollbar-hide"
        >
            {categories.map(cat => {
                const label = cat === 'All' ? 'All' : (itemGroupMap[cat] || cat);
                const active = selectedCategory === cat;
                return (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`relative w-full flex flex-col items-center gap-1 px-1 py-3 text-center border-0 cursor-pointer transition-colors ${active ? 'bg-[#e6eeff]' : 'bg-white hover:bg-[#f5f7ff]'}`}
                    >
                        {active && <span className="absolute left-0 top-0 bottom-0 w-1 rounded-r-full bg-[#155dfc]" />}
                        <span className={`w-11 h-11 rounded-sm flex items-center justify-center text-base font-semibold ${active ? 'bg-white text-[#155dfc]' : 'bg-[#f5f7ff] text-[#45556c]'}`}>
                            {label.charAt(0).toUpperCase()}
                        </span>
                        <span className={`text-[11px] leading-[14px] [overflow-wrap:anywhere] line-clamp-2 ${active ? 'font-semibold text-[#155dfc]' : 'font-medium text-[#45556c]'}`}>
                            {label}
                        </span>
                    </button>
                );
            })}
        </nav>
    );
    const renderSalesmanSelect = (extraCls = '') =>
        salesSettings?.enableSalesmanSelection ? (
            <select
                value={selectedWorker?.uid || ''}
                onChange={(e) => {
                    if (e.target.value === 'ADD_NEW_SALESMAN') setIsAddUserModalOpen(true);
                    else setSelectedWorker(workers.find(w => w.uid === e.target.value) || null);
                }}
                aria-label="Salesman"
                className={`h-10 px-2 bg-white border border-[#7a8aa3] rounded-sm text-sm font-medium text-[#0f172b] outline-none focus:border-[#155dfc] focus:ring-4 focus:ring-[#e6eeff] disabled:opacity-[.45] ${extraCls}`}
                disabled={!hasPermission(Permissions.ViewTransactions) || (isEditMode && !isManager)}
            >
                <option value="">Salesman</option>
                {workers.map(w => <option key={w.uid} value={w.uid}>{w.name}</option>)}
                <option value="ADD_NEW_SALESMAN">+ Add New Salesman</option>
            </select>
        ) : null;

    // Walk-in customer / filled customer card — "Add" ab popup kholta hai
    const renderCustomerBlock = (showSalesman = true) => (
        <>
            <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-sm bg-[#e6eeff] text-[#155dfc] flex items-center justify-center flex-shrink-0"><FiUser size={16} /></span>
                <div className="flex-1 min-w-0">
                    {customerDisplayName || customerDisplayPhone ? (
                        <>
                            <div className="text-sm font-medium text-[#0f172b] truncate">{customerDisplayName || 'Customer'}</div>
                            {customerDisplayPhone && <div className="text-xs text-[#5b6b86] truncate">{customerDisplayPhone}</div>}
                        </>
                    ) : (
                        <>
                            <div className="text-sm font-medium text-[#0f172b]">Walk-in customer</div>
                            <div className="text-xs text-[#5b6b86]">Add phone to send bill on WhatsApp</div>
                        </>
                    )}
                </div>
                {!isEditMode && (
                    <button type="button" onClick={openCustomerModal}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-[#7a8aa3] bg-white text-[13px] font-medium text-[#0f172b] hover:bg-[#f5f7ff] flex-shrink-0">
                        <FiUserPlus size={14} /> {customerName || customerPhone ? 'Change' : 'Add'}
                    </button>
                )}
            </div>
            {showSalesman && renderSalesmanSelect('w-full')}
        </>
    );
    const renderCustomerSuggestions = () => {
        if (!showCustomerSuggestions || customerSuggestions.length === 0) return null;
        const ref = activeSuggestField === 'name' ? customerNameWrapRef.current : customerPhoneWrapRef.current;
        const rect = ref?.getBoundingClientRect();
        if (!rect) return null;

        return createPortal(
            <div
                ref={customerSuggestionsRef}
                style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 99999 }}
                className="bg-white border border-[#dfe6fb] shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] rounded-sm p-1.5 max-h-48 overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {customerSuggestions.map((c, idx) => (
                    <div
                        key={idx}
                        className="px-2.5 py-2 hover:bg-[#e6eeff] rounded-sm cursor-pointer flex justify-between items-center gap-2"
                        onClick={() => selectCustomerSuggestion(c)}
                    >
                        <div className="min-w-0">
                            <div className="font-semibold text-xs text-[#0f172b] truncate">{c.name}</div>
                            <div className="text-[10px] text-[#5b6b86]">{c.number}</div>
                        </div>
                        {(c.creditBalance ?? 0) > 0 && (
                            <span className="text-[11px] font-medium text-[#008236] bg-[#e9faef] px-2 py-0.5 rounded-full whitespace-nowrap">
                                Credit: ₹{c.creditBalance}
                            </span>
                        )}
                    </div>
                ))}
            </div>,
            document.body
        );
    };
    const renderCustomerModal = () =>
        !showCustomerModal ? null : (
            <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-[#020618]/45 sm:p-4" onClick={closeCustomerModal}>
                <div
                    className={`w-full sm:max-w-sm bg-white text-[#0f172b] rounded-sm border border-[#dfe6fb] ${SHADOW_FLOAT} p-5`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <h3 className="m-0 text-lg font-semibold">Customer</h3>
                    <p className="mt-1 mb-4 text-sm text-[#45556c]">These details are filled in at payment.</p>
                    <div className="space-y-4">
                        {/* Mobile pehle (PaymentDrawer jaisa) */}
                        <div ref={customerPhoneWrapRef} className="relative">
                            <label className={`block mb-1.5 ${LABEL_CLS}`}>Mobile</label>
                            <input
                                type="tel"
                                inputMode="tel"
                                maxLength={10}
                                value={customerDraft.phone}
                                onChange={(e) => handleCustomerDraftChange(e.target.value.replace(/\D/g, '').slice(0, 10), 'number')}
                                onFocus={() => {
                                    setActiveSuggestField('number');
                                    if (customerDraft.phone.length >= 3) searchCustomer(customerDraft.phone, 'number');
                                }}
                                placeholder="9000000000"
                                className={POPUP_INPUT_CLS}
                                autoComplete="off"
                                autoFocus
                            />
                        </div>
                        <div ref={customerNameWrapRef} className="relative">
                            <label className={`block mb-1.5 ${LABEL_CLS}`}>Name</label>
                            <input
                                type="text"
                                value={customerDraft.name}
                                onChange={(e) => handleCustomerDraftChange(e.target.value, 'name')}
                                onFocus={() => {
                                    setActiveSuggestField('name');
                                    if (customerDraft.name.length >= 3) searchCustomer(customerDraft.name, 'name');
                                }}
                                placeholder="Customer name"
                                className={POPUP_INPUT_CLS}
                                autoComplete="off"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 mt-6">
                        <CustomButton variant={Variant.Outline} onClick={closeCustomerModal}>Cancel</CustomButton>
                        <CustomButton variant={Variant.Filled} onClick={saveCustomer}>Save</CustomButton>
                    </div>
                </div>
                {renderCustomerSuggestions()}
            </div>
        );

    const renderSaveBox = (suffix = '') =>
        totalDiscount > 0 ? (
            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-sm bg-[#e9faef] text-[#008236] text-[13px] font-medium">
                Customer saves ₹{fmtINR(totalDiscount)}{suffix}
            </div>
        ) : null;
    // Tablet (768–1279): same bottom checkout bar as the mobile footer
    const renderTabletCheckoutBar = (actionLabel: string) => (
        <div className="hidden md:block xl:hidden flex-shrink-0 z-20 bg-white border-t border-[#dfe6fb]">
            {isTabletBreakdownOpen && (
                <div className="px-4 pt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-4"><span className="text-[#45556c]">MRP total</span><span className="font-medium tabular-nums text-[#0f172b]">₹{fmtINR(subtotal)}</span></div>
                    {totalDiscount > 0 && (
                        <div className="flex justify-between gap-4 text-[#008236]"><span>Discount</span><span className="font-medium tabular-nums">− ₹{fmtINR(totalDiscount)}</span></div>
                    )}
                    <div className="flex justify-between gap-4 border-t border-[#dfe6fb] pt-1.5"><span className="font-medium text-[#0f172b]">Net sale price</span><span className="font-semibold tabular-nums text-[#0f172b]">₹{fmtINR(netAmount)}</span></div>
                    {showTaxRow && (
                        <div className="flex justify-between gap-4"><span className="text-[#45556c]">Tax ({activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})</span><span className="font-medium tabular-nums text-[#155dfc]">+ ₹{fmtINR(taxAmount)}</span></div>
                    )}
                </div>
            )}
            <div className="flex items-center gap-3 px-4 pt-3 pb-4">
                <button type="button" onClick={() => setIsTabletBreakdownOpen(v => !v)} aria-expanded={isTabletBreakdownOpen}
                    className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer">
                    <span className="flex items-center gap-1 text-xs text-[#45556c]">
                        <span className="truncate">
                            {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}
                            {totalDiscount > 0 && ` · saves ₹${fmtINR(totalDiscount)}`}
                        </span>
                        <FiChevronUp size={14} className={`flex-shrink-0 transition-transform ${isTabletBreakdownOpen ? 'rotate-180' : ''}`} />
                    </span>
                    <b className="block text-xl leading-[26px] font-semibold tabular-nums text-[#0f172b] truncate">₹{fmtINR(finalAmount)}</b>
                </button>
                <button type="button" onClick={handleProceedToPayment} disabled={items.length === 0}
                    className="inline-flex items-center justify-center gap-2 h-12 px-4 rounded-sm border border-transparent text-[15px] font-medium whitespace-nowrap bg-[#155dfc] text-white hover:bg-[#1447e6] transition-colors disabled:opacity-[.45] disabled:cursor-not-allowed">
                    {actionLabel}
                    <FiChevronRight size={16} />
                </button>
            </div>
        </div>
    );
    const renderMoreSheet = () =>
        !isMoreOpen ? null : (
            <div className="md:hidden fixed inset-0 z-[60] flex items-end bg-[#020618]/45" onClick={() => setIsMoreOpen(false)}>
                <div className={`w-full bg-white rounded-t-sm p-4 pb-6 flex flex-col gap-4 ${SHADOW_FLOAT}`} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                        <h3 className="m-0 text-base font-semibold text-[#0f172b]">More</h3>
                        <button type="button" onClick={() => setIsMoreOpen(false)} aria-label="Close" className={ICON_BTN_CLS}><FiX size={18} /></button>
                    </div>

                    {/* Invoice number + Date — 2 columns */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="min-w-0">
                            <span className={LABEL_CLS}>Bill no.</span>
                            <input
                                type="text"
                                value={invoiceNumber}
                                aria-label="Invoice number"
                                onChange={(e) => { isInvoiceNumberManuallyEdited.current = true; setInvoiceNumber(e.target.value); }}
                                className={`mt-2 ${POPUP_INPUT_CLS} font-semibold`}
                            />
                        </div>
                        <div className="min-w-0">
                            <span className={LABEL_CLS}>Date</span>
                            <input
                                type="date"
                                value={invoiceDate}
                                aria-label="Invoice date"
                                onChange={(e) => setInvoiceDate(e.target.value)}
                                className={`mt-2 ${POPUP_INPUT_CLS} font-semibold`}
                            />
                        </div>
                    </div>

                    {/* Salesman */}
                    {salesSettings?.enableSalesmanSelection && (
                        <div>
                            <span className={LABEL_CLS}>Salesman</span>
                            <div className="mt-2">{renderSalesmanSelect('w-full')}</div>
                        </div>
                    )}

                    {items.length > 0 && (
                        <button
                            type="button"
                            onClick={() => { setIsMoreOpen(false); handleClearCart(); }}
                            className="inline-flex items-center justify-center gap-2 h-11 rounded-sm text-sm font-medium text-[#d5000c] bg-[#ffeef0]"
                        >
                            <FiTrash2 size={16} /> Clear
                        </button>
                    )}
                </div>
            </div>
        );
    // Phone: filter button sheet — only Photos/Compact + Sort
    const renderFilterSheet = () =>
        !isFilterOpen ? null : (
            <div className="md:hidden fixed inset-0 z-[60] flex items-end bg-[#020618]/45" onClick={() => setIsFilterOpen(false)}>
                <div className={`w-full bg-white rounded-t-sm p-4 pb-6 flex flex-col gap-4 ${SHADOW_FLOAT}`} onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                        <h3 className="m-0 text-base font-semibold text-[#0f172b]">View options</h3>
                        <button type="button" onClick={() => setIsFilterOpen(false)} aria-label="Close" className={ICON_BTN_CLS}><FiX size={18} /></button>
                    </div>

                    <div>
                        <span className={LABEL_CLS}>Cards</span>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                            {([[true, 'Photos'], [false, 'Compact']] as const).map(([val, label]) => (
                                <button
                                    key={label}
                                    type="button"
                                    onClick={() => setShowPhotos(val)}
                                    className={`h-10 rounded-sm text-[13px] font-medium border transition-colors ${isCardImageView === val ? 'bg-[#e6eeff] border-[#155dfc] text-[#155dfc]' : 'bg-white border-[#7a8aa3] text-[#45556c]'}`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <span className={LABEL_CLS}>Sort</span>
                        <div className="mt-2 grid grid-cols-4 gap-1.5">
                            {SORT_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setSortOrder(opt.value)}
                                    className={`h-9 rounded-sm text-[13px] font-medium border transition-colors ${sortOrder === opt.value ? 'bg-[#e6eeff] border-[#155dfc] text-[#155dfc]' : 'bg-white border-[#7a8aa3] text-[#45556c]'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );

    // Cart title row: label + salesman select + clear (used by both views)
    const renderCartBar = () => (
        <div className="flex-shrink-0 flex flex-wrap items-center gap-x-2 gap-y-2 px-4 md:px-5 py-2.5 bg-white border-b border-[#dfe6fb]">
            {/* Left */}
            <div className="flex-1 min-w-fit flex items-center gap-2">
                <span className={LABEL_CLS}>Cart</span>
                {totalQuantity > 0 && (
                    <span className="inline-flex items-center h-[22px] px-2 rounded-full bg-[#e6eeff] text-[#155dfc] text-[11px] font-semibold">
                        <span className="md:hidden">{totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}</span>
                        <span className="hidden md:inline">
                            {items.length} {items.length === 1 ? 'line' : 'lines'} · {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}
                        </span>
                    </span>
                )}
            </div>

            {/* Center — Salesman (mobile par More sheet mein already hai) */}
            <div className="hidden md:block">
                {renderSalesmanSelect('!h-8 !text-xs min-w-[160px]')}
            </div>

            {/* Right */}
            <div className="flex-1 min-w-fit flex items-center justify-end">
                {items.length > 0 && (
                    <button
                        type="button"
                        onClick={handleClearCart}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-[13px] font-medium text-[#d5000c] bg-[#ffeef0] hover:bg-[#ffdde1] transition-colors"
                    >
                        <FiTrash2 size={14} />
                        Clear
                    </button>
                )}
            </div>
        </div>
    );

    // ───────────────────────── Shared popups (card + list views) ─────────────────────────
    const renderClearCartConfirm = () =>
        showClearCartConfirm ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020618]/45 p-4">
                <div className={`bg-white border border-[#dfe6fb] rounded-sm p-5 w-full max-w-sm ${SHADOW_FLOAT}`}>
                    <h3 className="m-0 text-lg font-semibold text-[#0f172b]">Clear cart</h3>
                    <p className="mt-2 mb-5 text-sm text-[#45556c]">Are you sure you want to remove all items?</p>
                    <div className="flex justify-end gap-2">
                        <CustomButton variant={Variant.Outline} onClick={() => setShowClearCartConfirm(false)}>Cancel</CustomButton>
                        <CustomButton variant={Variant.Filled} onClick={handleConfirmClearCart}>Clear</CustomButton>
                    </div>
                </div>
            </div>
        ) : null;

    const renderDuplicateItemPrompt = () =>
        duplicateItemPrompt ? (
            <div className="fixed inset-0 bg-[#020618]/45 flex items-center justify-center z-[2000] p-4">
                <div className={`bg-white border border-[#dfe6fb] rounded-sm p-6 w-full max-w-sm text-center ${SHADOW_FLOAT}`}>
                    {/* Icon */}
                    <div className="mx-auto mb-4 w-12 h-12 rounded-sm flex items-center justify-center bg-[#e6eeff]">
                        <svg className="w-6 h-6 text-[#155dfc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>

                    <h3 className="m-0 mb-1 text-lg font-semibold text-[#0f172b]">Item already in cart</h3>
                    <p className="text-sm text-[#45556c] mb-6">
                        "<span className="font-medium">{duplicateItemPrompt.item.name}</span>" is already in your cart
                        {duplicateItemPrompt.existingCount > 1 ? ` (${duplicateItemPrompt.existingCount} times)` : ''}.
                        What would you like to do?
                    </p>

                    <div className="flex flex-col gap-2">
                        <button
                            onClick={handleIncreaseExistingQuantity}
                            className="w-full h-11 rounded-sm bg-[#155dfc] text-white font-medium hover:bg-[#1447e6] transition-colors"
                        >
                            Increase quantity
                        </button>
                        <button
                            onClick={handleAddAsNewLine}
                            className="w-full h-11 rounded-sm bg-white border border-[#7a8aa3] text-[#0f172b] font-medium hover:bg-[#f5f7ff] transition-colors"
                        >
                            Add as new item
                        </button>
                        <button
                            onClick={() => setDuplicateItemPrompt(null)}
                            className="w-full h-9 text-xs font-medium text-[#5b6b86] hover:text-[#0f172b] mt-1"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        ) : null;

    const renderSavedBillModals = () => (
        <>
            {savedBillData && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#020618]/60 backdrop-blur-sm p-4">
                    <div className={`bg-white border border-[#dfe6fb] rounded-sm ${SHADOW_FLOAT} p-6 w-full max-w-sm max-h-[90dvh] overflow-y-auto flex flex-col items-center animate-in fade-in zoom-in duration-300`}>
                        <button onClick={handleCloseQrModal} aria-label="Close" className="self-end p-1 rounded-full text-[#5b6b86] hover:text-[#0f172b] hover:bg-[#f5f7ff] transition-colors">
                            <FiX size={20} />
                        </button>
                        <div className="w-12 h-12 rounded-full bg-[#e9faef] text-[#008236] flex items-center justify-center mb-3">
                            <FiCheck size={24} />
                        </div>
                        <h3 className="m-0 text-xl font-semibold text-[#0f172b] mb-1">Bill saved</h3>
                        <p className="text-sm text-[#5b6b86] mb-4">Invoice #{savedBillData.number}</p>

                        <div className="bg-white p-3 border border-[#dfe6fb] rounded-sm mb-4">
                            <QRCode
                                value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${savedBillData?.id}`}
                                size={200}
                                viewBox={`0 0 256 256`}
                            />
                        </div>

                        <p className="text-center text-sm text-[#45556c] mb-4">
                            Ask customer to scan this QR code to download their bill.
                        </p>

                        {savedBillData.invoiceData?.partyNumber ? (
                            <>
                                {whatsappProvider === 'botmaster' && (
                                    <button
                                        onClick={() => handleSendWhatsapp(savedBillData.invoiceData)}
                                        disabled={sendingPdf}
                                        className="w-full h-12 rounded-sm bg-[#008236] text-white font-medium hover:bg-[#006b2c] transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-[.45]"
                                    >
                                        {sendingPdf ? <Spinner /> : <><FiSend /> Send on WhatsApp</>}
                                    </button>
                                )}
                                {(whatsappProvider === 'snapto' || whatsappProvider === 'sellar') && (
                                    <button
                                        onClick={() => handleSendWhatsappSnapto(savedBillData.invoiceData)}
                                        disabled={sendingPdf}
                                        className="w-full h-12 rounded-sm bg-[#008236] text-white font-medium hover:bg-[#006b2c] transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-[.45]"
                                    >
                                        {sendingPdf ? <Spinner /> : <><FiSend /> Send on WhatsApp</>}
                                    </button>
                                )}
                            </>
                        ) : (
                            <p className="text-xs text-[#bb4d00] mb-3 text-center bg-[#fff3dd] p-2 rounded-sm w-full">
                                No phone number provided for WhatsApp.
                            </p>
                        )}

                        <button
                            onClick={() => setShowPrintSubMenu(true)}
                            disabled={printingPdf}
                            className="w-full h-12 rounded-sm bg-white border border-[#7a8aa3] text-[#0f172b] font-medium hover:bg-[#f5f7ff] transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-[.45]"
                        >
                            {printingPdf ? <Spinner /> : <><IconPrint /> Print</>}
                        </button>

                        <button
                            onClick={handleCloseQrModal}
                            className="w-full h-12 rounded-sm bg-[#155dfc] text-white font-medium hover:bg-[#1447e6] transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {showPrintSubMenu && savedBillData && (
                <div className="fixed inset-0 z-[2010] flex items-center justify-center bg-[#020618]/45" onClick={() => setShowPrintSubMenu(false)}>
                    <div className={`bg-white border border-[#dfe6fb] rounded-sm p-6 w-full max-w-xs mx-4 ${SHADOW_FLOAT}`} onClick={e => e.stopPropagation()}>
                        <h3 className={`${LABEL_CLS} mb-4 text-center`}>Print options</h3>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => handlePrintAction(savedBillData.invoiceData, false)} className="w-full h-11 rounded-sm bg-white border border-[#7a8aa3] text-[#0f172b] text-sm font-medium hover:bg-[#f5f7ff] transition-colors">
                                Print (Bill Only)
                            </button>
                            <button onClick={() => handlePrintAction(savedBillData.invoiceData, true)} className="w-full h-11 rounded-sm bg-[#e6eeff] border border-[#155dfc] text-[#155dfc] text-sm font-medium hover:bg-[#dbe6ff] transition-colors">
                                {enableTriplicate ? 'Print (Bill + 2 Duplicates)' : 'Print (Bill + Duplicate)'}
                            </button>
                            <button onClick={() => setShowPrintSubMenu(false)} className="w-full h-9 text-xs font-medium text-[#5b6b86] hover:text-[#0f172b] mt-1">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    const oldTotalExpense = invoiceToEdit?.expenses
        ? invoiceToEdit.expenses.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0)
        : Number(invoiceToEdit?.extraExpenseAmount || 0);

    const calculatedOriginalTotal = invoiceToEdit ?
        (Number(invoiceToEdit.totalAmount ?? invoiceToEdit.amount ?? 0) +
            Number(invoiceToEdit.manualDiscount || 0) -
            oldTotalExpense)
        : undefined;

    // ═════════════════════════ CARD VIEW ═════════════════════════
    if (isCardView) {
        return (
            <div className="flex flex-col h-full bg-[#eef2ff] w-full overflow-hidden pb-0">
                {modal && (
                    <Modal
                        message={modal.message}
                        onClose={() => {
                            setModal(null);
                            setShowClearCartConfirm(false);
                        }}
                        onConfirm={showClearCartConfirm ? () => {
                            handleConfirmClearCart();
                            setModal(null);
                        } : undefined}
                        showConfirmButton={showClearCartConfirm}
                        type={modal.type}
                    />
                )}
                {renderClearCartConfirm()}
                <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
                <BarcodeLinkModal
                    isOpen={isBarcodeLinkModalOpen}
                    barcode={barcodeToLink}
                    items={availableItems}
                    isLinking={isLinkingBarcode}
                    onClose={closeBarcodeLinkModal}
                    onLink={handleLinkScannedBarcode}
                />
                <AddUserModal isOpen={isAddUserModalOpen} onClose={() => setIsAddUserModalOpen(false)} />
                <div className="hidden md:block">{renderHeader()}</div>
                {renderMobileHeader()}
                {renderMoreSheet()}
                {renderFilterSheet()}
                <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">

                    {/* LEFT PANEL */}
                    <div className="flex flex-col w-full xl:flex-1 h-full relative min-w-0 overflow-hidden">

                        <div className="flex-shrink-0 bg-white border-b border-[#dfe6fb]">
                            <div className="hidden md:block xl:hidden px-5 pt-3">{renderCustomerBlock(false)}</div>

                            <div className="hidden md:block px-5 pt-4">{renderGridSearch()}</div>
                            <div className="hidden md:flex items-center gap-2 px-5 py-3">
                                <div className="flex gap-1.5 overflow-x-auto flex-1 scrollbar-hide">
                                    {categories.map(cat => (
                                        <button key={cat} type="button" onClick={() => setSelectedCategory(cat)} className={chipCls(selectedCategory === cat)}>
                                            {cat === 'All' ? 'All' : itemGroupMap[cat] || cat}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="hidden md:flex flex-wrap items-center gap-x-2 gap-y-2 px-5 pb-3">
                                {/* Left */}
                                <div className="flex-1 min-w-fit flex items-center gap-2">
                                    <span className={LABEL_CLS}>Items · {sortedGridItems.length}</span>
                                    {items.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleClearCart}
                                            className="hidden md:inline-flex xl:hidden items-center gap-1.5 h-8 px-3 rounded-sm text-xs font-medium text-[#d5000c] bg-[#ffeef0] hover:bg-[#ffdde1] transition-colors flex-shrink-0 whitespace-nowrap"
                                        >
                                            <FiTrash2 size={14} /> Clear
                                        </button>
                                    )}
                                </div>

                                {/* Center — Salesman (mobile par More sheet mein already hai) */}
                                <div className="hidden md:block">
                                    {renderSalesmanSelect('!h-8 !text-xs min-w-[160px]')}
                                </div>

                                {/* Right */}
                                <div className="flex-1 min-w-fit flex items-center justify-end gap-2">
                                    <select
                                        value={sortOrder}
                                        onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                                        aria-label="Sort"
                                        className="h-8 px-2 bg-white border border-[#7a8aa3] rounded-sm text-xs font-medium text-[#0f172b] outline-none focus:border-[#155dfc] focus:ring-4 focus:ring-[#e6eeff]"
                                    >
                                        {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Rail (left, phone) + card grid (right) */}
                        <div className="flex-1 flex min-h-0 overflow-hidden">
                            {renderCategoryRail()}

                            <div className="flex-1 min-w-0 overflow-y-auto grid grid-cols-2 md:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] auto-rows-max content-start gap-2 bg-[#eef2ff] px-2 pt-2.5 pb-20 md:px-3">
                                {sortedGridItems.map(item => {
                                    const matchingCartItems = items.filter(i => i.productId === item.id);
                                    const lastAddedCartItem = matchingCartItems[matchingCartItems.length - 1];
                                    const isSelected = matchingCartItems.length > 0;
                                    const quantity = matchingCartItems.reduce((sum, i) => sum + i.quantity, 0);
                                    const isRoundingEnabled = salesSettings?.enableRounding ?? true;
                                    const roundingInterval = (salesSettings as any)?.roundingInterval ?? 1;
                                    const allowItemDiscount = salesSettings?.enableItemWiseDiscount ?? true;
                                    const mrp = Number(item.mrp || 0);
                                    const itemSalesPrice = Number(item.salesPrice || 0);
                                    const presetDiscount = Number(item.discount || 0);
                                    let baseDisplayPrice = 0;

                                    // --- NEW 3-TIER LOGIC FOR GRID CARDS ---
                                    if (mrp > 0 && itemSalesPrice > 0) {
                                        baseDisplayPrice = itemSalesPrice; // Case 1
                                    } else if (itemSalesPrice > 0) {
                                        baseDisplayPrice = allowItemDiscount ? itemSalesPrice * (1 - presetDiscount / 100) : itemSalesPrice; // Case 2
                                    } else if (mrp > 0) {
                                        baseDisplayPrice = allowItemDiscount ? mrp * (1 - presetDiscount / 100) : mrp; // Case 3
                                    }

                                    baseDisplayPrice = applyRounding(baseDisplayPrice, isRoundingEnabled, roundingInterval);

                                    const effectiveSp = (lastAddedCartItem?.customPrice !== undefined && lastAddedCartItem?.customPrice !== null && lastAddedCartItem?.customPrice !== '')
                                        ? Number(lastAddedCartItem.customPrice)
                                        : baseDisplayPrice;
                                    const sp = effectiveSp;
                                    const lineSubtotal = Math.round((Number(sp) * quantity) * 100) / 100;
                                    const discPct = (!hideMrp && allowItemDiscount && mrp > 0 && Number(sp) < mrp && Number(sp) > 0)
                                        ? Math.round(((mrp - Number(sp)) / mrp) * 100)
                                        : 0;
                                    const photoUrl: string | undefined = isCardImageView
                                        ? ((item as any).image || (item as any).imageUrl || (item as any).thumbnail || (item as any).imageURL)
                                        : undefined;
                                    const moq = Number((item as any).moq) || 1;
                                    const atMin = isSelected && quantity <= moq;

                                    const openEdit = () => {
                                        const orig = availableItems.find(a => a.id === item.id);
                                        if (orig) handleOpenEditDrawer(orig);
                                    };
                                    const handleTileTap = () => {
                                        if (tileHoldFired.current) { tileHoldFired.current = false; return; }
                                        if (isSelected) handleQuantityChange(lastAddedCartItem.id, quantity + 1);
                                        else handleAddOrPickTier(item);
                                    };

                                    return (
                                        <div key={item.id} className="relative min-w-0">
                                            <button
                                                type="button"
                                                aria-label={`Add one ${item.name}${isSelected ? `, ${quantity} in bill` : ''}`}
                                                onClick={handleTileTap}
                                                onPointerDown={(e) => {
                                                    if (e.pointerType !== 'touch') return;
                                                    tileHoldFired.current = false;
                                                    clearTimeout(tileHoldTimer.current);
                                                    tileHoldTimer.current = setTimeout(() => { tileHoldFired.current = true; openEdit(); }, 450);
                                                }}
                                                onPointerUp={() => clearTimeout(tileHoldTimer.current)}
                                                onPointerLeave={() => clearTimeout(tileHoldTimer.current)}
                                                onPointerCancel={() => clearTimeout(tileHoldTimer.current)}
                                                onContextMenu={(e) => e.preventDefault()}
                                                className={`relative flex flex-col w-full overflow-hidden p-0 text-left rounded-sm border-2 select-none cursor-pointer transition active:scale-[0.97] [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]
                ${isCardImageView ? 'h-[176px] md:h-[164px]' : 'h-[100px]'}
                ${isSelected ? 'bg-blue-50 border-blue-600' : 'bg-white border-transparent ring-1 ring-gray-200 hover:ring-gray-300'}`}
                                            >
                                                {/* Photo strip (photo mode only) */}
                                                {isCardImageView && (
                                                    <span className={`relative flex items-center justify-center w-full h-[96px] md:h-[88px] p-1 shrink-0 overflow-hidden ${isSelected ? 'bg-white' : 'bg-gray-50'}`}>
                                                        {photoUrl && (
                                                            <img
                                                                src={photoUrl}
                                                                alt=""
                                                                loading="lazy"
                                                                className="max-w-full max-h-full object-contain block"
                                                                onError={(e) => {
                                                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                                    const ph = (e.currentTarget as HTMLImageElement).parentElement?.querySelector<HTMLElement>('[data-no-image]');
                                                                    if (ph) ph.style.display = 'flex';
                                                                }}
                                                            />
                                                        )}
                                                        <span data-no-image className="absolute inset-0 items-center justify-center" style={{ display: photoUrl ? 'none' : 'flex' }}>
                                                            <FiCamera size={20} strokeWidth={1.5} className="text-gray-300" />
                                                        </span>
                                                        {discPct > 0 && (
                                                            <span className="absolute top-1 left-1 inline-flex items-center h-4 px-1 rounded-sm bg-blue-600 text-white text-[10px] leading-[14px] font-bold whitespace-nowrap">
                                                                {discPct}% OFF
                                                            </span>
                                                        )}
                                                    </span>
                                                )}

                                                {/* Name + price row */}
                                                <span className={`flex flex-col flex-1 min-w-0 gap-1 ${isCardImageView ? 'px-1.5 py-1' : 'p-1.5'}`}>
                                                    <span
                                                        className={`block overflow-hidden pr-2 text-[12px] leading-4 font-semibold text-gray-900 break-words [display:-webkit-box] [-webkit-box-orient:vertical] ${isCardImageView ? '[-webkit-line-clamp:2] h-8' : '[-webkit-line-clamp:3] h-12'}`}
                                                        title={item.name}
                                                    >
                                                        {item.name}
                                                    </span>
                                                    <span className={`flex items-center gap-1 mt-auto min-w-0 tabular-nums ${isCardImageView ? 'h-7' : 'h-8'}`}>
                                                        {isSelected ? (
                                                            <span className="ml-auto text-xs leading-4 font-bold text-blue-600 whitespace-nowrap md:mr-[34px]">
                                                                ₹{lineSubtotal.toLocaleString('en-IN')}
                                                            </span>
                                                        ) : (
                                                            <>
                                                                <span className="text-[13px] leading-4 font-bold text-gray-900 whitespace-nowrap">₹{Number(sp).toLocaleString('en-IN')}</span>
                                                                {discPct > 0 && mrp > 0 && Number(sp) < mrp && (
                                                                    <span className="min-w-0 truncate text-[11px] leading-[14px] text-gray-500 line-through whitespace-nowrap">₹{mrp.toLocaleString('en-IN')}</span>
                                                                )}
                                                            </>
                                                        )}
                                                    </span>
                                                </span>
                                            </button>

                                            {/* Qty badge */}
                                            {isSelected && (
                                                <span aria-hidden="true" className="absolute -top-[7px] -right-[7px] z-[2] min-w-[22px] h-[22px] px-1.5 grid place-items-center rounded-full bg-blue-600 text-white text-[11px] leading-[14px] font-bold tabular-nums ring-2 ring-[#eef2ff] pointer-events-none">
                                                    {quantity}
                                                </span>
                                            )}

                                            {/* Minus (trash at MOQ) */}
                                            {isSelected && (
                                                <button
                                                    type="button"
                                                    aria-label={`${atMin ? 'Remove' : 'One less'} ${item.name}`}
                                                    onClick={() => {
                                                        if (quantity > moq) handleQuantityChange(lastAddedCartItem.id, quantity - 1);
                                                        else handleDeleteItem(lastAddedCartItem.id);
                                                    }}
                                                    className={`absolute z-[1] grid place-items-center rounded-sm bg-white text-blue-600 border-[1.5px] border-blue-600 hover:bg-blue-600 hover:text-white transition-colors
                    ${isCardImageView ? 'bottom-1.5 left-1.5 w-7 h-7' : 'bottom-2 left-2 w-8 h-8'}`}
                                                >
                                                    {atMin ? <FiTrash2 size={16} /> : <FiMinus size={16} />}
                                                </button>
                                            )}

                                            {/* Edit (mouse / trackpad only) */}
                                            <button
                                                type="button"
                                                aria-label={`Edit ${item.name}`}
                                                onClick={openEdit}
                                                className={`hidden md:grid absolute z-[1] place-items-center rounded-sm bg-transparent text-gray-500 border border-transparent hover:text-blue-600 hover:border-gray-200 hover:bg-white transition-colors
    ${isCardImageView ? 'bottom-1.5 right-1.5 w-7 h-7' : 'bottom-2 right-2 w-8 h-8'}`}
                                            >
                                                <FiEdit size={15} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Mobile footer — ONCE only */}
                        <div className="md:hidden">
                            <GenericBillFooter
                                isExpanded={isFooterExpanded}
                                onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
                                totalQuantity={totalQuantity} subtotal={subtotal}
                                totalDiscount={totalDiscount} taxAmount={taxAmount}
                                finalAmount={finalAmount} showTaxRow={showTaxRow}
                                taxLabel={`Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`}
                                actionLabel={isEditMode ? 'Update invoice' : 'Pay'}
                                onActionClick={handleProceedToPayment}
                                disableAction={items.length === 0}>
                            </GenericBillFooter>
                        </div>
                        {renderTabletCheckoutBar(isEditMode ? 'Update invoice' : 'Pay')}
                    </div>

                    {/* RIGHT PANEL — desktop only */}
                    <div className="hidden xl:flex w-[360px] flex-shrink-0 flex-col bg-white h-full relative border-l border-[#dfe6fb] z-10">
                        <div className="flex-1 min-h-0 p-5 flex flex-col gap-4 overflow-y-auto">
                            {renderCustomerBlock(false)}
                            {/* Bill header + Clear */}
                            <div className="flex items-center justify-between">
                                <h2 className="m-0 text-base font-semibold text-[#0f172b]">Bill · {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}</h2>
                                {items.length > 0 && (
                                    <button onClick={handleClearCart} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-[13px] font-medium text-[#d5000c] bg-[#ffeef0] hover:bg-[#ffdde1] transition-colors"><FiTrash2 size={14} /> Clear</button>
                                )}
                            </div>

                            {/* Cart lines */}
                            <CartLinesCompact
                                items={items}
                                getUnitPrice={(i: any) => Number(i.customPrice ?? i.salesPrice ?? i.mrp ?? 0)}
                                onQuantityChange={handleQuantityChange}
                                onDelete={handleDeleteItem}
                            />

                            {/* Summary */}
                            <div className="space-y-1.5 text-sm">
                                <div className="flex justify-between"><span className="text-[#45556c]">MRP total</span><span className="tabular-nums">₹{fmtINR(subtotal)}</span></div>
                                {totalDiscount > 0 && <div className="flex justify-between text-[#008236]"><span>Discount</span><span className="tabular-nums">− ₹{fmtINR(totalDiscount)}</span></div>}
                                {showTaxRow && <div className="flex justify-between"><span className="text-[#45556c]">Tax ({activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})</span><span className="tabular-nums">₹{fmtINR(taxAmount)}</span></div>}
                            </div>
                            {totalDiscount > 0 && (
                                <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-sm bg-[#e9faef] text-[#008236] text-[13px] font-medium">Customer saves ₹{fmtINR(totalDiscount)}</div>
                            )}
                            <div className="flex justify-between items-baseline">
                                <span className="text-sm text-[#45556c]">Grand total</span>
                                <b className="text-[30px] leading-[38px] font-semibold tracking-tight tabular-nums text-[#0f172b]">₹{fmtINR(finalAmount)}</b>
                            </div>

                            <button type="button" onClick={handleProceedToPayment} disabled={items.length === 0}
                                className="mt-auto w-full h-14 rounded-sm bg-[#155dfc] text-white text-base font-medium hover:bg-[#1447e6] transition-colors disabled:opacity-[.45] disabled:cursor-not-allowed">
                                {isEditMode ? 'Update invoice' : 'Pay'} · ₹{fmtINR(finalAmount)}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Drawers & modals — rendered ONCE */}
                <PaymentDrawer
                    mode='sale' isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}
                    enableCustomerDetails={true}
                    subtotal={subtotal} billTotal={amountToPayNow}
                    totalTax={taxAmount}
                    onPaymentComplete={handleSavePaymentWithOptions}
                    showBillOptions={!isEditMode}
                    isPartyNameEditable={!isEditMode}
                    originalBillTotal={calculatedOriginalTotal}
                    initialPartyName={isEditMode ? invoiceToEdit?.partyName : customerName}
                    initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : customerPhone}
                    onPartyChange={isEditMode ? undefined : handleDrawerPartyChange}
                    initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined}
                    totalItemDiscount={totalDiscount} totalQuantity={totalQuantity}
                    initialDiscount={invoiceToEdit?.manualDiscount}
                    requireCustomerName={salesSettings?.requireCustomerName}
                    requireCustomerMobile={salesSettings?.requireCustomerMobile}
                    allowDueBilling={salesSettings?.allowDueBilling ?? false}
                    initialPartyAddress={isEditMode ? invoiceToEdit?.partyAddress : ''}
                    initialPartyGST={isEditMode ? invoiceToEdit?.partyGstin : ''}
                    initialShippingName={isEditMode ? invoiceToEdit?.shippingName : ''}
                    initialShippingNumber={isEditMode ? invoiceToEdit?.shippingNumber : ''}
                    initialShippingAddress={isEditMode ? invoiceToEdit?.shippingAddress : ''}
                    initialShippingGST={isEditMode ? invoiceToEdit?.shippingGST : ''}
                    initialPlaceOfSupply={isEditMode ? invoiceToEdit?.placeOfSupply : ''}
                    initialShippingState={isEditMode ? invoiceToEdit?.shippingState : ''}
                    initialExpenses={isEditMode ? (invoiceToEdit?.expenses || (invoiceToEdit?.extraExpenseName ? [{ name: invoiceToEdit.extraExpenseName, amount: invoiceToEdit.extraExpenseAmount }] : [])) : []}
                    initialNarration={isEditMode ? invoiceToEdit?.narration : ''}
                    initialTransportDetails={isEditMode ? invoiceToEdit?.transportDetails : undefined}
                    enableShippingDetails={salesSettings?.enableShippingDetails}
                    enableExtraExpense={salesSettings?.enableExtraExpense}
                    enableNarration={salesSettings?.enableNarration}
                    enableTransportDetails={salesSettings?.enableTransportDetails ?? false}
                    maxBillDiscountValue={salesSettings?.maxBillDiscountValue}
                    maxBillDiscountType={salesSettings?.maxBillDiscountType}
                />
                <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />
                <TierPickerModal
                    item={tierPickerItem}
                    isOpen={!!tierPickerItem}
                    onClose={() => setTierPickerItem(null)}
                    onSelect={(item, tier) => {
                        handleItemSelected(item, tier.id === '__base__' ? undefined : tier);
                    }}
                />
                {renderCustomerModal()}
                {renderSavedBillModals()}
            </div>
        );
    }

    // ═════════════════════════ CALCULATOR VIEW ═════════════════════════
    if (isCalculatorView) {
        return (
            // fixed inset-0 completely disables page scrolling
            <div className="fixed inset-0 flex flex-col bg-[#eef2ff] w-full overflow-hidden">
                {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

                {/* Top Navigation */}
                <div className="shrink-0 bg-white border-b border-[#dfe6fb] px-4 py-3 md:px-6 md:py-4">
                    <h1 className="m-0 text-lg md:text-[22px] md:leading-[30px] font-semibold text-[#0f172b]">New sale</h1>
                </div>

                {/* Main Calculator Area */}
                <div className="flex-1 flex flex-col items-center p-1 sm:p-4 min-h-0 w-full">
                    <div className="w-full max-w-sm mx-auto flex flex-col h-full">

                        {/* Live Summary Totals (Moved Above Calculator) */}
                        <div className="flex justify-between items-end px-2 py-1 shrink-0">
                            <div className="flex flex-col gap-1">
                                <span className="text-[#45556c] font-medium text-sm">Grand total</span>
                                <span className="inline-flex items-center h-[22px] px-2 rounded-full bg-[#e6eeff] text-[#155dfc] text-[11px] font-semibold w-fit">
                                    {liveItemCount} {liveItemCount === 1 ? 'item' : 'items'}
                                </span>
                            </div>
                            <span className="text-4xl font-semibold text-[#0f172b] tracking-tight tabular-nums">₹{liveTotal.toFixed(2)}</span>
                        </div>
                        {/* Enlarged Display Screen */}
                        <div
                            className="bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] px-4 pt-3 pb-2 flex flex-col items-end justify-end min-h-[8rem] sm:min-h-[10rem] max-h-[12rem] sm:max-h-[14rem] shrink-0 w-full cursor-text overflow-hidden relative"
                            onClick={() => displayRef.current?.focus()}
                        >
                            {/* Hidden textarea — drives all input logic unchanged */}
                            <textarea
                                ref={displayRef}
                                inputMode="none"
                                value={calcInput}
                                placeholder=""
                                onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9*.\-+%]/g, '');
                                    setCalcInput(val);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') e.preventDefault();
                                }}
                                className="absolute opacity-0 pointer-events-none w-0 h-0"
                                rows={1}
                            />

                            {/* Visual display — wraps into lines, last line is large */}
                            <CalcDisplay value={calcInput} />
                        </div>

                        <div className="grid grid-cols-8 gap-1.5 sm:gap-2 flex-1 min-h-0 w-full mt-2">
                            {calcKeys.flat().map((key) => {
                                const { label, icon: Icon, colClass, type, value } = key;
                                const isFunction = type === 'function';
                                const isOperator = type === 'operator';
                                const isBackspace = value === 'Backspace';

                                return (
                                    <button
                                        key={key.label}
                                        onPointerDown={(e) => {
                                            e.preventDefault();
                                            if (isBackspace) {
                                                handlePointerDown(key);
                                            } else {
                                                handleKeypadPress(key);
                                            }
                                        }}
                                        onPointerUp={isBackspace ? () => handlePointerUp(key) : undefined}
                                        onPointerLeave={isBackspace ? () => handlePointerLeave(key) : undefined}
                                        className={`h-full w-full flex items-center justify-center rounded-sm text-2xl sm:text-3xl font-medium transition-all active:scale-95 border select-none
        ${isFunction ? 'bg-[#ffeef0] border-[#d5000c]/30 text-[#d5000c] hover:bg-[#ffdde1]' :
                                                isOperator ? 'bg-[#e6eeff] border-[#155dfc]/30 text-[#155dfc] hover:bg-[#dbe6ff]' :
                                                    'bg-white border-[#dfe6fb] text-[#0f172b] hover:bg-[#f5f7ff]'}
        ${colClass || 'col-span-2'}`}
                                    >
                                        {Icon ? <Icon size={28} /> : label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Bottom Action Bar (Now only holds the button) */}
                <div className="shrink-0 bg-white border-t border-[#dfe6fb] px-4 pt-3 pb-3 mb-16">
                    <div className="w-full max-w-sm mx-auto flex flex-col">
                        <button
                            onClick={handleCheckoutClick}
                            disabled={liveItemCount === 0}
                            className="w-full h-14 rounded-sm bg-[#155dfc] hover:bg-[#1447e6] text-white font-medium text-base transition-colors disabled:opacity-[.45] disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            Pay · ₹{liveTotal.toFixed(2)}
                        </button>
                    </div>
                </div>

                {/* Modals & Drawers */}
                <PaymentDrawer
                    mode='calculator'
                    isOpen={isDrawerOpen}
                    originalBillTotal={calculatedOriginalTotal}
                    onClose={() => {
                        setIsDrawerOpen(false);
                        if (stagedCalcInput) {
                            setCalcInput(stagedCalcInput);
                            setItems(prev => prev.filter(i => !i.isStagedCalcItem));
                            setStagedCalcInput('');
                        }
                    }}
                    enableCustomerDetails={salesSettings?.enableCustomerInfoToggle ?? false}
                    subtotal={subtotal}
                    billTotal={amountToPayNow}
                    onPaymentComplete={handleSavePayment}
                    enableShippingDetails={false}
                    enableExtraExpense={false}
                    enableNarration={false}
                    allowDueBilling={salesSettings?.allowDueBilling ?? false}
                    requireCustomerName={salesSettings?.requireCustomerName ?? false}
                    requireCustomerMobile={salesSettings?.requireCustomerMobile ?? false}
                    isPartyNameEditable={true}
                    initialPartyName={customerName}
                    initialPartyNumber={customerPhone}
                    onPartyChange={handleDrawerPartyChange}
                    totalItemDiscount={totalDiscount}
                    totalQuantity={totalQuantity}
                    maxBillDiscountValue={salesSettings?.maxBillDiscountValue}
                    maxBillDiscountType={salesSettings?.maxBillDiscountType}
                />

            </div>
        );
    }

    // ═════════════════════════ LIST VIEW ═════════════════════════
    return (
        <div className="flex flex-col h-full bg-[#eef2ff] w-full overflow-hidden">
            {modal && (
                <Modal
                    message={modal.message}
                    onClose={() => {
                        setModal(null);
                        setShowClearCartConfirm(false);
                    }}
                    onConfirm={showClearCartConfirm ? () => {
                        handleConfirmClearCart();
                        setModal(null);
                    } : undefined}
                    showConfirmButton={showClearCartConfirm}
                    type={modal.type}
                />
            )}
            {renderClearCartConfirm()}
            {/* Duplicate item popup */}
            {renderDuplicateItemPrompt()}
            <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
            <BarcodeLinkModal
                isOpen={isBarcodeLinkModalOpen}
                barcode={barcodeToLink}
                items={availableItems}
                isLinking={isLinkingBarcode}
                onClose={closeBarcodeLinkModal}
                onLink={handleLinkScannedBarcode}
            />
            <AddUserModal isOpen={isAddUserModalOpen} onClose={() => setIsAddUserModalOpen(false)} />
            <div className="hidden md:block">{renderHeader()}</div>
            {renderMobileHeader()}
            {renderMoreSheet()}

            <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">

                <div className="flex flex-col w-full xl:flex-1 min-w-0 h-full relative">

                    <div className="flex-shrink-0 px-4 md:px-5 py-3 bg-white border-b border-[#dfe6fb]">
                        <div className="hidden md:block xl:hidden mb-3">{renderCustomerBlock(false)}</div>
                        <div className="flex gap-2 items-center w-full">
                            <div className="flex-grow">
                                <SearchableItemInput
                                    label="Search item"
                                    placeholder="Search item name or barcode"
                                    items={availableItems}
                                    onItemSelected={handleItemSelectedWrapper}
                                    isLoading={pageIsLoading}
                                    error={error}
                                    onAddItem={(query) => navigate(ROUTES.ITEM_ADD, { state: { prefillName: query } })}
                                    categories={categories}
                                    itemGroupMap={itemGroupMap}
                                    onSearchChange={setCartSearchQuery}
                                />
                            </div>
                            <button type="button" onClick={() => setIsScannerOpen(true)} title="Scan barcode" aria-label="Scan barcode" className={SCAN_BTN_CLS}>
                                <IconScanCircle width={20} height={20} />
                                <span className="hidden md:inline">Scan</span>
                            </button>
                        </div>
                    </div>

                    {/* Cart List Container */}
                    <div className="flex-1 flex flex-col bg-[#eef2ff] overflow-y-hidden">
                        {renderCartBar()}
                        <div className="flex-shrink-0 grid grid-cols-2 px-2 py-1">
                            {discountInfo && <div className="text-xs text-red-600">{discountInfo}</div>}
                            {priceInfo && <div className="text-xs text-red-600">{priceInfo}</div>}
                        </div>
                        <GenericCartList
                            items={displayItems}
                            availableItems={availableItems}
                            scrollRef={cartListRef}
                            basePriceKey="mrp"
                            priceLabel="MRP"
                            settings={{
                                enableRounding: salesSettings?.enableRounding ?? true,
                                roundingInterval: (salesSettings as any)?.roundingInterval ?? 1,
                                enableItemWiseDiscount: salesSettings?.enableItemWiseDiscount ?? true,
                                enableDiscount2: (salesSettings as any)?.enableDiscount2 ?? false,
                                lockDiscount: isDiscountLocked,
                                lockPrice: isPriceLocked,
                                hideMrp: hideMrp
                            }}
                            applyRounding={applyRounding}
                            State={State}
                            setModal={setModal}
                            onOpenEditDrawer={handleOpenEditDrawer}
                            onDeleteItem={handleDeleteItem}
                            onDiscountChange={handleDiscountChange}
                            onDiscount2Change={handleDiscount2Change}
                            onCustomPriceChange={handleCustomPriceChange}
                            onCustomPriceBlur={handleCustomPriceBlur}
                            onQuantityChange={handleQuantityChange}
                            onDiscountPressStart={handleDiscountPressStart}
                            onDiscountPressEnd={handleDiscountPressEnd}
                            onDiscountClick={handleDiscountClick}
                            onPricePressStart={handlePricePressStart}
                            onPricePressEnd={handlePricePressEnd}
                            onPriceClick={handlePriceClick}
                        />
                        <div className="xl:hidden px-4 pb-3">{renderSaveBox()}</div>
                        {/* MOBILE FOOTER (Visible only on small screens) */}
                        <div className="md:hidden">

                            <GenericBillFooter
                                isExpanded={isFooterExpanded}
                                onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
                                totalQuantity={totalQuantity}
                                subtotal={subtotal}
                                totalDiscount={totalDiscount}
                                taxAmount={taxAmount}
                                finalAmount={finalAmount}
                                showTaxRow={showTaxRow}
                                taxLabel={`Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`}
                                actionLabel={isEditMode ? 'Update invoice' : 'Pay'}
                                onActionClick={handleProceedToPayment}
                                disableAction={items.length === 0}
                            >
                            </GenericBillFooter>
                        </div>
                        {renderTabletCheckoutBar(isEditMode ? 'Update invoice' : 'Pay')}
                    </div>
                </div>

                {/* RIGHT PANEL — desktop only */}
                <div className="hidden xl:flex w-[360px] flex-shrink-0 flex-col bg-white h-full relative border-l border-[#dfe6fb] z-10">
                    <div className="flex-1 min-h-0 p-5 flex flex-col gap-4 overflow-y-auto">
                        {renderCustomerBlock(false)}
                        <div className="border-t border-[#dfe6fb]" />
                        <h2 className="m-0 text-base font-semibold text-[#0f172b]">Bill summary</h2>

                        <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between gap-4">
                                <span className="text-[#45556c]">MRP total <span className="text-[#5b6b86]">({totalQuantity} {totalQuantity === 1 ? 'item' : 'items'})</span></span>
                                <span className="tabular-nums">₹{fmtINR(subtotal)}</span>
                            </div>
                            {totalDiscount > 0 && (
                                <div className="flex justify-between gap-4 text-[#008236]"><span>Discount</span><span className="tabular-nums">− ₹{fmtINR(totalDiscount)}</span></div>
                            )}
                            {showTaxRow && (
                                <>
                                    <div className="flex justify-between gap-4"><span className="text-[#45556c]">Taxable value</span><span className="tabular-nums">₹{fmtINR(taxableValue)}</span></div>
                                    <div className="flex justify-between gap-4"><span className="text-[#45556c]">Tax ({activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})</span><span className="tabular-nums">₹{fmtINR(taxAmount)}</span></div>
                                </>
                            )}
                            <div className="flex justify-between gap-4"><span className="text-[#45556c]">Round off</span><span className="tabular-nums">₹{fmtINR(roundOff)}</span></div>
                        </div>

                        {renderSaveBox(' on this bill')}

                        <div className="flex justify-between items-baseline">
                            <span className="text-sm text-[#45556c]">Grand total</span>
                            <b className="text-[30px] leading-[38px] font-semibold tracking-tight tabular-nums text-[#0f172b]">₹{fmtINR(finalAmount)}</b>
                        </div>

                        <div className="mt-auto grid gap-3">
                            <p className="m-0 text-center text-xs text-[#5b6b86]">You choose how it's paid in the next step</p>
                            <button type="button" onClick={handleProceedToPayment} disabled={items.length === 0}
                                className="w-full h-14 rounded-sm bg-[#155dfc] text-white text-base font-medium hover:bg-[#1447e6] transition-colors disabled:opacity-[.45] disabled:cursor-not-allowed">
                                {isEditMode ? 'Update invoice' : 'Pay'} · ₹{fmtINR(finalAmount)}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <PaymentDrawer isOpen={isDrawerOpen}
                mode='sale'
                onClose={() => setIsDrawerOpen(false)}
                subtotal={subtotal} billTotal={amountToPayNow}
                totalTax={taxAmount}
                originalBillTotal={calculatedOriginalTotal}
                onPaymentComplete={handleSavePaymentWithOptions}
                showBillOptions={!isEditMode}
                initialDiscount={invoiceToEdit?.manualDiscount}
                allowDueBilling={salesSettings?.allowDueBilling ?? false}
                isPartyNameEditable={!isEditMode}
                enableCustomerDetails={true}
                initialPartyName={isEditMode ? invoiceToEdit?.partyName : customerName}
                initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : customerPhone}
                onPartyChange={isEditMode ? undefined : handleDrawerPartyChange}
                initialPaymentMethods={isEditMode ? invoiceToEdit?.paymentMethods : undefined}
                totalItemDiscount={totalDiscount} totalQuantity={totalQuantity}
                requireCustomerName={salesSettings?.requireCustomerName}
                requireCustomerMobile={salesSettings?.requireCustomerMobile}
                initialPartyAddress={isEditMode ? invoiceToEdit?.partyAddress : ''}
                initialPartyGST={isEditMode ? invoiceToEdit?.partyGstin : ''}
                initialShippingName={isEditMode ? invoiceToEdit?.shippingName : ''}
                initialShippingNumber={isEditMode ? invoiceToEdit?.shippingNumber : ''}
                initialShippingAddress={isEditMode ? invoiceToEdit?.shippingAddress : ''}
                initialShippingGST={isEditMode ? invoiceToEdit?.shippingGST : ''}
                initialExpenses={isEditMode ? (invoiceToEdit?.expenses || (invoiceToEdit?.extraExpenseName ? [{ name: invoiceToEdit.extraExpenseName, amount: invoiceToEdit.extraExpenseAmount }] : [])) : []}
                initialNarration={isEditMode ? invoiceToEdit?.narration : ''}
                initialTransportDetails={isEditMode ? invoiceToEdit?.transportDetails : undefined}
                enableShippingDetails={salesSettings?.enableShippingDetails}
                enableExtraExpense={salesSettings?.enableExtraExpense}
                enableNarration={salesSettings?.enableNarration}
                enableTransportDetails={salesSettings?.enableTransportDetails ?? false}
                taxMode={activeTaxMode}
                onTaxModeChange={setActiveTaxMode}
                isTaxToggleLocked={(salesSettings?.gstScheme !== 'regular' || salesSettings?.lockTaxToggle)}
                totalMrp={totalMrp}
                maxBillDiscountValue={salesSettings?.maxBillDiscountValue}
                maxBillDiscountType={salesSettings?.maxBillDiscountType}
            />
            <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />

            <TierPickerModal
                item={tierPickerItem}
                isOpen={!!tierPickerItem}
                onClose={() => setTierPickerItem(null)}
                onSelect={(item, tier) => {
                    handleItemSelected(item, tier.id === '__base__' ? undefined : tier);
                }}
            />
            {renderCustomerModal()}
            {renderSavedBillModals()}
        </div>
    );
};

export default Sales;