// src/Pages/Master/SalesPage1.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, NavLink} from 'react-router-dom';
import { getItems } from '../../lib/items_firebase';
import type { Item } from '../../constants/models';
import './Sales.css';
import { ROUTES } from '../../constants/routes.constants';

interface SalesItem {
  id: string;
  name: string;
  mrp: number;
  quantity: number;
}

const SalesPage1: React.FC = () => {
  const navigate = useNavigate();

  const [partyNumber, setPartyNumber] = useState<string>('');
  const [partyName, setPartyName] = useState<string>('');
  
  const [items, setItems] = useState<SalesItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>('');
  
  const [availableItems, setAvailableItems] = useState<Item[]>([]);
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false); // State to control dropdown visibility
  const dropdownRef = useRef<HTMLDivElement>(null); // Ref to handle clicks outside the dropdown

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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
  
  // Effect to handle clicks outside the dropdown to close it
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


  const totalAmount = items.reduce((sum, item) => sum + item.mrp * item.quantity, 0);

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
      // You might want to show an error message if no item is selected
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
                { id: itemToAdd.id!, name: itemToAdd.name, mrp: itemToAdd.mrp, quantity: 1 }
            ]);
        }
        setSelectedItem('');
        setSearchQuery('');
    }
  };


  const handleProceedToPayment = () => {
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
  
  // Filter items based on searchQuery
  const filteredItems = availableItems.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Handle selecting an item from the list
  const handleSelect = (item: Item) => {
    setSelectedItem(item.id!);
    setSearchQuery(item.name);
    setIsDropdownOpen(false); // Close dropdown after selection
  };

  const renderItemsContent = () => {
    if (items.length === 0) {
      return <div className="text-center py-8 text-gray-500">No items added to the list.</div>;
    }
    
    return (
      <div className="items-list-container">
        {items.map(item => (
          <div key={item.id} className="item-card">
            <div className="item-details">
              <div className="item-info">
                <p className="item-name">{item.name}</p>
                <p className="item-price">₹{item.mrp.toFixed(2)}</p>
              </div>
            </div>
            <div className="quantity-controls">
              <button
                className="quantity-button"
                onClick={() => handleQuantityChange(item.id, -1)}
                disabled={item.quantity === 1}
              >
                -
              </button>
              <span className="quantity-display">{item.quantity}</span>
              <button
                className="quantity-button"
                onClick={() => handleQuantityChange(item.id, 1)}
              >
                +
              </button>
              <button
                className="delete-button"
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
    <div className="sales-page-wrapper">
      <div className="sales-top-bar">
        <button onClick={() => navigate('/masters')} className="sales-close-button">
          &times;
        </button>
        <div className="sales-nav-links">
          <NavLink
            to={`${ROUTES.MASTERS}/${ROUTES.SALES}`}
            className={({ isActive }) => `sales-nav-link ${isActive ? 'active' : ''}`}
          >
            Sales
          </NavLink>
          <NavLink
            to={`${ROUTES.MASTERS}/${ROUTES.SALES_RETURN}`}
            className={({ isActive }) => `sales-nav-link ${isActive ? 'active' : ''}`}
          >
            Sales Return
          </NavLink>
        </div>
        <div style={{ width: '1.5rem' }}></div>
      </div>

      <div className="sales-content-area">
        {capturedImage && (
          <div className="captured-image-preview">
            <h3>Captured Image:</h3>
            <img src={capturedImage} alt="Captured" className="preview-image" />
            <button onClick={() => setCapturedImage(null)} className="clear-image-button">Clear Image</button>
          </div>
        )}

        <div className="section-heading-group">
          <label htmlFor="party-name" className="section-heading">Party Name</label>
          <input
            type="text"
            id="party-name"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            placeholder="Enter Party Name"
            className="party-name-input"
          />
        </div>

        <div className="section-heading-group">
          <label htmlFor="party-number" className="section-heading">Party Number</label>
          <input
            type="text"
            id="party-number"
            value={partyNumber}
            onChange={(e) => setPartyNumber(e.target.value)}
            placeholder="Enter Party Number"
            className="party-number-input"
          />
        </div>

        <h3 className="section-heading">Items</h3>
        {renderItemsContent()}
        <div className="item-add-form-group">
          <label className="item-add-label">Search & Add Item</label>
          <div className="item-dropdown-and-button" ref={dropdownRef}>
            {/* --- The Merged Search/Dropdown Input --- */}
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
              className="searchable-item-input"
              autoComplete="off"
            />
            {/* --- The Dropdown List (rendered conditionally) --- */}
            {isDropdownOpen && (
              <div className="dropdown-list">
                {isLoading ? (
                  <div className="dropdown-item">Loading items...</div>
                ) : error ? (
                  <div className="dropdown-item error">Error loading items.</div>
                ) : filteredItems.length === 0 ? (
                  <div className="dropdown-item no-results">No items found.</div>
                ) : (
                  filteredItems.map(item => (
                    <div 
                      key={item.id}
                      className="dropdown-item"
                      onClick={() => handleSelect(item)}
                    >
                      {item.name}
                    </div>
                  ))
                )}
              </div>
            )}
            {/* -------------------------------------------------- */}
            <button 
              onClick={handleAddItemToCart}
              className="add-to-cart-button"
              disabled={!selectedItem}
            >
              Add
            </button>
          </div>
        </div>

        <div className="total-amount-section">
          <p className="total-amount-label">Total Amount</p>
          <p className="total-amount-value">₹{totalAmount.toFixed(2)}</p>
        </div>
      </div>

      <div className="sales-bottom-bar">
        <input
          type="file"
          accept="image/*"
          capture="environment"
          ref={fileInputRef}
          onChange={handleFileCapture}
          style={{ display: 'none' }}
        />
        <button className="camera-button" onClick={triggerCameraInput}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </button>
        <button
          onClick={handleProceedToPayment}
          className="proceed-button"
        >
          Proceed to Payment
        </button>
      </div>
    </div>
  );
};

export default SalesPage1;