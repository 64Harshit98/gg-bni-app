import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, query, getDocs, serverTimestamp, addDoc, Timestamp, where } from 'firebase/firestore';
import { useAuth } from '../../context/Authcontext';
import { ROUTES } from '../../constants/routes.constants';

// Define interfaces for consistency with SalesPage1 and for fetched sales
interface SalesItem {
  id: string;
  name: string;
  mrp: number;
  quantity: number;
}

interface SalesData {
  id: string;
  partyName: string;
  partyNumber: string;
  items: SalesItem[];
  totalAmount: number;
  capturedImage: string | null;
  createdAt: any;
}

interface ReturnItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

const SalesReturnPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  
  const [activeTab, setActiveTab] = useState('Sales Return');

  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [voucherNo, setVoucherNo] = useState<string>('');
  const [saleType, setSaleType] = useState<string>('Cash Sale');
  const [partyName, setPartyName] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Cash Refund');

  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);

  const [salesList, setSalesList] = useState<SalesData[]>([]);
  const [selectedSale, setSelectedSale] = useState<SalesData | null>(null);
  const [searchSaleQuery, setSearchSaleQuery] = useState<string>('');
  const [isSalesDropdownOpen, setIsSalesDropdownOpen] = useState<boolean>(false);
  const salesDropdownRef = useRef<HTMLDivElement>(null);

  const [isLoadingSales, setIsLoadingSales] = useState<boolean>(true);
  const [salesError, setSalesError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSales = async () => {
      if (!db || !currentUser) {
        setIsLoadingSales(false);
        return;
      }

      setIsLoadingSales(true);
      setSalesError(null);
      try {
        const salesCollectionRef = collection(db, `sales`);
        const q = query(salesCollectionRef, where('userId', '==', currentUser.uid));
        const querySnapshot = await getDocs(q);
        const fetchedSales: SalesData[] = [];
        querySnapshot.forEach((doc) => {
          fetchedSales.push({ id: doc.id, ...doc.data() } as SalesData);
        });
        setSalesList(fetchedSales);
      } catch (err) {
        console.error('Error fetching sales:', err);
        setSalesError('Failed to load sales data. Please ensure you have saved sales.');
      } finally {
        setIsLoadingSales(false);
      }
    };

    if (currentUser) {
      fetchSales();
    } else {
      setIsLoadingSales(false);
    }
  }, [db, currentUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (salesDropdownRef.current && !salesDropdownRef.current.contains(event.target as Node)) {
        setIsSalesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const filteredSales = salesList.filter(sale =>
    sale.partyName.toLowerCase().includes(searchSaleQuery.toLowerCase()) ||
    sale.partyNumber.toLowerCase().includes(searchSaleQuery.toLowerCase()) ||
    sale.id.toLowerCase().includes(searchSaleQuery.toLowerCase())
  );

  const handleSelectSale = (sale: SalesData) => {
    setSelectedSale(sale);
    setPartyName(sale.partyName);
    setVoucherNo(sale.partyNumber);
    setReturnItems(sale.items.map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.mrp,
      amount: item.quantity * item.mrp,
    })));
    setSearchSaleQuery(sale.partyName);
    setIsSalesDropdownOpen(false);
  };

  const handleClearSelectedSale = () => {
    setSelectedSale(null);
    setPartyName('');
    setVoucherNo('');
    setReturnItems([{ id: crypto.randomUUID(), name: '', quantity: 1, unitPrice: 0.00, amount: 0.00 }]);
    setSearchSaleQuery('');
  };

  const totalReturnAmount = returnItems.reduce((sum, item) => sum + item.amount, 0);

  const handleItemChange = (id: string, field: keyof ReturnItem, value: string | number) => {
    setReturnItems(prevItems =>
      prevItems.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          if (field === 'quantity' || field === 'unitPrice') {
            updatedItem.amount = updatedItem.quantity * updatedItem.unitPrice;
          }
          return updatedItem;
        }
        return item;
      })
    );
  };

  const handleAddItem = () => {
    setReturnItems(prevItems => [
      ...prevItems,
      { id: crypto.randomUUID(), name: '', quantity: 1, unitPrice: 0.00, amount: 0.00 },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setReturnItems(prevItems => prevItems.filter(item => item.id !== id));
  };

  const handleSaveReturn = async () => {
    if (!db || !currentUser) {
      alert('Firestore is not initialized or user is not authenticated.');
      return;
    }

    if (!partyName.trim() || returnItems.length === 0 || returnItems.some(item => !item.name.trim() || item.quantity <= 0 || item.unitPrice < 0)) {
      alert('Please fill in Party Name and ensure all return items have a name, quantity, and valid unit price.');
      return;
    }
    
    if (!currentUser) {
      alert('You must be logged in to save a return.');
      navigate(ROUTES.LOGIN);
      return;
    }

    try {
      const salesReturnData = {
        userId: currentUser.uid,
        originalSaleId: selectedSale ? selectedSale.id : null,
        returnDate,
        voucherNo: voucherNo.trim(),
        saleType,
        partyName: partyName.trim(),
        returnItems,
        totalReturnAmount,
        modeOfReturn,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'salesReturns'), salesReturnData);
      console.log('Sales Return successfully saved with ID:', docRef.id);
      alert('Sales Return saved successfully!');

      handleClearSelectedSale();
      setReturnDate(new Date().toISOString().split('T')[0]);
      setModeOfReturn('Cash Refund');

    } catch (error) {
      console.error('Error saving sales return:', error);
      alert('Failed to save sales return. Please try again.');
    }
  };

  if (isLoadingSales) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 text-gray-500">
        <p>Loading sales data...</p>
      </div>
    );
  }

  if (salesError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 text-red-500">
        <p>{salesError}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-white w-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <button onClick={() => navigate(ROUTES.HOME)} className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1">
          &times;
        </button>
        <div className="flex-1 flex justify-center items-center gap-6">
          <NavLink
            to={`${ROUTES.MASTERS}/${ROUTES.SALES}`}
            className={({ isActive }) =>
              `flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${
                isActive ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500'
              }`
            }
          >
            Sales
          </NavLink>
          <NavLink
            to={`${ROUTES.MASTERS}/${ROUTES.SALES_RETURN}`}
            className={({ isActive }) =>
              `flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${
                isActive ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500'
              }`
            }
          >
            Sales Return
          </NavLink>
        </div>
        <div className="w-6"></div> {/* Spacer for symmetry */}
      </div>

      {/* Main Content Area */}
      <div className="flex-grow p-4 bg-gray-100 w-full overflow-y-auto box-border">
        <div className="bg-white p-6 rounded-lg shadow-md">
          {/* Search Sale Section */}
          <div className="mb-4 relative" ref={salesDropdownRef}>
            <label htmlFor="search-sale" className="block text-gray-700 text-lg font-medium mb-2">Search Existing Sale</label>
            <input
              type="text"
              id="search-sale"
              value={searchSaleQuery}
              onChange={(e) => {
                setSearchSaleQuery(e.target.value);
                setIsSalesDropdownOpen(true);
              }}
              onFocus={() => setIsSalesDropdownOpen(true)}
              placeholder="Search by Party Name or Voucher No."
              className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              autoComplete="off"
            />
            {isSalesDropdownOpen && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-52 overflow-y-auto">
                {isLoadingSales ? (
                  <div className="p-3 text-gray-500">Loading sales...</div>
                ) : salesError ? (
                  <div className="p-3 text-red-600 font-italic">Error: {salesError}</div>
                ) : filteredSales.length === 0 ? (
                  <div className="p-3 text-gray-500 italic">No sales found.</div>
                ) : (
                  filteredSales.map(sale => (
                    <div
                      key={sale.id}
                      className="p-3 cursor-pointer border-b border-gray-200 last:border-b-0 hover:bg-gray-100"
                      onClick={() => handleSelectSale(sale)}
                    >
                      <p className="font-semibold">{sale.partyName} (Voucher: {sale.partyNumber || 'N/A'})</p>
                      <p className="text-sm text-gray-600">Total: ₹{sale.totalAmount.toFixed(2)}</p>
                    </div>
                  ))
                )}
          </div>
            )}
            {selectedSale && (
              <button
                onClick={handleClearSelectedSale}
                className="mt-2 w-full py-2 px-4 bg-red-500 text-white rounded-lg font-semibold shadow-sm transition hover:bg-red-600"
              >
                Clear Selected Sale
              </button>
            )}
          </div>

          {/* Date and Voucher No */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="return-date" className="block text-gray-700 text-lg font-medium mb-2">Date</label>
              <input
                type="date"
                id="return-date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>
            <div>
              <label htmlFor="voucher-no" className="block text-gray-700 text-lg font-medium mb-2">Voucher No.</label>
              <input
                type="text"
                id="voucher-no"
                value={voucherNo}
                onChange={(e) => setVoucherNo(e.target.value)}
                placeholder="Enter Voucher No."
                className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                readOnly={!!selectedSale}
              />
            </div>
          </div>

          {/* Sale Type */}
          <div className="mb-4">
            <label htmlFor="sale-type" className="block text-gray-700 text-lg font-medium mb-2">Sale Type</label>
            <select
              id="sale-type"
              value={saleType}
              onChange={(e) => setSaleType(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            >
              <option value="Cash Sale">Cash Sale</option>
              <option value="Credit Sale">Credit Sale</option>
            </select>
          </div>

          {/* Party Name */}
          <div className="mb-4">
            <label htmlFor="party-name" className="block text-gray-700 text-lg font-medium mb-2">Party</label>
            <input
              type="text"
              id="party-name"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder="Enter Party Name"
              className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              readOnly={!!selectedSale}
            />
          </div>

          {/* Items Section */}
          <h3 className="text-gray-700 text-xl font-semibold mt-6 mb-4">Items to Return</h3>
          <div className="flex flex-col gap-4 mb-6">
            {returnItems.map(item => (
              <div key={item.id} className="flex items-start justify-between p-4 bg-white rounded-lg shadow-sm border border-gray-200 relative">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="col-span-1">
                    <label className="block text-gray-600 text-sm font-medium mb-1">Item Name</label>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                      placeholder="e.g., T-Shirt"
                      className="w-full p-2 border border-gray-300 rounded-md text-base"
                      readOnly={!!selectedSale}
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-gray-600 text-sm font-medium mb-1">Qty</label>
                    <div className="flex items-center">
                      <button
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 text-gray-700 font-bold transition hover:bg-gray-300"
                        onClick={() => handleItemChange(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                        disabled={!!selectedSale}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 0)}
                        className="w-full text-center px-2 py-1 mx-2 border-b-2 border-gray-300 focus:outline-none focus:border-blue-500"
                        min="1"
                        readOnly={!!selectedSale}
                      />
                      <button
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 text-gray-700 font-bold transition hover:bg-gray-300"
                        onClick={() => handleItemChange(item.id, 'quantity', item.quantity + 1)}
                        disabled={!!selectedSale}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="col-span-1">
                    <label className="block text-gray-600 text-sm font-medium mb-1">Unit Price</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.unitPrice.toFixed(2)}
                      onChange={(e) => handleItemChange(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="w-full p-2 border border-gray-300 rounded-md text-base"
                      readOnly={!!selectedSale}
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-gray-600 text-sm font-medium mb-1">Amount</label>
                    <p className="text-lg font-semibold text-gray-800 mt-1">₹{item.amount.toFixed(2)}</p>
                  </div>
                </div>
                {returnItems.length > 1 && (
                  <button
                    onClick={() => handleRemoveItem(item.id)}
                    className="absolute top-2 right-2 text-2xl text-red-500 hover:text-red-700 transition"
                    title="Remove Item"
                    disabled={!!selectedSale}
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
            {!selectedSale && (
              <button onClick={handleAddItem} className="w-full py-3 px-6 bg-green-500 text-white rounded-lg font-semibold shadow-sm transition hover:bg-green-600">
                + Add Item
              </button>
            )}
          </div>

          {/* Total Return Amount */}
          <div className="flex justify-between items-center p-4 bg-gray-100 rounded-lg shadow-sm">
            <p className="text-lg font-medium text-gray-700">Total Return Amount</p>
            <p className="text-3xl font-bold text-gray-900">₹{totalReturnAmount.toFixed(2)}</p>
          </div>

          {/* Mode of Return */}
          <div className="mt-6 mb-4">
            <label htmlFor="mode-of-return" className="block text-gray-700 text-lg font-medium mb-2">Mode of Return</label>
            <select
              id="mode-of-return"
              value={modeOfReturn}
              onChange={(e) => setModeOfReturn(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            >
              <option value="Cash Refund">Cash Refund</option>
              <option value="Credit Note">Credit Note</option>
              <option value="Exchange">Exchange</option>
            </select>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-up flex justify-center items-center z-10 w-full box-border">
        <button
          onClick={handleSaveReturn}
          className="w-full max-w-xs py-3 px-6 bg-blue-600 text-white rounded-lg text-lg font-semibold shadow-md transition hover:bg-blue-700"
        >
          Save Return
        </button>
      </div>
    </div>
  );
};

export default SalesReturnPage;