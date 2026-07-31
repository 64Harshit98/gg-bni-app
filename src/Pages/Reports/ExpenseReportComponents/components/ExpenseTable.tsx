import { ArrowDown, ArrowUp, ArrowUpDown, ReceiptText, Trash2 } from 'lucide-react';

import type { Expense } from '@/features/expenses';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../Components/ui/table';
import { EmptyState } from '../../../../Components/ui/empty-state';
import { Pagination } from '../../../../Components/ui/pagination';
import { usePagination } from '../../../../hooks/usePagination';
import { cn } from '../../../../lib/utils';
import { formatCurrency, formatDate } from '../../../../utils/formatters';

interface SortConfig {
  key: keyof Expense;
  direction: 'asc' | 'desc';
}

interface ExpenseTableProps {
  expenses: Expense[];
  sortConfig: SortConfig;
  onSort: (key: keyof Expense) => void;
  onDeleteRequest: (id: string) => void;
}

const COLUMNS: { key: keyof Expense; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'amount', label: 'Amount' },
];

const PAGE_SIZE = 10;

/** Sortable, paginated expense list with a per-row delete action. */
export function ExpenseTable({ expenses, sortConfig, onSort, onDeleteRequest }: ExpenseTableProps) {
  const { currentPage, totalPages, pageItems, goToPage } = usePagination<Expense>({
    totalItems: expenses.length,
    pageSize: PAGE_SIZE,
  });

  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptText />}
        title="No expenses found"
        description="No expenses fall within the selected period or search term."
      />
    );
  }

  const renderSortIcon = (key: keyof Expense) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="size-3.5 opacity-40" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
  };

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((col) => (
              <TableHead key={col.key} className={col.key === 'amount' ? 'text-right' : undefined}>
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  className={cn(
                    'inline-flex items-center gap-1 transition-colors hover:text-foreground',
                    col.key === 'amount' && 'flex-row-reverse',
                  )}
                >
                  {col.label}
                  {renderSortIcon(col.key)}
                </button>
              </TableHead>
            ))}
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageItems(expenses).map((exp) => (
            <TableRow key={exp.id}>
              <TableCell className="text-muted-foreground">{formatDate(exp.date)}</TableCell>
              <TableCell className="font-medium text-foreground">{exp.title}</TableCell>
              <TableCell className="max-w-xs truncate text-muted-foreground">{exp.description}</TableCell>
              <TableCell className="text-right font-semibold text-foreground">{formatCurrency(exp.amount)}</TableCell>
              <TableCell className="text-right">
                <button
                  onClick={() => onDeleteRequest(exp.id)}
                  className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${exp.title}`}
                >
                  <Trash2 className="size-4" />
                </button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={expenses.length}
          pageSize={PAGE_SIZE}
        />
      )}
    </div>
  );
}
