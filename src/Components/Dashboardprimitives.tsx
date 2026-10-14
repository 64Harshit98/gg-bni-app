import React from 'react';
import { Link } from 'react-router-dom';
import ShowWrapper from '../context/ShowWrapper';

/* ─────────────────────────────────────────────────────────────
   SELLAR design-system primitives (from the Claude design artifact)
   canvas #eef2ff · surface #fff · border #dfe6fb · primary #155dfc
   ink #0f172b · muted #45556c · subtle #5b6b86
   ───────────────────────────────────────────────────────────── */

export const inr = (n: number) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;
export const MASK = '₹ ••••';

export const SlCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div
    className={`min-w-0 rounded-sm border border-[#dfe6fb] bg-white p-4 md:p-5 shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] ${className}`}
  >
    {children}
  </div>
);

export const SlCardHead: React.FC<{ title: string; subtitle?: string; right?: React.ReactNode }> = ({ title, subtitle, right }) => (
  <div className="mb-2 flex items-start justify-between gap-3 md:mb-4">
    <div>
      <h2 className="m-0 text-[15px] font-semibold leading-6 text-[#0f172b] md:text-base">{title}</h2>
      {subtitle && <p className="m-0 text-xs leading-[18px] text-[#5b6b86]">{subtitle}</p>}
    </div>
    {right}
  </div>
);

/* Segmented control (Amt / Qty) */
export function SegControl<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div role="group" className="inline-flex gap-0.5 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] p-[3px]">
      {options.map(o => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`h-7 rounded-sm px-3 text-xs font-medium transition-colors ${
              on
                ? 'bg-white text-[#155dfc] shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]'
                : 'text-[#45556c] hover:text-[#0f172b]'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* Tinted icon chip: blue = sales, magenta = people/bills, green = received, amber = unpaid */
const TINTS = {
  blue: 'bg-[#e6eeff] text-[#155dfc]',
  magenta: 'bg-[#ffe8f8] text-[#c4009a]',
  green: 'bg-[#e9faef] text-[#008236]',
  amber: 'bg-[#fff3dd] text-[#bb4d00]',
  red: 'bg-[#ffeef0] text-[#d5000c]',
} as const;

export const IconChip: React.FC<{ tone?: keyof typeof TINTS; children: React.ReactNode }> = ({ tone = 'blue', children }) => (
  <span className={`inline-grid h-8 w-8 flex-none place-items-center rounded-sm [&>svg]:h-[18px] [&>svg]:w-[18px] ${TINTS[tone]}`}>
    {children}
  </span>
);

/* Empty state: says what to do next */
export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  text?: string;
  action?: { label: string; to: string; icon?: React.ReactNode; permission?: any };
  className?: string;
}> = ({ icon, title, text, action, className = '' }) => (
  <div className={`flex flex-col items-center justify-center gap-2 px-4 py-6 text-center text-[13px] text-[#5b6b86] ${className}`}>
    <span className="[&>svg]:h-7 [&>svg]:w-7 [&>svg]:stroke-[1.5]">{icon}</span>
    <strong className="text-sm font-medium text-[#45556c]">{title}</strong>
    {text && <span>{text}</span>}
    {action && (() => {
      const link = (
        <Link
          to={action.to}
          className="mt-2 inline-flex h-8 items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-[13px] font-medium text-[#0f172b] hover:bg-[#f5f7ff]"
        >
          {action.icon}
          {action.label}
        </Link>
      );
      return action.permission ? <ShowWrapper requiredPermission={action.permission}>{link}</ShowWrapper> : link;
    })()}
  </div>
);