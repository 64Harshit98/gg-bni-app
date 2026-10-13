import { useEffect, useState } from 'react';
import { Warehouse, X } from 'lucide-react';
import type { GodownType } from '../Pages/hooks/useStockTransfer';

interface GodownFormData {
  name: string;
  location?: string;
  type: GodownType;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Saves the godown; may resolve to the new godown's id. */
  onSave: (data: GodownFormData) => Promise<unknown>;
  theme?: 'blue' | 'orange';
  /** Names of the locations that already exist, for the subtitle ("you have 1 (Shop)"). */
  existingLocations?: string[];
  /** Shows "Save & transfer stock"; receives the new godown's id. */
  onSaveAndTransfer?: (godownId: string) => void;
}

// Desktop: a centred dialog. Mobile: a bottom sheet.
export const GodownModal = ({ isOpen, onClose, onSave, theme = 'blue', existingLocations, onSaveAndTransfer }: Props) => {
  const accent = theme === 'orange'
    ? 'bg-[#F97316] hover:bg-orange-600'
    : 'bg-blue-600 hover:bg-blue-700';
  const focus = theme === 'orange'
    ? 'focus:border-orange-500 focus:ring-orange-100'
    : 'focus:border-blue-500 focus:ring-blue-100';

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [type, setType] = useState<GodownType>('godown');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setLocation('');
    setType('godown');
    setError('');
  }, [isOpen]);

  if (!isOpen) return null;

  const save = async (thenTransfer: boolean) => {
    if (!name.trim()) return setError('Godown name is required.');
    setError('');
    setSaving(true);
    try {
      const result = await onSave({ name: name.trim(), location: location.trim(), type });
      onClose();
      if (thenTransfer && onSaveAndTransfer && typeof result === 'string') onSaveAndTransfer(result);
    } catch {
      setError('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = `mt-1 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:ring-2 ${focus}`;
  const segClass = (active: boolean) =>
    `flex-1 rounded-sm px-3 py-2 text-sm font-medium transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'}`;

  return (
    <div className="fixed inset-0 z-[8000] flex items-end justify-center bg-black/40 md:items-center md:px-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-sm bg-white shadow-float md:max-w-md md:rounded-sm"
      >
        {/* Grab handle (mobile sheet) */}
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 md:hidden" />

        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-blue-600">
            <Warehouse size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">Add godown</h2>
            {existingLocations && existingLocations.length > 0 && (
              <p className="text-xs text-slate-500">
                A place where you keep stock — you have {existingLocations.length} ({existingLocations.join(', ')})
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-sm p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block text-xs font-medium text-slate-600">
            Godown name <span className="text-red-500">*</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Backroom godown"
              className={inputClass}
            />
            <span className="mt-1 block font-normal text-slate-500">e.g. Main warehouse, Shop backroom, Branch 2</span>
          </label>

          <label className="block text-xs font-medium text-slate-600">
            Location <span className="font-normal text-slate-400">· optional</span>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Sector 5, Lucknow"
              className={inputClass}
            />
          </label>

          <div>
            <p className="text-xs font-medium text-slate-600">Type</p>
            <div className="mt-1 flex gap-1 rounded-sm bg-sunken p-1" role="group">
              <button type="button" onClick={() => setType('godown')} className={segClass(type === 'godown')}>
                Godown
              </button>
              <button type="button" onClick={() => setType('branch')} className={segClass(type === 'branch')}>
                Shop / branch
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              A godown only holds stock; a shop / branch is another place you sell from. Billing still sells from your main Shop.
            </p>
          </div>

          <div className="rounded-sm bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
            It starts empty. Move stock in with <strong>Transfer stock</strong>, or pick it as the location when recording a purchase.
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 md:flex-row md:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="hidden rounded-sm px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 md:block"
          >
            Cancel
          </button>
          {onSaveAndTransfer && (
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving}
              className="rounded-sm border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-400 disabled:opacity-50 md:py-2"
            >
              Save & transfer stock
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className={`rounded-sm px-4 py-3 text-sm font-semibold text-white transition disabled:opacity-50 md:py-2 ${accent}`}
          >
            {saving ? 'Saving…' : 'Save godown'}
          </button>
        </div>
      </form>
    </div>
  );
};
