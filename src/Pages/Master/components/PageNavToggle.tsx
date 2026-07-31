import * as React from 'react';
import { cn } from '../../../lib/utils';

interface PageNavToggleItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface PageNavToggleProps {
  items: PageNavToggleItem[];
  isActive: (path: string) => boolean;
  onSelect: (path: string) => void;
}

/**
 * Compact glass-pill segmented nav used in page headers to switch between a
 * couple of closely-related views (e.g. "Add Item" / "Item Groups"). Purely
 * presentational — active-state detection and navigation are the caller's
 * responsibility via `isActive`/`onSelect`.
 */
export const PageNavToggle: React.FC<PageNavToggleProps> = ({ items, isActive, onSelect }) => (
  <div className="glass inline-flex items-center gap-1 rounded-2xl p-1 shadow-sm">
    {items.map((item) => {
      const active = isActive(item.path);
      return (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item.path)}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.98]',
            active
              ? 'bg-gradient-brand text-white shadow-md shadow-primary/25'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          {item.icon}
          {item.label}
        </button>
      );
    })}
  </div>
);
