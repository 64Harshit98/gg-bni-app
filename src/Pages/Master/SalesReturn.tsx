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
import type { Item, SalesItem as OriginalSalesItem } from '../../constants/models';

// --- Interface Definitions ---
interface SalesData {
  id: string;
  partyName: string;
  partyNumber: string;
  items: OriginalSalesItem[];
  totalAmount: number;
  createdAt: any;
}
interface ReturnItem {
  id: string; // Unique ID for the list item in the UI
  originalItemId: string; // The ID of the item in the 'items' collection
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
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


const SalesReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  // Form State
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [partyName, setPartyName] = useState<string>('');
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const [modeOfReturn, setModeOfReturn] = useState<string>('Cash Refund');

  // Data & Search State for Original Sales
  const [salesList, setSalesList] = useState<SalesData[]>([]);
  const [selectedSale, setSelectedSale] = useState<SalesData | null>(null);
  const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');
  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
  const salesDropdownRef = useRef<HTMLDivElement>(null);

  // State for Inventory Item Search
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [selectedItemToAdd, setSelectedItemToAdd] = useState<Item | null>(null);
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);
  const itemDropdownRef = useRef<HTMLDivElement>(null);

  // UI State
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSaleScannerOpen, setIsSaleScannerOpen] = useState(false);
  const [isItemScannerOpen, setIsItemScannerOpen] = useState(false);

  // Fetch initial data (sales and all items)
  useEffect(() => {
    if (!currentUser) { setIsLoading(false); return; }
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const salesQuery = query(collection(db, 'sales'), where('userId', '==', currentUser.uid));
        const [salesSnapshot, allItems] = await Promise.all([
          getDocs(salesQuery),
          getItems()
        ]);
        const sales: SalesData[] = salesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SalesData));
        setSalesList(sales);
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
      if (salesDropdownRef.current && !salesDropdownRef.current.contains(event.target as Node)) {
        setIsSalesDropdownOpen(false);
      }
      if (itemDropdownRef.current && !itemDropdownRef.current.contains(event.target as Node)) {
        setIsItemDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSales = useMemo(() => salesList.filter(sale =>
    sale.partyName.toLowerCase().includes(searchSaleQuery.toLowerCase()) ||
    sale.id.toLowerCase().includes(searchSaleQuery.toLowerCase())
  ), [salesList, searchSaleQuery]);

  const filteredAvailableItems = useMemo(() => availableItems.filter(item =>
    item.name.toLowerCase().includes(itemSearchQuery.toLowerCase())
  ), [availableItems, itemSearchQuery]);


  // --- Handlers ---
  const handleSelectSale = (sale: SalesData) => {
    setSelectedSale(sale);
    setPartyName(sale.partyName);
    setReturnItems(
      sale.items.map((item) => ({
        id: crypto.randomUUID(),
        originalItemId: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.mrp,
        amount: item.quantity * item.mrp,
      })),
    );
    setSearchSaleQuery(`${sale.partyName} - #${sale.id.slice(0, 6)}`);
    setIsSalesDropdownOpen(false);
  };

  const handleSaleBarcodeScanned = (scannedId: string) => {
    setIsSaleScannerOpen(false);
    const foundSale = salesList.find(sale => sale.id === scannedId);
    if (foundSale) {
      handleSelectSale(foundSale);
    } else {
      setModal({ message: 'No sale found with this ID.', type: 'error' });
    }
  };

  const handleClear = () => {
    setSelectedSale(null);
    setPartyName('');
    setReturnItems([]);
    setSearchSaleQuery('');
  };

  const handleItemChange = (id: string, field: keyof ReturnItem, value: string | number) => {
    setReturnItems(prev => prev.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unitPrice') {
          const quantity = Number(updatedItem.quantity);
          const unitPrice = Number(updatedItem.unitPrice);
          updatedItem.amount = isNaN(quantity) || isNaN(unitPrice) ? 0 : quantity * unitPrice;
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
        unitPrice: selectedItemToAdd.mrp,
        amount: selectedItemToAdd.mrp
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
          unitPrice: itemToAdd.mrp,
          amount: itemToAdd.mrp
        }
      ]);
      setModal({ message: `Added: ${itemToAdd.name}`, type: 'success' });
    } else {
      setModal({ message: 'Item not found for this barcode.', type: 'error' });
    }
  };

  const totalReturnAmount = useMemo(() => returnItems.reduce((sum, item) => sum + item.amount, 0), [returnItems]);

  const handleSaveReturn = async () => {
    if (!currentUser) return setModal({ type: 'error', message: 'You must be logged in.' });
    if (!partyName.trim() || returnItems.length === 0 || returnItems.some(item => !item.name.trim() || item.quantity <= 0)) {
      return setModal({ type: 'error', message: 'Please fill Party Name and ensure all items have a name and quantity.' });
    }

    try {
      const salesReturnData = {
        userId: currentUser.uid,
        originalSaleId: selectedSale ? selectedSale.id : null,
        returnDate,
        partyName: partyName.trim(),
        returnItems: returnItems.map(({ id, originalItemId, ...item }) => item),
        totalReturnAmount,
        modeOfReturn,
        createdAt: serverTimestamp(),
      };

      const batch = writeBatch(db);
      const newReturnRef = doc(collection(db, 'salesReturns'));
      batch.set(newReturnRef, salesReturnData);

      returnItems.forEach(item => {
        if (item.originalItemId) {
          const itemRef = doc(db, 'items', item.originalItemId);
          batch.update(itemRef, { amount: firebaseIncrement(item.quantity) });
        }
      });

      await batch.commit();

      setModal({ type: 'success', message: 'Sales Return saved successfully!' });
      handleClear();

    } catch (error) {
      console.error('Error saving sales return:', error);
      setModal({ type: 'error', message: 'Failed to save sales return. Please try again.' });
    }
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (error) return <div className="flex min-h-screen items-center justify-center text-red-500">{error}</div>;

  return (
    <div className="flex flex-col min-h-screen bg-white w-full">
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <BarcodeScanner isOpen={isSaleScannerOpen} onClose={() => setIsSaleScannerOpen(false)} onScanSuccess={handleSaleBarcodeScanned} />
      <BarcodeScanner isOpen={isItemScannerOpen} onClose={() => setIsItemScannerOpen(false)} onScanSuccess={handleItemBarcodeScanned} />

      <div className="flex items-center justify-between p-4 bg-white border-b sticky top-0 z-10">
        <button onClick={() => navigate(ROUTES.HOME)} className="text-2xl font-bold">&times;</button>
        <div className="flex-1 flex justify-center gap-6">
          <NavLink to={ROUTES.SALES} className="py-3 text-center text-slate-500">Sales</NavLink>
          <NavLink to={ROUTES.SALES_RETURN} className="py-3 text-center border-b-2 border-blue-600 text-blue-600 font-semibold">Sales Return</NavLink>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-grow p-4 bg-gray-50">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <div className="mb-4 relative" ref={salesDropdownRef}>
            <label htmlFor="search-sale" className="block text-lg font-medium mb-2">Search Original Sale (Optional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                id="search-sale"
                value={searchSaleQuery}
                onChange={(e) => { setSearchSaleQuery(e.target.value); setIsSalesDropdownOpen(true); }}
                onFocus={() => setIsSalesDropdownOpen(true)}
                placeholder="Search by Party Name or Sale ID"
                className="flex-grow p-3 border rounded-lg"
                autoComplete="off"
              />
              <button onClick={() => setIsSaleScannerOpen(true)} className="p-3 bg-gray-700 text-white rounded-lg" title="Scan Sale ID Barcode">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
              </button>
            </div>
            {isSalesDropdownOpen && (
              <div className="absolute top-full w-full z-20 mt-1 bg-white border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {filteredSales.length > 0 ? filteredSales.map(sale => (
                  <div key={sale.id} className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => handleSelectSale(sale)}>
                    <p className="font-semibold">{sale.partyName}</p>
                    <p className="text-sm text-gray-600">ID: {sale.id.slice(0, 10)}... | Total: ₹{sale.totalAmount.toFixed(2)}</p>
                  </div>
                )) : <div className="p-3 text-gray-500">No matching sales found.</div>}
              </div>
            )}
            {selectedSale && <button onClick={handleClear} className="mt-2 w-full py-2 bg-red-500 text-white rounded-lg">Clear Selection & Start Manual Return</button>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="return-date" className="block font-medium mb-1">Date</label>
              <input type="date" id="return-date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className="w-full p-2 border rounded" />
            </div>
            <div>
              <label htmlFor="party-name" className="block font-medium mb-1">Party Name</label>
              <input type="text" id="party-name" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="w-full p-2 border rounded" readOnly={!!selectedSale} />
            </div>
            <div>
              <label htmlFor="mode-of-return" className="block font-medium mb-1">Mode of Return</label>
              <select id="mode-of-return" value={modeOfReturn} onChange={(e) => setModeOfReturn(e.target.value)} className="w-full p-2 border rounded bg-white">
                <option>Cash Refund</option>
                <option>Credit Note</option>
              </select>
            </div>
          </div>

          <h3 className="text-xl font-semibold mt-6 mb-4">Items to Return</h3>
          <div className="flex flex-col gap-4 mb-6">
            {returnItems.map((item) => (
              <div key={item.id} className="grid grid-cols-12 gap-2 items-center p-2 border rounded-lg bg-gray-50">
                <input type="text" value={item.name} onChange={(e) => handleItemChange(item.id, 'name', e.target.value)} placeholder="Item Name" className="col-span-4 p-2 border rounded" readOnly={!!selectedSale} />
                <input type="number" value={item.quantity} onChange={(e) => handleItemChange(item.id, 'quantity', Number(e.target.value))} className="col-span-2 p-2 border rounded text-center" />
                <input type="number" value={item.unitPrice} onChange={(e) => handleItemChange(item.id, 'unitPrice', Number(e.target.value))} className="col-span-2 p-2 border rounded text-right" readOnly={!!selectedSale} />
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
                      <span className="text-gray-500">₹{item.mrp.toFixed(2)}</span>
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
        <button onClick={handleSaveReturn} className="w-full max-w-xs mx-auto block py-3 bg-blue-600 text-white rounded-lg text-lg font-semibold">
          Save Return
        </button>
      </div>
    </div>
  );
};

export default SalesReturnPage;