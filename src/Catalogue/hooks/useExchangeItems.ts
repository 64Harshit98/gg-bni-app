import { useState, useMemo } from 'react';
import type { Item } from '../../constants/models';
import type { SalesItem } from '../../constants/models';
import type { OrderItem } from '../Orders';
import { State } from '../../enums';

interface ExchangeItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  salesPrice: number;
  amount: number;
  discount: number;
  basePrice: number;
  customPrice?: number | string;
}

interface UseExchangeItemsResult {
  exchangeItems: ExchangeItem[];
  setExchangeItems: React.Dispatch<React.SetStateAction<ExchangeItem[]>>;
  mappedExchangeItems: SalesItem[];
  addExchangeItem: (item: Item) => void;
  handleExchangeItemSelected: (item: any) => void;
  handleQuantityChange: (id: string, newQuantity: number) => void;
  handleDiscountChange: (id: string, value: number | string) => void;
  handleCustomPriceChange: (id: string, value: string) => void;
  handleCustomPriceBlur: (id: string) => void;
  handleRemoveExchangeItem: (id: string) => void;
}

export function useExchangeItems(
  availableItems: OrderItem[],
  setModal: (modal: { message: string; type: State } | null) => void
): UseExchangeItemsResult {
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);

  const addExchangeItem = (itemToAdd: Item) => {
    const mrp = Number(itemToAdd.mrp || 0);
    const salesPrice = Number(itemToAdd.salesPrice || 0);
    const presetDiscount = Number(itemToAdd.discount || 0);

    let finalExchangePrice = mrp;
    let calculatedDiscount = 0;

    if (salesPrice > 0) {
      finalExchangePrice = salesPrice;
      if (mrp > 0) calculatedDiscount = ((mrp - salesPrice) / mrp) * 100;
    } else if (presetDiscount > 0) {
      calculatedDiscount = presetDiscount;
      finalExchangePrice = mrp * (1 - presetDiscount / 100);
    }

    if ((itemToAdd.stock ?? 0) <= 0) {
      setModal({ type: State.ERROR, message: 'This item is out of stock.' });
      return;
    }

    setExchangeItems(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        originalItemId: itemToAdd.id!,
        name: itemToAdd.name,
        quantity: (itemToAdd as any).unitMultiplier || 1,
        unitMultiplier: (itemToAdd as any).unitMultiplier || 1,
        unitPrice: finalExchangePrice,
        amount: finalExchangePrice,
        mrp,
        salesPrice,
        discount: parseFloat(calculatedDiscount.toFixed(2)),
        basePrice: mrp,
      },
    ]);
  };

  const handleExchangeItemSelected = (item: any) => {
    if (item) addExchangeItem({ ...item, purchasePrice: item.purchasePrice ?? 0 });
  };

  const handleQuantityChange = (id: string, newQuantity: number) => {
    const item = exchangeItems.find(i => i.id === id);
    if (!item) return;

    const realItem = availableItems.find(i => i.id === item.originalItemId);
    const stock = realItem?.stock ?? 0;

    if (newQuantity > stock) {
      setModal({ type: State.ERROR, message: "You don't have enough stock for this item." });
      return;
    }

    setExchangeItems(prev =>
      prev.map(i => {
        if (i.id !== id) return i;
        const qty = Math.max(1, newQuantity);
        return { ...i, quantity: qty, amount: qty * i.unitPrice };
      })
    );
  };

  const handleDiscountChange = (id: string, discountValue: number | string) => {
    const val = typeof discountValue === 'string' ? parseFloat(discountValue) : discountValue;

    setExchangeItems(prev =>
      prev.map(item => {
        if (item.id !== id) return item;

        const basePrice = Number(item.mrp) || 0;
        let newPrice = basePrice * (1 - val / 100);

        if (val > 0) {
          newPrice = newPrice < 100
            ? Math.ceil(newPrice / 5) * 5
            : Math.ceil(newPrice / 10) * 10;
        } else {
          newPrice = basePrice;
        }

        return {
          ...item,
          discount: val,
          unitPrice: newPrice,
          amount: newPrice * item.quantity,
        };
      })
    );
  };

  const handleCustomPriceChange = (id: string, value: string) => {
    if (value === '' || /^[0-9]*\.?[0-9]*$/.test(value)) {
      setExchangeItems(prev =>
        prev.map(item => item.id === id ? { ...item, customPrice: value } : item)
      );
    }
  };

  const handleCustomPriceBlur = (id: string) => {
    setExchangeItems(prev =>
      prev.map(item => {
        if (item.id !== id || item.customPrice === undefined) return item;

        const num = parseFloat(String(item.customPrice));
        if (isNaN(num)) return { ...item, customPrice: undefined };

        const mrp = Number(item.mrp || 0);
        const discount = mrp > 0 ? ((mrp - num) / mrp) * 100 : 0;

        return {
          ...item,
          unitPrice: Number(num.toFixed(2)),
          basePrice: mrp,
          discount: Number(discount.toFixed(2)),
          amount: Number((num * item.quantity).toFixed(2)),
          customPrice: undefined,
        };
      })
    );
  };

  const handleRemoveExchangeItem = (id: string) => {
    setExchangeItems(prev => prev.filter(item => item.id !== id));
  };

  const mappedExchangeItems: SalesItem[] = useMemo(() => {
    return exchangeItems.map(item => {
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
  }, [exchangeItems, availableItems]);

  return {
    exchangeItems,
    setExchangeItems,
    mappedExchangeItems,
    addExchangeItem,
    handleExchangeItemSelected,
    handleQuantityChange,
    handleDiscountChange,
    handleCustomPriceChange,
    handleCustomPriceBlur,
    handleRemoveExchangeItem,
  };
}
