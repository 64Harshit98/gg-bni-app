import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    amount: number;
    date: number;
  }) => Promise<void>;
  theme?: 'blue' | 'orange';
}

export const ExpenseModal = ({ isOpen, onClose, onSave, theme = 'blue' }: Props) => {
  const accent = theme === 'orange'
    ? 'bg-[#F97316] hover:bg-orange-600 focus:ring-orange-400'
    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
  const focusRing = theme === 'orange' ? 'focus:ring-[#F97316]' : 'focus:ring-blue-500';
  const today = new Date().toISOString().split('T')[0];
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!title.trim()) return setError('Title is required.');
    if (!description.trim()) return setError('Description is required.');
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      return setError('Enter a valid amount.');
    setError('');
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim(),
        amount: Number(amount),
        date: new Date(date).getTime(),
      });
      setTitle('');
      setDescription('');
      setAmount('');
      setDate(today);
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
        <h2 className="text-lg font-bold text-gray-800 mb-4">Add Expense</h2>
        {/* Title */}
        <label className="block text-sm font-medium text-gray-600 mb-1">Title</label>
        <input
          type="text"
          placeholder="e.g. Shop Rent, Staff Salary"
          value={title}
          onChange={e => setTitle(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        />
        {/* Description */}
        <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
        <input
          type="text"
          placeholder="e.g. Payment for ...."
          value={description}
          onChange={e => setDescription(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        />

        {/* Amount */}
        <label className="block text-sm font-medium text-gray-600 mb-1">Amount (₹)</label>
        <input
          type="number"
          placeholder="0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        />

        {/* Date */}
        <label className="block text-sm font-medium text-gray-600 mb-1">Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
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