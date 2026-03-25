import { FiEdit, FiTrash2 } from 'react-icons/fi';
import { useState, useEffect } from 'react';
import type { Item } from '../constants/models';
import { State } from '../enums';

export interface CartItem extends Partial<Item> {
  id: string;
  productId?: string;
  name: string;
  discount?: number;
  customPrice?: number | string;
  quantity: number;
  isEditable?: boolean;
  [key: string]: any;
}

interface GenericCartListProps<T extends CartItem> {
  items: T[];
  availableItems: Item[];
  basePriceKey: keyof T;
  priceLabel: string;
  settings: {
    enableRounding: boolean;
    roundingInterval: number;
    enableItemWiseDiscount: boolean;
    lockDiscount: boolean;
    lockPrice: boolean;
    hideMrp?: boolean;
  };
  applyRounding: (amount: number, isRoundingEnabled: boolean, interval?: number) => number;
  State: typeof State;
  setModal: (modal: { message: string; type: State } | null) => void;
  onOpenEditDrawer: (item: Item) => void;
  onDeleteItem: (id: string) => void;
  onDiscountChange: (id: string, value: number | string) => void;
  onCustomPriceChange: (id: string, value: string) => void;
  onCustomPriceBlur: (id: string) => void;
  onQuantityChange: (id: string, newQuantity: number) => void;
  onDiscountPressStart?: () => void;
  onDiscountPressEnd?: () => void;
  onDiscountClick?: () => void;
  onPricePressStart?: () => void;
  onPricePressEnd?: () => void;
  onPriceClick?: () => void;
}

