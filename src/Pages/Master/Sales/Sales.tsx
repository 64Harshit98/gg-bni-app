import React, { useState, useMemo } from 'react';
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
import { FiTrash2, FiX, FiEdit, FiCamera, FiDelete, FiSearch, FiMenu } from 'react-icons/fi';
import { GenericBillFooter } from '../../../Components/Footer';
import { IconScanCircle, IconPrint } from '../../../constants/Icons';
import QRCode from 'react-qr-code';
import { FiSend } from 'react-icons/fi';
import CalcDisplay from '../../../Components/CalcDisplay';
import type { SalesItem } from './sales.types';
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
    colClass?: string; // <--- Changed from colspan to colClass
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

const Sales: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser, loading: authLoading, hasPermission } = useAuth();
    const dbOperations = useDatabase();
    const { salesSettings: rawSettings, loadingSettings } = useSalesSettings();

    const invoiceToEdit = location.state?.invoiceData;
    const isEditMode = location.state?.isEditMode === true && !!invoiceToEdit;

    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

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

    const userRole = currentUser?.role || '';
    const isManager = userRole === ROLES.MANAGER || userRole === ROLES.OWNER;
    const hideMrp = (salesSettings as any)?.hideMrp ?? false;

    // View variables
    const isCardView = salesSettings?.salesViewType === 'card';
    const isCardImageView = isCardView && (salesSettings?.cardViewWithPhoto !== false);
    const isCalculatorView = salesSettings?.salesViewType === 'calculator';
    const showTaxRow = (activeTaxMode !== 'exempt');

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [isFooterExpanded, setIsFooterExpanded] = useState(false);

    const gstSchemeDisplay = salesSettings?.gstScheme;

    const { subtotal, totalDiscount, taxAmount, finalAmount, totalQuantity, totalMrp } = useMemo(
        () => calculateSaleTotals(items, salesSettings, activeTaxMode, gstSchemeDisplay),
        [items, salesSettings, activeTaxMode, gstSchemeDisplay]
    );

    const amountToPayNow = useMemo(() => finalAmount, [finalAmount]);

    const {
        savedBillData, setSavedBillData,
        sendingPdf,
        printingPdf,
        showPrintSubMenu, setShowPrintSubMenu,
        enableTriplicate,
        isDrawerOpen, setIsDrawerOpen,
        handleSendWhatsapp,
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

    if (pageIsLoading) return <div className="flex items-center justify-center h-screen"><Spinner /> <p className="ml-2">Loading...</p></div>;
    if (error) return <div className="flex flex-col items-center justify-center h-screen text-red-600"><p>{error}</p><button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go Back</button></div>;

    const renderHeader = () => (
        <>
            <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-200 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">

                {/* MOBILE: date left, title center, inv no right */}
                <div className="flex md:hidden items-center justify-between w-full mb-2">
                    <div className="flex flex-col items-center">
                        <input
                            type="date"
                            value={invoiceDate}
                            onChange={(e) => setInvoiceDate(e.target.value)}
                            className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer" // 👈 Widened to w-32 and added cursor-pointer
                        />
                        <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">DATE</span>
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800 text-center flex-1">
                        Sales
                    </h1>
                    <div className="flex flex-col items-center">
                        <input
                            type="text"
                            value={invoiceNumber}
                            onChange={(e) => {
                                isInvoiceNumberManuallyEdited.current = true;
                                setInvoiceNumber(e.target.value)
                            }}
                            className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
                        />
                        <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">INV NO</span>
                    </div>
                </div>

                {/* DESKTOP */}
                <div className="hidden md:flex md:flex-row md:items-center w-full md:w-auto gap-1 md:gap-4 md:mb-0">
                    <h1 className="text-2xl font-bold text-gray-800">
                        Sales
                    </h1>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">INV NO:</span>
                            <input
                                type="text"
                                value={invoiceNumber}
                                onChange={(e) => {
                                    isInvoiceNumberManuallyEdited.current = true;
                                    setInvoiceNumber(e.target.value);
                                }}
                                className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">DATE:</span>
                            <input
                                type="date"
                                value={invoiceDate}
                                onChange={(e) => setInvoiceDate(e.target.value)}
                                className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer" // 👈 Widened to w-32 and added cursor-pointer
                            />
                        </div>
                    </div>
                </div>

                {/* Sales / Sales Return buttons */}

            </div>
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

    if (isCardView) {
        return (
            <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-0">
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
                {showClearCartConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/20">
                        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm mx-4">
                            <h3 className="text-lg font-bold text-gray-800">Clear Cart</h3>
                            <p className="my-4 text-gray-600">Are you sure you want to remove all items?</p>
                            <div className="flex justify-end gap-4 mt-6">
                                <CustomButton variant={Variant.Outline} onClick={() => setShowClearCartConfirm(false)}>Cancel</CustomButton>
                                <CustomButton variant={Variant.Filled} onClick={handleConfirmClearCart}>Clear</CustomButton>
                            </div>
                        </div>
                    </div>
                )}
                <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
                <BarcodeLinkModal
                    isOpen={isBarcodeLinkModalOpen}
                    barcode={barcodeToLink}
                    items={availableItems}
                    isLinking={isLinkingBarcode}
                    onClose={closeBarcodeLinkModal}
                    onLink={handleLinkScannedBarcode}
                />
                {renderHeader()}
                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

                    {/* LEFT PANEL */}
                    <div className="flex flex-col w-full md:w-3/4 h-full relative min-w-0 border-r border-gray-200 overflow-hidden">

                        {/* Search / category bar */}
                        <div className="flex-shrink-0 bg-gray-50 border-b border-gray-200">

                            {/* ── MOBILE: single toolbar row ── */}
                            <div className="flex md:hidden items-center gap-2 px-3 py-2 bg-white border-b border-gray-200">

                                {/* Search toggle icon */}
                                <button
                                    onClick={() => setIsSearchOpen(prev => !prev)}
                                    className={`p-2 rounded-sm border transition-colors flex-shrink-0 ${isSearchOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-600 border-gray-300'}`}
                                    title="Search"
                                >
                                    <FiSearch size={16} />
                                </button>

                                {/* Category pills - scrollable, fills remaining space */}
                                <div className="flex gap-1.5 overflow-x-auto flex-1 scrollbar-hide">
                                    {categories.map(cat => (
                                        <button
                                            key={cat}
                                            onClick={() => setSelectedCategory(cat)}
                                            className={`px-2.5 py-1 rounded-sm text-xs whitespace-nowrap border transition flex-shrink-0
            ${selectedCategory === cat
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : 'bg-gray-100 text-gray-700 border-gray-300'
                                                }`}
                                        >
                                            {cat === 'All' ? 'All' : itemGroupMap[cat] || cat}
                                        </button>
                                    ))}
                                </div>

                                {/* Sort menu icon - rightmost, with dropdown */}
                                <div className="relative flex-shrink-0">
                                    <button
                                        onClick={() => setIsSortOpen(prev => !prev)}
                                        className={`p-2 rounded-sm border transition-colors ${isSortOpen ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-600 border-gray-300'}`}
                                        title="Sort"
                                    >
                                        <FiMenu size={16} />
                                    </button>

                                    {isSortOpen && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setIsSortOpen(false)} />
                                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-sm shadow-lg z-20 min-w-[100px]">
                                                {([
                                                    { value: 'az', label: 'A-Z' },
                                                    { value: 'za', label: 'Z-A' },
                                                    { value: 'price_asc', label: 'Price ↑' },
                                                    { value: 'price_desc', label: 'Price ↓' },
                                                ] as const).map(opt => (
                                                    <button
                                                        key={opt.value}
                                                        onClick={() => { setSortOrder(opt.value); setIsSortOpen(false); }}
                                                        className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors
                  ${sortOrder === opt.value
                                                                ? 'bg-blue-50 text-blue-600 font-semibold'
                                                                : 'text-gray-700 hover:bg-gray-50'
                                                            }`}
                                                    >
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* ── MOBILE: expandable search bar + camera ── */}
                            {isSearchOpen && (
                                <div className="flex md:hidden gap-2 items-center px-3 py-2 bg-white border-b border-gray-200">
                                    <div className="flex-grow relative">
                                        <input
                                            type="text"
                                            value={gridSearchQuery}
                                            onChange={(e) => setGridSearchQuery(e.target.value)}
                                            placeholder="Search items by name or barcode..."
                                            className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                                            autoComplete="off"
                                            autoFocus
                                        />
                                        {gridSearchQuery && (
                                            <button
                                                onClick={() => setGridSearchQuery('')}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                <FiX size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => setIsScannerOpen(true)}
                                        className='bg-transparent text-gray-700 p-3 border border-gray-700 rounded-sm font-semibold transition hover:bg-gray-800 hover:text-white flex-shrink-0'
                                        title="Scan Barcode"
                                    >
                                        <IconScanCircle width={20} height={20} />
                                    </button>
                                </div>
                            )}

                            {/* ── DESKTOP: original search bar ── */}
                            <div className="hidden md:flex p-3 bg-white gap-2 items-center">
                                <div className="flex-grow relative">
                                    <input
                                        type="text"
                                        value={gridSearchQuery}
                                        onChange={(e) => setGridSearchQuery(e.target.value)}
                                        placeholder="Search items by name or barcode..."
                                        className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-8"
                                        autoComplete="off"
                                    />
                                    {gridSearchQuery && (
                                        <button
                                            onClick={() => setGridSearchQuery('')}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            <FiX size={14} />
                                        </button>
                                    )}
                                </div>
                                <button onClick={() => setIsScannerOpen(true)} className='bg-transparent text-gray-700 p-3 border border-gray-700 rounded-sm font-semibold transition hover:bg-gray-800 hover:text-white' title="Scan Barcode">
                                    <IconScanCircle width={20} height={20} />
                                </button>
                            </div>

                            {/* ── DESKTOP: category pills ── */}
                            <div className="hidden md:flex gap-2 overflow-x-auto px-3 pb-3 bg-white border-b border-gray-300">
                                {categories.map(cat => (
                                    <button key={cat} onClick={() => setSelectedCategory(cat)}
                                        className={`px-3 py-1 rounded-sm text-xs whitespace-nowrap border transition ${selectedCategory === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'}`}>
                                        {cat === 'All' ? 'All' : itemGroupMap[cat] || cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* ── DESKTOP: sort bar ── */}
                        <div className="hidden md:flex gap-1.5 items-center px-3 py-2 bg-white border-b border-gray-200 overflow-x-auto flex-shrink-0">
                            <span className="text-xs text-gray-400 font-medium uppercase tracking-wide whitespace-nowrap flex-shrink-0">Sort:</span>
                            {([
                                { value: 'az', label: 'A → Z' },
                                { value: 'za', label: 'Z → A' },
                                { value: 'price_asc', label: 'Price ↑' },
                                { value: 'price_desc', label: 'Price ↓' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setSortOrder(opt.value)}
                                    className={`px-2.5 py-1 rounded-sm text-xs whitespace-nowrap border transition flex-shrink-0 ${sortOrder === opt.value
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
                                        }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <div className="px-3 pt-2 pb-2 bg-white border-b border-gray-100 grid grid-cols-3 items-center">
                            <div className="justify-self-start">
                                <h3 className="text-gray-700 font-medium">Cart</h3>
                            </div>
                            <div className="justify-self-center">
                                {salesSettings?.enableSalesmanSelection && (
                                    <select
                                        value={selectedWorker?.uid || ''}
                                        onChange={(e) => {
                                            if (e.target.value === 'ADD_NEW_SALESMAN') navigate(ROUTES.USER_ADD);
                                            else setSelectedWorker(workers.find(w => w.uid === e.target.value) || null);
                                        }}
                                        className="p-1 border rounded text-sm"
                                        disabled={!hasPermission(Permissions.ViewTransactions) || (isEditMode && !isManager)}
                                    >
                                        <option value="">Salesman</option>
                                        {workers.map(w => <option key={w.uid} value={w.uid}>{w.name}</option>)}
                                        <option value="ADD_NEW_SALESMAN" className="font-semibold bg-gray-100">+ Add New Salesman</option>
                                    </select>
                                )}
                            </div>
                            <div className="justify-self-end">
                                {items.length > 0 && (
                                    <button onClick={handleClearCart} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1">
                                        <FiTrash2 /> Clear
                                    </button>
                                )}
                            </div>
                        </div>
                        {/* Card grid — fills remaining height, scrollable */}
                        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5 bg-gray-100 pb-20"
                            style={{ gridAutoRows: 'auto', alignContent: 'start', gap: '14px', padding: '8px 14px' }}>
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
                                if (isCardImageView) {
                                    const imageUrl: string | undefined =
                                        (item as any).image ||
                                        (item as any).imageUrl ||
                                        (item as any).thumbnail ||
                                        (item as any).imageURL;

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => {
                                                if (isSelected) handleQuantityChange(lastAddedCartItem.id, quantity + 1);
                                                else addItemToCart(item);
                                            }}
                                            className={`bg-white rounded-sm flex flex-col w-full overflow-visible transition-all duration-200 relative group cursor-pointer
                                                ${isSelected
                                                    ? 'border-2 border-blue-400 shadow-md ring-1 ring-blue-100'
                                                    : 'border border-gray-100 hover:shadow-md hover:border-gray-200'}`}
                                            style={{ margin: '0 2px' }}
                                        >
                                            {/* ── Image Block ── */}
                                            <div className="relative w-full bg-gray-100 rounded-t-sm overflow-hidden" style={{ height: '140px' }}>

                                                {/* Centered image container */}
                                                <div className="w-full h-full flex items-center justify-center p-1.5">
                                                    {imageUrl ? (
                                                        <img
                                                            src={imageUrl}
                                                            alt={item.name}
                                                            className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                                                            loading="lazy"
                                                            onError={(e) => {
                                                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                                                const placeholder = (e.currentTarget as HTMLImageElement)
                                                                    .parentElement
                                                                    ?.querySelector<HTMLElement>('[data-no-image]');
                                                                if (placeholder) placeholder.style.display = 'flex';
                                                            }}
                                                        />
                                                    ) : null}

                                                    {/* Camera placeholder – shown when no image */}
                                                    <div
                                                        data-no-image
                                                        className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50"
                                                        style={{ display: imageUrl ? 'none' : 'flex' }}
                                                    >
                                                        <FiCamera className="text-gray-300" size={22} strokeWidth={1.4} />
                                                        <span className="text-[9px] text-gray-300 mt-1 uppercase tracking-wide font-medium">No Image</span>
                                                    </div>
                                                </div>

                                                {/* ── Discount badge – Blinkit style, top-left ── */}
                                                {discPct > 0 && (
                                                    <div
                                                        className="absolute top-1.5 left-1.5 z-10 bg-blue-600 text-white font-bold text-[9px] leading-tight px-1.5 py-[3px] rounded-md shadow-sm"
                                                    >
                                                        {discPct}% OFF
                                                    </div>
                                                )}

                                                {/* ✕ remove – shown only when in cart */}
                                                {isSelected && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteItem(lastAddedCartItem.id); }}
                                                        className="absolute top-1 right-1.5 z-20 w-5 h-5 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-[10px] font-bold shadow-sm border border-gray-100"
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>

                                            {/* Content block */}
                                            <div className="p-1.5 sm:p-2 flex flex-col flex-1 gap-0.5">
                                                {/* Item name — always 2 lines, fixed height */}
                                                <div className="flex items-start justify-between gap-1" style={{ minHeight: '28px' }}>
                                                    <p
                                                        className="text-[11px]  font-bold text-gray-900 leading-snug flex-1 overflow-hidden"
                                                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}
                                                        title={item.name}
                                                    >
                                                        {item.name.length > 45 ? item.name.slice(0, 45) : item.name}
                                                    </p>
                                                    <button onClick={(e) => { e.stopPropagation(); const orig = availableItems.find(a => a.id === item.id); if (orig) handleOpenEditDrawer(orig); }}
                                                        className="text-gray-400 hover:text-blue-600 flex-shrink-0 mt-0.5">
                                                        <FiEdit size={11} />
                                                    </button>
                                                </div>

                                                {/* Fixed bottom section — always same height regardless of name */}
                                                <div className="mt-auto flex flex-col gap-1 pt-1 border-t border-gray-50">

                                                    {/* Row 1: Price + MRP */}
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-xs font-semibold text-gray-900">
                                                            ₹{Number(sp).toLocaleString('en-IN')}
                                                        </span>
                                                        {discPct > 0 && mrp > 0 && Number(sp) < mrp && (
                                                            <span className="text-[10px] text-gray-400 line-through">
                                                                ₹{mrp.toLocaleString('en-IN')}
                                                            </span>
                                                        )}
                                                        {item.unit && (
                                                            <span className="text-[9px] text-gray-400 font-medium ml-0.5">
                                                                ({item.unit})
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Subtotal row — only when selected */}
                                                    {isSelected && (
                                                        <div className="flex items-center gap-1 border-t border-gray-50 pt-1 min-w-0">
                                                            <span className="text-[9px] uppercase text-gray-400 tracking-wide flex-shrink-0">Subtotal</span>
                                                            <span className="text-[10px] font-semibold text-blue-600 truncate">₹{lineSubtotal.toLocaleString('en-IN')}</span>
                                                        </div>
                                                    )}

                                                    {/* Row 3: Add button OR Quantity selector — always pinned last */}
                                                    {!isSelected ? (
                                                        <>
                                                            <div className="h-[18px] border-t border-gray-50" />
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    addItemToCart(item);
                                                                }}
                                                                className="w-full h-[26px] rounded-sm text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
                                                            >
                                                                + Add
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div
                                                            className="flex items-center border border-gray-200 rounded-sm overflow-hidden bg-white w-full"
                                                        >
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const moq = Number((item as any).moq) || 1;
                                                                    if (quantity > moq) {
                                                                        handleQuantityChange(lastAddedCartItem.id, quantity - 1);
                                                                    } else {
                                                                        handleDeleteItem(lastAddedCartItem.id);
                                                                    }
                                                                }}
                                                                className="h-7 flex-1 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                                            >−</button>
                                                            <span className="w-8 text-center text-[11px] font-semibold text-gray-800">{quantity}</span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleQuantityChange(lastAddedCartItem.id, quantity + 1);
                                                                }}
                                                                className="h-7 flex-1 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                                            >+</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                // ── CARD WITHOUT IMAGE ───────────────────────────────────────────────────────
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => {
                                            if (isSelected) handleQuantityChange(lastAddedCartItem.id, quantity + 1);
                                            else addItemToCart(item);
                                        }}
                                        className={`bg-white rounded-sm border flex flex-col overflow-visible transition-all relative
                                      ${isSelected ? 'border-blue-400 ring-1 ring-blue-100' : 'border-gray-100 hover:shadow-sm'}`}
                                        style={{ minHeight: 130 }}
                                    >
                                        {/* Discount badge - corner stamp */}
                                        {discPct > 0 && (
                                            <div
                                                className="absolute -top-px -left-px bg-blue-600 text-white text-[8px] font-medium leading-tight text-center z-10"
                                                style={{ borderRadius: '10px 0 8px 0', padding: '3px 6px', minWidth: 28 }}
                                            >
                                                {discPct}% OFF
                                            </div>
                                        )}

                                        {/* X button - only when selected */}
                                        {isSelected && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteItem(lastAddedCartItem.id); }}
                                                className="absolute top-1 right-2 text-gray-400 hover:text-red-500 transition-colors z-10 bg-transparent border-none cursor-pointer text-xs leading-none"
                                            >
                                                ✕
                                            </button>
                                        )}

                                        <div className="p-2.5 flex flex-col gap-1.5 flex-1">

                                            {/* Item name - 2 line clamp then ellipsis */}
                                            <p
                                                className="text-[12px] font-medium text-gray-900 leading-snug pr-4 min-h-[32px] flex items-start"
                                                style={{
                                                    marginTop: discPct > 0 ? 14 : 2,
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical' as any,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                }}
                                                title={item.name}
                                            >
                                                {item.name}
                                            </p>

                                            {/* Price + edit icon in same row */}
                                            <div className="flex items-center justify-between gap-1">
                                                <div className="flex items-baseline gap-1.5">
                                                    <span className="text-xs font-semibold text-gray-900">
                                                        ₹{Number(sp).toLocaleString('en-IN')}
                                                    </span>
                                                    {discPct > 0 && mrp > 0 && Number(sp) < mrp && (
                                                        <span className="text-[10px] text-gray-400 line-through">
                                                            ₹{mrp.toLocaleString('en-IN')}
                                                        </span>
                                                    )}
                                                    {item.unit && (
                                                        <span className="text-[9px] text-gray-400 font-medium ml-0.5">
                                                            ({item.unit})
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const orig = availableItems.find(a => a.id === item.id);
                                                        if (orig) handleOpenEditDrawer(orig);
                                                    }}
                                                    className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                                                >
                                                    <FiEdit size={10} />
                                                </button>
                                            </div>

                                            {/* Bottom - pinned, same height for all cards */}
                                            {/* Bottom - pinned, same height for all cards */}
                                            <div className="mt-auto pt-2 flex items-center justify-between gap-2 min-w-0 overflow-hidden">

                                                {!isSelected ? (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); addItemToCart(item); }}
                                                        className="w-full py-1.5 rounded-sm text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
                                                    >
                                                        + Add
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center justify-between gap-1 w-full min-w-0 overflow-hidden">
                                                        {/* Subtotal LEFT */}
                                                        <div className="text-left min-w-0 flex-shrink overflow-hidden">
                                                            <p className="text-[9px] uppercase text-gray-400 tracking-wide leading-none">Subtotal</p>
                                                            <p className="text-[11px] font-semibold text-blue-600 truncate">
                                                                ₹{lineSubtotal.toLocaleString('en-IN')}
                                                            </p>
                                                        </div>

                                                        {/* Quantity RIGHT */}
                                                        <div className="flex items-center border border-gray-200 rounded-sm overflow-hidden bg-white flex-shrink-0">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const moq = Number((item as any).moq) || 1;
                                                                    if (quantity > moq) {
                                                                        handleQuantityChange(lastAddedCartItem.id, quantity - 1);
                                                                    } else {
                                                                        handleDeleteItem(lastAddedCartItem.id);
                                                                    }
                                                                }}
                                                                className="w-6 h-7 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                                            >−</button>
                                                            <span className="w-5 text-center text-xs font-semibold text-gray-800">{quantity}</span>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleQuantityChange(lastAddedCartItem.id, quantity + 1); }}
                                                                className="w-6 h-7 flex items-center justify-center bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
                                                            >+</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
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
                                actionLabel={isEditMode ? 'Update Invoice' : 'Proceed to Pay'}
                                onActionClick={handleProceedToPayment}
                                disableAction={items.length === 0}>
                            </GenericBillFooter>
                        </div>
                    </div>

                    {/* RIGHT PANEL — desktop only */}
                    <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
                        <div className="flex-1 p-6 flex flex-col justify-end">
                            <div className="mb-6 border-b pb-2 flex items-end justify-between">
                                <h2 className="text-xl font-bold text-gray-800">Bill Summary</h2>
                                <span className="text-xs text-indigo-500 font-semibold">{items.length} Items</span>
                            </div>
                            <GenericBillFooter
                                isExpanded={true} onToggleExpand={() => { }}
                                totalQuantity={totalQuantity} subtotal={subtotal}
                                totalDiscount={totalDiscount} taxAmount={taxAmount}
                                finalAmount={finalAmount} showTaxRow={showTaxRow}
                                taxLabel={`Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`}
                                actionLabel={isEditMode ? 'Update Invoice' : 'Proceed to Pay'}
                                onActionClick={handleProceedToPayment}
                                disableAction={items.length === 0}
                            />
                        </div>
                    </div>
                </div>

                {/* Drawers & modals — rendered ONCE */}
                <PaymentDrawer
                    mode='sale' isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)}
                    enableCustomerDetails={true}
                    subtotal={subtotal} billTotal={amountToPayNow}
                    totalTax={taxAmount}
                    onPaymentComplete={handleSavePayment}
                    isPartyNameEditable={!isEditMode}
                    //enableCustomerDetails={salesSettings?.enableCustomerInfoToggle ?? true}
                    originalBillTotal={calculatedOriginalTotal}
                    initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''}
                    initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''}
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
                    initialPlaceOfSupply={isEditMode ? invoiceToEdit?.placeOfSupply : ''}      // <-- ADD THIS
                    initialShippingState={isEditMode ? invoiceToEdit?.shippingState : ''}
                    initialExpenses={isEditMode ? (invoiceToEdit?.expenses || (invoiceToEdit?.extraExpenseName ? [{ name: invoiceToEdit.extraExpenseName, amount: invoiceToEdit.extraExpenseAmount }] : [])) : []}
                    initialNarration={isEditMode ? invoiceToEdit?.narration : ''}
                    initialTransportDetails={isEditMode ? invoiceToEdit?.transportDetails : undefined}
                    enableShippingDetails={salesSettings?.enableShippingDetails}
                    enableExtraExpense={salesSettings?.enableExtraExpense}
                    enableNarration={salesSettings?.enableNarration}
                    enableTransportDetails={salesSettings?.enableTransportDetails ?? false}
                />
                <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />

                {savedBillData && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                        <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300">
                            <button onClick={handleCloseQrModal} className="self-end text-gray-400 hover:text-gray-600 mb-2"><FiX size={24} /></button>
                            <h3 className="text-xl font-bold text-gray-800 mb-1">Bill Saved!</h3>
                            <p className="text-sm text-gray-500 mb-4">Invoice #{savedBillData.number}</p>
                            <div className="bg-white p-2 border-2 border-gray-100 rounded-lg shadow-inner mb-4">
                                <QRCode value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${savedBillData.id}`} size={200} viewBox="0 0 256 256" />
                            </div>
                            <p className="text-center text-sm text-gray-600 mb-4">Ask customer to scan this QR code to download their bill.</p>
                            {savedBillData.invoiceData?.partyNumber ? (
                                <button onClick={() => handleSendWhatsapp(savedBillData.invoiceData)} disabled={sendingPdf}
                                    className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-50">
                                    {sendingPdf ? <Spinner /> : <><FiSend /> Send on WhatsApp</>}
                                </button>
                            ) : (
                                <p className="text-xs text-amber-600 mb-3 text-center bg-amber-50 p-2 rounded w-full border border-amber-200">No phone number provided for WhatsApp.</p>
                            )}
                            <button onClick={() => setShowPrintSubMenu(true)} disabled={printingPdf}
                                className="w-full bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-50">
                                {printingPdf ? <Spinner /> : <><IconPrint /> Print</>}
                            </button>
                            <button onClick={handleCloseQrModal} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Done</button>
                        </div>
                    </div>
                )}

                {showPrintSubMenu && savedBillData && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50" onClick={() => setShowPrintSubMenu(false)}>
                        <div className="bg-white rounded-sm p-6 w-full max-w-xs mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 text-center">Print Options</h3>
                            <div className="flex flex-col gap-3">
                                <button onClick={() => handlePrintAction(savedBillData.invoiceData, false)} className="w-full border py-2.5 rounded-sm font-bold text-sm">
                                    Print (Bill Only)
                                </button>
                                <button onClick={() => handlePrintAction(savedBillData.invoiceData, true)} className="w-full border border-blue-500 text-blue-600 py-2.5 rounded-sm font-bold text-sm">
                                    {enableTriplicate ? 'Print (Bill + 2 Duplicates)' : 'Print (Bill + Duplicate)'}
                                </button>
                                <button onClick={() => setShowPrintSubMenu(false)} className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-700 mt-1">
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (isCalculatorView) {
        return (
            // fixed inset-0 completely disables page scrolling
            <div className="fixed inset-0 flex flex-col bg-transparent w-full overflow-hidden">
                {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

                {/* Top Navigation */}
                <div className="shrink-0 bg-white border-b border-gray-200">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-center p-2 md:px-4 md:py-3">
                        <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left md:mb-0">
                            Sales
                        </h1>
                    </div>
                </div>

                {/* Main Calculator Area */}
                <div className="flex-1 flex flex-col items-center p-1 sm:p-4 min-h-0 w-full">
                    <div className="w-full max-w-sm mx-auto flex flex-col h-full">

                        {/* Live Summary Totals (Moved Above Calculator) */}
                        <div className="flex justify-between items-end px-2 py-1 shrink-0">
                            <div className="flex flex-col">
                                <span className="text-gray-500 font-medium text-sm mb-0.5">Grand Total</span>
                                <span className="text-xs text-indigo-500 font-semibold">{liveItemCount} Items</span>
                            </div>
                            <span className="text-4xl font-bold text-gray-900 tracking-tight">₹{liveTotal.toFixed(2)}</span>
                        </div>
                        {/* Enlarged Display Screen */}
                        <div
                            className="bg-white border border-gray-200 shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] px-4 pt-3 pb-2 flex flex-col items-end justify-end min-h-[8rem] sm:min-h-[10rem] max-h-[12rem] sm:max-h-[14rem] shrink-0 w-full cursor-text overflow-hidden relative"
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

                        <div className="grid grid-cols-8 sm:gap-2 flex-1 min-h-0 w-full">
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
                                        className={`h-full w-full flex items-center justify-center text-2xl sm:text-3xl font-medium transition-all active:scale-95 border select-none
        ${isFunction ? 'bg-red-50 border-red-300 text-red-500 hover:bg-red-100' :
                                                isOperator ? 'bg-indigo-50 border-indigo-300 text-indigo-600 hover:bg-indigo-100' :
                                                    'bg-white shadow-sm border-gray-300 text-gray-800 hover:bg-gray-50'}
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
                <div className="shrink-0 bg-transparent p-1 sm:p-4 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)] mb-16">
                    <div className="w-full max-w-sm mx-auto flex flex-col">
                        <button
                            onClick={handleCheckoutClick}
                            disabled={liveItemCount === 0}
                            className="w-full bg-emerald-500 rounded-xs hover:bg-emerald-600 disabled:bg-emerald-200 disabled:text-white text-white font-bold py-1 text-xl transition-colors shadow-md active:scale-[0.98]"
                        >
                            Proceed to Pay
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
                    initialPartyName={''}
                    initialPartyNumber={''}
                    totalItemDiscount={totalDiscount}
                    totalQuantity={totalQuantity}
                />

            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden pb-2">
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
            {showClearCartConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/20">
                    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm mx-4">
                        <h3 className="text-lg font-bold text-gray-800">Clear Cart</h3>
                        <p className="my-4 text-gray-600">Are you sure you want to remove all items?</p>
                        <div className="flex justify-end gap-4 mt-6">
                            <CustomButton variant={Variant.Outline} onClick={() => setShowClearCartConfirm(false)}>Cancel</CustomButton>
                            <CustomButton variant={Variant.Filled} onClick={handleConfirmClearCart}>Clear</CustomButton>
                        </div>
                    </div>
                </div>
            )}
            {/* 👇 NEW: Duplicate item popup — styled like the shared Modal component */}
            {duplicateItemPrompt && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
                    <div className="bg-white rounded-sm shadow-2xl p-6 w-full max-w-sm text-center">
                        {/* Icon */}
                        <div className="mx-auto mb-4 w-12 h-12 rounded-sm flex items-center justify-center bg-blue-100">
                            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                        </div>

                        <h3 className="text-lg font-bold text-gray-800 mb-1">Item Already in Cart</h3>
                        <p className="text-sm text-gray-600 mb-6">
                            "<span className="font-medium">{duplicateItemPrompt.item.name}</span>" is already in your cart
                            {duplicateItemPrompt.existingCount > 1 ? ` (${duplicateItemPrompt.existingCount} times)` : ''}.
                            What would you like to do?
                        </p>

                        <div className="flex flex-col gap-2">
                            <button
                                onClick={handleIncreaseExistingQuantity}
                                className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-sm font-semibold hover:bg-blue-700 transition-colors"
                            >
                                Increase Quantity
                            </button>
                            <button
                                onClick={handleAddAsNewLine}
                                className="w-full bg-gray-200 text-gray-800 py-2.5 px-4 rounded-sm font-semibold hover:bg-gray-300 transition-colors"
                            >
                                Add as New Item
                            </button>
                            <button
                                onClick={() => setDuplicateItemPrompt(null)}
                                className="w-full text-xs font-medium text-gray-400 hover:text-gray-600 mt-1"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
            <BarcodeLinkModal
                isOpen={isBarcodeLinkModalOpen}
                barcode={barcodeToLink}
                items={availableItems}
                isLinking={isLinkingBarcode}
                onClose={closeBarcodeLinkModal}
                onLink={handleLinkScannedBarcode}
            />
            {renderHeader()}

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

                <div className="flex flex-col w-full md:w-3/4 min-w-0 h-full relative">

                    <div className="flex-shrink-0 p-2 bg-white border-b pb-3 mb-2 rounded-sm md:mb-0 md:border-r border-gray-200">
                        <div className="flex gap-4 items-end w-full">
                            <div className="flex-grow">
                                <SearchableItemInput
                                    label="Search Item"
                                    placeholder="Search by name or barcode..."
                                    items={availableItems}
                                    onItemSelected={handleItemSelected}
                                    isLoading={pageIsLoading}
                                    error={error}
                                    onAddItem={(query) => navigate(ROUTES.ITEM_ADD, { state: { prefillName: query } })}
                                    categories={categories}
                                    itemGroupMap={itemGroupMap}
                                    onSearchChange={setCartSearchQuery}
                                />
                            </div>
                            <button onClick={() => setIsScannerOpen(true)} className='bg-gray-700 text-white p-3 border border-gray-700 rounded-sm font-semibold transition hover:bg-gray-800' title="Scan Barcode">
                                <IconScanCircle width={20} height={20} />
                            </button>
                        </div>
                    </div>

                    {/* Cart List Container */}
                    <div className="flex-1 flex flex-col bg-gray-100 overflow-y-hidden md:border-r border-gray-200">
                        <div className="pt-2 flex-shrink-0 grid grid-cols-3 items-center border-b pb-2 px-2">
                            <div className="justify-self-start"><h3 className="text-gray-700 font-medium">Cart</h3></div>
                            <div className="justify-self-center w-full flex justify-center">{salesSettings?.enableSalesmanSelection && <select
                                value={selectedWorker?.uid || ''}
                                onChange={(e) => {
                                    if (e.target.value === 'ADD_NEW_SALESMAN') {
                                        navigate(ROUTES.USER_ADD);
                                    } else {
                                        setSelectedWorker(workers.find(w => w.uid === e.target.value) || null);
                                    }
                                }}
                                className="p-1 border rounded text-sm"
                                disabled={!hasPermission(Permissions.ViewTransactions) || (isEditMode && !isManager)}
                            >
                                <option value="">Salesman</option>
                                {workers.map(w => <option key={w.uid} value={w.uid}>{w.name}</option>)}
                                <option value="ADD_NEW_SALESMAN" className="font-semibold border border-grey-300 bg-gray-100 hover:bg-gray-200">
                                    + Add New Salesman
                                </option>
                            </select>}</div>
                            <div className="justify-self-end">{items.length > 0 && <button onClick={handleClearCart} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1"><FiTrash2 /> Clear</button>}</div>
                        </div>
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
                                actionLabel={isEditMode ? 'Update Invoice' : 'Proceed to Pay'}
                                onActionClick={handleProceedToPayment}
                                disableAction={items.length === 0}
                            >
                            </GenericBillFooter>
                        </div>
                    </div>
                </div>

                <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
                    <div className="flex-1 p-6 flex flex-col justify-end">
                        <div className="mb-6 border-b pb-2 flex items-end justify-between">
                            <h2 className="text-xl font-bold text-gray-800">Bill Summary</h2>
                            <span className="text-xs text-indigo-500 font-semibold">{liveItemCount} Items</span>
                        </div>

                        {/* Desktop Toggle */}
                        <GenericBillFooter
                            isExpanded={true}
                            onToggleExpand={() => { }}
                            totalQuantity={totalQuantity}
                            subtotal={subtotal}
                            totalDiscount={totalDiscount}
                            taxAmount={taxAmount}
                            finalAmount={finalAmount}
                            showTaxRow={showTaxRow}
                            taxLabel={`Tax (${activeTaxMode === 'inclusive' ? 'Inc' : 'Exc'})`}
                            actionLabel={isEditMode ? 'Update Invoice' : 'Proceed to Pay'}
                            onActionClick={handleProceedToPayment}
                            disableAction={items.length === 0}
                        />
                    </div>
                </div>

            </div>

            <PaymentDrawer isOpen={isDrawerOpen}
                mode='sale'
                onClose={() => setIsDrawerOpen(false)}
                subtotal={subtotal} billTotal={amountToPayNow}
                totalTax={taxAmount}
                originalBillTotal={calculatedOriginalTotal}
                onPaymentComplete={handleSavePayment}
                initialDiscount={invoiceToEdit?.manualDiscount}
                allowDueBilling={salesSettings?.allowDueBilling ?? false}
                isPartyNameEditable={!isEditMode}
                enableCustomerDetails={true}
                initialPartyName={isEditMode ? invoiceToEdit?.partyName : ''}
                initialPartyNumber={isEditMode ? invoiceToEdit?.partyNumber : ''}
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
            />
            <ItemEditDrawer item={selectedItemForEdit} isOpen={isItemDrawerOpen} onClose={handleCloseEditDrawer} onSaveSuccess={handleSaveSuccess} />

            {savedBillData && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center animate-in fade-in zoom-in duration-300">
                        <button onClick={handleCloseQrModal} className="self-end text-gray-400 hover:text-gray-600 mb-2">
                            <FiX size={24} />
                        </button>
                        <h3 className="text-xl font-bold text-gray-800 mb-1">Bill Saved!</h3>
                        <p className="text-sm text-gray-500 mb-4">Invoice #{savedBillData.number}</p>

                        <div className="bg-white p-2 border-2 border-gray-100 rounded-lg shadow-inner mb-4">
                            <QRCode
                                value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${savedBillData?.id}`}
                                size={200}
                                viewBox={`0 0 256 256`}
                            />
                        </div>

                        <p className="text-center text-sm text-gray-600 mb-4">
                            Ask customer to scan this QR code to download their bill.
                        </p>

                        {/* --- NEW WHATSAPP BUTTON --- */}
                        {savedBillData.invoiceData?.partyNumber ? (
                            <button
                                onClick={() => handleSendWhatsapp(savedBillData.invoiceData)}
                                disabled={sendingPdf}
                                className="w-full bg-green-500 text-white py-3 rounded-lg font-semibold hover:bg-green-600 transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-50"
                            >
                                {sendingPdf ? <Spinner /> : <><FiSend /> Send on WhatsApp</>}
                            </button>
                        ) : (
                            <p className="text-xs text-amber-600 mb-3 text-center bg-amber-50 p-2 rounded w-full border border-amber-200">
                                No phone number provided for WhatsApp.
                            </p>
                        )}

                        {/* --- NEW PRINT BUTTON --- */}
                        <button
                            onClick={() => setShowPrintSubMenu(true)}
                            disabled={printingPdf}
                            className="w-full bg-gray-900 text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 mb-3 disabled:opacity-50"
                        >
                            {printingPdf ? <Spinner /> : <><IconPrint /> Print</>}
                        </button>

                        <button
                            onClick={handleCloseQrModal}
                            className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}

            {showPrintSubMenu && savedBillData && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50" onClick={() => setShowPrintSubMenu(false)}>
                    <div className="bg-white rounded-sm p-6 w-full max-w-xs mx-4 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4 text-center">Print Options</h3>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => handlePrintAction(savedBillData.invoiceData, false)} className="w-full border py-2.5 rounded-sm font-bold text-sm">
                                Print (Bill Only)
                            </button>
                            <button onClick={() => handlePrintAction(savedBillData.invoiceData, true)} className="w-full border border-blue-500 text-blue-600 py-2.5 rounded-sm font-bold text-sm">
                                {enableTriplicate ? 'Print (Bill + 2 Duplicates)' : 'Print (Bill + Duplicate)'}
                            </button>
                            <button onClick={() => setShowPrintSubMenu(false)} className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-700 mt-1">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Sales;