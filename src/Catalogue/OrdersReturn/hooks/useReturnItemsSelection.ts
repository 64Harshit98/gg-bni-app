import { useState, useMemo } from 'react';
import type { TransactionItem, ExchangeItem } from '../ordersReturn.types';
import { computeDiscountRoundedPrice } from '../ordersReturn.calculations';

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from OrdersReturn.tsx (formatting/hoisting only — no
// behavior changes). Owns the "which original-sale lines are marked for
// return" list: the itemsToReturn/filteredReturnItems derivations
// (previously ~L93-99 and ~L509-520) and the toggle handler (previously
// ~L275-284).
//
// `originalSaleItems`/`selectedReturnIds` are NOT owned here — both are
// also written from useSaleSelection (handleSelectSale/handleClear) and
// from useReturnTransaction's saveReturnTransaction (post-save reset), so
// per the cross-hook-dependency convention they were lifted to
// OrdersReturn.tsx and threaded into this hook as params.
//
// `handleListChange` is exported as a plain (non-hook) utility alongside
// this hook rather than folded into its returned object: it's a generic
// setState-taking field editor with no state of its own, used verbatim
// as-is by both this hook's domain (return-item quantity edits, called
// directly from JSX with setOriginalSaleItems) and useExchangeItems'
// domain (discount/quantity edits, called with setExchangeItems) — moved
// verbatim from OrdersReturn.tsx's handleListChange (previously ~L338-380).
// ─────────────────────────────────────────────────────────────────────────

export const handleListChange = (
  setter: React.Dispatch<React.SetStateAction<any[]>>,
  id: string,
  field: keyof TransactionItem | keyof ExchangeItem,
  value: string | number
) => {
  setter(prev =>
    prev.map(item => {
      if (item.id !== id) return item;

      let safeValue = value;

      if (field === 'quantity') {
        const num = Number(value) || 1;

        //  Return Items Validation
        if ((item as any).originalQuantity !== undefined) {
          const maxQty = (item as any).originalQuantity;
          safeValue = Math.min(Math.max(1, num), maxQty);
        }
      }

      const updatedItem = { ...item, [field]: safeValue };

      if (field === 'discount') {
        const discountValue = Number(value) || 0;
        updatedItem.unitPrice = computeDiscountRoundedPrice(item.mrp, discountValue);
      }

      if (
        field === 'quantity' ||
        field === 'unitPrice' ||
        field === 'discount'
      ) {
        updatedItem.amount =
          Number(updatedItem.quantity) *
          Number(updatedItem.unitPrice);
      }

      return updatedItem;
    })
  );
};

interface UseReturnItemsSelectionParams {
  originalSaleItems: TransactionItem[];
  setOriginalSaleItems: React.Dispatch<React.SetStateAction<TransactionItem[]>>;
  selectedReturnIds: Set<string>;
  setSelectedReturnIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  modeOfReturn: string;
}

export const useReturnItemsSelection = ({
  originalSaleItems,
  selectedReturnIds,
  setSelectedReturnIds,
  modeOfReturn,
}: UseReturnItemsSelectionParams) => {
  const [returnItemSearchQuery, setReturnItemSearchQuery] = useState<string>('');

  const itemsToReturn = useMemo(() => {
    if (modeOfReturn === 'Exchange') {
      return originalSaleItems.filter(item => selectedReturnIds.has(item.id));
    }

    return originalSaleItems.filter(item => selectedReturnIds.has(item.id));
  }, [originalSaleItems, selectedReturnIds, modeOfReturn]);

  const handleToggleReturnItem = (itemId: string) => {
    if (!originalSaleItems.find(i => i.id === itemId)) return;

    setSelectedReturnIds(prevIds => {
      const newIds = new Set(prevIds);
      if (newIds.has(itemId)) newIds.delete(itemId);
      else newIds.add(itemId);
      return newIds;
    });
  };

  const filteredReturnItems = useMemo(() => {
    const q = returnItemSearchQuery.trim().toLowerCase();
    if (!q) return originalSaleItems;

    return [...originalSaleItems].sort((a, b) => {
      const aMatch = (a.name || '').toLowerCase().includes(q);
      const bMatch = (b.name || '').toLowerCase().includes(q);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0;
    });
  }, [originalSaleItems, returnItemSearchQuery]);

  return {
    returnItemSearchQuery, setReturnItemSearchQuery,
    itemsToReturn,
    filteredReturnItems,
    handleToggleReturnItem,
  };
};
