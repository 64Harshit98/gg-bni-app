import { useState } from 'react';
import type { Item } from '../../../constants/models';
import type { OrderItem } from '../../Orders';
import type { ExchangeItem } from '../ordersReturn.types';
import { recomputeExchangeItemPricingOnEdit } from '../ordersReturn.calculations';

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from OrdersReturn.tsx (formatting/hoisting only — no
// behavior changes). Owns the "edit an item's master data mid-return via
// the ItemEditDrawer" flow (previously ~L88-89, ~L286-336): the drawer's
// open/selected-item state, the close handler, and the save-success handler
// that both patches the local availableItems cache and keeps any
// already-added exchange line in sync via recomputeExchangeItemPricingOnEdit.
//
// `availableItems`/`exchangeItems` are NOT owned here — both are owned by
// other hooks (availableItems by the lookup fetch, exchangeItems by
// useExchangeItems) and this handler is the one genuine cross-hook writer
// of each, so per the cross-hook-dependency convention their setters were
// threaded into this hook as params rather than the state being duplicated
// or moved here.
// ─────────────────────────────────────────────────────────────────────────

interface UseItemEditDrawerParams {
  setAvailableItems: React.Dispatch<React.SetStateAction<OrderItem[]>>;
  setExchangeItems: React.Dispatch<React.SetStateAction<ExchangeItem[]>>;
}

export const useItemEditDrawer = ({
  setAvailableItems,
  setExchangeItems,
}: UseItemEditDrawerParams) => {
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<Item | null>(null);
  const [isItemDrawerOpen, setIsItemDrawerOpen] = useState(false);

  const handleCloseEditDrawer = () => { setIsItemDrawerOpen(false); setTimeout(() => setSelectedItemForEdit(null), 300); };

  const handleSaveSuccess = (updatedItemData: Partial<Item>) => {
    if (!selectedItemForEdit) return;

    setAvailableItems(prev =>
      prev.map(item => {
        if (item.id !== selectedItemForEdit.id) return item;

        return {
          ...item,
          ...updatedItemData,
          name: updatedItemData.name ?? item.name,
          mrp: Number(updatedItemData.mrp ?? item.mrp),
          salesPrice: Number(updatedItemData.salesPrice ?? item.salesPrice),
          moq:
            updatedItemData.moq !== undefined
              ? Number(updatedItemData.moq)
              : (item as any).moq ?? 1,
        } as OrderItem;
      })
    );

    setExchangeItems(prev =>
      prev.map(item => {
        if (item.originalItemId !== selectedItemForEdit.id) return item;

        const newMrp = Number(updatedItemData.mrp ?? item.mrp);
        const newSalesPrice = Number(updatedItemData.salesPrice ?? item.salesPrice);

        const { finalPrice, discount, newAmount } = recomputeExchangeItemPricingOnEdit(
          newMrp,
          newSalesPrice,
          item.quantity
        );

        return {
          ...item,
          mrp: newMrp,
          salesPrice: newSalesPrice,
          unitPrice: finalPrice,
          basePrice: finalPrice,
          discount: parseFloat(discount.toFixed(2)),
          amount: newAmount,
        };
      })
    );

    setIsItemDrawerOpen(false);
    setSelectedItemForEdit(null);
  };

  return {
    selectedItemForEdit, setSelectedItemForEdit,
    isItemDrawerOpen, setIsItemDrawerOpen,
    handleCloseEditDrawer,
    handleSaveSuccess,
  };
};
