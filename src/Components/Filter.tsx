import React, { createContext, useState, useContext, type ReactNode, useEffect, useCallback } from 'react';
import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarSeparator,
    MenubarTrigger,
} from "./ui/menubar";
import { useLocation } from 'react-router-dom';
import { FiCalendar } from 'react-icons/fi';

// Offsets UTC by the user's timezone so the date string matches their clock
const getLocalDateString = (date: Date = new Date()) => {
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().split('T')[0];
};

const FormattedDateInput: React.FC<{ value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ value, onChange }) => {
    const displayValue = value
        ? new Date(value + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'dd/mm/yyyy';

    return (
        <div className="relative w-full">
            <div className="w-full p-2 text-sm border border-slate-300 rounded-sm bg-white flex justify-between items-center pointer-events-none">
                <span className={value ? 'text-slate-800' : 'text-slate-400'}>
                    {displayValue}
                </span>
                <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
            </div>
            <input
                type="date"
                value={value}
                onChange={onChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
        </div>
    );
};

interface FilterState {
    startDate: string;
    endDate: string;
    filterType: string;
}

interface FilterContextType {
    filters: FilterState;
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
    refreshDateFilters: () => void;
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider = ({ children }: { children: ReactNode }) => {
    const [filters, setFilters] = useState<FilterState>({
        startDate: getLocalDateString(),
        endDate: getLocalDateString(),
        filterType: 'today',
    });

    const refreshDateFilters = useCallback(() => {
        setFilters((prev) => {
            if (prev.filterType === 'today') {
                const todayFormatted = getLocalDateString();
                if (prev.startDate !== todayFormatted) {
                    return { ...prev, startDate: todayFormatted, endDate: todayFormatted };
                }
            }
            return prev;
        });
    }, []);

    return (
        <FilterContext.Provider value={{ filters, setFilters, refreshDateFilters }}>
            {children}
        </FilterContext.Provider>
    );
};

export const useFilter = (): FilterContextType => {
    const context = useContext(FilterContext);
    if (context === undefined) {
        throw new Error('useFilter must be used within a FilterProvider');
    }
    return context;
};

/* ════════════════════════════════════════════════════════════════
   NEW — DateChips (SELLAR design): one row of chips, no Apply button.
   Used on the redesigned Dashboard. FilterControls below is left
   as-is for pages that haven't been redesigned yet.
   ════════════════════════════════════════════════════════════════ */

const PRESET_CHIPS: { id: string; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'last7days', label: '7 days' },
    { id: 'last30days', label: '30 days' },
    { id: 'thisMonth', label: 'This month' },
];

const rangeForPreset = (id: string): { startDate: string; endDate: string } | null => {
    const today = new Date();
    const d = (n: number) => { const x = new Date(); x.setDate(x.getDate() - n); return getLocalDateString(x); };
    switch (id) {
        case 'today': return { startDate: getLocalDateString(today), endDate: getLocalDateString(today) };
        case 'yesterday': return { startDate: d(1), endDate: d(1) };
        case 'last7days': return { startDate: d(6), endDate: getLocalDateString(today) };
        case 'last30days': return { startDate: d(29), endDate: getLocalDateString(today) };
        case 'thisMonth': {
            const first = new Date(today.getFullYear(), today.getMonth(), 1);
            return { startDate: getLocalDateString(first), endDate: getLocalDateString(today) };
        }
        default: return null;
    }
};

const fmt = (s: string, withYear = false) =>
    new Date(s + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

export const DateChips: React.FC = () => {
    const { filters, setFilters } = useFilter();
    const isCustom = filters.filterType === 'custom';
    const [customOpen, setCustomOpen] = useState(false);
    const [draft, setDraft] = useState({ start: '', end: '' });
    const rootRef = React.useRef<HTMLDivElement>(null);
    const customBtnRef = React.useRef<HTMLButtonElement>(null);
    const [popLeft, setPopLeft] = useState(0);
    const POP_W = 328; // From | To side by side, Cancel + Apply

    // close the dropdown on outside tap / Esc (filters stay as they were)
    useEffect(() => {
        if (!customOpen) return;
        const onDown = (e: MouseEvent | TouchEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setCustomOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCustomOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('touchstart', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('touchstart', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [customOpen]);

    const pick = (id: string) => {
        const r = rangeForPreset(id);
        if (r) setFilters({ ...r, filterType: id });
        setCustomOpen(false);
    };

    const onCustomClick = () => {
        if (customOpen) { setCustomOpen(false); return; }
        // open right under the Custom chip (clamped so it never leaves the row)
        const root = rootRef.current, btn = customBtnRef.current;
        if (root && btn) {
            const rr = root.getBoundingClientRect(), br = btn.getBoundingClientRect();
            setPopLeft(Math.min(Math.max(0, br.left - rr.left), Math.max(0, rr.width - POP_W)));
        }
        // start from the range currently on screen
        setDraft({ start: filters.startDate, end: filters.endDate });
        setCustomOpen(true);
    };

    const canApply = !!draft.start && !!draft.end;
    const applyCustom = () => {
        if (!canApply) return;
        const [s, e] = draft.start <= draft.end ? [draft.start, draft.end] : [draft.end, draft.start];
        setFilters({ startDate: s, endDate: e, filterType: 'custom' });
        setCustomOpen(false);
    };

    // "21 Sep – 28 Sep 2026 · compared with 13 Sep – 20 Sep"
    const rangeText = (() => {
        if (!filters.startDate || !filters.endDate) return '';
        const s = new Date(filters.startDate + 'T00:00:00');
        const e = new Date(filters.endDate + 'T00:00:00');
        const days = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
        const pe = new Date(s); pe.setDate(pe.getDate() - 1);
        const ps = new Date(pe); ps.setDate(ps.getDate() - (days - 1));
        const cur = days === 1 ? fmt(filters.startDate, true) : `${fmt(filters.startDate)} – ${fmt(filters.endDate, true)}`;
        const prev = days === 1 ? fmt(getLocalDateString(pe)) : `${fmt(getLocalDateString(ps))} – ${fmt(getLocalDateString(pe))}`;
        return `${cur} · compared with ${prev}`;
    })();

    // Mobile: the Custom chip shows the applied range itself, so no extra line is needed
    const shortRange = filters.startDate === filters.endDate
        ? fmt(filters.startDate)
        : `${fmt(filters.startDate)} – ${fmt(filters.endDate)}`;

    const chip = (on: boolean) =>
        `inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-3.5 text-[13px] font-medium transition-colors ${
            on
                ? 'border-[#0f172b] bg-[#0f172b] text-white'
                : 'border-[#7a8aa3] bg-white text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]'
        }`;

    const dateInput =
        'h-10 w-full min-w-0 rounded-sm border border-[#7a8aa3] bg-white px-3 text-sm text-[#0f172b] outline-none focus-visible:ring-2 focus-visible:ring-[#155dfc]';

    return (
        <div ref={rootRef} className="relative">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div role="group" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
                    {PRESET_CHIPS.map(c => {
                        const on = filters.filterType === c.id && !customOpen;
                        return (
                            <button key={c.id} type="button" aria-pressed={on} onClick={() => pick(c.id)} className={chip(on)}>
                                {c.label}
                            </button>
                        );
                    })}
                    <button ref={customBtnRef} type="button" aria-pressed={isCustom || customOpen} aria-expanded={customOpen} onClick={onCustomClick} className={chip(isCustom || customOpen)}>
                        <FiCalendar size={16} />
                        <span className="md:hidden">{isCustom ? shortRange : 'Custom'}</span>
                        <span className="hidden md:inline">Custom</span>
                    </button>
                </div>
                <div className="hidden text-xs text-[#45556c] md:ml-auto md:block">{rangeText}</div>
            </div>

            {/* Custom range dropdown — header, two stacked dates, Apply (same on mobile + desktop) */}
            {customOpen && (
                <div
                    style={{ left: popLeft, width: POP_W, maxWidth: '100%' }}
                    className="absolute top-full z-40 mt-1.5 rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]"
                >
                    <div className="grid grid-cols-2 gap-3">
                        <label className="grid gap-1.5 text-[13px] font-medium text-[#45556c]">
                            From
                            <input
                                type="date" value={draft.start} max={getLocalDateString()}
                                onChange={e => setDraft(d => ({ ...d, start: e.target.value }))} className={dateInput}
                            />
                        </label>
                        <label className="grid gap-1.5 text-[13px] font-medium text-[#45556c]">
                            To
                            <input
                                type="date" value={draft.end} max={getLocalDateString()}
                                onChange={e => setDraft(d => ({ ...d, end: e.target.value }))} className={dateInput}
                            />
                        </label>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <button
                            type="button" onClick={() => setCustomOpen(false)}
                            className="h-10 rounded-sm border border-[#dfe6fb] bg-white px-4 text-sm font-medium text-[#45556c] transition-colors hover:bg-[#f5f7ff] hover:text-[#0f172b]"
                        >
                            Cancel
                        </button>
                        <button
                            type="button" onClick={applyCustom} disabled={!canApply}
                            className="h-10 rounded-sm bg-[#0f172b] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1d2a44] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Apply
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

/* ════════════════════════════════════════════════════════════════
   OLD FilterControls — unchanged, except 'thisMonth' label/case added
   so it doesn't break if that filterType is ever passed in.
   ════════════════════════════════════════════════════════════════ */
export const FilterControls: React.FC = () => {
    const { filters, setFilters } = useFilter();
    const [localFilters, setLocalFilters] = useState<FilterState>(filters);
    const location = useLocation();
    const isCatalogue = location.pathname.includes('catalogue');

    const primaryColor = isCatalogue ? '#F97316' : '#2563eb';
    const primaryHover = isCatalogue ? '#ea580c' : '#1d4ed8';

    useEffect(() => {
        setLocalFilters(filters);
    }, [filters]);

    const formatDate = (date: Date) => getLocalDateString(date);

    useEffect(() => {
        const today = new Date();
        let newStartDate = localFilters.startDate;
        let newEndDate = localFilters.endDate;

        switch (localFilters.filterType) {
            case 'today':
                newStartDate = formatDate(today); newEndDate = formatDate(today); break;
            case 'yesterday':
                const y = new Date(); y.setDate(y.getDate() - 1);
                newStartDate = formatDate(y); newEndDate = formatDate(y); break;
            case 'last7days':
                const l7 = new Date(); l7.setDate(l7.getDate() - 6);
                newStartDate = formatDate(l7); newEndDate = formatDate(today); break;
            case 'last30days':
                const l30 = new Date(); l30.setDate(l30.getDate() - 29);
                newStartDate = formatDate(l30); newEndDate = formatDate(today); break;
            case 'thisMonth':
                newStartDate = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
                newEndDate = formatDate(today); break;
            case 'custom':
                return;
        }

        if (newStartDate !== localFilters.startDate || newEndDate !== localFilters.endDate) {
            setLocalFilters(f => ({ ...f, startDate: newStartDate, endDate: newEndDate }));
        }
    }, [localFilters.filterType]);

    const handlePresetSelect = (preset: string) => {
        setLocalFilters(f => ({ ...f, filterType: preset }));
    };

    const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
        setLocalFilters(f => ({ ...f, [field]: value, filterType: 'custom' }));
    };

    const handleApply = () => {
        setFilters(localFilters);
    };

    const presetLabels: { [key: string]: string } = {
        today: "Today", yesterday: "Yesterday", last7days: "Last 7 Days",
        last30days: "Last 30 Days", thisMonth: "This Month", custom: "Custom Range"
    };

    return (
        <div className="bg-white p-2 rounded-sm shadow-md w-full max-w-lg mx-auto">
            <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Menubar className="sm:col-span-2">
                        <MenubarMenu>
                            <MenubarTrigger className="w-full justify-center cursor-pointer">
                                {presetLabels[localFilters.filterType]}
                                <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </MenubarTrigger>
                            <MenubarContent>
                                <MenubarItem onClick={() => handlePresetSelect('today')} className="cursor-pointer">Today</MenubarItem>
                                <MenubarItem onClick={() => handlePresetSelect('yesterday')} className="cursor-pointer">Yesterday</MenubarItem>
                                <MenubarItem onClick={() => handlePresetSelect('last7days')} className="cursor-pointer">Last 7 Days</MenubarItem>
                                <MenubarItem onClick={() => handlePresetSelect('last30days')} className="cursor-pointer">Last 30 Days</MenubarItem>
                                <MenubarSeparator />
                                <MenubarItem onClick={() => handlePresetSelect('custom')} className="cursor-pointer">Custom Range</MenubarItem>
                            </MenubarContent>
                        </MenubarMenu>
                    </Menubar>
                    <div className="sm:col-span-2 grid grid-cols-2 gap-2">
                        <FormattedDateInput value={localFilters.startDate} onChange={(e) => handleDateChange('startDate', e.target.value)} />
                        <FormattedDateInput value={localFilters.endDate} onChange={(e) => handleDateChange('endDate', e.target.value)} />
                    </div>
                </div>
                <div>
                    <button
                        onClick={handleApply}
                        className="w-full px-3 py-1 text-white font-semibold rounded-sm shadow-sm transition-colors cursor-pointer" style={{ backgroundColor: primaryColor }} onMouseOver={(e) => (e.currentTarget.style.backgroundColor = primaryHover)} onMouseOut={(e) => (e.currentTarget.style.backgroundColor = primaryColor)}
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
};