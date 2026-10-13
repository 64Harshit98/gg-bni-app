import { useEffect, useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAID_FROM,
} from '../Pages/Reports/ExpenseReport/expenseRangeCache';

interface ExpenseFormData {
  title: string;
  description: string;
  amount: number;
  date: number;
  addedBy: string;
  category: string;
  paidFrom: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ExpenseFormData) => Promise<void>;
  theme?: 'blue' | 'orange';
  currentUserName: string;
  /** Pre-fills the form for editing an existing expense. */
  initialValues?: Partial<ExpenseFormData>;
}

// Local yyyy-mm-dd (toISOString() is UTC and shows yesterday before 5:30 AM IST).
const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const ExpenseModal = ({ isOpen, onClose, onSave, theme = 'blue', currentUserName, initialValues }: Props) => {
  const accent = theme === 'orange'
    ? 'bg-[#F97316] hover:bg-orange-600 focus:ring-orange-400'
    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
  const focusRing = theme === 'orange' ? 'focus:ring-[#F97316]' : 'focus:ring-blue-500';
  const chipActive = theme === 'orange'
    ? 'border-[#F97316] bg-orange-50 text-orange-700'
    : 'border-blue-600 bg-blue-50 text-blue-700';
  const isEdit = !!initialValues;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(toInputDate(new Date()));
  const [category, setCategory] = useState('');
  const [paidFrom, setPaidFrom] = useState('Cash');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset the form every time it opens (new entry or the expense being edited).
  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialValues?.title ?? '');
    setDescription(initialValues?.description ?? '');
    setAmount(initialValues?.amount ? String(initialValues.amount) : '');
    setDate(toInputDate(initialValues?.date ? new Date(initialValues.date) : new Date()));
    setCategory(initialValues?.category ?? '');
    setPaidFrom(initialValues?.paidFrom || 'Cash');
    setError('');
  }, [isOpen, initialValues]);

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
        addedBy: initialValues?.addedBy || currentUserName,
        category,
        paidFrom,
      });
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
        {/* Heading row: title on left, logged-in user on right */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">{isEdit ? 'Edit Expense' : 'Add Expense'}</h2>
          <span className="text-xs text-gray-500">
            Added by <span className="font-semibold text-gray-700">{initialValues?.addedBy || currentUserName || 'Unknown'}</span>
          </span>
        </div>

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

        <div className="mb-3 grid grid-cols-2 gap-3">
          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Amount (₹)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={e => {
                const val = e.target.value;
                // allow empty, or digits with at most one decimal point
                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                  setAmount(val);
                }
              }}
              className={`w-full border rounded-sm p-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={`w-full border rounded-sm p-2 text-sm bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
            />
          </div>
        </div>

        {/* Category */}
        <label className="block text-sm font-medium text-gray-600 mb-1">
          Category <span className="font-normal text-gray-400">(optional)</span>
        </label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className={`w-full border rounded-sm p-2 text-sm mb-3 bg-gray-50 focus:outline-none focus:ring-2 ${focusRing}`}
        >
          <option value="">Choose a category</option>
          {EXPENSE_CATEGORIES.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
          {category && !EXPENSE_CATEGORIES.includes(category) && <option value={category}>{category}</option>}
        </select>

        {/* Paid from */}
        <label className="block text-sm font-medium text-gray-600 mb-1">Paid from</label>
        <div className="mb-4 flex gap-2">
          {EXPENSE_PAID_FROM.map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setPaidFrom(mode)}
              className={`flex-1 rounded-sm border py-1.5 text-xs font-medium transition ${
                paidFrom === mode ? chipActive : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

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
