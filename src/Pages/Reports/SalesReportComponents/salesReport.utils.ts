export const formatDate = (timestamp: number): string => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

export const formatDateForInput = (date: Date): string => {
  // Use local time methods to prevent UTC timezone shifting
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};
interface SalesItem {
  name: string;
  mrp: number;
  quantity: number;
}
interface PaymentMethods {
  [key: string]: number;
}
export interface SaleRecord {
  id: string;
  partyName: string;
  partyNumber?: string;
  invoiceNumber: string;
  totalAmount: number;
  paymentMethods: PaymentMethods;
  /** Legacy due field; `paymentMethods.due` is kept up to date on payments. */
  dueAmount?: number;
  createdAt: number;
  items: SalesItem[];
  [key: string]: any;
}

/* ---------- DATE HELPERS ---------- */

// Parses a yyyy-mm-dd input value as a local date (new Date('yyyy-mm-dd') is UTC).
export const parseInputDate = (value: string): Date => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const formatDayMonth = (timestamp: number, padDay = true): string =>
  new Date(timestamp).toLocaleDateString('en-GB', {
    day: padDay ? '2-digit' : 'numeric',
    month: 'short',
  });

export const formatFullDate = (timestamp: number): string =>
  new Date(timestamp).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export const formatRangeLabel = (
  start: number,
  end: number,
  withYear = true,
): string => {
  const s = new Date(start);
  const e = new Date(end);
  if (s.toDateString() === e.toDateString()) {
    return withYear ? formatFullDate(start) : formatDayMonth(start);
  }
  if (s.getFullYear() !== e.getFullYear()) {
    return `${formatFullDate(start)} – ${formatFullDate(end)}`;
  }
  const tail = withYear ? ` ${e.getFullYear()}` : '';
  return `${formatDayMonth(start)} – ${formatDayMonth(end)}${tail}`;
};

export type DatePreset =
  | 'today'
  | 'week'
  | 'month'
  | 'last30'
  | 'lastMonth'
  | 'fy'
  | 'custom';

export const DATE_PRESETS: { value: DatePreset; label: string; shortLabel: string }[] = [
  { value: 'today', label: 'Today', shortLabel: 'Today' },
  { value: 'week', label: 'This week', shortLabel: 'Week' },
  { value: 'month', label: 'This month', shortLabel: 'Month' },
  { value: 'last30', label: 'Last 30 days', shortLabel: '30 days' },
  { value: 'lastMonth', label: 'Last month', shortLabel: 'Last month' },
  { value: 'fy', label: 'This FY', shortLabel: 'This FY' },
];

export const getPresetRange = (
  preset: string,
): { start: Date; end: Date } | null => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  switch (preset) {
    case 'today':
      break;
    case 'week': // week starts on Monday
      start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      break;
    case 'month':
      start.setDate(1);
      break;
    case 'last30':
      start.setDate(now.getDate() - 29);
      break;
    case 'lastMonth':
      start.setMonth(now.getMonth() - 1, 1);
      end.setDate(0); // last day of previous month
      break;
    case 'fy': // Indian financial year starts 1 April
      start.setFullYear(
        now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1,
        3,
        1,
      );
      break;
    default:
      return null;
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

/* ---------- SALE HELPERS ---------- */

export const formatCurrency = (value: number): string =>
  `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const getSaleItemCount = (sale: SaleRecord): number =>
  (sale.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

const WALK_IN_NAMES = ['', 'n/a', 'na', 'walk-in', 'walk in', 'walkin', 'cash', 'cash sale', 'guest'];

export const isWalkIn = (sale: SaleRecord): boolean =>
  WALK_IN_NAMES.includes((sale.partyName || '').trim().toLowerCase());

export const formatPhone = (phone?: string): string => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 10) return phone || '';
  const last10 = digits.slice(-10);
  return `${last10.slice(0, 5)} ${last10.slice(5)}`;
};

/* ---------- PAYMENT MODE HELPERS ---------- */

export type PayMode = 'upi' | 'cash' | 'card' | 'other' | 'due';

export const PAY_MODE_ORDER: PayMode[] = ['upi', 'cash', 'card', 'other', 'due'];

export const PAY_MODE_META: Record<PayMode, { label: string; badge: string; bar: string }> = {
  upi: { label: 'UPI', badge: 'bg-blue-50 text-blue-700', bar: 'bg-blue-600' },
  cash: { label: 'Cash', badge: 'bg-slate-100 text-slate-700', bar: 'bg-green-700' },
  card: { label: 'Card', badge: 'bg-violet-50 text-violet-700', bar: 'bg-violet-600' },
  other: { label: 'Other', badge: 'bg-slate-100 text-slate-600', bar: 'bg-slate-500' },
  due: { label: 'Udhaar', badge: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
};

export const normalizePayMode = (key: string): PayMode => {
  const k = key.toLowerCase().replace(/[^a-z]/g, '');
  if (k.includes('cash')) return 'cash';
  if (k.includes('upi')) return 'upi';
  if (k.includes('card')) return 'card';
  if (k === 'due' || k === 'udhaar' || k === 'credit') return 'due';
  return 'other';
};

// Amount paid per mode for one bill (only modes with a positive amount).
export const getSalePayModes = (sale: SaleRecord): Partial<Record<PayMode, number>> => {
  const totals: Partial<Record<PayMode, number>> = {};
  Object.entries(sale.paymentMethods || {}).forEach(([key, value]) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const mode = normalizePayMode(key);
    totals[mode] = (totals[mode] || 0) + amount;
  });
  return totals;
};

export type PaymentBreakdown = Record<PayMode, { amount: number; bills: number }>;

export const getPaymentBreakdown = (sales: SaleRecord[]): PaymentBreakdown => {
  const breakdown = Object.fromEntries(
    PAY_MODE_ORDER.map((m) => [m, { amount: 0, bills: 0 }]),
  ) as PaymentBreakdown;
  sales.forEach((sale) => {
    Object.entries(getSalePayModes(sale)).forEach(([mode, amount]) => {
      breakdown[mode as PayMode].amount += amount || 0;
      breakdown[mode as PayMode].bills += 1;
    });
  });
  return breakdown;
};
