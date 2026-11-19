import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import type { RawMaterial, RecipeLine } from '../../../lib/restaurant/types';
import {
  formatStock,
  round3,
  toBase,
  unitCostOf,
  unitsOf,
} from '../../../lib/restaurant/units';

interface SearchableRmSelectProps {
  value: string;
  rawMaterials: RawMaterial[];
  rawMaterialMap: Map<string, RawMaterial>;
  usedIdsInTable: Set<string>;
  isDuplicate: boolean;
  onChange: (rm: RawMaterial) => void;
  onRequestQuickAdd: () => void;
}

const SearchableRmSelect: React.FC<SearchableRmSelectProps> = ({
  value,
  rawMaterials,
  rawMaterialMap,
  usedIdsInTable,
  isDuplicate,
  onChange,
  onRequestQuickAdd,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedRm = value ? rawMaterialMap.get(value) : undefined;

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

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rawMaterials.filter((rm) => {
      if (rm.active === false && rm.id !== value) return false;
      if (!q) return true;
      return (
        rm.name.toLowerCase().includes(q) ||
        (rm.category || '').toLowerCase().includes(q)
      );
    });
    return list.sort((a, b) => {
      if (!!a.favourite !== !!b.favourite) return a.favourite ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
  }, [rawMaterials, query, value]);

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setQuery('');
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-sm border bg-white px-2.5 py-1.5 text-left text-xs transition ${
          isDuplicate
            ? 'border-red-400 bg-red-50/40 text-red-900'
            : selectedRm
              ? 'border-[#dfe6fb] text-[#0f172b] hover:border-[#155dfc]'
              : 'border-amber-300 bg-amber-50/30 text-[#5b6b86] hover:border-[#155dfc]'
        }`}
      >
        <span className="truncate font-medium">
          {selectedRm ? (
            <>
              {selectedRm.name}{' '}
              <span className="text-[11px] font-normal text-[#5b6b86]">
                ({selectedRm.category || 'General'} • {formatStock(selectedRm, selectedRm.stock || 0)})
              </span>
            </>
          ) : value ? (
            <span className="text-red-600">Deleted raw material</span>
          ) : (
            'Select raw material...'
          )}
        </span>
        <ChevronDown size={14} className="shrink-0 text-[#5b6b86]" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[260px] overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-xl">
          <div className="border-b border-[#dfe6fb] bg-[#f8faff] p-2">
            <div className="relative">
              <Search
                size={13}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5b6b86]"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ingredient or category..."
                autoFocus
                className="w-full rounded-sm border border-[#dfe6fb] bg-white py-1.5 pl-7 pr-2 text-xs text-[#0f172b] outline-none focus:border-[#155dfc]"
              />
            </div>
          </div>

          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[#5b6b86]">
                No matching raw material found.
              </div>
            ) : (
              filteredOptions.map((rm) => {
                const isCurrent = rm.id === value;
                const alreadyUsed = !isCurrent && usedIdsInTable.has(rm.id);
                return (
                  <button
                    key={rm.id}
                    type="button"
                    onClick={() => {
                      onChange(rm);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition ${
                      isCurrent
                        ? 'bg-[#e6eeff] font-semibold text-[#155dfc]'
                        : alreadyUsed
                          ? 'bg-slate-50 text-[#5b6b86] hover:bg-[#f5f7ff]'
                          : 'text-[#0f172b] hover:bg-[#f5f7ff]'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {rm.favourite && (
                          <Star size={11} className="shrink-0 fill-amber-400 text-amber-500" />
                        )}
                        <span className="truncate font-medium">{rm.name}</span>
                        {alreadyUsed && (
                          <span className="rounded-sm bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                            Added
                          </span>
                        )}
                      </div>
                      <span className="block truncate text-[10px] text-[#5b6b86]">
                        {rm.category || 'General'} • Stock: {formatStock(rm, rm.stock || 0)}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-[#5b6b86]">
                      {rm.baseUnit}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-[#dfe6fb] bg-[#f5f7ff] p-1.5">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRequestQuickAdd();
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-white px-2.5 py-1.5 text-xs font-semibold text-[#155dfc] shadow-2xs transition hover:bg-[#e6eeff]"
            >
              <Sparkles size={13} />
              + Add New Raw-Material
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export interface RecipeIngredientTableProps {
  lines: RecipeLine[];
  onChange: (next: RecipeLine[]) => void;
  rawMaterials: RawMaterial[];
  rawMaterialMap: Map<string, RawMaterial>;
  onRequestQuickAdd: (onCreatedCallback: (rmId: string, baseUnit: string) => void) => void;
  addRowLabel?: string;
  emptyText?: string;
}

export const RecipeIngredientTable: React.FC<RecipeIngredientTableProps> = ({
  lines,
  onChange,
  rawMaterials,
  rawMaterialMap,
  onRequestQuickAdd,
  addRowLabel = '+ Add Row',
  emptyText = 'No ingredients added yet. Click "+ Add Row" to start building this recipe.',
}) => {
  // Detect duplicate rawMaterialIds within this table
  const duplicateIds = useMemo(() => {
    const counts = new Map<string, number>();
    lines.forEach((l) => {
      if (l.rawMaterialId) {
        counts.set(l.rawMaterialId, (counts.get(l.rawMaterialId) || 0) + 1);
      }
    });
    const dups = new Set<string>();
    counts.forEach((count, id) => {
      if (count > 1) dups.add(id);
    });
    return dups;
  }, [lines]);

  const usedIdsInTable = useMemo(
    () => new Set(lines.map((l) => l.rawMaterialId).filter(Boolean)),
    [lines],
  );

  const handleAddRow = () => {
    onChange([...lines, { rawMaterialId: '', qty: 1, unit: 'GRM' }]);
  };

  const handleRemoveRow = (index: number) => {
    onChange(lines.filter((_, i) => i !== index));
  };

  const handleSelectRawMaterial = (index: number, rm: RawMaterial) => {
    const allowedUnits = unitsOf(rm).map((u) => u.name);
    const currentLine = lines[index];
    const nextUnit =
      currentLine && allowedUnits.some((u) => u.toLowerCase() === currentLine.unit.toLowerCase())
        ? currentLine.unit
        : rm.baseUnit;

    const next = lines.map((line, i) =>
      i === index
        ? {
            ...line,
            rawMaterialId: rm.id,
            unit: nextUnit,
            qty: line.qty > 0 ? line.qty : 1,
          }
        : line,
    );
    onChange(next);
  };

  const handleQtyChange = (index: number, rawValue: string) => {
    const parsed = rawValue === '' ? 0 : Number(rawValue);
    const next = lines.map((line, i) =>
      i === index ? { ...line, qty: Number.isNaN(parsed) ? 0 : parsed } : line,
    );
    onChange(next);
  };

  const handleUnitChange = (index: number, unitName: string) => {
    const next = lines.map((line, i) =>
      i === index ? { ...line, unit: unitName } : line,
    );
    onChange(next);
  };

  const triggerQuickAddForRow = (rowIndex?: number) => {
    onRequestQuickAdd((newRmId, baseUnit) => {
      if (rowIndex !== undefined && rowIndex >= 0 && rowIndex < lines.length) {
        const next = lines.map((line, i) =>
          i === rowIndex
            ? {
                rawMaterialId: newRmId,
                qty: line.qty > 0 ? line.qty : 1,
                unit: baseUnit,
              }
            : line,
        );
        onChange(next);
      } else {
        onChange([...lines, { rawMaterialId: newRmId, qty: 1, unit: baseUnit }]);
      }
    });
  };

  return (
    <div className="space-y-2.5">
      {duplicateIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          <span>
            Duplicate raw material detected in this table. Please combine quantities into a single row.
          </span>
        </div>
      )}

      {lines.length === 0 ? (
        <div className="rounded-sm border border-dashed border-[#dfe6fb] bg-[#f8faff] px-4 py-6 text-center text-xs text-[#5b6b86]">
          {emptyText}
        </div>
      ) : (
        <div className="overflow-visible rounded-sm border border-[#dfe6fb] bg-white">
          {/* Desktop header */}
          <div className="hidden grid-cols-[1fr_120px_130px_100px_44px] items-center gap-2 border-b border-[#dfe6fb] bg-[#f5f7ff] px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#5b6b86] sm:grid">
            <div>Raw Material</div>
            <div>Quantity</div>
            <div>Unit</div>
            <div className="text-right">Est. Cost</div>
            <div className="text-center">Action</div>
          </div>

          <div className="divide-y divide-[#dfe6fb]">
            {lines.map((line, idx) => {
              const rm = line.rawMaterialId ? rawMaterialMap.get(line.rawMaterialId) : undefined;
              const unitOptions = rm
                ? unitsOf(rm)
                : [{ name: line.unit || 'GRM', factor: 1 }];
              const isDup = !!line.rawMaterialId && duplicateIds.has(line.rawMaterialId);
              const invalidQty = !!line.rawMaterialId && !(Number(line.qty) > 0);
              const rowCost =
                rm && Number(line.qty) > 0
                  ? round3(toBase(rm, Number(line.qty), line.unit) * unitCostOf(rm))
                  : 0;

              return (
                <div
                  key={idx}
                  className={`grid grid-cols-1 gap-2 p-2.5 sm:grid-cols-[1fr_120px_130px_100px_44px] sm:items-center sm:px-3 sm:py-2 ${
                    isDup ? 'bg-red-50/40' : ''
                  }`}
                >
                  {/* Raw Material Select */}
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold uppercase text-[#5b6b86] sm:hidden">
                      Raw Material
                    </label>
                    <SearchableRmSelect
                      value={line.rawMaterialId}
                      rawMaterials={rawMaterials}
                      rawMaterialMap={rawMaterialMap}
                      usedIdsInTable={usedIdsInTable}
                      isDuplicate={isDup}
                      onChange={(chosen) => handleSelectRawMaterial(idx, chosen)}
                      onRequestQuickAdd={() => triggerQuickAddForRow(idx)}
                    />
                  </div>

                  {/* Quantity + Unit + Cost + Delete (mobile row / desktop cells) */}
                  <div className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2 sm:contents">
                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase text-[#5b6b86] sm:hidden">
                        Quantity
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={line.qty === 0 ? '' : line.qty}
                        onChange={(e) => handleQtyChange(idx, e.target.value)}
                        placeholder="0"
                        className={`w-full rounded-sm border bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0f172b] outline-none transition ${
                          invalidQty
                            ? 'border-red-400 bg-red-50/40 focus:border-red-500'
                            : 'border-[#dfe6fb] focus:border-[#155dfc]'
                        }`}
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] font-semibold uppercase text-[#5b6b86] sm:hidden">
                        Unit
                      </label>
                      <select
                        value={line.unit}
                        onChange={(e) => handleUnitChange(idx, e.target.value)}
                        disabled={!rm}
                        aria-label="Ingredient unit"
                        className="w-full rounded-sm border border-[#dfe6fb] bg-[#f8faff] px-2 py-1.5 text-xs font-semibold text-[#0f172b] outline-none focus:border-[#155dfc] disabled:opacity-60"
                      >
                        {unitOptions.map((u) => (
                          <option key={u.name} value={u.name}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="text-right text-xs font-semibold text-[#5b6b86]">
                      <span className="block text-[10px] uppercase sm:hidden">Cost</span>
                      {rm ? `₹${rowCost.toLocaleString('en-IN')}` : '—'}
                    </div>

                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveRow(idx)}
                        title="Remove ingredient"
                        aria-label="Remove ingredient"
                        className="rounded-sm p-1.5 text-[#5b6b86] transition hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action buttons under table */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleAddRow}
          className="inline-flex items-center gap-1.5 rounded-sm border border-[#155dfc] bg-white px-3 py-1.5 text-xs font-semibold text-[#155dfc] transition hover:bg-[#f5f7ff]"
        >
          <Plus size={14} />
          {addRowLabel}
        </button>

        <button
          type="button"
          onClick={() => triggerQuickAddForRow(undefined)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-[#f8faff] px-3 py-1.5 text-xs font-semibold text-[#0f172b] transition hover:border-[#155dfc] hover:text-[#155dfc]"
        >
          <Sparkles size={13} className="text-[#155dfc]" />
          + Add New Raw-Material
        </button>
      </div>
    </div>
  );
};
