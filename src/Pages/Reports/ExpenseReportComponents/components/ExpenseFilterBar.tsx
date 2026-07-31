import { Search, X } from 'lucide-react';

import { Button } from '../../../../Components/ui/button';
import { Input } from '../../../../Components/ui/input';
import FilterSelect from '../../SalesReportComponents/FilterSelect';

interface ExpenseFilterBarProps {
  datePreset: string;
  onDatePresetChange: (value: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onApply: () => void;
  showSearch: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onCloseSearch: () => void;
}

/** Date-range filter + description search toolbar for the Expense report. */
export function ExpenseFilterBar({
  datePreset,
  onDatePresetChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  showSearch,
  searchQuery,
  onSearchQueryChange,
  onCloseSearch,
}: ExpenseFilterBarProps) {
  return (
    <div className="space-y-3">
      {showSearch && (
        <div className="flex justify-center px-2">
          <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-xs focus-within:border-primary/50">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by description..."
              className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              autoFocus
            />
            <button
              onClick={() => {
                onSearchQueryChange('');
                onCloseSearch();
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close search"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FilterSelect value={datePreset} onChange={(e) => onDatePresetChange(e.target.value)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom</option>
          </FilterSelect>

          <Input type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
          <Input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
        </div>

        <div className="mt-3 flex justify-center">
          <Button
            onClick={onApply}
            className="w-full bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90 sm:w-fit sm:px-10"
          >
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}
