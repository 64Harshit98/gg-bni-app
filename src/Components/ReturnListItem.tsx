import React, { useState, useEffect } from 'react';

const FloatingInput = ({
  value,
  onChange,
  onBlur,
  locked,
  className,
  ...props
}: {
  value: string;
  onChange: (val: string) => void;
  onBlur: () => void;
  locked: boolean;
  className?: string;
  [key: string]: any;
}) => {
  const [localValue, setLocalValue] = useState<string>(value || '');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const incomingValue = value === null || value === undefined ? '' : String(value);
    if (!isFocused && incomingValue !== localValue) {
      setLocalValue(incomingValue);
    }
  }, [value, isFocused, localValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d*\.?\d*$/.test(val)) {
      setLocalValue(val);
      onChange(val);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onFocus={() => {
        if (!locked) {
          setIsFocused(true);
          setLocalValue('');
        }
      }}
      onBlur={() => {
        setIsFocused(false);
        setLocalValue(value || '');
        onBlur();
      }}
      readOnly={locked}
      autoComplete="off"
      className={`focus:outline-none bg-transparent ${locked ? 'text-[#5b6b86]' : 'text-[#0f172b]'} ${className || ''}`}
      {...props}
    />
  );
};

export interface ReturnItemData {
  id: string;
  name: string;
  mrp?: number;
  quantity: number;
  unitPrice: number;
  unitMultiplier?: number;
  unit?: string;
  [key: string]: any;
}

type ReturnTheme = 'blue' | 'orange';

/**
 * Class strings are written out in full (not interpolated) so Tailwind can see them.
 * 'blue'   = default, used by the other return pages (unchanged look)
 * 'orange' = Catalogue order return (catreturn design)
 */
const THEMES: Record<ReturnTheme, {
  rowBorder: string;
  cardOn: string;
  cardOff: string;
  boxOn: string;
  focus: string;
  unitText: string;
  unitBg: string;
  stepHover: string;
}> = {
  blue: {
    rowBorder: 'xl:border-[#dfe6fb]',
    cardOn: 'border-[#155dfc] bg-[#e6eeff] xl:border-[#dfe6fb]',
    cardOff: 'border-[#dfe6fb] bg-white',
    boxOn: 'border-[#155dfc] bg-[#155dfc] text-white',
    focus: 'peer-focus-visible:outline-[#155dfc]',
    unitText: 'text-[#155dfc]',
    unitBg: 'bg-[#e6eeff]',
    stepHover: 'hover:bg-[#f5f7ff]',
  },
  orange: {
    rowBorder: 'xl:border-[#f6e1d0]',
    cardOn: 'border-[#c2410c] bg-[#ffedd5] xl:border-[#f6e1d0]',
    cardOff: 'border-[#f6e1d0] bg-white',
    boxOn: 'border-[#c2410c] bg-[#c2410c] text-white',
    focus: 'peer-focus-visible:outline-[#ea580c]',
    unitText: 'text-[#9a3412]',
    unitBg: 'bg-[#ffedd5]',
    stepHover: 'hover:bg-[#fff8f2]',
  },
};

interface ReturnListItemProps {
  item: ReturnItemData;
  isSelected: boolean;
  onToggle: (id: string) => void;
  onQuantityChange: (id: string, newQty: number) => void;
  showMrp?: boolean; // Toggle displaying the crossed-out MRP
  /** 'blue' (default: POS / other return pages) or 'orange' (Catalogue order return) */
  theme?: ReturnTheme;
  /** Shows "Bought N" + "max N" (reads item.originalQuantity). Pair with RETURN_ITEM_GRID_BOUGHT */
  showBought?: boolean;
}

/**
 * Column template shared by the desktop table header (in the pages)
 * and each row below, so the columns always line up.
 * checkbox | item | return qty | price | subtotal
 */
export const RETURN_ITEM_GRID = 'xl:grid-cols-[28px_minmax(0,1fr)_116px_96px_104px]';

/** Same as above + a "Bought" column: checkbox | item | bought | return qty | price | subtotal */
export const RETURN_ITEM_GRID_BOUGHT = 'xl:grid-cols-[28px_minmax(0,1fr)_64px_116px_96px_104px]';

