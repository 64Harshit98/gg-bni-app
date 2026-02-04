import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

import { db } from '../lib/Firebase';
import {
  collection,
  query,
  getDocs,
  orderBy,
  limit,
  doc,
  writeBatch,
  serverTimestamp,
  increment as firebaseIncrement,
  arrayUnion
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import type { Item } from '../constants/models';

import { ROUTES } from '../constants/routes.constants';
import { Modal } from '../constants/Modal';
import { State, Variant } from '../enums';
import { CustomButton } from '../Components';
import PaymentDrawer, { type PaymentCompletionData } from '../Components/PaymentDrawer';
import { ReturnListItem } from '../Components/ReturnListItem';
import { useSalesSettings } from '../context/SettingsContext';
import type { Order, OrderItem } from './Orders';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import { IconScanCircle } from '../constants/Icons';
import BarcodeScanner from '../UseComponents/BarcodeScanner';
import { GenericCartList } from '../Components/CartItem';
import { applyRounding } from '../Pages/Master/Sales'

interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
}
interface ExchangeItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
  discount: number;
  customPrice?: number | string;
}

// Interface for Customer
interface Customer {
  id?: string;
  name: string;
  number: string;
  [key: string]: any;
}

const OrdersReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { state } = useLocation();
  const location = useLocation();
  const { salesSettings } = useSalesSettings();

  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [partyName, setPartyName] = useState<string>('');
  const [partyNumber, setPartyNumber] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Credit Note');

  const [originalSaleItems, setOriginalSaleItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);

  const [salesList, setSalesList] = useState<Order[]>([]);
  const [selectedSale, setSelectedSale] = useState<Order | null>(null);
  const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');

  // Dropdown States
  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
  const salesDropdownRef = useRef<HTMLDivElement>(null);

  // Customer Dropdown States
  const [availableCustomers, setAvailableCustomers] = useState<Customer[]>([]);
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  const [availableItems, setAvailableItems] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'sale' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const [isDiscountLocked, setIsDiscountLocked] = useState(true);
  const [discountInfo, setDiscountInfo] = useState<string | null>(null);
  const [isPriceLocked, setIsPriceLocked] = useState(true);
  const [priceInfo, setPriceInfo] = useState<string | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (salesSettings) {
      setIsDiscountLocked(salesSettings.lockDiscountEntry ?? false);
      setIsPriceLocked(salesSettings.lockSalePriceEntry ?? false);
    }
  }, [salesSettings]);

  const itemsToReturn = useMemo(() =>
    originalSaleItems.filter(item => selectedReturnIds.has(item.id)),
    [originalSaleItems, selectedReturnIds]
  );

  useEffect(() => {
    if (!currentUser?.companyId) {
      setIsLoading(false);
      return;
    }

    const fetchOrders = async () => {
      if (!currentUser?.companyId) return; // Safety check
      setIsLoading(true);
      try {
        const ordersQuery = query(
          collection(db, 'companies', currentUser.companyId, 'Orders'),
          orderBy('createdAt', 'desc'),
          limit(50)
        );

        const snap = await getDocs(ordersQuery);
        const completedOrders = snap.docs
          .map(d => ({
            id: d.id,
            ...d.data()
          } as Order))
.filter(o =>
  o.status === 'Completed' ||
  o.status === 'Paid'
)
        setSalesList(completedOrders);
      } catch (err) {
        console.error(err);
        setError('Failed to load orders');
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, [currentUser]);


  // Click Outside Handler for both Dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (salesDropdownRef.current && !salesDropdownRef.current.contains(event.target as Node)) {
        setIsSalesDropdownOpen(false);
      }
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(event.target as Node)) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSales = useMemo(() => {
    if (!salesList) return [];

    return salesList.filter(order => {
      const query = (searchSaleQuery || "").toLowerCase();
      const orderId = (order?.OrderId || "").toString().toLowerCase();
      const userName = (order?.userName || "").toString().toLowerCase();
      return orderId.includes(query) || userName.includes(query);
    });
  }, [salesList, searchSaleQuery]);


  const filteredCustomers = useMemo(() => {
    if (!partyNumber) return [];

    const searchParam = String(partyNumber).trim().toLowerCase();
    if (!searchParam) return [];

    return availableCustomers.filter(c => {
      const customerNumber = String(c.number ?? '').toLowerCase();
      const customerName = String(c.name ?? '').toLowerCase();

      return customerNumber.includes(searchParam) || customerName.includes(searchParam);
    });
  }, [availableCustomers, partyNumber]);

  const handleSelectCustomer = (customer: Customer) => {
    setPartyNumber(customer.number);
    setPartyName(customer.name);
    setIsCustomerDropdownOpen(false);
  };

  const handleSelectSale = (Order: any) => {
    setSelectedSale(Order);

    setPartyName(Order.userName || 'Customer');
    setPartyNumber(Order.billingDetails?.phone || '');

    setOriginalSaleItems(
      Order.items.map((item: any) => ({
        id: crypto.randomUUID(),
        originalItemId: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.mrp,
        amount: item.mrp * item.quantity,
        mrp: item.mrp
      }))
    );

    setSearchSaleQuery(Order.OrderId);
    setIsSalesDropdownOpen(false);
  };


  const handleToggleReturnItem = (itemId: string) => {
    setSelectedReturnIds(prevIds => {
      const newIds = new Set(prevIds);
      if (newIds.has(itemId)) newIds.delete(itemId); else newIds.add(itemId);
      return newIds;
    });
  };

  const handleListChange = (
    setter: React.Dispatch<React.SetStateAction<any[]>>,
    id: string,
    field: keyof TransactionItem | keyof ExchangeItem,
    value: string | number
  ) => {
    setter(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };

        if (field === 'discount') {
          const discountValue = Number(value) || 0;
          let newPrice = updatedItem.mrp * (1 - discountValue / 100);

          if (discountValue > 0) {
            if (newPrice < 100) {
              newPrice = Math.ceil(newPrice / 5) * 5;
            } else {
              newPrice = Math.ceil(newPrice / 10) * 10;
            }
          }
          updatedItem.unitPrice = newPrice;
        }

        if (field === 'quantity' || field === 'unitPrice' || field === 'discount') {
          updatedItem.amount = Number(updatedItem.quantity) * Number(updatedItem.unitPrice);
        }
        return updatedItem;
      }
      return item;
    }));
  };

  const handleRemoveFromList = (setter: any, id: string) => {
    setter((prev: any[]) => prev.filter((item: any) => item.id !== id));
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

  const handleBarcodeScanned = (barcode: string) => {
    const purpose = scannerPurpose;
    setScannerPurpose(null);
    if (purpose === 'sale') {
      const foundSale = salesList.find(sale => sale.OrderId === barcode);
      if (foundSale) {
        handleSelectSale(foundSale);
      } else {
        setModal({ message: 'Original sale not found for this invoice.', type: State.ERROR });
      }
    } else if (purpose === 'item') {
      const itemToAdd = availableItems.find(item => item.id === barcode);
      if (itemToAdd) {
        handleExchangeItemSelected(itemToAdd);
      } else {
        setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
      }
    }
  };

  const handleDiscountPressStart = () => { if (!salesSettings?.lockDiscountEntry) longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500); };
  const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handleDiscountClick = () => { if (isDiscountLocked) { setDiscountInfo("Cannot edit discount"); setTimeout(() => setDiscountInfo(null), 3000); } };

  const handlePricePressStart = () => { if (!salesSettings?.lockSalePriceEntry) longPressTimer.current = setTimeout(() => setIsPriceLocked(false), 200); };
  const handlePricePressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handlePriceClick = () => { if (isPriceLocked) { setPriceInfo("Cannot edit price"); setTimeout(() => setPriceInfo(null), 1000); } };

  const handleDiscountChange = (id: string, discountValue: number | string) => {
    const val = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;
    handleListChange(setExchangeItems, id, 'discount', val);
  };

  const handleQuantityChange = (id: string, newQuantity: number) => {
    handleListChange(setExchangeItems, id, 'quantity', Math.max(1, newQuantity));
  };

  const handleCustomPriceChange = (id: string, value: string) => {
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setExchangeItems(prev => prev.map(item => item.id === id ? { ...item, customPrice: value } : item));
    }
  };

  const handleCustomPriceBlur = (id: string) => {
    setExchangeItems(prev => prev.map(item => {
      if (item.id === id && item.customPrice !== undefined) {
        const num = parseFloat(String(item.customPrice));
        if (!isNaN(num)) {
          const newAmount = num * item.quantity;
          return { ...item, unitPrice: num, amount: newAmount, customPrice: undefined };
        }
        return { ...item, customPrice: undefined };
      }
      return item;
    }));
  };

  const addExchangeItem = (itemToAdd: Item) => {
    const discount = itemToAdd.discount || 0;
    let finalExchangePrice = itemToAdd.mrp * (1 - (discount / 100));

    if (discount > 0) {
      if (finalExchangePrice < 100) {
        finalExchangePrice = Math.ceil(finalExchangePrice / 5) * 5;
      } else {
        finalExchangePrice = Math.ceil(finalExchangePrice / 10) * 10;
      }
    }

    setExchangeItems(prev => [...prev, {
      id: crypto.randomUUID(),
      originalItemId: itemToAdd.id!,
      name: itemToAdd.name,
      quantity: 1,
      unitPrice: finalExchangePrice,
      amount: finalExchangePrice,
      mrp: itemToAdd.mrp,
      discount: discount,
    }]);
  };

  const handleExchangeItemSelected = (item: any) => {
    if (item) {
      // FIX: Ensure purchasePrice is a number before passing to addExchangeItem
      addExchangeItem({
        ...item,
        purchasePrice: item.purchasePrice ?? 0
      });
    }
  };

  const mappedExchangeItems: OrderItem[] = useMemo(() => {
    return exchangeItems.map(item => ({
      id: item.id,
      name: item.name,
      mrp: item.mrp,
      quantity: item.quantity,
      note: '',
      tax: 0,
      itemGroupId: '',
    } as unknown as OrderItem));
  }, [exchangeItems]);


  // --- CALCULATION LOGIC (UI) ---
  const {
    totalReturnGross,
    totalReturnValue,
    totalExchangeValue,
    finalBalance,
    discountDeducted
  } = useMemo(() => {
    const trg = itemsToReturn.reduce((sum, item) => sum + (item.amount || 0), 0);
    const tev = exchangeItems.reduce((sum, item) => sum + (item.amount || 0), 0);

    let dd = 0;
    if (selectedSale) {
      const originalInvoiceTotal = (selectedSale.items || []).reduce((sum, item) => {
        return sum + (Number(item.finalPrice) || 0);
      }, 0);

      const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;

      if (originalInvoiceTotal > 0 && originalManualDiscount > 0) {
        const ratio = trg / originalInvoiceTotal;
        dd = Math.round((originalManualDiscount * ratio) * 100) / 100;
      }
    }

    const trv = trg - dd;
    const fb = trv - tev;

    return {
      totalReturnGross: trg,
      totalReturnValue: trv,
      totalExchangeValue: tev,
      finalBalance: fb,
      discountDeducted: dd
    };
  }, [itemsToReturn, exchangeItems, selectedSale]);


  // --- SAVE LOGIC ---
  const saveReturnTransaction = async (
  completionData?: Partial<PaymentCompletionData>
) => {
  if (!currentUser || !currentUser.companyId || !selectedSale) return;

  setIsLoading(true);
  const companyId = currentUser.companyId;

  try {
    const batch = writeBatch(db);
    const saleRef = doc(db, 'companies', companyId, 'Orders', selectedSale.id);

    // --- 0. FINAL PARTY DETAILS ---
    const finalPartyName =
      (completionData?.partyName || partyName || selectedSale.userName || '').trim();

    const finalPartyNumber =
      (completionData?.partyNumber || partyNumber || '').trim();

    // --- 1. ORIGINAL ITEMS MAP ---
    const originalItemsMap = new Map<string, any>();

    (selectedSale.items || []).forEach((item: any) => {
      const safeId = item.id || item.productId;
      const qty = Number(item.quantity) || 1;
      const total = Number(item.finalPrice || item.amount || 0);
      const unit = qty > 0 ? total / qty : 0;

      originalItemsMap.set(safeId, {
        ...item,
        _effectiveUnitPrice: unit
      });
    });

    const originalInvoiceTotal = (selectedSale.items || []).reduce(
      (sum: number, item: any) => sum + Number(item.finalPrice || 0),
      0
    );

    const validInventoryIds = new Set(availableItems.map(i => i.id));

    // --- 2. HANDLE RETURNS ---
    let returnedItemsGrossValue = 0;

    itemsToReturn.forEach(returnItem => {
      const originalItem = originalItemsMap.get(returnItem.originalItemId);

      if (originalItem) {
        originalItem.quantity -= returnItem.quantity;
        returnedItemsGrossValue +=
          originalItem._effectiveUnitPrice * returnItem.quantity;

        if (originalItem.quantity <= 0) {
          originalItemsMap.delete(returnItem.originalItemId);
        }
      }

      if (validInventoryIds.has(returnItem.originalItemId)) {
        batch.update(
          doc(db, 'companies', companyId, 'items', returnItem.originalItemId),
          {
            stock: firebaseIncrement(returnItem.quantity),
            updatedAt: serverTimestamp()
          }
        );
      }
    });

    // --- 3. HANDLE EXCHANGE ---
    exchangeItems.forEach(exchangeItem => {
      const existingItem = originalItemsMap.get(exchangeItem.originalItemId);

      if (existingItem) {
        existingItem.quantity += exchangeItem.quantity;
      } else {
        originalItemsMap.set(exchangeItem.originalItemId, {
          id: exchangeItem.originalItemId,
          name: exchangeItem.name,
          mrp: exchangeItem.mrp,
          quantity: exchangeItem.quantity,
          discount: exchangeItem.discount || 0,
          finalPrice: exchangeItem.amount,
          amount: exchangeItem.amount,
          unitPrice:
            exchangeItem.amount / exchangeItem.quantity || exchangeItem.mrp,
          _effectiveUnitPrice:
            exchangeItem.amount / exchangeItem.quantity || exchangeItem.mrp
        });
      }

      if (validInventoryIds.has(exchangeItem.originalItemId)) {
        batch.update(
          doc(db, 'companies', companyId, 'items', exchangeItem.originalItemId),
          {
            stock: firebaseIncrement(-exchangeItem.quantity),
            updatedAt: serverTimestamp()
          }
        );
      }
    });

    // --- 4. RECALCULATE BILL ---
    const newItemsList = Array.from(originalItemsMap.values()).map(item => {
      const lineTotal = item._effectiveUnitPrice * item.quantity;
      const { _effectiveUnitPrice, ...clean } = item;

      return {
        ...clean,
        finalPrice: lineTotal,
        amount: lineTotal,
        unitPrice: item._effectiveUnitPrice
      };
    });

    const totals = newItemsList.reduce(
      (acc, item) => {
        const gross = item.mrp * item.quantity;
        const discount = gross - item.finalPrice;
        acc.subtotal += gross;
        acc.totalItemDiscount += discount;
        return acc;
      },
      { subtotal: 0, totalItemDiscount: 0 }
    );

    // --- 5. MANUAL DISCOUNT ---
    const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;
    let discountDeduction = 0;

    if (
      originalManualDiscount > 0 &&
      originalInvoiceTotal > 0 &&
      returnedItemsGrossValue > 0
    ) {
      discountDeduction =
        (returnedItemsGrossValue / originalInvoiceTotal) *
        originalManualDiscount;
    }

    discountDeduction = Math.round(discountDeduction * 100) / 100;
    const newManualDiscount = Math.max(
      0,
      originalManualDiscount - discountDeduction
    );

    const updatedFinalAmount =
      totals.subtotal - totals.totalItemDiscount - newManualDiscount;

    // --- 6. PAYMENTS ---
    const updatedPaymentMethods = {
      ...(selectedSale.paymentMethods || {})
    };

    if (completionData?.paymentDetails) {
      Object.entries(completionData.paymentDetails).forEach(
        ([mode, amount]) => {
          if (mode !== 'due') {
            updatedPaymentMethods[mode] =
              (updatedPaymentMethods[mode] || 0) + Number(amount);
          }
        }
      );
    }

    const paid = Object.entries(updatedPaymentMethods)
      .filter(([k]) => k !== 'due')
      .reduce((sum, [, v]) => sum + Number(v), 0);

    updatedPaymentMethods.due = Math.max(0, updatedFinalAmount - paid);

    // --- 7. HISTORY ---
    const returnHistoryRecord = {
      id: crypto.randomUUID(),
      returnedAt: new Date(),
      returnedItems: itemsToReturn,
      exchangeItems,
      finalBalance,
      discountDeducted: discountDeduction,
      modeOfReturn,
      paymentDetails: completionData?.paymentDetails || null,
      partyName: finalPartyName,
      partyNumber: finalPartyNumber
    };

    // --- 8. UPDATE SALE ---
 batch.update(saleRef, {
  status: 'Returned',
  returnedAt: serverTimestamp(),
  returnDetails: {
    items: itemsToReturn,
    exchangeItems,
    refundAmount: finalBalance,
    mode: modeOfReturn
  }
})

    // --- 9. CUSTOMER LEDGER ---
    if (finalPartyNumber.length >= 3 && finalBalance > 0) {
      batch.set(
        doc(db, 'companies', companyId, 'customers', finalPartyNumber),
        {
          name: finalPartyName,
          number: finalPartyNumber,
          creditBalance: firebaseIncrement(finalBalance),
          lastUpdatedAt: serverTimestamp()
        },
        { merge: true }
      );
    }

    await batch.commit();

    setModal({
      type: State.SUCCESS,
      message: 'Return processed successfully!'
    });

    setTimeout(() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`), 1500);
  } catch (err: any) {
    console.error(err);
    setModal({
      type: State.ERROR,
      message: `Failed: ${err.message}`
    });
  } finally {
    setIsLoading(false);
    setIsDrawerOpen(false);
  }
};


  const handleProcessReturn = () => {
    if (itemsToReturn.length === 0 && exchangeItems.length === 0) return setModal({ type: State.ERROR, message: 'No items selected.' });

    if (modeOfReturn === 'Cash Refund' && finalBalance > 0) {
      saveReturnTransaction();
    }
    else if (finalBalance >= 0) {
      saveReturnTransaction();
    } else {
      setIsDrawerOpen(true);
    }
  };

  const getBalanceLabel = () => {
    if (finalBalance < 0) return 'Payment Due';
    if (modeOfReturn === 'Cash Refund') return 'Refund Amount';
    return 'Credit Due';
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;


  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />


      {/* MAIN CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        {/* --- LEFT PANEL (Desktop: 65%, Search + Lists) --- */}
        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto p-2 md:p-2 pb-24 md:pb-2 relative">

          {/* Search */}
          <div className="bg-white p-2 rounded-sm shadow-md mb-4 border border-gray-200">
            <div className="relative" ref={salesDropdownRef}>
              <label htmlFor="search-sale" className="block text-sm font-medium mb-1 text-gray-700">Search Original Sale</label>
              <div className="flex gap-2">
                <input id="search-sale" type="text" value={searchSaleQuery} onChange={(e) => { setSearchSaleQuery(e.target.value); setIsSalesDropdownOpen(true); }} onFocus={() => setIsSalesDropdownOpen(true)} placeholder={selectedSale ? `${selectedSale.userName} (${selectedSale.OrderId})` : "Invoice or Name..."} className="flex-grow p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" autoComplete="off" readOnly={!!selectedSale} />
                {selectedSale && (<button onClick={handleClear} className=" px-3 bg-gray-200 text-gray-700 font-semibold rounded-lg whitespace-nowrap hover:bg-gray-300">Clear</button>)}
              </div>
              {isSalesDropdownOpen && !selectedSale && (
                <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredSales.map((sale) => (
                    <div key={sale.id} className="p-3 cursor-pointer hover:bg-gray-100 border-b border-gray-50 last:border-0" onClick={() => handleSelectSale(sale)}>
                      <p className="font-semibold text-sm">{sale.userName} <span className="text-gray-500 font-normal">({sale.OrderId || 'N/A'})</span></p>
                      <p className="text-xs text-gray-500">Amount: ₹{sale.totalAmount.toFixed(2)}</p>
                    </div>
                  ))}
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
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Date</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Party</label><input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                  </div>

                  {/* --- NEW DROPDOWN FOR PARTY NUMBER --- */}
                  <div className="relative" ref={customerDropdownRef}>
                    <label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label>
                    <input
                      type="text"
                      value={partyNumber}
                      onChange={(e) => { setPartyNumber(e.target.value); setPartyName(''); setIsCustomerDropdownOpen(true); }}
                      onFocus={() => setIsCustomerDropdownOpen(true)}
                      className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm"
                      autoComplete="off"
                      placeholder="Search customer by number or name..."
                    />
                    {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                      <div className="absolute top-full left-0 w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-48 overflow-y-auto">
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
                <div className="flex flex-col gap-2">
                  {originalSaleItems.map((item) => (
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
              </div>

              {/* Exchange Section (Input + List) */}
              <div className="bg-white p-2 rounded-sm shadow-md mb-4 md:mb-0 border border-gray-200">
                {/* Mobile View: Select Mode Here. Desktop: Mode is in Right Panel, but show Content if Exchange is selected */}
                <div className="md:hidden mb-4">
                  <label className="block font-medium text-sm mb-1">Transaction Type</label>
                  <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                    <option>Credit Note</option>
                    <option>Exchange</option>
                    <option>Refund</option>
                  </select>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <>
                    <div className="flex items-end gap-1 mb-3">
                      <div className="flex-grow"><SearchableItemInput
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
                      /></div>
                      <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-md"><IconScanCircle width={20} height={20} /></button>
                    </div>

                    {/* --- DISPLAY ERROR MESSAGES FOR LOCKS --- */}
                    <div className="flex gap-2 text-xs text-red-500 mb-2">
                      {discountInfo && <span>{discountInfo}</span>}
                      {priceInfo && <span>{priceInfo}</span>}
                    </div>

                    {exchangeItems.length > 0 && (
                      <div className="border rounded-sm overflow-hidden mt-4">
                        <div className="bg-gray-50 px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase">
                          Exchange Cart
                        </div>
                        <div className="max-h-60 overflow-y-auto bg-gray-50">
                          <GenericCartList<any>
                            items={mappedExchangeItems.map(item => ({
                              ...item,
                              // GenericCartList ko calculation ke liye 'amount' chahiye hota hai
                              amount: item.mrp ?? (item.mrp * item.quantity),
                              isEditable: true // UI mein controls dikhane ke liye
                            }))}
                            availableItems={availableItems as any}
                            basePriceKey="mrp"
                            priceLabel="MRP"
                            settings={{
                              enableRounding: salesSettings?.enableRounding ?? true,
                              roundingInterval: (salesSettings as any)?.roundingInterval ?? 1,
                              enableItemWiseDiscount: salesSettings?.enableItemWiseDiscount ?? true,
                              lockDiscount: isDiscountLocked,
                              lockPrice: isPriceLocked
                            }}
                            applyRounding={applyRounding}
                            State={State}
                            setModal={setModal}
                            onOpenEditDrawer={() => { }}
                            onDeleteItem={(id: any) => handleRemoveFromList(setExchangeItems, id)}
                            onDiscountChange={handleDiscountChange}
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
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Mobile Only: Inline Summary (Above Footer) */}
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
                  <p>{getBalanceLabel()}</p><p>₹{Math.abs(finalBalance).toFixed(2)}</p>
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
                <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none">
                  <option>Credit Note</option>
                  <option>Exchange</option>
                  <option>Cash Refund</option>
                </select>
              </div>

              {/* Financials */}
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
                <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
                  <span>Net Return Value</span>
                  <span>₹{(totalReturnGross - discountDeducted).toFixed(2)}</span>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between text-blue-600 mt-2">
                    <span>Less: New Items Value</span>
                    <span>- ₹{totalExchangeValue.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Final Total */}
              <div className="mt-auto pt-4 border-t border-gray-100">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-gray-500 font-medium">{getBalanceLabel()}</span>
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

        {/* --- MOBILE FOOTER (Sticky) --- */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-transparent flex justify-center pb-18">
          {selectedSale && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md">Process Transaction</CustomButton>)}
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
      />
    </div>
  );
};

export default OrdersReturnPage;