import React, { useRef, useEffect } from 'react';
import { IconFilter } from '../constants/Icons';
import type { DateFilterOption } from '../Catalogue/hooks/useDateFilter';

interface DateFilterDropdownProps {
  /** All filter options to render. */
  options: DateFilterOption[];
  /** Currently active filter value. */
  activeFilter: string;
  /** Whether the dropdown is visible. */
  isOpen: boolean;
  /** Toggle the dropdown open/closed. */
  onToggle: () => void;
  /** Called when the user picks a preset filter (closes dropdown). */
  onSelect: (value: string) => void;
  /** Called when the user clicks "Custom Range". */
  onSelectCustom: () => void;
  /** Close the dropdown when clicking outside. */
  onClose: () => void;
  className?: string;
}

/**
 * Reusable date-filter icon + dropdown used in both Journal and OrdersPage.
 *
 * Renders the IconFilter button and, when open, a list of preset options
 * plus a "Custom Range" entry that delegates custom-picker control to the parent.
 *
 * Usage:
 * ```tsx
 * <DateFilterDropdown
 *   options={DATE_FILTER_OPTIONS}
 *   activeFilter={df.activeFilter}
 *   isOpen={df.isFilterOpen}
 *   onToggle={df.toggleDropdown}
 *   onSelect={df.selectFilter}
 *   onSelectCustom={() => { df.selectFilter('custom'); df.setShowCustomPicker(true); }}
 *   onClose={df.closeDropdown}
 * />
 * ```
 */
export const DateFilterDropdown: React.FC<DateFilterDropdownProps> = ({
  options,
  activeFilter,
  isOpen,
  onToggle,
  onSelect,
  onSelectCustom,
  onClose,
  className = '',
}) => {
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const presets = options.filter((o) => o.value !== 'custom');

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={onToggle}
        className="text-slate-500 hover:text-slate-800 transition-colors"
        aria-label="Open date filter"
      >
        <IconFilter />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-md shadow-lg z-[1000] border overflow-hidden">
          <ul className="py-1">
            {presets.map((filter) => (
              <li key={filter.value}>
                <button
                  onClick={() => onSelect(filter.value)}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    activeFilter === filter.value
                      ? 'bg-slate-100 text-slate-900 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {filter.label}
                </button>
              </li>
            ))}
            <li>
              <button
                onClick={() => { onSelectCustom(); onClose(); }}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  activeFilter === 'custom'
                    ? 'bg-slate-100 text-slate-900 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                Custom Range
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};
