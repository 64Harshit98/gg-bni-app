import React from 'react';
import { CustomButton } from './index';
import { Variant } from '../enums';

const formatINR = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

    <div className="flex-shrink-0 bg-white z-20 md:bg-transparent md:w-full">

      <div className="md:mb-4">
        {children}
      </div>


      <div className="hidden md:block px-0 pb-4 space-y-1.5 text-sm">

        <div className="flex justify-between text-gray-600 pt-1">
          <span> MRP Subtotal</span>
          <span className="font-medium">₹{formatINR(subtotal)}</span>
        </div>

        {totalDiscount > 0 && (
          <div className="flex justify-between text-green-600">
            <span>Discount</span>
            <span className="font-medium">- ₹{formatINR(totalDiscount)}</span>
          </div>
        )}
        {/* Net Sale Price — desktop only */}
        <div className="hidden md:flex justify-between text-gray-700 border-t border-gray-100 pt-1.5">
          <span className="font-medium">Net Sale Price</span>
          <span className="font-semibold">₹{formatINR(subtotal - totalDiscount)}</span>
        </div>

        {showTaxRow && (
          <div className="border-b border-gray-200 pb-2 flex justify-between text-blue-600">
            <span>{taxLabel}</span>
            <span className="font-medium">+ ₹{formatINR(taxAmount)}</span>
          </div>
        )}
      </div>

      {/* Main Total & Action — desktop only */}
      <div className="hidden md:block md:pt-4 md:border-t md:border-gray-100">
        <div className="flex justify-between items-end mb-1">
          <span className="text-gray-500 text-sm font-medium pb-1">Grand Total</span>
          <span className="text-2xl font-extrabold text-gray-900 tracking-tight">
            ₹{formatINR(finalAmount)}
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

      {/* Compact item count / total / action bar — mobile only, whole bar is the action button */}
      <button
        type="button"
        onClick={onActionClick}
        disabled={disableAction}
        className="flex md:hidden w-full items-center justify-between gap-1 px-2 py-2 mb-1 rounded-sm border border-gray-100 bg-emerald-100 shadow-sm text-left disabled:opacity-50 disabled:pointer-events-none active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex items-center justify-center w-11 h-11 rounded-full bg-emerald-50 flex-shrink-0">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-emerald-600"
            >
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </span>
          <div className="leading-tight min-w-0">
            <p className="text-[11px] font-bold tracking-wider text-gray-500 uppercase">
              {totalQuantity} {totalQuantity === 1 ? 'Item' : 'Items'}
            </p>
            <p className="text-lg font-extrabold text-gray-900 tracking-tight truncate">
              ₹{formatINR(finalAmount)}
            </p>
          </div>
        </div>

        <span className="flex items-center gap-1 text-emerald-600 font-bold text-sm flex-shrink-0">
          {actionLabel}
          <span aria-hidden="true">→</span>
        </span>
      </button>
    </div>
  );
};