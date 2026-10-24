import React, { useState } from 'react';
import { FiChevronUp, FiChevronRight } from 'react-icons/fi';

const formatINR = (value: number) =>
  value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─────────────────────────────────────────────────────────────────────────────
// SELLAR design-system class tokens (CSS variables with light-theme fallbacks)
// ─────────────────────────────────────────────────────────────────────────────
const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-sm border border-transparent font-medium whitespace-nowrap transition-colors cursor-pointer bg-[#155dfc] text-white hover:bg-[#1447e6] disabled:opacity-[.45] disabled:cursor-not-allowed';

interface BillRowProps {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'primary';
  strong?: boolean;
  divider?: boolean;
}

const BillRow: React.FC<BillRowProps> = ({ label, value, tone = 'default', strong = false, divider = false }) => {
  const labelColor =
    tone === 'success' ? 'text-[#008236]'
      : tone === 'primary' ? 'text-[#155dfc]'
        : strong ? 'text-[#0f172b]' : 'text-[#45556c]';
  const valueColor =
    tone === 'success' ? 'text-[#008236]'
      : tone === 'primary' ? 'text-[#155dfc]'
        : 'text-[#0f172b]';
  return (
    <div className={`flex justify-between gap-4 ${divider ? 'border-t border-[#dfe6fb] pt-1.5' : ''}`}>
      <span className={`${labelColor} ${strong ? 'font-medium' : ''}`}>{label}</span>
      <span className={`${valueColor} tabular-nums ${strong ? 'font-semibold' : 'font-medium'}`}>{value}</span>
    </div>
  );
};

interface GenericBillFooterProps {
  isExpanded: boolean;          // kept for compatibility — the mobile breakdown now manages its own state
  onToggleExpand: () => void;   // kept for compatibility
  totalQuantity: number;
  subtotal: number;
  totalDiscount?: number;
  taxAmount?: number;
  taxLabel?: string;
  roundingOffAmount?: number;
  finalAmount: number;
  showTaxRow?: boolean;
  actionLabel: string;
  onActionClick: () => void;
  disableAction?: boolean;
  children?: React.ReactNode;

  // ── Optional wording / rows (defaults keep Sale exactly as before) ──
  subtotalLabel?: string;                          // default 'MRP subtotal'
  netLabel?: string;                               // default 'Net sale price'
  showNetRow?: boolean;                            // default true (Purchase passes false)
  extraRows?: { label: string; value: string }[];  // shown above the subtotal row (e.g. Purchase "MRP value")
}

export const GenericBillFooter: React.FC<GenericBillFooterProps> = ({
  totalQuantity,
  subtotal,
  totalDiscount = 0,
  taxAmount = 0,
  taxLabel = 'Tax',
  roundingOffAmount = 0,
  finalAmount,
  showTaxRow = false,
  actionLabel,
  onActionClick,
  disableAction = false,
  children,
  subtotalLabel = 'MRP subtotal',
  netLabel = 'Net sale price',
  showNetRow = true,
  extraRows = [],
}) => {
  // Mobile: tap the total to see the breakdown
  const [showBreakdown, setShowBreakdown] = useState(false);

  const rows = (
    <div className="space-y-1.5 text-sm">
      {extraRows.map((r) => (
        <BillRow key={r.label} label={r.label} value={r.value} />
      ))}

      <BillRow label={subtotalLabel} value={`₹${formatINR(subtotal)}`} />

      {totalDiscount > 0 && (
        <BillRow label="Discount" value={`− ₹${formatINR(totalDiscount)}`} tone="success" />
      )}

      {showNetRow && (
        <BillRow label={netLabel} value={`₹${formatINR(subtotal - totalDiscount)}`} strong divider />
      )}

      {showTaxRow && (
        <BillRow label={taxLabel} value={`+ ₹${formatINR(taxAmount)}`} tone="primary" />
      )}

      {Number(roundingOffAmount) !== 0 && (
        <BillRow
          label="Rounding off"
          value={`${Number(roundingOffAmount) > 0 ? '+' : '−'} ₹${formatINR(Math.abs(Number(roundingOffAmount)))}`}
        />
      )}
    </div>
  );

  return (
    <div className="flex-shrink-0 z-20 bg-[#ffffff] border-t border-[#dfe6fb] md:border-t-0 md:bg-transparent md:w-full md:flex md:flex-col md:flex-1 md:min-h-0">

      {children && <div className="md:mb-4">{children}</div>}

      {/* ── DESKTOP: breakdown + bill total (directly under the heading) ── */}
      <div className="hidden md:block">
        {rows}
        <div className="flex justify-between items-baseline mt-4 pt-4 border-t border-[#dfe6fb]">
          <span className="text-sm text-[#45556c]">Bill total</span>
          <b className="text-[30px] leading-[38px] font-semibold tracking-tight tabular-nums text-[#0f172b]">
            ₹{formatINR(finalAmount)}
          </b>
        </div>
      </div>

      {/* ── DESKTOP: action pinned to the bottom ── */}
      <div className="hidden md:block mt-auto pt-6">
        <p className="m-0 mb-2.5 text-center text-xs text-[#5b6b86]">You choose how it's paid in the next step</p>
        <button
          type="button"
          onClick={onActionClick}
          disabled={disableAction}
          className={`${BTN_PRIMARY} w-full h-14 text-base`}
        >
          {actionLabel} · ₹{formatINR(finalAmount)}
        </button>
      </div>

      {/* ── MOBILE: breakdown (opens when the total is tapped) ── */}
      {showBreakdown && <div className="md:hidden px-4 pt-3">{rows}</div>}

      {/* ── MOBILE: sticky checkout bar ── */}
      <div className="flex md:hidden items-center gap-3 px-4 pt-3 pb-4">
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          aria-expanded={showBreakdown}
          className="flex-1 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer"
        >
          <span className="flex items-center gap-1 text-xs text-[#45556c]">
            <span className="truncate">
              {totalQuantity} {totalQuantity === 1 ? 'item' : 'items'}
              {totalDiscount > 0 && ` · saves ₹${formatINR(totalDiscount)}`}
            </span>
            <FiChevronUp
              size={14}
              className={`flex-shrink-0 transition-transform ${showBreakdown ? 'rotate-180' : ''}`}
            />
          </span>
          <b className="block text-xl leading-[26px] font-semibold tabular-nums text-[#0f172b] truncate">
            ₹{formatINR(finalAmount)}
          </b>
        </button>

        <button
          type="button"
          onClick={onActionClick}
          disabled={disableAction}
          className={`${BTN_PRIMARY} h-12 px-4 text-[15px]`}
        >
          {actionLabel}
          <FiChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};