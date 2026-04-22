import React from 'react';

// ─── PaymentBadges ───────────────────────────────────────────────────────────

interface PaymentBadgesProps {
  /**
   * Raw paymentMethods map, e.g. { cash: 500, upi: 200, due: 100 }.
   * 'due' is always excluded from badges.
   */
  paymentMethods?: Record<string, number>;
  className?: string;
}

/**
 * Renders blue payment-method chips for each method with a positive amount.
 * Used in both Journal (invoice cards) and OrdersPage (order cards).
 *
 * Usage:
 * ```tsx
 * <PaymentBadges paymentMethods={invoice.paymentMethods} />
 * ```
 */
export const PaymentBadges: React.FC<PaymentBadgesProps> = ({
  paymentMethods = {},
  className = '',
}) => {
  const activeModes = Object.entries(paymentMethods).filter(
    ([key, value]) => key !== 'due' && Number(value) > 0
  );

  if (activeModes.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {activeModes.map(([mode]) => (
        <span
          key={mode}
          className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider bg-blue-50 text-blue-600 border-blue-100 whitespace-nowrap"
        >
          {mode === 'upi' ? 'UPI' : mode.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  );
};

// ─── ReturnBadges ────────────────────────────────────────────────────────────

interface ReturnHistoryItem {
  modeOfReturn?: string;
  [key: string]: any;
}

interface ReturnBadgesProps {
  returnHistory?: ReturnHistoryItem[];
  className?: string;
}

/**
 * Renders orange return-method chips for each return in history.
 * Used in both Journal (invoice cards) and OrdersPage (order cards).
 *
 * Usage:
 * ```tsx
 * <ReturnBadges returnHistory={invoice.returnHistory} />
 * ```
 */
export const ReturnBadges: React.FC<ReturnBadgesProps> = ({
  returnHistory = [],
  className = '',
}) => {
  if (returnHistory.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {returnHistory.map((item, index) => (
        <span
          key={index}
          className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider bg-orange-50 text-orange-600 border-orange-200 whitespace-nowrap"
        >
          {item.modeOfReturn || 'Return'}
        </span>
      ))}
    </div>
  );
};
