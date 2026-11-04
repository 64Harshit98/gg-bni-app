import {
  PAY_MODE_META,
  PAY_MODE_ORDER,
  formatCurrency,
  type PaymentBreakdown,
} from './salesReport.utils';

// Cash, UPI and Udhaar are always listed; other modes only when used.
const ALWAYS_SHOWN = ['upi', 'cash', 'due'];

export default function PaymentModeCard({ breakdown }: { breakdown: PaymentBreakdown }) {
  const modes = PAY_MODE_ORDER.filter(
    (m) => ALWAYS_SHOWN.includes(m) || breakdown[m].amount > 0,
  );
  const total = modes.reduce((sum, m) => sum + breakdown[m].amount, 0);

  return (
    <div className="h-full rounded-sm border border-line bg-white shadow-card p-4">
      <h3 className="text-sm font-semibold text-slate-900">By payment mode</h3>
      <ul className="mt-4 space-y-4">
        {modes.map((mode) => {
          const { amount, bills } = breakdown[mode];
          const pct = total > 0 ? (amount / total) * 100 : 0;
          return (
            <li key={mode}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-700">
                  {PAY_MODE_META[mode].label} · {bills} {bills === 1 ? 'bill' : 'bills'}
                </span>
                <span className="font-semibold text-slate-900">{formatCurrency(amount)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-slate-100">
                <div
                  className={`h-full rounded-sm ${PAY_MODE_META[mode].bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
