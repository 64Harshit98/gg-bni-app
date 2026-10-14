import { useEffect, useState } from 'react';
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAID_FROM,
} from '../Pages/Reports/ExpenseReport/expenseRangeCache';

export interface ExpenseFormData {
  title: string;
  description: string;
  amount: number;
  date: number;
  addedBy: string;
  category: string;
  paidFrom: string;
  repeatMonthly?: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: ExpenseFormData) => Promise<void>;
  theme?: 'blue' | 'orange';
  currentUserName: string;
  /** Pre-fills the form for editing an existing expense. */
  initialValues?: Partial<ExpenseFormData>;
  /** Optional: pass the list from useExpenses() to show the "this month" note */
  expenses?: { amount: number; date: number }[];
}

/* SELLAR design system: Add / edit expense pop-up */
const THEMES = {
  blue: {
    button: 'bg-[#155dfc] hover:bg-[#1447e6] focus-visible:outline-[#155dfc]',
    focus: 'focus-within:outline-[#155dfc]',
    on: 'bg-[#155dfc]',
    note: 'bg-[#e6eeff] text-[#155dfc]',
  },
  orange: {
    button: 'bg-[#c2410c] hover:bg-[#9a3412] focus-visible:outline-[#c2410c]',
    focus: 'focus-within:outline-[#c2410c]',
    on: 'bg-[#c2410c]',
    note: 'bg-[#ffedd5] text-[#c2410c]',
  },
} as const;

/**
 * Optional title suggestions per category label (matched by name, so it keeps
 * working with whatever EXPENSE_CATEGORIES contains). Unknown categories
 * simply don't auto-fill a title.
 */
const CATEGORY_TITLES: Record<string, { title: string; monthly: boolean }> = {
  Rent: { title: 'Shop rent', monthly: true },
  'Staff salary': { title: 'Staff salary', monthly: true },
  Electricity: { title: 'Electricity bill', monthly: true },
  'Tea & snacks': { title: 'Tea & snacks', monthly: false },
  Transport: { title: 'Transport', monthly: false },
  Repairs: { title: 'Repairs', monthly: false },
};

const label = 'mb-1.5 block text-xs font-medium text-[#45556c]';
const field =
  'flex items-center gap-2 rounded-sm border border-[#7a8aa3] bg-white px-3 text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1';
const input =
  'min-w-0 flex-1 border-0 bg-transparent text-sm text-[#0f172b] outline-none placeholder:text-[#5b6b86]';
const ico = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

