import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';
export interface Transaction {
  id: string;
  partyName: string;
  invoiceNumber: string;
  totalAmount: number;
  createdAt: Date;
  costOfGoodsSold?: number;
}

export interface TransactionDetail extends Transaction {
  type: 'Revenue' | 'Cost';
  profit?: number;
}

export interface Item {
  id: string;
  purchasePrice: number;
}

export const formatDate = (date: Date): string => {
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

export const handleSort = (
  key: keyof TransactionDetail,
  setSortConfig: React.Dispatch<
    React.SetStateAction<{
      key: keyof TransactionDetail;
      direction: 'asc' | 'desc';
    }>
  >,
) => {
  setSortConfig((prevConfig) => ({
    key,
    direction:
      prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc',
  }));
};

export const handleDatePresetChange = (
  preset: string,
  setDatePreset: React.Dispatch<React.SetStateAction<string>>,
  setStartDate: React.Dispatch<React.SetStateAction<string>>,
  setEndDate: React.Dispatch<React.SetStateAction<string>>,
) => {
  setDatePreset(preset);
  const start = new Date();
  const end = new Date();
  switch (preset) {
    case 'today':
      break;
    case 'yesterday':
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case 'last7':
      start.setDate(start.getDate() - 6);
      break;
    case 'last30':
      start.setDate(start.getDate() - 29);
      break;
    case 'custom':
      return;
  }
  setStartDate(formatDateForInput(start));
  setEndDate(formatDateForInput(end));
};
