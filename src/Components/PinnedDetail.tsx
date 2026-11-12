import React, { useCallback, useEffect, useRef, useState } from 'react';

type DetailTheme = 'blue' | 'orange';

const THEMES: Record<DetailTheme, { line: string; hint: string; sunken: string; field: string }> = {
  blue: {
    line: 'border-[#dfe6fb]',
    hint: 'bg-[#e6eeff] text-[#155dfc]',
    sunken: 'bg-[#f5f7ff]',
    field: 'border-[#7a8aa3] focus-within:outline-[#155dfc]',
  },
  orange: {
    line: 'border-[#f6e1d0]',
    hint: 'bg-[#ffedd5] text-[#c2410c]',
    sunken: 'bg-[#fff8f2]',
    field: 'border-[#f6e1d0] focus-within:outline-[#ea580c]',
  },
};

// The "Find an item" search only shows once a bill is long enough to need it
const FIND_ITEM_MIN_LINES = 6;

interface PinnedDetailProps {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
  moreHint: string;
  theme?: DetailTheme;
  // Stop the scroll reaching the page behind (bottom sheets)
  containScroll?: boolean;
  className?: string;
}

// Bill / order detail with a pinned header and footer: only the middle scrolls,
// so the actions stay one click away however long the bill is.
export const PinnedDetail: React.FC<PinnedDetailProps> = ({
  header,
  footer,
  children,
  moreHint,
  theme = 'blue',
  containScroll = false,
  className = '',
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasMore, setHasMore] = useState(false);
  const { line, hint } = THEMES[theme];

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (el) setHasMore(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (scrollRef.current) observer.observe(scrollRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${className}`}>
      <div className={`shrink-0 border-b ${line}`}>{header}</div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={measure} className={`min-h-0 flex-1 overflow-y-auto ${containScroll ? 'overscroll-contain' : ''}`}>
          <div ref={contentRef}>{children}</div>
        </div>
        {hasMore && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] flex justify-center bg-gradient-to-b from-transparent to-white to-60% pb-2.5 pt-7">
            <span className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1 text-xs font-medium ${hint}`}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
              {moreHint}
            </span>
          </div>
        )}
      </div>

      <div className={`relative z-10 shrink-0 border-t bg-white shadow-[0_-6px_16px_rgba(21,48,140,0.06)] ${line}`}>{footer}</div>
    </div>
  );
};

const GLYPH = { className: 'h-4 w-4 shrink-0', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

interface ItemsHeaderProps {
  lineCount: number;
  pieces: number;
  query: string;
  onQueryChange: (value: string) => void;
  // The grid the item rows use, so the column titles line up with them
  gridClassName: string;
  theme?: DetailTheme;
  sticky?: boolean;
  className?: string;
  // The column titles after the item column (Qty, Rate, Amount...)
  children: React.ReactNode;
}

// One row: "Items · 14 · 27 pcs", the search icon, then the column titles.
// The search icon swaps the count for a Find an item box.
export const ItemsHeader: React.FC<ItemsHeaderProps> = ({
  lineCount,
  pieces,
  query,
  onQueryChange,
  gridClassName,
  theme = 'blue',
  sticky = true,
  className = '',
  children,
}) => {
  const [isFinding, setIsFinding] = useState(false);
  const { line, sunken, field } = THEMES[theme];

  const closeFind = () => {
    onQueryChange('');
    setIsFinding(false);
  };

  return (
    <div className={`${gridClassName} ${sticky ? 'sticky top-0 z-[2]' : ''} h-11 items-center border-b text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5b6b86] ${line} ${sunken} ${className}`}>
      <div onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-2 normal-case tracking-normal">
        {isFinding ? (
          <label className={`flex h-8 w-full min-w-0 max-w-[240px] items-center gap-1 rounded-sm border bg-white pl-2 text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 ${field}`}>
            <input
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') closeFind(); }}
              placeholder="Find an item"
              aria-label="Find an item"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[13px] font-normal text-[#0f172b] outline-none placeholder:text-[#5b6b86]"
            />
            <button type="button" onClick={closeFind} aria-label="Close find an item" className="grid h-7 w-7 shrink-0 place-items-center rounded-sm hover:text-[#0f172b]">
              <svg {...GLYPH}><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </label>
        ) : (
          <>
            <b className="whitespace-nowrap text-sm font-semibold text-[#0f172b]">Items · {lineCount}</b>
            <span className="hidden whitespace-nowrap text-xs font-normal sm:inline">{Number(pieces.toFixed(2))} pcs</span>
            {lineCount >= FIND_ITEM_MIN_LINES && (
              <button
                type="button"
                onClick={() => setIsFinding(true)}
                aria-label="Find an item"
                title="Find an item"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-sm hover:bg-white hover:text-[#0f172b]"
              >
                <svg {...GLYPH}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              </button>
            )}
          </>
        )}
      </div>
      {children}
    </div>
  );
};
