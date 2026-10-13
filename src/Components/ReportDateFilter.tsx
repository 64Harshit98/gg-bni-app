import React from 'react';

interface ReportDateFilterProps {
    datePreset: string;
    startDate: string;
    endDate: string;
    onPresetChange: (preset: string) => void;
    onStartDateChange: (value: string) => void;
    onEndDateChange: (value: string) => void;
    onApply: () => void;
    theme?: 'pos' | 'catalogue';
}

export const ReportDateFilter: React.FC<ReportDateFilterProps> = ({
    datePreset,
    startDate,
    endDate,
    onPresetChange,
    onStartDateChange,
    onEndDateChange,
    onApply,
    theme = 'pos',
}) => {
    const buttonClass = theme === 'catalogue'
        ? 'bg-[#F97316] hover:bg-orange-600'
        : 'bg-blue-600 hover:bg-blue-700';

    return (
        <div className="bg-white p-2 rounded-lg shadow-md mb-2 md:p-5 md:mb-4 md:rounded-xl">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:grid-cols-3 md:gap-3">
                <div className="sm:col-span-1 md:col-span-1">
                    <select value={datePreset} onChange={e => onPresetChange(e.target.value)}
                        className="w-full text-center p-2 text-sm bg-gray-50 border rounded-md md:p-3">
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last7">Last 7 Days</option>
                        <option value="last30">Last 30 Days</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:col-span-2 md:col-span-2 md:grid-cols-2 md:gap-4">
                    <input type="date" value={startDate} onChange={e => onStartDateChange(e.target.value)}
                        className="w-full p-2 text-sm bg-gray-50 border rounded-md md:p-2.5" />
                    <input type="date" value={endDate} onChange={e => onEndDateChange(e.target.value)}
                        className="w-full p-2 text-sm bg-gray-50 border rounded-md md:p-2.5" />
                </div>
            </div>
            <div className="mt-2 md:mt-3 md:flex md:justify-center">
                <button onClick={onApply}
                    className={`w-full mt-0 px-3 py-1 text-white text-base font-semibold rounded-lg md:py-2 ${buttonClass}`}>
                    Apply
                </button>
            </div>
        </div>
    );
};

export default ReportDateFilter;