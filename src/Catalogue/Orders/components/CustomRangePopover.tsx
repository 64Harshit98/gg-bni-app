import React from 'react';

const todayStr = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split('T')[0];
};

interface Props {
    start: string; // 'YYYY-MM-DD' or ''
    end: string;
    onChange: (range: { start: string; end: string }) => void;
    onApply: () => void;
    onCancel: () => void;
}

const inputCls =
    'h-10 w-full min-w-0 rounded-sm border border-[#f6e1d0] bg-white px-2 text-xs text-slate-800 outline-none focus:border-[#ea580c] focus:ring-2 focus:ring-[#ea580c]/20 transition';

const CustomRangePopover: React.FC<Props> = ({ start, end, onChange, onApply, onCancel }) => {
    const invalid = !!start && !!end && start > end;
    const canApply = !!start && !!end && !invalid;

    return (
        <div className="mt-1 pt-3 border-t border-[#f6e1d0] px-1 pb-1">
            <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                    From
                    <input
                        type="date"
                        value={start}
                        max={end || todayStr()}
                        onChange={(e) => onChange({ start: e.target.value, end })}
                        className={inputCls}
                    />
                </label>
                <label className="grid gap-1 text-xs font-medium text-slate-600">
                    To
                    <input
                        type="date"
                        value={end}
                        min={start || undefined}
                        max={todayStr()}
                        onChange={(e) => onChange({ start, end: e.target.value })}
                        className={inputCls}
                    />
                </label>
            </div>

            {invalid && (
                <p className="mt-2 text-[11px] text-red-600">"From" date must be before "To" date.</p>
            )}

            <div className="mt-3 flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="h-9 px-3 rounded-sm border border-[#f6e1d0] bg-white text-xs font-medium text-slate-600 hover:bg-[#fff8f2] transition"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={onApply}
                    disabled={!canApply}
                    className="h-9 px-4 rounded-sm bg-[#c2410c] hover:bg-[#9a3412] text-white text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Apply
                </button>
            </div>
        </div>
    );
};

export default CustomRangePopover;