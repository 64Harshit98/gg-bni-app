import React from 'react';

// --- INTERFACE ---
export interface InvoiceProps {
  // Invoice Specifics
  voucherId: string;
  invoiceDate: string;
  billedBy: string;
  terms: string;
  
  // Party (Customer) Details
  partyName: string;
  partyAddress: string;
  partyNumber?: string;
  
  // Company (Seller) Details
  companyName: string;
  companyAddress: string;
  companyEmail: string;
  companyContact: string;
  companyGstin: string;

  // Financials
  subtotal: number;
  discount: number; // Percentage
  finalAmount: number;
  paymentDetails: { [key: string]: number }; // e.g., { "Cash": 500 }
  
  // Items
  items: {
    name: string;
    quantity: number;
    mrp: number;
    gst?: number;
    hsnSac?: string;
    unit?: string;
    discount?: number; // Optional per-item discount
  }[];
}

const Invoice: React.FC<InvoiceProps> = (props) => {
  const {
    companyName, companyAddress, companyEmail, companyContact, companyGstin, terms,
    partyName, partyAddress, partyNumber, voucherId, invoiceDate, billedBy,
    discount, finalAmount, items, paymentDetails
  } = props;

  // Logic: Calculate discount amount based on the percentage provided
  const calculateDiscountAmount = (price: number, qty: number) => {
    const totalItemPrice = price * qty;
    return totalItemPrice * (discount / 100);
  };

  return (
    <div 
      id="invoice-bill" 
      className="bg-white shadow-2xl mx-auto flex flex-col font-sans"
      style={{ width: '210mm', minHeight: '297mm' }} // A4 Standard
    >
      {/* --- HEADER --- */}
      <header className="bg-[#0B2F4F] text-white py-6 text-center">
        <h1 className="text-4xl font-normal tracking-wide">{companyName}</h1>
      </header>

      <div className="p-10 flex-grow flex flex-col">
        
        {/* --- META INFO ROW --- */}
        <div className="flex justify-between items-start mb-10 text-gray-800">
          {/* LEFT: BILL TO */}
          <div className="w-1/2">
            <h2 className="text-xl font-bold mb-2 text-[#0B2F4F]">Bill To</h2>
            <p className="text-lg font-medium mb-1">NAME: {partyName}</p>
            <p className="text-sm text-gray-600 whitespace-pre-line leading-relaxed">
              {partyAddress}
            </p>
            {partyNumber && (
              <p className="text-sm text-gray-600 mt-1">
                Number: +91 - {partyNumber}
              </p>
            )}
          </div>

          {/* RIGHT: INVOICE DETAILS */}
          <div className="w-1/3 text-right">
            <div className="grid grid-cols-2 gap-y-2 items-center">
              <span className="text-gray-600 font-semibold text-left">Invoice No.</span>
              <span className="font-bold text-lg text-right text-gray-900">{voucherId}</span>
              
              <span className="text-gray-600 font-semibold text-left">Date</span>
              <span className="text-gray-900 text-right">{invoiceDate}</span>
              
              <span className="text-gray-600 font-semibold text-left">Billed By</span>
              <span className="text-gray-900 text-right">{billedBy}</span>
            </div>
          </div>
        </div>

        {/* --- TABLE --- */}
        <div className="mb-6 border border-gray-400">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#0B2F4F] font-bold border-b border-gray-400">
                <th className="py-3 px-2 border-r border-gray-400 text-center w-12">S. No.</th>
                <th className="py-3 px-2 border-r border-gray-400 text-left">Product</th>
                <th className="py-3 px-2 border-r border-gray-400 text-center w-20">HSN/SAC</th>
                <th className="py-3 px-2 border-r border-gray-400 text-center w-12">Qty.</th>
                <th className="py-3 px-2 border-r border-gray-400 text-center w-12">Unit</th>
                <th className="py-3 px-2 border-r border-gray-400 text-right w-20">List Price</th>
                <th className="py-3 px-2 border-r border-gray-400 text-right w-16">GST (%)</th>
                <th className="py-3 px-2 border-r border-gray-400 text-right w-20">Disc. Amt.</th>
                <th className="py-3 px-2 text-right w-24">Amount</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {items.map((item, index) => {
                const discountAmount = calculateDiscountAmount(item.mrp, item.quantity);
                const itemTotal = (item.mrp * item.quantity);
                
                return (
                  <tr key={index} className="border-b border-gray-300 last:border-b-0">
                    <td className="py-3 px-2 border-r border-gray-400 text-center">{index + 1}</td>
                    <td className="py-3 px-2 border-r border-gray-400 font-medium">{item.name}</td>
                    <td className="py-3 px-2 border-r border-gray-400 text-center">{item.hsnSac || 'N/A'}</td>
                    <td className="py-3 px-2 border-r border-gray-400 text-center">{item.quantity}</td>
                    <td className="py-3 px-2 border-r border-gray-400 text-center">{item.unit || 'Pcs'}</td>
                    <td className="py-3 px-2 border-r border-gray-400 text-right">{item.mrp.toFixed(2)}</td>
                    <td className="py-3 px-2 border-r border-gray-400 text-right">{item.gst ? `${item.gst}%` : '0%'}</td>
                    <td className="py-3 px-2 border-r border-gray-400 text-right">{discountAmount > 0 ? discountAmount.toFixed(2) : '-'}</td>
                    <td className="py-3 px-2 text-right font-semibold">{itemTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            {/* Grand Total Row */}
            <tfoot>
              <tr className="border-t border-gray-400">
                <td colSpan={8} className="py-3 px-4 text-right font-bold text-[#0B2F4F] text-base border-r border-gray-400">
                  GRAND TOTAL
                </td>
                <td className="py-3 px-2 text-right font-bold text-[#0B2F4F] text-base">
                  {finalAmount.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* --- PAYMENT & INFO SECTION --- */}
        <div className="flex justify-between mt-2 mb-8">
            
          {/* Payment Info (Left) */}
          <div className="w-1/2 pr-4">
            <h3 className="font-bold text-[#0B2F4F] text-sm mb-2 border-b border-gray-300 pb-1">Payment Information</h3>
            <div className="text-xs text-gray-700 space-y-1">
               {Object.entries(paymentDetails).length > 0 ? (
                 Object.entries(paymentDetails).map(([mode, amount]) => (
                    <div key={mode} className="flex justify-between w-64">
                        <span className="font-semibold capitalize">{mode}:</span>
                        <span>₹ {amount.toFixed(2)}</span>
                    </div>
                 ))
               ) : (
                 <p>Payment Status: Unpaid</p>
               )}
            </div>
          </div>

          {/* GSTIN (Right - Replaces Bank Details) */}
          <div className="w-1/2 pl-4 flex flex-col items-end">
             <h3 className="font-bold text-[#0B2F4F] text-sm mb-2 border-b border-gray-300 pb-1 w-64 text-right">Tax Information</h3>
             <div className="flex justify-between w-64 text-xs text-gray-700">
                <span className="font-semibold">GSTIN:</span>
                <span className="font-bold">{companyGstin}</span>
             </div>
          </div>
        </div>

        {/* --- TERMS & CONDITIONS --- */}
        <div className="mb-12">
          <h3 className="font-bold text-[#0B2F4F] text-sm mb-1">Terms & Conditions</h3>
          <p className="text-xs text-gray-500 leading-relaxed w-3/4">
            {terms}
          </p>
        </div>

        {/* --- SIGNATURE --- */}
        <div className="flex justify-end mt-auto">
           <div className="text-center">
              <div className="h-16"></div> {/* Space for signature */}
              <p className="text-xs font-bold text-gray-800 border-t border-gray-400 pt-2 px-4">
                 Authorised Sign
              </p>
           </div>
        </div>
      </div>

      {/* --- FOOTER --- */}
      <footer className="bg-[#0B2F4F] text-white py-4 px-10 text-xs flex justify-between items-center">
        <div className="text-left">
           <p className="font-bold mb-1">{companyAddress}</p>
           <p>Contact: {companyContact}</p>
        </div>
        <div className="text-right">
           <p className="mb-1">{companyEmail}</p>
           <p className="opacity-80">Generated through SELLAR</p>
        </div>
      </footer>

    </div>
  );
};

export default Invoice;