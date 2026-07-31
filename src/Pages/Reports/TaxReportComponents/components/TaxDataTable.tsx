import type { ReactNode } from 'react';
import { FileSearch } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../Components/ui/table';
import { EmptyState } from '../../../../Components/ui/empty-state';

export interface TaxDataTableColumn<T> {
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  align?: 'left' | 'right' | 'center';
}

interface TaxDataTableProps<T> {
  data: T[];
  columns: TaxDataTableColumn<T>[];
  keyExtractor: (row: T, index: number) => string | number;
  emptyMessage?: string;
}

/**
 * Generic tabular renderer shared by every GST tab (B2B, B2CS, GSTR-2/4A,
 * TRANSACTIONS, HSN, SAC). Thin wrapper over the shared `Table` primitive —
 * replaces the previous ad-hoc `CustomTable` usage local to this page.
 */
export function TaxDataTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyExtractor,
  emptyMessage = 'No records found for this period.',
}: TaxDataTableProps<T>) {
  if (data.length === 0) {
    return <EmptyState icon={<FileSearch />} title={emptyMessage} className="border-none py-8" />;
  }

  return (
    <Table containerClassName="max-h-[26rem] overflow-y-auto">
      <TableHeader sticky>
        <TableRow>
          {columns.map((col) => (
            <TableHead
              key={col.header}
              className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : undefined}
            >
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row, index) => (
          <TableRow key={keyExtractor(row, index)}>
            {columns.map((col) => (
              <TableCell
                key={col.header}
                className={col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : undefined}
              >
                {typeof col.accessor === 'function'
                  ? col.accessor(row)
                  : (row[col.accessor] as ReactNode)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
