import React, { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes.constants';
import { useAuth, useDatabase } from '../../../context/auth-context';
import BarcodeScanner from '../../../UseComponents/BarcodeScanner';
import PaymentDrawer from '../../../Components/PaymentDrawer';
import { Modal } from '../../../constants/Modal';
import { State, Variant } from '../../../enums';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import { CustomButton } from '../../../Components';
import { Spinner } from '../../../constants/Spinner';
import { FiTrash2, FiEdit, FiCamera, FiX, FiSearch, FiMenu } from 'react-icons/fi';
import { ItemEditDrawer } from '../../../Components/ItemDrawer';
import { usePurchaseSettings } from '../../../context/SettingsContext';
import { GenericCartList } from '../../../Components/CartItem';
import { GenericBillFooter } from '../../../Components/Footer';
import { IconScanCircle } from '../../../constants/Icons';
import { FiFileText, FiMaximize } from 'react-icons/fi'; // Add to existing react-icons
import { PurchaseGodownAssignModal } from '../../../Components/PurchaseGodownAssign';
import type { PurchaseItem, PurchaseDocumentData, Purchase } from './purchase.types';
import { calculatePurchaseTotals } from './purchase.calculations';
import {
  usePurchaseCart,
  usePurchaseCatalogueAndSettings,
  usePurchaseGodownAssignment,
  usePurchasePayment,
  usePurchaseSmartScan,
} from './hooks';

export type { PurchaseItem, PurchaseDocumentData, Purchase };

const PurchasePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loading: authLoading } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseSettings, loadingSettings: loadingPurchaseSettings } = usePurchaseSettings();

  const purchaseIdToEdit = location.state?.purchaseId as string | undefined;
  const isEditMode = !!purchaseIdToEdit;

  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);

  // `items`/`setItems` is declared here at the component level, rather than
  // owned by usePurchaseCart, because of a genuine circular dependency
  // between usePurchaseCatalogueAndSettings (needs setItems to hydrate the
  // cart when loading an existing purchase for editing) and usePurchaseCart
  // (needs availableItems/setAvailableItems FROM the catalogue hook for its
  // grid memos). See the long note in usePurchaseCart.ts for the full
  // reasoning. Behavior is unchanged from the original single-component
  // version — only which file declares this particular useState call.
  const [items, setItems] = useState<PurchaseItem[]>(() => {
    if (isEditMode) return [];
    try {
      const savedDraft = localStorage.getItem('purchase_cart_draft');
      return savedDraft ? JSON.parse(savedDraft) : [];
    } catch (e) {
      console.error("Error parsing purchase draft", e);
      return [];
    }
  });

  const {
    availableItems, setAvailableItems,
    pageIsLoading,
    error,
    invoiceNumber, setInvoiceNumber,
    invoiceDate, setInvoiceDate,
    billTaxType, setBillTaxType,
    itemGroupMap,
    editModeData,
  } = usePurchaseCatalogueAndSettings({
    currentUser,
    authLoading,
    dbOperations,
    purchaseSettings,
    loadingPurchaseSettings,
    purchaseIdToEdit,
    navigate,
    setItems,
  });

  const {
    cartListRef,
    selectedCategory, setSelectedCategory,
    gridSearchQuery, setGridSearchQuery,
    setCartSearchQuery,
    sortOrder, setSortOrder,
    duplicateItemPrompt, setDuplicateItemPrompt,
    selectedItemForEdit,
    isItemDrawerOpen,
    showClearCartConfirm, setShowClearCartConfirm,
    cartItemsAdapter,
    categories,
    sortedGridItems,
    addItemToCart,
    handlePriceChange,
    handleDiscountChange,
    handleDiscount2Change,
    handlePriceBlur,
    handleQuantityChange,
    handleDeleteItem,
    handleClearCart,
    handleConfirmClearCart,
    handleItemSelected,
    handleIncreaseExistingQuantity,
    handleAddAsNewLine,
    handleOpenEditDrawer,
    handleCloseEditDrawer,
    handleSaveSuccess,
  } = usePurchaseCart({
    isEditMode,
    purchaseSettings,
    items,
    setItems,
    availableItems,
    setAvailableItems,
    setModal,
  });

  const {
    godowns,
    isGodownAssignOpen, setIsGodownAssignOpen,
    godownAssignments, setGodownAssignments,
    isDrawerOpen, setIsDrawerOpen,
    assignableItemsForGodown,
    handleGodownAssignConfirm,
  } = usePurchaseGodownAssignment({
    currentUser,
    items,
  });

  const {
    fileInputRef, isScanning, scannedData, setScannedData, processFile, clearScannedData,
    showScannerModal, setShowScannerModal,
    isScannerOpen, setIsScannerOpen,
    handleApplySmartScan,
    handleBarcodeScanned,
  } = usePurchaseSmartScan({
    availableItems,
    setItems,
    addItemToCart,
    setModal,
  });

  const {
    subtotal,
    taxableAmount,
    taxAmount,
    roundingOffAmount,
    finalAmount,
    totalDiscount,
    totalQuantity,
    totalMrp
  } = useMemo(
    () => calculatePurchaseTotals(items, purchaseSettings, billTaxType),
    [items, purchaseSettings, billTaxType]
  );

  const {
    showPrintQrModal,
    handleProceedToPayment,
    handleSavePurchase,
    handleNavigateToQrPage,
    handleCloseQrModal,
  } = usePurchasePayment({
    currentUser,
    purchaseSettings,
    navigate,
    items,
    setItems,
    setAvailableItems,
    invoiceNumber,
    setInvoiceNumber,
    invoiceDate,
    billTaxType,
    editModeData,
    purchaseIdToEdit,
    subtotal,
    taxableAmount,
    taxAmount,
    roundingOffAmount,
    finalAmount,
    totalDiscount,
    setModal,
    godowns,
    setIsGodownAssignOpen,
    setIsDrawerOpen,
    godownAssignments,
    setGodownAssignments,
  });

  if (pageIsLoading) return (<div className="flex items-center justify-center h-screen"><Spinner /> <p className="ml-2">Loading...</p></div>);
  if (error) return (<div className="flex flex-col items-center justify-center h-screen text-red-600"><p>{error}</p><button onClick={() => navigate(-1)} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">Go Back</button></div>);

  const showTaxToggle = true; // Always show the manual tax toggle on the UI
  const displayTaxTotal = showTaxToggle && billTaxType !== 'exempt';
  const isCardView = purchaseSettings?.purchaseViewType === 'card';
  const isCardImageView = isCardView && (purchaseSettings?.cardViewWithPhoto !== false);
  // Checks if any item in the current cart has the unlinked warning flag
  const hasUnlinkedItems = items.some(item => item.name.includes('(Not in DB)'));

  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-200 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">

      {/* MOBILE: date left, title center, inv no right */}
      <div className="flex md:hidden items-center justify-between w-full mb-2">
        <div className="flex flex-col items-center">
          <input
            type="date" // 👈 Changed to "date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            // 👇 Changed width to w-32 and added cursor-pointer
            className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer"
          />
          <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">DATE</span>

        </div>
        <h1 className="text-2xl font-bold text-gray-800 text-center flex-1">
          {editModeData ? 'Edit Purchase' : (purchaseSettings?.voucherName ?? 'Purchase')}
        </h1>
        <div className="flex flex-col items-center">
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
          />
          <span className="text-[9px] text-gray-400 uppercase tracking-wide mt-0.5">Inv No</span>
        </div>
      </div>

      {/* DESKTOP */}
      <div className="hidden md:flex md:flex-row md:items-center w-full md:w-auto gap-1 md:gap-4 md:mb-0">
        <h1 className="text-2xl font-bold text-gray-800">
          {editModeData ? 'Edit Purchase' : (purchaseSettings?.voucherName ?? 'Purchase')}
        </h1>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">INV NO:</span>
            <input
              type="text"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-24 text-sm outline-none transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">DATE:</span>
            <input
              type="date" // 👈 Changed to "date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              // 👇 Changed width to w-32 and added cursor-pointer
              className="bg-transparent border-b border-gray-400 focus:border-blue-600 text-gray-800 font-bold text-center w-25 text-sm outline-none transition-colors cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Purchase / Purchase Return buttons*/}
    </div>
  );

  // --- CARD VIEW RENDER (GRID) ---
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
            <div className="bg-white p-6 rounded-sm shadow-xl w-full max-w-sm mx-4">
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
        {renderHeader()}

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          <div className="flex flex-col w-full md:w-3/4 h-full relative min-w-0 border-r border-gray-200 overflow-hidden">
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
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-sm text-xs whitespace-nowrap border transition flex-shrink-0
            ${selectedCategory === cat
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-gray-100 text-gray-700 border-gray-300'
                        }`}
                    >
                      {cat === 'All' ? 'All' : itemGroupMap[cat] || 'uncategorized'}
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

                  {/* Sort dropdown */}
                  {isSortOpen && (
                    <>
                      {/* backdrop to close on outside tap */}
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

              {/* ── MOBILE: expandable search bar + camera (below toolbar row) ── */}
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
                    className='bg-blue-600 text-white p-3 rounded-sm hover:bg-blue-700 transition-colors flex-shrink-0'
                    title="Scan Barcode"
                  >
                    <IconScanCircle width={22} height={22} />
                  </button>
                </div>
              )}

              {/* ── DESKTOP: original search bar (unchanged) ── */}
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
                <button
                  onClick={() => setIsScannerOpen(true)}
                  className='bg-blue-600 text-white p-3 rounded-sm hover:bg-blue-700 transition-colors'
                  title="Scan Barcode"
                >
                  <IconScanCircle width={22} height={22} />
                </button>
              </div>

              {/* ── DESKTOP: category pills (unchanged) ── */}
              <div className="hidden md:flex gap-2 overflow-x-auto px-3 pb-3 bg-white border-b border-gray-300">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-sm text-xs whitespace-nowrap border transition
          ${selectedCategory === cat
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                      }`}
                  >
                    {cat === 'All' ? 'All' : itemGroupMap[cat] || 'uncategorized'}
                  </button>
                ))}
              </div>

              {/* ── DESKTOP: sort bar (unchanged) ── */}
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
                <div className="justify-self-center" />
                <div className="justify-self-end">
                  {items.length > 0 && (
                    <button onClick={handleClearCart} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1">
                      <FiTrash2 /> Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5  bg-gray-100" style={{ gridAutoRows: 'auto', alignContent: 'start', gap: '14px', padding: '8px 14px' }}>
              {sortedGridItems.length === 0 ? (
                <div className="col-span-full text-center text-gray-500 mt-10 py-10 bg-white rounded-sm">
                  {gridSearchQuery ? (
                    <>
                      <p className="text-lg">No items found for "<span className="font-semibold">{gridSearchQuery}</span>"</p>
                      <p className="text-sm mt-2">Try searching with different keywords or scan barcode</p>
                    </>
                  ) : (
                    <>
                      <p className="text-lg">🔍 Start typing to search items</p>
                      <p className="text-sm mt-2">Search by name or scan barcode to add items</p>
                    </>
                  )}
                </div>
              ) : (
                sortedGridItems.map(item => {
                  const matchingCartItems = items.filter(i => i.productId === item.id);
                  const lastAddedCartItem = matchingCartItems[matchingCartItems.length - 1];
                  const isSelected = matchingCartItems.length > 0;
                  const quantity = lastAddedCartItem?.quantity || 0;
                  const mrp = item.mrp || 0;
                  const masterPurchasePrice = Number(item.purchasePrice || 0);
                  const masterPurchaseDiscount = (item as any).purchasediscount || 0;
                  const globalDefaultDiscount = purchaseSettings?.defaultDiscount ?? 0;

                  const salesPriceBase = Number((item as any).salesPrice || 0);
                  // const baseForCalc = masterPurchasePrice > 0 ? masterPurchasePrice
                  //   : mrp > 0 ? mrp
                  //   : salesPriceBase;

                  let effectiveDisplayPrice = 0;
                  let effectiveDiscPct = 0;

                  if (lastAddedCartItem) {
                    // Selected: show cart price and badge vs MRP or salesPrice
                    effectiveDisplayPrice = Number(lastAddedCartItem.purchasePrice ?? 0);
                    const badgeBase = mrp > 0 ? mrp : salesPriceBase;
                    effectiveDiscPct = badgeBase > 0 && effectiveDisplayPrice < badgeBase
                      ? Math.round(((badgeBase - effectiveDisplayPrice) / badgeBase) * 100)
                      : 0;
                  } else if (masterPurchasePrice > 0) {
                    effectiveDisplayPrice = masterPurchasePrice;
                    const badgeBase = mrp > 0 ? mrp : salesPriceBase;
                    effectiveDiscPct = badgeBase > 0 && masterPurchasePrice < badgeBase
                      ? Math.round(((badgeBase - masterPurchasePrice) / badgeBase) * 100)
                      : 0;
                  } else if (mrp > 0) {
                    if (masterPurchaseDiscount > 0) {
                      effectiveDisplayPrice = mrp * (1 - masterPurchaseDiscount / 100);
                      effectiveDiscPct = masterPurchaseDiscount;
                    } else if (globalDefaultDiscount > 0) {
                      effectiveDisplayPrice = mrp * (1 - globalDefaultDiscount / 100);
                      effectiveDiscPct = globalDefaultDiscount;
                    } else {
                      effectiveDisplayPrice = mrp;
                      effectiveDiscPct = 0;
                    }
                  } else if (salesPriceBase > 0) {
                    // No MRP, no master purchase price — use salesPrice as base
                    if (masterPurchaseDiscount > 0) {
                      effectiveDisplayPrice = salesPriceBase * (1 - masterPurchaseDiscount / 100);
                      effectiveDiscPct = masterPurchaseDiscount;
                    } else if (globalDefaultDiscount > 0) {
                      effectiveDisplayPrice = salesPriceBase * (1 - globalDefaultDiscount / 100);
                      effectiveDiscPct = globalDefaultDiscount;
                    } else {
                      effectiveDisplayPrice = salesPriceBase;
                      effectiveDiscPct = 0;
                    }
                  }

                  const cp = effectiveDisplayPrice;
                  const discPct = effectiveDiscPct;
                  const lineSubtotal = Math.round((Number(cp) * quantity) * 100) / 100;

                  // ── CARD WITH IMAGE ────────────────────────────────────────────────────
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
                        className={`bg-white rounded-sm flex flex-col w-full overflow-visible transition-all duration-200 relative group
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
                          <div className="mt-auto flex flex-col gap-1 pt-1 border-t border-gray-50" onClick={(e) => e.stopPropagation()}>

                            {/* Row 1: Price + MRP */}
                            <div className="flex items-baseline gap-1">
                              <span className="text-xs font-semibold text-gray-900">
                                ₹{Number(cp).toLocaleString('en-IN')}
                              </span>
                              {discPct > 0 && mrp > 0 && Number(cp) < mrp && (
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
                                  className="w-full h-[26px] rounded-md text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
                                >
                                  + Add
                                </button>
                              </>
                            ) : (
                              <div
                                className="flex items-center border border-gray-200 rounded-md overflow-hidden bg-white w-full"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (quantity > 1) handleQuantityChange(lastAddedCartItem.id, quantity - 1);
                                    else handleDeleteItem(lastAddedCartItem.id);
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
                  // ── CARD WITHOUT IMAGE (existing card — unchanged below) ───────────────
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
                              ₹{Number(cp).toLocaleString('en-IN')}
                            </span>
                            {discPct > 0 && mrp > 0 && Number(cp) < mrp && (
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
                        <div className="mt-auto pt-2 flex items-center justify-between gap-2 min-w-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>

                          {!isSelected ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); addItemToCart(item); }}
                              className="w-full py-1.5 rounded-md text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
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
                              <div className="flex items-center border border-gray-200 rounded-md overflow-hidden bg-white flex-shrink-0">
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (quantity > 1) handleQuantityChange(lastAddedCartItem.id, quantity - 1); else handleDeleteItem(lastAddedCartItem.id); }}
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
                })
              )}
            </div>
          </div>

          {/* Right Section - Purchase Summary (Same as before) */}
          <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
            <div className="flex-1 p-6 flex flex-col justify-end">
              <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Purchase Summary</h2>

              <GenericBillFooter
                isExpanded={true}
                onToggleExpand={() => { }}
                totalQuantity={totalQuantity}
                subtotal={subtotal}
                taxAmount={taxAmount}
                finalAmount={finalAmount}
                roundingOffAmount={roundingOffAmount}
                showTaxRow={displayTaxTotal}
                taxLabel="Total Tax"
                actionLabel={isEditMode ? 'Update' : 'Pay Now'}
                onActionClick={handleProceedToPayment}
                disableAction={items.length === 0 || hasUnlinkedItems}
              >
              </GenericBillFooter>
            </div>
          </div>

          {/* Mobile Footer */}
          <div className="md:hidden w-full flex-shrink-0">
            <GenericBillFooter
              isExpanded={isFooterExpanded}
              onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
              totalQuantity={totalQuantity}
              subtotal={subtotal}
              taxAmount={taxAmount}
              finalAmount={finalAmount}
              roundingOffAmount={roundingOffAmount}
              showTaxRow={displayTaxTotal}
              taxLabel="Total Tax"
              actionLabel={isEditMode ? 'Update' : 'Pay Now'}
              onActionClick={handleProceedToPayment}
              disableAction={items.length === 0 || hasUnlinkedItems}
            >
            </GenericBillFooter>
          </div>
        </div>

        <PaymentDrawer
          mode='purchase'
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          subtotal={subtotal}
          totalTax={taxAmount} // Ensure totalTax is passed
          billTotal={finalAmount}
          initialDiscount={editModeData?.manualDiscount}
          onPaymentComplete={handleSavePurchase}
          isPartyNameEditable={!editModeData}
          initialPartyName={editModeData ? editModeData.partyName : ''}
          initialPartyNumber={editModeData ? editModeData.partyNumber : ''}
          initialPaymentMethods={editModeData ? editModeData.paymentMethods : undefined}
          totalQuantity={totalQuantity}
          requireCustomerName={purchaseSettings?.requireSupplierName}
          requireCustomerMobile={purchaseSettings?.requireSupplierMobile}

          // 👇 ADD THESE 4 LINES TO BOTH DRAWERS:
          taxMode={billTaxType}
          onTaxModeChange={setBillTaxType}
          isTaxToggleLocked={false}
          totalMrp={totalMrp}
        />

        <PurchaseGodownAssignModal
          isOpen={isGodownAssignOpen}
          items={assignableItemsForGodown}
          godowns={godowns}
          companyId={currentUser?.companyId} // 👈 NEW
          onConfirm={handleGodownAssignConfirm}
          onClose={() => setIsGodownAssignOpen(false)}
        />

        <ItemEditDrawer
          item={selectedItemForEdit}
          isOpen={isItemDrawerOpen}
          onClose={handleCloseEditDrawer}
          onSaveSuccess={handleSaveSuccess}
        />
      </div >
    );
  }

  // --- LIST VIEW (Desktop Split / Mobile Stack) ---
  return (
    <div className="flex flex-col h-full bg-gray-100 w-full overflow-hidden">
      {/* SMART SCAN VERIFICATION MODAL */}
      {scannedData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
          <div className="bg-white p-4 rounded-sm shadow-xl w-full max-w-md mx-4">
            <h3 className="text-lg font-bold text-gray-800 border-b pb-2 mb-4 flex items-center gap-2">
              <FiFileText className="text-blue-600" /> Verify Extracted Items
            </h3>
            <div className="space-y-4">

              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Total Amount Found</label>
                <input
                  type="text"
                  value={scannedData.amount}
                  onChange={(e) => setScannedData({ ...scannedData, amount: e.target.value })}
                  className="w-full border border-gray-300 rounded-sm px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* --- ITEM LIST PREVIEW --- */}
              {scannedData.items && scannedData.items.length > 0 ? (
                <div className="mt-4 border-t pt-4">
                  <label className="block text-xs font-semibold text-gray-600 uppercase mb-2">
                    Items Found ({scannedData.items.length})
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-sm divide-y divide-gray-100">
                    {scannedData.items.map((item, idx) => (
                      <div key={idx} className="p-2 text-xs flex justify-between items-center bg-gray-50">
                        <span className="font-medium text-gray-800 truncate pr-2 w-3/5" title={item.name}>
                          {item.name}
                        </span>
                        <span className="text-gray-500 w-1/5 text-right">
                          {item.quantity} {item.unit}
                        </span>
                        <span className="text-blue-600 font-semibold w-1/5 text-right">
                          ₹{item.purchasePrice}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-gray-400 mt-1">
                    These items will be matched with your inventory when applied.
                  </p>
                </div>
              ) : (
                <div className="mt-4 border-t pt-4 text-center">
                  <p className="text-xs text-orange-600 font-medium bg-orange-50 p-2 rounded-sm border border-orange-100">
                    ⚠️ No items could be automatically extracted from this format.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
              <CustomButton variant={Variant.Outline} onClick={clearScannedData}>Cancel</CustomButton>
              <CustomButton variant={Variant.Filled} onClick={handleApplySmartScan}>Apply Items to Bill</CustomButton>
            </div>
          </div>
        </div>
      )}
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
          <div className="bg-white p-6 rounded-sm shadow-xl w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800">Clear Cart</h3>
            <p className="my-4 text-gray-600">Are you sure you want to remove all items?</p>
            <div className="flex justify-end gap-4 mt-6">
              <CustomButton variant={Variant.Outline} onClick={() => setShowClearCartConfirm(false)}>Cancel</CustomButton>
              <CustomButton variant={Variant.Filled} onClick={handleConfirmClearCart}>Clear</CustomButton>
            </div>
          </div>
        </div>
      )}
     {/* 👇 NEW: Duplicate item popup */}
      {duplicateItemPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4">
          <div className="bg-white rounded-sm shadow-2xl p-6 w-full max-w-sm text-center">
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

      {/* FULL SCREEN LOADING OVERLAY */}
      {isScanning && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center backdrop-blur-sm bg-white/70">
          {/* Animated Spinner */}
          <div className="w-12 h-12 border-4 border-gray-200 border-t-[#ff1894] rounded-full animate-spin mb-4 shadow-sm"></div>

          <h3 className="text-lg font-bold text-gray-800 animate-pulse">
            Analyzing Document...
          </h3>
          <p className="text-sm text-gray-500 mt-2 font-medium">
            Extracting items, prices, and discounts
          </p>

          {/* Sellar AI Badge */}
          <div className="mt-6 flex items-center gap-2 px-3 py-1.5 bg-[#ff1894]/10 rounded-full border border-[#ff1894]/20">
            {/* Glowing Dot */}
            <div className="relative flex h-2 w-2">
              <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff1894] opacity-75"></div>
              <div className="relative inline-flex rounded-full h-2 w-2 bg-[#ff1894]"></div>
            </div>

            <span className="text-[10px] uppercase font-bold tracking-wider text-black">
              Sellar AI
            </span>
          </div>
        </div>
      )}
      {/* CAMERA SELECTION MODAL */}
      {showScannerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
          <div className="bg-white p-6 rounded-sm shadow-xl w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">
              Choose Action
            </h3>

            <div className="grid grid-cols-2 gap-4">
              {/* OPTION 1: SCAN ITEM BARCODE */}
              <button
                onClick={() => {
                  setShowScannerModal(false);
                }}
                className="flex flex-col items-center justify-center p-6 border-2 border-gray-100 rounded-sm hover:border-blue-500 hover:bg-blue-50 transition-all group"
              >
                <FiMaximize className="text-3xl text-gray-400 group-hover:text-blue-600 mb-3" />
                <span className="text-sm font-semibold text-gray-700 group-hover:text-blue-700">
                  Scan Item
                </span>
              </button>

              {/* OPTION 2: UPLOAD SMART BILL */}
              <button
                onClick={() => {
                  setShowScannerModal(false);
                  // This triggers your existing Smart Scanner flow!
                  fileInputRef.current?.click();
                }}
                className="flex flex-col items-center justify-center p-6 border-2 border-gray-100 rounded-sm hover:border-blue-500 hover:bg-blue-50 transition-all group"
              >
                <FiFileText className="text-3xl text-gray-400 group-hover:text-blue-600 mb-3" />
                <span className="text-sm font-semibold text-gray-700 group-hover:text-blue-700">
                  Upload Bill
                </span>
              </button>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setShowScannerModal(false)}
                className="text-sm font-medium text-gray-500 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />

      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

        <div className="flex flex-col w-full md:w-3/4 h-full relative min-w-0 border-r border-gray-200">

          <div className="flex-shrink-0 p-2 bg-white border-b mt-2 rounded-sm md:mt-0">
            <div className="flex gap-2 items-end">

              <div className="flex-grow">
                <SearchableItemInput label="Search & Add Item" placeholder="Search by name or barcode..." items={availableItems} onItemSelected={handleItemSelected} isLoading={pageIsLoading} error={error} categories={categories}
                  onAddItem={(query) => navigate(ROUTES.ITEM_ADD, { state: { prefillName: query } })}
                  itemGroupMap={itemGroupMap}
                  onSearchChange={setCartSearchQuery}
                />
              </div>
              {/* Change your existing camera button's onClick to this: */}
              <button
                onClick={() => setShowScannerModal(true)}
                className="p-3 bg-gray-700 text-white rounded-md font-semibold transition hover:bg-gray-800"
              >
                <FiCamera size={20} />
              </button>

              {/* Keep your hidden file input exactly where it is! */}
              <input
                type="file"
                accept="image/*,application/pdf"
                ref={fileInputRef}
                onChange={processFile}
                className="hidden"
              />
            </div>
          </div>

          <div ref={cartListRef} className='flex-grow overflow-y-auto p-2 bg-gray-100'>
            <div className="flex justify-between items-center px-2 mb-2 border-b pt-1">
              <h3 className="text-gray-700 text-lg font-medium">Cart</h3>
              {items.length > 0 && (
                <div className="justify-self-end">{items.length > 0 && <button onClick={handleClearCart} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200 flex items-center gap-1"><FiTrash2 /> Clear</button>}</div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <GenericCartList
                items={cartItemsAdapter}
                availableItems={availableItems}
                basePriceKey="mrp"
                priceLabel="MRP"
                settings={{
                  enableRounding: false,
                  roundingInterval: 0,
                  enableItemWiseDiscount: true,
                  enableDiscount2: purchaseSettings?.enableDiscount2 ?? false,
                  lockDiscount: false,
                  lockPrice: false
                }}
                applyRounding={(val) => val}
                State={State}
                setModal={setModal}
                onOpenEditDrawer={handleOpenEditDrawer}
                onDeleteItem={handleDeleteItem}
                onDiscountChange={handleDiscountChange}
                onDiscount2Change={handleDiscount2Change}
                onCustomPriceChange={handlePriceChange}
                onCustomPriceBlur={handlePriceBlur}
                onQuantityChange={(id, qty) => handleQuantityChange(id, qty)}
              />
            </div>
          </div>

          <div className="md:hidden">
            <GenericBillFooter
              isExpanded={isFooterExpanded}
              onToggleExpand={() => setIsFooterExpanded(!isFooterExpanded)}
              totalQuantity={totalQuantity}
              subtotal={subtotal}
              taxAmount={taxAmount}
              finalAmount={finalAmount}
              roundingOffAmount={roundingOffAmount}
              showTaxRow={displayTaxTotal}
              taxLabel="Total Tax"
              actionLabel={isEditMode ? 'Update' : 'Pay Now'}
              onActionClick={handleProceedToPayment}
              disableAction={items.length === 0 || hasUnlinkedItems}
            >
            </GenericBillFooter>
          </div>

        </div>

        <div className="hidden md:flex w-1/4 flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10">
          <div className="flex-1 p-6 flex flex-col justify-end">
            <div className="mb-6 border-b pb-2 flex items-end justify-between">
              <h2 className="text-xl font-bold text-gray-800">Purchase Summary</h2>
              <span className="text-xs text-indigo-500 font-semibold">{items.length} Items</span>
            </div>

            <GenericBillFooter
              isExpanded={true}
              onToggleExpand={() => { }}
              totalQuantity={totalQuantity}
              subtotal={subtotal}
              taxAmount={taxAmount}
              finalAmount={finalAmount}
              roundingOffAmount={roundingOffAmount}
              showTaxRow={displayTaxTotal}
              taxLabel="Total Tax"
              actionLabel={isEditMode ? 'Update' : 'Pay Now'}
              onActionClick={handleProceedToPayment}
              disableAction={items.length === 0 || hasUnlinkedItems}
            >
            </GenericBillFooter>
          </div>
        </div>
      </div>

      <PaymentDrawer
        mode='purchase'
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={subtotal}
        totalTax={taxAmount} // Ensure totalTax is passed
        billTotal={finalAmount}
        initialDiscount={editModeData?.manualDiscount}
        onPaymentComplete={handleSavePurchase}
        isPartyNameEditable={!editModeData}
        initialPartyName={editModeData ? editModeData.partyName : ''}
        initialPartyNumber={editModeData ? editModeData.partyNumber : ''}
        initialPaymentMethods={editModeData ? editModeData.paymentMethods : undefined}
        totalQuantity={totalQuantity}
        requireCustomerName={purchaseSettings?.requireSupplierName}
        requireCustomerMobile={purchaseSettings?.requireSupplierMobile}

        // 👇 ADD THESE 4 LINES TO BOTH DRAWERS:
        taxMode={billTaxType}
        onTaxModeChange={setBillTaxType}
        isTaxToggleLocked={false}
        totalMrp={totalMrp}
      />

      <PurchaseGodownAssignModal
          isOpen={isGodownAssignOpen}
          items={assignableItemsForGodown}
          godowns={godowns}
          companyId={currentUser?.companyId} // 👈 NEW
          onConfirm={handleGodownAssignConfirm}
          onClose={() => setIsGodownAssignOpen(false)}
        />

      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isItemDrawerOpen}
        onClose={handleCloseEditDrawer}
        onSaveSuccess={handleSaveSuccess}
      />
      {hasUnlinkedItems && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-sm">
          <p className="text-xs text-red-600 font-medium text-center leading-tight">
            ⚠️ Cannot save bill. Please remove unlinked items or add them to your inventory.
          </p>
        </div>
      )}
      {showPrintQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/20">
          <div className="bg-white p-6 rounded-sm shadow-xl w-full max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800">Purchase Saved!</h3>
            <p className="my-4 text-gray-600">Print barcodes/QR codes for the items?</p>
            <div className="flex justify-end gap-4 mt-6">
              <CustomButton variant={Variant.Outline} onClick={handleCloseQrModal}>No</CustomButton>
              <CustomButton variant={Variant.Filled} onClick={handleNavigateToQrPage}>Yes, Print</CustomButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchasePage;