// Local yyyy-mm-dd (toISOString() is UTC and shows yesterday before 5:30 AM IST).
const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const ExpenseModal = ({
  isOpen,
  onClose,
  onSave,
  theme = 'blue',
  currentUserName,
  initialValues,
  expenses,
}: Props) => {
  const t = THEMES[theme === 'orange' ? 'orange' : 'blue'];
  const isEdit = !!initialValues;
  const addedBy = initialValues?.addedBy || currentUserName || 'Unknown';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(toInputDate(new Date()));
  const [category, setCategory] = useState('');
  const [autoTitle, setAutoTitle] = useState('');
  const [paidFrom, setPaidFrom] = useState('Cash');
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset the form every time it opens (new entry, or the expense being edited).
  // Deliberately keyed on isOpen only, so a parent re-render that passes a new
  // initialValues object can't wipe what the person is typing.
  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialValues?.title ?? '');
    setDescription(initialValues?.description ?? '');
    setAmount(initialValues?.amount ? String(initialValues.amount) : '');
    setDate(toInputDate(initialValues?.date ? new Date(initialValues.date) : new Date()));
    setCategory(initialValues?.category ?? '');
    setAutoTitle('');
    setPaidFrom(initialValues?.paidFrom || 'Cash');
    setRepeatMonthly(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const [y, m] = date.split('-').map(Number);
  const monthName = new Date(y || 2000, (m || 1) - 1, 1).toLocaleString('en-IN', { month: 'long' });

  const pickCategory = (c: string) => {
    if (category === c) return setCategory('');
    setCategory(c);
    // only overwrite the title if the person hasn't typed their own
    const preset = CATEGORY_TITLES[c];
    if (preset && (!title.trim() || title === autoTitle)) {
      const next = preset.monthly ? `${preset.title} — ${monthName}` : preset.title;
      setTitle(next);
      setAutoTitle(next);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setAmount('');
    setDate(toInputDate(new Date()));
    setCategory('');
    setAutoTitle('');
    setPaidFrom('Cash');
    setRepeatMonthly(false);
  };

  const submit = async (keepOpen: boolean) => {
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
        addedBy,
        category,
        paidFrom,
        ...(isEdit ? {} : { repeatMonthly }),
      });
      if (keepOpen && !isEdit) resetForm();
      else onClose();
    } catch {
      setError('Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  // "This month" note (needs the optional `expenses` prop; skipped while editing)
  const amt = Number(amount) > 0 ? Number(amount) : 0;
  const monthList = (expenses ?? []).filter(e => {
    const d = new Date(e.date);
    return d.getFullYear() === y && d.getMonth() === m - 1;
  });
  const monthTotal = monthList.reduce((s, e) => s + e.amount, 0);
  const entries = `${monthList.length} ${monthList.length === 1 ? 'entry' : 'entries'}`;
  const isCash = paidFrom.toLowerCase() === 'cash';

  // Keep a custom/legacy category visible when editing
  const categoryOptions =
    category && !EXPENSE_CATEGORIES.includes(category)
      ? [...EXPENSE_CATEGORIES, category]
      : EXPENSE_CATEGORIES;

  const heading = isEdit ? 'Edit expense' : 'Add expense';

  return (
    <div className="fixed inset-0 z-[8000] flex items-end justify-center bg-[rgba(2,6,24,0.5)] sm:items-center sm:px-4">
      <div
        role="dialog"
        aria-label={heading}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-sm bg-white shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] sm:max-w-[540px]"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-sm bg-[#7a8aa3]/40 sm:hidden" />

        {/* Header */}
        <div className="flex items-start gap-3 px-5 pb-2 pt-4 sm:px-6 sm:pt-5">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-sm bg-[#ffeef0] text-[#d5000c]">
            <svg {...ico} width={18} height={18}>
              <path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" />
              <circle cx="16.5" cy="13.5" r="1.2" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold leading-6 text-[#0f172b] sm:text-xl sm:leading-7">{heading}</h2>
            <p className="truncate text-xs text-[#5b6b86]">
              Added by <b className="font-semibold text-[#0f172b]">{addedBy}</b>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid h-10 w-10 flex-none place-items-center rounded-sm text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b]"
          >
            <svg {...ico} width={18} height={18}><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-2 sm:px-6">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {/* Amount */}
            <div className="sm:col-span-2">
              <label className={label}>Amount <em className="not-italic text-[#d5000c]">*</em></label>
              <div className={`${field} h-14 ${t.focus}`}>
                <span className="text-[22px] text-[#5b6b86]">₹</span>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={amount}
                  onChange={e => {
                    const val = e.target.value;
                    // allow empty, or digits with at most one decimal point
                    if (val === '' || /^\d*\.?\d*$/.test(val)) setAmount(val);
                  }}
                  className={`${input} text-2xl font-semibold`}
                />
              </div>
            </div>

            {/* Category */}
            <div className="sm:col-span-2">
              <span className={label}>Category <span className="font-normal text-[#5b6b86]">(optional)</span></span>
              <div className="flex flex-wrap gap-1.5">
                {categoryOptions.map(c => {
                  const on = category === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => pickCategory(c)}
                      className={`h-[30px] rounded-sm border px-3 text-xs font-medium transition-colors ${
                        on
                          ? 'border-[#0f172b] bg-[#0f172b] text-white'
                          : 'border-[#7a8aa3] bg-white text-[#0f172b] hover:bg-[#f5f7ff]'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div className="sm:col-span-2">
              <label className={label}>Title <em className="not-italic text-[#d5000c]">*</em></label>
              <div className={`${field} h-10 ${t.focus}`}>
                <input
                  type="text"
                  placeholder="e.g. Shop Rent, Staff Salary"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className={`${input} font-medium`}
                />
              </div>
              {title && title === autoTitle && (
                <p className="mt-1 text-[11px] text-[#5b6b86]">Filled from the category — edit if you like</p>
              )}
            </div>

            {/* Paid from */}
            <div>
              <span className={label}>Paid from</span>
              <div role="group" aria-label="Paid from" className="flex h-10 gap-1 rounded-sm border border-[#dfe6fb] bg-[#f5f7ff] p-1">
                {EXPENSE_PAID_FROM.map(mode => {
                  const on = paidFrom === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setPaidFrom(mode)}
                      className={`flex-1 rounded-sm text-[13px] font-medium transition-colors ${
                        on ? 'bg-[#0f172b] text-white' : 'text-[#45556c] hover:text-[#0f172b]'
                      }`}
                    >
                      {mode}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date */}
            <div>
              <label className={label}>Date</label>
              <div className={`${field} h-10 ${t.focus}`}>
                <svg {...ico}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className={`${input} [color-scheme:light]`}
                />
              </div>
            </div>

            {/* Description */}
            <div className="sm:col-span-2">
              <label className={label}>Description <em className="not-italic text-[#d5000c]">*</em></label>
              <div className={`${field} h-10 ${t.focus}`}>
                <input
                  type="text"
                  placeholder="e.g. Payment for ...."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={input}
                />
              </div>
            </div>

            {/* Repeat every month (new entries only) */}
            {!isEdit && (
              <div className="flex items-center gap-2.5 rounded-sm border border-[#dfe6fb] px-3 py-2.5 text-[13px] text-[#0f172b] sm:col-span-2">
                <svg {...ico} className="flex-none text-[#45556c]">
                  <path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3" />
                </svg>
                <span className="flex-1">Repeat every month</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={repeatMonthly}
                  aria-label="Repeat every month"
                  onClick={() => setRepeatMonthly(v => !v)}
                  className={`relative h-5 w-9 flex-none rounded-full transition-colors ${repeatMonthly ? t.on : 'bg-[#7a8aa3]'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${repeatMonthly ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
              </div>
            )}

            {/* This month note (new entries only) */}
            {expenses && !isEdit && (
              <div className={`flex items-start gap-2 rounded-sm px-3 py-2.5 text-[13px] leading-[19px] sm:col-span-2 ${t.note}`}>
                <svg {...ico} className="mt-[2px] flex-none">
                  <path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" />
                  <circle cx="16.5" cy="13.5" r="1.2" />
                </svg>
                <span>
                  {monthName} expenses so far: <b>{inr(monthTotal)}</b> in {entries}
                  {amt > 0 && <> · this takes it to <b>{inr(monthTotal + amt)}</b>.</>}
                  {amt > 0 && (isCash
                    ? <> Cash drawer goes down by {inr(amt)}.</>
                    : <> Cash drawer is not affected.</>)}
                </span>
              </div>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-sm bg-[#ffeef0] px-3 py-2.5 text-[13px] leading-[19px] text-[#d5000c] sm:col-span-2">
                <svg {...ico} className="mt-[1.5px] flex-none"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                <span>{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#dfe6fb] bg-[#f5f7ff] px-5 py-3.5 sm:px-6">
          <button
            onClick={onClose}
            className="mr-auto h-10 rounded-sm px-3 text-sm font-medium text-[#45556c] transition-colors hover:bg-white hover:text-[#0f172b]"
          >
            Cancel
          </button>
          {!isEdit && (
            <button
              onClick={() => submit(true)}
              disabled={saving}
              className="h-10 rounded-sm border border-[#7a8aa3] bg-white px-4 text-sm font-medium text-[#0f172b] transition-colors hover:bg-[#f5f7ff] disabled:cursor-not-allowed disabled:opacity-[.45]"
            >
              Save & add another
            </button>
          )}
          <button
            onClick={() => submit(false)}
            disabled={saving}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded-sm px-5 text-sm font-medium text-white transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-[.45] ${t.button}`}
          >
            {!saving && <svg {...ico}><path d="M5 12.5l4.5 4.5L19 7" /></svg>}
            {saving ? 'Saving…' : isEdit ? 'Update expense' : 'Save expense'}
          </button>
        </div>
      </div>
    </div>
  );
};