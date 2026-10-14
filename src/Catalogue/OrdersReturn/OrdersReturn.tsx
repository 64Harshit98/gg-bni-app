import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/auth-context';

import { ROUTES } from '../../constants/routes.constants';
import { Modal } from '../../constants/Modal';
import { State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import PaymentDrawer from '../../Components/PaymentDrawer';
import { ReturnListItem, RETURN_ITEM_GRID_BOUGHT } from '../../Components/ReturnListItem';
import type { Order, OrderItem } from '../Orders';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import { IconScanCircle } from '../../constants/Icons'
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import { GenericCartList } from '../../Components/CartItem';
import { applyRounding } from '../../Pages/Master/Sales'
import { ItemEditDrawer } from '../../Components/ItemDrawer';

import type { TransactionItem, ExchangeItem } from './ordersReturn.types';
import {
  useBarcodeScanning,
  useExchangeItems,
  useItemEditDrawer,
  useOrdersReturnLookupData,
  handleListChange,
  useReturnItemsSelection,
  useReturnSummary,
  useReturnTransaction,
  useSaleSelection,
} from './hooks';

/* ------------------------------------------------------------------ */
/* UI-only helpers (catreturn design: Catalogue orange tokens)         */
/*   primary #c2410c · hover #9a3412 · soft #ffedd5 · canvas #fff5ec   */
/*   border #f6e1d0 · control border #7a8aa3 · ink #0f172b             */
/* ------------------------------------------------------------------ */

const Ico: React.FC<{ d: string | string[]; size?: number; className?: string }> = ({ d, size = 18, className = '' }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={`flex-none ${className}`}
  >
    {(Array.isArray(d) ? d : [d]).map((p, i) => <path key={i} d={p} />)}
  </svg>
);

const ICON = {
  back: 'M15 18l-6-6 6-6',
  search: ['M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14z', 'm20 20-3.5-3.5'],
  order: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5M9 13h6M9 17h4'],
  ret: ['M9 14 4 9l5-5', 'M4 9h11a5 5 0 0 1 0 10h-3'],
  box: ['M21 8 12 3 3 8v8l9 5 9-5z', 'M3 8l9 5 9-5M12 13v8'],
  swap: ['M7 7h13l-3-3', 'M17 17H4l3 3'],
  check: 'M5 12.5l4.5 4.5L19 7',
  chevron: 'm6 9 6 6 6-6',
};

/** Round tinted icon chip used in card headers */
const Tint: React.FC<{ tone?: 'orange' | 'green'; children: React.ReactNode }> = ({ tone = 'orange', children }) => (
  <span
    className={`inline-grid h-8 w-8 flex-none place-items-center rounded-lg ${
      tone === 'green' ? 'bg-[#e9faef] text-[#008236]' : 'bg-[#ffedd5] text-[#9a3412]'
    }`}
  >
    {children}
  </span>
);

/** Card with a header row (icon chip, title, right-side slot) */
const Section: React.FC<{
  icon?: React.ReactNode;
  title: string;
  caption?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean; // body without padding (list / table sections)
}> = ({ icon, title, caption, right, children, className = '', flush = false }) => (
  <section className={`overflow-visible rounded-xl border border-[#f6e1d0] bg-white shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] ${className}`}>
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 border-b border-[#f6e1d0] px-4 py-3">
      {icon}
      <h2 className="text-[15px] font-semibold text-[#0f172b]">{title}</h2>
      {caption && <span className="ml-auto text-xs text-[#5b6b86]">{caption}</span>}
      {right && <div className={`w-full md:w-auto ${caption ? '' : 'md:ml-auto'}`}>{right}</div>}
    </div>
    <div className={flush ? '' : 'grid gap-3 p-4'}>{children}</div>
  </section>
);

const Fact: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0 bg-white px-3 py-2">
    <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">{label}</span>
    {children}
  </div>
);

const factInput =
  'w-full bg-transparent text-[13px] font-semibold text-[#0f172b] outline-none truncate tabular-nums focus:text-[#c2410c]';

const fieldBase =
  'flex h-10 items-center gap-2 rounded-lg border border-[#7a8aa3] bg-white px-3 text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#ea580c]';

// const scanBtn =
//   'grid h-10 w-10 flex-none place-items-center rounded-lg border border-[#7a8aa3] bg-white text-[#0f172b] transition-colors hover:bg-[#fff8f2]';

/** Compact variants used in card headers (search + scan next to the title) */
const fieldSm = fieldBase.replace('h-10', 'h-[34px]');
const scanSm =
  'grid h-[34px] w-[34px] flex-none place-items-center rounded-lg border border-[#7a8aa3] bg-white text-[#0f172b] transition-colors hover:bg-[#fff8f2]';

/** Return type as selectable cards (replaces <select>) */
const TypeCards: React.FC<{
  value: string;
  onChange: (v: string) => void;
  refundValue: string;
  disableCredit: boolean;
}> = ({ value, onChange, refundValue, disableCredit }) => {
  const opts = [
    { v: refundValue, t: 'Refund', s: 'Money back', disabled: false },
    { v: 'Exchange', t: 'Exchange', s: 'Swap items', disabled: false },
    { v: 'Credit Note', t: 'Credit note', s: 'Store credit', disabled: disableCredit },
  ];
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Transaction type">
      {opts.map((o) => {
        const on = value === o.v;
        return (
          <button
            key={o.t}
            type="button"
            disabled={o.disabled}
            aria-pressed={on}
            onClick={() => onChange(o.v)}
            className={`grid gap-0.5 rounded-lg border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              on
                ? 'border-2 border-[#c2410c] bg-[#ffedd5] px-[9px] py-[7px]'
                : 'border-[#7a8aa3] bg-white px-2.5 py-2 hover:bg-[#fff8f2]'
            }`}
          >
            <b className={`text-sm font-semibold ${on ? 'text-[#9a3412]' : 'text-[#0f172b]'}`}>{o.t}</b>
            <small className="text-[11px] leading-[15px] text-[#5b6b86]">{o.s}</small>
          </button>
        );
      })}
    </div>
  );
};

const OrdersReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { state } = useLocation();

  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [partyName, setPartyName] = useState<string>('');
  const [partyNumber, setPartyNumber] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Credit Note');
  const [originalSaleItems, setOriginalSaleItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);

  const [salesList, setSalesList] = useState<Order[]>([]);
  const [selectedSale, setSelectedSale] = useState<Order | null>(null);

  const [availableItems, setAvailableItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

  const { catalogueSettings, error } = useOrdersReturnLookupData({
    currentUser,
    setSalesList,
    setAvailableItems,
    setIsLoading,
  });

  const {
    setExchangeSearchQuery,
    handleRemoveFromList,
    handleDiscountChange,
    handleQuantityChange,
    handleCustomPriceChange,
    handleCustomPriceBlur,
    handleExchangeItemSelected,
    mappedExchangeItems,
  } = useExchangeItems({
    availableItems,
    exchangeItems,
    setExchangeItems,
    modeOfReturn,
  });

  const {
    searchSaleQuery, setSearchSaleQuery,
    isSalesDropdownOpen, setIsSalesDropdownOpen, salesDropdownRef,
    isCustomerDropdownOpen, customerDropdownRef,
    filteredSales,
    filteredCustomers,
    handleSelectSale,
    handleSelectCustomer,
    handleClear,
    paidAmountOnSale,
    isDueSale,
    refreshSelectedOrder,
  } = useSaleSelection({
    currentUser,
    locationState: state,
    navigate,
    salesList,
    setSalesList,
    selectedSale,
    setSelectedSale,
    setPartyName,
    partyNumber,
    setPartyNumber,
    setOriginalSaleItems,
    setSelectedReturnIds,
    setExchangeItems,
    setExchangeSearchQuery,
    setModeOfReturn,
  });

  const {
    returnItemSearchQuery, setReturnItemSearchQuery,
    itemsToReturn,
    filteredReturnItems,
    handleToggleReturnItem,
  } = useReturnItemsSelection({
    originalSaleItems,
    setOriginalSaleItems,
    selectedReturnIds,
    setSelectedReturnIds,
    modeOfReturn,
  });

  const {
    selectedItemForEdit, setSelectedItemForEdit,
    isItemDrawerOpen, setIsItemDrawerOpen,
    handleCloseEditDrawer,
    handleSaveSuccess,
  } = useItemEditDrawer({
    setAvailableItems,
    setExchangeItems,
  });

  const { scannerPurpose, setScannerPurpose, handleBarcodeScanned } = useBarcodeScanning({
    salesList,
    availableItems,
    handleSelectSale,
    handleExchangeItemSelected,
    setModal,
  });

  // --- CALCULATION LOGIC (UI) ---
  const {
    totalReturnGross,
    totalExchangeValue,
    finalBalance,
    discountDeducted
  } = useReturnSummary(itemsToReturn, exchangeItems, selectedSale, modeOfReturn);

  const {
    isDrawerOpen, setIsDrawerOpen,
    exchangeBalanceAction, setExchangeBalanceAction,
    saveReturnTransaction,
    handleProcessReturn,
    getBalanceLabel,
  } = useReturnTransaction({
    currentUser,
    navigate,
    selectedSale,
    setSelectedSale,
    setOriginalSaleItems,
    setSelectedReturnIds,
    itemsToReturn,
    exchangeItems,
    setExchangeItems,
    modeOfReturn,
    partyName,
    partyNumber,
    availableItems,
    finalBalance,
    isDueSale,
    setIsLoading,
    setModal,
    refreshSelectedOrder,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fff5ec] text-sm text-[#45556c]">
        <span className="mr-3 h-5 w-5 animate-spin rounded-full border-2 border-[#f6e1d0] border-t-[#c2410c]" />
        Loading...
      </div>
    );
  }

  // ---- UI-only derived values ----
  const isExchange = modeOfReturn === 'Exchange';
  const exchangeBlocked = isExchange && exchangeItems.length === 0;
  const balanceTone = finalBalance >= 0 ? 'text-[#9a3412]' : 'text-[#d5000c]';
  const balancePanel = finalBalance >= 0 ? 'bg-[#ffedd5]' : 'bg-[#ffeef0]';
  const actionLabel = `Process ${isExchange ? 'exchange' : modeOfReturn.toLowerCase()} · ₹${Math.abs(finalBalance).toFixed(2)}`;

  // Due on order: same formula as the Orders page (totalAmount - paidAmount)
  const dueOnOrder = selectedSale
    ? Number(Math.max(0, Number(selectedSale.totalAmount || 0) - Number(selectedSale.paidAmount || 0)).toFixed(2))
    : 0;
  // Earlier returns: Order.returnHistory (one entry per past return)
  const earlierReturnsCount = selectedSale?.returnHistory?.length ?? 0;

  const returnQty = itemsToReturn.reduce((s: number, i: any) => s + Number(i.quantity || 0), 0);

  /** "+1 Item A, +2 Item B +1 more" for the "What this return changes" box */
  const stockLine = (list: any[], sign: '+' | '−') =>
    list.length === 0
      ? '—'
      : list
          .slice(0, 2)
          .map((i: any) => `${sign}${Number(i.quantity || 0)} ${i.name ?? ''}`.trim())
          .join(', ') + (list.length > 2 ? ` +${list.length - 2} more` : '');

  /** Balance row: "Credit due ₹x" with the existing action <select> when exchange leaves a positive balance */
  const renderBalance = (big?: boolean) => (
    <div className={`flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 ${balancePanel}`}>
      {isExchange && finalBalance > 0 ? (
        <select
          value={exchangeBalanceAction}
          onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
          className="h-[34px] cursor-pointer rounded-lg border border-[#7a8aa3] bg-white px-2 text-[13px] font-medium text-[#0f172b] outline-none focus:border-[#ea580c]"
        >
          <option value="Credit Note">Credit Due</option>
          <option value="Cash Refund">Cash Refund</option>
        </select>
      ) : (
        <span className={`text-sm font-medium ${balanceTone}`}>{getBalanceLabel()}</span>
      )}
      <b className={`${big ? 'text-[26px] leading-8' : 'text-[22px] leading-7'} font-semibold tracking-tight tabular-nums ${balanceTone}`}>
        ₹{Math.abs(finalBalance).toFixed(2)}
      </b>
    </div>
  );

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#fff5ec] text-[#0f172b]">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      {/* === HEADER === */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-[#f6e1d0] bg-white px-3 py-2.5 md:px-6 md:py-3.5">
        <button
          onClick={() => navigate(ROUTES.ORDERDETAILS)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-[#7a8aa3] bg-white text-[#45556c] transition-colors hover:bg-[#fff8f2] hover:text-[#0f172b]"
          title="Back"
          aria-label="Back"
        >
          <Ico d={ICON.back} size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold leading-6 md:text-[22px] md:leading-[30px]">Order return</h1>
          <p className="text-xs leading-4 text-[#5b6b86]">Process refunds &amp; exchanges</p>
        </div>
      </header>

      {/* MAIN CONTENT WRAPPER */}
      <div className="relative flex flex-1 flex-col overflow-hidden md:flex-row">

        {/* --- LEFT PANEL --- */}
        <div className="relative w-full flex-1 space-y-3.5 overflow-y-auto bg-[#fff5ec] p-3 pb-24 md:w-[65%] md:p-5 md:pb-5">

          {/* Original order */}
          <Section
            icon={<Tint><Ico d={ICON.order} /></Tint>}
            title="Original order"
            caption={selectedSale ? `Order found · ${selectedSale.orderId}` : undefined}
          >
            <div className="relative" ref={salesDropdownRef}>
              <label htmlFor="search-sale" className="sr-only">Search original sale</label>
              <div className="flex gap-2">
                <div className={`${fieldBase} flex-1`}>
                  <Ico d={ICON.search} size={16} />
                  <input
                    id="search-sale"
                    type="text"
                    value={searchSaleQuery}
                    onChange={(e) => {
                      let value = e.target.value;

                      // Agar input sirf numbers hai, toh use 10 digits tak limit karo
                      if (/^\d*$/.test(value)) {
                        value = value.slice(0, 10);
                      }

                      setSearchSaleQuery(value);
                      setIsSalesDropdownOpen(true);
                    }}
                    onFocus={() => setIsSalesDropdownOpen(true)}
                    placeholder={
                      selectedSale
                        ? `(${selectedSale.orderId})`
                        : "Search order no., customer name or phone"
                    }
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-[#0f172b] outline-none placeholder:font-normal placeholder:text-[#5b6b86]"
                    autoComplete="off"
                    readOnly={!!selectedSale}
                  />
                </div>
                {selectedSale && (
                  <button
                    onClick={handleClear}
                    className="h-10 whitespace-nowrap rounded-lg px-3 text-sm font-medium text-[#45556c] transition-colors hover:bg-[#fff8f2] hover:text-[#0f172b]"
                  >
                    Clear
                  </button>
                )}
              </div>

              {isSalesDropdownOpen && !selectedSale && (
                <div className="absolute top-full z-20 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-[#f6e1d0] bg-white shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]">
                  {filteredSales.map((sale) => {
                    // Calculate total from items instead of using static totalAmount
                    const calculatedAmount = (sale.items || []).reduce(
                      (sum: number, item: any) =>
                        sum +
                        Number(
                          item.finalPrice ??
                          item.amount ??
                          (item.salesPrice || item.mrp || 0) * (item.quantity || 0)
                        ),
                      0
                    );

                    return (
                      <div
                        key={sale.id}
                        className="cursor-pointer border-b border-[#f6e1d0] px-3 py-2.5 transition-colors last:border-0 hover:bg-[#fff8f2]"
                        onClick={() => handleSelectSale(sale)}
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate text-sm font-semibold">
                            {sale.userName}{' '}
                            <span className="font-normal text-[#5b6b86]">({sale.orderId || 'N/A'})</span>
                          </p>
                          <p className="flex-none text-sm font-semibold tabular-nums text-[#9a3412]">₹{calculatedAmount.toFixed(2)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedSale && (
              <div className="grid grid-cols-2 gap-px rounded-lg border border-[#f6e1d0] bg-[#f6e1d0] md:grid-cols-4">
                <Fact label="Order">
                  <b className="block truncate text-[13px] font-semibold tabular-nums">{selectedSale.orderId}</b>
                </Fact>
                <Fact label="Customer">
                  <input type="text" value={partyName} readOnly className={factInput} />
                </Fact>

                {/* Phone (with customer dropdown, unchanged behaviour) */}
                <div className="relative min-w-0 bg-white px-3 py-2" ref={customerDropdownRef}>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">Phone</span>
                  <input
                    type="text"
                    value={partyNumber}
                    readOnly
                    className={factInput}
                    autoComplete="off"
                    placeholder="Search customer by number or name..."
                    maxLength={10}
                  />
                  {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                    <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-[#f6e1d0] bg-white shadow-[0_10px_28px_rgba(21,48,140,0.14)]">
                      {filteredCustomers.map((customer) => (
                        <div
                          key={customer.id}
                          className="cursor-pointer border-b border-[#f6e1d0] p-2.5 last:border-0 hover:bg-[#fff8f2]"
                          onClick={() => handleSelectCustomer(customer)}
                        >
                          <p className="text-sm font-semibold">{customer.name}</p>
                          <p className="text-xs text-[#5b6b86]">{customer.number}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Fact label="From">
                  <b className="block truncate text-[13px] font-semibold">Catalogue order</b>
                </Fact>
                <Fact label="Paid">
                  <b className="block text-[13px] font-semibold tabular-nums text-[#008236]">₹{paidAmountOnSale.toFixed(2)}</b>
                </Fact>
                <Fact label="Due on order">
                  <b className="block text-[13px] font-semibold tabular-nums">₹{dueOnOrder.toFixed(2)}</b>
                </Fact>
                <Fact label="Earlier returns">
                  <b className="block text-[13px] font-semibold">
                    {earlierReturnsCount === 0 ? 'None' : `${earlierReturnsCount} ${earlierReturnsCount === 1 ? 'return' : 'returns'}`}
                  </b>
                </Fact>
                <Fact label="Return date">
                  <input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className={factInput}
                  />
                </Fact>
              </div>
            )}
          </Section>

          {selectedSale && (
            <>
              {/* Select return items */}
              <Section
                flush
                icon={<Tint><Ico d={ICON.ret} /></Tint>}
                title="Select return items"
                right={
                  <div className="flex items-center gap-2">
                    <div className={`${fieldSm} flex-1 md:w-60 md:flex-none`}>
                      <Ico d={ICON.search} size={16} />
                      <input
                        type="text"
                        value={returnItemSearchQuery}
                        onChange={(e) => setReturnItemSearchQuery(e.target.value)}
                        placeholder="Search items in this order"
                        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0f172b] outline-none placeholder:text-[#5b6b86]"
                        autoComplete="off"
                      />
                    </div>
                    <button onClick={() => setScannerPurpose('item')} className={scanSm} aria-label="Scan item">
                      <IconScanCircle width={18} height={18} />
                    </button>
                  </div>
                }
              >
                {originalSaleItems.length === 0 ? (
                  <p className="m-3 rounded-lg bg-[#fff8f2] px-3 py-4 text-center text-sm text-[#5b6b86]">
                    No returnable items found for this order.
                  </p>
                ) : (
                  <>
                    {/* Desktop table header (matches ReturnListItem grid) */}
                    <div className={`hidden xl:grid ${RETURN_ITEM_GRID_BOUGHT} gap-x-3 border-b border-[#f6e1d0] bg-[#fff8f2] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]`}>
                      <span />
                      <span>Item</span>
                      <span className="text-right">Bought</span>
                      <span>Return qty</span>
                      <span className="text-right">Price</span>
                      <span className="text-right">Subtotal</span>
                    </div>

                    <div className="flex flex-col gap-2 p-3 xl:gap-0 xl:p-0">
                      {filteredReturnItems.map((item) => (
                        <ReturnListItem
                          key={item.id}
                          item={item}
                          isSelected={selectedReturnIds.has(item.id)}
                          onToggle={handleToggleReturnItem}
                          onQuantityChange={(id, val) => {
                            const item = originalSaleItems.find(i => i.id === id);
                            if (!item) return;
                            const safeQty = Math.min(Math.max(1, val), (item as any).originalQuantity);
                            handleListChange(setOriginalSaleItems, id, 'quantity', safeQty);
                          }}
                          showMrp={true}
                          theme="orange"
                          showBought
                        />
                      ))}
                    </div>

                    <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 rounded-b-xl border-t border-[#f6e1d0] bg-[#fff8f2] px-4 py-2.5 text-[13px] text-[#45556c]">
                      <span>Selected <b className="tabular-nums text-[#0f172b]">{selectedReturnIds.size} of {originalSaleItems.length}</b> items</span>
                      <span>Return qty <b className="tabular-nums text-[#0f172b]">{returnQty}</b></span>
                      <span>Return value <b className="tabular-nums text-[#0f172b]">₹{totalReturnGross.toFixed(2)}</b></span>
                    </div>
                  </>
                )}
              </Section>

              {/* Transaction type (mobile only; desktop has it in the summary panel) */}
              <Section
                className="md:hidden"
                icon={<Tint><Ico d={ICON.swap} /></Tint>}
                title="Transaction type"
              >
                <TypeCards
                  value={modeOfReturn}
                  onChange={setModeOfReturn}
                  refundValue="Refund"
                  disableCredit={isDueSale}
                />
              </Section>

              {/* Exchange section */}
              {isExchange && (
                <Section
                  icon={<Tint tone="green"><Ico d={ICON.box} /></Tint>}
                  title="Exchange items"
                  right={
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1 md:w-72 md:flex-none">
                        <SearchableItemInput
                          label=""
                          placeholder="Search inventory..."
                          // FIX: availableItems ko map karke purchasePrice ensure karein
                          items={availableItems.map((item: any) => ({
                            ...item,
                            purchasePrice: item.purchasePrice ?? 0 // Agar undefined hai toh 0 set kar do
                          }))}
                          onItemSelected={handleExchangeItemSelected}
                          isLoading={isLoading}
                          error={error}
                          onSearchChange={setExchangeSearchQuery}
                        />
                      </div>
                      <button onClick={() => setScannerPurpose('item')} className={scanSm} aria-label="Scan item">
                        <IconScanCircle width={18} height={18} />
                      </button>
                    </div>
                  }
                >
                  {exchangeItems.length > 0 && (
                    <div className="overflow-hidden rounded-lg border border-[#f6e1d0]">
                      <div className="border-b border-[#f6e1d0] bg-[#fff8f2] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">
                        Exchange cart · {exchangeItems.length} {exchangeItems.length === 1 ? 'item' : 'items'}
                      </div>

                      <div className="max-h-60 overflow-y-auto bg-[#fff8f2]">
                        <GenericCartList<any>
                          items={mappedExchangeItems}
                          availableItems={availableItems as any}
                          basePriceKey="mrp"
                          priceLabel="MRP"
                          settings={{
                            enableRounding: false,
                            roundingInterval: 1,
                            enableItemWiseDiscount: catalogueSettings?.enableItemWiseDiscount ?? false,
                            enableDiscount2: false,
                            lockDiscount: false,
                            lockPrice: false,
                            hideMrp: false
                          }}
                          applyRounding={applyRounding}
                          State={State}
                          setModal={setModal}

                          onOpenEditDrawer={(item: any) => {
                            const realItem = availableItems.find(i => i.id === item.id);
                            if (!realItem) {
                              console.error("Original item not found");
                              return;
                            }

                            setSelectedItemForEdit(realItem as any);
                            setIsItemDrawerOpen(true);
                          }}

                          onDeleteItem={(id: any) => handleRemoveFromList(setExchangeItems, id)}
                          onDiscountChange={handleDiscountChange}
                          onDiscount2Change={() => { }}
                          onCustomPriceChange={handleCustomPriceChange}
                          onCustomPriceBlur={handleCustomPriceBlur}
                          onQuantityChange={handleQuantityChange}
                        />
                      </div>
                    </div>
                  )}

                  {isItemDrawerOpen && selectedItemForEdit && (
                    <ItemEditDrawer
                      item={selectedItemForEdit}
                      isOpen={isItemDrawerOpen}
                      onClose={handleCloseEditDrawer}
                      onSaveSuccess={handleSaveSuccess}
                      itemGroupRoute={`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`}
                    />
                  )}
                </Section>
              )}

              {/* Mobile only: inline summary (above footer) */}
              <Section className="md:hidden" title="Return summary">
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-[#45556c]">Return value</dt>
                  <dd className="text-right tabular-nums">₹{totalReturnGross.toFixed(2)}</dd>
                  {discountDeducted > 0 && (
                    <>
                      <dt className="text-xs text-[#d5000c]">Less bill discount</dt>
                      <dd className="text-right text-xs tabular-nums text-[#d5000c]">- ₹{discountDeducted.toFixed(2)}</dd>
                    </>
                  )}
                  {isExchange && (
                    <>
                      <dt className="text-[#45556c]">Exchange value</dt>
                      <dd className="text-right tabular-nums text-[#9a3412]">₹{totalExchangeValue.toFixed(2)}</dd>
                    </>
                  )}
                </dl>
                {renderBalance()}
              </Section>
            </>
          )}
        </div>

        {/* --- RIGHT PANEL (Desktop only) --- */}
        <aside className="relative z-10 hidden h-full w-[35%] max-w-[380px] flex-col border-l border-[#f6e1d0] bg-white p-5 md:flex">
          {selectedSale ? (
            <div className="flex h-full flex-col gap-3.5 overflow-y-auto">
              <h2 className="text-base font-semibold">Return summary</h2>

              {/* Transaction Type */}
              <div>
                <span className="mb-1 block text-xs font-medium text-[#45556c]">Transaction type</span>
                <TypeCards
                  value={modeOfReturn}
                  onChange={setModeOfReturn}
                  refundValue="Cash Refund"
                  disableCredit={isDueSale}
                />
              </div>

              {/* Financials */}
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-[#45556c]">Return value ({returnQty} {returnQty === 1 ? 'pc' : 'pcs'})</dt>
                <dd className="text-right tabular-nums">₹{totalReturnGross.toFixed(2)}</dd>
                {discountDeducted > 0 && (
                  <>
                    <dt className="text-[#d5000c]">Less: proportional discount</dt>
                    <dd className="text-right tabular-nums text-[#d5000c]">- ₹{discountDeducted.toFixed(2)}</dd>
                  </>
                )}
                <dt className="text-[#45556c]">Paid on this order</dt>
                <dd className="text-right tabular-nums">₹{paidAmountOnSale.toFixed(2)}</dd>
                <dt className="mt-1 border-t border-[#f6e1d0] pt-2 text-base font-semibold">Net return value</dt>
                <dd className="mt-1 border-t border-[#f6e1d0] pt-2 text-right text-base font-semibold tabular-nums">
                  ₹{(totalReturnGross - discountDeducted).toFixed(2)}
                </dd>
                {isExchange && (
                  <>
                    <dt className="text-[#45556c]">Less: new items value</dt>
                    <dd className="text-right tabular-nums text-[#9a3412]">- ₹{totalExchangeValue.toFixed(2)}</dd>
                  </>
                )}
              </dl>

              {/* Result panel sits right under the summary, like the artifact */}
              {renderBalance(true)}

              {/* What this return changes */}
              <div>
                <span className="mb-1 block text-xs font-medium text-[#45556c]">What this return changes</span>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg bg-[#fff8f2] p-3 text-[13px]">
                  <dt className="flex items-center gap-1.5 text-[#45556c]"><Ico d={ICON.order} size={16} />Stock in</dt>
                  <dd className="break-words text-right font-semibold">{stockLine(itemsToReturn as any[], '+')}</dd>
                  {isExchange && (
                    <>
                      <dt className="flex items-center gap-1.5 text-[#45556c]"><Ico d={ICON.box} size={16} />Stock out</dt>
                      <dd className="break-words text-right font-semibold">{stockLine(exchangeItems as any[], '−')}</dd>
                    </>
                  )}
                </dl>
              </div>

              <button
                onClick={handleProcessReturn}
                className={`mt-auto h-[54px] w-full rounded-lg px-4 text-[15px] font-semibold transition-colors ${
                  exchangeBlocked
                    ? 'cursor-not-allowed bg-[#c2410c]/45 text-white'
                    : 'bg-[#c2410c] text-white hover:bg-[#9a3412]'
                }`}
              >
                {actionLabel}
              </button>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#ffedd5] text-[#9a3412]">
                <Ico d={ICON.search} size={24} />
              </span>
              <p className="text-sm text-[#5b6b86]">Search an order to start a return</p>
            </div>
          )}
        </aside>

        {/* --- MOBILE FOOTER (sticky) --- */}
        <div className="pointer-events-none fixed bottom-0 left-0 right-0 flex justify-center bg-transparent p-4 pb-18 md:hidden">
          {selectedSale && (
            <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-[#f6e1d0] bg-white p-2.5 shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]">
              <div className="min-w-0 pl-1">
                <span className={`block text-xs ${balanceTone}`}>{getBalanceLabel()}</span>
                <b className={`block text-lg leading-6 tabular-nums ${balanceTone}`}>₹{Math.abs(finalBalance).toFixed(2)}</b>
              </div>
              <div className="min-w-0 flex-1">
                <CustomButton
                  onClick={handleProcessReturn}
                  disabled={
                    modeOfReturn === 'Exchange' &&
                    (exchangeItems.length === 0 || itemsToReturn.length === 0)
                  }
                  variant={Variant.Payment}
                >
                  Process Transaction
                </CustomButton>
              </div>
            </div>
          )}
        </div>
      </div>

      <PaymentDrawer
        mode='sale'
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        billTotal={Math.abs(finalBalance)}
        onPaymentComplete={saveReturnTransaction}
        initialPartyName={partyName}
        initialPartyNumber={partyNumber}
        allowDueBilling={true}
      />
    </div>
  );
};

export default OrdersReturnPage;