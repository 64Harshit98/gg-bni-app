import React, { useMemo } from 'react';
import { useFilter } from '../../Components/Filter';

// ─── Small UI primitives for the Catalogue dashboard (design artifact) ───────
// Palette: primary text #c2410c (orange-700), accent #f97316, soft #ffedd5,
// canvas #fff5ec, sunken #fff8f2, border #f6e1d0.

export const ICONS = {
    receipt: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5M9 13h6M9 17h4'],
    orders: ['M3 13h5l1 3h6l1-3h5', 'M5 5h14l2 8v6H3v-6z'],
    chart: ['M3 3v18h18', 'M8 16v-4M13 16V8M18 16v-6'],
    clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
    chevronRight: ['m9 6 6 6-6 6'],
    refresh: ['M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5'],
    eye: ['M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
    eyeOff: ['M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.8M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2'],
    box: ['M21 8 12 3 3 8v8l9 5 9-5z', 'M3 8l9 5 9-5M12 13v8'],
} as const;

export const Ico: React.FC<{ d: readonly string[]; size?: number; className?: string }> = ({ d, size = 20, className = '' }) => (
    <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden="true"
        className={`flex-none ${className}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
);

export const CatCard: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
    <div className={`min-w-0 rounded-sm border border-[#f6e1d0] bg-white p-4 sm:p-5 shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] ${className}`}>
        {children}
    </div>
);

export const CardHead: React.FC<{ title: string; sub?: string; right?: React.ReactNode }> = ({ title, sub, right }) => (
    <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
            <h2 className="m-0 text-base font-semibold leading-6 text-slate-900">{title}</h2>
            {sub && <p className="m-0 text-xs leading-[18px] text-slate-500">{sub}</p>}
        </div>
        {right}
    </div>
);

export const Tint: React.FC<{ tone?: 'orange' | 'green' | 'amber'; children: React.ReactNode }> = ({ tone = 'orange', children }) => {
    const toneClass =
        tone === 'green' ? 'bg-[#e9faef] text-[#008236]'
            : tone === 'amber' ? 'bg-[#fef6d7] text-[#a16207]'
                : 'bg-orange-100 text-orange-800';
    return <span className={`inline-grid h-8 w-8 flex-none place-items-center rounded-sm ${toneClass}`}>{children}</span>;
};

export const Seg: React.FC<{ value: 'amount' | 'quantity'; onChange: (v: 'amount' | 'quantity') => void }> = ({ value, onChange }) => (
    <div role="group" className="inline-flex gap-0.5 rounded-sm border border-[#f6e1d0] bg-[#fff8f2] p-[3px]">
        {(['amount', 'quantity'] as const).map(v => (
            <button
                key={v}
                aria-pressed={value === v}
                onClick={() => onChange(v)}
                className={`h-7 rounded-sm px-3 text-xs font-medium transition-colors ${value === v ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600'}`}
            >
                {v === 'amount' ? 'Amt' : 'Qty'}
            </button>
        ))}
    </div>
);

export const HiddenState: React.FC<{ height?: number }> = ({ height = 160 }) => (
    <div style={{ height }} className="flex w-full flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-[#f6e1d0] bg-[#fff8f2] text-slate-500">
        <Ico d={ICONS.eyeOff} size={24} />
        <span className="text-sm">Data is hidden</span>
    </div>
);

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

// "2 Jul – 30 Sep" / "2 Jul"
export const usePeriodText = () => {
    const { filters } = useFilter();
    return useMemo(() => {
        if (!filters.startDate || !filters.endDate) return 'the selected period';
        const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
        const s = new Date(filters.startDate).toLocaleDateString('en-IN', opts);
        const e = new Date(filters.endDate).toLocaleDateString('en-IN', opts);
        return s === e ? s : `${s} – ${e}`;
    }, [filters.startDate, filters.endDate]);
};

export const usePeriodDays = () => {
    const { filters } = useFilter();
    return useMemo(() => {
        if (!filters.startDate || !filters.endDate) return 0;
        const s = new Date(filters.startDate); s.setHours(0, 0, 0, 0);
        const e = new Date(filters.endDate); e.setHours(0, 0, 0, 0);
        return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
    }, [filters.startDate, filters.endDate]);
};