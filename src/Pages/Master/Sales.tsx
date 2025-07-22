// src/Pages/Master/Sales.tsx (or SalesPage1.tsx)
import React, { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom'; // Added Link for navigation
import './Sales.css';

const SalesPage1 = () => {
  const navigate = useNavigate();
  const [partyNumber, setPartyNumber] = useState('');
  const [partyName, setPartyName] = useState('');
  const [items, setItems] = useState([
    { id: 1, name: 'T-Shirt', price: 1200.00, quantity: 1 },
    { id: 2, name: 'Hoodie', price: 1500.00, quantity: 1 },
    { id: 3, name: 'Hat', price: 1000.00, quantity: 1 },
    { id: 4, name: 'Jacket', price: 2000.00, quantity: 1 },
  ]);

  // State to hold the captured image file or data URL for preview
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref for the hidden file input

  // Calculate total amount
  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleQuantityChange = (id: number, delta: number) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.id === id
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item
      )
    );
  };

  const handleProceedToPayment = () => {
    // In a real app, you might include capturedImage data here
    // FIX: Changed navigation path to '/masters/payment'
    navigate('/masters/payment', { state: { totalAmount: totalAmount.toFixed(2) } });
  };

  // Function to trigger the hidden file input
  const triggerCameraInput = () => {
    fileInputRef.current?.click();
  };

  // Handler for when a file is selected (either from camera or gallery)
  const handleFileCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // You can now process this 'file' object
      // For demonstration, let's create a URL to display the image
      const reader = new FileReader();
      reader.onloadend = () => {
        setCapturedImage(reader.result as string);
      };
      reader.readAsDataURL(file); // Read file as Data URL for preview

      console.log("Captured file:", file.name, file.type, file.size);
      // In a real application, you would typically upload this file to a server
      // or save its reference for further processing.
    }
  };

  return (
    <div className="sales-page-wrapper">
      {/* Top Bar */}
      <div className="sales-top-bar">
        <button onClick={() => navigate(-1)} className="sales-close-button">
          &times;
        </button>
        {/* Links for Sales and Sales Return */}
        <div className="sales-nav-links">
          <Link to="/masters/sales" className="sales-nav-link active">
            Sales
          </Link>
          <Link to="/masters/sales-return" className="sales-nav-link">
            Sales Return
          </Link>
        </div>
        <div style={{ width: '1.5rem' }}></div> {/* Spacer for symmetry */}
      </div>

      {/* Main Content Area */}
      <div className="sales-content-area">
        {/* Display captured image preview if available */}
        {capturedImage && (
          <div className="captured-image-preview">
            <h3>Captured Image:</h3>
            <img src={capturedImage} alt="Captured" className="preview-image" />
            <button onClick={() => setCapturedImage(null)} className="clear-image-button">Clear Image</button>
          </div>
        )}

        {/* Party Name Section */}
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

        {/* Party Number Section */}
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

        {/* Items Section */}
        <h3 className="section-heading">Items</h3>
        <div className="items-list-container">
          {items.map(item => (
            <div key={item.id} className="item-card">
              <div className="item-details">
                <div className="item-info">
                  <p className="item-name">{item.name}</p>
                  <p className="item-price">₹{item.price.toFixed(2)}</p>
                </div>
              </div>
              <div className="quantity-controls">
                <button
                  className="quantity-button"
                  onClick={() => handleQuantityChange(item.id, -1)}
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
              </div>
            </div>
          ))}
        </div>

        {/* Total Amount Section */}
        <div className="total-amount-section">
          <p className="total-amount-label">Total Amount</p>
          <p className="total-amount-value">₹{totalAmount.toFixed(2)}</p>
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="sales-bottom-bar">
        {/* Hidden file input */}
        <input
          type="file"
          accept="image/*" // Accept all image types
          capture="environment" // Suggest using the rear camera (use "user" for front camera)
          ref={fileInputRef}
          onChange={handleFileCapture}
          style={{ display: 'none' }} // Hide the actual input
        />
        {/* Camera Button - now acts as a label for the hidden input */}
        <button className="camera-button" onClick={triggerCameraInput}>
          {/* SVG for camera icon */}
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