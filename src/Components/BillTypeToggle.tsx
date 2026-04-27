import React from 'react';
import type { BillType } from '../Catalogue/hooks/usePdfAction';

interface BillTypeToggleProps {
  value: BillType;
  onChange: (v: BillType) => void;
  className?: string;
}

/**
 * Estimate / Bill toggle used inside the action-selection modal
 * in both Journal and OrdersPage.
 *
 * Usage:
 * ```tsx
 * <BillTypeToggle value={pdf.billType} onChange={pdf.setBillType} />
 * ```
 */
export const BillTypeToggle: React.FC<BillTypeToggleProps> = ({
  value,
  onChange,
  className = '',
}) => {
  const types: BillType[] = ['estimate', 'bill'];

  return (
    <div className={`flex bg-slate-100 rounded-sm p-1 ${className}`}>
      {types.map((type) => (
        <button
          key={type}
          onClick={() => onChange(type)}
          className={`flex-1 py-2 text-xs font-bold uppercase rounded-sm transition-all ${
            value === type
              ? 'bg-white text-[#F97316] shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {type}
        </button>
      ))}
    </div>
  );
};
