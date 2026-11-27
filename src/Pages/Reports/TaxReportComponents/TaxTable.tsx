import React from 'react';

export interface TaxColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
  /** Cell for the totals row; omit for an empty cell. */
  footer?: React.ReactNode;
}

interface TaxTableProps<T> {
  columns: TaxColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyText: string;
  /** Render the totals row (only when there are rows). */
  showFooter?: boolean;
}

// Same table language as the Sales report: sunken header, hairline rows, right-aligned money.
export default function TaxTable<T>({ columns, rows, rowKey, emptyText, showFooter }: TaxTableProps<T>) {
  const alignClass = (a?: 'left' | 'right') => (a === 'right' ? 'text-right' : 'text-left');
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-sunken text-[11px] uppercase tracking-wide text-blue-700/80">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-4 py-2.5 font-semibold ${alignClass(c.align)}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-slate-500">
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)} className="border-t border-line transition hover:bg-sunken">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`whitespace-nowrap px-4 py-2.5 ${alignClass(c.align)} ${c.align === 'right' ? 'tabular-nums text-slate-900' : 'text-slate-700'}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {showFooter && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-sunken font-semibold text-slate-900">
              {columns.map((c) => (
                <td key={c.key} className={`whitespace-nowrap px-4 py-2.5 tabular-nums ${alignClass(c.align)}`}>
                  {c.footer ?? ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
