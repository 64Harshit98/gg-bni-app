import { useEffect, useRef, useState } from 'react';
import { FiX } from 'react-icons/fi';
import type { QuickItemDetails } from '../lib/quickAddItems';

// Add (or fix) an item that isn't in the catalogue yet, straight from the bill.
// Used where the cart has no editable rows (card view, the bill sheet / side panel).
// Phone: bottom sheet. Desktop: small centred dialog. The item itself is only
// created in the catalogue when the bill is saved.

interface QuickItemSheetProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initial: Partial<QuickItemDetails>;
  /** "Selling price" (Sales) / "Purchase rate" (Purchase) */
  priceLabel: string;
  /** "Purchase price" (Sales) / "Sale price" (Purchase) */
  extraLabel: string;
  /** True when an item with this name already exists in the catalogue. */
  isNameTaken?: (name: string) => boolean;
  onSubmit: (details: QuickItemDetails) => void;
  onClose: () => void;
}

const numOrEmpty = (v: unknown) => (Number(v) > 0 ? String(v) : '');
const DECIMAL = /^\d*\.?\d*$/;

const FIELD = 'w-full h-11 px-3 text-[15px] text-[#0f172b] bg-white border border-[#7a8aa3] rounded-sm outline-none focus:border-[#155dfc] focus:ring-4 focus:ring-[#e6eeff] placeholder:text-[#5b6b86]';
const LABEL = 'block mb-1 text-xs font-medium text-[#45556c]';

export const QuickItemSheet = ({
  isOpen,
  mode,
  initial,
  priceLabel,
  extraLabel,
  isNameTaken,
  onSubmit,
  onClose,
}: QuickItemSheetProps) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [mrp, setMrp] = useState('');
  const [tax, setTax] = useState('');
  const [extra, setExtra] = useState('');
  const [qty, setQty] = useState(1);
  const priceRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName(initial.name ?? '');
    setPrice(numOrEmpty(initial.price));
    setMrp(numOrEmpty(initial.mrp));
    setTax(initial.tax !== undefined ? String(Number(initial.tax) || 0) : '0');
    setExtra(numOrEmpty(initial.extraPrice));
    setQty(Math.max(1, Number(initial.quantity) || 1));
    const t = setTimeout(() => priceRef.current?.focus(), 80);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const trimmedName = name.trim();
  const priceNum = parseFloat(price) || 0;
  const mrpNum = parseFloat(mrp) || 0;
  const nameTaken = mode === 'create' && !!trimmedName && !!isNameTaken?.(trimmedName);
  const priceAboveMrp = mrpNum > 0 && priceNum - mrpNum > 0.01;
  const canSubmit = !!trimmedName && priceNum > 0 && !nameTaken;

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      name: trimmedName,
      price: priceNum,
      mrp: mrpNum,
      tax: parseFloat(tax) || 0,
      extraPrice: parseFloat(extra) || 0,
      quantity: Math.max(1, qty),
    });
  };

  // Enter / keyboard "Next" moves to the next field; on the last one it submits
  const nextOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const fields = Array.from(formRef.current?.querySelectorAll<HTMLInputElement>('input[data-step]') ?? []);
    const idx = fields.indexOf(e.currentTarget);
    if (idx >= 0 && idx < fields.length - 1) fields[idx + 1].focus();
    else submit();
  };

  const decimalInput = (value: string, set: (v: string) => void) => ({
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => { if (DECIMAL.test(e.target.value)) set(e.target.value); },
    onKeyDown: nextOnEnter,
    inputMode: 'decimal' as const,
    autoComplete: 'off',
    placeholder: '0',
    className: `${FIELD} text-right tabular-nums`,
  });

  return (
    <div
      className="fixed inset-0 z-[2100] flex items-end md:items-center justify-center bg-[#020618]/45"
      onClick={onClose}
    >
      <form
        ref={formRef}
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md max-h-[92dvh] flex flex-col bg-white rounded-t-sm md:rounded-sm [box-shadow:0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]"
      >
        <div className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
          <div className="min-w-0">
            <h2 className="m-0 text-base font-semibold text-[#0f172b]">{mode === 'create' ? 'New item' : 'New item details'}</h2>
            <p className="m-0 text-xs text-[#45556c]">Saved to your items when this bill is saved</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="inline-flex items-center justify-center w-9 h-9 rounded-sm text-[#45556c] hover:bg-[#f5f7ff] flex-shrink-0">
            <FiX size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 flex flex-col gap-3">
          <div>
            <label className={LABEL}>Item name</label>
            <input
              data-step
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={nextOnEnter}
              enterKeyHint="next"
              autoComplete="off"
              placeholder="Item name"
              className={FIELD}
            />
            {nameTaken && (
              <p className="m-0 mt-1 text-xs text-[#d5000c]">Already in your items. Close this and pick it from search.</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>{priceLabel} *</label>
              <input data-step ref={priceRef} enterKeyHint="next" {...decimalInput(price, setPrice)} />
            </div>
            <div>
              <label className={LABEL}>MRP</label>
              <input data-step enterKeyHint="next" {...decimalInput(mrp, setMrp)} />
            </div>
            <div>
              <label className={LABEL}>GST %</label>
              <input data-step enterKeyHint="next" {...decimalInput(tax, setTax)} />
            </div>
            <div>
              <label className={LABEL}>{extraLabel}</label>
              <input data-step enterKeyHint="done" {...decimalInput(extra, setExtra)} />
            </div>
          </div>
          {priceAboveMrp && (
            <p className="m-0 -mt-1 text-xs text-[#bb4d00]">{priceLabel} is more than MRP.</p>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className={LABEL + ' !mb-0'}>Quantity</span>
            <div className="inline-flex items-center border border-[#7a8aa3] rounded-sm h-11">
              <button type="button" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Less"
                className="w-11 h-full text-lg text-[#45556c] hover:bg-[#f5f7ff] disabled:text-[#c3cbe0]" disabled={qty <= 1}>−</button>
              <input
                value={String(qty)}
                onChange={(e) => { const n = parseInt(e.target.value, 10); setQty(Number.isFinite(n) ? Math.max(1, n) : 1); }}
                inputMode="numeric"
                aria-label="Quantity"
                className="w-14 h-full text-center text-[15px] font-semibold tabular-nums outline-none border-x border-[#7a8aa3]"
              />
              <button type="button" onClick={() => setQty(q => q + 1)} aria-label="More"
                className="w-11 h-full text-lg text-[#45556c] hover:bg-[#f5f7ff]">+</button>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-[#dfe6fb]">
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-12 rounded-sm bg-[#155dfc] text-white text-[15px] font-medium hover:bg-[#1447e6] transition-colors disabled:opacity-[.45] disabled:cursor-not-allowed"
          >
            {mode === 'create' ? 'Add to bill' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default QuickItemSheet;
