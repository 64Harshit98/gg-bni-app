import React from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { ROUTES } from '../../../constants/routes.constants';
import type { RangeKey } from './data';

// Shared building blocks for the super-admin redesign so every page has the
// same header, cards, chips and filter controls.

export const PageShell: React.FC<{ children: React.ReactNode; wide?: boolean }> = ({ children, wide }) => (
  <div className={`p-4 pb-16 md:p-8 mx-auto ${wide ? 'max-w-[1400px]' : 'max-w-[1200px]'}`}>{children}</div>
);

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  crumb?: boolean;
  actions?: React.ReactNode;
}> = ({ title, subtitle, crumb = true, actions }) => (
  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between mb-5">
    <div className="min-w-0">
      {crumb && (
        <p className="text-xs text-gray-500 mb-1">
          <Link to={ROUTES.SUPER_ADMINHUB} className="text-blue-600 hover:underline">Dashboard</Link> / {title}
        </p>
      )}
      <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">{title}</h1>
      {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap gap-2 items-center">{actions}</div>}
  </div>
);

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`bg-white rounded-xl border border-gray-200 ${className}`}>{children}</div>
);

export const CardTitle: React.FC<{ title: string; right?: React.ReactNode; sub?: string }> = ({ title, right, sub }) => (
  <div className="flex items-start justify-between gap-3 mb-3">
    <div>
      <h2 className="text-lg font-medium text-gray-900">{title}</h2>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
    {right}
  </div>
);

export const StatCard: React.FC<{
  dot: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  active?: boolean;
  valueCls?: string;
  onClick?: () => void;
}> = ({ dot, label, value, sub, active, valueCls = 'text-gray-900', onClick }) => {
  const body = (
    <>
      <p className="flex items-start gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600 leading-tight">
        <span className={`w-2 h-2 rounded-full shrink-0 mt-[3px] ${dot}`} />
        <span>{label}</span>
      </p>
      <p className={`text-3xl font-semibold mt-1.5 ${valueCls}`}>{value}</p>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </>
  );
  const cls = `text-left bg-white rounded-xl p-4 border transition-colors ${active ? 'border-blue-600 ring-1 ring-blue-600' : 'border-gray-200'}`;
  return onClick
    ? <button onClick={onClick} className={`${cls} hover:border-gray-300`}>{body}</button>
    : <div className={cls}>{body}</div>;
};

export const Chip: React.FC<{ cls: string; children: React.ReactNode; className?: string }> = ({ cls, children, className = '' }) => (
  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cls} ${className}`}>{children}</span>
);

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Today', '7d': '7D', '30d': '30D', '90d': '90D', year: 'This year', all: 'All time', custom: 'Custom',
};

export const RangeTabs: React.FC<{
  value: RangeKey;
  options: RangeKey[];
  onChange: (k: RangeKey) => void;
  custom?: { from: string; to: string };
  onCustomChange?: (c: { from: string; to: string }) => void;
}> = ({ value, options, onChange, custom, onCustomChange }) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="flex bg-white border border-gray-200 rounded-lg p-1">
      {options.map(k => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`px-3 py-1.5 text-sm font-semibold rounded-md whitespace-nowrap ${value === k ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}
        >
          {RANGE_LABELS[k]}
        </button>
      ))}
    </div>
    {value === 'custom' && custom && onCustomChange && (
      <div className="flex items-center gap-1.5">
        <input type="date" value={custom.from} onChange={e => onCustomChange({ ...custom, from: e.target.value })}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white" aria-label="From date" />
        <span className="text-gray-400">–</span>
        <input type="date" value={custom.to} onChange={e => onCustomChange({ ...custom, to: e.target.value })}
          className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white" aria-label="To date" />
      </div>
    )}
  </div>
);

export const SearchBox: React.FC<{ value: string; onChange: (v: string) => void; placeholder: string; className?: string }> = ({ value, onChange, placeholder, className = '' }) => (
  <div className={`relative ${className}`}>
    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
    />
  </div>
);

export const SelectBox: React.FC<{
  label?: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
  <label className="flex items-center gap-2 text-sm text-gray-600">
    {label && <span className="hidden sm:inline whitespace-nowrap">{label}</span>}
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full sm:w-auto text-sm bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
    >
      {children}
    </select>
  </label>
);

type BtnVariant = 'primary' | 'secondary' | 'green' | 'danger' | 'ghost';
const BTN: Record<BtnVariant, string> = {
  primary: 'text-white bg-blue-600 hover:bg-blue-700 border border-blue-600',
  secondary: 'text-gray-900 bg-white hover:bg-gray-50 border border-gray-300',
  green: 'text-green-800 bg-green-50 hover:bg-green-100 border border-green-200',
  danger: 'text-red-700 bg-white hover:bg-red-50 border border-red-300',
  ghost: 'text-blue-600 hover:underline border border-transparent',
};

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }> = ({
  variant = 'secondary', size = 'md', className = '', ...props
}) => (
  <button
    {...props}
    className={`${size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2'} text-sm font-semibold rounded-lg whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${BTN[variant]} ${className}`}
  />
);

export const LinkBtn: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: BtnVariant }> = ({
  variant = 'secondary', className = '', ...props
}) => (
  <a
    target="_blank"
    rel="noreferrer"
    {...props}
    className={`inline-block px-3 py-1.5 text-sm font-semibold rounded-lg whitespace-nowrap ${BTN[variant]} ${className}`}
  />
);

export const Alert: React.FC<{ tone: 'red' | 'amber' | 'purple'; children: React.ReactNode; action?: React.ReactNode }> = ({ tone, children, action }) => {
  const cls = {
    red: 'bg-red-50 border-red-200 text-red-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
  }[tone];
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 mb-4 rounded-xl border text-sm ${cls}`}>
      <div>{children}</div>
      {action}
    </div>
  );
};

export const Pager: React.FC<{ page: number; pageCount: number; total: number; pageSize: number; onPage: (p: number) => void; note?: string }> = ({
  page, pageCount, total, pageSize, onPage, note,
}) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-gray-600 border-t border-gray-100">
    <span>
      Showing {total === 0 ? 0 : page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
      {note && <span className="hidden sm:inline"> · {note}</span>}
    </span>
    {pageCount > 1 && (
      <div className="flex gap-2">
        <Btn disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Btn>
        <Btn disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>Next</Btn>
      </div>
    )}
  </div>
);

export const EmptyRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-center p-10 text-gray-400 text-sm">{children}</div>
);

export const Field: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-gray-800 mb-1">{label}</span>
    {children}
    {hint && <span className="block text-xs text-gray-500 mt-1">{hint}</span>}
  </label>
);

export const inputCls = 'w-full text-sm bg-white border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500';
