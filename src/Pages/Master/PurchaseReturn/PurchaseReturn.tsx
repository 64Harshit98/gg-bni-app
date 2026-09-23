import React, { useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Modal } from '../../../constants/Modal';
import { State, Variant } from '../../../enums';
import { CustomButton } from '../../../Components';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import PaymentDrawer from '../../../Components/PaymentDrawer';
import BarcodeScanner from '../../../UseComponents/BarcodeScanner';
import { ReturnListItem } from '../../../Components/ReturnListItem';
import { IconScanCircle } from '../../../constants/Icons';
import { GenericCartList } from '../../../Components/CartItem';
import { usePurchaseSettings } from '../../../context/SettingsContext';
import { ItemEditDrawer } from '../../../Components/ItemDrawer';
import { useAuth, useDatabase } from '../../../context/auth-context';
import type { ReturnCartItem } from './purchaseReturn.types';
import { useNewItemsReceived, usePurchaseReturnLookup, useSavePurchaseReturn } from './hooks';

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

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-300 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">
      <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left mb-2 md:mb-0">
        Purchase Return
      </h1>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      {/* HEADER */}
      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto p-1 md:p-2 pb-24 md:pb-6 relative">

          {/* Search */}
          <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
            <div className="relative" ref={dropdownRef}>
              <label htmlFor="search-purchase" className="block text-sm font-medium mb-1 text-gray-700">Search Original Purchase</label>
              <div className="flex gap-2">
                <input
                  type="text" id="search-purchase" value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder={selectedPurchase ? `${selectedPurchase.partyName} (${selectedPurchase.invoiceNumber})` : "Supplier or Invoice..."}
                  className="flex-grow p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" autoComplete="off" readOnly={!!selectedPurchase}
                />
                {selectedPurchase && (
                  <button onClick={handleClear} className="py-2 px-3 bg-gray-200 text-gray-700 font-semibold rounded-lg hover:bg-gray-300">
                    Clear
                  </button>
                )}
              </div>
              {isDropdownOpen && !selectedPurchase && (
                <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredList.map(item => (
                    <div key={item.id} className="p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0" onClick={() => handleSelectPurchase(item)}>
                      <p className="font-semibold text-sm">{item.partyName} <span className="text-gray-500 font-normal">({item.invoiceNumber})</span></p>
                      <p className="text-xs text-gray-500">Amount: ₹{item.totalAmount.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {selectedPurchase && (
            <>
              {/* Purchase Details */}
              <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
                <div className="space-y-3 mb-4">
                  <div className='grid grid-cols-2 gap-4'>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Date</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>

                    {/* --- PARTY NAME DROPDOWN (NEW) --- */}
                    <div className="relative" ref={nameDropdownRef}>
                      <label className="block text-xs font-bold text-gray-500 uppercase">Party Name</label>
                      <input
                        type="text"
                        value={supplierName}
                        onChange={(e) => {
                          setSupplierName(e.target.value);
                          setIsNameDropdownOpen(true);
                        }}
                        onFocus={() => setIsNameDropdownOpen(true)}
                        className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
                        autoComplete="off"
                        placeholder="Search by name..."
                      />
                      {isNameDropdownOpen && filteredPartiesByName.length > 0 && (
                        <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {filteredPartiesByName.map((party) => (
                            <div
                              key={party.id}
                              className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0"
                              onClick={() => handleSelectParty(party)}
                            >
                              <p className="font-semibold text-sm text-gray-800">{party.name}</p>
                              <p className="text-xs text-gray-500">{party.number}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>

                  {/* --- PARTY NUMBER DROPDOWN --- */}
                  <div className="relative" ref={partyDropdownRef}>
                    <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
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
                      className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
                      autoComplete="off"
                      placeholder="Search party by number or name..."
                    />
                    {isPartyDropdownOpen && filteredPartiesByNumber.length > 0 && (
                      <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {filteredPartiesByNumber.map((party) => (
                          <div
                            key={party.id}
                            className="p-2 cursor-pointer hover:bg-gray-100 border-b last:border-0"
                            onClick={() => handleSelectParty(party)}
                          >
                            <p className="font-semibold text-sm text-gray-800">{party.name}</p>
                            <p className="text-xs text-gray-500">{party.number}</p>
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
                  <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-sm flex items-center justify-center">
                        <IconScanCircle width={24} height={24} />
                      </button>
                </div>

                {originalPurchaseItems.length === 0 && (
                  <p className="text-sm text-gray-500 mb-2">
                    No returnable items found for this purchase.
                  </p>
                )}

                <div className="flex flex-col gap-2">
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
              </div>

              {/* Exchange / New Items (Input + List) */}
              <div className="bg-white p-2 rounded-sm shadow-md mb-5 md:mb-0 border border-gray-200">
                {/* Mobile View: Mode Select Here */}
                <div className="md:hidden mb-2">
                  <label className="block font-medium text-sm mb-1">Transaction Type</label>
                  <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                    <option>Exchange</option>
                    <option disabled={isPurchaseUnpaid}>Debit Note</option>
                    <option>Cash Refund</option>
                  </select>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <div className="mt-2">
                    <div className="flex items-end gap-2 mb-2">
                      <div className="flex-grow">
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
                      <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-sm flex items-center justify-center">
                        <IconScanCircle width={24} height={24} />
                      </button>
                    </div>

                    {newItemsReceived.length > 0 && (
                      <div className="border rounded-md overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase">Received Items</div>
                        <div className="max-h-60 overflow-y-auto bg-gray-50">
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
                )}
              </div>

              {/* Mobile Only: Inline Summary */}
              <div className="md:hidden bg-white p-2 rounded-sm shadow-md mt-2">
                <div className="flex justify-between items-center text-sm text-red-700">
                  <p>Return Value</p><p className="font-medium">₹{totalReturnValue.toFixed(2)}</p>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between items-center text-xs text-orange-600 mt-1">
                    <p>Less Bill Discount</p><p>- ₹{discountDeducted.toFixed(2)}</p>
                  </div>
                )}
                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between items-center text-sm text-green-700 mt-1">
                    <p>New Items Value</p><p className="font-medium">₹{totalNewItemsValue.toFixed(2)}</p>
                  </div>
                )}
                <div className="border-t border-gray-200 my-2"></div>
                <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                  {modeOfReturn === 'Exchange' && finalBalance > 0 ? (
                    <select
                      value={exchangeBalanceAction}
                      onChange={(e) => setExchangeBalanceAction(e.target.value as any)}
                      className="bg-transparent border-b-2 border-gray-200 hover:border-gray-400 focus:border-blue-500 outline-none cursor-pointer py-1 pr-2 text-gray-700 transition-colors"
                    >
                      <option value="Debit Note">Debit Note</option>
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
          {selectedPurchase ? (
            <div className="flex flex-col h-full">
              <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Return Summary</h2>

              {/* Transaction Type */}
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Transaction Type</label>
                <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none">
                  <option>Exchange</option>
                  <option disabled={isPurchaseUnpaid}>Debit Note</option>
                  <option>Cash Refund</option>
                </select>
              </div>

              {/* Financials */}
              <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-2 rounded-xl border border-gray-100 flex-grow">
                <div className="flex justify-between">
                  <span>Gross Return Value</span>
                  <span className="font-medium">₹{totalReturnValue.toFixed(2)}</span>
                </div>
                {discountDeducted > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Less: Proportional Discount</span>
                    <span>- ₹{discountDeducted.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
                  <span>Net Return Value</span>
                  <span className="text-red-600">₹{(totalReturnValue - discountDeducted).toFixed(2)}</span>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-green-600 mt-2">
                    <span>New Items Value</span>
                    <span>- ₹{totalNewItemsValue.toFixed(2)}</span>
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
                      className="text-gray-500 font-medium bg-transparent border-b-2 border-gray-200 hover:border-gray-400 focus:border-blue-500 outline-none cursor-pointer pb-1 pr-2 transition-colors"
                    >
                      <option value="Debit Note">Debit Note</option>
                      <option value="Cash Refund">Cash Refund</option>
                    </select>
                  ) : (
                    <span className="text-gray-500 font-medium">{getBalanceLabel()}</span>
                  )}
                  <span className={`text-3xl font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
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
              <p>Select a purchase to begin return</p>
            </div>
          )}
        </div>

        {/* --- MOBILE FOOTER (Sticky) --- */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-2 bg-transparent flex justify-center pb-18">
          {selectedPurchase && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md">Process Transaction</CustomButton>)}
        </div>

      </div>

      <PaymentDrawer
        mode='purchase'
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        billTotal={Math.abs(finalBalance)}

        // 👇 ADD THESE 5 LINES:
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