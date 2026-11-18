import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Plus, Search, X } from 'lucide-react';
import { KITCHEN_ID, type RawMaterial } from '../../../lib/restaurant/types';
import { formatStock } from '../../../lib/restaurant/units';

interface RpRawMaterialSelectProps {
  rawMaterials: RawMaterial[];
  value: string;
  onChange: (rawMaterial: RawMaterial) => void;
  locationId?: string;
  placeholder?: string;
  onQuickCreate?: (prefillName: string) => void;
}

export const RpRawMaterialSelect: React.FC<RpRawMaterialSelectProps> = ({
  rawMaterials,
  value,
  onChange,
  locationId = KITCHEN_ID,
  placeholder = 'Select Raw Material',
  onQuickCreate,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => rawMaterials.find((r) => r.id === value) || null,
    [rawMaterials, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeList = rawMaterials.filter((r) => r.active !== false);
    if (!q) return activeList;
    return activeList.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.category || '').toLowerCase().includes(q),
    );
  }, [rawMaterials, query]);

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

  const stockAtLocation = (rm: RawMaterial): number =>
    locationId === KITCHEN_ID
      ? Number(rm.stock) || 0
      : Number(rm.godownStock?.[locationId]) || 0;

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
              placeholder="Search raw material..."
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
              filtered.map((rm) => {
                const isPicked = rm.id === value;
                const locStock = stockAtLocation(rm);
                return (
                  <button
                    key={rm.id}
                    type="button"
                    onClick={() => {
                      onChange(rm);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${
                      isPicked
                        ? 'bg-[#eef2ff] font-semibold text-[#155dfc]'
                        : 'hover:bg-[#f8faff] text-[#0f172b]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{rm.name}</div>
                      <div className="text-[11px] text-[#5b6b86]">
                        {rm.category || 'General'} · Base: {rm.baseUnit}
                        {rm.purchaseUnit ? ` (1 ${rm.purchaseUnit.name} = ${rm.purchaseUnit.factor} ${rm.baseUnit})` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-sm bg-[#eef2ff] px-1.5 py-0.5 text-[11px] font-medium text-[#0f172b] tabular-nums">
                      {formatStock(rm, locStock)}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-4 text-center text-xs text-[#5b6b86]">
                No matching raw materials found.
              </div>
            )}
          </div>

          {onQuickCreate && (
            <div className="border-t border-[#dfe6fb] bg-[#f8faff] p-1.5">
              <button
                type="button"
                onClick={() => {
                  const prefill = query.trim();
                  setOpen(false);
                  onQuickCreate(prefill);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-[#155dfc]/10 px-2.5 py-1.5 text-xs font-semibold text-[#155dfc] hover:bg-[#155dfc]/20 transition-colors"
              >
                <Plus size={14} />
                + New raw material{query.trim() ? ` "${query.trim()}"` : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
