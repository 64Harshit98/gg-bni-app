import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatPhone } from '../Pages/Reports/SalesReportComponents/salesReport.utils';

export interface PhoneOption {
  phone: string;
  name: string;
}

interface MergePhoneInputProps {
  value: string;
  onChange: (digits: string) => void;
  options: PhoneOption[];
  placeholder?: string;
  /** orange = Catalogue, blue = POS */
  theme?: 'orange' | 'blue';
}

const THEMES = {
  orange: {
    focus: 'focus:border-orange-600 focus:ring-2 focus:ring-orange-100',
    active: 'bg-orange-100',
    hover: 'hover:bg-orange-50',
  },
  blue: {
    focus: 'focus:border-blue-500 focus:ring-2 focus:ring-blue-100',
    active: 'bg-blue-50',
    hover: 'hover:bg-blue-50',
  },
} as const;

const MergePhoneInput: React.FC<MergePhoneInputProps> = ({
  value,
  onChange,
  options,
  placeholder = '10-digit number',
  theme = 'orange',
}) => {
  const t = THEMES[theme];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Typed digits match the phone number
  const filtered = useMemo(
    () => (value ? options.filter((o) => o.phone.includes(value)) : options),
    [options, value],
  );

  // Click outside -> close
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Keep the highlighted row visible while using arrow keys
  useEffect(() => {
    if (active < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (phone: string) => {
    onChange(phone);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && active >= 0 && filtered[active]) {
      e.preventDefault(); // form submit mat karo, sirf number select karo
      pick(filtered[active].phone);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const showList = open && filtered.length > 0;

  return (
    <div ref={boxRef} className="relative">
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="off" // browser ki apni suggestion band
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          onChange(e.target.value.replace(/\D/g, '').slice(0, 10));
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoFocus
        placeholder={placeholder}
        className={`w-full rounded-sm border border-slate-300 py-2 pl-3 pr-9 text-sm text-slate-800 outline-none ${t.focus}`}
      />
      <ChevronDown
        size={15}
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition ${
          showList ? 'rotate-180' : ''
        }`}
      />

      {showList && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-sm border border-slate-200 bg-white py-1 shadow-float"
        >
          {filtered.map((o, i) => (
            <li
              key={o.phone}
              data-idx={i}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()} // input ka focus na jaye
              onClick={() => pick(o.phone)}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm ${
                i === active ? t.active : t.hover
              }`}
            >
              <span className="truncate font-medium text-slate-800">{o.name}</span>
              <span className="shrink-0 text-xs text-slate-500">{formatPhone(o.phone)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MergePhoneInput;