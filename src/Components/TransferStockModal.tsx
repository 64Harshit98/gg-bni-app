import { useMemo, useState } from 'react';
import { SHOP_ID, SHOP_NAME, type Godown, type GodownStockRow } from '../Pages/hooks/useStockTransfer';

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
    itemId: string;
    itemName: string;
    unit?: string;
    fromGodownId: string;
    fromGodownName: string;
    toGodownId: string;
    toGodownName: string;
    quantity: number;
    date: number;
    remarks?: string;
  }) => Promise<void>;
  theme?: 'blue' | 'orange';
}

const formatDateForInput = (d: Date) => d.toISOString().split('T')[0];

export const TransferStockModal = ({ isOpen, onClose, items, godowns, stockRows, onSave, theme = 'blue' }: Props) => {
  const accent = theme === 'orange'
    ? 'bg-[#F97316] hover:bg-orange-600 focus:ring-orange-400'
    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
  const focusRing = theme === 'orange' ? 'focus:ring-[#F97316]' : 'focus:ring-blue-500';

  const [itemId, setItemId] = useState('');
  const [fromGodownId, setFromGodownId] = useState('');
  const [toGodownId, setToGodownId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(formatDateForInput(new Date()));
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Godowns that actually have stock of the selected item (includes "Unassigned" bucket)
  const availableFromGodowns = useMemo(() => {
    if (!itemId) return [];
    return stockRows
      .filter(r => r.itemId === itemId && r.quantity > 0)
      .map(r => ({ godownId: r.godownId, godownName: r.godownName, quantity: r.quantity }));
  }, [itemId, stockRows]);

  const selectedFromQty = availableFromGodowns.find(g => g.godownId === fromGodownId)?.quantity ?? 0;
  const selectedItem = items.find(i => i.id === itemId);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setItemId(''); setFromGodownId(''); setToGodownId('');
    setQuantity(''); setRemarks(''); setError('');
    onClose();
  };

  const handleSave = async () => {
    const qty = Number(quantity);
    if (!itemId) return setError('Select an item.');
    if (!fromGodownId) return setError('Select source godown.');
    if (!toGodownId) return setError('Select destination godown.');
    if (fromGodownId === toGodownId) return setError('Source and destination cannot be same.');
    if (!qty || qty <= 0) return setError('Enter a valid quantity.');
    if (qty > selectedFromQty) return setError(`Only ${selectedFromQty} available in source godown.`);

    setError('');
    setSaving(true);
    try {
      const fromG = godowns.find(g => g.id === fromGodownId);
      const toG = godowns.find(g => g.id === toGodownId);
      const d = new Date(date); d.setHours(12, 0, 0, 0);

      await onSave({
        itemId,
        itemName: selectedItem?.name || '',
        unit: selectedItem?.unit,
        fromGodownId,
        fromGodownName: fromGodownId === SHOP_ID ? SHOP_NAME : (fromG?.name || ''),
        toGodownId,
        toGodownName: toGodownId === SHOP_ID ? SHOP_NAME : (toG?.name || ''),
        quantity: qty,
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
      <div className="bg-white w-full max-w-sm rounded-sm shadow-xl p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Transfer Stock</h2>

        <label className="block text-sm font-medium text-gray-600 mb-1">Item</label>
        <select
          value={itemId}
          onChange={e => { setItemId(e.target.value); setFromGodownId(''); }}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        >
          <option value="">Select item</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>

        <label className="block text-sm font-medium text-gray-600 mb-1">From Godown</label>
        <select
          value={fromGodownId}
          onChange={e => setFromGodownId(e.target.value)}
          disabled={!itemId}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing} disabled:opacity-50`}
        >
          <option value="">Select source</option>
          {availableFromGodowns.map(g => (
            <option key={g.godownId} value={g.godownId}>
              {g.godownId === SHOP_ID ? `🏪 ${SHOP_NAME}` : g.godownName} (Available: {g.quantity})
            </option>
          ))}
        </select>
        {itemId && availableFromGodowns.length === 0 && (
          <p className="text-xs text-orange-500 -mt-2 mb-3">No stock of this item in any godown yet.</p>
        )}

        <label className="block text-sm font-medium text-gray-600 mb-1">To</label>
        <select
          value={toGodownId}
          onChange={e => setToGodownId(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        >
          <option value="">Select destination</option>
          {fromGodownId !== SHOP_ID && (
            <option value={SHOP_ID}>🏪 {SHOP_NAME}</option>
          )}
          {godowns.filter(g => g.id !== fromGodownId).map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>

        <label className="block text-sm font-medium text-gray-600 mb-1">Quantity {selectedItem?.unit ? `(${selectedItem.unit})` : ''}</label>
        <input
          type="number"
          placeholder="0"
          value={quantity}
          onChange={e => setQuantity(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        />

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