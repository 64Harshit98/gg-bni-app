/**
 * Shared formatting helpers (currency, number, date) for display across
 * reports, catalogue, and settings pages. A grep for `toLocaleString` /
 * `Intl.NumberFormat` / `formatCurrency` / `formatDate` under `src/lib`,
 * `src/Pages/utils`, and `src/Catalogue/utils` found no existing central
 * helper (call sites format inline, e.g. `` `₹${value.toLocaleString('en-IN')}` ``
 * in `src/Components/SalesCard.tsx`) and confirmed the app formats currency
 * as Indian Rupees with `en-IN` locale grouping, so these are written fresh
 * with that convention.
 */

const INR_CURRENCY_FORMATTER = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
});

const INR_NUMBER_FORMATTER = new Intl.NumberFormat('en-IN');

/** Formats a number as Indian Rupees, e.g. `formatCurrency(125000)` -> "₹1,25,000.00". */
export function formatCurrency(value: number): string {
  return INR_CURRENCY_FORMATTER.format(value);
}

/** Formats a number using Indian digit grouping, e.g. `formatNumber(125000)` -> "1,25,000". */
export function formatNumber(value: number): string {
  return INR_NUMBER_FORMATTER.format(value);
}

export type DateFormatStyle = 'short' | 'medium' | 'long';

const DATE_FORMAT_OPTIONS: Record<DateFormatStyle, Intl.DateTimeFormatOptions> = {
  short: { day: '2-digit', month: '2-digit', year: 'numeric' },
  medium: { day: '2-digit', month: 'short', year: 'numeric' },
  long: {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  },
};

/**
 * Formats a date (Date, ISO string, or timestamp) for display. Defaults to
 * a `dd MMM yyyy` style commonly used across report tables. Returns "-" for
 * an invalid/unparseable input.
 */
export function formatDate(date: Date | string | number, style: DateFormatStyle = 'medium'): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('en-IN', DATE_FORMAT_OPTIONS[style]).format(d);
}
