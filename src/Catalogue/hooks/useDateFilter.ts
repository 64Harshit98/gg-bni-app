import { useState, useMemo } from 'react';

export type DateFilterValue = 'today' | 'yesterday' | 'last7' | 'last15' | 'last30' | 'custom';

export interface DateFilterOption {
  label: string;
  value: DateFilterValue | string;
}

export const DATE_FILTER_OPTIONS: DateFilterOption[] = [
  { label: 'Today', value: 'today' },
  { label: 'Yesterday', value: 'yesterday' },
  { label: 'Last 7 Days', value: 'last7' },
  { label: 'Last 15 Days', value: 'last15' },
  { label: 'Last 30 Days', value: 'last30' },
  { label: 'Custom Range', value: 'custom' },
];

/** Returns a { start, end } date range for a given filter string. */
export const getDateRange = (
  filter: string,
  customStart?: Date | null,
  customEnd?: Date | null
): { start: Date; end: Date } => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  switch (filter) {
    case 'today':
      return { start, end };

    case 'yesterday': {
      const s = new Date(start);
      s.setDate(s.getDate() - 1);
      const e = new Date(end);
      e.setDate(e.getDate() - 1);
      return { start: s, end: e };
    }

    case 'last7': {
      const s = new Date(start);
      s.setDate(s.getDate() - 6);
      return { start: s, end };
    }

    case 'last15': {
      const s = new Date(start);
      s.setDate(s.getDate() - 14);
      return { start: s, end };
    }

    case 'last30': {
      const s = new Date(start);
      s.setDate(s.getDate() - 29);
      return { start: s, end };
    }

    case 'custom':
      return {
        start: customStart
          ? new Date(new Date(customStart).setHours(0, 0, 0, 0))
          : start,
        end: customEnd
          ? new Date(new Date(customEnd).setHours(23, 59, 59, 999))
          : end,
      };

    default:
      return { start, end };
  }
};

/** Returns a human-readable label for the active filter period. */
const usePeriodText = (
  filter: string,
  customStart: string,
  customEnd: string
): string => {
  return useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const fmt = (d: Date) => d.toLocaleDateString('en-IN', options);

    switch (filter) {
      case 'today':
        return `Today, ${fmt(today)}`;
      case 'yesterday':
        return `Yesterday, ${fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))}`;
      case 'last7':
        return `${fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))} - ${fmt(now)}`;
      case 'last15':
        return `${fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14))} - ${fmt(now)}`;
      case 'last30':
        return `${fmt(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29))} - ${fmt(now)}`;
      case 'custom':
        if (customStart && customEnd) {
          return `${new Date(customStart).toLocaleDateString('en-IN', options)} - ${new Date(customEnd).toLocaleDateString('en-IN', options)}`;
        }
        return 'Select Custom Range';
      default:
        return 'Selected Period';
    }
  }, [filter, customStart, customEnd]);
};

export interface UseDateFilterReturn {
  /** Active filter key (e.g. 'today', 'last7', 'custom'). */
  activeFilter: string;
  /** Resolved { start, end } Date objects for Firestore queries. */
  dateRange: { start: Date; end: Date };
  /** Human-readable label for the active period. */
  periodText: string;
  /** Whether the dropdown is open. */
  isFilterOpen: boolean;
  /** Whether the custom date picker overlay is open. */
  showCustomPicker: boolean;
  /** Raw string values for the custom date inputs. */
  customStartDate: string;
  customEndDate: string;
  /** Select a preset filter. Closes the dropdown automatically. */
  selectFilter: (value: string) => void;
  /** Toggle the dropdown. */
  toggleDropdown: () => void;
  /** Close the dropdown. */
  closeDropdown: () => void;
  /** Open / close the custom date picker. */
  setShowCustomPicker: (v: boolean) => void;
  setCustomStartDate: (v: string) => void;
  setCustomEndDate: (v: string) => void;
}

/**
 * Manages all date-filter state shared by Journal and OrdersPage.
 *
 * Usage:
 * ```tsx
 * const df = useDateFilter('today');
 * // df.dateRange  → pass to Firestore query
 * // df.periodText → display in header
 * ```
 */
export const useDateFilter = (initial: string = 'today'): UseDateFilterReturn => {
  const [activeFilter, setActiveFilter] = useState(initial);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const dateRange = useMemo(
    () =>
      getDateRange(
        activeFilter,
        customStartDate ? new Date(customStartDate) : null,
        customEndDate ? new Date(customEndDate) : null
      ),
    [activeFilter, customStartDate, customEndDate]
  );

  const periodText = usePeriodText(activeFilter, customStartDate, customEndDate);

  const selectFilter = (value: string) => {
    setActiveFilter(value);
    setIsFilterOpen(false);
    if (value === 'custom') {
      setShowCustomPicker(true);
    }
  };

  const toggleDropdown = () => setIsFilterOpen((p) => !p);
  const closeDropdown = () => setIsFilterOpen(false);

  return {
    activeFilter,
    dateRange,
    periodText,
    isFilterOpen,
    showCustomPicker,
    customStartDate,
    customEndDate,
    selectFilter,
    toggleDropdown,
    closeDropdown,
    setShowCustomPicker,
    setCustomStartDate,
    setCustomEndDate,
  };
};
