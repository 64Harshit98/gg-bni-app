// src/Pages/Master/SalesReturnPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './SalesReturn.css'; // Dedicated CSS for Sales Return

const SalesReturn = () => {
  const navigate = useNavigate();

  // State for form fields
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]); // Default to today's date
  const [voucherNo, setVoucherNo] = useState<string>('');
  const [saleType, setSaleType] = useState<string>('Cash Sale'); // Default sale type
  const [partyName, setPartyName] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Cash Refund'); // Default mode of return

  // State for items being returned (can add multiple items)
  const [returnItems, setReturnItems] = useState([
    { id: 1, name: '', quantity: 1, unitPrice: 0.00, amount: 0.00 },
  ]);

  // Function to add a new item row
  const handleAddItem = () => {
    setReturnItems(prevItems => [
      ...prevItems,
      { id: prevItems.length + 1, name: '', quantity: 1, unitPrice: 0.00, amount: 0.00 },
    ]);
  };

  // Function to remove an item row
  const handleRemoveItem = (id: number) => {
    setReturnItems(prevItems => prevItems.filter(item => item.id !== id));
  };

  // Handler for item name, quantity, or unit price changes
  const handleItemChange = (id: number, field: string, value: string | number) => {
    setReturnItems(prevItems =>
      prevItems.map(item => {
        if (item.id === id) {
          const updatedItem = { ...item, [field]: value };
          // Recalculate amount if quantity or unitPrice changes
          if (field === 'quantity' || field === 'unitPrice') {
            updatedItem.amount = updatedItem.quantity * updatedItem.unitPrice;
          }
          return updatedItem;
        }
        return item;
      })
    );
  };

  // Calculate total return amount
  const totalReturnAmount = returnItems.reduce((sum, item) => sum + item.amount, 0);

  const handleSaveReturn = () => {
    // In a real application, you would send this data to your backend
    const salesReturnData = {
      returnDate,
      voucherNo,
      saleType,
      partyName,
      returnItems,
      totalReturnAmount: totalReturnAmount.toFixed(2),
      modeOfReturn,
    };
    console.log('Saving Sales Return:', salesReturnData);
    // After saving, navigate back or to a confirmation page
    navigate(-1); // Go back to the previous page
  };

  return (
    <div className="sales-return-page-wrapper">
      {/* Top Bar */}
      <div className="sales-return-top-bar">
        <button onClick={() => navigate(-1)} className="sales-return-close-button">
          &times;
        </button>
        <h2 className="sales-return-title">Sales Return</h2>
        <div style={{ width: '1.5rem' }}></div> {/* Spacer for symmetry */}
      </div>

      {/* Main Content Area */}
      <div className="sales-return-content-area">
        {/* Date and Voucher No */}
        <div className="sales-return-field-group">
          <label htmlFor="return-date" className="sales-return-label">Date</label>
          <input
            type="date"
            id="return-date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            className="sales-return-input"
          />
        </div>

        <div className="sales-return-field-group">
          <label htmlFor="voucher-no" className="sales-return-label">Voucher No.</label>
          <input
            type="text"
            id="voucher-no"
            value={voucherNo}
            onChange={(e) => setVoucherNo(e.target.value)}
            placeholder="Enter Voucher No."
            className="sales-return-input"
          />
        </div>

        {/* Sale Type */}
        <div className="sales-return-field-group">
          <label htmlFor="sale-type" className="sales-return-label">Sale Type</label>
          <select
            id="sale-type"
            value={saleType}
            onChange={(e) => setSaleType(e.target.value)}
            className="sales-return-select"
          >
            <option value="Cash Sale">Cash Sale</option>
            <option value="Credit Sale">Credit Sale</option>
          </select>
        </div>

        {/* Party Name */}
        <div className="sales-return-field-group">
          <label htmlFor="party-name" className="sales-return-label">Party</label>
          <input
            type="text"
            id="party-name"
            value={partyName}
            onChange={(e) => setPartyName(e.target.value)}
            placeholder="Enter Party Name"
            className="sales-return-input"
          />
        </div>

        {/* Items Section */}
        <h3 className="sales-return-section-heading">Items to Return</h3>
        <div className="sales-return-items-list-container">
          {returnItems.map(item => (
            <div key={item.id} className="sales-return-item-card">
              <div className="sales-return-item-details">
                <div className="sales-return-item-field">
                  <label className="sales-return-item-label">Item Name</label>
                  <input
                    type="text"
                    value={item.name}
                    onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                    placeholder="e.g., T-Shirt"
                    className="sales-return-item-input"
                  />
                </div>

                <div className="sales-return-item-field sales-return-quantity-field">
                  <label className="sales-return-item-label">Qty</label>
                  <div className="sales-return-quantity-controls">
                    <button
                      className="sales-return-quantity-button"
                      onClick={() => handleItemChange(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 0)}
                      className="sales-return-quantity-display"
                      min="1"
                    />
                    <button
                      className="sales-return-quantity-button"
                      onClick={() => handleItemChange(item.id, 'quantity', item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="sales-return-item-field sales-return-price-field">
                  <label className="sales-return-item-label">Unit Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={item.unitPrice.toFixed(2)}
                    onChange={(e) => handleItemChange(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="sales-return-item-input"
                  />
                </div>

                <div className="sales-return-item-field sales-return-amount-field">
                  <label className="sales-return-item-label">Amount</label>
                  <p className="sales-return-item-amount">₹{item.amount.toFixed(2)}</p>
                </div>
              </div>
              {returnItems.length > 1 && (
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="sales-return-remove-item-button"
                  title="Remove Item"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button onClick={handleAddItem} className="sales-return-add-item-button">
            + Add Item
          </button>
        </div>

        {/* Total Return Amount */}
        <div className="sales-return-total-amount-section">
          <p className="sales-return-total-amount-label">Total Return Amount</p>
          <p className="sales-return-total-amount-value">₹{totalReturnAmount.toFixed(2)}</p>
        </div>

        {/* Mode of Return */}
        <div className="sales-return-field-group">
          <label htmlFor="mode-of-return" className="sales-return-label">Mode of Return</label>
          <select
            id="mode-of-return"
            value={modeOfReturn}
            onChange={(e) => setModeOfReturn(e.target.value)}
            className="sales-return-select"
          >
            <option value="Cash Refund">Cash Refund</option>
            <option value="Credit Note">Credit Note</option>
            <option value="Exchange">Exchange</option>
          </select>
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="sales-return-bottom-bar">
        <button
          onClick={handleSaveReturn}
          className="sales-return-save-button"
        >
          Save Return
        </button>
      </div>
    </div>
  );
};

export default SalesReturn;
