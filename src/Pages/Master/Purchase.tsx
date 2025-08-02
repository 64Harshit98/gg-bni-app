// src/Pages/Master/Purchase.tsx
import React, { useState } from 'react';
import { useNavigate, NavLink} from 'react-router-dom'; // Import NavLink and useLocation
import './Purchase.css';
import { ROUTES } from '../../constants/routes.constants';

interface PurchaseItem {
  id: number;
  itemName: string;
  price: number;
  quantity: number;
}

const Purchase = () => {
  const navigate = useNavigate();
  const [partyName, setPartyName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [emailId, setEmailId] = useState('');
  const [gstin, setGstin] = useState('');
  
  const handleProceedToPayment = () => {
    navigate(`${ROUTES.MASTERS}/${ROUTES.PAYMENT}`, { state: { totalAmount: totalAmount.toFixed(2) } });
  };

  const [items, setItems] = useState<PurchaseItem[]>([
    { id: 1, itemName: '', price: 0, quantity: 1 },
  ]);
  const [nextItemId, setNextItemId] = useState(2);

  const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const handlePartyNameChange = (e: React.ChangeEvent<HTMLInputElement>) => setPartyName(e.target.value);
  const handleMobileNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => setMobileNumber(e.target.value);
  const handleEmailIdChange = (e: React.ChangeEvent<HTMLInputElement>) => setEmailId(e.target.value);
  const handleGstinChange = (e: React.ChangeEvent<HTMLInputElement>) => setGstin(e.target.value);

  const handleItemChange = (id: number, field: keyof PurchaseItem, value: string | number) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleQuantityChange = (id: number, delta: number) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
      )
    );
  };

  const handleAddItemRow = () => {
    setItems(prevItems => [...prevItems, { id: nextItemId, itemName: '', price: 0, quantity: 1 }]);
    setNextItemId(prevId => prevId + 1);
  };

  const handleRemoveItemRow = (id: number) => {
    setItems(prevItems => prevItems.filter(item => item.id !== id));
  };

  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    alert(`Saving Purchase:
      Party Name: ${partyName}
      Mobile: ${mobileNumber}
      Email: ${emailId}
      GSTIN: ${gstin}
      Items: ${JSON.stringify(items, null, 2)}
      Total Amount: ₹${totalAmount.toFixed(2)}`);
  };

  return (
    <div className="purchase-page-wrapper">
      {/* Top Bar for Purchase */}
      <div className="purchase-top-bar">
        <button onClick={() => navigate(-1)} className="purchase-close-button">
          &times;
        </button>
        <div className="purchase-nav-links">
          {/* --- FIX: Use NavLink and its isActive prop for dynamic styling --- */}
          <NavLink
            to={`${ROUTES.MASTERS}/${ROUTES.PURCHASE}`}
            className={({ isActive }) => `purchase-nav-link ${isActive ? 'active' : ''}`}
          >
            Purchase
          </NavLink>
          <NavLink
            to={`${ROUTES.MASTERS}/${ROUTES.PURCHASE_RETURN}`}
            className={({ isActive }) => `purchase-nav-link ${isActive ? 'active' : ''}`}
          >
            Purchase Return
          </NavLink>
          {/* ------------------------------------------------------------------ */}
        </div>
        <div style={{ width: '1.5rem' }}></div> {/* Spacer */}
      </div>

      {/* Main Content Area */}
      <div className="purchase-content-area">
        <form onSubmit={handleSavePurchase} className="purchase-form">
          {/* Party Details Section */}
          <h3 className="purchase-section-heading">Party Details</h3>
          <div className="form-section">
            <div className="purchase-form-group">
              <label htmlFor="partyName" className="purchase-label">Party Name</label>
              <input type="text" id="partyName" value={partyName} onChange={handlePartyNameChange} placeholder="Enter Party Name" className="purchase-input" required />
            </div>
            <div className="purchase-form-group">
              <label htmlFor="mobileNumber" className="purchase-label">Mobile Number</label>
              <input type="tel" id="mobileNumber" value={mobileNumber} onChange={handleMobileNumberChange} placeholder="Enter Mobile Number" className="purchase-input" />
            </div>
            <div className="purchase-form-group">
              <label htmlFor="emailId" className="purchase-label">Email Id</label>
              <input type="email" id="emailId" value={emailId} onChange={handleEmailIdChange} placeholder="Enter Email Id" className="purchase-input" />
            </div>
            <div className="purchase-form-group">
              <label htmlFor="gstin" className="purchase-label">GSTIN</label>
              <input type="text" id="gstin" value={gstin} onChange={handleGstinChange} placeholder="Enter GSTIN" className="purchase-input" />
            </div>
          </div>

          {/* Items Section */}
          <h3 className="purchase-section-heading">Items</h3>
          <div className="form-section">
            <div className="purchase-items-list">
              {items.map((item) => (
                <div key={item.id} className="purchase-item-row">
                  <div className="item-input-group">
                    <label htmlFor={`itemName-${item.id}`} className="purchase-label sr-only">Item Name</label>
                    <input
                      type="text"
                      id={`itemName-${item.id}`}
                      value={item.itemName}
                      onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                      placeholder="Item Name"
                      className="purchase-item-input item-name-input"
                      required
                    />
                  </div>
                  <div className="item-input-group">
                    <label htmlFor={`itemPrice-${item.id}`} className="purchase-label sr-only">Price</label>
                    <input
                      type="number"
                      id={`itemPrice-${item.id}`}
                      value={item.price === 0 ? '' : item.price}
                      onChange={(e) => handleItemChange(item.id, 'price', parseFloat(e.target.value) || 0)}
                      placeholder="Price"
                      className="purchase-item-input item-price-input"
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>
                  <div className="item-quantity-controls">
                    <button type="button" onClick={() => handleQuantityChange(item.id, -1)} className="purchase-quantity-button">-</button>
                    <span className="purchase-quantity-display">{item.quantity}</span>
                    <button type="button" onClick={() => handleQuantityChange(item.id, 1)} className="purchase-quantity-button">+</button>
                  </div>
                  {items.length > 1 && (
                    <button type="button" onClick={() => handleRemoveItemRow(item.id)} className="purchase-remove-item-button">
                      &times;
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={handleAddItemRow} className="purchase-add-item-button">
              + Add New Item
            </button>
          </div>

          {/* Total Amount Section */}
          <div className="purchase-total-amount-section">
            <p className="purchase-total-amount-label">Total Amount</p>
            <p className="purchase-total-amount-value">₹{totalAmount.toFixed(2)}</p>
          </div>

          {/* Fixed Bottom Bar for Save Purchase */}
          <div className="purchase-bottom-bar">
            <button className="purchase-save-button" onClick={handleProceedToPayment}>
              Proceed to Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Purchase;