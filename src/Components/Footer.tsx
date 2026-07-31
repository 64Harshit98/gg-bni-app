import React from 'react';
import { CustomButton } from './index';
import { Variant } from '../enums';
import { IconChevronDown } from '../constants/Icons';

interface GenericBillFooterProps {
  isExpanded: boolean;
  onToggleExpand: () => void;
  totalQuantity: number;
  subtotal: number;
  totalDiscount?: number;
  taxAmount?: number;
  taxLabel?: string;
  roundingOffAmount?: number;
  finalAmount: number;
  showTaxRow?: boolean;
  actionLabel: string;
  onActionClick: () => void;
  disableAction?: boolean;
  children?: React.ReactNode;
}

export const GenericBillFooter: React.FC<GenericBillFooterProps> = ({
  isExpanded,
  onToggleExpand,
  totalQuantity,
  subtotal,
  totalDiscount = 0,
  taxAmount = 0,
  taxLabel = 'Tax',
  finalAmount,
  showTaxRow = false,
  actionLabel,
  onActionClick,
  disableAction = false,
  children
}) => {
  return (

    <div className="flex-shrink-0 bg-card border-t border-border shadow-[0_-5px_15px_rgba(0,0,0,0.05)] rounded-t-sm z-20 md:shadow-none md:border-0 md:rounded-none md:bg-transparent md:w-full">

      <div className="md:mb-4">
        {children}
      </div>


      <div
        onClick={onToggleExpand}
        className="flex justify-between items-center px-5 py-2 cursor-pointer active:bg-muted transition-colors rounded-t-2xl group border-b border-border md:hidden"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-wider text-muted-foreground group-hover:text-foreground">
            Bill Details
          </span>
          <span className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 rounded-sm font-medium">
            {totalQuantity} Items
          </span>
        </div>
        <div className={`transform transition-transform duration-300 text-muted-foreground ${isExpanded ? '' : 'rotate-180'}`}>
          <IconChevronDown width={20} height={20} />
        </div>
      </div>


      <div className={`${isExpanded ? 'block' : 'hidden'} md:block px-5 pb-1 pt-1 md:px-0 md:pb-4 space-y-1.5 text-sm animate-in slide-in-from-bottom-2 duration-200 md:animate-none`}>

        <div className="flex justify-between text-muted-foreground pt-1">
          <span> MRP Subtotal</span>
          <span className="font-medium">₹{subtotal.toFixed(2)}</span>
        </div>

        {totalDiscount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span className="font-medium">- ₹{totalDiscount.toFixed(2)}</span>
          </div>
        )}

        {showTaxRow && (
          <div className="border-b border-border pb-2 flex justify-between text-blue-600">
            <span>{taxLabel}</span>
            <span className="font-medium">+ ₹{taxAmount.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Main Total & Action */}
      <div className="px-5 pb-1 md:px-0 md:pb-0 md:pt-4 md:border-t md:border-border">
        <div className="flex justify-between items-end mb-1">
          <span className="text-muted-foreground text-sm font-medium pb-1">Grand Total</span>
          <span className="text-2xl font-extrabold text-foreground tracking-tight">
            ₹{finalAmount.toFixed(2)}
          </span>
        </div>

        <div className="w-full flex justify-center">
          <div className="w-36">
            <CustomButton
              onClick={onActionClick}
              variant={Variant.Payment}
              className="w-full py-3.5 text-base font-bold shadow-lg shadow-blue-200 rounded-sm flex justify-center items-center active:scale-[0.98] transition-transform"
              disabled={disableAction}
            >
              {actionLabel}
            </CustomButton>
          </div>
        </div>
      </div>
    </div>
  );
};