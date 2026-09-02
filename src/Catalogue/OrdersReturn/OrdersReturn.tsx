import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { useAuth } from '../../context/auth-context';

import { ROUTES } from '../../constants/routes.constants';
import { Modal } from '../../constants/Modal';
import { State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import PaymentDrawer from '../../Components/PaymentDrawer';
import { ReturnListItem } from '../../Components/ReturnListItem';
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

const OrdersReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { state } = useLocation();
  // const location = useLocation();

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

  // const isActive = (path: string) => location.pathname === path;

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

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;


  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      {/* === HEADER === */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2 shadow-sm">

        {/* Left: Back Button */}
        <div className="w-14 flex justify-start">
          <button
            onClick={() => navigate(ROUTES.ORDERDETAILS)}
            className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors text-slate-700"
            title="Back"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
        </div>

        {/* Center: Title */}
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            Orders Return
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
            Process Refunds & Exchange
          </p>
        </div>

        {/* Right: Empty space for balance (w-14 keeps title centered) */}
        <div className="w-14 flex justify-end">
          {/* Isse khali rakha hai taaki heading center mein rahe */}
        </div>
      </header>

      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* --- LEFT PANEL (Desktop: 65%, Search + Lists) --- */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto p-2 md:p-2 pb-24 md:pb-2 relative">

          {/* Search */}
          <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
            <div className="relative" ref={salesDropdownRef}>
              <label htmlFor="search-sale" className="block text-sm font-medium mb-1 text-gray-700">Search Original Sale</label>
              <div className="flex gap-2">
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
                      : "Invoice, Name or Phone..."
                  }
                  className="flex-grow p-2 border rounded-sm focus:ring-2 focus:ring-[#F97316] outline-none"
                  autoComplete="off"
                  readOnly={!!selectedSale}
                />
                {selectedSale && (<button onClick={handleClear} className=" px-3 bg-gray-200 text-gray-700 font-semibold rounded-sm whitespace-nowrap hover:bg-gray-300">Clear</button>)}
              </div>
              {isSalesDropdownOpen && !selectedSale && (
                <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-sm shadow-lg max-h-60 overflow-y-auto">
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
                        className="p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0"
                        onClick={() => handleSelectSale(sale)}
                      >
                        <p className="font-semibold text-sm">
                          {sale.userName}{' '}
                          <span className="text-gray-500 font-normal">
                            ({sale.orderId || 'N/A'})
                          </span>
                        </p>
                        <p className="text-xs text-gray-500">
                          Amount: ₹{calculatedAmount.toFixed(2)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {selectedSale && (
            <>
              {/* Sale Details & Items To Return */}
              <div className="bg-white p-3 rounded-sm shadow-md mb-4 border border-gray-200">
                <div className="space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Date</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Party</label><input type="text" value={partyName} readOnly className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm" /></div>
                  </div>

                  {/* --- NEW DROPDOWN FOR PARTY NUMBER --- */}
                  <div className="relative" ref={customerDropdownRef}>
                    <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
                    <input
                      type="text"
                      value={partyNumber}
                      readOnly
                      // onChange={(e) => {
                      //   const value = e.target.value.replace(/\D/g, '');
                      //   if (value.length <= 10) {
                      //     setPartyNumber(value);
                      //     setPartyName('');
                      //     setIsCustomerDropdownOpen(true);
                      //   }
                      // }}
                      // onFocus={() => setIsCustomerDropdownOpen(true)}
                      className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm"
                      autoComplete="off"
                      placeholder="Search customer by number or name..."
                      maxLength={10}
                    />
                    {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                      <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-sm shadow-lg max-h-48 overflow-y-auto">
                        {filteredCustomers.map((customer) => (
                          <div
                            key={customer.id}
                            className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0"
                            onClick={() => handleSelectCustomer(customer)}
                          >
                            <p className="font-semibold text-sm text-gray-800">{customer.name}</p>
                            <p className="text-xs text-gray-500">{customer.number}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                <h3 className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">Select Return Items</h3>
                <div className="flex items-end gap-1 mb-3">
                  <div className="flex-grow">
                    <input
                      type="text"
                      value={returnItemSearchQuery}
                      onChange={(e) => setReturnItemSearchQuery(e.target.value)}
                      placeholder="Search items in this return..."
                      className="w-full p-2 border rounded-sm focus:ring-2 focus:ring-[#F97316] outline-none"
                      autoComplete="off"
                    />
                  </div>
                  <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-sm">
                    <IconScanCircle width={20} height={20} />
                  </button>
                </div>
                <div className="flex flex-col gap-2">
                  {originalSaleItems.length === 0 && (
                    <p className="text-sm text-gray-500">
                      No returnable items found for this order.
                    </p>
                  )}

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
                    />
                  ))}
                </div>
              </div>

              {/* Exchange Section (Input + List) */}
              <div className="bg-white p-2 rounded-sm shadow-md mb-4 md:mb-0 border border-gray-200">
                {/* Mobile View: Select Mode Here. Desktop: Mode is in Right Panel, but show Content if Exchange is selected */}
                <div className="md:hidden mb-4">
                  <label className="block font-medium text-sm mb-1">Transaction Type</label>
                  <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                    <option disabled={isDueSale}>Credit Note</option>
                    <option>Exchange</option>
                    <option>Refund</option>
                  </select>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <>
                    <div className="flex items-end gap-1 mb-3">
                      <div className="flex-grow">
                        <SearchableItemInput
                          label="Add Exchange Item"
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
                        /></div>
                      <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-sm"><IconScanCircle width={20} height={20} /></button>
                    </div>

                    {/* --- DISPLAY ERROR MESSAGES FOR LOCKS --- */}


                    {exchangeItems.length > 0 && (
                      <div className="border rounded-sm overflow-hidden mt-4">
                        <div className="bg-gray-50 px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase">
                          Exchange Cart
                        </div>

                        <div className="max-h-60 overflow-y-auto bg-gray-50">
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
                  </>
                )}
              </div>

              {/* Mobile Only: Inline Summary (Above Footer) */}
              <div className="md:hidden bg-white p-2 rounded-sm shadow-md">
                <div className="flex justify-between items-center text-sm text-[#F97316]">
                  <p>Return Value</p><p className="font-medium">₹{totalReturnGross.toFixed(2)}</p>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between items-center text-xs text-red-600 mt-1">
                    <p>Less Bill Discount</p><p>- ₹{discountDeducted.toFixed(2)}</p>
                  </div>
                )}
                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between items-center text-sm text-[#F97316] mt-1">
                    <p>Exchange Value</p><p className="font-medium">₹{totalExchangeValue.toFixed(2)}</p>
                  </div>
                )}
                <div className="border-t border-gray-200 my-2"></div>
                <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-[#F97316]' : 'text-red-600'}`}>
                  {modeOfReturn === 'Exchange' && finalBalance > 0 ? (
                    <select
                      value={exchangeBalanceAction}
                      onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
                      className="bg-transparent border border-gray-300 rounded-sm hover:border-gray-400 focus:border-orange-500 outline-none cursor-pointer py-1 pr-2 text-gray-700 transition-colors"
                    >
                      <option value="Credit Note">Credit Due</option>
                      <option value="Cash Refund">Cash Refund</option>
                    </select>
                  ) : (
                    <p>{getBalanceLabel()}</p>
                  )}
                  <p>₹{Math.abs(finalBalance).toFixed(2)}</p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* --- RIGHT PANEL (Desktop Only: 35%) --- */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 p-6">
          {selectedSale ? (
            <div className="flex flex-col h-full">
              <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Return Summary</h2>

              {/* Transaction Type */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Transaction Type</label>
                <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-3 border border-gray-300 rounded-sm bg-gray-50 focus:ring-2 focus:ring-[#F97316] outline-none">
                  <option disabled={isDueSale}>Credit Note</option>
                  <option>Exchange</option>
                  <option>Cash Refund</option>
                </select>
              </div>

              {/* Financials */}
              <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-sm border border-gray-100 flex-grow">
                <div className="flex justify-between">
                  <span>Return Sale Amount</span>
                  <span className="font-medium">₹{totalReturnGross.toFixed(2)}</span>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Less: Proportional Discount</span>
                    <span>- ₹{discountDeducted.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-700">
                  <span>Paid Amount</span>
                  <span className="font-medium">₹{paidAmountOnSale.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
                  <span>Net Return Value</span>
                  <span>₹{(totalReturnGross - discountDeducted).toFixed(2)}</span>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-[#F97316] mt-2">
                    <span>Less: New Items Value</span>
                    <span>- ₹{totalExchangeValue.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Final Total */}
              <div className="mt-auto pt-4 border-t border-gray-100">
                <div className="flex justify-between items-end mb-4">
                  {modeOfReturn === 'Exchange' && finalBalance > 0 ? (
                    <select
                      value={exchangeBalanceAction}
                      onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
                      className="text-gray-500 font-medium bg-transparent border border-gray-200 rounded-sm hover:border-gray-400 focus:border-orange-500 outline-none cursor-pointer pb-1 pr-2 transition-colors"
                    >
                      <option value="Credit Note">Credit Due</option>
                      <option value="Cash Refund">Cash Refund</option>
                    </select>
                  ) : (
                    <span className="text-gray-500 font-medium">{getBalanceLabel()}</span>
                  )}
                  <span className={`text-3xl font-bold ${finalBalance >= 0 ? 'text-[#F97316]' : 'text-red-600'}`}>
                    ₹{Math.abs(finalBalance).toFixed(2)}
                  </span>
                </div>
                <button
                  onClick={handleProcessReturn}
                  className={`w-full py-4 px-4 rounded-sm text-lg font-bold transition-all ${modeOfReturn === 'Exchange' && exchangeItems.length === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#F97316] hover:bg-orange-600 text-white'}`}>
                  Process Transaction
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p>Select a sale to begin return</p>
            </div>
          )}
        </div>

        {/* --- MOBILE FOOTER (Sticky) --- */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18">
          {selectedSale && (<CustomButton
            onClick={handleProcessReturn}
            disabled={
              modeOfReturn === 'Exchange' &&
              (exchangeItems.length === 0 || itemsToReturn.length === 0)
            }
            variant={Variant.Payment}
          >
            Process Transaction
          </CustomButton>)}
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
