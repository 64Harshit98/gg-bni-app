import React, { useEffect, useRef } from 'react';
import { isAltShortcut, SHORTCUTS } from '../lib/shortcuts';
import {
  BILL_SERIES_LABEL,
  nextBillSeriesMode,
  useCanViewKBills,
  type BillSeriesMode,
} from '../lib/billSeries';

// One look for the K button everywhere: the same 40×40 square as the other
// header icon buttons (salesman, filters…), letter-only.
//   off        → white, dark "K"
//   K only     → filled amber, white "K"
//   regular+K  → light amber with amber border, "K+"
const BASE =
  'inline-flex items-center justify-center w-10 h-10 flex-shrink-0 rounded-sm border text-[15px] font-semibold leading-none select-none transition-all focus-visible:outline-none focus-visible:ring-4';
const OFF =
  'bg-white border-[#7a8aa3] text-[#0f172b] hover:bg-[#f5f7ff] focus-visible:border-[#155dfc] focus-visible:ring-[#e6eeff]';
const ON =
  'bg-[#b45309] border-[#b45309] text-white hover:bg-[#92400e] focus-visible:ring-[#fde68a]';
const BOTH =
  'bg-[#fffbeb] border-[#b45309] text-[#92400e] hover:bg-[#fef3c7] focus-visible:ring-[#fde68a]';

interface KBillToggleProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  title?: string;
  shortcut?: string;
}

/** Two-state K button used while billing: regular series ⇄ K series. */
export const KBillToggle: React.FC<KBillToggleProps> = ({ checked, onToggle, disabled, title, shortcut }) => (
  <button
    type="button"
    aria-pressed={checked}
    aria-label="K bill series"
    aria-keyshortcuts={shortcut}
    title={title}
    disabled={disabled}
    onClick={onToggle}
    className={`${BASE} ${checked ? ON : OFF} ${disabled ? 'opacity-[.45] cursor-not-allowed' : 'cursor-pointer'}`}
  >
    K
  </button>
);

interface KSeriesButtonProps {
  mode: BillSeriesMode;
  onChange: (mode: BillSeriesMode) => void;
  className?: string;
}

// Alt+K drives whichever K button was mounted last, so a page that briefly
// renders two (e.g. a list and a detail panel) never cycles twice per press.
const kShortcutStack: { current: () => void }[] = [];
const onKShortcut = (e: KeyboardEvent) => {
  if (!isAltShortcut(e, SHORTCUTS.kBill.code)) return;
  const top = kShortcutStack[kShortcutStack.length - 1];
  if (!top) return;
  e.preventDefault();
  top.current();
};

/**
 * Three-state K button for the dashboard and reports. Each click (or Alt+K)
 * moves on: regular bills (default) → K bills only → regular + K → regular.
 * Renders nothing for users who aren't allowed to see K bills.
 */
export const KSeriesButton: React.FC<KSeriesButtonProps> = ({ mode, onChange, className = '' }) => {
  const canViewKBills = useCanViewKBills();
  const next = nextBillSeriesMode(mode);

  const cycleRef = useRef(() => onChange(next));
  cycleRef.current = () => onChange(next);
  useEffect(() => {
    if (!canViewKBills) return;
    const entry = { current: () => cycleRef.current() };
    kShortcutStack.push(entry);
    if (kShortcutStack.length === 1) window.addEventListener('keydown', onKShortcut);
    return () => {
      const i = kShortcutStack.indexOf(entry);
      if (i >= 0) kShortcutStack.splice(i, 1);
      if (kShortcutStack.length === 0) window.removeEventListener('keydown', onKShortcut);
    };
  }, [canViewKBills]);

  if (!canViewKBills) return null;
  return (
    <button
      type="button"
      aria-label={`Bill series: ${BILL_SERIES_LABEL[mode]}. Click for ${BILL_SERIES_LABEL[next]}.`}
      aria-keyshortcuts={SHORTCUTS.kBill.label}
      title={`Showing ${BILL_SERIES_LABEL[mode].toLowerCase()} · click for ${BILL_SERIES_LABEL[next].toLowerCase()} (${SHORTCUTS.kBill.label})`}
      onClick={() => onChange(next)}
      className={`${BASE} ${mode === 'exempt' ? ON : mode === 'all' ? BOTH : OFF} cursor-pointer ${className}`}
    >
      {mode === 'all' ? 'K+' : 'K'}
    </button>
  );
};

export default KSeriesButton;
