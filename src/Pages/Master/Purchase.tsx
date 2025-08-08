import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import { getItems } from '../../lib/items_firebase'; // Assuming this fetches items from Firestore
import type { Item } from '../../constants/models'; // Assuming your Item type is here
import { ROUTES } from '../../constants/routes.constants';
import { db } from '../../lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../context/Authcontext';
import './Purchase.css';

// Interface for items added to the purchase list
interface PurchaseItem {
  id: string;
  name: string;
  purchasePrice: number; // Use purchasePrice for purchases
  quantity: number;
}

const PurchasePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  
  const [activeTab, setActiveTab] = useState('Purchase'); // State for active tab in top nav

  const [partyNumber, setPartyNumber] = useState<string>('');
  const [partyName, setPartyName] = useState<string>('');
  
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>('');
  
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        setIsLoading(true);
        const fetchedItems = await getItems();
        setAvailableItems(fetchedItems);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch items:', err);
        setError('Failed to load items. Please try again later.');
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
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownRef]);


  const totalAmount = items.reduce((sum, item) => sum + item.purchasePrice * item.quantity, 0);

  const handleQuantityChange = (id: string, delta: number) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === id
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  };
  
  const handleDeleteItem = (id: string) => {
    setItems(prevItems => prevItems.filter(item => item.id !== id));
  };
  
  const handleAddItemToCart = () => {
    if (!selectedItem) {
      return;
    }
    
    const itemToAdd = availableItems.find(item => item.id === selectedItem);

    if (itemToAdd) {
        const itemExists = items.find(item => item.id === itemToAdd.id);
        
        if (itemExists) {
            setItems(prevItems =>
                prevItems.map(item =>
                    item.id === itemToAdd.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                )
            );
        } else {
            setItems(prevItems => [
                ...prevItems,
                { id: itemToAdd.id!, name: itemToAdd.name, purchasePrice: itemToAdd.purchasePrice, quantity: 1 }
            ]);
        }
        setSelectedItem('');
        setSearchQuery('');
    }
  };

  const handleSavePurchase = async () => {
    if (!currentUser) {
      alert('You must be logged in to save a purchase.');
      navigate(ROUTES.LOGIN);
      return;
    }

    if (!partyName.trim() || items.length === 0) {
      alert('Please enter a Party Name and add at least one item to the list.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const purchaseData = {
        userId: currentUser.uid,
        partyName: partyName.trim(),
        partyNumber: partyNumber.trim(),
        items: items,
        totalAmount: totalAmount,
        capturedImage: capturedImage,
        createdAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, 'purchases'), purchaseData);
      console.log('Purchase successfully saved with ID:', docRef.id);
      
      alert('Purchase recorded successfully!');

      setPartyName('');
      setPartyNumber('');
      setItems([]);
      setCapturedImage(null);
      setSelectedItem('');

    } catch (err) {
      console.error('Error saving purchase:', err);
      setError('Failed to save purchase. Please try again.');
      alert('Failed to save purchase. Please check the console for details.');
    } finally {
      setIsSaving(false);
    }
  };


  const handleProceedToPayment = () => {
    handleSavePurchase();
    // This navigation is for consistency, you might not have a separate payment flow for purchases
    navigate(`${ROUTES.MASTERS}/${ROUTES.PAYMENT}`, { state: { totalAmount: totalAmount.toFixed(2) } });
  };
  
  const triggerCameraInput = () => {
    fileInputRef.current?.click();
  };

  const handleFileCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
      console.log("Captured file:", file.name, file.type, file.size);
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

  const renderItemsContent = () => {
    if (items.length === 0) {
      return <div className="text-center py-8 text-gray-500">No items added to the list.</div>;
    }
    
    return (
      <div className="flex flex-col gap-4 mb-6">
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm border border-gray-100">
            <div className="flex flex-col">
              <p className="text-gray-800 font-medium">{item.name}</p>
              <p className="text-gray-600 text-sm">₹{item.purchasePrice.toFixed(2)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-700 text-lg font-bold border-none cursor-pointer transition duration-200 ease-in-out hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => handleQuantityChange(item.id, -1)}
                disabled={item.quantity === 1}
              >
                -
              </button>
              <span className="text-gray-800 font-semibold w-6 text-center">{item.quantity}</span>
              <button
                className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-700 text-lg font-bold border-none cursor-pointer transition duration-200 ease-in-out hover:bg-gray-300"
                onClick={() => handleQuantityChange(item.id, 1)}
              >
                +
              </button>
              <button
                className="text-gray-600 hover:text-red-500 transition-colors duration-200"
                onClick={() => handleDeleteItem(item.id)}
                title="Remove item"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <div className="flex flex-col min-h-screen bg-white w-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-1000">
        <button onClick={() => navigate(ROUTES.HOME)} className="text-2xl font-bold text-gray-600 bg-transparent border-none cursor-pointer p-1">
          &times;
        </button>
        <div className="flex-1 flex justify-center items-center gap-6">
          <NavLink
            to={`${ROUTES.MASTERS}/${ROUTES.PURCHASE}`}
            className={`flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${
              activeTab === 'Purchase'
                ? 'border-blue-600 font-semibold text-blue-600'
                : 'border-transparent text-slate-500'
            }`}
            onClick={() => setActiveTab('Purchase')}
          >
            Purchase
          </NavLink>
          <NavLink
            to={`${ROUTES.MASTERS}/${ROUTES.PURCHASE_RETURN}`}
            className={`flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${
              activeTab === 'Purchase Return'
                ? 'border-blue-600 font-semibold text-blue-600'
                : 'border-transparent text-slate-500'
            }`}
            onClick={() => setActiveTab('Purchase Return')}
          >
            Purchase Return
          </NavLink>
        </div>
        <div className="w-6"></div> {/* Spacer to balance the close button */}
      </div>

      {/* Main Content Area */}
      <div className="flex-grow p-4 bg-white w-full overflow-y-auto box-border">
        {capturedImage && (
          <div className="mb-4 text-center p-4 bg-gray-50 rounded-lg shadow-sm border border-gray-200">
            <h3 className="mt-0 text-gray-700 text-base font-semibold mb-3">Captured Image:</h3>
            <img src={capturedImage} alt="Captured" className="max-w-full h-auto rounded mt-2 shadow-sm block mx-auto" />
            <button onClick={() => setCapturedImage(null)} className="bg-red-600 text-white border-none rounded-md px-4 py-2 mt-4 cursor-pointer text-sm transition duration-200 ease-in-out hover:bg-red-700">
              Clear Image
            </button>
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="party-name" className="block text-gray-700 text-lg font-medium mb-2">Party Name</label>
          <input
            type="text"
            id="party-name"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            placeholder="Enter Party Name"
            className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="party-number" className="block text-gray-700 text-lg font-medium mb-2">Party Number</label>
          <input
            type="text"
            id="party-number"
            value={partyNumber}
            onChange={(e) => setPartyNumber(e.target.value)}
            placeholder="Enter Party Number"
            className="w-full p-3 border border-gray-300 rounded-lg bg-blue-50 text-gray-800 text-base pl-4 box-border placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
          />
        </div>

        <h3 className="text-gray-700 text-lg font-medium mb-4">Items</h3>
        {renderItemsContent()}
        <div className="mb-4 relative" ref={dropdownRef}>
          <label className="block text-gray-700 text-lg font-medium mb-2">Search & Add Item</label>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              id="searchable-item-input"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onFocus={() => setIsDropdownOpen(true)}
              placeholder="Search for an item..."
              className="w-full p-3 border border-gray-300 rounded-md text-base box-border transition duration-200 ease-in-out focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
              autoComplete="off"
            />
            {isDropdownOpen && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-52 overflow-y-auto">
                {isLoading ? (
                  <div className="p-3 text-gray-500">Loading items...</div>
                ) : error ? (
                  <div className="p-3 text-red-600 font-italic">Error loading items.</div>
                ) : filteredItems.length === 0 ? (
                  <div className="p-3 text-gray-500 italic">No items found.</div>
                ) : (
                  filteredItems.map(item => (
                    <div 
                      key={item.id}
                      className="p-3 cursor-pointer border-b border-gray-200 last:border-b-0 hover:bg-gray-100"
                      onClick={() => handleSelect(item)}
                    >
                      {item.name}
                    </div>
                  ))
                )}
              </div>
            )}
            <button 
              onClick={handleAddItemToCart}
              className="bg-green-600 text-white py-3 px-6 rounded-md text-base font-semibold whitespace-nowrap transition duration-200 ease-in-out hover:bg-green-700 disabled:bg-green-300 disabled:cursor-not-allowed"
              disabled={!selectedItem}
            >
              Add
            </button>
          </div>
        </div>

        <div className="mb-6 flex justify-between items-center p-4 bg-gray-50 rounded-lg shadow-sm">
          <p className="text-gray-700 text-lg font-medium">Total Amount</p>
          <p className="text-gray-900 text-3xl font-bold">₹{totalAmount.toFixed(2)}</p>
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-up flex justify-end items-center z-10 w-full box-border">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={fileInputRef}
          onChange={handleFileCapture}
          className="hidden"
        />
        <button className="bg-blue-100 text-blue-600 p-3 rounded-full mr-4 shadow-md border-none cursor-pointer flex items-center justify-center transition duration-200 ease-in-out hover:bg-blue-200">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </button>
        <button
          onClick={handleProceedToPayment}
          className="w-full max-w-xs bg-blue-600 text-white p-3 rounded-lg text-lg font-semibold shadow-md border-none cursor-pointer transition duration-200 ease-in-out hover:bg-blue-700"
        >
          Proceed to Payment
        </button>
      </div>
    </div>
  );
};

export default PurchasePage;