import { FiEdit, FiTrash2 } from 'react-icons/fi';
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
            : calculatedRoundedPrice.toFixed();

          const discountLocked = settings.lockDiscount || !item.isEditable;
          const priceLocked = settings.lockPrice || !item.isEditable;

          return (
            <div 
              key={item.id} 
              className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex flex-col md:flex-row md:items-center gap-3 ${!item.isEditable ? 'opacity-75 bg-gray-50' : ''}`}
            >

              {/* --- LEFT SIDE: Name & Identity (Flexible Width) --- */}
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

                  {/* Desktop: Master Edit Icon */}
                  <button
                    onClick={() => {
                      const originalItem = availableItems.find(a => a.id === item.productId || a.id === item.id);
                      if (originalItem) onOpenEditDrawer(originalItem);
                      else setModal({ message: "Original item not found.", type: State.ERROR });
                    }}
                    className="hidden md:block text-gray-400 hover:text-blue-600 flex-shrink-0"
                    title="Edit Master Item"
                  >
                    <FiEdit size={14} />
                  </button>
                </div>

                {/* MRP Display (Mobile: Right side of row 1. Desktop: Next to name) */}
                {!settings.hideMrp && (
                  <div className="flex-shrink-0 ml-2 whitespace-nowrap">
                    <p className="text-xs text-gray-500">{priceLabel}: ₹{currentBasePrice.toFixed()}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto flex-shrink-0 mt-2 md:mt-0">

                {/* Mobile Only: Edit Icon */}
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
                    <label className="absolute -top-2 left-1 bg-white px-1 text-[10px] text-gray-500 leading-none">Disc%</label>
                    <input
                      type="number"
                      value={item.discount || ''}
                      onChange={(e) => onDiscountChange(item.id, e.target.value)}
                      readOnly={discountLocked}
                      className={`w-full px-1 py-1 text-center text-sm border rounded focus:outline-none focus:border-blue-500 h-9 ${discountLocked ? 'bg-gray-50 text-gray-400' : ''}`}
                      placeholder="0"
                    />
                  </div>
                )}

                {/* 2. Price Input */}
                <div
                  className="relative w-24 md:w-28 flex-shrink-0"
                  onMouseDown={onPricePressStart} onMouseUp={onPricePressEnd} onMouseLeave={onPricePressEnd}
                  onTouchStart={onPricePressStart} onTouchEnd={onPricePressEnd} onClick={onPriceClick}
                >
                  <label className="absolute -top-2 left-1 bg-white px-1 text-[10px] text-gray-500 leading-none">Net Price</label>
                  <div className="flex items-center border rounded px-2 bg-white h-9">
                    <span className="text-xs text-gray-500 mr-1">₹</span>
                    <input
                      type="number"
                      value={displayPrice}
                      onChange={(e) => onCustomPriceChange(item.id, e.target.value)}
                      onFocus={() => {
                        if (!priceLocked) {
                          onCustomPriceChange(item.id, '');
                        }
                      }}
                      onBlur={() => onCustomPriceBlur(item.id)}
                      readOnly={priceLocked}
                      className={`w-full p-0 text-sm text-right focus:outline-none bg-transparent ${priceLocked ? 'text-gray-400' : ''}`}
                    />
                  </div>
                </div>

                {/* 3. Quantity Control */}
                <div className="flex items-center border rounded bg-white h-9 w-24 flex-shrink-0 ml-auto md:ml-0">
                  <button
                    onClick={() => onQuantityChange(item.id, Math.max(1, (item.quantity || 1) - 1))}
                    disabled={item.quantity <= 1 || !item.isEditable}
                    className="px-2 text-gray-600 hover:bg-gray-200 disabled:text-gray-300 text-lg leading-none flex items-center justify-center h-full w-8 border-r"
                  >-</button>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val)) onQuantityChange(item.id, val);
                      else if (e.target.value === '') onQuantityChange(item.id, 0);
                    }}
                    disabled={!item.isEditable}
                    className="flex-1 w-full text-center bg-transparent text-sm font-semibold focus:outline-none h-full"
                  />
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