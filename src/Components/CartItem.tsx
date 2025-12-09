import { FiEdit, FiTrash2 } from 'react-icons/fi';
import type { Item } from '../constants/models';
import { State } from '../enums';

// Define a generic interface for items in the cart
export interface CartItem extends Partial<Item> {
  id: string;
  productId?: string; // Link to master item
  name: string;
  discount?: number;
  customPrice?: number | string;
  quantity: number;
  isEditable?: boolean;
  [key: string]: any; // Allow dynamic keys for basePrice access
}

interface GenericCartListProps<T extends CartItem> {
  // --- Data ---
  items: T[];
  availableItems: Item[]; // Master list for the "Edit Original" feature
  
  // --- Configuration ---
  basePriceKey: keyof T; // e.g., 'mrp' for Sales, 'purchasePrice' for Purchase
  priceLabel: string;    // e.g., 'MRP' or 'Cost'
  
  // --- Settings (Decoupled from specific SalesSettings object) ---
  settings: {
    enableRounding: boolean;
    roundingInterval: number;
    enableItemWiseDiscount: boolean;
    lockDiscount: boolean;
    lockPrice: boolean;
  };
  
  // --- Helpers ---
  applyRounding: (amount: number, isRoundingEnabled: boolean, interval?: number) => number;
  State: typeof State;
  
  // --- Actions ---
  setModal: (modal: { message: string; type: State } | null) => void;
  onOpenEditDrawer: (item: Item) => void;
  onDeleteItem: (id: string) => void;
  onDiscountChange: (id: string, value: number | string) => void;
  onCustomPriceChange: (id: string, value: string) => void;
  onCustomPriceBlur: (id: string) => void;
  onQuantityChange: (id: string, newQuantity: number) => void;
  
  // --- Long Press / Touch Events ---
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
          // 1. Calculate Prices
          const currentBasePrice = Number(item[basePriceKey]) || 0;
          const currentDiscount = item.discount || 0;
          
          // Logic: Base - Discount %
          const priceAfterDiscount = currentBasePrice * (1 - currentDiscount / 100);
          
          const calculatedRoundedPrice = (currentDiscount > 0)
            ? applyRounding(priceAfterDiscount, settings.enableRounding, settings.roundingInterval)
            : priceAfterDiscount;
          
          const displayPrice = item.customPrice !== undefined && item.customPrice !== null && item.customPrice !== ''
            ? String(item.customPrice)
            : calculatedRoundedPrice.toFixed(2);

          // 2. Check Locks
          // Locked if global setting is on OR if item specifically is not editable
          const discountLocked = settings.lockDiscount || !item.isEditable;
          const priceLocked = settings.lockPrice || !item.isEditable;

          return (
            <div key={item.id} className={`bg-white rounded-lg shadow-sm border border-gray-200 p-3 ${!item.isEditable ? 'opacity-75 bg-gray-50' : ''}`}>
              
              {/* Row 1: Name and Edit/Delete Buttons */}
              <div className="flex justify-between items-start mb-3">
                  <button 
                    onClick={() => onDeleteItem(item.id)} 
                    disabled={!item.isEditable} 
                    className="text-gray-400 hover:text-red-500 disabled:text-gray-200"
                  >
                    <FiTrash2 size={16} />
                  </button>
                 <div className="flex-1 min-w-0 pr-2">
                    <h3 className="ml-2 font-semibold text-gray-800 text-sm truncate" title={item.name.slice(0, 25)}>
                      {item.name || 'Unnamed Item'}
                    </h3>
                 </div>
                 <div className="flex gap-2">
                      <p className="text-xs text-gray-500">{priceLabel}: ₹{currentBasePrice.toFixed(2)}</p>
                 </div>
              </div>

              {/* Row 2: Inline Controls (Discount | Price | Quantity) */}
              <div className="flex items-center justify-between gap-2">
                 
                 {/* Edit Master Item Button */}
                 <button 
                    onClick={() => {
                      // Try to find the master item using productId, fallback to ID match
                      const originalItem = availableItems.find(a => a.id === item.productId || a.id === item.id);
                      if (originalItem) onOpenEditDrawer(originalItem);
                      else setModal({ message: "Original item not found.", type: State.ERROR });
                    }}
                    className="text-gray-400 hover:text-blue-600"
                 >
                    <FiEdit size={15} />
                 </button>

                 {/* 1. Discount Input */}
                 {settings.enableItemWiseDiscount && (
                   <div 
                     className="relative w-16 flex-shrink-0"
                     onMouseDown={onDiscountPressStart} onMouseUp={onDiscountPressEnd} onMouseLeave={onDiscountPressEnd}
                     onTouchStart={onDiscountPressStart} onTouchEnd={onDiscountPressEnd} onClick={onDiscountClick}
                   >
                      <label className="absolute -top-2 left-1 bg-white px-1 text-[10px] text-gray-500">Disc%</label>
                      <input
                        type="number"
                        value={item.discount || ''}
                        onChange={(e) => onDiscountChange(item.id, e.target.value)}
                        readOnly={discountLocked}
                        className={`w-full p-1 text-center text-sm border rounded focus:outline-none focus:border-blue-500 ${discountLocked ? 'bg-gray-50 text-gray-400' : ''}`}
                        placeholder="0"
                      />
                   </div>
                 )}

                 {/* 2. Price Input */}
                 <div 
                    className="relative w-20 flex-shrink-0"
                    onMouseDown={onPricePressStart} onMouseUp={onPricePressEnd} onMouseLeave={onPricePressEnd}
                    onTouchStart={onPricePressStart} onTouchEnd={onPricePressEnd} onClick={onPriceClick}
                 >
                    <label className="absolute -top-2 left-1 bg-white px-1 text-[10px] text-gray-500">Net Price</label>
                    <div className="flex items-center border rounded px-1 bg-white">
                       <span className="text-xs text-gray-500">₹</span>
                       <input
                          type="number"
                          value={displayPrice}
                          onChange={(e) => onCustomPriceChange(item.id, e.target.value)}
                          onBlur={() => onCustomPriceBlur(item.id)}
                          readOnly={priceLocked}
                          className={`w-full p-1 text-sm text-right focus:outline-none ${priceLocked ? 'text-gray-400 bg-transparent' : ''}`}
                       />
                    </div>
                 </div>

                 {/* 3. Quantity Control */}
                 <div className="flex items-center border rounded bg-gray-50 h-8 ml-auto">
                    <button 
                      onClick={() => onQuantityChange(item.id, Math.max(1, (item.quantity || 1) - 1))}
                      disabled={item.quantity <= 1 || !item.isEditable}
                      className="px-2 text-gray-600 hover:bg-gray-200 disabled:text-gray-300 text-lg leading-none pb-1"
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
                      className="w-8 text-center bg-transparent text-sm font-semibold focus:outline-none"
                    />
                    <button 
                      onClick={() => onQuantityChange(item.id, (item.quantity || 1) + 1)}
                      disabled={!item.isEditable}
                      className="px-2 text-gray-600 hover:bg-gray-200 disabled:text-gray-300 text-lg leading-none pb-1"
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