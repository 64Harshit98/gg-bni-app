import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { name: string; location?: string }) => Promise<void>;
  theme?: 'blue' | 'orange';
}

export const GodownModal = ({ isOpen, onClose, onSave, theme = 'blue' }: Props) => {
  const accent = theme === 'orange'
    ? 'bg-[#F97316] hover:bg-orange-600 focus:ring-orange-400'
    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
  const focusRing = theme === 'orange' ? 'focus:ring-[#F97316]' : 'focus:ring-blue-500';

  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) return setError('Godown name is required.');
    setError('');
    setSaving(true);
    try {
      await onSave({ name: name.trim(), location: location.trim() });
      setName('');
      setLocation('');
      onClose();
    } catch {
      setError('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white w-full max-w-sm rounded-sm shadow-xl p-5">
        <h2 className="text-lg font-bold text-gray-800 mb-4">Add Godown</h2>

        <label className="block text-sm font-medium text-gray-600 mb-1">Godown Name</label>
        <input
          type="text"
          placeholder="e.g. Main Warehouse, Shop Backroom"
          value={name}
          onChange={e => setName(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        />

        <label className="block text-sm font-medium text-gray-600 mb-1">Location (optional)</label>
        <input
          type="text"
          placeholder="e.g. Sector 5, Lucknow"
          value={location}
          onChange={e => setLocation(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-4 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        />

        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-sm border text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 py-2 rounded-sm text-white text-sm font-semibold disabled:opacity-50 ${accent}`}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};