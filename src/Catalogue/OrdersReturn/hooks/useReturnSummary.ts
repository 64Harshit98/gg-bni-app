import { useMemo } from 'react';
import type { Order, OrderItem } from '../../Orders';
import type { TransactionItem, ExchangeItem } from '../ordersReturn.types';
import { computeOrderReturn } from '../ordersReturn.calculations';

// Live return-value / exchange-value / balance summary on the return screen.
// Same computeOrderReturn the save uses, so what's shown is what gets saved.
export const useReturnSummary = (
  itemsToReturn: TransactionItem[],
  exchangeItems: ExchangeItem[],
  selectedSale: Order | null,
  modeOfReturn: string,
  availableItems: OrderItem[],
  paidSoFar: number
) => {
  const result = useMemo(
    () => computeOrderReturn(selectedSale as any, itemsToReturn, exchangeItems, modeOfReturn, availableItems as any[], paidSoFar),
    [itemsToReturn, exchangeItems, selectedSale, modeOfReturn, availableItems, paidSoFar]
  );

  return {
    totalReturnGross: result.totalReturnGross,
    returnExclusiveTax: result.returnExclusiveTax,
    returnTax: result.returnTax,
    totalReturnValue: result.totalReturnValue,
    totalExchangeValue: result.totalExchangeValue,
    roundOff: result.roundOff,
    finalBalance: result.finalBalance,
    refundable: result.refundable,
    dueReduction: result.dueReduction,
    discountDeducted: result.discountDeducted,
  };
};
