// src/Components/SalesCartList.tsx

import React from 'react';
import { FiEdit } from 'react-icons/fi';
import type { Item } from '../constants/models';
import { State } from '../enums';
import { type SalesItem } from '../Pages/Master/Sales'; // Adjust path if needed

interface SalesCartListProps {
  items: SalesItem[];
  availableItems: Item[];
  // salesSettings must contain roundingInterval
  salesSettings: any;
  isDiscountLocked: boolean;
  isPriceLocked: boolean;
  // Assuming the parent passes the full applyRounding function (amount, isEnabled, interval)
  applyRounding: (amount: number, isRoundingEnabled: boolean, interval?: number) => number;
  State: typeof State;
  setModal: (modal: { message: string; type: State } | null) => void;

  // Callbacks
  onOpenEditDrawer: (item: Item) => void;
  onDeleteItem: (id: string) => void;
  onDiscountChange: (id: string, value: number | string) => void;
  onCustomPriceChange: (id: string, value: string) => void;
  onCustomPriceBlur: (id: string) => void;
  onQuantityChange: (id: string, newQuantity: number) => void;

  // Lock interaction callbacks
  onDiscountPressStart: () => void;
  onDiscountPressEnd: () => void;
  onDiscountClick: () => void;
  onPricePressStart: () => void;
  onPricePressEnd: () => void;
  onPriceClick: () => void;
}

export const SalesCartList: React.FC<SalesCartListProps> = ({
  items,
  availableItems,
  salesSettings,
  isDiscountLocked,
  isPriceLocked,
  applyRounding,
  State,
  setModal,
  onOpenEditDrawer,
  onDeleteItem,
  onDiscountChange,
  onCustomPriceChange,
  onCustomPriceBlur,
  onQuantityChange,
  onDiscountPressStart,
  onDiscountPressEnd,
  onDiscountClick,
  onPricePressStart,
  onPricePressEnd,
  onPriceClick,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-1">
      <div className="flex flex-col gap-3">
        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-gray-100 rounded-sm">No items added.</div>
        ) : (
          [...items].map(item => {
            const isRoundingEnabled = salesSettings?.enableRounding ?? true;
            // Retrieve rounding interval from settings (cast to any if TS complains about missing property)
            const roundingInterval = salesSettings?.roundingInterval ?? 1;

            const currentMrp = item.mrp || 0;
            const currentDiscount = item.discount || 0;

            const priceAfterDiscount = currentMrp * (1 - currentDiscount / 100);

            // --- FIX APPLIED HERE: Pass the roundingInterval ---
            const calculatedRoundedPrice = (currentDiscount > 0)
              ? applyRounding(priceAfterDiscount, isRoundingEnabled, roundingInterval)
              : priceAfterDiscount;

            const displayPrice = item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== ''
              ? String(item.customPrice)
              : calculatedRoundedPrice.toFixed();

            const discountLocked = (salesSettings?.lockDiscountEntry || isDiscountLocked) || !item.isEditable;
            const priceLocked = (salesSettings?.lockSalePriceEntry || isPriceLocked) || !item.isEditable;

            return (
              <div key={item.id} className={`bg-white rounded-sm shadow-sm border p-2 ${!item.isEditable ? 'bg-gray-100 opacity-75' : ''}`}>
                <div className="flex justify-between items-start gap-3">
                  {/* Edit Button */}
                  <button
                    onClick={() => {
                      const originalItem = availableItems.find(a => a.id === item.id);
                      if (originalItem) onOpenEditDrawer(originalItem);
                      else setModal({ message: "Cannot edit this item. Original data not found.", type: State.ERROR });
                    }}
                    className="mt-1 bg-gray-50 hover:bg-gray-100 p-1 rounded text-gray-600"
                  >
                    <FiEdit className="h-4 w-4" />
                  </button>

                  {/* --- CSS FIX: Name Container with Truncate --- */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate block" title={item.name}>
                      {item.name || 'Unnamed'}
                    </p>
                  </div>
                  {/* -------------------------------------------- */}

                  {/* Delete Button */}
                  <button onClick={() => onDeleteItem(item.id)} disabled={!item.isEditable} className="text-gray-400 hover:text-red-500 flex-shrink-0 disabled:text-gray-300 disabled:cursor-not-allowed" title="Remove item">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>

                {salesSettings?.enableItemWiseDiscount && (
                  <>
                    <div className="flex justify-between items-center mb-1 mt-2">
                      <div
                        className="flex items-center gap-2"
                        onMouseDown={onDiscountPressStart}
                        onMouseUp={onDiscountPressEnd}
                        onMouseLeave={onDiscountPressEnd}
                        onTouchStart={onDiscountPressStart}
                        onTouchEnd={onDiscountPressEnd}
                        onClick={onDiscountClick}
                      >
                        <label htmlFor={`discount-${item.id}`} className={`text-sm text-gray-600`}>Approx. Discount</label>
                        <input
                          id={`discount-${item.id}`} type="number" value={item.discount || ''}
                          onChange={(e) => onDiscountChange(item.id, e.target.value)}
                          readOnly={isDiscountLocked}
                          className={`w-12 p-1 bg-gray-100 rounded-md text-center text-sm font-medium text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 ${discountLocked ? 'cursor-not-allowed' : ''}`}
                          placeholder="0"
                        />
                        <span className="text-sm text-gray-600 pr-20">%</span>
                      </div>
                    </div>
                    <hr className="my-1 border-gray-200" />
                  </>
                )}

                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-baseline gap-2">
                    <p className="text-sm text-gray-500 line-through">₹{currentMrp.toFixed()}</p>
                    <div className="flex items-center">
                      <div
                        className="flex items-center gap-2"
                        onMouseDown={onPricePressStart}
                        onMouseUp={onPricePressEnd}
                        onMouseLeave={onPricePressEnd}
                        onTouchStart={onPricePressStart}
                        onTouchEnd={onPricePressEnd}
                        onClick={onPriceClick}
                      >
                        <span className="text-sm font-semibold text-gray-600 mr-1">₹</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={displayPrice}
                          onChange={(e) => onCustomPriceChange(item.id, e.target.value)}
                          onBlur={() => onCustomPriceBlur(item.id)}
                          readOnly={isPriceLocked}
                          className={`w-14 p-1 bg-gray-100 rounded-sm text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-200 ${priceLocked ? 'cursor-not-allowed' : ''}`}
                          placeholder='Price'
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quantity Input */}
                  <div className="flex items-center border border-gray-300 rounded-md overflow-hidden h-8">
                    <button
                      onClick={() => onQuantityChange(item.id, Math.max(1, (item.quantity || 1) - 1))}
                      disabled={item.quantity <= 1 || !item.isEditable}
                      className="px-3 h-full bg-gray-50 text-gray-700 hover:bg-gray-200 disabled:text-gray-300 flex items-center"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) onQuantityChange(item.id, val);
                        else if (e.target.value === '') onQuantityChange(item.id, 0);
                      }}
                      disabled={!item.isEditable}
                      className="w-12 h-full text-center font-bold text-gray-900 border-x border-y-0 p-0 focus:ring-0 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      onClick={() => onQuantityChange(item.id, (item.quantity || 1) + 1)}
                      disabled={!item.isEditable}
                      className="px-3 h-full bg-gray-50 text-gray-700 hover:bg-gray-200 disabled:text-gray-300 flex items-center"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  );
};