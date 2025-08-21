import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { db } from '../../lib/firebase';
import {
  collection,
  query,
  getDocs,
  serverTimestamp,
  where,
  doc,
  writeBatch,
  increment as firebaseIncrement,
} from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';
import { Html5Qrcode } from 'html5-qrcode';
import { getItems } from '../../lib/items_firebase';
import type { Item, PurchaseItem as OriginalPurchaseItem } from '../../constants/models';

// --- Interface Definitions ---
interface PurchaseData {
  id: string;
  partyName: string;
  partyNumber?: string;
  items: OriginalPurchaseItem[];
  totalAmount: number;
  createdAt: any;
}
interface ReturnItem {
  id: string;
  originalItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}
interface PurchaseReturnData {
  id: string;
  partyName: string;
  returnItems: ReturnItem[];
  originalPurchaseId: string | null;
  voucherNo: string;
  totalReturnAmount: number;
}

// --- Reusable Components ---
const Modal: React.FC<{ message: string; onClose: () => void; type: 'success' | 'error' | 'info' }> = ({ message, onClose, type }) => (
  <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center">
      <div className={`mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center ${type === 'success' ? 'bg-green-100' : type === 'error' ? 'bg-red-100' : 'bg-blue-100'}`}>
        {type === 'success' && <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
        {type === 'error' && <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>}
        {type === 'info' && <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
      </div>
      <p className="text-lg font-medium text-gray-800 mb-4">{message}</p>
      <button onClick={onClose} className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">OK</button>
    </div>
  </div>
);
const BarcodeScanner: React.FC<{ isOpen: boolean; onClose: () => void; onScanSuccess: (decodedText: string) => void; }> = ({ isOpen, onClose, onScanSuccess }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  useEffect(() => {
    if (isOpen) {
      const scanner = new Html5Qrcode('barcode-scanner-container');
      scannerRef.current = scanner;
      scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 } }, onScanSuccess, undefined)
        .catch(err => console.error("Scanner start error:", err));
    }
    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(err => console.error("Scanner stop error:", err));
      }
    };
  }, [isOpen, onScanSuccess]);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-4">
      <div id="barcode-scanner-container" className="w-full max-w-md bg-gray-900 rounded-lg overflow-hidden"></div>
      <button onClick={onClose} className="mt-4 bg-white text-gray-800 font-bold py-2 px-6 rounded-lg shadow-lg hover:bg-gray-200 transition">Close</button>
    </div>
  );
};


const PurchaseReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Form State
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [voucherNo, setVoucherNo] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Cash Refund');
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);

  // Data & Search State
  const [searchableList, setSearchableList] = useState<(PurchaseData | PurchaseReturnData)[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseData | null>(null);

  // State for Inventory Item Search
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [selectedItemToAdd, setSelectedItemToAdd] = useState<Item | null>(null);
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
  const itemDropdownRef = useRef<HTMLDivElement>(null);

  // UI State & Edit Mode
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isPurchaseScannerOpen, setIsPurchaseScannerOpen] = useState(false);
  const [isItemScannerOpen, setIsItemScannerOpen] = useState(false);
  const [editingReturnId, setEditingReturnId] = useState<string | null>(null);
  const [originalReturnItems, setOriginalReturnItems] = useState<ReturnItem[]>([]);

  // Fetch initial data
  useEffect(() => {
    if (!currentUser) { setIsLoading(false); return; }
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const purchasesQuery = query(collection(db, 'purchases'), where('userId', '==', currentUser.uid));
        const returnsQuery = query(collection(db, 'purchaseReturns'), where('userId', '==', currentUser.uid));

        const [purchasesSnapshot, returnsSnapshot, allItems] = await Promise.all([
          getDocs(purchasesQuery),
          getDocs(returnsQuery),
          getItems()
        ]);

        const purchases: PurchaseData[] = purchasesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseData));
        const returns: PurchaseReturnData[] = returnsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PurchaseReturnData));

        setSearchableList([...purchases, ...returns]);
        setAvailableItems(allItems);

      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load initial data.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [currentUser]);

  // Handle click outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
      if (itemDropdownRef.current && !itemDropdownRef.current.contains(event.target as Node)) {
        setIsItemDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredList = useMemo(() => searchableList.filter(item =>
    item.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.id.toLowerCase().includes(searchQuery.toLowerCase())
  ), [searchableList, searchQuery]);

  const filteredAvailableItems = useMemo(() => availableItems.filter(item =>
    item.name.toLowerCase().includes(itemSearchQuery.toLowerCase())
  ), [availableItems, itemSearchQuery]);


  // --- Handlers ---
  const handleSelect = (item: PurchaseData | PurchaseReturnData) => {
    setSupplierName(item.partyName);
    setSearchQuery(`${item.partyName} - #${item.id.slice(0, 6)}`);
    setIsDropdownOpen(false);

    if ('items' in item) {
      setSelectedPurchase(item);
      setEditingReturnId(null);
      setOriginalReturnItems([]);
      setVoucherNo(item.id);
      setReturnItems(item.items.map(i => ({
        id: crypto.randomUUID(),
        originalItemId: i.id,
        name: i.name,
        quantity: i.quantity,
        unitPrice: i.purchasePrice,
        amount: i.quantity * i.purchasePrice,
      })));
    } else {
      setSelectedPurchase(null);
      setEditingReturnId(item.id);
      setVoucherNo(item.voucherNo);
      setReturnItems(item.returnItems.map(ri => ({ ...ri, id: crypto.randomUUID() })));
      setOriginalReturnItems(item.returnItems);
    }
  };

  const handleClear = () => {
    setSupplierName('');
    setVoucherNo('');
    setReturnItems([]);
    setSearchQuery('');
    setSelectedPurchase(null);
    setEditingReturnId(null);
    setOriginalReturnItems([]);
  };

  const handleItemChange = (id: string, field: keyof ReturnItem, value: string | number) => {
    setReturnItems(prev => prev.map(item => {
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

  const handleRemoveItem = (id: string) => {
    setReturnItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSelectItemToAdd = (item: Item) => {
    setSelectedItemToAdd(item);
    setItemSearchQuery(item.name);
    setIsItemDropdownOpen(false);
  };

  const handleAddItemToReturn = () => {
    if (!selectedItemToAdd) return;
    setReturnItems(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        originalItemId: selectedItemToAdd.id!,
        name: selectedItemToAdd.name,
        quantity: 1,
        unitPrice: selectedItemToAdd.purchasePrice || 0,
        amount: selectedItemToAdd.purchasePrice || 0
      }
    ]);
    setSelectedItemToAdd(null);
    setItemSearchQuery('');
  };

  const handleItemBarcodeScanned = (barcode: string) => {
    setIsItemScannerOpen(false);
    const itemToAdd = availableItems.find(item => item.barcode === barcode);
    if (itemToAdd) {
      setReturnItems(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          originalItemId: itemToAdd.id!,
          name: itemToAdd.name,
          quantity: 1,
          unitPrice: itemToAdd.purchasePrice || 0,
          amount: itemToAdd.purchasePrice || 0
        }
      ]);
      setModal({ message: `Added: ${itemToAdd.name}`, type: 'success' });
    } else {
      setModal({ message: 'Item not found for this barcode.', type: 'error' });
    }
  };

  const handlePurchaseBarcodeScanned = (scannedId: string) => {
    setIsPurchaseScannerOpen(false);
    const foundItem = searchableList.find(p => p.id === scannedId);
    if (foundItem) {
      handleSelect(foundItem);
    } else {
      setModal({ message: 'No purchase or return found with this ID.', type: 'error' });
    }
  };

  const totalReturnAmount = useMemo(() => returnItems.reduce((sum, item) => sum + item.amount, 0), [returnItems]);

  const handleSaveOrUpdateReturn = async () => {
    if (!currentUser) return;
    if (!supplierName.trim() || returnItems.length === 0 || returnItems.some(item => !item.name.trim() || item.quantity <= 0)) {
      return setModal({ type: 'error', message: 'Please fill Supplier Name and ensure all items have a name and quantity.' });
    }

    const returnData = {
      userId: currentUser.uid,
      returnDate,
      partyName: supplierName.trim(),
      voucherNo: voucherNo.trim(),
      returnItems: returnItems.map(({ id, ...item }) => item),
      totalReturnAmount,
      modeOfReturn,
    };

    try {
      const batch = writeBatch(db);
      if (editingReturnId) {
        const returnRef = doc(db, 'purchaseReturns', editingReturnId);
        batch.update(returnRef, { ...returnData, updatedAt: serverTimestamp() });
        const stockChanges = new Map<string, number>();
        originalReturnItems.forEach(item => {
          stockChanges.set(item.originalItemId, (stockChanges.get(item.originalItemId) || 0) + item.quantity);
        });
        returnItems.forEach(item => {
          stockChanges.set(item.originalItemId, (stockChanges.get(item.originalItemId) || 0) - item.quantity);
        });
        stockChanges.forEach((change, itemId) => {
          if (itemId && change !== 0) {
            batch.update(doc(db, 'items', itemId), { amount: firebaseIncrement(change) });
          }
        });
        await batch.commit();
        setModal({ type: 'success', message: 'Purchase Return updated successfully!' });
      } else {
        const newReturnRef = doc(collection(db, 'purchaseReturns'));
        batch.set(newReturnRef, { ...returnData, originalPurchaseId: selectedPurchase?.id || null, createdAt: serverTimestamp() });
        returnItems.forEach(item => {
          if (item.originalItemId) {
            batch.update(doc(db, 'items', item.originalItemId), { amount: firebaseIncrement(-item.quantity) });
          }
        });
        await batch.commit();
        setModal({ type: 'success', message: 'Purchase Return saved successfully!' });
      }
      handleClear();
    } catch (error) {
      console.error('Error saving purchase return:', error);
      setModal({ type: 'error', message: 'Failed to save purchase return.' });
    }
  };

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center text-red-500">{error}</div>;
  }

  return (
    <div className="flex flex-col min-h-screen bg-white w-full">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={isPurchaseScannerOpen} onClose={() => setIsPurchaseScannerOpen(false)} onScanSuccess={handlePurchaseBarcodeScanned} />
      <BarcodeScanner isOpen={isItemScannerOpen} onClose={() => setIsItemScannerOpen(false)} onScanSuccess={handleItemBarcodeScanned} />

      <div className="flex items-center justify-between p-4 bg-white border-b sticky top-0 z-10">
        <button onClick={() => navigate(ROUTES.HOME)} className="text-2xl font-bold">&times;</button>
        <div className="flex-1 flex justify-center gap-6">
          <NavLink to={`${ROUTES.PURCHASE}`} className={({ isActive }) => `flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${isActive ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500'}`}>Purchase</NavLink>
          <NavLink to={`${ROUTES.PURCHASE_RETURN}`} className={({ isActive }) => `flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${isActive ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500'}`}>Purchase Return</NavLink>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-grow p-4 bg-gray-50">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="mb-4 relative" ref={dropdownRef}>
            <label htmlFor="search-purchase" className="block text-lg font-medium mb-2">Search Purchase or Return to Edit</label>
            <div className="flex gap-2">
              <input
                type="text"
                id="search-purchase"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }}
                onFocus={() => setIsDropdownOpen(true)}
                placeholder="Search by Supplier or ID"
                className="flex-grow p-3 border rounded-lg"
              />
              <button onClick={() => setIsPurchaseScannerOpen(true)} className="p-3 bg-gray-700 text-white rounded-lg" title="Scan ID Barcode">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
              </button>
            </div>
            {isDropdownOpen && (
              <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredList.length > 0 ? filteredList.map(item => (
                  <div key={item.id} className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSelect(item)}>
                    <p className="font-semibold">{item.partyName} - {'items' in item ? 'Purchase' : 'Return'}</p>
                    <p className="text-sm text-gray-600">ID: {item.id.slice(0, 10)}... | Total: ₹{'totalAmount' in item ? item.totalAmount.toFixed(2) : item.totalReturnAmount.toFixed(2)}</p>
                  </div>
                )) : <div className="p-3 text-gray-500">No results found.</div>}
              </div>
            )}
            {(selectedPurchase || editingReturnId) && <button onClick={handleClear} className="mt-2 w-full py-2 bg-red-500 text-white rounded-lg">Clear Selection</button>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="return-date" className="block font-medium mb-1">Date</label>
              <input type="date" id="return-date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-2 border rounded" />
            </div>
            <div>
              <label htmlFor="supplier-name" className="block font-medium mb-1">Supplier Name</label>
              <input type="text" id="supplier-name" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} className="w-full p-2 border rounded" readOnly={!!selectedPurchase || !!editingReturnId} />
            </div>
            <div>
              <label htmlFor="mode-of-return" className="block font-medium mb-1">Mode of Return</label>
              <select id="mode-of-return" value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                <option>Cash Refund</option>
                <option>Debit Note</option>
              </select>
            </div>
          </div>

          <h3 className="text-xl font-semibold mt-6 mb-4">Items to Return</h3>
          <div className="flex flex-col gap-4 mb-6">
            {returnItems.map((item) => (
              <div key={item.id} className="grid grid-cols-12 gap-2 items-center p-2 border rounded-lg bg-gray-50">
                <input type="text" value={item.name} onChange={(e) => handleItemChange(item.id, 'name', e.target.value)} placeholder="Item Name" className="col-span-4 p-2 border rounded" readOnly={!!selectedPurchase || !!editingReturnId} />
                <input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', Number(e.target.value))} className="col-span-2 p-2 border rounded text-center" />
                <input type="number" value={item.unitPrice} onChange={(e) => handleItemChange(item.id, 'unitPrice', Number(e.target.value))} className="col-span-2 p-2 border rounded text-right" readOnly={!!selectedPurchase || !!editingReturnId} />
                <p className="col-span-3 text-right font-semibold">₹{item.amount.toFixed(2)}</p>
                <button onClick={() => handleRemoveItem(item.id)} className="col-span-1 text-red-500 text-2xl hover:text-red-700">&times;</button>
              </div>
            ))}
          </div>

          <div className="pt-6 border-t mt-6">
            <div className="relative" ref={itemDropdownRef}>
              <label className="block text-lg font-medium mb-2">Add Item to Return from Inventory</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={itemSearchQuery}
                  onChange={(e) => { setItemSearchQuery(e.target.value); setIsItemDropdownOpen(true); }}
                  onFocus={() => setIsItemDropdownOpen(true)}
                  placeholder="Search inventory..."
                  className="flex-grow p-3 border rounded-lg"
                  autoComplete="off"
                />
                <button onClick={() => setIsItemScannerOpen(true)} className="p-3 bg-gray-700 text-white rounded-lg" title="Scan Item Barcode">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
                </button>
                <button onClick={handleAddItemToReturn} className="py-3 px-5 bg-blue-600 text-white rounded-lg font-semibold" disabled={!selectedItemToAdd}>Add</button>
              </div>
              {isItemDropdownOpen && (
                <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {filteredAvailableItems.length > 0 ? filteredAvailableItems.map(item => (
                    <div key={item.id} className="p-3 cursor-pointer hover:bg-gray-100 flex justify-between" onClick={() => handleSelectItemToAdd(item)}>
                      <span>{item.name}</span>
                      <span className="text-gray-500">₹{(item.purchasePrice || 0).toFixed(2)}</span>
                    </div>
                  )) : <div className="p-3 text-gray-500">No items found.</div>}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between items-center p-4 bg-gray-100 rounded-lg mt-6">
            <p className="text-lg font-medium">Total Return Amount</p>
            <p className="text-3xl font-bold">₹{totalReturnAmount.toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 p-4 bg-white border-t">
        <button onClick={handleSaveOrUpdateReturn} className="w-full max-w-xs mx-auto block py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold">
          {editingReturnId ? 'Update Return' : 'Save Return'}
        </button>
      </div>
    </div>
  );
};

export default PurchaseReturnPage;