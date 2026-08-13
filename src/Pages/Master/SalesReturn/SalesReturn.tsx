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
import { ReturnListItem } from '../../../Components/ReturnListItem';
import { GenericCartList } from '../../../Components/CartItem';
import { applyRounding, type SalesItem } from '../Sales';
import { ItemEditDrawer } from '../../../Components/ItemDrawer';
import { useAuth, useDatabase } from '../../../context/auth-context';
import { useExchangeItems, useSalesReturnLookup, useSaveSalesReturn } from './hooks';

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

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-300 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">
      <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left mb-2 md:mb-0">Sales Return</h1>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />
      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* --- LEFT PANEL --- */}
        {/* REVERTED: Whole left panel scrolls naturally (overflow-y-auto) */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto relative">

          {/* ADDED: pb-32 to allow scrolling past the floating footer button */}
          <div className="p-2 md:p-2 pb-32 md:pb-2">

            {/* Search Section */}
            <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
              <div className="relative" ref={salesDropdownRef}>
                <label htmlFor="search-sale" className="block text-sm font-medium mb-1 text-gray-700">Search Original Sale</label>
                <div className="flex gap-2">
                  <input id="search-sale" type="text" value={searchSaleQuery} onChange={(e) => { setSearchSaleQuery(e.target.value); setIsSalesDropdownOpen(true); }} onFocus={() => setIsSalesDropdownOpen(true)} placeholder={selectedSale ? `${selectedSale.partyName} (${selectedSale.invoiceNumber})` : "Invoice or Name..."} className="flex-grow p-2 border rounded-sm focus:ring-2 focus:ring-blue-500 outline-none" autoComplete="off" readOnly={!!selectedSale} />
                  {selectedSale && (<button onClick={handleClear} className=" px-3 bg-gray-200 text-gray-700 font-semibold rounded-sm whitespace-nowrap hover:bg-gray-300">Clear</button>)}
                </div>
                {isSalesDropdownOpen && !selectedSale && (
                  <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredSales.map((sale) => (
                      <div key={sale.id} className="p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0" onClick={() => handleSelectSale(sale)}>
                        <p className="font-semibold text-sm">{sale.partyName} <span className="text-gray-500 font-normal">({sale.invoiceNumber || 'N/A'})</span></p>
                        <p className="text-xs text-gray-500">Amount: ₹{sale.totalAmount.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedSale && (
              <>
                {/* Sale Details */}
                <div className="bg-white p-3 rounded-sm shadow-md mb-4 border border-gray-200">
                  <div className="space-y-3 mb-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-bold text-gray-500 uppercase">Date</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                      <div><label className="block text-xs font-bold text-gray-500 uppercase">Party</label><input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                    </div>
                    <div className="relative" ref={customerDropdownRef}>
                      <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
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
                        className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
                        autoComplete="off"
                        placeholder="Search customer by number or name..."
                      />
                      {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                        <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {filteredCustomers.map((customer) => (
                            <div key={customer.id} className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0" onClick={() => handleSelectCustomer(customer)}>
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
                        className="w-full p-2 border rounded-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        autoComplete="off"
                      />
                    </div>
                    <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-sm"><IconScanCircle width={20} height={20} /></button>
                  </div>

                  {originalSaleItems.length === 0 && (
                    <p className="text-sm text-gray-500 mb-2">
                      No returnable items found for this sale.
                    </p>
                  )}
                  {/* Normal list, scroll controlled by main panel */}
                  <div className="flex flex-col gap-2">
                    {filteredReturnItems.map((item) => (
                      <ReturnListItem key={item.id} item={item} isSelected={selectedReturnIds.has(item.id)} onToggle={handleToggleReturnItem} onQuantityChange={(id, val) => handleListChange(setOriginalSaleItems, id, 'quantity', val)} showMrp={true} />
                    ))}
                  </div>
                </div>

                {/* Exchange Section */}
                <div className="bg-white p-2 rounded-sm shadow-md mb-4 md:mb-0 border border-gray-200">
                  <div className="md:hidden mb-4">
                    <label className="block font-medium text-sm mb-1">Transaction Type</label>
                    <select value={modeOfReturn} onChange={(e) => {
                      const value = e.target.value;
                      setModeOfReturn(value)
                      if (value !== 'Exchange')
                        setExchangeItems([])
                      setExchangeSearchQuery('');
                    }}
                      className="w-full p-2 border rounded bg-white">
                      <option disabled={isDueSale}>Credit Note</option>
                      <option>Exchange</option>
                      <option>Refund</option>
                    </select>
                  </div>
                  {modeOfReturn === 'Exchange' && (
                    <>
                      <div className="flex items-end gap-1 mb-3">
                        <div className="flex-grow"><SearchableItemInput label="Add Exchange Item" placeholder="Search inventory..." items={availableItems} onItemSelected={handleExchangeItemSelected} isLoading={isLoading} error={error} onSearchChange={setExchangeSearchQuery} /></div>
                        <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-sm"><IconScanCircle width={20} height={20} /></button>
                      </div>
                      <div className="flex gap-2 text-xs text-red-500 mb-2">
                        {discountInfo && <span>{discountInfo}</span>}
                        {priceInfo && <span>{priceInfo}</span>}
                      </div>
                      {exchangeItems.length > 0 && (
                        <div className="overflow-hidden">
                          <div className=" px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase mb-2">Exchange Cart</div>

                          {/* Normal container, scroll controlled by main panel */}
                          <div className="">
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
                    </>
                  )}
                </div>

                {/* Mobile Summary */}
                <div className="md:hidden bg-white p-2 rounded-sm shadow-md">
                  <div className="flex justify-between items-center text-sm text-blue-700">
                    <p>Return Value</p><p className="font-medium">₹{totalReturnGross.toFixed(2)}</p>
                  </div>
                  {discountDeducted > 0 && (
                    <div className="flex justify-between items-center text-xs text-red-600 mt-1">
                      <p>Less Bill Discount</p><p>- ₹{discountDeducted.toFixed(2)}</p>
                    </div>
                  )}
                  {modeOfReturn === 'Exchange' && (
                    <div className="flex justify-between items-center text-sm text-blue-700 mt-1">
                      <p>Exchange Value</p><p className="font-medium">₹{totalExchangeValue.toFixed(2)}</p>
                    </div>
                  )}
                  <div className="border-t border-gray-200 my-2"></div>
                  <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {modeOfReturn === 'Exchange' && finalBalance > 0 ? (
                      <select
                        value={exchangeBalanceAction}
                        onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
                        className="bg-transparent border border-gray-300  rounded-sm hover:border-gray-400 focus:border-blue-500 outline-none cursor-pointer py-1 pr-2 text-gray-700 transition-colors"
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
        </div>

        {/* --- RIGHT PANEL --- */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 p-6">
          {selectedSale ? (
            <div className="flex flex-col h-full">
              <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Return Summary</h2>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Transaction Type</label>
                <select value={modeOfReturn} onChange={(e) => {
                  const value = e.target.value;
                  setModeOfReturn(value)
                  if (value !== 'Exchange')
                    setExchangeItems([])
                  setExchangeSearchQuery('');
                }} className="w-full p-3 border border-gray-300 rounded-sm bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none">
                  <option disabled={isDueSale} >Credit Note</option>
                  <option>Exchange</option>
                  <option>Cash Refund</option>
                </select>
              </div>
              <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100 flex-grow">
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
                  <span>₹{totalReturnValue.toFixed(2)}</span>
                </div>
                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-blue-600 mt-2">
                    <span>Less: New Items Value</span>
                    <span>- ₹{totalExchangeValue.toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="mt-auto pt-4 border-t border-gray-100">
                <div className="flex justify-between items-end mb-4">
                  {modeOfReturn === 'Exchange' && finalBalance > 0 ? (
                    <select
                      value={exchangeBalanceAction}
                      onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
                      className="text-gray-500 font-medium bg-transparent border border-gray-200 rounded-sm hover:border-gray-400 focus:border-blue-500 outline-none cursor-pointer pb-1 pr-2 transition-colors"
                    >
                      <option value="Credit Note">Credit Due</option>
                      <option value="Cash Refund">Cash Refund</option>
                    </select>
                  ) : (
                    <span className="text-gray-500 font-medium">{getBalanceLabel()}</span>
                  )}
                  <span className={`text-3xl font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{Math.abs(finalBalance).toFixed(2)}
                  </span>
                </div>
                <button onClick={handleProcessReturn} className="w-full bg-blue-600 text-white py-4 px-4 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-[0.98] text-lg font-bold hover:bg-blue-700">
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

        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18 pointer-events-none">
          {selectedSale && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md pointer-events-auto">Process Transaction</CustomButton>)}
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