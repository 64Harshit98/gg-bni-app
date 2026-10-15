import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ROUTES } from '../../../constants/routes.constants';
import { useAuth, useDatabase } from '../../../context/auth-context';
import BarcodeScanner from '../../../UseComponents/BarcodeScanner';
import PaymentDrawer from '../../../Components/PaymentDrawer';
import { Modal } from '../../../constants/Modal';
import { State } from '../../../enums';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import { Spinner } from '../../../constants/Spinner';
import {
  FiTrash2, FiEdit, FiCamera, FiX, FiSearch, FiChevronLeft, FiMoreHorizontal, FiList, FiGrid,
  FiFileText, FiMaximize, FiAlertTriangle, FiCheckCircle, FiInfo, FiPackage, FiPlus,
  FiChevronUp, FiChevronRight,
} from 'react-icons/fi';
import { ItemEditDrawer } from '../../../Components/ItemDrawer';
import ItemAdd from '../ItemAdd';
import { TierPickerModal } from '../../../Components/TierPickerModal';
import { hasMultiplePricing } from '../../utils/pricingUtils';
import type { Item } from '../../../constants/models';
import { usePurchaseSettings } from '../../../context/SettingsContext';
import { GenericCartList } from '../../../Components/CartItem';
import { GenericBillFooter } from '../../../Components/Footer';
import { IconScanCircle } from '../../../constants/Icons';
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

// ─────────────────────────────────────────────────────────────────────────────
// SELLAR design-system class tokens.
// Every colour is a CSS variable from the design system's tokens.css with the
// light-theme value as fallback, so this works whether or not tokens.css is
// loaded (and picks up dark theme automatically when it is).
// ─────────────────────────────────────────────────────────────────────────────
const SHADOW_CARD = '[box-shadow:0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]';
const SHADOW_FLOAT = '[box-shadow:0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]';

const CARD = `bg-[#ffffff] border border-[#dfe6fb] rounded-sm ${SHADOW_CARD}`;

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm border border-transparent text-sm font-medium whitespace-nowrap transition-colors cursor-pointer disabled:opacity-[.45] disabled:cursor-not-allowed';
const BTN_PRIMARY = `${BTN_BASE} bg-[#155dfc] text-white hover:bg-[#1447e6]`;
const BTN_SECONDARY = `${BTN_BASE} bg-[#ffffff] text-[#0f172b] border-[#7a8aa3] hover:bg-[#f5f7ff]`;
const BTN_DANGER_SOLID = `${BTN_BASE} bg-[#d5000c] text-white hover:opacity-90`;
const BTN_GHOST = `${BTN_BASE} text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]`;
const BTN_CLEAR =
  'inline-flex items-center gap-1.5 h-8 px-3 rounded-sm text-[13px] font-medium text-[#d5000c] hover:bg-[#ffeef0] transition-colors cursor-pointer';

const INPUT =
  'w-full h-10 px-3 text-sm rounded-sm border border-[#7a8aa3] bg-[#ffffff] text-[#0f172b] placeholder:text-[#5b6b86] focus:outline-none focus:ring-2 focus:ring-[#155dfc] focus:border-transparent';

const BADGE =
  'inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold tracking-wide whitespace-nowrap bg-[#e6eeff] text-[#155dfc]';

const OVERLINE = 'text-[11px] font-semibold uppercase tracking-[.08em] text-[#5b6b86]';

// header "meta" chips (invoice no / date)
const META_CHIP =
  'inline-flex items-center gap-2 h-9 px-3 rounded-sm border border-[#7a8aa3] bg-[#ffffff] text-[13px] text-[#0f172b] focus-within:ring-2 focus-within:ring-[#155dfc]';
const META_LABEL = 'text-[11px] font-semibold uppercase tracking-[.06em] text-[#5b6b86] whitespace-nowrap';
const META_INPUT = 'min-w-0 bg-transparent border-0 outline-none p-0 font-semibold text-[#0f172b] tabular-nums';

// dialogs: centred card on desktop, bottom sheet on mobile
const OVERLAY = 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[rgba(2,6,24,0.45)] sm:p-4';
const DIALOG = `w-full sm:max-w-sm bg-[#ffffff] text-[#0f172b] rounded-t-[20px] sm:rounded-sm border border-[#dfe6fb] ${SHADOW_FLOAT} p-5`;

// ── Card-view toolbar tokens (same as Sales card view) ──
const FIELD_CLS =
  'w-full h-12 md:h-[52px] pl-11 pr-10 bg-white border border-[#7a8aa3] rounded-sm text-[15px] font-medium text-[#0f172b] placeholder:text-[#5b6b86] outline-none transition-all focus:border-[#155dfc] focus:ring-4 focus:ring-[#e6eeff]';
const SCAN_BTN_CLS =
  'inline-flex items-center justify-center gap-2 h-12 md:h-[52px] w-12 md:w-auto md:px-4 flex-shrink-0 rounded-sm text-sm font-medium transition-colors bg-[#155dfc] text-white hover:bg-[#1447e6] md:bg-white md:text-[#0f172b] md:border md:border-[#7a8aa3] md:hover:bg-[#f5f7ff]';
const ICON_BTN_CLS =
  'inline-flex items-center justify-center w-10 h-10 rounded-sm text-[#45556c] hover:bg-[#f5f7ff] transition-colors flex-shrink-0';
const SORT_OPTIONS = [
  { value: 'az', label: 'A → Z' },
  { value: 'za', label: 'Z → A' },
  { value: 'price_asc', label: 'Price ↑' },
  { value: 'price_desc', label: 'Price ↓' },
] as const;
const chipCls = (active: boolean) =>
  `inline-flex items-center h-[34px] px-3.5 rounded-full border text-[13px] font-medium whitespace-nowrap flex-shrink-0 cursor-pointer transition-colors ${active
    ? 'bg-[#0f172b] border-[#0f172b] text-white'
    : 'bg-white border-[#7a8aa3] text-[#45556c] hover:bg-[#f5f7ff]'}`;
