import React from 'react';

/** Shared input className — import this wherever plain inputs are rendered. */
export const inputClass =
  'w-full border border-slate-200 rounded-sm text-sm bg-slate-50 outline-none ' +
  'transition-all px-[12px] py-[8px] text-slate-800 ' +
  'focus:border-slate-400 focus:bg-white';

interface LabeledFieldProps {
  label: string;
  children: React.ReactNode;
}

/** Simple label + field wrapper with no floating-label colour highlight. */
const LabeledField: React.FC<LabeledFieldProps> = ({ label, children }) => (
  <div className="flex flex-col gap-0.5">
    <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
      {label}
    </label>
    {children}
  </div>
);

export default LabeledField;