import type { Invoice } from './journal.types';

// ─── UI helpers (display only), shared by the bill list and the bill detail ──
export const fmt = (n: number) =>
  Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
export const fmt0 = (n: number) =>
  Number(n).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 });

// 1 lakh+ → "₹1.18 Cr" / "₹2.5 L", below 1 lakh → normal full amount
export const fmtCompact = (n: number) => {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  const trim = (v: number) => v.toFixed(2).replace(/\.?0+$/, '');
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)} Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)} L`;
  return fmt(num);
};

export const getActiveModes = (invoice: Invoice) =>
  Object.entries(invoice.paymentMethods || {}).filter(([key, value]) => key !== 'due' && Number(value) > 0);

export const modeLabel = (mode: string) => (mode === 'upi' ? 'UPI' : mode.replace(/_/g, ' '));

export const BADGE = 'inline-flex items-center gap-1 h-[22px] px-2 rounded-sm text-[11px] font-semibold tracking-[0.03em] leading-[22px] whitespace-nowrap';
export const modeBadgeClass = (mode: string) =>
  mode === 'upi' ? 'bg-[#e6eeff] text-[#155dfc]' : 'bg-[#f5f7ff] text-[#45556c]';

export const returnModeClass = (modeRaw: string) => {
  const mode = (modeRaw || '').toUpperCase().trim();
  if (mode === 'EXCHANGE') return 'bg-[#e6eeff] text-[#155dfc]';
  if (mode.includes('CASH') || mode.includes('REFUND')) return 'bg-[#e9faef] text-[#008236]';
  return 'bg-[#fff3dd] text-[#bb4d00]';
};

export const fmtReturnDate = (v: any) =>
  new Date(v?.toDate ? v.toDate() : v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

const BTN_BASE =
  'h-10 px-4 inline-flex items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]';
export const BTN_PRIMARY = `${BTN_BASE} bg-[#155dfc] text-white hover:bg-[#1447e6]`;
export const BTN_SECONDARY = `${BTN_BASE} bg-white text-[#0f172b] border border-[#7a8aa3] hover:bg-[#f5f7ff]`;

export const FIELD_LABEL = 'block text-xs font-medium text-[#45556c] mb-1';
export const FIELD_INPUT =
  'w-full h-10 px-3 text-sm text-[#0f172b] rounded-sm border border-[#7a8aa3] bg-white outline-none focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-[#155dfc]';
