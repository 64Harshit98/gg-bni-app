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
