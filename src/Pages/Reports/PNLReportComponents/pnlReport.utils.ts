import { formatDateForInput, type SaleRecord } from '../SalesReportComponents/salesReport.utils';
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

/* ---------- P&L REPORT (new design) ---------- */

// One sale bill with its cost and profit worked out from its items.
export interface PnlBill {
  id: string;
  invoiceNumber: string;
  partyName: string;
  partyNumber?: string;
  createdAt: number;
  sales: number;
  cost: number;
  profit: number;
  /** Profit as % of sales, null when the cost is incomplete. */
  margin: number | null;
  /** At least one item on the bill has no purchase price. */
  costMissing: boolean;
  /** Item keys (product id or name) without a purchase price. */
  missingItemKeys: string[];
  items: SaleRecord['items'];
}

const itemKey = (item: Record<string, unknown>) =>
  String(item.productId || item.id || item.name || 'unknown');

export const toPnlBill = (sale: SaleRecord): PnlBill => {
  let cost = 0;
  const missing = new Set<string>();
  (sale.items || []).forEach((raw) => {
    const item = raw as unknown as Record<string, unknown>;
    const qty = Number(item.quantity) || 0;
    const unitCost = Number(item.purchasePrice) || 0;
    if (qty <= 0) return;
    if (unitCost > 0) cost += unitCost * qty;
    else missing.add(itemKey(item));
  });
  const profit = sale.totalAmount - cost;
  const costMissing = missing.size > 0;
  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    partyName: sale.partyName,
    partyNumber: sale.partyNumber,
    createdAt: sale.createdAt,
    sales: sale.totalAmount,
    cost,
    profit,
    margin: !costMissing && sale.totalAmount > 0 ? (profit / sale.totalAmount) * 100 : null,
    costMissing,
    missingItemKeys: [...missing],
    items: sale.items,
  };
};

export const formatPercent = (value: number): string =>
  `${Number.isFinite(value) ? Math.round(value) : 0}%`;

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
