// src/Pages/Payment.tsx
import { useState} from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; // Import useLocation
import './Payment.css'; // Import the CSS for this page

interface PaymentState {
  totalAmount?: string; // Optional, as it might not always be passed
}

const Payment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { totalAmount } = (location.state as PaymentState) || {}; // Get totalAmount from location state

  // State to hold selected payment modes and their entered amounts
  // Example: { 'cash': 100, 'card': 50 }
  const [selectedPayments, setSelectedPayments] = useState<{ [key: string]: number }>({});

  // Convert totalAmount to a number for calculations
  const payableAmount = parseFloat(totalAmount || '0');

  // Calculate total amount entered by the user across all selected modes
  const totalEnteredAmount = Object.values(selectedPayments).reduce((sum, amount) => sum + amount, 0);

  // Calculate remaining amount
  const remainingAmount = payableAmount - totalEnteredAmount;

  const transactionModes = [
    { id: 'cash', name: 'Cash', description: 'Pay with cash' },
    { id: 'card', name: 'Credit Card/ Debit Card', description: 'Pay with credit card/ Debit Card' },
    { id: 'upi', name: 'UPI', description: 'Pay with UPI' },
    { id: 'due', name: 'DUE', description: 'Pay Later' },
  ];

  // Handle checkbox change
  const handleModeToggle = (modeId: string, isChecked: boolean) => {
    setSelectedPayments(prev => {
      const newPayments = { ...prev };
      if (isChecked) {
        newPayments[modeId] = 0; // Initialize amount to 0 when selected
      } else {
        delete newPayments[modeId]; // Remove from state when deselected
      }
      return newPayments;
    });
  };

  // Handle amount input change for a specific mode
  const handleAmountChange = (modeId: string, amount: string) => {
    const numAmount = parseFloat(amount);
    setSelectedPayments(prev => ({
      ...prev,
      [modeId]: isNaN(numAmount) ? 0 : numAmount, // Store 0 if input is not a valid number
    }));
  };

  const handleConfirmPayment = () => {
    if (remainingAmount > 0) {
      alert(`Please enter the full amount. Remaining: ₹${remainingAmount.toFixed(2)}`);
      return;
    }
    if (remainingAmount < 0) {
      alert(`Amount entered exceeds total. Please adjust. Excess: ₹${Math.abs(remainingAmount).toFixed(2)}`);
      return;
    }
    if (Object.keys(selectedPayments).length === 0) {
      alert('Please select at least one payment mode.');
      return;
    }

    // Process payment
    const paymentDetails = Object.entries(selectedPayments).map(([mode, amount]) =>
      `${transactionModes.find(m => m.id === mode)?.name || mode}: ₹${amount.toFixed(2)}`
    ).join('\n');

    alert(`Payment Confirmed!
Total Payable: ₹${payableAmount.toFixed(2)}
Total Entered: ₹${totalEnteredAmount.toFixed(2)}
---
Payment Breakdown:
${paymentDetails}`);

    // In a real app, you would send this data to your backend
    // Then navigate to a success page or back to sales
    navigate('/sales-success'); // Example navigation
  };


  return (
    <div className="payment-page-wrapper">
      {/* Top Header */}
      <div className="payment-header">
        <button onClick={() => navigate(-1)} className="payment-back-button" aria-label="Go back">
          &larr;
        </button>
        <h1 className="payment-title">Transaction Details</h1>
        <div className="payment-header-spacer"></div>
      </div>

      {/* Main Content Area */}
      <div className="payment-content-area">
        <h2 className="payment-subtitle">Select Transaction Mode</h2>

        {/* Display Total Amount from Sales Page */}
        <div className="total-payable-section">
          <span className="total-payable-label">Total Payable:</span>
          <span className="total-payable-amount">₹{payableAmount.toFixed(2)}</span>
        </div>

        <div className="payment-modes-list">
          {transactionModes.map((mode) => (
            <div
              key={mode.id}
              className={`payment-mode-item ${selectedPayments[mode.id] !== undefined ? 'selected' : ''}`}
            >
              <div className="mode-text-content">
                <span className="mode-name">{mode.name}</span>
                <span className="mode-description">{mode.description}</span>
              </div>
              <div className="mode-input-group">
                <input
                  type="checkbox"
                  id={mode.id}
                  name="transactionMode"
                  checked={selectedPayments[mode.id] !== undefined}
                  onChange={(e) => handleModeToggle(mode.id, e.target.checked)}
                  className="mode-checkbox"
                />
                {selectedPayments[mode.id] !== undefined && ( // Conditionally render amount input
                  <input
                    type="number"
                    placeholder="Amount"
                    value={selectedPayments[mode.id] || ''} // Display 0 if not set, or empty
                    onChange={(e) => handleAmountChange(mode.id, e.target.value)}
                    className="mode-amount-input"
                    step="0.01" // Allow decimal amounts
                    min="0"
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Summary Section */}
        <div className="payment-summary">
          <div className="summary-row">
            <span>Total Entered:</span>
            <span className="summary-amount">₹{totalEnteredAmount.toFixed(2)}</span>
          </div>
          <div className="summary-row remaining-amount">
            <span>Remaining:</span>
            <span className={`summary-amount ${remainingAmount > 0 ? 'text-red' : 'text-green'}`}>
              ₹{remainingAmount.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Fixed Bottom Bar for Confirm Payment */}
      <div className="payment-bottom-bar">
        <button
          onClick={handleConfirmPayment}
          className="confirm-payment-button"
        >
          Confirm Payment
        </button>
      </div>
    </div>
  );
};

export default Payment;