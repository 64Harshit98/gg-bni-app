import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { useAuth } from '../context/auth-context';
import type { Item } from '../constants/models';

import { ROUTES } from '../constants/routes.constants';
import { Modal } from '../constants/Modal';
import { State, Variant } from '../enums';
import { CustomButton } from '../Components';
import PaymentDrawer from '../Components/PaymentDrawer';
import { ReturnListItem } from '../Components/ReturnListItem';
import type { Order, OrderItem } from './Orders';
import BarcodeScanner from '../UseComponents/BarcodeScanner';

// Custom hooks
import { useOrderReturnData } from '../Catalogue/hooks/useOrderReturnData';
import { useExchangeItems } from '../Catalogue/hooks/useExchangeItems';
import { useReturnCalculations } from '../Catalogue/hooks/useReturnCalculations';
import { useReturnTransaction } from '../Catalogue/hooks/useReturnTransaction';

// Sub-components
import { SaleSearchInput } from '../Components/SaleSearchInput';
import { ReturnSummaryPanel } from '../Components/ReturnSummaryPanel';
import { ExchangeSection } from '../Components/ExchangeSection';

interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
}

const OrdersReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { state } = useLocation();

  // ─── Form state ────────────────────────────────────────────────────────────
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [partyName, setPartyName] = useState<string>('');
  const [partyNumber, setPartyNumber] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Credit Note');
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'sale' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // ─── Sale selection state ───────────────────────────────────────────────────
  const [selectedSale, setSelectedSale] = useState<Order | null>(null);
  const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');
  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
  const [originalSaleItems, setOriginalSaleItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());

  // ─── Item edit drawer state ─────────────────────────────────────────────────
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

  // ─── Data hooks ─────────────────────────────────────────────────────────────
  const {
    salesList, setSalesList,
    availableItems, setAvailableItems,
    catalogueSettings,
    isLoading, error,
  } = useOrderReturnData();

  // ─── Exchange items hook ────────────────────────────────────────────────────
  const {
    exchangeItems, setExchangeItems,
    mappedExchangeItems,
    handleExchangeItemSelected,
    handleQuantityChange,
    handleDiscountChange,
    handleCustomPriceChange,
    handleCustomPriceBlur,
    handleRemoveExchangeItem,
  } = useExchangeItems(availableItems, setModal);

  // ─── Derived items to return ────────────────────────────────────────────────
  const itemsToReturn = useMemo(
    () => originalSaleItems.filter(item => selectedReturnIds.has(item.id)),
    [originalSaleItems, selectedReturnIds]
  );

  // ─── Calculations hook ──────────────────────────────────────────────────────
  const { totalReturnGross, totalExchangeValue, finalBalance, discountDeducted } =
    useReturnCalculations(itemsToReturn, exchangeItems, selectedSale, modeOfReturn);

  // ─── Save hook ──────────────────────────────────────────────────────────────
  const { saveReturnTransaction } = useReturnTransaction({
    selectedSale, itemsToReturn, exchangeItems,
    availableItems, partyName, partyNumber, modeOfReturn, finalBalance,
    setModal, setSelectedSale, setSalesList,
    setOriginalSaleItems,
    setSelectedReturnIds: ids => setSelectedReturnIds(ids),
    setExchangeItems: items => setExchangeItems(items as any),
    onSuccess: () => setTimeout(() => navigate(ROUTES.ORDERDETAILS), 1500),
  });

  // ─── Sale selection helpers ─────────────────────────────────────────────────
  const handleSelectSale = (order: Order) => {
    setSelectedSale(order);
    setSearchSaleQuery(order.orderId ?? '');
    setPartyName(order.userName ?? 'Customer');
    setPartyNumber(order.billingDetails?.phone ?? '');

    setOriginalSaleItems(
      (order.items ?? [])
        .map((item: any) => {
          if (!item.id) return null;
          const qty = Number(item.quantity) || 0;
          const price = Number(item.salesPrice ?? item.mrp) || 0;
          return {
            id: item.id, originalItemId: item.id,
            name: item.name ?? 'Unnamed Item',
            quantity: qty, originalQuantity: qty,
            unitPrice: price, amount: price * qty,
            mrp: Number(item.mrp) || price,
          };
        })
        .filter(Boolean) as TransactionItem[]
    );
  };

  const handleClear = () => {
    setSelectedSale(null);
    setPartyName('');
    setPartyNumber('');
    setOriginalSaleItems([]);
    setSelectedReturnIds(new Set());
    setExchangeItems([]);
    setSearchSaleQuery('');
    navigate(`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`);
  };

  // ─── Effects ─────────────────────────────────────────────────────────────
  // Auto-select sale from navigation state
  useEffect(() => {
    if (!state?.selectedOrder || salesList.length === 0) return;
    const found = salesList.find(o => o.orderId === state.selectedOrder);
    if (found) handleSelectSale(found);
  }, [state, salesList]);

  // Clear exchange items when mode changes away from Exchange
  useEffect(() => {
    if (modeOfReturn !== 'Exchange') setExchangeItems([]);
  }, [modeOfReturn]);

  // ─── Filtered sales list ──────────────────────────────────────────────────
  const filteredSales = useMemo(() => {
    if (!salesList) return [];
    return salesList
      .filter(order => ['completed', 'paid', 'unpaid'].includes(String(order.status).toLowerCase().trim()))
      .filter(order => {
        const q = (searchSaleQuery || '').toLowerCase();
        return (
          (order?.orderId || '').toLowerCase().includes(q) ||
          (order?.userName || '').toLowerCase().includes(q) ||
          String(order?.billingDetails?.phone || '').toLowerCase().includes(q)
        );
      });
  }, [salesList, searchSaleQuery]);

  // ─── Item toggle ──────────────────────────────────────────────────────────
  const handleToggleReturnItem = (itemId: string) => {
    if (!originalSaleItems.find(i => i.id === itemId)) return;
    setSelectedReturnIds(prev => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  };

  // ─── Item drawer handlers ─────────────────────────────────────────────────
  const handleCloseEditDrawer = () => {
    setIsItemDrawerOpen(false);
    setTimeout(() => setSelectedItemForEdit(null), 300);
  };

  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    if (!selectedItemForEdit) return;

    setAvailableItems(prev =>
      prev.map(item => {
        if (item.id !== selectedItemForEdit.id) return item;
        return {
          ...item, ...updatedItemData,
          name: updatedItemData.name ?? item.name,
          mrp: Number(updatedItemData.mrp ?? item.mrp),
          salesPrice: Number(updatedItemData.salesPrice ?? item.salesPrice),
          moq: updatedItemData.moq !== undefined ? Number(updatedItemData.moq) : (item as any).moq ?? 1,
        } as OrderItem;
      })
    );

    setExchangeItems(prev =>
      prev.map((item: any) => {
        if (item.originalItemId !== selectedItemForEdit.id) return item;
        const newMrp = Number(updatedItemData.mrp ?? item.mrp);
        const newSalesPrice = Number(updatedItemData.salesPrice ?? item.salesPrice);
        const finalPrice = newSalesPrice > 0 ? newSalesPrice : newMrp;
        const discount = newMrp > 0 && newSalesPrice > 0 ? ((newMrp - newSalesPrice) / newMrp) * 100 : 0;
        return {
          ...item, mrp: newMrp, salesPrice: newSalesPrice,
          unitPrice: finalPrice, basePrice: finalPrice,
          discount: parseFloat(discount.toFixed(2)),
          amount: finalPrice * item.quantity,
        };
      }) as any
    );

    setIsItemDrawerOpen(false);
    setSelectedItemForEdit(null);
  };

  // ─── Barcode scanner ──────────────────────────────────────────────────────
  const handleBarcodeScanned = (barcode: string) => {
    const purpose = scannerPurpose;
    setScannerPurpose(null);

    if (purpose === 'sale') {
      const found = salesList.find(
        s => s.orderId === barcode && ['paid', 'completed', 'confirmed'].includes(String(s.status).toLowerCase())
      );
      if (found) handleSelectSale(found);
      else setModal({ message: 'Original sale not found for this invoice.', type: State.ERROR });
    } else if (purpose === 'item') {
      const item = availableItems.find(i => i.id === barcode);
      if (item) handleExchangeItemSelected(item);
      else setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
    }
  };

  // ─── Return quantity change ───────────────────────────────────────────────
  const handleReturnQuantityChange = (id: string, val: number) => {
    const item = originalSaleItems.find(i => i.id === id);
    if (!item) return;
    const safeQty = Math.min(Math.max(1, val), (item as any).originalQuantity);
    setOriginalSaleItems(prev =>
      prev.map(i => {
        if (i.id !== id) return i;
        return { ...i, quantity: safeQty, amount: safeQty * i.unitPrice };
      })
    );
  };

  // ─── Process return ───────────────────────────────────────────────────────
  const handleProcessReturn = () => {
    if (itemsToReturn.length === 0 && exchangeItems.length === 0) {
      return setModal({ type: State.ERROR, message: 'No items selected.' });
    }

    if (modeOfReturn === 'Credit Note') {
      if (itemsToReturn.length === 0) return setModal({ type: State.ERROR, message: 'Please select at least one item to return.' });
      setExchangeItems([]);
      saveReturnTransaction();
      return;
    }

    if (modeOfReturn === 'Exchange') {
      if (itemsToReturn.length === 0) return setModal({ type: State.ERROR, message: 'Please select an item to exchange with.' });
      if (exchangeItems.length === 0) return setModal({ type: State.ERROR, message: 'Please add an item for exchange.' });
      finalBalance < 0 ? setIsDrawerOpen(true) : saveReturnTransaction();
      return;
    }

    if (modeOfReturn === 'Cash Refund') {
      if (itemsToReturn.length === 0) return setModal({ type: State.ERROR, message: 'Please select at least one item for cash refund.' });
      setExchangeItems([]);
      saveReturnTransaction();
      return;
    }

    finalBalance < 0 ? setIsDrawerOpen(true) : saveReturnTransaction();
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner
        isOpen={scannerPurpose !== null}
        onClose={() => setScannerPurpose(null)}
        onScanSuccess={handleBarcodeScanned}
      />

      {/* HEADER */}
      <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2 shadow-sm">
        <div className="w-14 flex justify-start">
          <button
            onClick={() => navigate(ROUTES.ORDERDETAILS)}
            className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors text-slate-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
              fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        </div>
        <div className="flex-1 text-center">
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Orders Return</h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Process Refunds & Exchange</p>
        </div>
        <div className="w-14" />
      </header>

      {/* MAIN */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* LEFT PANEL */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto p-2 md:p-2 pb-24 md:pb-2 relative">

          <SaleSearchInput
            searchQuery={searchSaleQuery}
            onSearchChange={setSearchSaleQuery}
            isDropdownOpen={isSalesDropdownOpen}
            setIsDropdownOpen={setIsSalesDropdownOpen}
            filteredSales={filteredSales}
            selectedSale={selectedSale}
            onSelectSale={sale => { handleSelectSale(sale); setIsSalesDropdownOpen(false); }}
            onClear={handleClear}
          />

          {selectedSale && (
            <>
              {/* Sale details + return item selection */}
              <div className="bg-white p-3 rounded-sm shadow-md mb-4 border border-gray-200">
                <div className="space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase">Date</label>
                      <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
                        className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase">Party</label>
                      <input type="text" value={partyName} onChange={e => setPartyName(e.target.value)}
                        className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
                    <input
                      type="text"
                      value={partyNumber}
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, '');
                        if (value.length <= 10) setPartyNumber(value);
                      }}
                      className="w-full p-1 border-b border-gray-300 focus:border-[#F97316] outline-none text-sm"
                      autoComplete="off"
                      placeholder="Customer phone number"
                      maxLength={10}
                    />
                  </div>
                </div>

                <h3 className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">Select Return Items</h3>
                <div className="flex flex-col gap-2">
                  {originalSaleItems.length === 0 && (
                    <p className="text-sm text-gray-500">No returnable items found for this order.</p>
                  )}
                  {originalSaleItems.map(item => (
                    <ReturnListItem
                      key={item.id}
                      item={item}
                      isSelected={selectedReturnIds.has(item.id)}
                      onToggle={handleToggleReturnItem}
                      onQuantityChange={handleReturnQuantityChange}
                      showMrp
                    />
                  ))}
                </div>
              </div>

              {/* Exchange section */}
              <div className="bg-white p-2 rounded-sm shadow-md mb-4 md:mb-0 border border-gray-200">
                {/* Mobile: mode selector */}
                <div className="md:hidden mb-4">
                  <label className="block font-medium text-sm mb-1">Transaction Type</label>
                  <select value={modeOfReturn} onChange={e => setModeOfReturn(e.target.value)}
                    className="w-full p-2 border rounded bg-white">
                    <option>Credit Note</option>
                    <option>Exchange</option>
                    <option>Refund</option>
                  </select>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <ExchangeSection
                    availableItems={availableItems}
                    mappedExchangeItems={mappedExchangeItems}
                    catalogueSettings={catalogueSettings}
                    isLoading={isLoading}
                    error={error}
                    onItemSelected={handleExchangeItemSelected}
                    onScanClick={() => setScannerPurpose('item')}
                    onDeleteItem={handleRemoveExchangeItem}
                    onDiscountChange={handleDiscountChange}
                    onCustomPriceChange={handleCustomPriceChange}
                    onCustomPriceBlur={handleCustomPriceBlur}
                    onQuantityChange={handleQuantityChange}
                    setModal={setModal}
                    selectedItemForEdit={selectedItemForEdit}
                    isItemDrawerOpen={isItemDrawerOpen}
                    onOpenEditDrawer={item => {
                      const real = availableItems.find(i => i.id === item.id);
                      if (real) { setSelectedItemForEdit(real as any); setIsItemDrawerOpen(true); }
                    }}
                    onCloseEditDrawer={handleCloseEditDrawer}
                    onSaveSuccess={handleSaveSuccess}
                  />
                )}
              </div>

              {/* Mobile inline summary */}
              <div className="md:hidden">
              <ReturnSummaryPanel
                isMobile
                modeOfReturn={modeOfReturn}
                onModeChange={setModeOfReturn}
                totalReturnGross={totalReturnGross}
                totalExchangeValue={totalExchangeValue}
                finalBalance={finalBalance}
                discountDeducted={discountDeducted}
                onProcess={handleProcessReturn}
                exchangeItemsCount={exchangeItems.length}
              />
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL (desktop) */}
        <div className="hidden md:flex w-[35%] flex-col bg-white h-full relative border-l border-gray-200 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 p-6">
          {selectedSale ? (
            <ReturnSummaryPanel
              modeOfReturn={modeOfReturn}
              onModeChange={setModeOfReturn}
              totalReturnGross={totalReturnGross}
              totalExchangeValue={totalExchangeValue}
              finalBalance={finalBalance}
              discountDeducted={discountDeducted}
              onProcess={handleProcessReturn}
              exchangeItemsCount={exchangeItems.length}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <p>Select a sale to begin return</p>
            </div>
          )}
        </div>

        {/* Mobile sticky footer */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18">
          {selectedSale && (
            <CustomButton
              onClick={handleProcessReturn}
              disabled={modeOfReturn === 'Exchange' && (exchangeItems.length === 0 || itemsToReturn.length === 0)}
              variant={Variant.Payment}
            >
              Process Transaction
            </CustomButton>
          )}
        </div>
      </div>

      <PaymentDrawer
        mode="sale"
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        billTotal={Math.abs(finalBalance)}
        onPaymentComplete={saveReturnTransaction}
        initialPartyName={partyName}
        initialPartyNumber={partyNumber}
      />
    </div>
  );
};

export default OrdersReturnPage;
