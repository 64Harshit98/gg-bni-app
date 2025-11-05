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
  serverTimestamp, // <-- Import serverTimestamp
} from 'firebase/firestore';
import { useAuth, useDatabase } from '../../context/Auth-Context';
import { ROUTES } from '../../constants/routes.constants';
import type { Item, PurchaseItem as OriginalPurchaseItem } from '../../constants/models';
import { Modal } from '../../constants/Modal';
import { State, Variant } from '../../enums';
import { CustomButton } from '../../Components';
import SearchableItemInput from '../../UseComponents/SearchIteminput';
import PaymentDrawer, { type PaymentCompletionData } from '../../Components/PaymentDrawer';
import BarcodeScanner from '../../UseComponents/BarcodeScanner';

// --- Interfaces ---
interface PurchaseData {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyNumber?: string;
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

// --- Main Purchase Return Page Component ---
const PurchaseReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const dbOperations = useDatabase();
  const { purchaseId } = useParams();
  const { state } = useLocation();
  const [supplierName, setSupplierName] = useState<string>('');
  const [supplierNumber, setSupplierNumber] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Exchange');
  const [newItemsReceived, setNewItemsReceived] = useState<TransactionItem[]>([]);
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
        // --- FIX: Use multi-tenant path for 'purchases' ---
        const purchasesQuery = query(
          collection(db, 'companies', currentUser.companyId, 'purchases')
          // No 'where' clause for companyId needed
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
        console.error("Error fetching data:", err); // This is line 106
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
    setOriginalPurchaseItems(purchase.items.map((item: any) => {
      const itemData = item.data || item;
      const quantity = itemData.quantity || 1;

      // Handle both old 'finalPrice' and new 'purchasePrice'
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

  const handleRemoveItem = (listSetter: React.Dispatch<React.SetStateAction<TransactionItem[]>>, id: string) => {
    listSetter(prev => prev.filter(item => item.id !== id));
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

    if (modeOfReturn === 'Debit Note' && !supplierNumber) {
      setModal({ type: State.ERROR, message: 'Cannot create Debit Note: Party Number is missing.' });
      return;
    }

    setIsLoading(true);
    const companyId = currentUser.companyId; // Get companyId for all paths

    try {
      const batch = writeBatch(db);
      // --- FIX: Use multi-tenant path for 'purchases' ---
      const purchaseRef = doc(db, 'companies', companyId, 'purchases', selectedPurchase.id);

      const originalItemsMap = new Map(selectedPurchase.items.map(item => [item.id, { ...item }]));

      itemsToReturn.forEach(returnItem => {
        const originalItem = originalItemsMap.get(returnItem.originalItemId);
        if (originalItem) {
          originalItem.quantity -= returnItem.quantity;
          if (originalItem.quantity <= 0) originalItemsMap.delete(returnItem.originalItemId);
        }
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
          });
        }
      });

      const newItemsList = Array.from(originalItemsMap.values());
      const newTotalAmount = newItemsList.reduce((sum, item) => sum + (item.quantity * (item.purchasePrice || 0)), 0);

      const returnHistoryRecord = {
        returnedAt: serverTimestamp(), // Use server timestamp
        returnedItems: itemsToReturn.map(({ id, ...item }) => item),
        newItemsReceived: newItemsReceived.map(({ id, ...item }) => item),
        finalBalance,
        modeOfReturn,
        paymentDetails: completionData?.paymentDetails || null,
      };

      batch.update(purchaseRef, {
        items: newItemsList,
        totalAmount: newTotalAmount,
        returnHistory: arrayUnion(returnHistoryRecord),
      });

      itemsToReturn.forEach(item => {
        // --- FIX: Use multi-tenant path for 'items' ---
        batch.update(doc(db, 'companies', companyId, 'items', item.originalItemId), { Stock: firebaseIncrement(-item.quantity) });
      });
      newItemsReceived.forEach(item => {
        // --- FIX: Use multi-tenant path for 'items' ---
        batch.update(doc(db, 'companies', companyId, 'items', item.originalItemId), { Stock: firebaseIncrement(item.quantity) });
      });

      if (modeOfReturn === 'Debit Note' && finalBalance > 0) {
        // --- FIX: Use multi-tenant path for 'customers' ---
        const customerRef = doc(db, 'companies', companyId, 'customers', supplierNumber);
        batch.set(customerRef, {
          name: supplierName,
          phone: supplierNumber,
          debitBalance: firebaseIncrement(finalBalance),
          companyId: companyId,
          lastUpdatedAt: serverTimestamp()
        }, { merge: true });
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
    if (modeOfReturn === 'Exchange' && finalBalance < 0) {
      setIsDrawerOpen(true);
    } else {
      saveReturnTransaction();
    }
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="flex flex-col min-h-screen bg-white w-full ">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={scannerPurpose !== null} onClose={() => setScannerPurpose(null)} onScanSuccess={handleBarcodeScanned} />

      <div className="flex flex-col p-1 bg-gray-100 border-b border-gray-300 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-800 text-center mb-2">Purchase Return</h1>
        <div className="flex justify-center gap-x-6">
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE)} active={isActive(ROUTES.PURCHASE)}>Purchase</CustomButton>
          <CustomButton variant={Variant.Transparent} onClick={() => navigate(ROUTES.PURCHASE_RETURN)} active={isActive(ROUTES.PURCHASE_RETURN)}>Purchase Return</CustomButton>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-grow p-2 bg-gray-100 ">
        <div className="bg-white p-6 rounded-lg shadow-md mb-2">
          <div className="relative" ref={dropdownRef}>
            <label htmlFor="search-purchase" className="block text-base font-medium mb-2">Search Original Purchase</label>
            <div className="flex gap-2">
              <input
                type="text" id="search-purchase" value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder={selectedPurchase ? `${selectedPurchase.partyName} (${selectedPurchase.invoiceNumber})` : "Search by Supplier or Invoice"}
                className="flex-grow p-2 border rounded-lg" autoComplete="off" readOnly={!!selectedPurchase}
              />
              {selectedPurchase && (
                <button onClick={handleClear} className="py-2 px-4 bg-sky-500 text-white font-semibold rounded-lg">
                  Clear
                </button>
              )}
            </div>
            {isDropdownOpen && !selectedPurchase && (
              <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredList.map(item => (
                  <div key={item.id} className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSelectPurchase(item)}>
                    <p className="font-semibold">{item.partyName} ({item.invoiceNumber})</p>
                    <p className="text-sm text-gray-600">Total: ₹{item.totalAmount.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {selectedPurchase && (
          <>
            <div className="bg-white p-6 rounded-lg shadow-md mt-2">
              <div className="space-y-4">
                <div className='grid grid-cols-2 gap-4'>
                  <div>
                    <label htmlFor="return-date" className="block font-medium text-sm mb-1">Return Date</label>
                    <input type="date" id="return-date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-2 border rounded" />
                  </div>
                  <div>
                    <label htmlFor="supplier-name" className="block font-medium text-sm mb-1">Party Name</label>
                    <input type="text" id="supplier-name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full p-2 border rounded bg-white" />
                  </div>
                </div>
                <div>
                  <label htmlFor="supplier-number" className="block font-medium text-sm mb-1">Party Number</label>
                  <input type="text" id="supplier-number" value={supplierNumber} onChange={(e) => setSupplierNumber(e.target.value)} className="w-full p-2 border rounded bg-white" />
                </div>
              </div>

              <h3 className="text-sm font-semibold mt-4 mb-2">Select Items to Return</h3>
              <div className="flex flex-col gap-3">
                {originalPurchaseItems.map((item) => {
                  const isSelected = selectedReturnIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`p-3 border rounded-lg flex items-center gap-3 transition-all ${isSelected ? 'bg-red-50 shadow-sm' : 'bg-gray-50'}`}
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
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1">
                            <label className="text-xs text-gray-600">Qty:</label>
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(setOriginalPurchaseItems, item.id, 'quantity', Number(e.target.value))}
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

            <div className="bg-white p-6 rounded-lg shadow-md mt-2">
              <div>
                <label htmlFor="mode-of-return" className="block font-medium mb-1">Transaction Type</label>
                <select id="mode-of-return" value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                  <option>Exchange</option>
                  <option>Debit Note</option>
                </select>
              </div>
              {modeOfReturn === 'Exchange' && (
                <div className="pt-3 border-t mt-3">
                  <div className="flex gap-2 items-end">
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
                    <button onClick={() => setScannerPurpose('item')} className="p-3 bg-gray-700 text-white rounded-lg flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-ท3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
                    </button>
                  </div>
                  {newItemsReceived.length > 0 && (
                    <div className="flex flex-col gap-3 mt-4">
                      <h3 className="text-sm font-semibold">New Items Received</h3>
                      {newItemsReceived.map((item) => (
                        <div key={item.id} className="relative flex flex-col p-2 border rounded-lg bg-white shadow-sm">
                          <p className="font-semibold text-gray-800 pr-8">{item.name}</p>
                          <div className="flex justify-between items-center mt-2"><p className="text-sm text-gray-500">₹{item.unitPrice.toFixed(2)}</p></div>

                          <button
                            onClick={() => handleRemoveItem(setNewItemsReceived, item.id)}
                            className="absolute top-3 right-3 text-red-500 font-bold text-lg hover:text-red-700"
                          >
                            &times;
                          </button>
                          <div className="border-t w-full my-2"></div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-medium text-gray-600">Qty</label>
                              <div className="flex items-center">
                                <button
                                  type="button"
                                  onClick={() => handleItemChange(setNewItemsReceived, item.id, 'quantity', Math.max(1, item.quantity - 1))}
                                  className="px-3 py-1 text-lg font-bold text-gray-500"
                                >
                                  -
                                </button>
                                <span className="px-4 py-1 text-center font-semibold text-gray-800">
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleItemChange(setNewItemsReceived, item.id, 'quantity', item.quantity + 1)}
                                  className="px-3 py-1 text-lg font-bold text-gray-500"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md mt-2">
              <div className="p-4 bg-gray-100 rounded-lg space-y-3">
                <div className="flex justify-between items-center text-md text-red-700"><p>Total Return Value (Debit)</p><p className="font-medium">₹{totalReturnValue.toFixed(2)}</p></div>
                <div className="flex justify-between items-center text-md text-green-700"><p>Total New Items Value (Credit)</p><p className="font-medium">₹{totalNewItemsValue.toFixed(2)}</p></div>
                <div className="border-t border-gray-300 !my-2"></div>
                <div className={`flex justify-between items-center text-2xl font-bold ${finalBalance >= 0 ? 'text-green-600' : 'text-orange-600'}`}><p>{finalBalance >= 0 ? 'Debit Note' : 'Payment Due'}</p><p>₹{Math.abs(finalBalance).toFixed(2)}</p></div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="sticky bottom-0 p-4 bg-gray-100 pb-16 items-center px-16">
        {selectedPurchase && (
          <CustomButton onClick={handleProcessReturn} variant={Variant.Payment} className="w-full py-4 text-xl font-semibold">
            Process Transaction
          </CustomButton>
        )}
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

export default PurchaseReturnPage;