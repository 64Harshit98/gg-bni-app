import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, ChevronDown, Minus, Plus, ScanLine, Trash2, X } from 'lucide-react';
import { SHOP_ID, SHOP_NAME, type Godown, type GodownStockRow, type TransferItemInput } from '../Pages/hooks/useStockTransfer';

interface ItemOption {
  id: string;
  name: string;
  unit?: string;
  barcode?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: ItemOption[];
  godowns: Godown[];
  stockRows: GodownStockRow[];
  onSave: (data: {
    items: TransferItemInput[];
    fromGodownId: string;
    fromGodownName: string;
    toGodownId: string;
    toGodownName: string;
    date: number;
    remarks?: string;
  }) => Promise<void>;
  theme?: 'blue' | 'orange';
  /** Pre-picks the From location (e.g. the row's godown for "Move"). */
  initialFromId?: string;
  /** Pre-picks the To location (e.g. a godown just created). */
  initialToId?: string;
  /** Pre-adds one item line (e.g. the row's item for "Move"). */
  initialItemId?: string;
}

interface Line {
  itemId: string;
  quantity: number;
}

// Local yyyy-mm-dd (toISOString() is UTC and shows yesterday before 5:30 AM IST).
const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Desktop: a centred dialog. Mobile: a bottom sheet.
export const TransferStockModal = ({
  isOpen,
  onClose,
  items,
  godowns,
  stockRows,
  onSave,
  theme = 'blue',
  initialFromId,
  initialToId,
  initialItemId,
}: Props) => {
  const accent = theme === 'orange' ? 'bg-[#F97316] hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700';
  const focus = theme === 'orange' ? 'focus:border-orange-500 focus:ring-orange-100' : 'focus:border-blue-500 focus:ring-blue-100';

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  // What the user is typing in a qty box; committed (and clamped) on blur / Enter
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [date, setDate] = useState(toInputDate(new Date()));
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Every location: Shop first, then godowns.
  const locations = useMemo(
    () => [
      { id: SHOP_ID, name: SHOP_NAME, location: '' },
      ...godowns.map((g) => ({ id: g.id, name: g.name, location: g.location || '' })),
    ],
    [godowns],
  );

  const qtyAt = useMemo(() => {
    const map = new Map<string, number>(); // `${locationId}:${itemId}` → qty
    stockRows.forEach((r) => map.set(`${r.godownId}:${r.itemId}`, (map.get(`${r.godownId}:${r.itemId}`) || 0) + r.quantity));
    return (locationId: string, itemId: string) => map.get(`${locationId}:${itemId}`) || 0;
  }, [stockRows]);

  const locationTotals = useMemo(() => {
    const totals = new Map<string, { qty: number; items: number }>();
    stockRows.forEach((r) => {
      const t = totals.get(r.godownId) ?? { qty: 0, items: 0 };
      totals.set(r.godownId, { qty: t.qty + r.quantity, items: t.items + 1 });
    });
    return (id: string) => totals.get(id) ?? { qty: 0, items: 0 };
  }, [stockRows]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const nameOf = (id: string) => locations.find((l) => l.id === id)?.name || '';

  // Reset (and apply any pre-picks) each time it opens.
  useEffect(() => {
    if (!isOpen) return;
    const from = initialFromId || (locationTotals(SHOP_ID).qty > 0 ? SHOP_ID : locations.find((l) => locationTotals(l.id).qty > 0)?.id || SHOP_ID);
    const to = initialToId && initialToId !== from ? initialToId : locations.find((l) => l.id !== from)?.id || '';
    setFromId(from);
    setToId(to);
    setLines(initialItemId && qtyAt(from, initialItemId) > 0 ? [{ itemId: initialItemId, quantity: 1 }] : []);
    setQtyDrafts({});
    setSearch('');
    setDate(toInputDate(new Date()));
    setRemarks('');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Items that have stock at the From location and aren't added yet.
  const suggestions = useMemo(() => {
    if (!fromId) return [];
    const q = search.trim().toLowerCase();
    const added = new Set(lines.map((l) => l.itemId));
    return stockRows
      .filter((r) => r.godownId === fromId && r.quantity > 0 && !added.has(r.itemId))
      .filter((r) => {
        if (!q) return true;
        const barcode = String(itemById.get(r.itemId)?.barcode || '').toLowerCase();
        return r.itemName.toLowerCase().includes(q) || barcode.includes(q);
      })
      .slice(0, 8);
  }, [fromId, search, lines, stockRows, itemById]);

  if (!isOpen) return null;

  const addLine = (itemId: string) => {
    setLines((prev) => [...prev, { itemId, quantity: 1 }]);
    setSearch('');
    searchRef.current?.focus();
  };

  const setQty = (itemId: string, value: number) => {
    const max = qtyAt(fromId, itemId);
    setLines((prev) => prev.map((l) => (l.itemId === itemId ? { ...l, quantity: Math.max(1, Math.min(max, Math.round(value) || 1)) } : l)));
    setQtyDrafts((d) => {
      const next = { ...d };
      delete next[itemId];
      return next;
    });
  };

  const commitQtyDraft = (itemId: string) => {
    const draft = qtyDrafts[itemId];
    if (draft === undefined) return;
    const current = lines.find((l) => l.itemId === itemId)?.quantity ?? 1;
    setQty(itemId, draft === '' ? current : Number(draft));
  };

  const changeFrom = (id: string) => {
    setFromId(id);
    if (toId === id) setToId(locations.find((l) => l.id !== id)?.id || '');
    // Lines depend on what's at the From location — keep only what's there, capped.
    setLines((prev) =>
      prev.filter((l) => qtyAt(id, l.itemId) > 0).map((l) => ({ ...l, quantity: Math.min(l.quantity, qtyAt(id, l.itemId)) })),
    );
  };

  const swap = () => {
    const newTo = fromId;
    changeFrom(toId);
    setToId(newTo);
  };

  const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
  const fromTotal = locationTotals(fromId).qty;
  const toTotal = locationTotals(toId).qty;

  const handleSave = async () => {
    if (!fromId || !toId) return setError('Pick where the stock moves from and to.');
    if (fromId === toId) return setError('From and To must be different places.');
    if (lines.length === 0) return setError('Add at least one item.');
    setError('');
    setSaving(true);
    try {
      const d = new Date(`${date}T12:00:00`);
      await onSave({
        items: lines.map((l) => {
          const row = stockRows.find((r) => r.godownId === fromId && r.itemId === l.itemId);
          return { itemId: l.itemId, itemName: row?.itemName || itemById.get(l.itemId)?.name || '', unit: row?.unit, quantity: l.quantity };
        }),
        fromGodownId: fromId,
        fromGodownName: nameOf(fromId),
        toGodownId: toId,
        toGodownName: nameOf(toId),
        date: d.getTime(),
        remarks: remarks.trim(),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transfer.');
    } finally {
      setSaving(false);
    }
  };

  const renderLocationCard = (label: string, value: string, onChange: (id: string) => void, options: typeof locations) => {
    const loc = locations.find((l) => l.id === value);
    const t = locationTotals(value);
    return (
      <label className="relative block min-w-0 flex-1 cursor-pointer rounded-sm border border-slate-300 bg-white px-3 py-2.5 hover:border-slate-400">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <span className="flex items-center justify-between gap-1">
          <span className="truncate text-sm font-semibold text-slate-900">{loc?.name || 'Pick a place'}</span>
          <ChevronDown size={14} className="shrink-0 text-slate-400" />
        </span>
        <span className="block truncate text-xs text-slate-500">
          {t.qty.toLocaleString('en-IN')} pcs{t.items ? ` · ${t.items} items` : ''}
          {loc?.location ? ` · ${loc.location}` : ''}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`${label} location`}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="fixed inset-0 z-[8000] flex items-end justify-center bg-black/40 md:items-center md:px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-sm bg-white shadow-float md:max-w-lg md:rounded-sm"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300 md:hidden" />

        {/* Header */}
        <div className="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-blue-600">
            <ArrowLeftRight size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">Transfer stock</h2>
            <p className="text-xs text-slate-500">Move items between your locations</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* From → To */}
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Move stock</p>
            <div className="flex items-center gap-2">
              {renderLocationCard('From', fromId, changeFrom, locations)}
              <button
                type="button"
                onClick={swap}
                disabled={!toId}
                aria-label="Swap from and to"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-white text-slate-600 hover:border-slate-400 disabled:opacity-40"
              >
                <ArrowLeftRight size={15} />
              </button>
              {renderLocationCard('To', toId, setToId, locations.filter((l) => l.id !== fromId))}
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">
              Items <span className="text-red-500">*</span>
            </p>
            <div className="relative">
              <ScanLine size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  // Scanners type the barcode then Enter — add the match straight away.
                  if (e.key === 'Enter' && suggestions.length > 0) {
                    e.preventDefault();
                    const exact = suggestions.find((s) => String(itemById.get(s.itemId)?.barcode || '') === search.trim());
                    addLine((exact ?? suggestions[0]).itemId);
                  }
                }}
                placeholder={`Search or scan item in ${nameOf(fromId) || 'From'}`}
                className={`w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:ring-2 ${focus}`}
              />
              {search.trim() && (
                <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-sm border border-line bg-white p-1 shadow-float">
                  {suggestions.length === 0 && (
                    <li className="px-2.5 py-2 text-xs text-slate-500">No items with stock in {nameOf(fromId)} match “{search}”.</li>
                  )}
                  {suggestions.map((s) => (
                    <li key={s.itemId}>
                      <button
                        type="button"
                        onClick={() => addLine(s.itemId)}
                        className="flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-left text-sm hover:bg-sunken"
                      >
                        <span className="truncate text-slate-800">{s.itemName}</span>
                        <span className="shrink-0 text-xs text-slate-500">{s.quantity.toLocaleString('en-IN')} in {nameOf(fromId)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {lines.length > 0 ? (
              <ul className="mt-2 divide-y divide-line rounded-sm border border-line">
                {lines.map((l) => {
                  const available = qtyAt(fromId, l.itemId);
                  const item = itemById.get(l.itemId);
                  return (
                    <li key={l.itemId} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {stockRows.find((r) => r.itemId === l.itemId)?.itemName || item?.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {available.toLocaleString('en-IN')} in {nameOf(fromId)}
                          {l.quantity === available && ' · moving all'}
                        </p>
                      </div>
                      <div className="flex h-8 shrink-0 items-center rounded-sm border border-slate-300">
                        <button type="button" onClick={() => setQty(l.itemId, l.quantity - 1)} disabled={l.quantity <= 1} aria-label="Less" className="flex h-full w-8 items-center justify-center text-slate-600 disabled:opacity-30">
                          <Minus size={13} />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label="Quantity"
                          value={qtyDrafts[l.itemId] ?? String(l.quantity)}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (/^\d*$/.test(v)) setQtyDrafts((d) => ({ ...d, [l.itemId]: v }));
                          }}
                          onBlur={() => commitQtyDraft(l.itemId)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          className="h-full w-14 border-x border-slate-300 text-center text-sm font-semibold text-slate-900 outline-none"
                        />
                        <button type="button" onClick={() => setQty(l.itemId, l.quantity + 1)} disabled={l.quantity >= available} aria-label="More" className="flex h-full w-8 items-center justify-center text-slate-600 disabled:opacity-30">
                          <Plus size={13} />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((x) => x.itemId !== l.itemId))}
                        aria-label="Remove item"
                        className="rounded-sm p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                {locationTotals(fromId).qty > 0
                  ? `Search or scan items that are in ${nameOf(fromId)}.`
                  : `${nameOf(fromId) || 'This place'} has no stock to move — pick another From location.`}
              </p>
            )}
          </div>

          {/* Date + remarks */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-xs font-medium text-slate-600">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`mt-1 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 ${focus}`}
              />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Remarks <span className="font-normal text-slate-400">· optional</span>
              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Moved for restocking"
                className={`mt-1 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 ${focus}`}
              />
            </label>
          </div>

          {/* Live summary */}
          {totalQty > 0 && toId && (
            <div className="rounded-sm bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
              Moving <strong>{totalQty.toLocaleString('en-IN')} pcs</strong> of {lines.length} {lines.length === 1 ? 'item' : 'items'} ·{' '}
              {nameOf(fromId)} {fromTotal.toLocaleString('en-IN')} → <strong>{(fromTotal - totalQty).toLocaleString('en-IN')}</strong> ·{' '}
              {nameOf(toId)} {toTotal.toLocaleString('en-IN')} → <strong>{(toTotal + totalQty).toLocaleString('en-IN')}</strong>
            </div>
          )}

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 gap-2 border-t border-line px-5 py-4 md:justify-end">
          <button type="button" onClick={onClose} className="hidden rounded-sm px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 md:block">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || totalQty === 0 || !toId}
            className={`w-full rounded-sm px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-50 md:w-auto md:py-2 ${accent}`}
          >
            {saving ? 'Moving…' : totalQty > 0 ? `Transfer ${totalQty.toLocaleString('en-IN')} pcs` : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
};
