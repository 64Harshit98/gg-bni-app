import React from 'react';
import { formatCurrency } from '../../../utils/formatters';

interface PurchaseReturnSummaryCardProps {
  hasSelectedPurchase: boolean;
  modeOfReturn: string;
  onModeOfReturnChange: (mode: string) => void;
  isPurchaseUnpaid: boolean;
  totalReturnValue: number;
  discountDeducted: number;
  totalNewItemsValue: number;
  finalBalance: number;
  exchangeBalanceAction: 'Debit Note' | 'Cash Refund';
  onExchangeBalanceActionChange: (action: 'Debit Note' | 'Cash Refund') => void;
  balanceLabel: string;
  onProcessReturn: () => void;
}

/**
 * Desktop right-hand "Return Summary" panel: transaction-type select,
 * gross/discount/net financials, and the final balance + process button.
 * Extracted verbatim (styling reskinned onto design tokens, and money
 * values now routed through `formatCurrency`) from `PurchaseReturn.tsx`'s
 * inline right-panel JSX.
 */
export const PurchaseReturnSummaryCard: React.FC<PurchaseReturnSummaryCardProps> = ({
  hasSelectedPurchase,
  modeOfReturn,
  onModeOfReturnChange,
  isPurchaseUnpaid,
  totalReturnValue,
  discountDeducted,
  totalNewItemsValue,
  finalBalance,
  exchangeBalanceAction,
  onExchangeBalanceActionChange,
  balanceLabel,
  onProcessReturn,
}) => {
  return (
    <div className="relative z-10 hidden h-full w-[35%] flex-col border-l border-border bg-card p-6 shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] md:flex">
      {hasSelectedPurchase ? (
        <div className="flex h-full flex-col">
          <h2 className="mb-6 border-b border-border pb-2 text-xl font-bold text-foreground">Return Summary</h2>

          {/* Transaction Type */}
          <div className="mb-6">
            <label className="mb-2 block text-sm font-semibold text-muted-foreground">Transaction Type</label>
            <select
              value={modeOfReturn}
              onChange={(e) => onModeOfReturnChange(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted p-3 outline-none focus:ring-2 focus:ring-ring"
            >
              <option>Exchange</option>
              <option disabled={isPurchaseUnpaid}>Debit Note</option>
              <option>Cash Refund</option>
            </select>
          </div>

          {/* Financials */}
          <div className="flex-grow space-y-4 rounded-xl border border-border bg-muted p-2 text-sm text-foreground">
            <div className="flex justify-between">
              <span>Gross Return Value</span>
              <span className="font-medium">{formatCurrency(totalReturnValue)}</span>
            </div>
            {discountDeducted > 0 && (
              <div className="flex justify-between text-warning">
                <span>Less: Proportional Discount</span>
                <span>- {formatCurrency(discountDeducted)}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-2 font-semibold">
              <span>Net Return Value</span>
              <span className="text-destructive">{formatCurrency(totalReturnValue - discountDeducted)}</span>
            </div>

            {modeOfReturn === 'Exchange' && (
              <div className="mt-2 flex justify-between text-success">
                <span>New Items Value</span>
                <span>- {formatCurrency(totalNewItemsValue)}</span>
              </div>
            )}
          </div>

          {/* Final Total */}
          <div className="mt-auto border-t border-border pt-4">
            <div className="mb-4 flex items-end justify-between">
              {modeOfReturn === 'Exchange' && finalBalance > 0 ? (
                <select
                  value={exchangeBalanceAction}
                  onChange={(e) => onExchangeBalanceActionChange(e.target.value as 'Debit Note' | 'Cash Refund')}
                  className="cursor-pointer border-b-2 border-border bg-transparent pb-1 pr-2 font-medium text-muted-foreground outline-none transition-colors hover:border-muted-foreground focus:border-primary"
                >
                  <option value="Debit Note">Debit Note</option>
                  <option value="Cash Refund">Cash Refund</option>
                </select>
              ) : (
                <span className="font-medium text-muted-foreground">{balanceLabel}</span>
              )}
              <span className={`text-3xl font-bold ${finalBalance >= 0 ? 'text-success' : 'text-warning'}`}>
                {formatCurrency(Math.abs(finalBalance))}
              </span>
            </div>
            <button
              onClick={onProcessReturn}
              className="w-full rounded-xl bg-primary px-4 py-4 text-lg font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:opacity-90"
            >
              Process Transaction
            </button>
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
          <p>Select a purchase to begin return</p>
        </div>
      )}
    </div>
  );
};