export const ReturnListItem: React.FC<ReturnListItemProps> = ({
  item,
  isSelected,
  onToggle,
  onQuantityChange,
  showMrp = true,
  theme = 'blue',
  showBought = false,
}) => {
  const valueTone = isSelected ? 'text-[#0f172b]' : 'text-[#5b6b86]';
  const t = THEMES[theme];
  const grid = showBought ? RETURN_ITEM_GRID_BOUGHT : RETURN_ITEM_GRID;
  const hasBought = showBought && item.originalQuantity !== undefined;
  const hasMrp = showMrp && item.mrp !== undefined;

  return (
    <div
      className={`flex flex-col gap-3 rounded-sm border p-3 transition-colors
        xl:grid ${grid} xl:items-center xl:gap-x-3 xl:rounded-none xl:border-0 xl:border-b ${t.rowBorder} xl:px-4 xl:py-3 xl:last:border-b-0
        ${isSelected ? t.cardOn : t.cardOff}`}
    >
      {/* Checkbox + name (becomes two grid cells on desktop) */}
      <div className="flex items-start gap-2.5 xl:contents">
        <label className="inline-flex flex-none cursor-pointer xl:self-center">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(item.id)}
            className="peer sr-only"
          />
          <span
            className={`inline-grid h-5 w-5 place-items-center rounded-sm border-[1.5px] transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${t.focus}
              ${isSelected ? t.boxOn : 'border-[#7a8aa3] bg-white text-transparent'}`}
          >
            {isSelected && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            )}
          </span>
        </label>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5">
            <p className={`text-sm font-semibold leading-snug ${valueTone}`}>{item.name}</p>
            {item.unit && (
              <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${t.unitText} ${isSelected ? 'bg-white' : t.unitBg}`}>
                {item.unit}
              </span>
            )}
          </div>
          {(hasMrp || hasBought) && (
            <p className="mt-0.5 text-xs text-[#5b6b86]">
              {hasMrp && (
                <>
                  MRP <span className="line-through">₹{item.mrp!.toFixed(2)}</span>
                </>
              )}
              {hasBought && (
                <span className="xl:hidden">{hasMrp ? ' · ' : ''}Bought {item.originalQuantity}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Bought + qty + price + subtotal (grid cells on desktop) */}
      <div className="flex items-end gap-3 xl:contents">
        {showBought && (
          <p className={`hidden text-right text-sm tabular-nums xl:block ${valueTone}`}>
            {item.originalQuantity ?? '—'}
          </p>
        )}

        <div className="flex-none">
          <div className="inline-flex h-9 w-28 items-center rounded-sm border border-[#7a8aa3] bg-white">
            <button
              onClick={() => {
                const step = item.unitMultiplier || 1;
                const moq = step;
                const currentQty = item.quantity || step;
                const nextQty = currentQty - step;
                onQuantityChange(item.id, Math.max(moq, nextQty));
              }}
              disabled={item.quantity <= (item.unitMultiplier || 1) || !isSelected}
              className={`flex h-full w-8 flex-none items-center justify-center text-lg leading-none text-[#45556c] ${t.stepHover} disabled:cursor-not-allowed disabled:text-[#b4bfd4] disabled:hover:bg-transparent`}
              aria-label="Decrease quantity"
            >−</button>
            <div className="flex h-full flex-1 items-center justify-center">
              <FloatingInput
                label="Quantity"
                value={String(item.quantity)}
                onChange={(val) => {
                  const num = parseFloat(val);
                  onQuantityChange(item.id, isNaN(num) ? 0 : num);
                }}
                onBlur={() => {
                  const stepSize = item.unitMultiplier || 1;
                  if (!item.quantity || item.quantity <= 0) {
                    onQuantityChange(item.id, stepSize);
                  }
                }}
                locked={!isSelected}
                className="w-full text-center text-sm font-semibold tabular-nums"
              />
            </div>
            <button
              onClick={() => {
                const step = item.unitMultiplier || 1;
                onQuantityChange(item.id, (item.quantity || step) + step);
              }}
              disabled={!isSelected}
              className={`flex h-full w-8 flex-none items-center justify-center text-lg leading-none text-[#45556c] ${t.stepHover} disabled:cursor-not-allowed disabled:text-[#b4bfd4] disabled:hover:bg-transparent`}
              aria-label="Increase quantity"
            >+</button>
          </div>
          {hasBought && (
            <p className="mt-0.5 text-[11px] text-[#5b6b86]">max {item.originalQuantity}</p>
          )}
        </div>

        <div className="ml-auto min-w-0 text-right xl:ml-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86] xl:hidden">Price</p>
          <p className={`text-sm tabular-nums ${valueTone}`}>₹{item.unitPrice.toFixed(2)}</p>
        </div>

        <div className="min-w-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86] xl:hidden">Subtotal</p>
          <p className={`text-sm font-semibold tabular-nums ${valueTone}`}>₹{(item.unitPrice * item.quantity).toFixed(2)}</p>
        </div>
      </div>
    </div>
  );
};