const SEG_WRAP = 'inline-flex p-[3px] gap-0.5 bg-[#f5f7ff] border border-[#dfe6fb] rounded-sm';
const segBtnCls = (active: boolean) =>
  `inline-flex items-center gap-1.5 h-7 px-3 rounded-sm text-xs font-medium transition-colors ${active
    ? 'bg-white text-[#155dfc] shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]'
    : 'text-[#45556c] hover:text-[#0f172b]'}`;

// Maps OCR-extracted unit text to one of the standard UNIT_OPTIONS values used in ItemAdd/ItemEditDrawer
const normalizeUnit = (rawUnit: string | undefined | null): string => {
  if (!rawUnit) return 'pcs';
  const u = rawUnit.trim().toLowerCase();
  if (['pcs', 'pc', 'piece', 'pieces', 'nos', 'no', 'unit', 'units', 'each', 'ea'].includes(u)) return 'pcs';
  if (['box', 'boxes', 'bx'].includes(u)) return 'box';
  if (['dozen', 'doz', 'dz'].includes(u)) return 'doz';
  if (['quintal', 'quintals', 'qtl', 'qt'].includes(u)) return 'qt';
  if (['ton', 'tons', 'tonne', 'tonnes'].includes(u)) return 'ton';
  if (['pkt', 'packet', 'packets', 'pack', 'pk'].includes(u)) return 'pkt';
  return 'pcs'; // safe fallback — always a valid dropdown option
};

const PurchasePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, loading: authLoading } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseSettings, loadingSettings: loadingPurchaseSettings } = usePurchaseSettings();

  const purchaseIdToEdit = location.state?.purchaseId as string | undefined;
  const isEditMode = !!purchaseIdToEdit;
  // "Add bill" from the party ledger opens a new purchase with the supplier filled in.
  const prefillParty = (location.state as { prefillParty?: { name: string; number: string } } | null)?.prefillParty;

  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [tierPickerItem, setTierPickerItem] = useState<Item | null>(null);
  const [isFooterExpanded, setIsFooterExpanded] = useState(false);
  const [isTabletBreakdownOpen, setIsTabletBreakdownOpen] = useState(false);
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [viewOverride, setViewOverride] = useState<'list' | 'card' | null>(null);
  const [showPhotos, setShowPhotos] = useState<boolean | null>(null);

  // `items`/`setItems` is declared here at the component level, rather than
  // owned by usePurchaseCart, because of a genuine circular dependency
  // between usePurchaseCatalogueAndSettings (needs setItems to hydrate the
  // cart when loading an existing purchase for editing) and usePurchaseCart
  // (needs availableItems/setAvailableItems FROM the catalogue hook for its
  // grid memos). See the long note in usePurchaseCart.ts for the full
  // reasoning. Behavior is unchanged from the original single-component
  // version — only which file declares this particular useState call.
  const [items, setItems] = useState<PurchaseItem[]>(() => {
    if (isEditMode || !currentUser?.companyId) return [];
    try {
      const savedDraft = localStorage.getItem(`purchase_cart_draft_${currentUser.companyId}`); // 👈 company-scoped
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
    companyId: currentUser?.companyId, // 👈 ADD
  });

  // "Create purchase" from the Restock report: add the picked items with their
  // order quantities once the catalogue is loaded, then drop the navigation
  // state so a refresh doesn't add them again.
  const restockHandled = useRef(false);
  useEffect(() => {
    const restockItems = (location.state as { restockItems?: { id: string; quantity: number }[] } | null)?.restockItems;
    if (restockHandled.current || isEditMode || !restockItems?.length || availableItems.length === 0) return;
    restockHandled.current = true;

    const startedAt = Date.now();
    const quantities = new Map(restockItems.map((r) => [r.id, Math.max(1, Math.round(r.quantity))]));
    restockItems.forEach(({ id }) => {
      const item = availableItems.find((a) => a.id === id);
      if (item) addItemToCart(item);
    });
    // addItemToCart adds each line with quantity 1 — set the order quantity on
    // just the lines added here (existing draft lines keep theirs).
    setItems((prev) =>
      prev.map((line) =>
        line.productId && (line.addedAt ?? 0) >= startedAt && quantities.has(line.productId)
          ? { ...line, quantity: quantities.get(line.productId)! }
          : line,
      ),
    );
    navigate(location.pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableItems, isEditMode]);

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

  // NEW: for unlinked scanned items — opens the ItemAdd form as a popup instead of the edit drawer
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [unlinkedPrefill, setUnlinkedPrefill] = useState<{
    name?: string; mrp?: number; purchasePrice?: number; purchasediscount?: number; tax?: number; barcode?: string; unit?: string;
  } | null>(null);
  const [unlinkedCartItemId, setUnlinkedCartItemId] = useState<string | null>(null);

  // Supplier — captured here, passed to the payment drawer as its starting party details
  const [supplierName, setSupplierName] = useState(prefillParty?.name ?? '');
const [supplierPhone, setSupplierPhone] = useState(prefillParty?.number ?? '');
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierDraft, setSupplierDraft] = useState({ name: '', phone: '' });
  const openSupplierModal = () => {
    setSupplierDraft({ name: supplierName, phone: supplierPhone });
    setShowSupplierModal(true);
  };
  const saveSupplier = () => {
    setSupplierName(supplierDraft.name.trim());
    setSupplierPhone(supplierDraft.phone.trim());
    setShowSupplierModal(false);
  };

  // "+ New item" — create a product without leaving the purchase
  const handleOpenNewItem = () => {
    setUnlinkedPrefill(null);
    setUnlinkedCartItemId(null);
    setShowAddItemModal(true);
  };
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
  const handleAddUnlinkedItemToInventory = (cartItem: PurchaseItem) => {
    const cleanName = cartItem.name.replace(/^⚠️\s*/, '').replace(/\s*\(Not in DB\)\s*$/, '');
    setUnlinkedPrefill({
      name: cleanName,
      mrp: cartItem.mrp,
      purchasePrice: Number(cartItem.purchasePrice) || 0,
      purchasediscount: cartItem.purchasediscount || 0,
      tax: cartItem.taxRate || 0,
      barcode: cartItem.barcode || '',
      unit: normalizeUnit(cartItem.unit),
    });
    setUnlinkedCartItemId(cartItem.id);
    setShowAddItemModal(true);
  };

  const handleUnlinkedItemCreated = (createdItem: any) => {
    // 1. Add to master inventory list so it shows up in the grid/search immediately
    setAvailableItems(prev => [...prev, createdItem as Item]);

    // 2. Re-link the cart's unlinked row to this real product
    setItems(prev => prev.map(ci => {
      if (ci.id !== unlinkedCartItemId) return ci;
      return {
        ...ci,
        name: createdItem.name,
        productId: createdItem.id,
        barcode: createdItem.barcode || ci.barcode,
        taxRate: createdItem.tax ?? ci.taxRate,
        stock: createdItem.stock || 0,
      };
    }));

    // Created from the "+ New item" button (not from a flagged cart row): put it straight into the cart
    if (!unlinkedCartItemId) addItemToCart(createdItem as Item);

    setShowAddItemModal(false);
    setUnlinkedPrefill(null);
    setUnlinkedCartItemId(null);
    setModal({
      message: unlinkedCartItemId
        ? `"${createdItem.name}" added to inventory and linked!`
        : `"${createdItem.name}" added to inventory and to this purchase!`,
      type: State.SUCCESS,
    });
    setTimeout(() => setModal(null), 1500);
  };

  const handleCloseUnlinkedModal = () => {
    setShowAddItemModal(false);
    setUnlinkedPrefill(null);
    setUnlinkedCartItemId(null);
  };

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

  if (pageIsLoading) return (
    <div className="flex items-center justify-center h-screen bg-[#eef2ff] text-[#45556c]">
      <Spinner /> <p className="ml-2">Loading...</p>
    </div>
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#eef2ff] px-4">
      <div className={`${CARD} p-6 max-w-sm w-full text-center`}>
        <div className="mx-auto mb-3 w-10 h-10 rounded-sm flex items-center justify-center bg-[#ffeef0] text-[#d5000c]">
          <FiAlertTriangle size={20} />
        </div>
        <p className="m-0 text-sm text-[#d5000c]">{error}</p>
        <button onClick={() => navigate(-1)} className={`${BTN_PRIMARY} mt-4`}>Go back</button>
      </div>
    </div>
  );

  const showTaxToggle = true; // Always show the manual tax toggle on the UI
  const displayTaxTotal = showTaxToggle && billTaxType !== 'exempt';
  const isCardView = (viewOverride ?? purchaseSettings?.purchaseViewType) === 'card';
  const isCardImageView = isCardView && (showPhotos ?? (purchaseSettings?.cardViewWithPhoto !== false));
  // Checks if any item in the current cart has the unlinked warning flag
  const hasUnlinkedItems = items.some(item => item.name.includes('(Not in DB)'));

  // Linked cart lines that have no MRP (flagged under the cart, like the design)
  const missingMrpItems = items.filter(
    i => i.productId && !i.name.includes('(Not in DB)') && !(Number((i as any).mrp) > 0)
  );

  const pageTitle = editModeData ? 'Edit purchase' : (purchaseSettings?.voucherName ?? 'Purchase');
  const actionLabel = isEditMode ? 'Update purchase' : 'Record purchase';
  const disableAction = items.length === 0 || hasUnlinkedItems;

  // Shared footer (Components/Footer) — purchase wording passed in as props
  const footerProps = {
    isExpanded: isFooterExpanded,
    onToggleExpand: () => setIsFooterExpanded(!isFooterExpanded),
    totalQuantity,
    subtotal,
    taxAmount,
    finalAmount,
    roundingOffAmount,
    showTaxRow: displayTaxTotal,
    taxLabel: 'GST input credit',
    subtotalLabel: `Items cost (Qty ${totalQuantity})`,
    showNetRow: false,
    extraRows: Number(totalMrp) > 0
      ? [{ label: 'MRP value', value: `₹${Number(totalMrp).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` }]
      : [],
    actionLabel,
    onActionClick: handleProceedToPayment,
    disableAction,
  };

  const fmtINR = (n: number) =>
    Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Tablet (768–1279): same bottom checkout bar as the mobile footer
  const renderTabletCheckoutBar = () => (
    <div className="hidden md:block xl:hidden flex-shrink-0 z-20 bg-[#ffffff] border-t border-[#dfe6fb]">
      {isTabletBreakdownOpen && (
        <div className="px-4 pt-3 space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-[#45556c]">Items cost</span>
            <span className="font-medium tabular-nums text-[#0f172b]">₹{fmtINR(subtotal)}</span>
          </div>
          {displayTaxTotal && (
            <div className="flex justify-between gap-4">
              <span className="text-[#45556c]">GST input credit</span>
              <span className="font-medium tabular-nums text-[#155dfc]">+ ₹{fmtINR(taxAmount)}</span>
            </div>
          )}
          {Number(roundingOffAmount) !== 0 && (
            <div className="flex justify-between gap-4">
              <span className="text-[#45556c]">Round off</span>
              <span className="font-medium tabular-nums text-[#0f172b]">₹{fmtINR(roundingOffAmount)}</span>
            </div>
          )}
          {Number(totalMrp) > 0 && (
            <div className="flex justify-between gap-4 border-t border-[#dfe6fb] pt-1.5">
              <span className="text-[#5b6b86]">MRP value</span>
              <span className="tabular-nums text-[#5b6b86]">₹{fmtINR(Number(totalMrp))}</span>
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-3 px-4 pt-3 pb-4">
        <button type="button" onClick={() => setIsTabletBreakdownOpen(v => !v)} aria-expanded={isTabletBreakdownOpen}
          className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer">
          <span className="flex items-center gap-1 text-xs text-[#45556c]">
            <span className="truncate">{totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}</span>
            <FiChevronUp size={14} className={`flex-shrink-0 transition-transform ${isTabletBreakdownOpen ? 'rotate-180' : ''}`} />
          </span>
          <b className="block text-xl leading-[26px] font-semibold tabular-nums text-[#0f172b] truncate">₹{fmtINR(finalAmount)}</b>
        </button>
        <button type="button" onClick={handleProceedToPayment} disabled={disableAction}
          className={`${BTN_PRIMARY} !h-12 !px-4 !text-[15px]`}>
          {actionLabel}
          <FiChevronRight size={16} />
        </button>
      </div>
    </div>
  );

  // ── Supplier card (design: supplier first, shown in the summary panel on desktop, on top below xl) ──
  const supplierDisplayName = editModeData ? (editModeData.partyName || '') : supplierName;
  const supplierDisplayPhone = editModeData ? (editModeData.partyNumber || '') : supplierPhone;

  const renderSupplierCard = () => (
    <div>
      <span className={`block mb-1.5 ${OVERLINE}`}>
        Supplier{purchaseSettings?.requireSupplierName && <span className="text-[#d5000c]"> *</span>}
      </span>
      <div className={`${CARD} flex items-center gap-2.5 p-2.5`}>
        <span className="inline-grid place-items-center w-8 h-8 flex-none rounded-sm bg-[#e9faef] text-[#008236]">
          <FiPackage size={18} />
        </span>
        <div className="flex-1 min-w-0">
          {supplierDisplayName ? (
            <>
              <div className="text-sm font-semibold text-[#0f172b] truncate">{supplierDisplayName}</div>
              {supplierDisplayPhone && (
                <div className="text-xs text-[#5b6b86] truncate">{supplierDisplayPhone}</div>
              )}
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-[#45556c]">No supplier added</div>
              <div className="text-xs text-[#5b6b86]">Add now, or at payment</div>
            </>
          )}
        </div>
        {!editModeData && (
          <button type="button" onClick={openSupplierModal} className={`${BTN_GHOST} !h-8 !px-3 text-[13px] flex-shrink-0`}>
            {supplierName ? 'Change' : 'Add'}
          </button>
        )}
      </div>
    </div>
  );

  // Desktop (xl+) summary panel
  const renderSummaryPanel = (itemCount?: number, showClear = false) => (
    <aside className="hidden xl:flex xl:w-[360px] flex-shrink-0 flex-col gap-4 h-full p-5 overflow-y-auto bg-[#ffffff] border-l border-[#dfe6fb] z-10">
      {renderSupplierCard()}
      <div className="border-t border-[#dfe6fb]" />
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-base font-semibold text-[#0f172b]">Purchase summary</h2>
        <div className="flex items-center gap-2">
          {itemCount !== undefined && <span className={BADGE}>{itemCount} {itemCount === 1 ? 'line' : 'lines'}</span>}
          {showClear && items.length > 0 && (
            <button type="button" onClick={handleClearCart} className={BTN_CLEAR}><FiTrash2 size={14} /> Clear</button>
          )}
        </div>
      </div>
      <GenericBillFooter {...footerProps} />
    </aside>
  );

  // ── Header: title + invoice no / date chips + view toggle ─────────────────
  const renderViewToggle = () => (
    <div role="group" aria-label="View" className={`ml-auto ${SEG_WRAP}`}>
      {([['list', 'List', FiList], ['card', 'Cards', FiGrid]] as const).map(([v, label, Icon]) => {
        const active = (isCardView ? 'card' : 'list') === v;
        return (
          <button key={v} type="button" aria-pressed={active} onClick={() => setViewOverride(v)} className={segBtnCls(active)}>
            <Icon size={14} /> {label}
          </button>
        );
      })}
    </div>
  );

  const renderHeader = () => (
    <header className="flex-shrink-0 bg-[#ffffff] border-b border-[#dfe6fb]">
      {/* MOBILE */}
      <div className="md:hidden flex items-center gap-2 h-14 px-2">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className={ICON_BTN_CLS}>
          <FiChevronLeft size={20} />
        </button>
        <h1 className="m-0 flex-1 min-w-0 text-lg font-semibold leading-tight text-[#0f172b]">
          <span className="block truncate">{pageTitle}</span>
          <span className="block text-xs font-normal text-[#5b6b86] truncate">
            {invoiceNumber}{invoiceDate ? ` · ${new Date(`${invoiceDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
          </span>
        </h1>
        <button type="button" onClick={() => setViewOverride(isCardView ? 'list' : 'card')}
          aria-label={isCardView ? 'List view' : 'Card view'} className={ICON_BTN_CLS}>
          {isCardView ? <FiList size={20} /> : <FiGrid size={20} />}
        </button>
        <button type="button" onClick={() => setIsMoreOpen(true)} aria-label="More" className={ICON_BTN_CLS}>
          <FiMoreHorizontal size={20} />
        </button>
      </div>

      {/* DESKTOP / TABLET */}
      <div className="hidden md:flex flex-wrap items-center gap-2 md:gap-3 px-4 py-3 md:px-6 md:py-4">
        <h1 className="m-0 mr-2 text-[22px] leading-[30px] font-semibold text-[#0f172b]">{pageTitle}</h1>
        <label className={META_CHIP}>
          <span className={META_LABEL}>Inv no</span>
          <input
            type="text"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            className={`${META_INPUT} w-24`}
          />
        </label>
        <label className={META_CHIP}>
          <span className={META_LABEL}>Date</span>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className={`${META_INPUT} w-[7.25rem] cursor-pointer`}
          />
        </label>
        {renderViewToggle()}
      </div>
    </header>
  );

  // Mobile "More" sheet: inv no / date, sort (card view), clear cart
  const renderMoreSheet = () =>
    !isMoreOpen ? null : (
      <div className="md:hidden fixed inset-0 z-[60] flex items-end bg-[rgba(2,6,24,0.45)]" onClick={() => setIsMoreOpen(false)}>
        <div className={`w-full bg-[#ffffff] rounded-t-2xl p-4 pb-6 flex flex-col gap-4 ${SHADOW_FLOAT}`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <h3 className="m-0 text-base font-semibold text-[#0f172b]">More</h3>
            <button type="button" onClick={() => setIsMoreOpen(false)} aria-label="Close" className={ICON_BTN_CLS}><FiX size={18} /></button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className={`${META_CHIP} min-w-0`}>
              <span className={META_LABEL}>Inv no</span>
              <input type="text" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className={`${META_INPUT} w-full`} />
            </label>
            <label className={`${META_CHIP} min-w-0`}>
              <span className={META_LABEL}>Date</span>
              <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className={`${META_INPUT} w-full`} />
            </label>
          </div>

          {isCardView && (
            <div>
              <span className={OVERLINE}>Sort</span>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {SORT_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setSortOrder(opt.value)}
                    className={`h-9 rounded-sm text-[13px] font-medium border transition-colors ${sortOrder === opt.value ? 'bg-[#e6eeff] border-[#155dfc] text-[#155dfc]' : 'bg-white border-[#7a8aa3] text-[#45556c]'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {items.length > 0 && (
            <button type="button" onClick={() => { setIsMoreOpen(false); handleClearCart(); }}
              className="inline-flex items-center justify-center gap-2 h-11 rounded-sm text-sm font-medium text-[#d5000c] bg-[#ffeef0]">
              <FiTrash2 size={16} /> Clear cart
            </button>
          )}
        </div>
      </div>
    );

  // Card-view search + scan (+ New item on desktop)
  const renderGridSearch = () => (
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
        />
        {gridSearchQuery && (
          <button type="button" onClick={() => setGridSearchQuery('')} aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-[#5b6b86] hover:text-[#0f172b] hover:bg-[#f5f7ff] transition-colors">
            <FiX size={16} />
          </button>
        )}
      </div>
      <button type="button" onClick={() => setIsScannerOpen(true)} title="Scan barcode" aria-label="Scan barcode" className={SCAN_BTN_CLS}>
        <IconScanCircle width={20} height={20} />
        <span className="hidden md:inline">Scan</span>
      </button>
      <button type="button" onClick={handleOpenNewItem} title="Create a new item" className={`${BTN_SECONDARY} hidden md:inline-flex !h-[52px]`}>
        <FiPlus size={18} /> New item
      </button>
    </div>
  );

  // ── Shared dialogs ────────────────────────────────────────────────────────
  const renderModal = () =>
    modal && (
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
    );

  const renderClearCartConfirm = () =>
    showClearCartConfirm && (
      <div className={OVERLAY}>
        <div className={DIALOG}>
          <h3 className="m-0 text-lg font-semibold">Clear cart</h3>
          <p className="mt-2 mb-0 text-sm text-[#45556c]">Are you sure you want to remove all items?</p>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowClearCartConfirm(false)} className={BTN_SECONDARY}>Cancel</button>
            <button onClick={handleConfirmClearCart} className={BTN_DANGER_SOLID}>Clear</button>
          </div>
        </div>
      </div>
    );

  // Drawers / pickers / add-item popup — identical in both views
  const renderCommonOverlays = () => (
    <>
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
        initialPartyName={editModeData ? editModeData.partyName : supplierName}
        initialPartyNumber={editModeData ? editModeData.partyNumber : supplierPhone}
        initialPaymentMethods={editModeData ? editModeData.paymentMethods : undefined}
        totalQuantity={totalQuantity}
        enableCustomerDetails={true}
        requireCustomerName={purchaseSettings?.requireSupplierName}
        requireCustomerMobile={purchaseSettings?.requireSupplierMobile}
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
      <TierPickerModal
        item={tierPickerItem}
        isOpen={!!tierPickerItem}
        onClose={() => setTierPickerItem(null)}
        onSelect={(item, tier) => {
          handleItemSelected(item, tier.id === '__base__' ? undefined : tier);   // 👈 CHANGED
        }}
      />
      {showSupplierModal && (
        <div className={OVERLAY}>
          <div className={DIALOG}>
            <h3 className="m-0 text-lg font-semibold">Supplier</h3>
            <p className="mt-1 mb-4 text-sm text-[#45556c]">These details are filled in at payment.</p>
            <div className="space-y-4">
              <div>
                <label className={`block mb-1.5 ${OVERLINE}`}>Name</label>
                <input
                  type="text"
                  value={supplierDraft.name}
                  onChange={(e) => setSupplierDraft({ ...supplierDraft, name: e.target.value })}
                  placeholder="Supplier name"
                  className={INPUT}
                  autoFocus
                />
              </div>
              <div>
                <label className={`block mb-1.5 ${OVERLINE}`}>Mobile</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={supplierDraft.phone}
                  onChange={(e) => setSupplierDraft({ ...supplierDraft, phone: e.target.value })}
                  placeholder="98188 37719"
                  className={INPUT}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowSupplierModal(false)} className={BTN_SECONDARY}>Cancel</button>
              <button onClick={saveSupplier} className={BTN_PRIMARY}>Save</button>
            </div>
          </div>
        </div>
      )}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(2,6,24,0.45)] px-4">
          <div className={`bg-[#ffffff] rounded-sm ${SHADOW_FLOAT} w-full max-w-2xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden`}>
            <ItemAdd
              isModal
              prefillData={unlinkedPrefill || undefined}
              onItemCreated={handleUnlinkedItemCreated}
              onCancel={handleCloseUnlinkedModal}
            />
          </div>
        </div>
      )}
    </>
  );

  // --- CARD VIEW RENDER (GRID) ---
  if (isCardView) {
    return (
      <div className="flex flex-col h-full bg-[#eef2ff] w-full overflow-hidden pb-0">
        {renderModal()}
        {renderClearCartConfirm()}

        <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />
        {renderHeader()}
        {renderMoreSheet()}

        <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
          <div className="flex flex-col w-full xl:flex-1 h-full relative min-w-0 overflow-hidden">
            <div className="flex-shrink-0 bg-[#ffffff] border-b border-[#dfe6fb]">

              {/* Supplier (below xl — on desktop it lives in the summary panel) */}
              <div className="xl:hidden px-3 pt-3 pb-1 md:px-5 md:pt-4">{renderSupplierCard()}</div>

              {/* Search + scan */}
              <div className="hidden md:block px-5 pt-4">{renderGridSearch()}</div>
              <div className="md:hidden px-4 pt-3">{renderGridSearch()}</div>

              {/* Category chips */}
              <div className="flex items-center gap-2 px-4 md:px-5 py-3">
                <div className="flex gap-1.5 overflow-x-auto flex-1 scrollbar-hide">
                  {categories.map((cat) => (
                    <button key={cat} type="button" onClick={() => setSelectedCategory(cat)} className={chipCls(selectedCategory === cat)}>
                      {cat === 'All' ? 'All' : itemGroupMap[cat] || 'uncategorized'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items count + sort (desktop) + Photos / Compact */}
              <div className="flex items-center gap-2 px-4 md:px-5 pb-3">
                <span className={OVERLINE}>Items · {sortedGridItems.length}</span>
                <span className="flex-1" />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)}
                  aria-label="Sort"
                  className="hidden md:block h-8 px-2 bg-white border border-[#7a8aa3] rounded-sm text-xs font-medium text-[#0f172b] outline-none focus:border-[#155dfc] focus:ring-4 focus:ring-[#e6eeff]"
                >
                  {SORT_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
                {/* Tablet only — no summary panel here, so Clear lives in the toolbar */}
                {items.length > 0 && (
                  <button type="button" onClick={handleClearCart} className={`${BTN_CLEAR} hidden md:inline-flex xl:hidden`}>
                    <FiTrash2 size={14} /> Clear
                  </button>
                )}
                <div role="group" aria-label="Photos" className={SEG_WRAP}>
                  {([[true, 'Photos'], [false, 'Compact']] as const).map(([val, label]) => (
                    <button key={label} type="button" aria-pressed={isCardImageView === val} onClick={() => setShowPhotos(val)} className={segBtnCls(isCardImageView === val)}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 bg-[#eef2ff] pb-6" style={{ gridAutoRows: 'auto', alignContent: 'start', gap: '14px', padding: '8px 14px' }}>
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
                          else handleAddOrPickTier(item);   // 👈 CHANGED
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
                              className="absolute top-1.5 left-1.5 z-10 bg-blue-600 text-white font-bold text-[9px] leading-tight px-1.5 py-[3px] rounded-sm shadow-sm"
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
                                    handleAddOrPickTier(item);   // 👈 CHANGED
                                  }}
                                  className="w-full h-[26px] rounded-sm text-[11px] font-medium text-gray-600 bg-gray-100 hover:bg-blue-50 hover:text-blue-600 border border-gray-200 transition-colors"
                                >
                                  + Add
                                </button>
                              </>
                            ) : (
                              <div
                                className="flex items-center border border-gray-200 rounded-sm overflow-hidden bg-white w-full"
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
                        else handleAddOrPickTier(item);
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
                        <div className="mt-auto pt-2 flex items-center justify-between gap-2 min-w-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>

                          {!isSelected ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddOrPickTier(item); }}
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

            {/* Mobile footer */}
            <div className="md:hidden flex-shrink-0">
              <GenericBillFooter {...footerProps} />
            </div>
            {/* Tablet checkout bar */}
            {renderTabletCheckoutBar()}
          </div>

          {/* Right Section — desktop only */}
          {renderSummaryPanel(items.length, true)}
        </div>

        {renderCommonOverlays()}
      </div>
    );
  }

  // --- LIST VIEW (Desktop Split / Tablet + Mobile Stack) ---
  return (
    <div className="flex flex-col h-full bg-[#eef2ff] w-full overflow-hidden">
      {/* SMART SCAN VERIFICATION MODAL */}
      {scannedData && (
        <div className={OVERLAY}>
          <div className={`${DIALOG} sm:!max-w-md`}>
            <h3 className="m-0 mb-4 flex items-center gap-3 text-lg font-semibold">
              <span className="inline-grid place-items-center w-8 h-8 rounded-sm bg-[#e6eeff] text-[#155dfc]">
                <FiFileText size={18} />
              </span>
              Verify extracted items
            </h3>
            <div className="space-y-4">

              <div>
                <label className={`block mb-1.5 ${OVERLINE}`}>Total amount found</label>
                <input
                  type="text"
                  value={scannedData.amount}
                  onChange={(e) => setScannedData({ ...scannedData, amount: e.target.value })}
                  className={INPUT}
                />
              </div>

              {/* --- ITEM LIST PREVIEW --- */}
              {scannedData.items && scannedData.items.length > 0 ? (
                <div className="pt-4 border-t border-[#dfe6fb]">
                  <label className={`block mb-2 ${OVERLINE}`}>
                    Items found ({scannedData.items.length})
                  </label>
                  <div className="max-h-48 overflow-y-auto border border-[#dfe6fb] rounded-sm divide-y divide-[#dfe6fb]">
                    {scannedData.items.map((item, idx) => (
                      <div key={idx} className="px-3 py-2 text-xs flex justify-between items-center bg-[#f5f7ff]">
                        <span className="font-medium text-[#0f172b] truncate pr-2 w-3/5" title={item.name}>
                          {item.name}
                        </span>
                        <span className="text-[#45556c] w-1/5 text-right tabular-nums">
                          {item.quantity} {item.unit}
                        </span>
                        <span className="text-[#155dfc] font-semibold w-1/5 text-right tabular-nums">
                          ₹{item.purchasePrice}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1.5 mb-0 text-[11px] text-[#5b6b86]">
                    These items will be matched with your inventory when applied.
                  </p>
                </div>
              ) : (
                <div className="flex items-start gap-2 p-2.5 rounded-sm text-[13px] leading-[19px] bg-[#fff3dd] text-[#bb4d00]">
                  <FiAlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                  <span>No items could be automatically extracted from this format.</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={clearScannedData} className={BTN_SECONDARY}>Cancel</button>
              <button onClick={handleApplySmartScan} className={BTN_PRIMARY}>Apply items to bill</button>
            </div>
          </div>
        </div>
      )}
      {renderModal()}
      {renderClearCartConfirm()}
      {/* Duplicate item popup */}
      {duplicateItemPrompt && (
        <div className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center bg-[rgba(2,6,24,0.45)] sm:p-4">
          <div className={`${DIALOG} text-center`}>
            <div className="mx-auto mb-4 w-12 h-12 rounded-sm flex items-center justify-center bg-[#e6eeff] text-[#155dfc]">
              <FiInfo size={24} />
            </div>
            <h3 className="m-0 mb-1 text-lg font-semibold">Item already in cart</h3>
            <p className="m-0 mb-6 text-sm text-[#45556c]">
              "<span className="font-medium text-[#0f172b]">{duplicateItemPrompt.item.name}</span>" is already in your cart
              {duplicateItemPrompt.existingCount > 1 ? ` (${duplicateItemPrompt.existingCount} times)` : ''}.
              What would you like to do?
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={handleIncreaseExistingQuantity} className={`${BTN_PRIMARY} w-full h-11`}>
                Increase quantity
              </button>
              <button onClick={handleAddAsNewLine} className={`${BTN_SECONDARY} w-full h-11`}>
                Add as new item
              </button>
              <button onClick={() => setDuplicateItemPrompt(null)} className={`${BTN_GHOST} w-full h-10 text-[13px]`}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL SCREEN LOADING OVERLAY */}
      {isScanning && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center backdrop-blur-sm bg-[#ffffff]/80">
          {/* Animated Spinner */}
          <div className="w-12 h-12 border-4 border-[#dfe6fb] border-t-[#155dfc] rounded-full animate-spin mb-4"></div>

          <h3 className="m-0 text-lg font-semibold text-[#0f172b] animate-pulse">
            Analyzing document...
          </h3>
          <p className="text-sm text-[#45556c] mt-2 mb-0">
            Extracting items, prices, and discounts
          </p>

          {/* Sellar AI Badge */}
          <div className="mt-6 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e6eeff] border border-[#dfe6fb]">
            {/* Glowing Dot */}
            <div className="relative flex h-2 w-2">
              <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#155dfc] opacity-75"></div>
              <div className="relative inline-flex rounded-full h-2 w-2 bg-[#155dfc]"></div>
            </div>

            <span className="text-[10px] uppercase font-semibold tracking-wider text-[#155dfc]">
              Sellar AI
            </span>
          </div>
        </div>
      )}
      {/* CAMERA SELECTION MODAL */}
      {showScannerModal && (
        <div className={OVERLAY}>
          <div className={DIALOG}>
            <h3 className="m-0 mb-4 text-lg font-semibold text-center">
              Choose action
            </h3>

            <div className="grid grid-cols-2 gap-3">
              {/* OPTION 1: SCAN ITEM BARCODE */}
              <button
                onClick={() => {
                  setShowScannerModal(false);
                  setIsScannerOpen(true); // <-- Add this line to trigger the scanner
                }}
                className="flex flex-col items-center justify-center gap-3 p-5 rounded-sm border border-[#dfe6fb] bg-[#ffffff] hover:border-[#155dfc] hover:bg-[#e6eeff] transition-colors"
              >
                <span className="inline-grid place-items-center w-10 h-10 rounded-sm bg-[#e6eeff] text-[#155dfc]">
                  <FiMaximize size={20} />
                </span>
                <span className="text-sm font-medium text-[#0f172b]">
                  Scan item
                </span>
              </button>

              {/* OPTION 2: UPLOAD SMART BILL */}
              <button
                onClick={() => {
                  setShowScannerModal(false);
                  // This triggers your existing Smart Scanner flow!
                  fileInputRef.current?.click();
                }}
                className="flex flex-col items-center justify-center gap-3 p-5 rounded-sm border border-[#dfe6fb] bg-[#ffffff] hover:border-[#155dfc] hover:bg-[#e6eeff] transition-colors"
              >
                <span className="inline-grid place-items-center w-10 h-10 rounded-sm bg-[#e9faef] text-[#008236]">
                  <FiFileText size={20} />
                </span>
                <span className="text-sm font-medium text-[#0f172b]">
                  Upload bill
                </span>
              </button>
            </div>

            <div className="mt-5 flex justify-center">
              <button
                onClick={() => setShowScannerModal(false)}
                className={`${BTN_GHOST} h-9 text-[13px]`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      <BarcodeScanner isOpen={isScannerOpen} onClose={() => setIsScannerOpen(false)} onScanSuccess={handleBarcodeScanned} />

      {renderHeader()}
      {renderMoreSheet()}

      <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">

        <div className="flex flex-col w-full xl:flex-1 h-full relative min-w-0">

          {/* Supplier (below xl — on desktop it lives in the summary panel) */}
          <div className="xl:hidden flex-shrink-0 px-3 pt-3 md:px-5 md:pt-4">{renderSupplierCard()}</div>

          {/* Search row: search field · Scan · New item */}
          <div className="flex-shrink-0 px-3 pt-3 md:px-5 md:pt-5">
            <div className="flex gap-2.5 items-end">
              <div className="flex-grow min-w-0">
                <SearchableItemInput label="Search & Add Item" placeholder="Search by name or barcode..." items={availableItems} onItemSelected={handleItemSelectedWrapper} isLoading={pageIsLoading} error={error} categories={categories}
                  onAddItem={(query) => navigate(ROUTES.ITEM_ADD, { state: { prefillName: query } })}
                  itemGroupMap={itemGroupMap}
                  onSearchChange={setCartSearchQuery}
                />
              </div>
              {/* Opens the "Choose action" dialog (scan item / upload bill) */}
              <button
                onClick={() => setShowScannerModal(true)}
                className={`${BTN_SECONDARY} !h-12 md:!h-[52px] !px-3 md:!px-4 flex-shrink-0`}
                title="Scan item or upload bill"
                aria-label="Scan item or upload bill"
              >
                <FiMaximize size={18} />
                <span className="hidden md:inline">Scan</span>
              </button>
              <button
                onClick={handleOpenNewItem}
                className={`${BTN_SECONDARY} !h-12 md:!h-[52px] !px-3 md:!px-4 flex-shrink-0`}
                title="Create a new item"
                aria-label="New item"
              >
                <FiPlus size={18} />
                <span className="hidden md:inline">New item</span>
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

          <div ref={cartListRef} className='flex-grow overflow-y-auto px-3 md:px-5 py-3 bg-[#eef2ff]'>
            {hasUnlinkedItems && (
              <div className="mb-3 flex items-start gap-2 p-2.5 rounded-sm text-[13px] leading-[19px] bg-[#fff3dd] text-[#bb4d00]">
                <FiAlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <span>
                  <b className="font-semibold">Some scanned items aren't in your inventory yet.</b>{' '}
                  Add them to inventory to record this purchase.
                </span>
              </div>
            )}

            <div className="flex justify-between items-center mb-2">
              <h3 className="m-0 flex items-center gap-2 text-base font-semibold text-[#0f172b]">
                Items
                {items.length > 0 && (
                  <span className={BADGE}>{items.length} {items.length === 1 ? 'line' : 'lines'} · Qty {totalQuantity}</span>
                )}
              </h3>
              {items.length > 0 && (
                <button onClick={handleClearCart} className={BTN_CLEAR}>
                  <FiTrash2 size={14} /> Clear
                </button>
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
                onItemNotFound={(cartItem) => handleAddUnlinkedItemToInventory(cartItem as PurchaseItem)}
                onDeleteItem={handleDeleteItem}
                onDiscountChange={handleDiscountChange}
                onDiscount2Change={handleDiscount2Change}
                onCustomPriceChange={handlePriceChange}
                onCustomPriceBlur={handlePriceBlur}
                onQuantityChange={(id, qty) => handleQuantityChange(id, qty)}
              />
            </div>

            {missingMrpItems.length > 0 && (
              <div className="mt-3 flex flex-wrap items-start gap-2 p-2.5 rounded-sm text-[13px] leading-[19px] bg-[#fff3dd] text-[#bb4d00]">
                <FiAlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <span className="flex-1">
                  <b className="font-semibold">
                    {missingMrpItems[0].name}{missingMrpItems.length > 1 ? ` and ${missingMrpItems.length - 1} more have` : ' has'} no MRP.
                  </b>{' '}
                  Set it so it prints on labels and sale bills — the stock will be added either way.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const orig = availableItems.find(a => a.id === missingMrpItems[0].productId);
                    if (orig) handleOpenEditDrawer(orig);
                  }}
                  className="flex-shrink-0 font-semibold underline underline-offset-2 hover:opacity-80"
                >
                  Set MRP
                </button>
              </div>
            )}
          </div>

          {/* Mobile checkout bar */}
          <div className="md:hidden flex-shrink-0">
            <GenericBillFooter {...footerProps} />
          </div>
          {/* Tablet checkout bar */}
          {renderTabletCheckoutBar()}

        </div>

        {/* Desktop summary */}
        {renderSummaryPanel(items.length)}
      </div>

      {renderCommonOverlays()}

      {showPrintQrModal && (
        <div className={OVERLAY}>
          <div className={DIALOG}>
            <div className="mb-3 w-10 h-10 rounded-sm flex items-center justify-center bg-[#e9faef] text-[#008236]">
              <FiCheckCircle size={20} />
            </div>
            <h3 className="m-0 text-lg font-semibold">Purchase saved</h3>
            <p className="mt-2 mb-0 text-sm text-[#45556c]">Print barcodes/QR codes for the items?</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={handleCloseQrModal} className={BTN_SECONDARY}>No</button>
              <button onClick={handleNavigateToQrPage} className={BTN_PRIMARY}>Yes, print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PurchasePage;