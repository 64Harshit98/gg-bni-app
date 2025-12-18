// src/Pages/SalesReturnPage.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  collection,
  query,
  getDocs,
  doc,
  writeBatch,
  increment as firebaseIncrement,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuth, useDatabase } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import type { Item, SalesItem as OriginalSalesItem } from '../../constants/models';
import { Modal } from '../../constants/Modal';
import { State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import { IconScanCircle } from '../../constants/Icons';
import { useSalesSettings } from '../../context/SettingsContext';
import { ReturnListItem } from '../../Components/ReturnListItem';
import { GenericCartList } from '../../Components/CartItem';
import { applyRounding, type SalesItem } from './Sales';

// --- Interfaces ---
interface SalesData {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyNumber: string;
  items: OriginalSalesItem[];
  totalAmount: number;
  subtotal: number;
  discount: number;
  manualDiscount?: number;
  createdAt: any;
  isReturned?: boolean;
}
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

const SalesReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { state } = useLocation();
  const { invoiceId } = useParams();
  const location = useLocation();

  const { salesSettings } = useSalesSettings();

  // --- State Variables ---
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [partyName, setPartyName] = useState<string>('');
  const [partyNumber, setPartyNumber] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Credit Note');

  const [originalSaleItems, setOriginalSaleItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);

  const [salesList, setSalesList] = useState<SalesData[]>([]);
  const [selectedSale, setSelectedSale] = useState<SalesData | null>(null);
  const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');
  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
  const salesDropdownRef = useRef<HTMLDivElement>(null);

  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'sale' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  // --- Lock States ---
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

  // --- Fetch Data ---
  useEffect(() => {
    if (!currentUser || !currentUser.companyId || !dbOperations) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const salesQuery = query(collection(db, 'companies', currentUser.companyId, 'sales'));
        const [salesSnapshot, allItems] = await Promise.all([
          getDocs(salesQuery),
          dbOperations.getItems(),
        ]);
        const allSales: SalesData[] = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalesData));
        setSalesList(allSales);
        setAvailableItems(allItems);
        if (state?.invoiceData) {
          handleSelectSale(state.invoiceData);
        } else if (invoiceId) {
          const pre = allSales.find(sale => sale.id === invoiceId);
          if (pre) handleSelectSale(pre);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load initial data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser, dbOperations, invoiceId, state]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (salesDropdownRef.current && !salesDropdownRef.current.contains(event.target as Node)) {
        setIsSalesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSales = useMemo(() => salesList
    .filter(sale => !sale.isReturned)
    .filter(sale =>
      (sale.partyName && sale.partyName.toLowerCase().includes(searchSaleQuery.toLowerCase())) ||
      (sale.invoiceNumber && sale.invoiceNumber.toLowerCase().includes(searchSaleQuery.toLowerCase()))
    )
    .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0)),
    [salesList, searchSaleQuery]
  );

  const handleSelectSale = (sale: SalesData) => {
    setSelectedSale(sale);
    setPartyName(sale.partyName || 'N/A');
    setPartyNumber(sale.partyNumber || '');
    setOriginalSaleItems(
      sale.items.map((item: any) => {
        const itemData = item.data || item;
        const quantity = Number(itemData.quantity) || 1;
        const finalPrice = Number(itemData.finalPrice) || 0;
        const unitPrice = quantity > 0 ? finalPrice / quantity : 0;
        const safeId = itemData.id || itemData.productId || 'UNKNOWN_ID';

        return {
          id: crypto.randomUUID(),
          originalItemId: safeId,
          name: itemData.name,
          quantity: quantity,
          unitPrice: unitPrice,
          amount: finalPrice,
          mrp: itemData.mrp || 0,
        };
      })
    );
    setSelectedReturnIds(new Set());
    setExchangeItems([]);
    setSearchSaleQuery(sale.invoiceNumber || sale.partyName);
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
    navigate(ROUTES.SALES_RETURN);
  };

  const handleBarcodeScanned = (barcode: string) => {
    const purpose = scannerPurpose;
    setScannerPurpose(null);
    if (purpose === 'sale') {
      const foundSale = salesList.find(sale => sale.invoiceNumber === barcode);
      if (foundSale) {
        handleSelectSale(foundSale);
      } else {
        setModal({ message: 'Original sale not found for this invoice.', type: State.ERROR });
      }
    } else if (purpose === 'item') {
      const itemToAdd = availableItems.find(item => item.barcode === barcode);
      if (itemToAdd) {
        handleExchangeItemSelected(itemToAdd);
      } else {
        setModal({ message: 'Item not found for this barcode.', type: State.ERROR });
      }
    }
  };

  // --- Lock Logic Wrappers ---
  const handleDiscountPressStart = () => { if (!salesSettings?.lockDiscountEntry) longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500); };
  const handleDiscountPressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handleDiscountClick = () => { if (isDiscountLocked) { setDiscountInfo("Cannot edit discount"); setTimeout(() => setDiscountInfo(null), 3000); } };

  const handlePricePressStart = () => { if (!salesSettings?.lockSalePriceEntry) longPressTimer.current = setTimeout(() => setIsPriceLocked(false), 200); };
  const handlePricePressEnd = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
  const handlePriceClick = () => { if (isPriceLocked) { setPriceInfo("Cannot edit price"); setTimeout(() => setPriceInfo(null), 1000); } };

  // --- Cart Adapters ---
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

  const handleExchangeItemSelected = (item: Item) => {
    if (item) addExchangeItem(item);
  };

  const mappedExchangeItems: SalesItem[] = useMemo(() => {
    return exchangeItems.map(item => ({
      id: item.id,
      name: item.name,
      mrp: item.mrp,
      quantity: item.quantity,
      discount: item.discount,
      isEditable: true,
      purchasePrice: 0,
      tax: 0,
      itemGroupId: '',
      stock: 100,
      amount: item.amount,
      barcode: '',
      restockQuantity: 0,
      customPrice: item.customPrice ?? item.unitPrice,
    } as SalesItem));
  }, [exchangeItems]);


  // --- CALCULATION LOGIC ---
  const { totalReturnGross, totalReturnValue, totalExchangeValue, finalBalance, discountDeducted } = useMemo(() => {
    const totalReturnGross = itemsToReturn.reduce((sum, item) => sum + item.amount, 0);
    const totalExchangeValue = exchangeItems.reduce((sum, item) => sum + item.amount, 0);

    let discountDeducted = 0;

    if (selectedSale && selectedSale.manualDiscount) {
      const availableManualDiscount = Number(selectedSale.manualDiscount) || 0;
      if (availableManualDiscount > 0 && itemsToReturn.length > 0) {
        discountDeducted = Math.min(totalReturnGross, availableManualDiscount);
      }
    }

    const totalReturnValue = totalReturnGross - discountDeducted;
    const finalBalance = totalReturnValue - totalExchangeValue;

    return { totalReturnGross, totalReturnValue, totalExchangeValue, finalBalance, discountDeducted };
  }, [itemsToReturn, exchangeItems, selectedSale]);


  // --- SAVE LOGIC ---
  const saveReturnTransaction = async (completionData?: Partial<PaymentCompletionData>) => {
    if (!currentUser || !currentUser.companyId || !selectedSale) return;
    setIsLoading(true);
    const companyId = currentUser.companyId;

    try {
      const batch = writeBatch(db);
      const saleRef = doc(db, 'companies', companyId, 'sales', selectedSale.id);

      // Create a map of existing items to update quantities or remove them
      const originalItemsMap = new Map(selectedSale.items.map(item => [item.id, { ...item }]));
      const validInventoryIds = new Set(availableItems.map(i => i.id));

      // 1. Process Returns (Deduct quantity from sale)
      itemsToReturn.forEach(returnItem => {
        const originalItem = originalItemsMap.get(returnItem.originalItemId);
        if (originalItem) {
          originalItem.quantity -= returnItem.quantity;
          if (originalItem.quantity <= 0) originalItemsMap.delete(returnItem.originalItemId);
        }
      });

      // 2. Process Exchanges (Add quantity to sale)
      exchangeItems.forEach(exchangeItem => {
        const originalItem = Array.from(originalItemsMap.values()).find(i => i.id === exchangeItem.originalItemId);
        if (originalItem) {
          // If item exists, just increase quantity
          originalItem.quantity += exchangeItem.quantity;
        } else {
          // If new item added in exchange
          const itemMaster = availableItems.find(i => i.id === exchangeItem.originalItemId);
          
          // Use exchangeItem.discount and exchangeItem.amount to respect CART changes
          originalItemsMap.set(exchangeItem.originalItemId, {
            id: exchangeItem.originalItemId,
            name: exchangeItem.name,
            mrp: exchangeItem.mrp,
            quantity: exchangeItem.quantity,
            // Use cart discount
            discount: exchangeItem.discount || 0,
            discountPercentage: exchangeItem.discount || 0,
            // Use cart amount (custom price) as finalPrice
            finalPrice: exchangeItem.amount,
            // Add 'amount' for consistency, though finalPrice is primary
            amount: exchangeItem.amount,
            purchasePrice: itemMaster?.purchasePrice || 0,
            tax: itemMaster?.tax || 0,
            itemGroupId: itemMaster?.itemGroupId || '',
            stock: 0,
            barcode: itemMaster?.barcode || '',
            restockQuantity: 0,
            isEditable: false
          } as any);
        }
      });

      const newItemsList = Array.from(originalItemsMap.values());

      // FIX: TS Error & Calculation Logic
      const updatedTotals = newItemsList.reduce((acc, item) => {
        const qty = item.quantity || 0;
        const itemGross = (item.mrp || 0) * qty;

        // Cast to any to avoid "Property 'amount' does not exist" TS error
        // checking both finalPrice and amount to ensure we catch the correct value
        const runtimeItem = item as any;
        const itemFinal = runtimeItem.finalPrice ?? runtimeItem.amount ?? itemGross;

        const itemDiscount = itemGross - itemFinal;

        acc.subtotal += itemGross;
        acc.totalDiscount += itemDiscount;
        return acc;
      }, { subtotal: 0, totalDiscount: 0 });

      const currentManualDiscount = Number(selectedSale.manualDiscount) || 0;
      const newManualDiscount = Math.max(0, currentManualDiscount - discountDeducted);

      const updatedFinalAmount = updatedTotals.subtotal - updatedTotals.totalDiscount - newManualDiscount;

      // FIX: Explicitly construct objects to avoid 'undefined' error in Firebase
      // Do NOT use spread operator (...item) here.
      const returnHistoryRecord = {
        returnedAt: new Date(),
        returnedItems: itemsToReturn.map(i => ({
          originalItemId: i.originalItemId,
          name: i.name || '',
          mrp: i.mrp || 0,
          quantity: i.quantity || 0,
          unitPrice: i.unitPrice || 0,
          amount: i.amount || 0
        })),
        exchangeItems: exchangeItems.map(i => ({
          originalItemId: i.originalItemId,
          name: i.name || '',
          mrp: i.mrp || 0,
          quantity: i.quantity || 0,
          unitPrice: i.unitPrice || 0,
          amount: i.amount || 0,
          discount: i.discount || 0
        })),
        finalBalance,
        discountDeducted,
        modeOfReturn,
        paymentDetails: completionData?.paymentDetails || null,
      };

      batch.set(saleRef, {
        items: newItemsList,
        subtotal: updatedTotals.subtotal,
        discount: updatedTotals.totalDiscount + newManualDiscount,
        manualDiscount: newManualDiscount,
        totalAmount: updatedFinalAmount,
        returnHistory: arrayUnion(returnHistoryRecord),
      }, { merge: true });

      // 3. Batch Updates for Inventory
      itemsToReturn.forEach(item => {
        if (item.originalItemId && validInventoryIds.has(item.originalItemId)) {
          batch.update(doc(db, 'companies', companyId, 'items', item.originalItemId), { stock: firebaseIncrement(item.quantity) });
        }
      });
      exchangeItems.forEach(item => {
        if (item.originalItemId && validInventoryIds.has(item.originalItemId)) {
          batch.update(doc(db, 'companies', companyId, 'items', item.originalItemId), { stock: firebaseIncrement(-item.quantity) });
        }
      });

      // 4. Update Customer Credit
      const cleanPartyNumber = partyNumber.trim() || selectedSale.partyNumber;
      const cleanPartyName = partyName.trim() || selectedSale.partyName;
      if (cleanPartyNumber && cleanPartyNumber.length >= 10) {
        const customerRef = doc(db, 'companies', companyId, 'customers', cleanPartyNumber);
        const customerUpdateData: any = { name: cleanPartyName, phone: cleanPartyNumber, companyId, lastUpdatedAt: serverTimestamp() };
        if (finalBalance > 0) {
          customerUpdateData.creditBalance = firebaseIncrement(finalBalance);
        }
        batch.set(customerRef, customerUpdateData, { merge: true });
      }

      await batch.commit();
      setModal({ type: State.SUCCESS, message: 'Return processed successfully!' });
      setTimeout(() => navigate(ROUTES.SALES), 1500);
    } catch (err: any) {
      console.error(err);
      setModal({ type: State.ERROR, message: `Failed: ${err.message}` });
    } finally {
      setIsLoading(false);
      setIsDrawerOpen(false);
    }
  };

  const handleProcessReturn = () => {
    if (itemsToReturn.length === 0 && exchangeItems.length === 0) return setModal({ type: State.ERROR, message: 'No items selected.' });
    if (modeOfReturn === 'Exchange' && finalBalance < 0) setIsDrawerOpen(true);
    else saveReturnTransaction();
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 w-full ">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      <div className="flex flex-col bg-gray-100 border-b border-gray-300 pb-2 flex-shrink-0 mb-2">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">Sales Return</h1>
        <div className="flex items-center justify-center gap-6">
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES)} active={isActive(ROUTES.SALES)}>Sales</CustomButton>
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.SALES_RETURN)} active={isActive(ROUTES.SALES_RETURN)}>Sales Return</CustomButton>
        </div>
      </div>

      <div className="flex-grow bg-gray-100 ">
        {/* Search */}
        <div className="bg-white p-6 rounded-sm shadow-md mb-2 pb-4">
          <div className="relative" ref={salesDropdownRef}>
            <label htmlFor="search-sale" className="block text-base font-medium mb-2">Search Original Sale</label>
            <div className="flex gap-2">
              <input id="search-sale" type="text" value={searchSaleQuery} onChange={(e) => { setSearchSaleQuery(e.target.value); setIsSalesDropdownOpen(true); }} onFocus={() => setIsSalesDropdownOpen(true)} placeholder={selectedSale ? `${selectedSale.partyName} (${selectedSale.invoiceNumber})` : "Search by invoice or party name..."} className="flex-grow p-3 border rounded-lg" autoComplete="off" readOnly={!!selectedSale} />
              {selectedSale && (<button onClick={handleClear} className=" px-3 bg-blue-600 text-white font-semibold rounded-lg whitespace-nowrap">Clear</button>)}
            </div>
            {isSalesDropdownOpen && !selectedSale && (
              <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredSales.map((sale) => (
                  <div key={sale.id} className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSelectSale(sale)}>
                    <p className="font-semibold">{sale.partyName} ({sale.invoiceNumber || 'N/A'})</p>
                    <p className="text-sm text-gray-600">Total: ₹{sale.totalAmount.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedSale && (
          <>
            {/* Details & Items */}
            <div className="bg-white p-6 rounded-sm shadow-md mt-2">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block font-medium text-sm mb-1">Return Date</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-2 border rounded" /></div>
                  <div><label className="block font-medium text-sm mb-1">Party Name</label><input type="text" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="w-full p-2 border rounded bg-white" /></div>
                </div>
                <div><label className="block font-medium text-sm mb-1">Party Number</label><input type="text" value={partyNumber} onChange={(e) => setPartyNumber(e.target.value)} className="w-full p-2 border rounded bg-white" /></div>
              </div>
              <h3 className="text-sm font-semibold mt-4 mb-3">Select Items to Return</h3>
              <div className="flex flex-col gap-3">
                {originalSaleItems.map((item) => (
                  <ReturnListItem
                    key={item.id}
                    item={item}
                    isSelected={selectedReturnIds.has(item.id)}
                    onToggle={handleToggleReturnItem}
                    onQuantityChange={(id, val) => handleListChange(setOriginalSaleItems, id, 'quantity', val)}
                    showMrp={true} // Sales usually show MRP
                  />
                ))}
              </div>
            </div>

            {/* Exchange */}
            <div className="bg-white p-6 rounded-sm shadow-md mt-2 pt-4 pb-4">
              <div>
                <label className="block font-medium text-sm mb-2">Transaction Type</label>
                <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                  <option>Credit Note</option>
                  <option>Exchange</option>
                </select>
              </div>
              {modeOfReturn === 'Exchange' && (
                <div className="mt-4 border-t pt-4">
                  <div className="flex items-end gap-4">
                    <div className="flex-grow"><SearchableItemInput label="Add Exchange Item" placeholder="Search inventory..." items={availableItems} onItemSelected={handleExchangeItemSelected} isLoading={isLoading} error={error} /></div>
                    <div className="flex-shrink-0"><button onClick={() => setScannerPurpose('item')} className="p-3 bg-gray-700 text-white rounded-lg">
                      <IconScanCircle width={20} height={20} />
                    </button></div>
                  </div>
                  {exchangeItems.length > 0 && (
                    <>
                      <h3 className="text-sm font-medium mt-4 mb-2">Exchange Items</h3>
                      <div className='flex gap-2 text-sm mb-2'>
                        {discountInfo && <span className="text-red-500 bg-red-50 px-2 rounded">{discountInfo}</span>}
                        {priceInfo && <span className="text-red-500 bg-red-50 px-2 rounded">{priceInfo}</span>}
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {/* FIX: Use GenericCartList with Sales settings */}
                        <GenericCartList<SalesItem>
                          items={mappedExchangeItems}
                          availableItems={availableItems}
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
                          onOpenEditDrawer={() => { }} // No editing master items from return page
                          onDeleteItem={(id) => handleRemoveFromList(setExchangeItems, id)}
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
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Summary Card */}
            <div className="bg-white p-6 rounded-sm shadow-md mt-2 mb-2">
              <div className=" rounded-sm space-y-3">
                <div className="flex justify-between items-center text-md text-blue-700">
                  <p>Return Sale Amount (Items)</p>
                  <p className="font-medium">₹{totalReturnGross.toFixed(2)}</p>
                </div>

                {discountDeducted > 0 && (
                  <div className="flex justify-between items-center text-sm text-red-600">
                    <p>Less: Bill Discount</p>
                    <p className="font-medium">- ₹{discountDeducted.toFixed(2)}</p>
                  </div>
                )}

                <div className="flex justify-between items-center text-md text-blue-700 font-semibold border-t border-dashed pt-2">
                  <p>Net Return Value</p>
                  <p className="font-medium">₹{totalReturnValue.toFixed(2)}</p>
                </div>

                {modeOfReturn === 'Exchange' && (
                  <div className="flex justify-between items-center text-md text-blue-700">
                    <p>Total Exchange Value</p>
                    <p className="font-medium">₹{totalExchangeValue.toFixed(2)}</p>
                  </div>
                )}

                <div className="border-t border-gray-300 !my-2"></div>

                <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  <p>{finalBalance >= 0 ? 'Credit Due' : 'Payment Due'}</p>
                  <p>₹{Math.abs(finalBalance).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 p-4 bg-gray-100 rounded-sm pb-16 items-center px-16">
        {selectedSale && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-4 text-xl font-semibold">Process Transaction</CustomButton>)}
      </div>

      <PaymentDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} subtotal={Math.abs(finalBalance)} onPaymentComplete={saveReturnTransaction} initialPartyName={partyName} initialPartyNumber={partyNumber} />
    </div>
  );
};

export default SalesReturnPage;