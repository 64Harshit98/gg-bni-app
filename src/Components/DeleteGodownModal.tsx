import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  godownName: string;
  totalQty: number;
  itemCount: number;
  /** Every location except the godown being deleted. */
  destinations: { id: string; name: string }[];
  /** Moves all stock to the chosen location, then deletes the godown. */
  onMoveAndDelete: (toId: string, toName: string) => Promise<void>;
  theme?: 'blue' | 'orange';
}

export const DeleteGodownModal = ({
  isOpen,
  onClose,
  godownName,
  totalQty,
  itemCount,
  destinations,
  onMoveAndDelete,
  theme = 'blue',
}: Props) => {
  const orange = theme === 'orange';
  const primaryBtn = orange ? 'bg-orange-700 hover:bg-orange-800' : 'bg-blue-600 hover:bg-blue-700';
  const noteBox = orange ? 'bg-orange-100 text-orange-900' : 'bg-blue-50 text-blue-900';
  const focus = orange ? 'focus:border-orange-600 focus:ring-orange-100' : 'focus:border-blue-500 focus:ring-blue-100';

  const [toId, setToId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setToId(destinations[0]?.id || '');
    setSaving(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const dest = destinations.find((d) => d.id === toId);
    if (!dest) return setError('Pick a location to move the stock to.');
    setError('');
    setSaving(true);
    try {
      await onMoveAndDelete(dest.id, dest.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move stock.');
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9000] flex items-end justify-center bg-black/40 md:items-center md:px-4"
      onClick={saving ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-sm bg-white shadow-float md:max-w-md md:rounded-sm"
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-amber-50 text-amber-600">
            <AlertTriangle size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">Delete “{godownName}”?</h2>
            <p className="text-xs text-slate-500">
              This godown still has {totalQty.toLocaleString('en-IN')} pcs ({itemCount} {itemCount === 1 ? 'item' : 'items'}). Move it before deleting.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block text-xs font-medium text-slate-600">
            Move all stock to
            <select
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              disabled={saving}
              className={`mt-1 w-full rounded-sm border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:ring-2 ${focus}`}
            >
              {destinations.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>

          <div className={`flex items-center gap-2 rounded-sm px-3 py-2.5 text-xs ${noteBox}`}>
            <span className="truncate font-semibold">{godownName}</span>
            <ArrowRight size={13} className="shrink-0" />
            <span className="truncate font-semibold">{destinations.find((d) => d.id === toId)?.name || '—'}</span>
            <span className="ml-auto shrink-0">{totalQty.toLocaleString('en-IN')} pcs</span>
          </div>

          <p className="text-xs text-slate-500">
            After the stock is moved, “{godownName}” will be deleted. This cannot be undone. The move stays in Transfer history.
          </p>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 md:flex-row md:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-sm border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50 md:py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving || !toId}
            className={`rounded-sm px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-50 md:py-2 ${primaryBtn}`}
          >
            {saving ? 'Moving stock…' : 'Move all stock & delete'}
          </button>
        </div>
      </div>
    </div>
  );
};