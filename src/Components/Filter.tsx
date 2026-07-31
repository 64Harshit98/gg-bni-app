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
import { Check, ChevronDown } from 'lucide-react';

// 1. ADD THIS HELPER FUNCTION AT THE TOP
// This offsets the UTC time by the user's local timezone so the date string is accurate to their clock
const getLocalDateString = (date: Date = new Date()) => {
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - offset);
    return localDate.toISOString().split('T')[0];
};

const FormattedDateInput: React.FC<{ value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; }> = ({ value, onChange }) => {
    const fullDate = value
        ? new Date(value + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : 'dd/mm/yyyy';
    const shortDate = value
        ? new Date(value + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
        : 'dd/mm';

    return (
        <div className="relative">
            <div
                title={fullDate}
                className="flex w-[64px] items-center justify-center rounded-lg px-1.5 py-1 text-xs pointer-events-none"
            >
                <span className={value ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                    {shortDate}
                </span>
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
    // 2. UPDATE INITIAL STATE to use our new helper
    const [filters, setFilters] = useState<FilterState>({
        startDate: getLocalDateString(),
        endDate: getLocalDateString(),
        filterType: 'today',
    });

    const refreshDateFilters = useCallback(() => {
        setFilters((prev) => {
            if (prev.filterType === 'today') {
                // 3. UPDATE REFRESH LOGIC to use our new helper
                const todayFormatted = getLocalDateString();
                if (prev.startDate !== todayFormatted) {
                    return {
                        ...prev,
                        startDate: todayFormatted,
                        endDate: todayFormatted
                    };
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

export const FilterControls: React.FC = () => {
    const { filters, setFilters } = useFilter();
    const [localFilters, setLocalFilters] = useState<FilterState>(filters);
    const location = useLocation();
    const isCatalogue = location.pathname.includes('catalogue');

    const applyButtonClass = isCatalogue
        ? 'bg-gradient-to-br from-amber-500 to-orange-600 hover:opacity-90'
        : 'bg-gradient-brand hover:opacity-90';

    useEffect(() => {
        setLocalFilters(filters);
    }, [filters]);

    // 4. UPDATE FORMATTER IN CONTROLS to use our new helper
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
        last30days: "Last 30 Days", custom: "Custom Range"
    };

    return (
        <div className="glass mx-auto flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-2xl p-1.5 shadow-sm">
            <Menubar className="rounded-xl border-none bg-transparent p-0 shadow-none">
                <MenubarMenu>
                    <MenubarTrigger className="flex cursor-pointer items-center gap-1 rounded-xl border border-border bg-background/60 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap">
                        {presetLabels[localFilters.filterType]}
                        <ChevronDown className="size-3" />
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

            <div className="flex items-center gap-0.5 rounded-xl border border-border bg-background/60 px-1 py-0.5">
                <FormattedDateInput value={localFilters.startDate} onChange={(e) => handleDateChange('startDate', e.target.value)} />
                <span className="text-muted-foreground text-xs">–</span>
                <FormattedDateInput value={localFilters.endDate} onChange={(e) => handleDateChange('endDate', e.target.value)} />
            </div>

            <button
                onClick={handleApply}
                className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-opacity cursor-pointer ${applyButtonClass}`}
            >
                <Check className="size-3.5" />
                Apply
            </button>
        </div>
    );
};