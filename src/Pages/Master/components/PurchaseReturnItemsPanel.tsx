import React from 'react';
import { ReturnListItem } from '../../../Components/ReturnListItem';
import { IconScanCircle } from '../../../constants/Icons';
import type { TransactionItem } from '../PurchaseReturn';

interface PurchaseReturnItemsPanelProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onScanItem: () => void;
  originalPurchaseItemsCount: number;
  filteredReturnItems: TransactionItem[];
  selectedReturnIds: Set<string>;
  onToggleReturnItem: (id: string) => void;
  onQuantityChange: (id: string, newQty: number) => void;
}

/**
 * "Select Return Items" list (search + barcode scan + the returnable line
 * items from the original purchase) on the Purchase Return page. Extracted
 * verbatim (styling reskinned onto design tokens) from
 * `PurchaseReturn.tsx`'s inline JSX.
 */
export const PurchaseReturnItemsPanel: React.FC<PurchaseReturnItemsPanelProps> = ({
  searchQuery,
  onSearchQueryChange,
  onScanItem,
  originalPurchaseItemsCount,
  filteredReturnItems,
  selectedReturnIds,
  onToggleReturnItem,
  onQuantityChange,
}) => {
  return (
    <div className="mb-5 rounded-xl border border-border bg-card p-2 shadow-sm md:mb-0">
      <h3 className="mb-2 border-b border-border pb-1 text-sm font-bold text-foreground">Select Return Items</h3>
      <div className="mb-3 flex items-end gap-1">
        <div className="flex-grow">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search items in this return..."
            className="w-full rounded-md border border-border p-2 outline-none focus:ring-2 focus:ring-ring"
            autoComplete="off"
          />
        </div>
        <button onClick={onScanItem} className="flex items-center justify-center rounded-md bg-secondary p-2.5 text-secondary-foreground">
          <IconScanCircle width={24} height={24} />
        </button>
      </div>

      {originalPurchaseItemsCount === 0 && (
        <p className="mb-2 text-sm text-muted-foreground">
          No returnable items found for this purchase.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {filteredReturnItems.map((item) => (
          <ReturnListItem
            key={item.id}
            item={item}
            isSelected={selectedReturnIds.has(item.id)}
            onToggle={onToggleReturnItem}
            onQuantityChange={onQuantityChange}
            showMrp={false}
          />
        ))}
      </div>
    </div>
  );
};
