import { useState } from 'react';
import { todayDateInputValue } from '../../../lib/format';

interface CustomRangePanelProps {
  initialStart: string;
  initialEnd: string;
  onApply: (start: string, end: string) => void;
  onCancel: () => void;
}

export default function CustomRangePanel({
  initialStart,
  initialEnd,
  onApply,
  onCancel,
}: CustomRangePanelProps) {
  // iOS shows an empty date input as a blank box, so always open on real dates
  const [start, setStart] = useState(initialStart || todayDateInputValue());
  const [end, setEnd] = useState(initialEnd || todayDateInputValue());
  const isValid = !!start && !!end && start <= end;

  const inputClass =
    'mt-1 w-full rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900';

  return (
    <div className="rounded-sm border border-line bg-white p-4 shadow-float">
      <div className="grid grid-cols-2 gap-3">
        <label className="min-w-0 text-xs font-medium text-slate-600">
          From
          <input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} className={inputClass} />
        </label>
        <label className="min-w-0 text-xs font-medium text-slate-600">
          To
          <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-sm border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400"
        >
          Cancel
        </button>
        <button
          onClick={() => onApply(start, end)}
          disabled={!isValid}
          className="rounded-sm border border-slate-900 bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
