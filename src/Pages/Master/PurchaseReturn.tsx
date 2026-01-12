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
import type { Item, PurchaseItem as OriginalPurchaseItem } from '../../constants/models';
import { Modal } from '../../constants/Modal';
import { State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';
import { ReturnListItem } from '../../Components/ReturnListItem';
import { IconScanCircle } from '../../constants/Icons';
import { GenericCartList, type CartItem } from '../../Components/CartItem';

interface PurchaseData {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyNumber?: string;
  partyAddress?: string;
  partyGstin?: string;
  items: OriginalPurchaseItem[];
  totalAmount: number;
  createdAt: any;
  isReturned?: boolean;
}

interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

interface ReturnCartItem extends CartItem {
  originalItemId: string;
  unitPrice: number;
  amount: number;
}

const PurchaseReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseId } = useParams();
  const { state } = useLocation();
  const location = useLocation();

  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierNumber, setSupplierNumber] = useState<string>('');
  const [supplierAddress, setSupplierAddress] = useState<string>('');
  const [supplierGstin, setSupplierGstin] = useState<string>('');

  const [modeOfReturn, setModeOfReturn] = useState<string>('Exchange');

  const [newItemsReceived, setNewItemsReceived] = useState<ReturnCartItem[]>([]);

  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const isActive = (path: string) => location.pathname === path;

  const [originalPurchaseItems, setOriginalPurchaseItems] = useState<TransactionItem[]>([]);
  const [selectedReturnIds, setSelectedReturnIds] = useState<Set<string>>(new Set());
  const [purchaseList, setPurchaseList] = useState<PurchaseData[]>([]);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseData | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
  const [scannerPurpose, setScannerPurpose] = useState<'purchase' | 'item' | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const itemsToReturn = useMemo(() =>
    originalPurchaseItems.filter(item => selectedReturnIds.has(item.id)),
    [originalPurchaseItems, selectedReturnIds]
  );

  useEffect(() => {
    if (!currentUser || !currentUser.companyId || !dbOperations) {
      setIsLoading(false);
      return;
    }
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const purchasesQuery = query(
          collection(db, 'companies', currentUser.companyId, 'purchases')
        );
        const [purchasesSnapshot, allItems] = await Promise.all([
          getDocs(purchasesQuery),
          dbOperations.getItems()
        ]);
        const purchases: PurchaseData[] = purchasesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseData));
        setPurchaseList(purchases);
        setAvailableItems(allItems);

        if (state?.invoiceData) {
          handleSelectPurchase(state.invoiceData);
        } else if (purchaseId) {
          const preselectedPurchase = purchases.find(p => p.id === purchaseId);
          if (preselectedPurchase) {
            handleSelectPurchase(preselectedPurchase);
          }
        }
      } catch (err) {
        setError('Failed to load initial data.');
        console.error("Error fetching data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser, dbOperations, purchaseId, state]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredList = useMemo(() => purchaseList
    .filter(p => !p.isReturned)
    .filter(p =>
      p.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.invoiceNumber && p.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0)),
    [purchaseList, searchQuery]
  );

  const handleSelectPurchase = (purchase: PurchaseData) => {
    setSelectedPurchase(purchase);
    setSupplierName(purchase.partyName);
    setSupplierNumber(purchase.partyNumber || '');
    setSupplierAddress(purchase.partyAddress || '');
    setSupplierGstin(purchase.partyGstin || '');

    setOriginalPurchaseItems(purchase.items.map((item: any) => {
      const itemData = item.data || item;
      const quantity = itemData.quantity || 1;
      const unitPrice = itemData.purchasePrice ?? itemData.finalPrice ?? 0;

      return {
        id: crypto.randomUUID(),
        originalItemId: itemData.id,
        name: itemData.name,
        quantity: quantity,
        unitPrice: unitPrice,
        amount: unitPrice * quantity,
      };
    }));

    setSelectedReturnIds(new Set());
    setNewItemsReceived([]);
    setSearchQuery(purchase.invoiceNumber || purchase.partyName);
    setIsDropdownOpen(false);
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

  const handleClear = () => {
    setSelectedPurchase(null);
    setSupplierName('');
    setSupplierNumber('');
    setSupplierAddress('');
    setSupplierGstin('');
    setSelectedReturnIds(new Set());
    setNewItemsReceived([]);
    setSearchQuery('');
    navigate(ROUTES.PURCHASE_RETURN);
  };

  const handleItemChange = (
    listSetter: React.Dispatch<React.SetStateAction<TransactionItem[]>>,
    id: string,
    field: keyof TransactionItem,
    value: string | number
  ) => {
    listSetter(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitPrice') {
          updatedItem.amount = Number(updatedItem.quantity) * Number(updatedItem.unitPrice);
        }
        return updatedItem;
      }
      return item;
    }));
  };

  const handleRemoveNewItem = (id: string) => {
    setNewItemsReceived(prev => prev.filter(item => item.id !== id));
  };

  const handleNewItemQuantity = (id: string, newQty: number) => {
    setNewItemsReceived(prev => prev.map(item => {
      if (item.id === id) {
        const qty = Math.max(1, newQty);
        return {
          ...item,
          quantity: qty,
          amount: qty * item.unitPrice
        };
      }
      return item;
    }));
  };

  const handleNewItemPriceChange = (id: string, val: string) => {
    setNewItemsReceived(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, customPrice: val };
      }
      return item;
    }));
  };

  const handleNewItemPriceBlur = (id: string) => {
    setNewItemsReceived(prev => prev.map(item => {
      if (item.id === id) {
        const rawVal = item.customPrice;
        const parsed = parseFloat(String(rawVal));

        if (isNaN(parsed) || parsed < 0) {
          return { ...item, customPrice: item.unitPrice };
        }

        return {
          ...item,
          unitPrice: parsed,
          amount: parsed * item.quantity,
          customPrice: parsed
        };
      }
      return item;
    }));
  };

  const handleNewItemSelected = (item: Item) => {
    if (!item) return;
    setNewItemsReceived(prev => [...prev, {
      id: crypto.randomUUID(),
      originalItemId: item.id!,
      name: item.name,
      quantity: 1,
      unitPrice: item.purchasePrice || 0,
      amount: item.purchasePrice || 0,
      isEditable: true,
      customPrice: item.purchasePrice,
      discount: 0,
      productId: item.id
    }]);
  };

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

  const { totalReturnValue, totalNewItemsValue, finalBalance } = useMemo(() => {
    const totalReturnValue = itemsToReturn.reduce((sum, item) => sum + item.amount, 0);
    const totalNewItemsValue = newItemsReceived.reduce((sum, item) => sum + item.amount, 0);
    const finalBalance = totalReturnValue - totalNewItemsValue;
    return { totalReturnValue, totalNewItemsValue, finalBalance };
  }, [itemsToReturn, newItemsReceived]);

  const saveReturnTransaction = async (completionData?: Partial<PaymentCompletionData>) => {
    if (!currentUser || !currentUser.companyId || !selectedPurchase) return;

    const finalSupplierName = completionData?.partyName || supplierName || selectedPurchase.partyName;
    const finalSupplierNumber = completionData?.partyNumber || supplierNumber || selectedPurchase.partyNumber;

    if (modeOfReturn === 'Debit Note' && !finalSupplierNumber) {
      setModal({ type: State.ERROR, message: 'Cannot create Debit Note: Party Number is missing.' });
      return;
    }

    setIsLoading(true);
    const companyId = currentUser.companyId;

    try {
      const batch = writeBatch(db);
      const purchaseRef = doc(db, 'companies', companyId, 'purchases', selectedPurchase.id);

      const originalItemsMap = new Map(selectedPurchase.items.map(item => [item.id, { ...item }]));

      itemsToReturn.forEach(returnItem => {
        const originalItem = originalItemsMap.get(returnItem.originalItemId);
        if (originalItem) {
          originalItem.quantity -= returnItem.quantity;
          if (originalItem.quantity <= 0) originalItemsMap.delete(returnItem.originalItemId);
        }
        batch.update(doc(db, 'companies', companyId, 'items', returnItem.originalItemId), {
          stock: firebaseIncrement(-returnItem.quantity)
        });
      });

      newItemsReceived.forEach(newItem => {
        const originalItem = originalItemsMap.get(newItem.originalItemId);
        if (originalItem) {
          originalItem.quantity += newItem.quantity;
        } else {
          originalItemsMap.set(newItem.originalItemId, {
            id: newItem.originalItemId,
            name: newItem.name,
            quantity: newItem.quantity,
            purchasePrice: newItem.unitPrice,
          } as any);
        }
        batch.update(doc(db, 'companies', companyId, 'items', newItem.originalItemId), {
          stock: firebaseIncrement(newItem.quantity)
        });
      });

      const newItemsList = Array.from(originalItemsMap.values());
      const newTotalAmount = newItemsList.reduce((sum, item) => sum + (item.quantity * (item.purchasePrice || 0)), 0);

      const returnHistoryRecord = {
        returnedAt: new Date(),
        returnedItems: itemsToReturn.map(({ id, ...item }) => item),
        newItemsReceived: newItemsReceived.map(({ id, ...item }) => item),
        finalBalance,
        modeOfReturn,
        paymentDetails: completionData?.paymentDetails || null,
      };

      const updateData: any = {
        items: newItemsList,
        totalAmount: newTotalAmount,
        returnHistory: arrayUnion(returnHistoryRecord),
      };

      if (newTotalAmount === 0) {
        updateData.paymentMethods = {};
      } else if (completionData?.paymentDetails) {
        updateData.paymentMethods = completionData.paymentDetails;
      }

      batch.update(purchaseRef, updateData);

      itemsToReturn.forEach(returnItem => {
        batch.update(doc(db, 'companies', companyId, 'items', returnItem.originalItemId), {
          stock: firebaseIncrement(-returnItem.quantity)
        });
      });
      newItemsReceived.forEach(newItem => {
        batch.update(doc(db, 'companies', companyId, 'items', newItem.originalItemId), {
          stock: firebaseIncrement(newItem.quantity)
        });
      });

      const cleanSupplierNumber = finalSupplierNumber?.trim();
      const cleanSupplierName = finalSupplierName?.trim();
      const cleanAddress = completionData?.partyAddress || supplierAddress || selectedPurchase.partyAddress || '';
      const cleanGstin = completionData?.partyGST || supplierGstin || selectedPurchase.partyGstin || '';

      if (cleanSupplierNumber && cleanSupplierNumber.length >= 3) {
        const customerRef = doc(db, 'companies', companyId, 'customers', cleanSupplierNumber);
        const customerUpdateData: any = {
          name: cleanSupplierName,
          phone: cleanSupplierNumber,
          address: cleanAddress,
          gstin: cleanGstin,
          companyId: companyId,
          lastUpdatedAt: serverTimestamp()
        };

        if (modeOfReturn === 'Cash Refund') {
        } else {
          if (finalBalance > 0) {
            customerUpdateData.debitBalance = firebaseIncrement(finalBalance);
          }
        }

        batch.set(customerRef, customerUpdateData, { merge: true });
      }

      await batch.commit();
      setModal({ type: State.SUCCESS, message: 'Purchase Return processed successfully!' });
      handleClear();
    } catch (error) {
      console.error('Error processing purchase return:', error);
      setModal({ type: State.ERROR, message: 'Failed to process return.' });
    } finally {
      setIsLoading(false);
      setIsDrawerOpen(false);
    }
  };

  const handleProcessReturn = () => {
    if (!currentUser || !selectedPurchase) return;
    if (itemsToReturn.length === 0 && newItemsReceived.length === 0) {
      return setModal({ type: State.ERROR, message: 'No items have been returned or received.' });
    }

    if (modeOfReturn === 'Cash Refund' && finalBalance > 0) {
      saveReturnTransaction();
    }
    else if (finalBalance >= 0) {
      saveReturnTransaction();
    }
    else {
      setIsDrawerOpen(true);
    }
  };

  const getBalanceLabel = () => {
    if (finalBalance < 0) return 'Payment Due'; 
    if (modeOfReturn === 'Cash Refund') return 'Refund Received'; 
    return 'Debit Note'; 
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  const renderHeader = () => (
    <div className="flex flex-col md:flex-row md:justify-between md:items-center bg-gray-100 md:bg-white border-b border-gray-300 shadow-sm flex-shrink-0 p-2 md:px-4 md:py-3 mb-2 md:mb-0">
      <h1 className="text-2xl font-bold text-gray-800 text-center md:text-left mb-2 md:mb-0">
        Purchase Return
      </h1>
      <div className="flex justify-center gap-x-6">
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE)} active={isActive(ROUTES.PURCHASE)}>Purchase</CustomButton>
        <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE_RETURN)} active={isActive(ROUTES.PURCHASE_RETURN)}>Purchase Return</CustomButton>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100 overflow-hidden">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      {/* HEADER */}
      {renderHeader()}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        <div className="flex-1 w-full md:w-[65%] bg-gray-100 md:bg-white md:border-r border-gray-200 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 relative">
            
            {/* Search */}
            <div className="bg-white p-4 rounded-sm shadow-md mb-4 border border-gray-200">
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
                <div className="bg-white p-4 rounded-sm shadow-md mb-4 border border-gray-200">
                  <div className="space-y-3 mb-4">
                    <div className='grid grid-cols-2 gap-4'>
                      <div><label className="block text-xs font-bold text-gray-500 uppercase">Date</label><input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                      <div><label className="block text-xs font-bold text-gray-500 uppercase">Party</label><input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                    </div>
                    <div><label className="block text-xs font-bold text-gray-500 uppercase">Party Number</label><input type="text" value={supplierNumber} onChange={(e) => setSupplierNumber(e.target.value)} className="w-full p-1 border-b border-gray-300 focus:border-blue-500 outline-none text-sm" /></div>
                  </div>

                  <h3 className="text-sm font-bold text-gray-700 mb-2 border-b pb-1">Select Return Items</h3>
                  <div className="flex flex-col gap-2">
                    {originalPurchaseItems.map((item) => (
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
                <div className="bg-white p-4 rounded-sm shadow-md mb-20 md:mb-0 border border-gray-200">
                   {/* Mobile View: Mode Select Here */}
                   <div className="md:hidden mb-4">
                      <label className="block font-medium text-sm mb-1">Transaction Type</label>
                      <select value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                        <option>Exchange</option>
                        <option>Debit Note</option>
                        <option>Cash Refund</option>
                      </select>
                   </div>

                   {modeOfReturn === 'Exchange' && (
                    <div className="mt-2">
                      <div className="flex items-end gap-2 mb-3">
                        <div className="flex-grow">
                          <SearchableItemInput
                            label="Add New Item Received"
                            placeholder="Search inventory..."
                            items={availableItems}
                            onItemSelected={handleNewItemSelected}
                            isLoading={isLoading}
                            error={error}
                          />
                        </div>
                        <button onClick={() => setScannerPurpose('item')} className="p-2.5 bg-gray-800 text-white rounded-md flex items-center justify-center">
                          <IconScanCircle width={24} height={24} />
                        </button>
                      </div>
                      
                      {newItemsReceived.length > 0 && (
                        <div className="border rounded-md overflow-hidden">
                           <div className="bg-gray-50 px-3 py-2 border-b text-xs font-bold text-gray-500 uppercase">Received Items</div>
                           <div className="max-h-60 overflow-y-auto p-2 bg-gray-50">
                              <GenericCartList<ReturnCartItem>
                                items={newItemsReceived}
                                availableItems={availableItems}
                                basePriceKey="unitPrice"
                                priceLabel="Cost"
                                settings={{
                                  enableRounding: false,
                                  roundingInterval: 1,
                                  enableItemWiseDiscount: false,
                                  lockDiscount: true,
                                  lockPrice: false
                                }}
                                applyRounding={(v) => v}
                                State={State}
                                setModal={setModal}
                                onOpenEditDrawer={() => { }}
                                onDeleteItem={handleRemoveNewItem}
                                onDiscountChange={() => { }}
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
                <div className="md:hidden bg-white p-4 rounded-sm shadow-md mt-2">
                    <div className="flex justify-between items-center text-sm text-red-700">
                      <p>Return Value</p><p className="font-medium">₹{totalReturnValue.toFixed(2)}</p>
                    </div>
                    {modeOfReturn === 'Exchange' && (
                      <div className="flex justify-between items-center text-sm text-green-700 mt-1">
                        <p>New Items Value</p><p className="font-medium">₹{totalNewItemsValue.toFixed(2)}</p>
                      </div>
                    )}
                    <div className="border-t border-gray-200 my-2"></div>
                    <div className={`flex justify-between items-center text-lg font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                      <p>{getBalanceLabel()}</p><p>₹{Math.abs(finalBalance).toFixed(2)}</p>
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
                      <option>Debit Note</option>
                      <option>Cash Refund</option>
                    </select>
                 </div>

                 {/* Financials */}
                 <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-xl border border-gray-100 flex-grow">
                    <div className="flex justify-between font-semibold border-b border-gray-200 pb-2">
                      <span>Total Return Value</span>
                      <span className="text-red-600">₹{totalReturnValue.toFixed(2)}</span>
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
                        <span className="text-gray-500 font-medium">{getBalanceLabel()}</span>
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
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-gray-100 border-t border-gray-200 z-20 flex justify-center pb-8">
           {selectedPurchase && (<CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-3 text-lg font-semibold shadow-md">Process Transaction</CustomButton>)}
        </div>

      </div>

      <PaymentDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={Math.abs(finalBalance)}
        onPaymentComplete={saveReturnTransaction}
        initialPartyName={supplierName}
        initialPartyNumber={supplierNumber}
      />
    </div>
  );
};

export default PurchaseReturnPage;