const FloatingInput = ({
  value,
  onChange,
  onBlur,
  locked,
  className,
  ...props
}: {
  value: string;
  onChange: (val: string) => void;
  onBlur: () => void;
  locked: boolean;
  className?: string;
  [key: string]: any;
}) => {
  const [localValue, setLocalValue] = useState<string>(value || '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const incomingValue = value === null || value === undefined ? '' : String(value);
    if (!isFocused && incomingValue !== localValue) {
      setLocalValue(incomingValue);
    }
  }, [value, isFocused, localValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setLocalValue(val);
      onChange(val);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onFocus={() => {
        if (!locked) {
          setIsFocused(true);
          setLocalValue('');
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        setLocalValue(value || '');
        onBlur();
      }}
      readOnly={locked}
      autoComplete="off"
      className={`focus:outline-none bg-transparent ${locked ? 'text-gray-400' : ''} ${className || ''}`}
      {...props}
    />
  );
};


export const GenericCartList = <T extends CartItem>({
  items,
  availableItems,
  basePriceKey,
  priceLabel,
  settings,
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
}: GenericCartListProps<T>) => {

  return (
    <div className="flex-1 overflow-y-auto space-y-4 pb-20 px-3 pt-4">
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-gray-400">
          <p>Cart is empty</p>
        </div>
      ) : (
        items.map((item) => {
          const currentBasePrice = Number(item[basePriceKey]) || 0;
          const currentDiscount = item.discount || 0;
          const priceAfterDiscount = currentBasePrice * (1 - currentDiscount / 100);

          const calculatedRoundedPrice = (currentDiscount > 0)
            ? applyRounding(priceAfterDiscount, settings.enableRounding, settings.roundingInterval)
            : priceAfterDiscount;

          const displayPrice = item.customPrice !== undefined && item.customPrice !== null
            ? String(item.customPrice)
            : calculatedRoundedPrice.toFixed(2);

          const discountLocked = settings.lockDiscount || !item.isEditable;
          const priceLocked = settings.lockPrice || !item.isEditable;

          const isZeroPrice = displayPrice !== '' && Number(displayPrice) === 0;

          const netPrice = parseFloat(displayPrice) || 0;
          const lineSubtotal = Math.round((netPrice * (item.quantity || 1)) * 100) / 100;

          return (
            <div
              key={item.id}
              className={`rounded-2xl border overflow-hidden shadow-sm ${
  isZeroPrice ? 'bg-red-50 border-red-200' : 'bg-white border-gray-100'
} ${!item.isEditable ? 'opacity-75' : ''}`}
            >

              {/* ════════════════════════════════════════
                  MOBILE / TABLET  (below md breakpoint)
                  3-row card layout
              ════════════════════════════════════════ */}
              <div className="sm:hidden">

                <div className="flex items-center justify-between px-2.5 pt-2 pb-1.5">
                  <div className="flex items-center gap-2 min-w-0 flex-1">

                    <button
                      onClick={() => onDeleteItem(item.id)}
                      disabled={!item.isEditable}
                      className=" flex items-center justify-center w-[26px] h-[26px] border rounded-md  text-gray-400 hover:text-red-500 disabled:text-gray-200 disabled:cursor-not-allowed shadow-sm z-20"
                    >
                      <FiTrash2 size={14} />
                    </button>


                    <h3 className="font-semibold text-gray-800 text-sm" title={item.name}>
                      {item.name.slice(0, 30) || 'Unnamed Item'}
                    </h3>
                    {item.unit ? (
                      <span className="text-[11px] text-gray-400 flex-shrink-0">{item.unit}</span>
                    ) : null}
                  </div>


                  <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-[10px] text-gray-500 leading-none">Subtotal</span>
                      <span className="text-xs text-gray-500 leading-none">
                        ₹{lineSubtotal.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        const originalItem = availableItems.find(a => a.id === item.productId || a.id === item.id);
                        if (originalItem) onOpenEditDrawer(originalItem);
                        else setModal({ message: "Original item not found.", type: State.ERROR });
                      }}
                      className=" w-[26px] h-[26px] border rounded-md  text-gray-400 hover:text-blue-600 disabled:text-gray-200 disabled:cursor-not-allowed shadow-sm z-20"
                    >
                      <FiEdit size={14} />
                    </button>

                  </div>
              </div>

              {/* Row 2: MRP | Disc% | Net Price | Qty */}
              <div className="border-t border-gray-100 px-2.5 py-2 flex items-center gap-1.5 flex-nowrap overflow-x-auto">

                {!settings.hideMrp && (
                  <div className="relative flex-shrink-0">
                    <label className="absolute -top-1 left-3.5 bg-white px-1 text-[10px] text-gray-500 leading-none z-10">{priceLabel}</label>
                    <div className="flex items-center border border-slate-300 rounded h-9 px-2 bg-white min-w-[60px] cursor-not-allowed">
                      <span className="text-xs text-gray-400 mr-1">₹</span>
                      <span className="text-sm text-gray-400 text-center w-full">{currentBasePrice.toFixed()}</span>
                    </div>
                  </div>
                )}

                {settings.enableItemWiseDiscount && (
                  <div
                    className="relative w-13 flex-shrink-0"
                    onMouseDown={onDiscountPressStart}
                    onMouseUp={onDiscountPressEnd}
                    onMouseLeave={onDiscountPressEnd}
                    onTouchStart={onDiscountPressStart}
                    onTouchEnd={onDiscountPressEnd}
                    onClick={onDiscountClick}
                  >
                    <label className="absolute -top-1 left-2 bg-white px-1 text-[10px] text-gray-500 leading-none z-10">Disc%</label>
                    <FloatingInput
                      value={item.discount !== undefined ? String(item.discount) : ''}
                      onChange={(val) => onDiscountChange(item.id, val)}
                      onBlur={() => {
                        if ((item.discount as any) === '' || item.discount === undefined) {
                          onDiscountChange(item.id, 0);
                        }
                      }}
                      locked={discountLocked}
                      placeholder="0"
                      className={`w-full px-1 py-1 text-center text-sm border border-slate-300 rounded h-9 ${discountLocked ? 'bg-gray-50 cursor-not-allowed' : 'focus:border-blue-500'
                        }`}
                    />
                  </div>
                )}

                <div
                  className="relative flex-1 min-w-[70px]"
                  onMouseDown={onPricePressStart}
                  onMouseUp={onPricePressEnd}
                  onMouseLeave={onPricePressEnd}
                  onTouchStart={onPricePressStart}
                  onTouchEnd={onPricePressEnd}
                  onClick={onPriceClick}
                >
                  <label className="absolute -top-1 left-3.5 bg-white px-1 text-[10px] text-gray-500 leading-none z-10">Net Price</label>
                  <div className={`flex items-center border border-slate-300 rounded px-2 h-9 ${priceLocked ? 'bg-gray-50' : ''}`}>
                    <span className="text-xs text-gray-500 mr-1">₹</span>
                    <FloatingInput
                      value={displayPrice}
                      onChange={(val) => onCustomPriceChange(item.id, val)}
                      onBlur={() => {
                        if (displayPrice === '' || item.customPrice === '') {
                          onCustomPriceChange(item.id, String(calculatedRoundedPrice));
                        }
                        onCustomPriceBlur(item.id);
                      }}
                      locked={priceLocked}
                      className="w-full text-sm text-right"
                    />
                  </div>
                </div>

                <div className=" flex items-center border border-slate-300 rounded h-9 w-24 flex-shrink-0">
                  <button
                    onClick={() => {
                      const step = item.unitMultiplier || 1;
                      onQuantityChange(item.id, Math.max(step, (item.quantity || step) - step));
                    }}
                    disabled={item.quantity <= (item.unitMultiplier || 1) || !item.isEditable}
                    className="px-2 text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed text-lg leading-none flex items-center justify-center h-full w-8 border-r border-slate-300"
                  >−</button>
                  <div className="flex-1 h-full flex items-center justify-center">
                    <FloatingInput
                      value={String(item.quantity)}
                      onChange={(val) => {
                        const num = parseFloat(val);
                        onQuantityChange(item.id, isNaN(num) ? '' as any : num);
                      }}
                      onBlur={() => {
                        const step = item.unitMultiplier || 1;
                        if (!item.quantity || item.quantity < step) {
                          onQuantityChange(item.id, step);
                        }
                      }}
                      locked={!item.isEditable}
                      className="w-full text-center text-sm font-semibold"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const step = item.unitMultiplier || 1;
                      onQuantityChange(item.id, (item.quantity || step) + step);
                    }}
                    disabled={!item.isEditable}
                    className="px-2 text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed text-lg leading-none flex items-center justify-center h-full w-8 border-l border-slate-300"
                  >+</button>
                </div>

              </div>
            </div>

              {/* ════════════════════════════════════════
                  DESKTOP  (md and above)
                  Single row: trash | name+edit | MRP | Disc% | Net Price | Subtotal | Qty
              ════════════════════════════════════════ */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-2.5 bg-white">



            {/* Trash */}
            <button
              onClick={() => onDeleteItem(item.id)}
              disabled={!item.isEditable}
              className="flex items-center justify-center w-[28px] h-[28px] border  rounded-md text-gray-400  hover:text-red-500 disabled:text-gray-200 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            >
              <FiTrash2 size={16} />
            </button>

            {/* Name + unit + edit */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-800 truncate">
                {item.name || 'Unnamed Item'}
              </span>
              {item.unit && (
                <span className="text-[11px] text-gray-400 flex-shrink-0">{item.unit}</span>
              )}
              <button
                onClick={() => {
                  const originalItem = availableItems.find(a => a.id === item.productId || a.id === item.id);
                  if (originalItem) onOpenEditDrawer(originalItem);
                  else setModal({ message: "Original item not found.", type: State.ERROR });
                }}
                className="text-gray-400 hover:text-blue-600 flex-shrink-0 ml-0.5"
              >
                <FiEdit size={16} />
              </button>
            </div>

            {/* MRP — label above amount */}
            {!settings.hideMrp && (
              <div className="flex flex-col items-center flex-shrink-0 min-w-[48px]">
                <span className="text-[10px] text-gray-500 leading-none mb-0.5">{priceLabel}</span>
                <span className="text-xs text-gray-500 leading-none">₹{currentBasePrice.toFixed()}</span>
              </div>
            )}

            {/* Disc% — floating label box */}
            {settings.enableItemWiseDiscount && (
              <div
                className="relative w-14 flex-shrink-0"
                onMouseDown={onDiscountPressStart}
                onMouseUp={onDiscountPressEnd}
                onMouseLeave={onDiscountPressEnd}
                onTouchStart={onDiscountPressStart}
                onTouchEnd={onDiscountPressEnd}
                onClick={onDiscountClick}
              >
                <label className="absolute -top-1 left-2 bg-white px-1 text-[10px] text-gray-500 leading-none z-10">Disc%</label>
                <FloatingInput
                  value={item.discount !== undefined ? String(item.discount) : ''}
                  onChange={(val) => onDiscountChange(item.id, val)}
                  onBlur={() => {
                    if ((item.discount as any) === '' || item.discount === undefined) {
                      onDiscountChange(item.id, 0);
                    }
                  }}
                  locked={discountLocked}
                  placeholder="0"
                  className={`w-full px-1 py-1 text-center text-sm border border-slate-300 rounded h-9 ${discountLocked ? 'bg-gray-50 cursor-not-allowed' : 'focus:border-blue-500'
                    }`}
                />
              </div>
            )}

            {/* Net Price — floating label box */}
            <div
              className="relative w-24 flex-shrink-0"
              onMouseDown={onPricePressStart}
              onMouseUp={onPricePressEnd}
              onMouseLeave={onPricePressEnd}
              onTouchStart={onPricePressStart}
              onTouchEnd={onPricePressEnd}
              onClick={onPriceClick}
            >
              <label className="absolute -top-1 left-3.5 bg-white px-1 text-[10px] text-gray-500 leading-none z-10">Net Price</label>
              <div className={`flex items-center border border-slate-300 rounded px-2 h-9 ${priceLocked ? 'bg-gray-50' : ''}`}>
                <span className="text-xs text-gray-500 mr-1">₹</span>
                <FloatingInput
                  value={displayPrice}
                  onChange={(val) => onCustomPriceChange(item.id, val)}
                  onBlur={() => {
                    if (displayPrice === '' || item.customPrice === '') {
                      onCustomPriceChange(item.id, String(calculatedRoundedPrice));
                    }
                    onCustomPriceBlur(item.id);
                  }}
                  locked={priceLocked}
                  className="w-full text-sm text-right"
                />
              </div>
            </div>

            {/* Qty selector */}
            <div className="flex items-center border border-slate-300 rounded h-9 w-24 flex-shrink-0">
              <button
                onClick={() => {
                  const step = item.unitMultiplier || 1;
                  onQuantityChange(item.id, Math.max(step, (item.quantity || step) - step));
                }}
                disabled={item.quantity <= (item.unitMultiplier || 1) || !item.isEditable}
                className="px-2 text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed text-lg leading-none flex items-center justify-center h-full w-8 border-r border-slate-300"
              >−</button>
              <div className="flex-1 h-full flex items-center justify-center">
                <FloatingInput
                  value={String(item.quantity)}
                  onChange={(val) => {
                    const num = parseFloat(val);
                    onQuantityChange(item.id, isNaN(num) ? '' as any : num);
                  }}
                  onBlur={() => {
                    const step = item.unitMultiplier || 1;
                    if (!item.quantity || item.quantity < step) {
                      onQuantityChange(item.id, step);
                    }
                  }}
                  locked={!item.isEditable}
                  className="w-full text-center text-sm font-semibold"
                />
              </div>
              <button
                onClick={() => {
                  const step = item.unitMultiplier || 1;
                  onQuantityChange(item.id, (item.quantity || step) + step);
                }}
                disabled={!item.isEditable}
                className="px-2 text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:cursor-not-allowed text-lg leading-none flex items-center justify-center h-full w-8 border-l border-slate-300"
              >+</button>
            </div>
            {/* Subtotal — label above amount, after Net Price */}
            <div className="flex flex-col items-center flex-shrink-0 min-w-[64px]">
              <span className="text-[10px] text-gray-500 leading-none mb-0.5">Subtotal</span>
              <span className="text-xs text-gray-500 leading-none">
                ₹{lineSubtotal.toLocaleString('en-IN')}
              </span>
            </div>


          </div>
            </div>

  );
})
      )}
    </div >
  );
};