import React from 'react';
import { CustomButton } from './index'; // Adjust path to where CustomButton is exported
import { Variant } from '../enums';
import { IconChevronDown } from '../constants/Icons';

interface GenericBillFooterProps {
  // --- UI State ---
  isExpanded: boolean;
  onToggleExpand: () => void;

  // --- Data ---
  totalQuantity: number;
  subtotal: number;
  totalDiscount?: number;
  taxAmount?: number;
  taxLabel?: string; // e.g. "Tax (Exclusive)" or "Total Tax"
  roundingOffAmount?: number;
  finalAmount: number;

  // --- Configuration ---
  showTaxRow?: boolean;
  
  // --- Actions ---
  actionLabel: string;
  onActionClick: () => void;
  disableAction?: boolean;

  // --- Slots ---
  children?: React.ReactNode; // For extra content like Tax Selectors in Purchase
}

export const GenericBillFooter: React.FC<GenericBillFooterProps> = ({
  isExpanded,
  onToggleExpand,
  totalQuantity,
  subtotal,
  totalDiscount = 0,
  taxAmount = 0,
  taxLabel = 'Tax',
  roundingOffAmount = 0,
  finalAmount,
  showTaxRow = false,
  actionLabel,
  onActionClick,
  disableAction = false,
  children
}) => {
  return (
    <div className="flex-shrink-0 bg-white border-t border-gray-100 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] rounded-sm z-20 mb-10">
      
      {/* Optional Content (e.g. Tax Selector for Purchase) */}
      {children}

      {/* Toggle Header */}
      <div 
        onClick={onToggleExpand} 
        className="flex justify-between items-center px-5 py-2 cursor-pointer active:bg-gray-50 transition-colors rounded-t-2xl group border-b border-gray-100"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500 group-hover:text-gray-700">
            Bill Details
          </span>
          {/* Show Qty in header when collapsed for quick view */}
          {!isExpanded && (
             <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-medium">
               {totalQuantity} Items
             </span>
          )}
        </div>
        <div className={`transform transition-transform duration-300 text-gray-400 ${isExpanded ? '' : 'rotate-180'}`}>
          <IconChevronDown width={20} height={20} />
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-5 pb-2 space-y-2 text-sm animate-in slide-in-from-bottom-2 duration-200 pt-2">
          
          <div className="flex justify-between text-gray-600">
              <span>Subtotal</span> 
              <span className="font-medium">₹{subtotal.toFixed(2)}</span>
          </div>

          {totalDiscount > 0 && (
            <div className="flex justify-between text-green-600">
                <span>Discount</span> 
                <span className="font-medium">- ₹{totalDiscount.toFixed(2)}</span>
            </div>
          )}

          {showTaxRow && (
            <div className="flex justify-between text-blue-600">
              <span>{taxLabel}</span> 
              <span className="font-medium">+ ₹{taxAmount.toFixed(2)}</span>
            </div>
          )}

          {roundingOffAmount !== 0 && (
             <div className="flex justify-between text-xs text-gray-500">
               <span>Rounding Off</span> 
               <span>{roundingOffAmount > 0 ? '+' : ''}{roundingOffAmount.toFixed(2)}</span>
             </div>
          )}

          <div className="border-t border-dashed border-gray-200 pt-2 mt-2 flex justify-between text-gray-500 text-xs font-medium">
              <span>Total Quantity</span> 
              <span>{totalQuantity}</span>
          </div>
        </div>
      )}

      {/* Main Total & Action */}
      <div className="px-5 pb-5 pt-2">
        <div className="flex justify-between items-end mb-2">
          <span className="text-gray-500 text-sm font-medium pb-1">Grand Total</span>
          <span className="text-2xl font-extrabold text-gray-900 tracking-tight">
            ₹{finalAmount.toFixed(2)}
          </span>
        </div>

        <div className="w-full">
          <CustomButton 
            onClick={onActionClick} 
            variant={Variant.Payment} 
            className="w-full py-3.5 text-base font-bold shadow-lg shadow-blue-200 rounded-xl flex justify-center items-center active:scale-[0.98] transition-transform"
            disabled={disableAction}
          >
            {actionLabel}
          </CustomButton>
        </div>
      </div>
    </div>
  );
};