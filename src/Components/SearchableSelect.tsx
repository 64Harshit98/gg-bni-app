import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  clearable?: boolean;
  leftIcon?: React.ReactNode;
  id?: string;
  className?: string;       // wrapper
  buttonClassName?: string; // trigger button
  menuMaxHeight?: number;   // px, default 320
  theme?: 'blue' | 'orange';  // blue = POS, orange = Catalogue
  searchThreshold?: number;   // search bar only when options > this (default 7)
}

interface MenuPos {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const SEARCH_BOX_HEIGHT = 52;

const THEMES = {
  blue: {
    open: 'border-blue-600 ring-2 ring-blue-100',
    focusWithin: 'focus-within:border-blue-600',
    active: 'bg-blue-50',
    selected: 'text-blue-700',
  },
  orange: {
    open: 'border-[#c2410c] ring-2 ring-[#ffedd5]',
    focusWithin: 'focus-within:border-[#c2410c]',
    active: 'bg-[#fff5ec]',
    selected: 'text-[#c2410c]',
  },
} as const;

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found',
  disabled = false,
  clearable = false,
  leftIcon,
  id,
  className = '',
  buttonClassName = '',
  menuMaxHeight = 320,
  theme = 'blue',
  searchThreshold = 7,
}) => {
  const th = THEMES[theme];
  const showSearch = options.length > searchThreshold;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const placeBelow = spaceBelow >= 240 || spaceBelow >= spaceAbove;
    const available = placeBelow ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(160, Math.min(menuMaxHeight, available));
    const width = Math.max(rect.width, 200);
    const left = Math.min(rect.left, window.innerWidth - width - 8);

    setPos(
      placeBelow
        ? { left: Math.max(8, left), width, top: rect.bottom + 4, maxHeight }
        : { left: Math.max(8, left), width, bottom: window.innerHeight - rect.top + 4, maxHeight }
    );
  }, [menuMaxHeight]);

  // Position on open + keep it in sync on scroll / resize
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  // Focus search + start from the selected option
  useEffect(() => {
    if (!open) return;
    const idx = filtered.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    const t = setTimeout(() => (searchRef.current ?? menuRef.current)?.focus(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Reset highlight when search text changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Click outside closes the menu
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, close]);

  // Keep highlighted option visible
  useEffect(() => {
    if (!open) return;
    const li = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    li?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (opt: SelectOption | undefined) => {
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    close();
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(filtered[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`flex h-10 w-full items-center gap-2 rounded-sm border bg-white px-3 text-left text-sm transition-colors
          ${open ? th.open : 'border-[#7a8aa3] hover:border-[#45556c]'}
          ${disabled ? 'cursor-not-allowed bg-slate-50 opacity-60' : 'cursor-pointer'}
          ${buttonClassName}`}
      >
        {leftIcon && <span className="shrink-0 text-slate-400">{leftIcon}</span>}
        <span className={`flex-1 truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>
          {selected ? selected.label : placeholder}
        </span>
        {clearable && selected && !disabled && (
          <span
            role="button"
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
        )}
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            tabIndex={-1}
            onKeyDown={onKeyDown}
            style={{
              position: 'fixed',
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxHeight,
              zIndex: 9999,
            }}
            className="flex flex-col overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl outline-none"
          >
            {showSearch && (
              <div className="border-b border-slate-100 p-2" style={{ height: SEARCH_BOX_HEIGHT }}>
                <div className={`flex items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-2 focus-within:bg-white ${th.focusWithin}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-slate-400">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full bg-transparent py-1.5 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
            )}

            <ul
              ref={listRef}
              role="listbox"
              className="overflow-y-auto py-1"
              style={{ maxHeight: pos.maxHeight - (showSearch ? SEARCH_BOX_HEIGHT : 0) }}
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-3 text-center text-sm text-slate-400">{emptyText}</li>
              ) : (
                filtered.map((opt, i) => {
                  const isSelected = opt.value === value;
                  const isActive = i === activeIndex;
                  return (
                    <li
                      key={opt.value || `__empty_${i}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={opt.disabled}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => commit(opt)}
                      className={`flex cursor-pointer items-center justify-between px-3 py-2 text-sm
                        ${opt.disabled ? 'cursor-not-allowed text-slate-300' : 'text-slate-700'}
                                               ${isActive && !opt.disabled ? th.active : ''}
                        ${isSelected ? `font-semibold ${th.selected}` : ''}`}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-2 shrink-0">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SearchableSelect;