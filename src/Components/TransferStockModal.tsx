import { useMemo, useState } from 'react';
import { SHOP_ID, SHOP_NAME, type Godown, type GodownStockRow, type TransferItemInput } from '../Pages/hooks/useStockTransfer';

interface ItemOption {
  id: string;
  name: string;
  unit?: string;
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
}

interface TransferRow {
  rowId: string;
  itemId: string;
  quantity: string;
}

const formatDateForInput = (d: Date) => d.toISOString().split('T')[0];
const makeRowId = () => Math.random().toString(36).slice(2);

export const TransferStockModal = ({ isOpen, onClose, godowns, stockRows, onSave, theme = 'blue' }: Props) => {
  const accent = theme === 'orange'
    ? 'bg-[#F97316] hover:bg-orange-600 focus:ring-orange-400'
    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
  const focusRing = theme === 'orange' ? 'focus:ring-[#F97316]' : 'focus:ring-blue-500';

  const [fromGodownId, setFromGodownId] = useState('');
  const [toGodownId, setToGodownId] = useState('');
  const [rows, setRows] = useState<TransferRow[]>([{ rowId: makeRowId(), itemId: '', quantity: '' }]);
  const [date, setDate] = useState(formatDateForInput(new Date()));
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Every location (Shop + godowns) that has stock of at least one item —
  // used for the "From" dropdown.
  const fromLocationOptions = useMemo(() => {
    const ids = new Set(stockRows.filter(r => r.quantity > 0).map(r => r.godownId));
    return Array.from(ids).map(id => ({
      id,
      name: id === SHOP_ID ? SHOP_NAME : (godowns.find(g => g.id === id)?.name || 'Unknown'),
    }));
  }, [stockRows, godowns]);

  // Items with stock in the selected "From" location, keyed for quick lookup.
  const itemsInFromGodown = useMemo(() => {
    if (!fromGodownId) return [];
    return stockRows.filter(r => r.godownId === fromGodownId && r.quantity > 0);
  }, [fromGodownId, stockRows]);

  const usedItemIds = new Set(rows.map(r => r.itemId).filter(Boolean));

  if (!isOpen) return null;

  const resetAndClose = () => {
    setFromGodownId(''); setToGodownId('');
    setRows([{ rowId: makeRowId(), itemId: '', quantity: '' }]);
    setRemarks(''); setError('');
    onClose();
  };

  const updateRow = (rowId: string, patch: Partial<TransferRow>) => {
    setRows(prev => prev.map(r => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows(prev => [...prev, { rowId: makeRowId(), itemId: '', quantity: '' }]);
  const removeRow = (rowId: string) => setRows(prev => prev.filter(r => r.rowId !== rowId));

  const handleFromGodownChange = (id: string) => {
    setFromGodownId(id);
    // Item choices depend on the source godown, so clear picks made before this change.
    setRows([{ rowId: makeRowId(), itemId: '', quantity: '' }]);
  };

  const handleSave = async () => {
    if (!fromGodownId) return setError('Select source location.');
    if (!toGodownId) return setError('Select destination.');
    if (fromGodownId === toGodownId) return setError('Source and destination cannot be same.');

    const filledRows = rows.filter(r => r.itemId);
    if (!filledRows.length) return setError('Add at least one item.');

    const transferItems: TransferItemInput[] = [];
    for (const row of filledRows) {
      const stockRow = itemsInFromGodown.find(r => r.itemId === row.itemId);
      const qty = Number(row.quantity);
      if (!qty || qty <= 0) return setError(`Enter a valid quantity for ${stockRow?.itemName || 'item'}.`);
      if (qty > (stockRow?.quantity ?? 0)) return setError(`Only ${stockRow?.quantity ?? 0} available for ${stockRow?.itemName}.`);
      transferItems.push({
        itemId: row.itemId,
        itemName: stockRow?.itemName || '',
        unit: stockRow?.unit,
        quantity: qty,
      });
    }

    setError('');
    setSaving(true);
    try {
      const fromLoc = fromLocationOptions.find(l => l.id === fromGodownId);
      const toG = godowns.find(g => g.id === toGodownId);
      const d = new Date(date); d.setHours(12, 0, 0, 0);

      await onSave({
        items: transferItems,
        fromGodownId,
        fromGodownName: fromLoc?.name || '',
        toGodownId,
        toGodownName: toGodownId === SHOP_ID ? SHOP_NAME : (toG?.name || ''),
        date: d.getTime(),
        remarks: remarks.trim(),
      });
      resetAndClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save transfer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white w-full max-w-md rounded-sm shadow-xl p-5 max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Transfer Stock</h2>

        <label className="block text-sm font-medium text-gray-600 mb-1">From</label>
        <select
          value={fromGodownId}
          onChange={e => handleFromGodownChange(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        >
          <option value="">Select source</option>
          {fromLocationOptions.map(l => (
            <option key={l.id} value={l.id}>{l.id === SHOP_ID ? `🏪 ${l.name}` : l.name}</option>
          ))}
        </select>

        <label className="block text-sm font-medium text-gray-600 mb-1">To</label>
        <select
          value={toGodownId}
          onChange={e => setToGodownId(e.target.value)}
          disabled={!fromGodownId}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing} disabled:opacity-50`}
        >
          <option value="">Select destination</option>
          {fromGodownId !== SHOP_ID && (
            <option value={SHOP_ID}>🏪 {SHOP_NAME}</option>
          )}
          {godowns.filter(g => g.id !== fromGodownId).map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>

        {fromGodownId && itemsInFromGodown.length === 0 && (
          <p className="text-xs text-orange-500 mb-3">No stock available at this source location.</p>
        )}

        <label className="block text-sm font-medium text-gray-600 mb-1">Items</label>
        <div className="space-y-2 mb-2">
          {rows.map(row => {
            //const stockRow = itemsInFromGodown.find(r => r.itemId === row.itemId);
            const availableForRow = itemsInFromGodown.filter(
              r => r.itemId === row.itemId || !usedItemIds.has(r.itemId)
            );
            return (
              <div key={row.rowId} className="flex gap-2 items-start">
                <select
                  value={row.itemId}
                  onChange={e => updateRow(row.rowId, { itemId: e.target.value, quantity: '' })}
                  disabled={!fromGodownId}
                  className={`flex-1 min-w-0 border rounded-sm p-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 ${focusRing} disabled:opacity-50`}
                >
                  <option value="">Select item</option>
                  {availableForRow.map(r => (
                    <option key={r.itemId} value={r.itemId}>{r.itemName} (Avail: {r.quantity})</option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={e => updateRow(row.rowId, { quantity: e.target.value })}
                  disabled={!row.itemId}
                  className={`w-20 shrink-0 border rounded-sm p-1.5 text-sm bg-gray-50 focus:outline-none focus:ring-2 ${focusRing} disabled:opacity-50`}
                />
                {rows.length > 1 && (
                  <button
                    onClick={() => removeRow(row.rowId)}
                    className="px-2 text-red-400 hover:text-red-600 text-sm"
                    type="button"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={addRow}
          disabled={!fromGodownId || itemsInFromGodown.length === 0 || usedItemIds.size >= itemsInFromGodown.length}
          className={`text-sm font-medium mb-4 ${theme === 'orange' ? 'text-[#F97316]' : 'text-blue-600'} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          + Add another item
        </button>

        <label className="block text-sm font-medium text-gray-600 mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        />

        <label className="block text-sm font-medium text-gray-600 mb-1">Remarks (optional)</label>
        <input
          type="text"
          placeholder="e.g. Moved for restocking"
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-4 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        />

        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={resetAndClose}
            className="flex-1 py-2 rounded-sm border text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 py-2 rounded-sm text-white text-sm font-semibold disabled:opacity-50 ${accent}`}
          >
            {saving ? 'Saving…' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
};