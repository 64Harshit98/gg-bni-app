import React from 'react';

interface CustomDatePickerProps {
  startDate: string;
  endDate: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onApply: () => void;
  className?: string;
}

/**
 * Floating From/To date-range picker used in both Journal and OrdersPage.
 *
 * The parent is responsible for showing/hiding this component.
 * Call `onApply` to close the picker and commit the date range.
 *
 * Usage:
 * ```tsx
 * {df.showCustomPicker && (
 *   <CustomDatePicker
 *     startDate={df.customStartDate}
 *     endDate={df.customEndDate}
 *     onStartChange={df.setCustomStartDate}
 *     onEndChange={df.setCustomEndDate}
 *     onApply={() => df.setShowCustomPicker(false)}
 *   />
 * )}
 * ```
 */
export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  onApply,
  className = '',
}) => {
  return (
    <div
      className={`absolute top-full left-1/2 -translate-x-1/2 bg-white shadow-xl border border-gray-200 rounded-sm p-4 z-50 min-w-[300px] flex flex-col gap-4 animate-in fade-in zoom-in duration-200 cursor-default ${className}`}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col">
          <label className="text-center text-xs font-semibold text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartChange(e.target.value)}
            className="border border-gray-300 rounded-sm px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div className="flex flex-col">
          <label className="text-center text-xs font-semibold text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndChange(e.target.value)}
            className="border border-gray-300 rounded-sm px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
      <div className="flex justify-center border-t border-gray-100 -mt-2 -mb-2">
        <button
          onClick={onApply}
          className="flex-grow bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800 transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
};
