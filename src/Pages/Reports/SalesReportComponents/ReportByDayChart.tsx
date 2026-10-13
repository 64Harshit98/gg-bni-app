import { useMemo } from 'react';
import { formatCurrency, formatDateForInput } from './salesReport.utils';

// Shared by the sales and purchase reports.
interface ReportByDayChartProps {
  records: { createdAt: number; totalAmount: number }[];
  start: number;
  end: number;
  /** Chart title noun, e.g. "Sales" → "Sales by day". */
  noun?: string;
  /** Subtitle prefix for the top bucket, e.g. "Best" → "Best day 26 Sep · ₹1,800". */
  bestPrefix?: string;
}

interface Bucket {
  key: string;
  axisLabel: string;
  fullLabel: string;
  total: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Ranges longer than this are grouped by month so bars stay readable.
const MAX_DAILY_BUCKETS = 92;

const pickLabelIndexes = (length: number, count: number): number[] => {
  if (length <= count) return Array.from({ length }, (_, i) => i);
  const idx = Array.from({ length: count }, (_, i) =>
    Math.round((i * (length - 1)) / (count - 1)),
  );
  return [...new Set(idx)];
};

export default function ReportByDayChart({
  records,
  start,
  end,
  noun = 'Sales',
  bestPrefix = 'Best',
}: ReportByDayChartProps) {
  const { buckets, isMonthly, best, max } = useMemo(() => {
    // An open-ended range (e.g. custom with no start) is clamped to the first record.
    let rangeStart = start;
    if (records.length && end - start > 400 * DAY_MS) {
      rangeStart = records.reduce((min, s) => Math.min(min, s.createdAt), end);
    }

    const monthly = (end - rangeStart) / DAY_MS > MAX_DAILY_BUCKETS;
    const keyOf = (ts: number) =>
      monthly ? formatDateForInput(new Date(ts)).slice(0, 7) : formatDateForInput(new Date(ts));

    const list: Bucket[] = [];
    const cursor = new Date(rangeStart);
    cursor.setHours(0, 0, 0, 0);
    if (monthly) cursor.setDate(1);

    while (cursor.getTime() <= end) {
      const ts = cursor.getTime();
      list.push({
        key: keyOf(ts),
        axisLabel: monthly
          ? cursor.toLocaleDateString('en-GB', { month: 'short' })
          : cursor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        fullLabel: monthly
          ? cursor.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
          : cursor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        total: 0,
      });
      if (monthly) cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setDate(cursor.getDate() + 1);
    }

    const byKey = new Map(list.map((b) => [b.key, b]));
    records.forEach((s) => {
      const bucket = byKey.get(keyOf(s.createdAt));
      if (bucket) bucket.total += s.totalAmount;
    });

    let bestBucket: Bucket | null = null;
    list.forEach((b) => {
      if (b.total > 0 && (!bestBucket || b.total > bestBucket.total)) bestBucket = b;
    });

    return {
      buckets: list,
      isMonthly: monthly,
      best: bestBucket as Bucket | null,
      max: Math.max(0, ...list.map((b) => b.total)),
    };
  }, [records, start, end]);

  const unit = isMonthly ? 'month' : 'day';
  const renderAxis = (count: number, className: string) => (
    <div className={`mt-2 justify-between text-[11px] text-slate-400 ${className}`}>
      {pickLabelIndexes(buckets.length, count).map((i) => (
        <span key={buckets[i].key}>{buckets[i].axisLabel}</span>
      ))}
    </div>
  );

  return (
    <div className="h-full rounded-sm border border-line bg-white shadow-card p-4">
      <h3 className="text-sm font-semibold text-slate-900">{noun} by {unit}</h3>
      <p className="mt-0.5 hidden text-xs text-slate-500 md:block">
        {best
          ? `${bestPrefix} ${bestPrefix === 'Best' ? `${unit} ` : ''}${best.fullLabel} · ${formatCurrency(best.total)}`
          : `No ${noun.toLowerCase()} in this period`}
      </p>

      <div className="mt-4 flex h-28 items-end gap-[3px] md:h-32">
        {buckets.map((b) => {
          const pct = max > 0 ? (b.total / max) * 100 : 0;
          return (
            <div
              key={b.key}
              className="group flex h-full flex-1 items-end justify-center"
              title={`${b.fullLabel}: ${formatCurrency(b.total)}`}
            >
              <div
                className={`w-full max-w-[18px] rounded-t-[2px] ${
                  b.total > 0 ? 'bg-blue-600 group-hover:bg-blue-700' : 'bg-slate-200'
                }`}
                style={{ height: b.total > 0 ? `max(${pct}%, 3px)` : '2px' }}
              />
            </div>
          );
        })}
      </div>

      {buckets.length > 0 && (
        <>
          {renderAxis(3, 'flex md:hidden')}
          {renderAxis(5, 'hidden md:flex')}
        </>
      )}
    </div>
  );
}
