import React, { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import BarcodeScanner from '../../../UseComponents/BarcodeScanner';
import { Modal } from '../../../constants/Modal';
import { State, Variant } from '../../../enums';
import { CustomButton } from '../../../Components';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import PaymentDrawer from '../../../Components/PaymentDrawer';
import { IconScanCircle } from '../../../constants/Icons';
import { useSalesSettings } from '../../../context/SettingsContext';
import { ReturnListItem, RETURN_ITEM_GRID } from '../../../Components/ReturnListItem';
import { GenericCartList } from '../../../Components/CartItem';
import { applyRounding, type SalesItem } from '../Sales';
import { ItemEditDrawer } from '../../../Components/ItemDrawer';
import { useAuth, useDatabase } from '../../../context/auth-context';
import { useExchangeItems, useSalesReturnLookup, useSaveSalesReturn } from './hooks';

/* ------------------------------------------------------------------ */
/* SELLAR design tokens (as Tailwind classes) — UI only                */
/* ------------------------------------------------------------------ */
const CARD =
  'bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]';
const SEC_HEAD = 'flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-[#dfe6fb]';
const SEC_TITLE = 'text-[15px] font-semibold text-[#0f172b]';
const TINT = 'inline-grid h-8 w-8 flex-none place-items-center rounded-lg';
const FIELD =
  'flex h-10 items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc]';
const FIELD_INPUT =
  'min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0f172b] outline-none placeholder:text-[#5b6b86]';
const SCAN_BTN =
  'inline-grid h-9 w-9 flex-none place-items-center rounded-sm border border-[#7a8aa3] bg-white text-[#0f172b] hover:bg-[#f5f7ff]';
const OVERLINE = 'block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]';
const CELL_FIELD =
  'rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 focus-within:border-[#155dfc] focus-within:ring-1 focus-within:ring-[#155dfc]';
const CELL_INPUT = 'w-full border-0 bg-transparent p-0 text-[13px] font-semibold text-[#0f172b] outline-none placeholder:font-normal placeholder:text-[#5b6b86]';
const DROPDOWN =
  'absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[#dfe6fb] bg-white shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]';
const DROPDOWN_ROW = 'cursor-pointer border-b border-[#dfe6fb] px-3 py-2.5 last:border-0 hover:bg-[#f5f7ff]';
const TABLE_HEAD = `hidden xl:grid ${RETURN_ITEM_GRID} items-center gap-x-3 border-b border-[#dfe6fb] bg-[#f5f7ff] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]`;
const BALANCE_SELECT =
  'h-9 cursor-pointer rounded-sm border border-[#7a8aa3] bg-white px-2 text-sm font-medium text-[#0f172b] outline-none focus:border-[#155dfc]';

const Ico: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const IcoDoc = () => (<Ico><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Ico>);
const IcoReturn = () => (<Ico><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Ico>);
const IcoBox = () => (<Ico><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></Ico>);
const IcoSearch = () => (<Ico size={16}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Ico>);


/** Read-only bill facts grid (SELLAR "facts"). */
const Facts: React.FC<{ items: { label: string; value: React.ReactNode; tone?: string }[] }> = ({ items }) => (
  <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-[#dfe6fb] bg-[#dfe6fb] md:grid-cols-4">
    {items.map((f) => (
      <div key={f.label} className="min-w-0 bg-white px-3 py-2">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">{f.label}</span>
        <b className={`block truncate text-[13px] font-semibold tabular-nums ${f.tone || 'text-[#0f172b]'}`}>{f.value}</b>
      </div>
    ))}
  </div>
);

/** Three-card transaction type picker (SELLAR "res3"). */
const ModePicker: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; sub: string; disabled?: boolean }[];
}> = ({ value, onChange, options }) => (
  <div className="grid grid-cols-3 gap-2" role="group" aria-label="Transaction type">
    {options.map((o) => {
      const active = value === o.value;
      return (
        <button
          key={o.value}
          type="button"
          disabled={o.disabled}
          aria-pressed={active}
          onClick={() => onChange(o.value)}
          className={`grid gap-0.5 rounded-sm border px-2.5 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45
            ${active ? 'border-[#155dfc] bg-[#e6eeff] ring-1 ring-[#155dfc]' : 'border-[#7a8aa3] bg-white hover:bg-[#f5f7ff]'}`}
        >
          <b className={`text-sm font-semibold ${active ? 'text-[#155dfc]' : 'text-[#0f172b]'}`}>{o.label}</b>
          <small className="text-[11px] leading-[15px] text-[#5b6b86]">{o.sub}</small>
        </button>
      );
    })}
  </div>
);

const SalesReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { state } = useLocation();
  const { invoiceId } = useParams();

  const { salesSettings } = useSalesSettings();

  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'sale' | 'item' | null>(null);

  const {
    partyName, setPartyName, partyNumber, setPartyNumber,
    originalSaleItems, setOriginalSaleItems, selectedReturnIds,
    salesList, selectedSale,
    searchSaleQuery, setSearchSaleQuery,
    isSalesDropdownOpen, setIsSalesDropdownOpen, salesDropdownRef,
    isCustomerDropdownOpen, setIsCustomerDropdownOpen, customerDropdownRef,
    availableItems, setAvailableItems,
    isLoading, setIsLoading, error,
    returnItemSearchQuery, setReturnItemSearchQuery,
    itemsToReturn, filteredReturnItems, filteredSales, filteredCustomers,
    handleSelectSale, handleSelectCustomer, handleToggleReturnItem,
    handleListChange, handleRemoveFromList, handleClear,
  } = useSalesReturnLookup({
    currentUser,
    dbOperations,
    invoiceId,
    locationState: state,
    salesSettings,
    setActiveTaxMode: (mode) => setActiveTaxMode(mode),
    setModal,
    setExchangeItems: (items) => setExchangeItems(items),
  });

  const {
    exchangeItems, setExchangeItems, exchangeBalanceAction, setExchangeBalanceAction,
    setExchangeSearchQuery,
    selectedItemForEdit, isItemDrawerOpen,
    handleOpenEditDrawer, handleCloseEditDrawer, handleSaveSuccess,
    isDiscountLocked, discountInfo, isPriceLocked, priceInfo,
    handleExchangeItemSelected,
    handleDiscountPressStart, handleDiscountPressEnd, handleDiscountClick,
    handlePricePressStart, handlePricePressEnd, handlePriceClick,
    handleDiscountChange, handleQuantityChange,
    handleCustomPriceChange, handleCustomPriceBlur,
    mappedExchangeItems,
  } = useExchangeItems({
    salesSettings,
    availableItems,
    setAvailableItems,
    setModal,
    handleListChange,
    handleRemoveFromList,
  });

  const {
    returnDate, setReturnDate,
    modeOfReturn, setModeOfReturn,
    isDrawerOpen, setIsDrawerOpen,
    activeTaxMode, setActiveTaxMode,
    totalReturnGross, totalReturnValue, totalExchangeValue, finalBalance, discountDeducted, totalMrp, totalTax,
    paidAmountOnSale, isDueSale,
    saveReturnTransaction,
    handleProcessReturn: handleProcessReturnBase,
    getBalanceLabel: getBalanceLabelBase,
  } = useSaveSalesReturn({
    currentUser,
    navigate,
    salesSettings,
    selectedSale,
    itemsToReturn,
    exchangeItems,
    availableItems,
    partyName,
    partyNumber,
    setModal,
    setIsLoading,
  });

  const handleProcessReturn = () => handleProcessReturnBase(exchangeBalanceAction);
  const getBalanceLabel = () => getBalanceLabelBase(exchangeBalanceAction);

  // Same behaviour the two <select onChange> handlers had before.
  const handleModeChange = (value: string) => {
    setModeOfReturn(value);
    if (value !== 'Exchange') setExchangeItems([]);
    setExchangeSearchQuery('');
  };

  const handleBarcodeScanned = (barcode: string) => {
    const purpose = scannerPurpose;
    setScannerPurpose(null);
    const cleanBarcode = barcode.trim();

    if (purpose === 'sale') {
      const foundSale = salesList.find(sale => sale.invoiceNumber === cleanBarcode);
      if (foundSale) handleSelectSale(foundSale);
      else setModal({ message: `Original sale not found for: "${cleanBarcode}"`, type: State.ERROR });
    } else if (purpose === 'item') {
      const itemToAdd = availableItems.find(item => item.barcode === cleanBarcode);
      if (itemToAdd) handleExchangeItemSelected(itemToAdd);
      else setModal({ message: `Item not found for barcode: "${cleanBarcode}"`, type: State.ERROR });
    }
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#eef2ff] text-[#45556c]">Loading...</div>;

  // Option values are intentionally different between mobile ("Refund") and desktop ("Cash Refund"), as before.
  const mobileModeOptions = [
    { value: 'Refund', label: 'Refund', sub: 'Money back' },
    { value: 'Exchange', label: 'Exchange', sub: 'Swap items' },
    { value: 'Credit Note', label: 'Credit note', sub: 'Store credit', disabled: isDueSale },
  ];
  const desktopModeOptions = [
    { value: 'Cash Refund', label: 'Refund', sub: 'Money back' },
    { value: 'Exchange', label: 'Exchange', sub: 'Swap items' },
    { value: 'Credit Note', label: 'Credit note', sub: 'Store credit', disabled: isDueSale },
  ];

  // selectedSale may not carry totalAmount (e.g. opened via route state) — fall back to the same list the dropdown uses.
  const listedSale: any = selectedSale ? salesList.find((x: any) => x.id === (selectedSale as any).id) : undefined;
  const billTotal = Number(
    (selectedSale as any)?.totalAmount ?? listedSale?.totalAmount ?? (selectedSale as any)?.grandTotal ?? (selectedSale as any)?.total ?? 0
  );
  const billPaid = Number(paidAmountOnSale ?? 0);

  const balanceTone = finalBalance >= 0 ? 'bg-[#e9faef] text-[#008236]' : 'bg-[#ffeef0] text-[#d5000c]';

  const balanceSelect = (
    <select
      value={exchangeBalanceAction}
      onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
      className={BALANCE_SELECT}
    >
      <option value="Credit Note">Credit Due</option>
      <option value="Cash Refund">Cash Refund</option>
    </select>
  );

  const renderHeader = () => (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-[#dfe6fb] bg-white px-4 py-3 md:px-6 md:py-4">
      <h1 className="text-xl font-semibold text-[#0f172b] md:text-[22px] md:leading-[30px]">Sales return</h1>
    </div>
  );

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#eef2ff] text-[#0f172b]">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />
      {renderHeader()}

      <div className="relative flex flex-1 flex-col overflow-hidden xl:flex-row">

        {/* --- LEFT PANEL --- */}
        <div className="relative min-w-0 flex-1 overflow-y-auto bg-[#eef2ff]">
          <div className="flex flex-col gap-3 p-3 pb-32 md:gap-3.5 md:p-5 md:pb-5">

            {/* Original sale — search */}
            <div className={CARD}>
              <div className={SEC_HEAD}>
                <span className={`${TINT} bg-[#e6eeff] text-[#155dfc]`}><IcoDoc /></span>
                <b className={SEC_TITLE}>Original sale</b>
                {selectedSale && (
                  <span className="ml-auto text-xs text-[#5b6b86]">Bill found · {selectedSale.invoiceNumber || 'N/A'}</span>
                )}
              </div>
              <div className="p-3 md:px-4">
                <div className="relative" ref={salesDropdownRef}>
                  <label htmlFor="search-sale" className="sr-only">Search Original Sale</label>
                  <div className="flex gap-2">
                    <div className={`${FIELD} flex-1`}>
                      <IcoSearch />
                      <input
                        id="search-sale"
                        type="text"
                        value={searchSaleQuery}
                        onChange={(e) => { setSearchSaleQuery(e.target.value); setIsSalesDropdownOpen(true); }}
                        onFocus={() => setIsSalesDropdownOpen(true)}
                        placeholder={selectedSale ? `${selectedSale.partyName} (${selectedSale.invoiceNumber})` : 'Invoice or Name...'}
                        className={FIELD_INPUT}
                        autoComplete="off"
                        readOnly={!!selectedSale}
                      />
                    </div>
                    {selectedSale && (
                      <button
                        onClick={handleClear}
                        className="h-10 whitespace-nowrap rounded-sm px-3 text-sm font-medium text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {isSalesDropdownOpen && !selectedSale && (
                    <div className={DROPDOWN}>
                      {filteredSales.map((sale) => (
                        <div key={sale.id} className={DROPDOWN_ROW} onClick={() => handleSelectSale(sale)}>
                          <p className="text-sm font-semibold text-[#0f172b]">
                            {sale.partyName} <span className="font-normal text-[#5b6b86]">({sale.invoiceNumber || 'N/A'})</span>
                          </p>
                          <p className="text-xs text-[#5b6b86]">Amount: ₹{sale.totalAmount.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedSale && (
                  <Facts
                    items={[
                      { label: 'Bill no.', value: selectedSale.invoiceNumber || 'N/A' },
                      { label: 'Bill total', value: `₹${billTotal.toFixed(2)}` },
                      { label: 'Paid', value: `₹${billPaid.toFixed(2)}`, tone: 'text-[#008236]' },
                      {
                        label: 'Due on bill',
                        value: `₹${Math.max(0, billTotal - billPaid).toFixed(2)}`,
                        tone: isDueSale ? 'text-[#bb4d00]' : undefined,
                      },
                    ]}
                  />
                )}

                {selectedSale && (
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                    <div className={CELL_FIELD}>
                      <label className={OVERLINE}>Return date</label>
                      <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={CELL_INPUT} />
                    </div>
                    <div className={CELL_FIELD}>
                      <label className={OVERLINE}>Party</label>
                      <input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} className={CELL_INPUT} />
                    </div>
                    <div className={`relative col-span-2 md:col-span-1 ${CELL_FIELD}`} ref={customerDropdownRef}>
                      <label className={OVERLINE}>Party number</label>
                      <input
                        type="text"
                        value={partyNumber}
                        maxLength={10}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setPartyNumber(val);
                          setPartyName('');
                          setIsCustomerDropdownOpen(true);
                        }}
                        onFocus={() => setIsCustomerDropdownOpen(true)}
                        className={CELL_INPUT}
                        autoComplete="off"
                        placeholder="Search customer by number or name..."
                      />
                      {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                        <div className={`${DROPDOWN} max-h-48`}>
                          {filteredCustomers.map((customer) => (
                            <div key={customer.id} className={DROPDOWN_ROW} onClick={() => handleSelectCustomer(customer)}>
                              <p className="text-sm font-semibold text-[#0f172b]">{customer.name}</p>
                              <p className="text-xs text-[#5b6b86]">{customer.number}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedSale && (
              <>
                {/* Select return items */}
                <div className={CARD}>
                  <div className={SEC_HEAD}>
                    <span className={`${TINT} bg-[#e6eeff] text-[#155dfc]`}><IcoReturn /></span>
                    <b className={SEC_TITLE}>Select return items</b>
                    <div className="flex w-full items-center gap-2 md:ml-auto md:w-auto">
                      <div className={`${FIELD} h-9 flex-1 md:w-60 md:flex-none`}>
                        <IcoSearch />
                        <input
                          type="text"
                          value={returnItemSearchQuery}
                          onChange={(e) => setReturnItemSearchQuery(e.target.value)}
                          placeholder="Search items in this bill"
                          className={FIELD_INPUT}
                          autoComplete="off"
                        />
                      </div>
                      <button onClick={() => setScannerPurpose('item')} className={SCAN_BTN} aria-label="Scan item">
                        <IconScanCircle width={18} height={18} />
                      </button>
                    </div>
                  </div>

                  {originalSaleItems.length === 0 && (
                    <p className="px-4 py-3 text-sm text-[#5b6b86]">No returnable items found for this sale.</p>
                  )}

                  {filteredReturnItems.length > 0 && (
                    <div className={TABLE_HEAD}>
                      <span />
                      <span>Item</span>
                      <span>Return qty</span>
                      <span className="text-right">Price</span>
                      <span className="text-right">Subtotal</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-2 p-3 xl:gap-0 xl:p-0">
                    {filteredReturnItems.map((item) => (
                      <ReturnListItem
                        key={item.id}
                        item={item}
                        isSelected={selectedReturnIds.has(item.id)}
                        onToggle={handleToggleReturnItem}
                        onQuantityChange={(id, val) => handleListChange(setOriginalSaleItems, id, 'quantity', val)}
                        showMrp={true}
                      />
                    ))}
                  </div>

                  <div className="flex justify-end gap-6 rounded-sm border-t border-[#dfe6fb] bg-[#f5f7ff] px-4 py-2.5 text-[13px] text-[#45556c]">
                    <span>Selected <b className="tabular-nums text-[#0f172b]">{selectedReturnIds.size} of {originalSaleItems.length}</b> items</span>
                    <span>Return value <b className="tabular-nums text-[#0f172b]">₹{totalReturnGross.toFixed(2)}</b></span>
                  </div>
                </div>

                {/* Exchange items (always on desktop, only in Exchange mode on mobile) */}
                <div className={`${CARD} ${modeOfReturn === 'Exchange' ? '' : 'hidden xl:block'}`}>
                  <div className={SEC_HEAD}>
                    <span className={`${TINT} bg-[#e9faef] text-[#008236]`}><IcoBox /></span>
                    <b className={SEC_TITLE}>Exchange items</b>
                  </div>

                  {modeOfReturn === 'Exchange' ? (
                    <div className="p-3 md:px-4">
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-grow">
                          <SearchableItemInput
                            label="Add Exchange Item"
                            placeholder="Search inventory..."
                            items={availableItems}
                            onItemSelected={handleExchangeItemSelected}
                            isLoading={isLoading}
                            error={error}
                            onSearchChange={setExchangeSearchQuery}
                          />
                        </div>
                        <button onClick={() => setScannerPurpose('item')} className={`${SCAN_BTN} h-10 w-10`} aria-label="Scan item">
                          <IconScanCircle width={20} height={20} />
                        </button>
                      </div>

                      {(discountInfo || priceInfo) && (
                        <div className="mt-2 flex gap-2 text-xs text-[#d5000c]">
                          {discountInfo && <span>{discountInfo}</span>}
                          {priceInfo && <span>{priceInfo}</span>}
                        </div>
                      )}

                      {exchangeItems.length > 0 && (
                        <div className="mt-3 overflow-hidden rounded-sm border border-[#dfe6fb]">
                          <div className="border-b border-[#dfe6fb] bg-[#f5f7ff] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">
                            Exchange cart
                          </div>
                          <div>
                            <GenericCartList<SalesItem>
                              items={mappedExchangeItems}
                              availableItems={availableItems}
                              basePriceKey="mrp"
                              priceLabel="MRP"
                              settings={{
                                enableRounding: salesSettings?.enableRounding ?? true,
                                roundingInterval: (salesSettings as any)?.roundingInterval ?? 1,
                                enableItemWiseDiscount: salesSettings?.enableItemWiseDiscount ?? true,
                                enableDiscount2: salesSettings?.enableDiscount2 ?? false,
                                lockDiscount: isDiscountLocked,
                                lockPrice: isPriceLocked
                              }}
                              applyRounding={applyRounding}
                              State={State}
                              setModal={setModal}
                              onOpenEditDrawer={handleOpenEditDrawer}
                              onDeleteItem={(id) => handleRemoveFromList(setExchangeItems, id)}
                              onDiscountChange={handleDiscountChange}
                              onDiscount2Change={() => { }}
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
                            <ItemEditDrawer
                              item={selectedItemForEdit}
                              isOpen={isItemDrawerOpen}
                              onClose={handleCloseEditDrawer}
                              onSaveSuccess={handleSaveSuccess}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-center text-[13px] text-[#5b6b86]">
                      <p className="font-semibold text-[#45556c]">No exchange items</p>
                      <p>Choose Exchange as the transaction type to add new items.</p>
                    </div>
                  )}
                </div>

                {/* Mobile summary */}
                <div className={`xl:hidden ${CARD}`}>
                  <div className={SEC_HEAD}>
                    <b className={SEC_TITLE}>Return summary</b>
                  </div>
                  <div className="grid gap-3 p-3">
                    <div>
                      <span className="mb-1 block text-xs font-medium text-[#45556c]">Transaction type</span>
                      <ModePicker value={modeOfReturn} onChange={handleModeChange} options={mobileModeOptions} />
                    </div>

                    <div className="grid gap-1.5 text-sm">
                      <div className="flex items-center justify-between text-[#45556c]">
                        <p>Return Value</p><p className="font-semibold tabular-nums text-[#0f172b]">₹{totalReturnGross.toFixed(2)}</p>
                      </div>
                      {discountDeducted > 0 && (
                        <div className="flex items-center justify-between text-xs text-[#d5000c]">
                          <p>Less Bill Discount</p><p className="tabular-nums">- ₹{discountDeducted.toFixed(2)}</p>
                        </div>
                      )}
                      {modeOfReturn === 'Exchange' && (
                        <div className="flex items-center justify-between text-[#45556c]">
                          <p>Exchange Value</p><p className="font-semibold tabular-nums text-[#155dfc]">₹{totalExchangeValue.toFixed(2)}</p>
                        </div>
                      )}
                    </div>

                    <div className={`flex items-center justify-between gap-3 rounded-sm px-3.5 py-3 ${balanceTone}`}>
                      {modeOfReturn === 'Exchange' && finalBalance > 0 ? balanceSelect : (
                        <p className="text-sm font-medium">{getBalanceLabel()}</p>
                      )}
                      <b className="text-2xl font-semibold tabular-nums tracking-tight">₹{Math.abs(finalBalance).toFixed(2)}</b>
                    </div>

                    <div className="hidden md:block xl:hidden">
                      <CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md">Process Transaction</CustomButton>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* --- RIGHT PANEL --- */}
        <div className="relative z-10 hidden h-full w-[380px] flex-none flex-col border-l border-[#dfe6fb] bg-white p-5 shadow-[-4px_0_15px_-3px_rgba(21,48,140,0.05)] xl:flex">
          {selectedSale ? (
            <div className="flex h-full flex-col gap-3.5">
              <h2 className="text-base font-semibold text-[#0f172b]">Return summary</h2>

              <div>
                <span className="mb-1 block text-xs font-medium text-[#45556c]">Transaction type</span>
                <ModePicker value={modeOfReturn} onChange={handleModeChange} options={desktopModeOptions} />
              </div>

              <div className="grid gap-2 text-sm">
                <div className="flex justify-between text-[#45556c]">
                  <span>Return sale amount</span>
                  <span className="tabular-nums text-[#0f172b]">₹{totalReturnGross.toFixed(2)}</span>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between text-[#d5000c]">
                    <span>Less: proportional discount</span>
                    <span className="tabular-nums">- ₹{discountDeducted.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[#45556c]">
                  <span>Paid amount</span>
                  <span className="tabular-nums text-[#0f172b]">₹{paidAmountOnSale.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t border-[#dfe6fb] pt-2 text-base font-semibold text-[#0f172b]">
                  <span>Net return value</span>
                  <span className="tabular-nums">₹{totalReturnValue.toFixed(2)}</span>
                </div>
                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-[#45556c]">
                    <span>Less: new items value</span>
                    <span className="tabular-nums text-[#155dfc]">- ₹{totalExchangeValue.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="mt-auto grid gap-3">
                <div className={`flex items-center justify-between gap-3 rounded-sm px-3.5 py-3 ${balanceTone}`}>
                  {modeOfReturn === 'Exchange' && finalBalance > 0 ? balanceSelect : (
                    <span className="text-sm font-medium">{getBalanceLabel()}</span>
                  )}
                  <b className="text-[26px] font-semibold leading-8 tracking-tight tabular-nums">₹{Math.abs(finalBalance).toFixed(2)}</b>
                </div>
                <button
                  onClick={handleProcessReturn}
                  className="h-[54px] w-full rounded-sm bg-[#155dfc] text-[15px] font-medium text-white transition-colors hover:bg-[#1447e6] active:scale-[0.99]"
                >
                  Process Transaction
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-sm text-[#5b6b86]">
              <p>Select a sale to begin return</p>
            </div>
          )}
        </div>

        <div className="pointer-events-none fixed bottom-0 left-0 right-0 flex justify-center bg-transparent p-4 pb-18 md:hidden">
          {selectedSale && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="pointer-events-auto w-full py-3 text-lg font-semibold shadow-md">Process Transaction</CustomButton>)}
        </div>
      </div>

      <PaymentDrawer
        mode='sale'
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        billTotal={Math.abs(finalBalance)}
        totalTax={totalTax}
        onPaymentComplete={saveReturnTransaction}
        initialPartyName={partyName}
        initialPartyNumber={partyNumber}
        taxMode={activeTaxMode}
        onTaxModeChange={setActiveTaxMode}
        isTaxToggleLocked={true}

        totalMrp={totalMrp}
      />

      <ItemEditDrawer
        item={selectedItemForEdit}
        isOpen={isItemDrawerOpen}
        onClose={handleCloseEditDrawer}
        onSaveSuccess={handleSaveSuccess}
      />

    </div>
  );
};

export default SalesReturnPage;