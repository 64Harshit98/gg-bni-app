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
    <div className="flex-1 overflow-y-auto p-2 space-y-2 pb-20">
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
          const baseCardClass = isZeroPrice
            ? 'bg-red-50 border-red-500'
            : 'bg-white border-gray-200';

          return (
            <div
              key={item.id}
              className={`${baseCardClass} rounded-lg shadow-sm border p-3 flex flex-col md:flex-row md:items-center gap-3 ${!item.isEditable ? 'opacity-75 bg-gray-50' : ''}`}
            >

              {/* --- LEFT SIDE: Name & Identity --- */}
              <div className="flex justify-between items-start md:items-center w-full md:flex-1 md:w-auto min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <button
                    onClick={() => onDeleteItem(item.id)}
                    disabled={!item.isEditable}
                    className="text-gray-400 hover:text-red-500 disabled:text-gray-200 flex-shrink-0"
                  >
                    <FiTrash2 size={16} />
                  </button>
                  <h3 className="font-semibold text-gray-800 text-sm truncate" title={item.name}>
                    {item.name || 'Unnamed Item'}
                  </h3>

                  <button
                    onClick={() => {
                      const originalItem = availableItems.find(a => a.id === item.productId || a.id === item.id);
                      if (originalItem) onOpenEditDrawer(originalItem);
                      else setModal({ message: "Original item not found.", type: State.ERROR });
                    }}
                    className="hidden md:block text-gray-400 hover:text-blue-600 flex-shrink-0"
                  >
                    <FiEdit size={14} />
                  </button>
                </div>

                {!settings.hideMrp && (
                  <div className="flex-shrink-0 ml-2 whitespace-nowrap">
                    <p className="text-xs text-gray-500">{priceLabel}: ₹{currentBasePrice.toFixed()}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto flex-shrink-0 md:mt-0">

                <button
                  onClick={() => {
                    const originalItem = availableItems.find(a => a.id === item.productId || a.id === item.id);
                    if (originalItem) onOpenEditDrawer(originalItem);
                    else setModal({ message: "Original item not found.", type: State.ERROR });
                  }}
                  className="md:hidden text-gray-400 hover:text-blue-600"
                >
                  <FiEdit size={15} />
                </button>

                {/* 1. Discount Input */}
                {settings.enableItemWiseDiscount && (
                  <div
                    className="relative w-16 md:w-16 flex-shrink-0"
                    onMouseDown={onDiscountPressStart} onMouseUp={onDiscountPressEnd} onMouseLeave={onDiscountPressEnd}
                    onTouchStart={onDiscountPressStart} onTouchEnd={onDiscountPressEnd} onClick={onDiscountClick}
                  >
                    <label className="absolute -top-1 left-3.5 bg-white px-1 text-[10px] text-gray-500 leading-none">Disc%</label>                    <FloatingInput
                      value={item.discount !== undefined ? String(item.discount) : ''}
                      onChange={(val) => onDiscountChange(item.id, val)}
                      onBlur={() => {
                        if ((item.discount as any) === '' || item.discount === undefined) {
                          onDiscountChange(item.id, 0);
                        }
                      }}
                      locked={discountLocked}
                      placeholder="0"
                      className={`w-full px-1 py-1 text-center text-sm border border-slate-300 rounded h-9 ${discountLocked ? 'bg-gray-50' : 'focus:border-blue-500'}`}
                    />
                  </div>
                )}

                {/* 2. Price Input */}
                <div
                  className="relative w-24 md:w-28 flex-shrink-0"
                  onMouseDown={onPricePressStart} onMouseUp={onPricePressEnd} onMouseLeave={onPricePressEnd}
                  onTouchStart={onPricePressStart} onTouchEnd={onPricePressEnd} onClick={onPriceClick}
                >
                  <label className="absolute -top-1 left-4.5 bg-white px-1 text-[10px] text-gray-500 leading-none">Net Price</label>                  <div className="flex items-center border border-slate-300 rounded px-2 bg-transparent h-9">
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
                      className="w-full p-0 text-sm text-right"
                    />
                  </div>
                </div>

                {/* 3. Quantity Control */}
                <div className="flex items-center border border-slate-300 rounded bg-transparent h-9 w-24 flex-shrink-0 ml-auto md:ml-0">
                  <button
                    onClick={() => onQuantityChange(item.id, Math.max(1, (item.quantity || 1) - 1))}
                    disabled={item.quantity <= 1 || !item.isEditable}
                    className="px-2 text-gray-600 hover:bg-gray-200 disabled:text-gray-300 text-lg leading-none flex items-center justify-center h-full w-8 border-r"
                  >-</button>

                  <div className="flex-1 w-full h-full">
                    <FloatingInput
                      value={String(item.quantity)}
                      onChange={(val) => {
                        const num = parseFloat(val);
                        onQuantityChange(item.id, isNaN(num) ? '' as any : num);
                      }}
                      onBlur={() => {
                        if (!item.quantity) {
                          onQuantityChange(item.id, 1);
                        }
                      }}
                      locked={!item.isEditable}
                      className="w-full h-full text-center text-sm font-semibold"
                    />
                  </div>

                  <button
                    onClick={() => onQuantityChange(item.id, (item.quantity || 1) + 1)}
                    disabled={!item.isEditable}
                    className="px-2 text-gray-600 hover:bg-gray-200 disabled:text-gray-300 text-lg leading-none flex items-center justify-center h-full w-8 border-l"
                  >+</button>
                </div>

              </div>

            </div>
          );
        })
      )}
    </div>
  );
};