import { Filter } from 'lucide-react';
import { Button } from '../../../Components/ui/button';
import { Input } from '../../../Components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../Components/ui/select';

interface CustomerFilterBarProps {
  datePreset: string;
  onPresetChange: (value: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onApply: () => void;
}

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom' },
];

export default function CustomerFilterBar({
  datePreset,
  onPresetChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onApply,
}: CustomerFilterBarProps) {
  return (
    <div className="glass rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 pb-3">
        <Filter className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Filter by period</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

        <Input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="h-11"
        />
        <Input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="h-11"
        />
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          onClick={onApply}
          className="h-11 w-full gap-1.5 bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90 sm:w-auto"
        >
          Apply Filters
        </Button>
      </div>
    </div>
  );
}
