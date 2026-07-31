import { ArrowUpDown, Check, ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';

export type ShopSortOrder = 'A-Z' | 'Z-A' | 'Price: Low-High' | 'Price: High-Low';

const SORT_OPTIONS: ShopSortOrder[] = ['A-Z', 'Z-A', 'Price: Low-High', 'Price: High-Low'];

export interface SortDropdownProps {
  sortOrder: ShopSortOrder;
  isOpen: boolean;
  onToggleOpen: () => void;
  onSelect: (order: ShopSortOrder) => void;
}

/** Sort-order dropdown button used on the shop product grid toolbar. */
export function SortDropdown({ sortOrder, isOpen, onToggleOpen, onSelect }: SortDropdownProps) {
  return (
    <div className="relative">
      <button
        onClick={onToggleOpen}
        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 shadow-xs transition-all active:scale-95"
      >
        <ArrowUpDown size={12} className="text-foreground" />
        <span className="text-[10px] font-black uppercase text-foreground">Sort: {sortOrder}</span>
        <ChevronDown className={cn('transition-transform duration-300', isOpen && 'rotate-180')} size={12} />
      </button>
      {isOpen && (
        <div className="glass absolute right-0 z-[70] mt-2 w-40 overflow-hidden rounded-xl shadow-xl">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => onSelect(opt)}
              className={cn(
                'flex w-full items-center justify-between border-t border-border px-4 py-3 text-left text-[10px] font-black uppercase first:border-0 hover:bg-muted',
                sortOrder === opt ? 'text-primary' : 'text-foreground',
              )}
            >
              {opt.replace(':', ': ')}
              {sortOrder === opt && <Check size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
