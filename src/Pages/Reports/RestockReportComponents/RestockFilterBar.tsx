import { Search } from 'lucide-react';
import { Input } from '../../../Components/ui/input';
import { Button } from '../../../Components/ui/button';
import { cn } from '../../../lib/utils';
import type { RestockActiveFilter } from './restockReport.export';

interface RestockFilterBarProps {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  activeFilter: RestockActiveFilter;
  onActiveFilterChange: (filter: RestockActiveFilter) => void;
}

const FILTERS: { key: RestockActiveFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'low', label: 'Low stock' },
];

export default function RestockFilterBar({
  searchTerm,
  onSearchTermChange,
  activeFilter,
  onActiveFilterChange,
}: RestockFilterBarProps) {
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-4 shadow-sm sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          className="h-11 pl-9"
        />
      </div>
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            type="button"
            variant={activeFilter === f.key ? 'default' : 'outline'}
            onClick={() => onActiveFilterChange(f.key)}
            className={cn(
              'h-11',
              activeFilter === f.key && 'bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90',
            )}
          >
            {f.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
