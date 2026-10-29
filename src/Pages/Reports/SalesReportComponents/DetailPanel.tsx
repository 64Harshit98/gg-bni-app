import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

// One record's details, opened from a report row. Desktop: a panel on the right
// beside the list. Mobile: a bottom sheet. Rows never expand inline.

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small badge(s) beside the title, e.g. the payment mode. */
  badge?: ReactNode;
  children: ReactNode;
  /** Actions pinned to the bottom of the panel. */
  footer?: ReactNode;
}

const DetailPanel = ({ open, onClose, title, subtitle, badge, children, footer }: Props) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[8500]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-950/45 md:bg-slate-950/20" onClick={onClose} />
      <aside className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-sm bg-white shadow-float md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[420px] md:rounded-none md:border-l md:border-line">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300 md:hidden" />
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
              {badge}
            </div>
            {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="shrink-0 border-t border-line px-5 py-4">{footer}</footer>}
      </aside>
    </div>
  );
};

/* ---------- Building blocks for the panel body ---------- */

export const DetailSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section>
    <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
    {children}
  </section>
);

/** Label / value pairs. A row's `tone` colours the value (e.g. amber for due). */
export const DetailRows = ({ rows }: { rows: { label: string; value: ReactNode; tone?: string; strong?: boolean }[] }) => (
  <dl className="space-y-1.5 text-sm">
    {rows.map((r) => (
      <div key={r.label} className="flex items-baseline justify-between gap-4">
        <dt className="text-slate-500">{r.label}</dt>
        <dd className={`text-right ${r.strong ? 'font-semibold' : ''} ${r.tone || 'text-slate-900'}`}>{r.value}</dd>
      </div>
    ))}
  </dl>
);

export interface DetailItem {
  name: string;
  quantity: number;
  /** Price per unit shown as "2 × ₹40". */
  unitPrice: number;
  /** Line amount; defaults to quantity × unitPrice. */
  amount?: number;
  note?: string;
}

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const DetailItems = ({ items, emptyText = 'No item details on this bill.' }: { items: DetailItem[]; emptyText?: string }) =>
  items.length === 0 ? (
    <p className="rounded-sm bg-sunken px-3 py-2.5 text-sm text-slate-500">{emptyText}</p>
  ) : (
    <ul className="divide-y divide-line rounded-sm border border-line">
      {items.map((item, i) => (
        <li key={i} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-800">{item.name || 'Item'}</p>
            <p className="text-xs text-slate-500">
              {item.quantity} × {money(item.unitPrice)}
              {item.note ? ` · ${item.note}` : ''}
            </p>
          </div>
          <span className="shrink-0 font-semibold text-slate-900">{money(item.amount ?? item.quantity * item.unitPrice)}</span>
        </li>
      ))}
    </ul>
  );

export default DetailPanel;
