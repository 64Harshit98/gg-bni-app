import React from 'react';

interface ReturnSummaryPanelProps {
  modeOfReturn: string;
  onModeChange: (mode: string) => void;
  totalReturnGross: number;
  totalExchangeValue: number;
  finalBalance: number;
  discountDeducted: number;
  onProcess: () => void;
  exchangeItemsCount: number;
  /** If true, renders the compact inline version used on mobile */
  isMobile?: boolean;
}

const MODES = ['Credit Note', 'Exchange', 'Cash Refund'];

const getBalanceLabel = (modeOfReturn: string, finalBalance: number): string => {
  if (finalBalance < 0) return 'Payment Due';
  if (modeOfReturn === 'Cash Refund') return 'Refund Amount';
  return 'Credit Due';
};

export const ReturnSummaryPanel: React.FC<ReturnSummaryPanelProps> = ({
  modeOfReturn, onModeChange,
  totalReturnGross, totalExchangeValue, finalBalance, discountDeducted,
  onProcess, exchangeItemsCount, isMobile = false,
}) => {
  const balanceLabel = getBalanceLabel(modeOfReturn, finalBalance);
  const balanceColour = finalBalance >= 0 ? 'text-[#F97316]' : 'text-red-600';
  const isProcessDisabled = modeOfReturn === 'Exchange' && exchangeItemsCount === 0;

  if (isMobile) {
    return (
      <div className="bg-white p-2 rounded-sm shadow-md">
        <div className="flex justify-between items-center text-sm text-[#F97316]">
          <p>Return Values</p><p className="font-medium">₹{totalReturnGross.toFixed(2)}</p>
        </div>
        {discountDeducted > 0 && (
          <div className="flex justify-between items-center text-xs text-red-600 mt-1">
            <p>Less Bill Discount</p><p>- ₹{discountDeducted.toFixed(2)}</p>
          </div>
        )}
        {modeOfReturn === 'Exchange' && (
          <div className="flex justify-between items-center text-sm text-[#F97316] mt-1">
            <p>Exchange Value</p><p className="font-medium">₹{totalExchangeValue.toFixed(2)}</p>
          </div>
        )}
        <div className="border-t border-gray-200 my-2" />
        <div className={`flex justify-between items-center text-lg font-bold ${balanceColour}`}>
          <p>{balanceLabel}</p><p>₹{Math.abs(finalBalance).toFixed(2)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-xl font-bold text-gray-800 mb-6 border-b pb-2">Return Summary</h2>

      {/* Transaction Type */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-600 mb-2">Transaction Type</label>
        <select
          value={modeOfReturn}
          onChange={e => onModeChange(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-sm bg-gray-50 focus:ring-2 focus:ring-[#F97316] outline-none"
        >
          {MODES.map(m => <option key={m}>{m}</option>)}
        </select>
      </div>

      {/* Financials */}
      <div className="space-y-4 text-sm text-gray-700 bg-gray-50 p-4 rounded-sm border border-gray-100 flex-grow">
        <div className="flex justify-between">
          <span>Return Sale Amount</span>
          <span className="font-medium">₹{totalReturnGross.toFixed(2)}</span>
        </div>
        {discountDeducted > 0 && (
          <div className="flex justify-between text-red-500">
            <span>Less: Proportional Discount</span>
            <span>- ₹{discountDeducted.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-semibold border-t border-gray-200 pt-2">
          <span>Net Return Value</span>
          <span>₹{(totalReturnGross - discountDeducted).toFixed(2)}</span>
        </div>
        {modeOfReturn === 'Exchange' && (
          <div className="flex justify-between text-[#F97316] mt-2">
            <span>Less: New Items Value</span>
            <span>- ₹{totalExchangeValue.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Final Total + CTA */}
      <div className="mt-auto pt-4 border-t border-gray-100">
        <div className="flex justify-between items-end mb-4">
          <span className="text-gray-500 font-medium">{balanceLabel}</span>
          <span className={`text-3xl font-bold ${balanceColour}`}>
            ₹{Math.abs(finalBalance).toFixed(2)}
          </span>
        </div>
        <button
          onClick={onProcess}
          className={`w-full py-4 px-4 rounded-sm text-lg font-bold transition-all ${
            isProcessDisabled
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-[#F97316] hover:bg-orange-600 text-white'
          }`}
        >
          Process Transaction
        </button>
      </div>
    </div>
  );
};

export { getBalanceLabel };
