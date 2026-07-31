import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Eye, EyeOff, Inbox } from 'lucide-react';

import { Button } from '../../../Components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../Components/ui/table';
import { Pagination } from '../../../Components/ui/pagination';
import { usePagination } from '../../../hooks/usePagination';
import { EmptyState } from '../../../Components/ui/empty-state';
import type { TableColumn } from '../../../Components/CustomTable';

const PAGE_SIZE = 10;

interface SortConfig<T> {
  key: keyof T;
  direction: 'asc' | 'desc';
}

interface PurchaseReportDetailsProps<T> {
  title?: string;
  isListVisible: boolean;
  setIsListVisible: (visible: boolean) => void;
  downloadAsPdf: () => void;
  data: T[];
  columns: TableColumn<T>[];
  keyExtractor: (row: T) => string | number | undefined;
  sortConfig?: SortConfig<T>;
  onSort?: (key: keyof T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * "Report Details" toolbar + paginated data table for the Purchase report.
 * Decomposed out of `PurchaseReport.tsx` to keep the page component focused
 * on data/state, mirroring the `SalesReportComponents/ReportDetails` split.
 */
export default function PurchaseReportDetails<T = unknown>({
  title = 'Report Details',
  isListVisible,
  setIsListVisible,
  downloadAsPdf,
  data,
  columns,
  keyExtractor,
  sortConfig,
  onSort,
  emptyTitle = 'No records found',
  emptyDescription = 'Try adjusting your filters or date range.',
}: PurchaseReportDetailsProps<T>) {
  const { currentPage, totalPages, pageItems, goToPage } = usePagination<T>({
    totalItems: data.length,
    pageSize: PAGE_SIZE,
  });
  const rows = pageItems(data);

  return (
    <div className="space-y-3">
      <div className="glass flex flex-col gap-3 rounded-2xl p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <h2 className="text-center text-base font-semibold text-foreground md:text-left">
          {title}
        </h2>
        <div className="flex items-stretch gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1 gap-1.5 md:flex-none"
            onClick={() => setIsListVisible(!isListVisible)}
          >
            {isListVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {isListVisible ? 'Hide List' : 'Show List'}
          </Button>
          <Button
            type="button"
            disabled={data.length === 0}
            className="flex-1 gap-1.5 bg-gradient-brand text-white shadow-sm hover:opacity-90 md:flex-none"
            onClick={downloadAsPdf}
          >
            <Download className="size-4" />
            Download Report
          </Button>
        </div>
      </div>

      {isListVisible && (
        <div className="space-y-3">
          <Table containerClassName="rounded-2xl">
            <TableHeader sticky>
              <TableRow>
                {columns.map((col, i) => (
                  <TableHead key={i} className={col.className}>
                    {col.sortKey && onSort ? (
                      <button
                        type="button"
                        onClick={() => onSort(col.sortKey as keyof T)}
                        className="flex items-center gap-1 transition-colors hover:text-foreground"
                      >
                        {col.header}
                        {sortConfig?.key === col.sortKey ? (
                          sortConfig.direction === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={columns.length} className="p-0">
                    <EmptyState
                      icon={<Inbox />}
                      title={emptyTitle}
                      description={emptyDescription}
                      className="border-none"
                    />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={keyExtractor(row)}>
                    {columns.map((col, i) => (
                      <TableCell key={i} className={col.className}>
                        {typeof col.accessor === 'function'
                          ? col.accessor(row)
                          : (row[col.accessor] as React.ReactNode)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {data.length > 0 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={goToPage}
              totalItems={data.length}
              pageSize={PAGE_SIZE}
            />
          )}
        </div>
      )}
    </div>
  );
}
