import { useMemo } from 'react';
import type { Order } from '../../Orders';
import type { TransactionItem, ExchangeItem } from '../ordersReturn.types';
import { computeReturnSummary } from '../ordersReturn.calculations';

// ─────────────────────────────────────────────────────────────────────────
// Moved verbatim from OrdersReturn.tsx (formatting/hoisting only — no
// behavior changes). Owns the live on-screen return-value/exchange-value/
// final-balance summary — previously the
// `useMemo(() => computeReturnSummary(...), [...])` block directly in the
// component body (previously ~L589-598).
//
// NOTE: same as the original, `totalReturnValue` is computed inside
// computeReturnSummary but not destructured/returned here — dead-but-
// harmless, preserved as-is.
// ─────────────────────────────────────────────────────────────────────────

export const useReturnSummary = (
  itemsToReturn: TransactionItem[],
  exchangeItems: ExchangeItem[],
  selectedSale: Order | null,
  modeOfReturn: string
) => {
  const {
    totalReturnGross,
    totalExchangeValue,
    finalBalance,
    discountDeducted
  } = useMemo(
    () => computeReturnSummary(itemsToReturn, exchangeItems, selectedSale, modeOfReturn),
    [itemsToReturn, exchangeItems, selectedSale, modeOfReturn]
  );

  return { totalReturnGross, totalExchangeValue, finalBalance, discountDeducted };
};
