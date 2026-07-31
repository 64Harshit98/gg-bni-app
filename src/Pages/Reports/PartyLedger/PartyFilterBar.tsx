import { Search } from 'lucide-react';
import { Input } from '../../../Components/ui/input';
import { Button } from '../../../Components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../Components/ui/select';
import { cn } from '../../../lib/utils';

type PartyTypeFilter = 'all' | 'Customer' | 'Supplier' | 'Both';
type StatusFilter = 'all' | 'due' | 'settled';

interface PartyFilterBarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  datePreset: string;
  onPresetChange: (value: string) => void;
  customStartDate: string;
  customEndDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onApply: () => void;
  partyTypeFilter: PartyTypeFilter;
  onPartyTypeFilterChange: (value: PartyTypeFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
}

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'custom', label: 'Custom' },
];

export default function PartyFilterBar({
  searchQuery,
  onSearchQueryChange,
  datePreset,
  onPresetChange,
  customStartDate,
  customEndDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
  partyTypeFilter,
  onPartyTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
}: PartyFilterBarProps) {
  return (
    <div className="glass mx-3 mb-4 rounded-2xl p-4 shadow-sm md:mx-0">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by Party Name or Number..."
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="h-11 pl-9"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <Select value={datePreset} onValueChange={onPresetChange}>
          <SelectTrigger className="h-11 w-full">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {preset.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:gap-4">
          <Input type="date" value={customStartDate} onChange={(e) => onStartDateChange(e.target.value)} className="h-11" />
          <Input type="date" value={customEndDate} onChange={(e) => onEndDateChange(e.target.value)} className="h-11" />
        </div>
        <Button onClick={onApply} className="h-11 gap-1.5 bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90">
          Apply
        </Button>
      </div>

      <div className="mt-3 flex flex-col items-center gap-2">
        <div className="flex w-1/2 overflow-hidden rounded-lg border border-border text-sm max-[480px]:w-full">
          {(['Customer', 'Supplier', 'Both'] as const).map((type, idx) => (
            <button
              key={type}
              type="button"
              onClick={() => onPartyTypeFilterChange(partyTypeFilter === type ? 'all' : type)}
              className={cn(
                'flex-1 whitespace-nowrap px-3 py-1.5 font-medium transition-colors max-[480px]:px-1.5',
                idx > 0 && 'border-l border-border',
                partyTypeFilter === type ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-accent',
              )}
            >
              {type}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg bg-muted p-1 text-sm">
          {(['due', 'settled'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusFilterChange(statusFilter === status ? 'all' : status)}
              className={cn(
                'rounded-md px-3 py-1.5 capitalize transition-colors',
                statusFilter === status ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground',
              )}
            >
              {status}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
