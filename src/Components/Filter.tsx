import React, { createContext, useState, useContext, type ReactNode, useEffect } from 'react';
import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarSeparator,
    MenubarTrigger,
} from "./ui/menubar";
import { useLocation } from 'react-router-dom';

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
}

const FilterContext = createContext<FilterContextType | undefined>(undefined);

export const FilterProvider = ({ children }: { children: ReactNode }) => {
    const [filters, setFilters] = useState<FilterState>({
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        filterType: 'today',
    });

    return (
        <FilterContext.Provider value={{ filters, setFilters }}>
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

    const primaryColor = isCatalogue ? '#F97316' : '#2563eb';   // orange : blue
    const primaryHover = isCatalogue ? '#ea580c' : '#1d4ed8';

    useEffect(() => {
        setLocalFilters(filters);
    }, [filters]);

    const formatDate = (date: Date) => date.toISOString().split('T')[0];


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
        <div className="bg-white p-2 rounded-sm shadow-md w-full max-w-lg mx-auto">
            <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Menubar className="sm:col-span-1">
                        <MenubarMenu>
                            <MenubarTrigger className="w-full justify-center">
                                {presetLabels[localFilters.filterType]}
                                <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </MenubarTrigger>
                            <MenubarContent>
                                <MenubarItem onClick={() => handlePresetSelect('today')}>Today</MenubarItem>
                                <MenubarItem onClick={() => handlePresetSelect('yesterday')}>Yesterday</MenubarItem>
                                <MenubarItem onClick={() => handlePresetSelect('last7days')}>Last 7 Days</MenubarItem>
                                <MenubarItem onClick={() => handlePresetSelect('last30days')}>Last 30 Days</MenubarItem>
                                <MenubarSeparator />
                                <MenubarItem onClick={() => handlePresetSelect('custom')}>Custom Range</MenubarItem>
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
                        className="w-full px-3 py-1 text-white font-semibold rounded-sm shadow-sm transition-colors" style={{backgroundColor: primaryColor}} onMouseOver={(e) => (e.currentTarget.style.backgroundColor = primaryHover)} onMouseOut={(e) => (e.currentTarget.style.backgroundColor = primaryColor)}
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
};