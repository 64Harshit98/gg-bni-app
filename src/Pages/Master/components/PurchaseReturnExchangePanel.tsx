import React from 'react';
import type { Item } from '../../../constants/models';
import { State } from '../../../enums';
import { IconScanCircle } from '../../../constants/Icons';
import SearchableItemInput from '../../../UseComponents/SearchIteminput';
import { GenericCartList } from '../../../Components/CartItem';
import type { ReturnCartItem } from '../PurchaseReturn';

interface PurchaseReturnExchangePanelProps {
  modeOfReturn: string;
  onModeOfReturnChange: (mode: string) => void;
  isPurchaseUnpaid: boolean;
  availableItems: Item[];
  onNewItemSelected: (item: Item) => void;
  isLoading: boolean;
  error: string | null;
  onNewItemSearchChange: (value: string) => void;
  onScanItem: () => void;
  displayedNewItemsReceived: ReturnCartItem[];
  setModal: (modal: { message: string; type: State } | null) => void;
  onOpenEditDrawer: (item: Item) => void;
  onRemoveNewItem: (id: string) => void;
  onDiscountChange: (id: string, val: string | number) => void;
  onCustomPriceChange: (id: string, val: string) => void;
  onCustomPriceBlur: (id: string) => void;
  onQuantityChange: (id: string, newQty: number) => void;
}

/**
 * "Exchange / New Items Received" section of the Purchase Return page:
 * mobile-only transaction-type select, the new-item search + barcode scan,
 * and the received-items cart list. Extracted verbatim (styling reskinned
 * onto design tokens) from `PurchaseReturn.tsx`'s inline JSX.
 */
export const PurchaseReturnExchangePanel: React.FC<PurchaseReturnExchangePanelProps> = ({
  modeOfReturn,
  onModeOfReturnChange,
  isPurchaseUnpaid,
  availableItems,
  onNewItemSelected,
  isLoading,
  error,
  onNewItemSearchChange,
  onScanItem,
  displayedNewItemsReceived,
  setModal,
  onOpenEditDrawer,
  onRemoveNewItem,
  onDiscountChange,
  onCustomPriceChange,
  onCustomPriceBlur,
  onQuantityChange,
}) => {
  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-2 shadow-sm md:mb-0">
      {/* Mobile View: Mode Select Here */}
      <div className="mb-2 md:hidden">
        <label className="mb-1 block text-sm font-medium">Transaction Type</label>
        <select value={modeOfReturn} onChange={(e) => onModeOfReturnChange(e.target.value)} className="w-full rounded-md border border-border bg-card p-2">
          <option>Exchange</option>
          <option disabled={isPurchaseUnpaid}>Debit Note</option>
          <option>Cash Refund</option>
        </select>
      </div>

      {modeOfReturn === 'Exchange' && (
        <div className="mt-2">
          <div className="mb-2 flex items-end gap-2">
            <div className="flex-grow">
              <SearchableItemInput
                label="Add New Item Received"
                placeholder="Search inventory..."
                items={availableItems}
                onItemSelected={onNewItemSelected}
                isLoading={isLoading}
                error={error}
                onSearchChange={onNewItemSearchChange}
              />
            </div>
            <button onClick={onScanItem} className="flex items-center justify-center rounded-md bg-secondary p-2.5 text-secondary-foreground">
              <IconScanCircle width={24} height={24} />
            </button>
          </div>

          {displayedNewItemsReceived.length > 0 && (
            <div className="overflow-hidden rounded-md border border-border">
              <div className="border-b border-border bg-muted px-3 py-2 text-xs font-bold uppercase text-muted-foreground">Received Items</div>
              <div className="max-h-60 overflow-y-auto bg-muted">
                <GenericCartList<ReturnCartItem>
                  items={displayedNewItemsReceived}
                  availableItems={availableItems}
                  basePriceKey="mrp"
                  priceLabel="MRP"
                  settings={{
                    enableRounding: false,
                    roundingInterval: 1,
                    enableItemWiseDiscount: true, // Enable discount editing
                    enableDiscount2: false,         // Disable Discount 2
                    lockDiscount: false,          // Unlock Discount
                    lockPrice: false              // Unlock Price
                  }}
                  applyRounding={(v) => v}
                  State={State}
                  setModal={setModal}
                  onOpenEditDrawer={onOpenEditDrawer}
                  onDeleteItem={onRemoveNewItem}
                  onDiscountChange={onDiscountChange}
                  onDiscount2Change={() => { }}
                  onCustomPriceChange={onCustomPriceChange}
                  onCustomPriceBlur={onCustomPriceBlur}
                  onQuantityChange={onQuantityChange}
                  onDiscountPressStart={() => { }}
                  onDiscountPressEnd={() => { }}
                  onDiscountClick={() => { }}
                  onPricePressStart={() => { }}
                  onPricePressEnd={() => { }}
                  onPriceClick={() => { }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
