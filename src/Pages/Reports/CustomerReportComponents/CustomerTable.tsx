import { ArrowDown, ArrowUp, ArrowUpDown, Users } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../Components/ui/table';
import { Pagination } from '../../../Components/ui/pagination';
import { EmptyState } from '../../../Components/ui/empty-state';
import { usePagination } from '../../../hooks/usePagination';
import { formatCurrency, formatNumber } from '../../../utils/formatters';
import type { CustomerRowWithCredit } from './customerReport.export';

interface SortConfig {
  key: string;
  direction: 'asc' | 'desc';
}

interface CustomerTableProps {
  rows: CustomerRowWithCredit[];
  sortConfig: SortConfig;
  onSort: (key: string) => void;
}

const COLUMNS: { key: string; label: string; align?: 'left' | 'right' | 'center' }[] = [
  { key: 'customerName', label: 'Customer' },
  { key: 'customerNumber', label: 'Phone Number' },
  { key: 'totalBills', label: 'Bills', align: 'right' },
  { key: 'totalSales', label: 'Total Sales', align: 'right' },
  { key: 'totalDue', label: 'Total Due', align: 'right' },
  { key: 'creditNote', label: 'Credit Note', align: 'right' },
];

const PAGE_SIZE = 10;

export default function CustomerTable({ rows, sortConfig, onSort }: CustomerTableProps) {
  const { currentPage, totalPages, pageItems, goToPage } = usePagination<CustomerRowWithCredit>({
    totalItems: rows.length,
    pageSize: PAGE_SIZE,
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="No customers found"
        description="No customers matched the selected period or search. Try widening the date range."
      />
    );
  }

  const pageRows = pageItems(rows);

  const renderSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="size-3.5 opacity-50" />;
    return sortConfig.direction === 'asc' ? (
      <ArrowUp className="size-3.5 text-primary" />
    ) : (
      <ArrowDown className="size-3.5 text-primary" />
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((col) => (
              <TableHead key={col.key} className={col.align === 'right' ? 'text-right' : undefined}>
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  {col.label}
                  {renderSortIcon(col.key)}
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium text-foreground">{row.customerName}</TableCell>
              <TableCell className="text-muted-foreground">{row.customerNumber}</TableCell>
              <TableCell className="text-right">{formatNumber(row.totalBills)}</TableCell>
              <TableCell className="text-right">{formatCurrency(row.totalSales)}</TableCell>
              <TableCell className={`text-right ${row.totalDue > 0 ? 'text-destructive' : 'text-foreground'}`}>
                {formatCurrency(Math.max(0, row.totalDue))}
              </TableCell>
              <TableCell className="text-right">{formatCurrency(row.creditNote || 0)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 ? (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={rows.length}
          pageSize={PAGE_SIZE}
        />
      ) : null}
    </div>
  );
}
