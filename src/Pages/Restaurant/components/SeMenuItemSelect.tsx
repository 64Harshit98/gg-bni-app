import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X, UtensilsCrossed, AlertCircle } from 'lucide-react';
import type { Item } from '../../../constants/models';
import type { RawMaterial, Recipe } from '../../../lib/restaurant/types';
import { recipeCost } from '../../../lib/restaurant/consumption';

interface SeMenuItemSelectProps {
  items: Item[];
  recipeMap: Map<string, Recipe>;
  rawMaterialMap: Map<string, RawMaterial>;
  value: string;
  onChange: (item: Item) => void;
  placeholder?: string;
}

export const SeMenuItemSelect: React.FC<SeMenuItemSelectProps> = ({
  items,
  recipeMap,
  rawMaterialMap,
  value,
  onChange,
  placeholder = 'Select Menu Item',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeItems = useMemo(
    () => items.filter((i) => !i.isDeleted && Boolean(i.id)),
    [items],
  );

  const selected = useMemo(
    () => activeItems.find((i) => i.id === value) || null,
    [activeItems, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeItems;
    return activeItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q),
    );
  }, [activeItems, query]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-sm border border-[#dfe6fb] bg-white px-2.5 text-left text-xs font-medium text-[#0f172b] hover:border-[#155dfc] focus:outline-none focus:ring-2 focus:ring-[#155dfc]/20"
      >
        <span className={selected ? 'truncate text-[#0f172b] font-semibold' : 'truncate text-[#5b6b86]'}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown size={14} className="shrink-0 text-[#5b6b86]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-[1200] mt-1 w-72 sm:w-80 rounded-sm border border-[#dfe6fb] bg-white shadow-xl">
          <div className="flex items-center gap-1.5 border-b border-[#dfe6fb] px-2.5 py-2">
            <Search size={14} className="shrink-0 text-[#5b6b86]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search menu item..."
              className="w-full bg-transparent text-xs text-[#0f172b] placeholder:text-[#5b6b86] focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-[#5b6b86] hover:text-[#0f172b]"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-[#dfe6fb]/60">
            {filtered.length > 0 ? (
              filtered.map((item) => {
                const itemId = item.id || '';
                const isPicked = itemId === value;
                const rec = recipeMap.get(itemId);
                const hasRecipe = Boolean(rec && rec.ingredients.length > 0);
                const cost = hasRecipe && rec ? recipeCost(rec.ingredients, rawMaterialMap) : 0;

                return (
                  <button
                    key={itemId}
                    type="button"
                    onClick={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${
                      isPicked
                        ? 'bg-[#eef2ff] font-semibold text-[#155dfc]'
                        : 'hover:bg-[#f8faff] text-[#0f172b]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{item.name}</div>
                      {hasRecipe && rec ? (
                        <div className="flex items-center gap-1 text-[11px] text-emerald-700">
                          <UtensilsCrossed size={11} />
                          <span>
                            {rec.ingredients.length} ingredient{rec.ingredients.length === 1 ? '' : 's'} · ₹{cost.toFixed(2)}/portion
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-[11px] text-amber-600">
                          <AlertCircle size={11} />
                          <span>No recipe configured</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center text-xs text-[#5b6b86]">
                No matching menu items found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
