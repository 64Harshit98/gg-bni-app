import { useState, useEffect, useMemo } from 'react';
import type { Item, SalesItem } from '../../../constants/models';
import type { OrderItem } from '../../Orders';
import type { ExchangeItem } from '../ordersReturn.types';
import { computeCustomPriceApplication, computeExchangeItemPricing } from '../ordersReturn.calculations';
import { handleListChange } from './useReturnItemsSelection';

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from OrdersReturn.tsx (formatting/hoisting only — no
// behavior changes). Owns the "exchange cart" flow: adding an inventory
// item as an exchange line (addExchangeItem/handleExchangeItemSelected,
// previously ~L467-508), the per-line discount/quantity/custom-price edit
// handlers (previously ~L425-465), the exchange search + mapped-for-
// GenericCartList projection (previously ~L509-555 for the mapping part,
// L90 for the search state), the generic single-list remove helper
// (previously ~L382-384, used only for exchange items), and the
// mode-of-return-changes-away-from-Exchange cleanup effect (previously
// ~L904-909).
//
// `exchangeItems` is NOT owned here — it's also written from
// useSaleSelection (handleClear), useItemEditDrawer (handleSaveSuccess),
// and useReturnTransaction (handleProcessReturn's "no exchange items"
// guards), so per the cross-hook-dependency convention it was lifted to
// OrdersReturn.tsx and threaded into this hook (and every other hook that
// needs it) as a param.
// ─────────────────────────────────────────────────────────────────────────

interface UseExchangeItemsParams {
  availableItems: OrderItem[];
  exchangeItems: ExchangeItem[];
  setExchangeItems: React.Dispatch<React.SetStateAction<ExchangeItem[]>>;
  modeOfReturn: string;
}

export const useExchangeItems = ({
  availableItems,
  exchangeItems,
  setExchangeItems,
  modeOfReturn,
}: UseExchangeItemsParams) => {
  const [exchangeSearchQuery, setExchangeSearchQuery] = useState<string>('');

  useEffect(() => {
    if (modeOfReturn !== 'Exchange') {
      setExchangeItems([]);
      setExchangeSearchQuery('');
    }
  }, [modeOfReturn]);

  const handleRemoveFromList = (setter: any, id: string) => {
    setter((prev: any[]) => prev.filter((item: any) => item.id !== id));
  };

  const handleDiscountChange = (id: string, discountValue: number | string) => {
    const val = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;
    handleListChange(setExchangeItems, id, 'discount', val);
  };

  const handleQuantityChange = (id: string, newQuantity: number) => {
    const item = exchangeItems.find(i => i.id === id);
    if (!item) return;


    handleListChange(setExchangeItems, id, 'quantity', Math.max(1, newQuantity));
  };

  const handleCustomPriceChange = (id: string, value: string) => {
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setExchangeItems(prev => prev.map(item => item.id === id ? { ...item, customPrice: value } : item));
    }
  };

  const handleCustomPriceBlur = (id: string) => {
    setExchangeItems(prev =>
      prev.map(item => {
        if (item.id === id && item.customPrice !== undefined) {
          const num = parseFloat(String(item.customPrice));

          if (!isNaN(num)) {
            const application = computeCustomPriceApplication(item.mrp, item.quantity, num);

            return {
              ...item,
              ...application,
              customPrice: undefined
            };
          }

          return { ...item, customPrice: undefined };
        }
        return item;
      })
    );
  };

  const addExchangeItem = (itemToAdd: Item) => {
    const mrp = Number(itemToAdd.mrp || 0);
    const salesPrice = Number(itemToAdd.salesPrice || 0);
    const presetDiscount = Number(itemToAdd.discount || 0);

    const { finalExchangePrice, calculatedDiscount } = computeExchangeItemPricing(
      mrp,
      salesPrice,
      presetDiscount
    );

    setExchangeItems(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        originalItemId: itemToAdd.id!,
        name: itemToAdd.name,

        quantity: 1,
        unitMultiplier: 1,

        unitPrice: finalExchangePrice,
        amount: finalExchangePrice,

        mrp: mrp,
        salesPrice: salesPrice,

        discount: parseFloat(calculatedDiscount.toFixed(2)),
        basePrice: mrp,
      }
    ]);
  };

  const handleExchangeItemSelected = (item: any) => {
    if (item) {
      // FIX: Ensure purchasePrice is a number before passing to addExchangeItem
      addExchangeItem({
        ...item,
        purchasePrice: item.purchasePrice ?? 0
      });
    }
  };

  const mappedExchangeItems: SalesItem[] = useMemo(() => {
    const mapped = exchangeItems.map(item => {
      const realItem = availableItems.find(i => i.id === item.originalItemId);

      return {
        id: item.id,
        productId: item.originalItemId,
        name: item.name,
        mrp: item.mrp,
        quantity: item.quantity,
        discount: item.discount,
        isEditable: true,
        purchasePrice: 0,
        tax: 0,
        itemGroupId: 0,
        stock: realItem?.stock ?? 0,
        amount: item.amount,
        barcode: '',
        restockQuantity: 0,
        customPrice: item.customPrice ?? item.unitPrice,
      } as SalesItem;
    });
    const q = exchangeSearchQuery.trim().toLowerCase();
    if (!q) return mapped;

    // 👈 NEW: same "search bumps result to top" behavior as the Orders page search
    return [...mapped].sort((a, b) => {
      const aMatch = (a.name || '').toLowerCase().includes(q);
      const bMatch = (b.name || '').toLowerCase().includes(q);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return 0; // keep original relative order otherwise
    });
  }, [exchangeItems, availableItems, exchangeSearchQuery]);

  return {
    exchangeSearchQuery, setExchangeSearchQuery,
    handleRemoveFromList,
    handleDiscountChange,
    handleQuantityChange,
    handleCustomPriceChange,
    handleCustomPriceBlur,
    addExchangeItem,
    handleExchangeItemSelected,
    mappedExchangeItems,
  };
};
