// src/Pages/PurchaseReturnPage.tsx

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavLink } from 'react-router-dom';
import { ROUTES } from '../../constants/routes.constants';  

const PurchaseReturnPage: React.FC = () => {
  const navigate = useNavigate();

  // State for form fields
  const [returnDate, setReturnDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [voucherNo, setVoucherNo] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('');
  const [modeOfReturn, setModeOfReturn] = useState<string>('Cash Refund');

  // State for items being returned
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
    const purchaseReturnData = {
      returnDate,
      voucherNo,
      supplierName,
      returnItems,
      totalReturnAmount: totalReturnAmount.toFixed(2),
      modeOfReturn,
    };
    console.log('Saving Purchase Return:', purchaseReturnData);
    // After saving, navigate back or to a confirmation page
    navigate(-1); // Go back to the previous page
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 bg-gray-100 min-h-screen rounded-lg shadow-inner">
      {/* Top Bar */}
      <div className="flex justify-between items-center bg-white p-4 rounded-t-lg shadow-sm">
        <button onClick={() => navigate(ROUTES.HOME)} className="text-xl text-gray-500 hover:text-gray-900 transition-colors">
          &times;
        </button>
        <div className="purchase-nav-links">
          {/* --- FIX: Use NavLink and its isActive prop for dynamic styling --- */}
          <NavLink
            to={`${ROUTES.MASTERS}/${ROUTES.PURCHASE}`}
            className={({ isActive }) => `purchase-nav-link ${isActive ? 'active' : ''} flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${
              isActive
                ? 'border-blue-600 font-semibold text-blue-600'
                : 'border-transparent text-slate-500'
          }`}
          >
            Purchase
          </NavLink>
          <NavLink
            to={`${ROUTES.MASTERS}/${ROUTES.PURCHASE_RETURN}`}
            className={({ isActive }) => `purchase-nav-link ${isActive ? 'active' : ''} flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${
              isActive
                ? 'border-blue-600 font-semibold text-blue-600'
                : 'border-transparent text-slate-500'
          }`}
          >
            Purchase Return
          </NavLink>
          {/* ------------------------------------------------------------------ */}
        </div>
        <div className="w-6 h-6"></div> {/* Spacer for symmetry */}
      </div>

      {/* Main Content Area */}
      <div className="bg-white p-6 rounded-b-lg shadow-md mt-4">
        {/* Date and Voucher No */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label htmlFor="return-date" className="block text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              id="return-date"
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2"
            />
          </div>
          <div>
            <label htmlFor="voucher-no" className="block text-sm font-medium text-gray-700">Voucher No.</label>
            <input
              type="text"
              id="voucher-no"
              value={voucherNo}
              onChange={(e) => setVoucherNo(e.target.value)}
              placeholder="Enter Voucher No."
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2"
            />
          </div>
        </div>

        {/* Supplier Name */}
        <div className="mb-6">
          <label htmlFor="supplier-name" className="block text-sm font-medium text-gray-700">Supplier</label>
          <input
            type="text"
            id="supplier-name"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            placeholder="Enter Supplier Name"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2"
          />
        </div>

        {/* Items Section */}
        <h3 className="text-xl font-bold text-gray-800 mb-4">Items to Return</h3>
        <div className="space-y-4 mb-6">
          {returnItems.map(item => (
            <div key={item.id} className="relative bg-gray-50 p-4 rounded-md shadow-sm border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <div className="md:col-span-1 lg:col-span-2">
                  <label htmlFor={`item-name-${item.id}`} className="block text-xs font-medium text-gray-500">Item Name</label>
                  <input
                    type="text"
                    id={`item-name-${item.id}`}
                    value={item.name}
                    onChange={(e) => handleItemChange(item.id, 'name', e.target.value)}
                    placeholder="e.g., Laptop"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm p-2"
                  />
                </div>
                <div>
                  <label htmlFor={`item-qty-${item.id}`} className="block text-xs font-medium text-gray-500">Qty</label>
                  <div className="flex items-center mt-1">
                    <button
                      type="button"
                      className="px-2 py-1 bg-gray-200 rounded-l-md hover:bg-gray-300 transition-colors"
                      onClick={() => handleItemChange(item.id, 'quantity', Math.max(1, item.quantity - 1))}
                    >
                      -
                    </button>
                    <input
                      type="number"
                      id={`item-qty-${item.id}`}
                      value={item.quantity}
                      onChange={(e) => handleItemChange(item.id, 'quantity', parseInt(e.target.value) || 0)}
                      className="w-full text-center border-t border-b border-gray-300 p-1"
                      min="1"
                    />
                    <button
                      type="button"
                      className="px-2 py-1 bg-gray-200 rounded-r-md hover:bg-gray-300 transition-colors"
                      onClick={() => handleItemChange(item.id, 'quantity', item.quantity + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label htmlFor={`unit-price-${item.id}`} className="block text-xs font-medium text-gray-500">Unit Price</label>
                  <input
                    type="number"
                    id={`unit-price-${item.id}`}
                    step="0.01"
                    value={item.unitPrice.toFixed(2)}
                    onChange={(e) => handleItemChange(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm sm:text-sm p-2"
                  />
                </div>
                <div className="md:col-span-1 lg:col-span-1">
                  <label className="block text-xs font-medium text-gray-500">Amount</label>
                  <p className="mt-1 block w-full p-2 font-semibold text-gray-900 bg-gray-200 rounded-md">₹{item.amount.toFixed(2)}</p>
                </div>
              </div>

              {returnItems.length > 1 && (
                <button
                  onClick={() => handleRemoveItem(item.id)}
                  className="absolute top-2 right-2 text-red-500 hover:text-red-700 transition-colors"
                  title="Remove Item"
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={handleAddItem} className="w-full py-2 text-sm font-semibold text-indigo-600 border border-dashed border-indigo-300 rounded-md hover:bg-indigo-50 transition-colors">
            + Add Item
          </button>
        </div>

        {/* Total Return Amount */}
        <div className="flex justify-between items-center py-4 border-t-2 border-gray-200 mt-6">
          <p className="text-lg font-bold text-gray-800">Total Return Amount</p>
          <p className="text-xl font-extrabold text-red-600">₹{totalReturnAmount.toFixed(2)}</p>
        </div>

        {/* Mode of Return */}
        <div className="mt-6">
          <label htmlFor="mode-of-return" className="block text-sm font-medium text-gray-700">Mode of Return</label>
          <select
            id="mode-of-return"
            value={modeOfReturn}
            onChange={(e) => setModeOfReturn(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2"
          >
            <option value="Cash Refund">Cash Refund</option>
            <option value="Credit Note">Credit Note</option>
            <option value="Exchange">Exchange</option>
          </select>
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="bg-white p-4 sticky bottom-0 left-0 right-0 shadow-lg mt-4 rounded-lg">
        <button
          onClick={handleSaveReturn}
          className="w-full py-3 px-4 font-bold rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Save Return
        </button>
      </div>
    </div>
  );
};

export default PurchaseReturnPage;
