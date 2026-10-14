import React, { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Modal } from '../../../constants/Modal';
import { State, Variant } from '../../../enums';
import { CustomButton } from '../../../Components';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import PaymentDrawer from '../../../Components/PaymentDrawer';
import BarcodeScanner from '../../../UseComponents/BarcodeScanner';
import { ReturnListItem, RETURN_ITEM_GRID } from '../../../Components/ReturnListItem';
import { IconScanCircle } from '../../../constants/Icons';
import { GenericCartList } from '../../../Components/CartItem';
import { usePurchaseSettings } from '../../../context/SettingsContext';
import { ItemEditDrawer } from '../../../Components/ItemDrawer';
import { useAuth, useDatabase } from '../../../context/auth-context';
import type { ReturnCartItem } from './purchaseReturn.types';
import { useNewItemsReceived, usePurchaseReturnLookup, useSavePurchaseReturn } from './hooks';

/* ------------------------------------------------------------------ */
/* SELLAR design tokens (as Tailwind classes) — UI only                */
/* ------------------------------------------------------------------ */
const CARD =
  'bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]';
const SEC_HEAD = 'flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-[#dfe6fb]';
const SEC_TITLE = 'text-[15px] font-semibold text-[#0f172b]';
const TINT = 'inline-grid h-8 w-8 flex-none place-items-center rounded-sm';
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
  'absolute left-0 top-full z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-sm border border-[#dfe6fb] bg-white shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]';
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

const PurchaseReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseId } = useParams();
  const { state } = useLocation();

  const { purchaseSettings } = usePurchaseSettings();

  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'purchase' | 'item' | null>(null);

  const {
    supplierName, setSupplierName, supplierNumber, setSupplierNumber,
    supplierAddress, supplierGstin,
    originalPurchaseItems, setOriginalPurchaseItems, selectedReturnIds,
    purchaseList, selectedPurchase,
    searchQuery, setSearchQuery,
    isDropdownOpen, setIsDropdownOpen, dropdownRef,
    isPartyDropdownOpen, setIsPartyDropdownOpen, partyDropdownRef,
    isNameDropdownOpen, setIsNameDropdownOpen, nameDropdownRef,
    availableItems, setAvailableItems,
    isLoading, setIsLoading, error,
    returnItemSearchQuery, setReturnItemSearchQuery,
    itemsToReturn, filteredReturnItems, filteredList,
    filteredPartiesByNumber, filteredPartiesByName,
    handleSelectPurchase, handleSelectParty, handleToggleReturnItem,
    handleClear, handleItemChange,
  } = usePurchaseReturnLookup({
    currentUser,
    dbOperations,
    purchaseId,
    locationState: state,
    setActiveTaxMode: (mode) => setActiveTaxMode(mode),
    setModal,
    setNewItemsReceived: (items: ReturnCartItem[]) => setNewItemsReceived(items),
    setNewItemsSearchQuery: (q: string) => setNewItemsSearchQuery(q),
  });

  const {
    newItemsReceived, setNewItemsReceived,
    exchangeBalanceAction, setExchangeBalanceAction,
    setNewItemsSearchQuery,
    selectedItemForEdit, isItemDrawerOpen,
    handleOpenEditDrawer, handleCloseEditDrawer, handleSaveSuccess,
    displayedNewItemsReceived,
    handleNewItemSelected, handleNewItemPriceBlur, handleNewItemDiscountChange,
    handleRemoveNewItem, handleNewItemQuantity, handleNewItemPriceChange,
  } = useNewItemsReceived({
    availableItems,
    setAvailableItems,
    setModal,
  });

  const {
    modeOfReturn, setModeOfReturn,
    returnDate, setReturnDate,
    isDrawerOpen, setIsDrawerOpen,
    activeTaxMode, setActiveTaxMode,
    isPurchaseUnpaid,
    totalReturnValue, totalNewItemsValue, finalBalance, discountDeducted, totalTax, totalMrp,
    saveReturnTransaction,
    handleProcessReturn: handleProcessReturnBase,
    getBalanceLabel: getBalanceLabelBase,
  } = useSavePurchaseReturn({
    currentUser,
    navigate,
    purchaseSettings,
    selectedPurchase,
    itemsToReturn,
    newItemsReceived,
    availableItems,
    supplierName,
    supplierNumber,
    supplierAddress,
    supplierGstin,
    setModal,
    setIsLoading,
  });

  const handleProcessReturn = () => handleProcessReturnBase(exchangeBalanceAction);
  const getBalanceLabel = () => getBalanceLabelBase(exchangeBalanceAction);

  const handleBarcodeScanned = (decodedText: string) => {
    const currentPurpose = scannerPurpose;
    setScannerPurpose(null);

    if (currentPurpose === 'purchase') {
      const foundPurchase = purchaseList.find(p => (p.id === decodedText || p.invoiceNumber === decodedText) && !p.isReturned);
      if (foundPurchase) {
        handleSelectPurchase(foundPurchase);
      } else {
        setModal({ message: 'No active purchase found.', type: State.ERROR });
      }
    } else if (currentPurpose === 'item') {
      const itemToAdd = availableItems.find(item => item.barcode === decodedText);
      if (itemToAdd) {
        handleNewItemSelected(itemToAdd);
        setModal({ message: `Added: ${itemToAdd.name}`, type: State.SUCCESS });
      } else {
        setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
      }
    }
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#eef2ff] text-[#45556c]">Loading...</div>;

  const modeOptions = [
    { value: 'Debit Note', label: 'Debit note', sub: 'Supplier owes you', disabled: isPurchaseUnpaid },
    { value: 'Cash Refund', label: 'Refund', sub: 'Supplier pays' },
    { value: 'Exchange', label: 'Exchange', sub: 'Replacement' },
  ];

  // selectedPurchase may not carry totalAmount (e.g. opened via route state) — fall back to the same list the dropdown uses.
  const listedPurchase: any = selectedPurchase ? purchaseList.find((x: any) => x.id === (selectedPurchase as any).id) : undefined;
  const billTotal = Number(
    (selectedPurchase as any)?.totalAmount ?? listedPurchase?.totalAmount ?? (selectedPurchase as any)?.grandTotal ?? (selectedPurchase as any)?.total ?? 0
  );

  const balanceTone = finalBalance >= 0 ? 'bg-[#e9faef] text-[#008236]' : 'bg-[#fff3dd] text-[#bb4d00]';

  const balanceSelect = (
    <select
      value={exchangeBalanceAction}
      onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
      className={BALANCE_SELECT}
    >
      <option value="Debit Note">Debit Note</option>
      <option value="Cash Refund">Cash Refund</option>
    </select>
  );

  const renderHeader = () => (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-[#dfe6fb] bg-white px-4 py-3 md:px-6 md:py-4">
      <h1 className="text-xl font-semibold text-[#0f172b] md:text-[22px] md:leading-[30px]">Purchase return</h1>
    </div>
  );

  const partyDropdownList = (
    list: typeof filteredPartiesByNumber,
  ) => (
    <div className={`${DROPDOWN} max-h-48`}>
      {list.map((party) => (
        <div key={party.id} className={DROPDOWN_ROW} onClick={() => handleSelectParty(party)}>
          <p className="text-sm font-semibold text-[#0f172b]">{party.name}</p>
          <p className="text-xs text-[#5b6b86]">{party.number}</p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#eef2ff] text-[#0f172b]">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      {/* HEADER */}
      {renderHeader()}

      <div className="relative flex flex-1 flex-col overflow-hidden xl:flex-row">

        {/* --- LEFT PANEL --- */}
        <div className="relative min-w-0 flex-1 overflow-y-auto bg-[#eef2ff]">
          <div className="flex flex-col gap-3 p-3 pb-32 md:gap-3.5 md:p-5 md:pb-6">

            {/* Original purchase — search + party details */}
            <div className={CARD}>
              <div className={SEC_HEAD}>
                <span className={`${TINT} bg-[#e9faef] text-[#008236]`}><IcoDoc /></span>
                <b className={SEC_TITLE}>Original purchase</b>
                {selectedPurchase && (
                  <span className="ml-auto text-xs text-[#5b6b86]">Bill found · {selectedPurchase.invoiceNumber}</span>
                )}
              </div>
              <div className="p-3 md:px-4">
                <div className="relative" ref={dropdownRef}>
                  <label htmlFor="search-purchase" className="sr-only">Search Original Purchase</label>
                  <div className="flex gap-2">
                    <div className={`${FIELD} flex-1`}>
                      <IcoSearch />
                      <input
                        type="text"
                        id="search-purchase"
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }}
                        onFocus={() => setIsDropdownOpen(true)}
                        placeholder={selectedPurchase ? `${selectedPurchase.partyName} (${selectedPurchase.invoiceNumber})` : 'Supplier or Invoice...'}
                        className={FIELD_INPUT}
                        autoComplete="off"
                        readOnly={!!selectedPurchase}
                      />
                    </div>
                    {selectedPurchase && (
                      <button
                        onClick={handleClear}
                        className="h-10 whitespace-nowrap rounded-sm px-3 text-sm font-medium text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {isDropdownOpen && !selectedPurchase && (
                    <div className={DROPDOWN}>
                      {filteredList.map(item => (
                        <div key={item.id} className={DROPDOWN_ROW} onClick={() => handleSelectPurchase(item)}>
                          <p className="text-sm font-semibold text-[#0f172b]">
                            {item.partyName} <span className="font-normal text-[#5b6b86]">({item.invoiceNumber})</span>
                          </p>
                          <p className="text-xs text-[#5b6b86]">Amount: ₹{item.totalAmount.toFixed(2)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedPurchase && (
                  <Facts
                    items={[
                      { label: 'Bill no.', value: selectedPurchase.invoiceNumber || 'N/A' },
                      { label: 'Bill total', value: `₹${billTotal.toFixed(2)}` },
                      {
                        label: 'Payment',
                        value: isPurchaseUnpaid ? 'Unpaid' : 'Paid',
                        tone: isPurchaseUnpaid ? 'text-[#bb4d00]' : 'text-[#008236]',
                      },
                      { label: 'Party', value: selectedPurchase.partyName || 'Not set', tone: selectedPurchase.partyName ? undefined : 'text-[#bb4d00]' },
                    ]}
                  />
                )}

                {selectedPurchase && (
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                    <div className={CELL_FIELD}>
                      <label className={OVERLINE}>Return date</label>
                      <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={CELL_INPUT} />
                    </div>

                    {/* Party name dropdown */}
                    <div className={`relative ${CELL_FIELD}`} ref={nameDropdownRef}>
                      <label className={OVERLINE}>Party name</label>
                      <input
                        type="text"
                        value={supplierName}
                        onChange={(e) => {
                          setSupplierName(e.target.value);
                          setIsNameDropdownOpen(true);
                        }}
                        onFocus={() => setIsNameDropdownOpen(true)}
                        className={CELL_INPUT}
                        autoComplete="off"
                        placeholder="Search by name..."
                      />
                      {isNameDropdownOpen && filteredPartiesByName.length > 0 && partyDropdownList(filteredPartiesByName)}
                    </div>

                    {/* Party number dropdown */}
                    <div className={`relative col-span-2 md:col-span-1 ${CELL_FIELD}`} ref={partyDropdownRef}>
                      <label className={OVERLINE}>Party number</label>
                      <input
                        type="text"
                        value={supplierNumber}
                        maxLength={10}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setSupplierNumber(val);
                          setSupplierName('');
                          setIsPartyDropdownOpen(true);
                        }}
                        onFocus={() => setIsPartyDropdownOpen(true)}
                        className={CELL_INPUT}
                        autoComplete="off"
                        placeholder="Search party by number or name..."
                      />
                      {isPartyDropdownOpen && filteredPartiesByNumber.length > 0 && partyDropdownList(filteredPartiesByNumber)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedPurchase && (
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

                  {originalPurchaseItems.length === 0 && (
                    <p className="px-4 py-3 text-sm text-[#5b6b86]">No returnable items found for this purchase.</p>
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
                        onQuantityChange={(id, val) => handleItemChange(setOriginalPurchaseItems, id, 'quantity', val)}
                        showMrp={false}
                      />
                    ))}
                  </div>

                  <div className="flex justify-end gap-6 rounded-sm border-t border-[#dfe6fb] bg-[#f5f7ff] px-4 py-2.5 text-[13px] text-[#45556c]">
                    <span>Selected <b className="tabular-nums text-[#0f172b]">{selectedReturnIds.size} of {originalPurchaseItems.length}</b> items</span>
                    <span>Return value <b className="tabular-nums text-[#0f172b]">₹{totalReturnValue.toFixed(2)}</b></span>
                  </div>
                </div>

                {/* Replacement items (always on desktop, only in Exchange mode on mobile) */}
                <div className={`${CARD} ${modeOfReturn === 'Exchange' ? '' : 'hidden xl:block'}`}>
                  <div className={SEC_HEAD}>
                    <span className={`${TINT} bg-[#e9faef] text-[#008236]`}><IcoBox /></span>
                    <b className={SEC_TITLE}>Replacement items</b>
                  </div>

                  {modeOfReturn === 'Exchange' ? (
                    <div className="p-3 md:px-4">
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-grow">
                          <SearchableItemInput
                            label="Add New Item Received"
                            placeholder="Search inventory..."
                            items={availableItems}
                            onItemSelected={handleNewItemSelected}
                            isLoading={isLoading}
                            error={error}
                            onSearchChange={setNewItemsSearchQuery}
                          />
                        </div>
                        <button onClick={() => setScannerPurpose('item')} className={`${SCAN_BTN} h-10 w-10`} aria-label="Scan item">
                          <IconScanCircle width={20} height={20} />
                        </button>
                      </div>

                      {newItemsReceived.length > 0 && (
                        <div className="mt-3 overflow-hidden rounded-sm border border-[#dfe6fb]">
                          <div className="border-b border-[#dfe6fb] bg-[#f5f7ff] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86]">
                            Received items
                          </div>
                          <div className="max-h-60 overflow-y-auto bg-[#f5f7ff]">
                            <GenericCartList<ReturnCartItem>
                              items={displayedNewItemsReceived}
                              availableItems={availableItems}
                              basePriceKey="mrp"
                              priceLabel="MRP"
                              settings={{
                                enableRounding: false,
                                roundingInterval: 1,
                                enableItemWiseDiscount: true, // Enable discount editing
                                enableDiscount2: false,         // Disable Discount 2
                                lockDiscount: false,          // Unlock Discount
                                lockPrice: false              // Unlock Price
                              }}
                              applyRounding={(v) => v}
                              State={State}
                              setModal={setModal}
                              onOpenEditDrawer={handleOpenEditDrawer}
                              onDeleteItem={handleRemoveNewItem}
                              onDiscountChange={handleNewItemDiscountChange}
                              onDiscount2Change={() => { }}
                              onCustomPriceChange={handleNewItemPriceChange}
                              onCustomPriceBlur={handleNewItemPriceBlur}
                              onQuantityChange={handleNewItemQuantity}
                              onDiscountPressStart={() => { }}
                              onDiscountPressEnd={() => { }}
                              onDiscountClick={() => { }}
                              onPricePressStart={() => { }}
                              onPricePressEnd={() => { }}
                              onPriceClick={() => { }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-center text-[13px] text-[#5b6b86]">
                      <p className="font-semibold text-[#45556c]">No replacement items</p>
                      <p>Choose Exchange, then search or scan the items the supplier sends back.</p>
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
                      <ModePicker value={modeOfReturn} onChange={setModeOfReturn} options={modeOptions} />
                    </div>

                    <div className="grid gap-1.5 text-sm">
                      <div className="flex items-center justify-between text-[#45556c]">
                        <p>Return Value</p><p className="font-semibold tabular-nums text-[#0f172b]">₹{totalReturnValue.toFixed(2)}</p>
                      </div>
                      {discountDeducted > 0 && (
                        <div className="flex items-center justify-between text-xs text-[#bb4d00]">
                          <p>Less Bill Discount</p><p className="tabular-nums">- ₹{discountDeducted.toFixed(2)}</p>
                        </div>
                      )}
                      {modeOfReturn === 'Exchange' && (
                        <div className="flex items-center justify-between text-[#45556c]">
                          <p>New Items Value</p><p className="font-semibold tabular-nums text-[#008236]">₹{totalNewItemsValue.toFixed(2)}</p>
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

        {/* --- RIGHT PANEL (Desktop only) --- */}
        <div className="relative z-10 hidden h-full w-[380px] flex-none flex-col border-l border-[#dfe6fb] bg-white p-5 shadow-[-4px_0_15px_-3px_rgba(21,48,140,0.05)] xl:flex">
          {selectedPurchase ? (
            <div className="flex h-full flex-col gap-3.5">
              <h2 className="text-base font-semibold text-[#0f172b]">Return summary</h2>

              <div>
                <span className="mb-1 block text-xs font-medium text-[#45556c]">Transaction type</span>
                <ModePicker value={modeOfReturn} onChange={setModeOfReturn} options={modeOptions} />
              </div>

              <div className="grid gap-2 text-sm">
                <div className="flex justify-between text-[#45556c]">
                  <span>Gross return value</span>
                  <span className="tabular-nums text-[#0f172b]">₹{totalReturnValue.toFixed(2)}</span>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between text-[#bb4d00]">
                    <span>Less: proportional discount</span>
                    <span className="tabular-nums">- ₹{discountDeducted.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-[#dfe6fb] pt-2 text-base font-semibold text-[#0f172b]">
                  <span>Net return value</span>
                  <span className="tabular-nums">₹{(totalReturnValue - discountDeducted).toFixed(2)}</span>
                </div>
                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-[#45556c]">
                    <span>New items value</span>
                    <span className="tabular-nums text-[#008236]">- ₹{totalNewItemsValue.toFixed(2)}</span>
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
              <p>Select a purchase to begin return</p>
            </div>
          )}
        </div>

        {/* --- MOBILE FOOTER (Sticky) --- */}
        <div className="fixed bottom-0 left-0 right-0 flex justify-center bg-transparent p-2 pb-18 md:hidden">
          {selectedPurchase && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md">Process Transaction</CustomButton>)}
        </div>

      </div>

      <PaymentDrawer
        mode='purchase'
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        billTotal={Math.abs(finalBalance)}

        totalTax={totalTax}
        taxMode={activeTaxMode}
        onTaxModeChange={setActiveTaxMode}
        isTaxToggleLocked={true} // Locked because it inherits the original invoice's tax mode
        totalMrp={totalMrp}

        allowDueBilling={true}

        onPaymentComplete={saveReturnTransaction}
        initialPartyName={supplierName}
        initialPartyNumber={supplierNumber}
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

export default PurchaseReturnPage;