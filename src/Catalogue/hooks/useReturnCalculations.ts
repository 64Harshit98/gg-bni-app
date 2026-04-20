import { useMemo } from 'react';
import type { Order } from '../Pages/Orders';

interface TransactionItem {
  id: string;
  originalItemId: string;
  name: string;
  mrp: number;
  quantity: number;
  unitPrice: number;
  amount: number;
}

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

interface ReturnCalculations {
  totalReturnGross: number;
  totalReturnValue: number;
  totalExchangeValue: number;
  finalBalance: number;
  discountDeducted: number;
}

export function useReturnCalculations(
  itemsToReturn: TransactionItem[],
  exchangeItems: ExchangeItem[],
  selectedSale: Order | null,
  modeOfReturn: string
): ReturnCalculations {
  return useMemo(() => {
    const trg = itemsToReturn.reduce((sum, item) => sum + (item.amount || 0), 0);
    const tev = exchangeItems.reduce((sum, item) => sum + (item.amount || 0), 0);

    let dd = 0;

    if (selectedSale) {
      const baseItems = selectedSale.items || [];
      const originalInvoiceTotal = baseItems.reduce(
        (sum: number, item: any) => sum + Number(item.finalPrice || 0),
        0
      );
      const originalManualDiscount = Number(selectedSale.manualDiscount) || 0;

      if (originalInvoiceTotal > 0 && originalManualDiscount > 0) {
        const ratio = trg / originalInvoiceTotal;
        dd = Math.round(originalManualDiscount * ratio * 100) / 100;
      }
    }

    const totalReturnValue = trg - dd;
    const fb = modeOfReturn === 'Exchange' ? totalReturnValue - tev : totalReturnValue;

    return {
      totalReturnGross: trg,
      totalReturnValue,
      totalExchangeValue: tev,
      finalBalance: fb,
      discountDeducted: dd,
    };
  }, [itemsToReturn, exchangeItems, selectedSale, modeOfReturn]);
}
