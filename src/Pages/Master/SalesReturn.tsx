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
import { useAuth, useDatabase } from '../../context/Auth-Context';
import { ROUTES } from '../../constants/routes.constants';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import type { Item, SalesItem as OriginalSalesItem } from '../../constants/models';
import { Modal } from '../../constants/Modal';
import { State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';

// --- Interfaces ---
interface SalesData {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyNumber: string;
  items: OriginalSalesItem[];
  totalAmount: number;
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
}

const SalesReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { state } = useLocation();
  const { invoiceId } = useParams();
  const location = useLocation();

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

  const itemsToReturn = useMemo(() =>
    originalSaleItems.filter(item => selectedReturnIds.has(item.id)),
    [originalSaleItems, selectedReturnIds]
  );

  // --- Unused state from your logic ---
  const [items] = useState<OriginalSalesItem[]>([]);

  useEffect(() => {
    if (!currentUser || !currentUser.companyId || !dbOperations) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // --- FIX: Use the correct multi-tenant path for 'sales' ---
        const salesQuery = query(
          collection(db, 'companies', currentUser.companyId, 'sales')
          // No 'where' for companyId is needed anymore
        );
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
          const preselectedSale = allSales.find(sale => sale.id === invoiceId);
          if (preselectedSale) {
            handleSelectSale(preselectedSale);
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err); // This is line 123
        setError('Failed to load initial data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser, dbOperations, invoiceId, state, items]); // Added items to dependency array

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
        const quantity = itemData.quantity || 1;
        const unitPrice = itemData.finalPrice / quantity || 0;
        return {
          id: crypto.randomUUID(),
          originalItemId: itemData.id,
          name: itemData.name,
          quantity: quantity,
          unitPrice: unitPrice,
          amount: itemData.finalPrice || 0,
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
      if (newIds.has(itemId)) {
        newIds.delete(itemId);
      } else {
        newIds.add(itemId);
      }
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

  const handleRemoveFromList = (setter: React.Dispatch<React.SetStateAction<any[]>>, id: string) => {
    setter(prev => prev.filter(item => item.id !== id));
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

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isDiscountLocked, setIsDiscountLocked] = useState(true);
  const [discountInfo, setDiscountInfo] = useState<string | null>(null);

  const handleDiscountPressStart = () => {
    longPressTimer.current = setTimeout(() => setIsDiscountLocked(false), 500);
  };

  const handleDiscountPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  const handleDiscountClick = () => {
    if (isDiscountLocked) {
      setDiscountInfo("Cannot edit the discount");
      setTimeout(() => setDiscountInfo(null), 3000);
    }
  };

  // --- MODIFIED --- This function now correctly updates the 'exchangeItems' state.
  const handleDiscountChange = (id: string, discountValue: number) => {
    const newDiscount = Math.max(0, Math.min(100, discountValue || 0));
    setExchangeItems(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, discount: newDiscount };
        let newPrice = updatedItem.mrp * (1 - newDiscount / 100);

        if (newDiscount > 0) {
          if (newPrice < 100) {
            newPrice = Math.ceil(newPrice / 5) * 5;
          } else {
            newPrice = Math.ceil(newPrice / 10) * 10;
          }
        }
        updatedItem.unitPrice = newPrice;
        updatedItem.amount = Number(updatedItem.quantity) * Number(updatedItem.unitPrice);
        return updatedItem;
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

  const { totalReturnValue, totalExchangeValue, finalBalance } = useMemo(() => {
    const totalReturnValue = itemsToReturn.reduce((sum, item) => sum + item.amount, 0);
    const totalExchangeValue = exchangeItems.reduce((sum, item) => sum + item.amount, 0);
    const finalBalance = totalReturnValue - totalExchangeValue;
    return { totalReturnValue, totalExchangeValue, finalBalance };
  }, [itemsToReturn, exchangeItems]);

  const saveReturnTransaction = async (completionData?: Partial<PaymentCompletionData>) => {
    if (!currentUser || !currentUser.companyId || !selectedSale) return;
    setIsLoading(true);

    const companyId = currentUser.companyId; // Get companyId for all paths

    try {
      const batch = writeBatch(db);
      // --- FIX: Use multi-tenant path for 'sales' ---
      const saleRef = doc(db, 'companies', companyId, 'sales', selectedSale.id);

      const originalItemsMap = new Map(selectedSale.items.map(item => [item.id, { ...item }]));

      itemsToReturn.forEach(returnItem => {
        const originalItem = originalItemsMap.get(returnItem.originalItemId);
        if (originalItem) {
          originalItem.quantity -= returnItem.quantity;
          if (originalItem.quantity <= 0) {
            originalItemsMap.delete(returnItem.originalItemId);
          }
        }
      });

      exchangeItems.forEach(exchangeItem => {
        const originalItem = originalItemsMap.get(exchangeItem.originalItemId);
        if (originalItem) {
          originalItem.quantity += exchangeItem.quantity;
        } else {
          const itemMaster = availableItems.find(i => i.id === exchangeItem.originalItemId);
          originalItemsMap.set(exchangeItem.originalItemId, {
            id: exchangeItem.originalItemId, name: exchangeItem.name, mrp: exchangeItem.mrp,
            quantity: exchangeItem.quantity, discount: itemMaster?.discount || 0,
            discountPercentage: itemMaster?.discount || 0, finalPrice: exchangeItem.amount,
          });
        }
      });

      const newItemsList = Array.from(originalItemsMap.values());
      const updatedTotals = newItemsList.reduce((acc, item) => {
        const itemTotal = item.mrp * item.quantity;
        const itemDiscount = (itemTotal * (item.discountPercentage || 0)) / 100;
        acc.subtotal += itemTotal;
        acc.totalDiscount += itemDiscount;
        return acc;
      }, { subtotal: 0, totalDiscount: 0 });

      const updatedFinalAmount = updatedTotals.subtotal - updatedTotals.totalDiscount;

      const returnHistoryRecord = {
        returnedAt: serverTimestamp(),
        returnedItems: itemsToReturn.map(({ id, ...item }) => item),
        exchangeItems: exchangeItems.map(({ id, ...item }) => item),
        finalBalance,
        modeOfReturn,
        paymentDetails: completionData?.paymentDetails || null,
      };

      batch.set(saleRef, {
        items: newItemsList, subtotal: updatedTotals.subtotal, discount: updatedTotals.totalDiscount,
        totalAmount: updatedFinalAmount, returnHistory: arrayUnion(returnHistoryRecord),
      }, { merge: true });

      itemsToReturn.forEach(item => {
        // --- FIX: Use multi-tenant path for 'items' ---
        batch.update(doc(db, 'companies', companyId, 'items', item.originalItemId), { amount: firebaseIncrement(item.quantity) });
      });
      exchangeItems.forEach(item => {
        // --- FIX: Use multi-tenant path for 'items' ---
        batch.update(doc(db, 'companies', companyId, 'items', item.originalItemId), { amount: firebaseIncrement(-item.quantity) });
      });

      if (finalBalance > 0 && selectedSale.partyNumber && selectedSale.partyNumber.length >= 10) {
        // --- FIX: Use multi-tenant path for 'customers' ---
        const customerRef = doc(db, 'companies', companyId, 'customers', selectedSale.partyNumber);
        batch.set(customerRef, {
          creditBalance: firebaseIncrement(finalBalance),
          name: selectedSale.partyName,
          number: selectedSale.partyNumber,
          companyId: companyId, // Already correct
          lastUpdatedAt: serverTimestamp()
        }, { merge: true });
      }

      await batch.commit();
      setModal({ type: State.SUCCESS, message: 'Sale Return processed successfully!' });
      navigate(ROUTES.SALES);
    } catch (err) {
      console.error("Error processing sales return:", err);
      setModal({ type: State.ERROR, message: "Failed to process the return." });
    } finally {
      setIsLoading(false);
      setIsDrawerOpen(false);
    }
  };

  const handleProcessReturn = () => {
    if (itemsToReturn.length === 0 && exchangeItems.length === 0) {
      return setModal({ type: State.ERROR, message: 'No items have been returned or exchanged.' });
    }
    if (modeOfReturn === 'Exchange' && finalBalance < 0) {
      setIsDrawerOpen(true);
    } else {
      saveReturnTransaction();
    }
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  // ... (Rest of your JSX is correct) ...
  // No changes are needed in the UI/JSX part.

  return (
    <div className="flex flex-col min-h-screen bg-gray-100 w-full ">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      <div className="flex flex-col bg-gray-100 border-b border-gray-300 pb-2 flex-shrink-0 mb-2">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">Sales Return</h1>
        <div className="flex items-center justify-center gap-6">
          <CustomButton
            variant={Variant.Transparent}
            onClick={() => navigate(ROUTES.SALES)}
            active={isActive(ROUTES.SALES)}
          >
            Sales
          </CustomButton>
          <CustomButton
            variant={Variant.Transparent}
            onClick={() => navigate(ROUTES.SALES_RETURN)}
            active={isActive(ROUTES.SALES_RETURN)}
          >
            Sales Return
          </CustomButton>
        </div>
      </div>

      <div className="flex-grow bg-gray-100 ">
        <div className="bg-white p-6 rounded-sm shadow-md mb-2 pb-4">
          <div className="relative" ref={salesDropdownRef}>
            <label htmlFor="search-sale" className="block text-base font-medium mb-2">
              Search Original Sale
            </label>
            <div className="flex gap-2">
              <input
                id="search-sale"
                type="text"
                value={searchSaleQuery}
                onChange={(e) => {
                  setSearchSaleQuery(e.target.value);
                  setIsSalesDropdownOpen(true);
                }}
                onFocus={() => setIsSalesDropdownOpen(true)}
                placeholder={selectedSale ? `${selectedSale.partyName} (${selectedSale.invoiceNumber})` : "Search by invoice or party name..."}
                className="flex-grow p-3 border rounded-lg"
                autoComplete="off"
                readOnly={!!selectedSale}
              />
              {selectedSale && (
                <button
                  onClick={handleClear}
                  className=" px-3 bg-blue-600 text-white font-semibold rounded-lg whitespace-nowrap"
                >
                  Clear
                </button>
              )}
            </div>
            {isSalesDropdownOpen && !selectedSale && (
              <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="p-3 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSelectSale(sale)}
                  >
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
            <div className="bg-white p-6 rounded-sm shadow-md mt-2">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="return-date" className="block font-medium text-sm mb-1">Return Date</label>
                    <input
                      type="date"
                      id="return-date"
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      className="w-full p-2 border rounded"
                    />
                  </div>
                  <div>
                    <label htmlFor="party-name" className="block font-medium text-sm mb-1">Party Name</label>
                    <input
                      type="text"
                      id="party-name"
                      value={partyName}
                      onChange={(e) => setPartyName(e.target.value)}
                      className="w-full p-2 border rounded bg-white"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="party-number" className="block font-medium text-sm mb-1">Party Number</label>
                  <input
                    type="text"
                    id="party-number"
                    value={partyNumber}
                    onChange={(e) => setPartyNumber(e.target.value)}
                    className="w-full p-2 border rounded bg-white"
                  />
                </div>
              </div>

              <h3 className="text-sm font-semibold mt-4 mb-3">Select Items to Return</h3>
              <div className="flex flex-col gap-3">
                {originalSaleItems.map((item) => {
                  const isSelected = selectedReturnIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`p-3 border rounded-sm flex items-center gap-3 transition-all ${isSelected ? 'bg-red-50 shadow-sm' : 'bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleReturnItem(item.id)}
                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                      />
                      <div className="flex-grow flex flex-col gap-2">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm leading-tight">{item.name}</p>
                          <p className="text-xs text-gray-500">
                            MRP: <span className="line-through">₹{item.mrp.toFixed(2)}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <label className="text-xs text-gray-600">Qty:</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleListChange(setOriginalSaleItems, item.id, 'quantity', Number(e.target.value))}
                              className="w-16 p-1 border border-gray-300 rounded text-center text-sm"
                              disabled={!isSelected}
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <label className="text-xs text-gray-600">Price:</label>
                            <p className="w-20 text-center font-semibold p-1 border border-gray-300 rounded bg-white text-sm">
                              ₹{item.unitPrice.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white p-6 rounded-sm shadow-md mt-2 pt-4 pb-4">
              <div>
                <label htmlFor="mode-of-return" className="block font-medium text-sm mb-2">Transaction Type</label>
                <select id="mode-of-return" value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                  <option>Exchange</option>
                  <option>Credit Note</option>
                </select>
              </div>
              {modeOfReturn === 'Exchange' && (
                <div className="mt-4 border-t pt-4">
                  <div className="flex items-end gap-4">
                    <div className="flex-grow">
                      <SearchableItemInput
                        label="Add Exchange Item"
                        placeholder="Search inventory..."
                        items={availableItems}
                        onItemSelected={handleExchangeItemSelected}
                        isLoading={isLoading}
                        error={error}
                      />
                    </div>
                    <div className="flex-shrink-0">
                      <button
                        onClick={() => setScannerPurpose('item')}
                        className="p-3 bg-gray-700 text-white rounded-lg flex items-center justify-center"
                        title="Scan Item Barcode"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
                      </button>
                    </div>
                  </div>

                  {exchangeItems.length > 0 && (
                    <>
                      <h3 className="text-sm font-medium mt-4 mb-2">Exchange Items</h3>
                      {/* --- MODIFIED --- This div now displays the discountInfo message */}
                      {discountInfo && <div className="text-red-500 text-center text-sm mb-2">{discountInfo}</div>}
                      <div className="flex flex-col gap-2 mb-2">
                        {exchangeItems.map((item) => (
                          <div key={item.id} className="p-3 border rounded-sm bg-white shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <p className="font-semibold text-gray-800 pr-2">{item.name}</p>
                              <button onClick={() => handleRemoveFromList(setExchangeItems, item.id)} className="text-gray-500 hover:text-red-600 flex-shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                              </button>
                            </div>
                            <div className="flex items-baseline gap-2 mb-3">
                              <p className="text-sm text-gray-400 line-through">₹{item.mrp.toFixed(2)}</p>
                              <p className="text-sm font-bold text-gray-900">₹{item.unitPrice.toFixed(2)}</p>
                            </div>
                            <hr className="my-1 border-gray-200" />
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-1 bg-gray-100 rounded p-1">
                                <div
                                  className="flex items-center gap-2"
                                  onMouseDown={handleDiscountPressStart}
                                  onMouseUp={handleDiscountPressEnd}
                                  onMouseLeave={handleDiscountPressEnd}
                                  onTouchStart={handleDiscountPressStart}
                                  onTouchEnd={handleDiscountPressEnd}
                                  onClick={handleDiscountClick}
                                >
                                  <label htmlFor={`discount-${item.id}`} className="text-sm text-gray-600 ">Disc</label>
                                  <input
                                    id={`discount-${item.id}`} type="number" value={item.discount || ''}
                                    onChange={(e) => handleDiscountChange(item.id, parseFloat(e.target.value))}
                                    readOnly={isDiscountLocked}
                                    className={`w-12 p-1 bg-gray-100 rounded-sm text-center font-medium text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isDiscountLocked ? 'cursor-pointer' : ''}`}
                                    placeholder="0"
                                  />
                                  <span className="text-sm text-gray-600 pr-1">%</span>
                                </div>
                              </div>
                              <p className="text-sm font-medium text-gray-600">Qty</p>
                              <div className="flex items-center border border-gray-300 rounded">
                                <button
                                  onClick={() => handleListChange(setExchangeItems, item.id, 'quantity', Math.max(1, item.quantity - 1))}
                                  className="px-3 py-1 font-bold text-lg text-gray-700 hover:bg-gray-100"
                                >
                                  -
                                </button>
                                <span className="w-10 text-center font-semibold text-md text-gray-800 border-l border-r">
                                  {item.quantity}
                                </span>
                                <button
                                  onClick={() => handleListChange(setExchangeItems, item.id, 'quantity', item.quantity + 1)}
                                  className="px-3 py-1 font-bold text-lg text-gray-700 hover:bg-gray-100"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-sm shadow-md mt-2 mb-2">
              <div className=" rounded-sm space-y-3">
                <div className="flex justify-between items-center text-md text-blue-700"><p>Return Sale Amount</p><p className="font-medium">₹{totalReturnValue.toFixed(2)}</p></div>
                <div className="flex justify-between items-center text-md text-blue-700"><p>Total Exchange Value</p><p className="font-medium">₹{totalExchangeValue.toFixed(2)}</p></div>
                <div className="border-t border-gray-300 !my-2"></div>
                <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}><p>{finalBalance >= 0 ? 'Credit Due' : 'Payment Due'}</p><p>₹{Math.abs(finalBalance).toFixed(2)}</p></div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 p-4 bg-gray-100 rounded-sm pb-16 items-center px-16">
        {selectedSale && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-4 text-xl font-semibold">Process Transaction</CustomButton>)}
      </div>

      <PaymentDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        onPaymentComplete={saveReturnTransaction}
      />
    </div>
  );
};

export default SalesReturnPage;