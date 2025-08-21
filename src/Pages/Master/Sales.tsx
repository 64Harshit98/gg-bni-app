import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { getItems } from '../../lib/items_firebase';
import type { Item } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import { db } from '../../lib/firebase';
import { addDoc, collection, serverTimestamp, doc, updateDoc, increment as firebaseIncrement } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';

// --- Helper Types & Interfaces ---
interface SalesItem {
  id: string;
  name: string;
  mrp: number;
  quantity: number;
}

interface PaymentMode {
  id: 'cash' | 'card' | 'upi' | 'due';
  name: string;
  description: string;
}

interface PaymentDetails {
  [key: string]: number;
}

interface PaymentCompletionData {
  paymentDetails: PaymentDetails;
  partyName: string;
  partyNumber: string;
  discount: number;
}

// --- Reusable Modal Component ---
const Modal: React.FC<{
  message: string;
  onClose: () => void;
  type: 'success' | 'error' | 'info'; // Added info type
}> = ({ message, onClose, type }) => (
  <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm text-center">
      <div
        className={`mx-auto mb-4 w-12 h-12 rounded-full flex items-center justify-center ${type === 'success' ? 'bg-green-100' : type === 'error' ? 'bg-red-100' : 'bg-blue-100'
          }`}
      >
        {type === 'success' && <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>}
        {type === 'error' && <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>}
        {type === 'info' && <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
      </div>
      <p className="text-lg font-medium text-gray-800 mb-4">{message}</p>
      <button onClick={onClose} className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors">OK</button>
    </div>
  </div>
);

// --- Reusable Spinner Component ---
const Spinner: React.FC<{ size?: string }> = ({ size = 'h-5 w-5' }) => (
  <svg className={`animate-spin text-white ${size}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

// --- The Payment Drawer Component ---
interface PaymentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  onPaymentComplete: (completionData: PaymentCompletionData) => Promise<void>;
}

const PaymentDrawer: React.FC<PaymentDrawerProps> = ({ isOpen, onClose, subtotal, onPaymentComplete }) => {
  const [partyName, setPartyName] = useState('');
  const [partyNumber, setPartyNumber] = useState('');
  const [discount, setDiscount] = useState(0);
  const [selectedPayments, setSelectedPayments] = useState<PaymentDetails>({});
  const [modal, setModal] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDiscountLocked, setIsDiscountLocked] = useState(true);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const finalPayableAmount = useMemo(() => Math.max(0, subtotal - discount), [subtotal, discount]);
  const totalEnteredAmount = useMemo(() => Object.values(selectedPayments).reduce((sum, amount) => sum + amount, 0), [selectedPayments]);
  const remainingAmount = useMemo(() => finalPayableAmount - totalEnteredAmount, [finalPayableAmount, totalEnteredAmount]);

  const transactionModes: PaymentMode[] = [
    { id: 'cash', name: 'Cash', description: 'Pay with physical currency' },
    { id: 'card', name: 'Card', description: 'Credit or Debit Card' },
    { id: 'upi', name: 'UPI', description: 'Google Pay, PhonePe, etc.' },
    { id: 'due', name: 'Due', description: 'Record as an outstanding payment' },
  ];

  useEffect(() => {
    if (isOpen) {
      setSelectedPayments({ cash: finalPayableAmount });
    } else {
      setSelectedPayments({});
      setPartyName('');
      setPartyNumber('');
      setDiscount(0);
      setIsDiscountLocked(true);
    }
  }, [isOpen, finalPayableAmount]);

  const handleModeToggle = (modeId: string) => {
    setSelectedPayments(prev => {
      const newPayments = { ...prev };
      if (newPayments[modeId] !== undefined) {
        delete newPayments[modeId];
      } else {
        newPayments[modeId] = Object.keys(newPayments).length === 0 ? finalPayableAmount : 0;
      }
      return newPayments;
    });
  };

  const handleAmountChange = (modeId: string, amount: string) => {
    const numAmount = parseFloat(amount);
    setSelectedPayments(prev => ({ ...prev, [modeId]: isNaN(numAmount) ? 0 : numAmount }));
  };

  const handleFillRemaining = (modeId: string) => {
    const currentAmount = selectedPayments[modeId] || 0;
    handleAmountChange(modeId, (currentAmount + remainingAmount).toFixed(2));
  };

  const handleDiscountChange = (amount: string) => {
    const numAmount = parseFloat(amount);
    setDiscount(isNaN(numAmount) ? 0 : numAmount);
  };

  const handleConfirm = async () => {
    if (!partyName.trim()) {
      setModal({ message: 'Please enter a Party Name.', type: 'error' });
      return;
    }
    if (Object.keys(selectedPayments).length === 0) {
      setModal({ message: 'Please select a payment mode.', type: 'error' });
      return;
    }
    if (remainingAmount !== 0) {
      setModal({ message: `Amount mismatch. Remaining: ₹${remainingAmount.toFixed(2)}`, type: 'error' });
      return;
    }

    setIsSubmitting(true);
    try {
      await onPaymentComplete({ paymentDetails: selectedPayments, partyName, partyNumber, discount });
      setModal({ message: 'Payment saved successfully!', type: 'success' });
      setTimeout(() => {
        setModal(null);
        onClose();
      }, 1500);
    } catch (error) {
      console.error("Payment submission failed:", error);
      setModal({ message: 'Failed to save payment. Please try again.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };
  const handleDiscountPressStart = () => {
    longPressTimer.current = setTimeout(() => {
      setIsDiscountLocked(false);
    }, 500);
  };

  const handleDiscountPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleDiscountClick = () => {
    if (isDiscountLocked) {
      setModal({ message: "Long press to enable discount field.", type: 'info' });
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose}>
      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-50 rounded-t-2xl shadow-xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 sticky top-0 bg-gray-50 z-10 border-b">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-2"></div>
          <h2 className="text-xl font-bold text-center text-gray-800">Payment</h2>
        </div>

        <div className="overflow-y-auto p-3 space-y-3">
          <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
            <h3 className="font-semibold text-gray-800 text-sm">Customer Details</h3>
            <input type="text" placeholder="Party Name*" value={partyName} onChange={(e) => setPartyName(e.target.value)} className="w-full bg-gray-100 p-2 text-sm rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500" />
            <input type="text" placeholder="Party Number (Optional)" value={partyNumber} onChange={(e) => setPartyNumber(e.target.value)} className="w-full bg-gray-100 p-2 text-sm rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500" />
          </div>

          {/* --- Payment Modes Grid --- */}
          <div className="grid grid-cols-2 gap-2">
            {transactionModes.map((mode) => {
              const isSelected = selectedPayments[mode.id] !== undefined;
              return (
                <div key={mode.id}>
                  <div
                    onClick={() => handleModeToggle(mode.id)}
                    className={`p-3 rounded-lg shadow-sm cursor-pointer aspect-square flex flex-col items-center justify-center text-center transition-all duration-200
                                       ${isSelected ? 'bg-gray-600 text-white border-2 border-gray-700' : 'bg-white text-gray-800 border'}`}
                  >
                    <h3 className="font-semibold text-sm">{mode.name}</h3>
                    <p className={`text-xs mt-1 ${isSelected ? 'text-blue-200' : 'text-gray-500'}`}>{mode.description}</p>
                  </div>
                  {isSelected && (
                    <div className="mt-2 flex items-center gap-1">
                      <span className="font-bold text-gray-700">₹</span>
                      <input type="number" placeholder="0.00" value={selectedPayments[mode.id] || ''} onChange={(e) => handleAmountChange(mode.id, e.target.value)} className="flex-grow w-full bg-gray-100 p-1 text-sm rounded-lg border-gray-300 focus:ring-blue-500 focus:border-blue-500" />
                      {remainingAmount > 0 && <button onClick={() => handleFillRemaining(mode.id)} className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-1 rounded-full hover:bg-blue-200">Fill</button>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-4 mt-auto sticky bottom-0 bg-white border-t">
          <div className="flex justify-between items-center mb-2"><span className="text-sm text-gray-600">Subtotal:</span><span className="font-medium text-sm">₹{subtotal.toFixed(2)}</span></div>
          <div
            className="flex items-center justify-between mb-2 gap-2"
            onMouseDown={handleDiscountPressStart}
            onMouseUp={handleDiscountPressEnd}
            onTouchStart={handleDiscountPressStart}
            onTouchEnd={handleDiscountPressEnd}
            onClick={handleDiscountClick}
          >
            <label htmlFor="discount" className="text-sm text-gray-600">Discount:</label>
            <input id="discount" type="number" placeholder="0.00" value={discount || ''} onChange={(e) => handleDiscountChange(e.target.value)} readOnly={isDiscountLocked} className={`w-20 text-right bg-gray-100 p-1 text-sm rounded-md border-gray-300 focus:ring-blue-500 focus:border-blue-500 ${isDiscountLocked ? 'cursor-pointer' : ''}`} />
          </div>
          <div className="flex justify-between items-center mb-2 border-t pt-2"><span className="text-gray-800 font-semibold">Total Payable:</span><span className="font-bold text-lg text-blue-600">₹{finalPayableAmount.toFixed(2)}</span></div>
          <div className="flex justify-between items-center mb-3"><span className="text-gray-600">Remaining:</span><span className={`font-bold text-md ${remainingAmount === 0 ? 'text-green-600' : 'text-red-600'}`}>₹{remainingAmount.toFixed(2)}</span></div>
          <button onClick={handleConfirm} disabled={isSubmitting || remainingAmount !== 0} className="w-full flex items-center justify-center bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors disabled:bg-gray-400">
            {isSubmitting ? <Spinner /> : 'Confirm & Save Payment'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main Sales Page Component ---
const SalesPage1: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();


  // New state to manage feedback messages
  const [modal, setModal] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [items, setItems] = useState<SalesItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        setIsLoading(true);
        const fetchedItems = await getItems();
        setAvailableItems(fetchedItems);
      } catch (err) {
        setError('Failed to load items.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchItems();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const totalAmount = items.reduce((sum, item) => sum + item.mrp * item.quantity, 0);

  const handleQuantityChange = (id: string, delta: number) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item));
  };

  const handleDeleteItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleAddItemToCart = () => {
    if (!selectedItem) return;
    const itemToAdd = availableItems.find(item => item.id === selectedItem);
    if (itemToAdd) {
      const itemExists = items.find(item => item.id === itemToAdd.id);
      if (itemExists) {
        setItems(prev => prev.map(item => item.id === itemToAdd.id ? { ...item, quantity: item.quantity + 1 } : item));
      } else {
        setItems(prev => [...prev, { id: itemToAdd.id!, name: itemToAdd.name, mrp: itemToAdd.mrp, quantity: 1 }]);
      }
      setSelectedItem('');
      setSearchQuery('');
    }
  };

  const handleProceedToPayment = () => {
    if (items.length === 0) {
      alert('Please add at least one item to the cart.');
      return;
    }
    setIsDrawerOpen(true);
  };
  // New function to update item amount in Firestore
  const updateItemAmount = async (itemId: string, quantitySold: number) => {
    const itemRef = doc(db, "items", itemId);
    try {
      await updateDoc(itemRef, {
        amount: firebaseIncrement(-quantitySold)
      });
    } catch (error) {
      console.error(`Error updating item amount for ID: ${itemId}`, error);
      throw new Error(`Failed to update inventory for item ID: ${itemId}`);
    }
  };


  const handleSavePayment = async (completionData: PaymentCompletionData) => {
    if (!currentUser) throw new Error("User is not authenticated.");

    const { paymentDetails, partyName, partyNumber, discount } = completionData;


    // Check if enough stock is available before saving
    for (const item of items) {
      const availableItem = availableItems.find(i => i.id === item.id);
      if (availableItem && availableItem.amount < item.quantity) {
        throw new Error(`Not enough stock for item: ${item.name}. Available: ${availableItem.amount}, Requested: ${item.quantity}`);
      }
    }


    const saleData = {
      userId: currentUser.uid,
      partyName: partyName.trim(),
      partyNumber: partyNumber.trim(),
      items: items.map(({ id, name, mrp, quantity }) => ({ id, name, mrp, quantity })),
      subtotal: totalAmount,
      discount: discount,
      totalAmount: totalAmount - discount,
      paymentMethods: paymentDetails,
      createdAt: serverTimestamp(),
    };

    try {

      // 1. Save the sale to the 'sales' collection
      await addDoc(collection(db, "sales"), saleData);

      // 2. Update the amount of each sold item in the 'items' collection
      const updatePromises = items.map(item => updateItemAmount(item.id, item.quantity));
      await Promise.all(updatePromises);

      // Clear the cart and reset state after successful transaction

      setItems([]);
      setSelectedItem('');
      setSearchQuery('');
      setModal({ message: "Sale completed successfully!", type: 'success' });
    } catch (error) {
      console.error("Error saving sale to Firestore: ", error);

      setModal({ message: `Failed to save payment: ${error}`, type: 'error' });

      throw error;
    }
  };

  const filteredItems = availableItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (item: Item) => {
    setSelectedItem(item.id!);
    setSearchQuery(item.name);
    setIsDropdownOpen(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-white w-full">

      {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <button onClick={() => navigate(ROUTES.HOME)} className="text-2xl font-bold text-gray-600">&times;</button>
        <div className="flex-1 flex justify-center items-center gap-6">
          <NavLink to={`${ROUTES.MASTERS}/${ROUTES.SALES}`} className={({ isActive }) => `flex-1 text-center py-3 border-b-2 ${isActive ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-slate-500'}`}>Sales</NavLink>
          <NavLink to={`${ROUTES.MASTERS}/${ROUTES.SALES_RETURN}`} className={({ isActive }) => `flex-1 text-center py-3 border-b-2 ${isActive ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-slate-500'}`}>Sales Return</NavLink>
        </div>
        <div className="w-6"></div>
      </div>

      <div className="flex-grow p-4 bg-gray-50 w-full overflow-y-auto box-border">
        <div className="mb-6 relative" ref={dropdownRef}>
          <label className="block text-gray-700 text-sm font-medium mb-1">Search & Add Item</label>
          <div className="flex gap-2">
            <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setIsDropdownOpen(true); }} onFocus={() => setIsDropdownOpen(true)} placeholder="Search for an item..." className="flex-grow w-full p-3 border border-gray-300 rounded-md focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200" autoComplete="off" />
            <button onClick={handleAddItemToCart} className="bg-blue-600 text-white py-3 px-5 rounded-md font-semibold hover:bg-blue-700 disabled:bg-blue-300" disabled={!selectedItem}>Add</button>
          </div>
          {isDropdownOpen && (
            <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-52 overflow-y-auto">
              {isLoading ? <div className="p-3 text-gray-500">Loading...</div> :
                error ? <div className="p-3 text-red-600">{error}</div> :
                  filteredItems.length === 0 ? <div className="p-3 text-gray-500">No items found.</div> :
                    (filteredItems.map(item => (<div key={item.id} className="p-3 cursor-pointer border-b last:border-b-0 hover:bg-gray-100" onClick={() => handleSelect(item)}>{item.name}</div>)))
              }
            </div>
          )}
        </div>

        <h3 className="text-gray-700 text-lg font-medium mb-4">Cart</h3>
        <div className="flex flex-col gap-3 mb-6">
          {items.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-gray-100 rounded-lg">No items added.</div>
          ) : (
            items.map(item => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm border border-gray-200">
                <div>
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-gray-600">₹{item.mrp.toFixed(2)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 disabled:opacity-50" onClick={() => handleQuantityChange(item.id, -1)} disabled={item.quantity === 1}>-</button>
                  <span className="w-6 text-center font-semibold">{item.quantity}</span>
                  <button className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-200" onClick={() => handleQuantityChange(item.id, 1)}>+</button>
                  <button className="text-gray-500 hover:text-red-500" onClick={() => handleDeleteItem(item.id)} title="Remove item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t shadow-[0_-2px_5px_rgba(0,0,0,0.05)]">
        <div className="flex justify-between items-center mb-3">
          <p className="text-lg font-medium">Total Amount</p>
          <p className="text-2xl font-bold">₹{totalAmount.toFixed(2)}</p>
        </div>
        <button onClick={handleProceedToPayment} className="w-full bg-green-600 text-white p-3 rounded-lg text-lg font-semibold shadow-md hover:bg-green-700 disabled:opacity-50" disabled={items.length === 0}>
          Proceed to Payment
        </button>
      </div>

      <PaymentDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        subtotal={totalAmount}
        onPaymentComplete={handleSavePayment}
      />
    </div>
  );
};

export default SalesPage1;
