import { ArrowDown, ArrowUp, ArrowUpDown, ReceiptText, TriangleAlert } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../Components/ui/table';
import { EmptyState } from '../../../../Components/ui/empty-state';
import { cn } from '../../../../lib/utils';
import { formatCurrency, formatDate } from '../../../../utils/formatters';
import type { TransactionDetail } from '../pnlReport.utils';
import type { PnlSummary } from '../pnlReport.downloads';

interface SortConfig {
  key: keyof TransactionDetail;
  direction: 'asc' | 'desc';
}

interface PnlTransactionsTableProps {
  transactions: TransactionDetail[];
  summary: PnlSummary;
  sortConfig: SortConfig;
  onSort: (key: keyof TransactionDetail) => void;
}

const COLUMNS: { key: keyof TransactionDetail; label: string; align?: 'right' }[] = [
  { key: 'createdAt', label: 'Date' },
  { key: 'invoiceNumber', label: 'Invoice' },
  { key: 'totalAmount', label: 'Sales', align: 'right' },
  { key: 'costOfGoodsSold', label: 'Cost', align: 'right' },
  { key: 'profit', label: 'Profit', align: 'right' },
];

/** Sortable, totals-footed transaction table for the P&L report. */
export function PnlTransactionsTable({
  transactions,
  summary,
  sortConfig,
  onSort,
}: PnlTransactionsTableProps) {
  if (transactions.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptText />}
        title="No transactions found"
        description="No sales fall within the selected period or search term."
      />
    );
  }

  const renderSortIcon = (key: keyof TransactionDetail) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="size-3.5 opacity-40" />;
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="size-3.5" />
    ) : (
      <ArrowDown className="size-3.5" />
    );
  };

  return (
    <Table containerClassName="max-h-[28rem] overflow-y-auto">
      <TableHeader sticky>
        <TableRow>
          {COLUMNS.map((col) => (
            <TableHead key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
              <button
                type="button"
                onClick={() => onSort(col.key)}
                className={cn(
                  'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                  col.align === 'right' && 'flex-row-reverse',
                )}
              >
                {col.label}
                {renderSortIcon(col.key)}
              </button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((t) => (
          <TableRow key={t.id} className={t.isWarning ? 'bg-warning/8' : undefined}>
            <TableCell className="text-muted-foreground">{formatDate(t.createdAt)}</TableCell>
            <TableCell className="font-medium text-foreground">{t.invoiceNumber || 'N/A'}</TableCell>
            <TableCell className="text-right text-success">{formatCurrency(t.totalAmount)}</TableCell>
            <TableCell className="text-right text-destructive">
              <span className="inline-flex items-center justify-end gap-1">
                {t.isWarning && (
                  <TriangleAlert
                    className="size-3.5 text-warning"
                    aria-label="Cost of goods sold missing for this sale"
                  />
                )}
                {formatCurrency(t.costOfGoodsSold || 0)}
              </span>
            </TableCell>
            <TableCell
              className={cn(
                'text-right font-semibold',
                (t.profit || 0) >= 0 ? 'text-info' : 'text-destructive',
              )}
            >
              {formatCurrency(t.profit || 0)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell className="font-bold text-foreground">TOTAL</TableCell>
          <TableCell>-</TableCell>
          <TableCell className="text-right font-bold text-foreground">
            {formatCurrency(summary.totalRevenue)}
          </TableCell>
          <TableCell className="text-right font-bold text-foreground">
            {formatCurrency(summary.totalCost)}
          </TableCell>
          <TableCell className="text-right font-bold text-foreground">
            {formatCurrency(summary.grossProfit)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}
