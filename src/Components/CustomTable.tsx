import React from 'react';
import { cn } from '../lib/utils';

export interface TableColumn<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  className?: string; // For specific cell styling (e.g., 'text-right')
  sortKey?: keyof T; // If provided, the column becomes sortable
}

interface CustomTableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  keyExtractor: (item: T) => string | number; // Unique ID for key prop
  sortConfig?: { key: keyof T; direction: 'asc' | 'desc' };
  onSort?: (key: keyof T) => void;
  className?: string;
  emptyMessage?: string;
}

export const CustomTable = <T,>({
  data,
  columns,
  keyExtractor,
  sortConfig,
  onSort,
  className,
  emptyMessage = 'No data available',
}: CustomTableProps<T>) => {
  const ASC_ICON = '∧';
  const DESC_ICON = '∨';

  const renderSortIcon = (colKey?: keyof T) => {
    if (!colKey || !sortConfig || !onSort) return null;

    const isSorted = sortConfig.key === colKey;
    const directionIcon = sortConfig.direction === 'asc' ? ASC_ICON : DESC_ICON;

    return (
      <span className="w-4 ml-1 inline-block">
        {isSorted ? (
          <span className="text-blue-600 text-xs font-bold">
            {directionIcon}
          </span>
        ) : (
          <span className="text-gray-400 hover:text-gray-600 text-xs inline-flex flex-col leading-3 opacity-50">
            <span>{ASC_ICON}</span>
            <span className="-mt-1">{DESC_ICON}</span>
          </span>
        )}
      </span>
    );
  };

  return (
    <div className={cn('bg-white p-2 rounded-lg shadow-md mt-2', className)}>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm text-center border-collapse">
          <thead className="text-xs text-slate-500 bg-slate-100 sticky top-0 z-10 shadow-sm">
            <tr>
              {columns.map((col, index) => (
                <th
                  key={index}
                  className={cn(
                    'py-2 px-2 font-semibold uppercase tracking-wider',
                    col.className,
                  )}
                >
                  {col.sortKey && onSort ? (
                    <button
                      onClick={() => onSort(col.sortKey!)}
                      className="flex items-center justify-center gap-1 w-full hover:text-slate-700 transition-colors"
                    >
                      {col.header}
                      {renderSortIcon(col.sortKey)}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.length > 0 ? (
              data.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  className="hover:bg-slate-50 transition-colors"
                >
                  {columns.map((col, index) => (
                    <td
                      key={index}
                      className={cn('py-2 px-3 text-slate-700', col.className)}
                    >
                      {typeof col.accessor === 'function'
                        ? col.accessor(row)
                        : (row[col.accessor] as React.ReactNode)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-8 text-center text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
