import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
export interface TaxReportRow {
  id: string;
  type: 'Sale' | 'Purchase';
  date: number;
  invoiceNumber: string;
  partyName: string;
  partyGstin: string;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
}

export const handleDatePresetChange = (
  preset: string,
  setDatePreset: React.Dispatch<React.SetStateAction<string>>,
  setCustomStartDate: React.Dispatch<React.SetStateAction<string>>,
  setCustomEndDate: React.Dispatch<React.SetStateAction<string>>,
) => {
  setDatePreset(preset);
  const now = new Date();
  let start = new Date();
  let end = new Date();
  switch (preset) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'thisMonth':
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      break;
    case 'lastMonth':
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case 'quarter':
      start.setMonth(now.getMonth() - 3);
      break;
    case 'custom':
      return;
  }
  setCustomStartDate(formatDateForInput(start));
  setCustomEndDate(formatDateForInput(end));
};

/* ---------- GST-PERIOD PRESETS (used by the POS Tax Report) ---------- */
// GST returns are monthly (GSTR-1/3B) or quarterly (CMP-08/QRMP), so the presets
// snap to whole calendar months/quarters instead of "last N days".

export type TaxPreset = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'lastQuarter' | 'fy' | 'custom';

export const TAX_PRESETS: { value: Exclude<TaxPreset, 'custom'>; label: string; shortLabel: string }[] = [
  { value: 'thisMonth', label: 'This month', shortLabel: 'Month' },
  { value: 'lastMonth', label: 'Last month', shortLabel: 'Last month' },
  { value: 'thisQuarter', label: 'This quarter', shortLabel: 'Quarter' },
  { value: 'lastQuarter', label: 'Last quarter', shortLabel: 'Last qtr' },
  { value: 'fy', label: 'This FY', shortLabel: 'This FY' },
];

export const getTaxPresetRange = (preset: string): { start: Date; end: Date } | null => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const qStart = Math.floor(m / 3) * 3;
  let start: Date;
  let end: Date;
  switch (preset) {
    case 'thisMonth':
      start = new Date(y, m, 1);
      end = new Date(y, m + 1, 0);
      break;
    case 'lastMonth':
      start = new Date(y, m - 1, 1);
      end = new Date(y, m, 0);
      break;
    case 'thisQuarter':
      start = new Date(y, qStart, 1);
      end = new Date(y, qStart + 3, 0);
      break;
    case 'lastQuarter': // negative months roll back into the previous year
      start = new Date(y, qStart - 3, 1);
      end = new Date(y, qStart, 0);
      break;
    case 'fy': {
      const fyStart = m >= 3 ? y : y - 1; // Indian FY starts 1 April
      start = new Date(fyStart, 3, 1);
      end = new Date(fyStart + 1, 3, 0);
      break;
    }
    default:
      return null;
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export const handleApplyFilters = (
  customStartDate: string,
  customEndDate: string,
  setAppliedFilters: React.Dispatch<
    React.SetStateAction<{ start: number; end: number } | null>
  >,
) => {
  const start = customStartDate ? new Date(customStartDate) : new Date(0);
  start.setHours(0, 0, 0, 0);
  const end = customEndDate ? new Date(customEndDate) : new Date();
  end.setHours(23, 59, 59, 999);
  setAppliedFilters({ start: start.getTime(), end: end.getTime() });
};
