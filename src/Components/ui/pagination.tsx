import * as React from 'react';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

import { cn } from '../../lib/utils';

type PageToken = number | 'ellipsis';

function buildPageList(currentPage: number, totalPages: number, siblingCount: number): PageToken[] {
  const totalSlots = siblingCount * 2 + 5; // first + last + current + 2 ellipses

  if (totalSlots >= totalPages) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const leftSiblingIndex = Math.max(currentPage - siblingCount, 1);
  const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages);

  const showLeftEllipsis = leftSiblingIndex > 2;
  const showRightEllipsis = rightSiblingIndex < totalPages - 1;

  const firstPageIndex = 1;
  const lastPageIndex = totalPages;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftItemCount = 3 + siblingCount * 2;
    const leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
    return [...leftRange, 'ellipsis', lastPageIndex];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightItemCount = 3 + siblingCount * 2;
    const rightRange = Array.from(
      { length: rightItemCount },
      (_, i) => totalPages - rightItemCount + i + 1,
    );
    return [firstPageIndex, 'ellipsis', ...rightRange];
  }

  const middleRange = Array.from(
    { length: rightSiblingIndex - leftSiblingIndex + 1 },
    (_, i) => leftSiblingIndex + i,
  );
  return [firstPageIndex, 'ellipsis', ...middleRange, 'ellipsis', lastPageIndex];
}

export interface PaginationProps {
  /** 1-indexed current page. */
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Total row count, used with `pageSize` to render the "Showing X-Y of Z" slot. */
  totalItems?: number;
  pageSize?: number;
  /** How many page numbers to show on each side of the current page. */
  siblingCount?: number;
  className?: string;
}

/**
 * Self-contained, prop-driven pagination control. Styled to match the
 * glass-pill segmented control pattern used by `PageNavToggle`
 * (`src/Pages/Master/components/PageNavToggle.tsx`).
 */
function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  siblingCount = 1,
  className,
}: PaginationProps) {
  const safeTotalPages = Math.max(totalPages, 1);
  const page = Math.min(Math.max(currentPage, 1), safeTotalPages);
  const pages = React.useMemo(
    () => buildPageList(page, safeTotalPages, siblingCount),
    [page, safeTotalPages, siblingCount],
  );

  const canGoPrev = page > 1;
  const canGoNext = page < safeTotalPages;

  const hasResultsSummary = totalItems !== undefined && pageSize !== undefined;
  const showingFrom = hasResultsSummary && totalItems! > 0 ? (page - 1) * pageSize! + 1 : 0;
  const showingTo = hasResultsSummary ? Math.min(page * pageSize!, totalItems!) : 0;

  const navButtonClass =
    'flex items-center gap-1 rounded-xl px-2.5 py-2 text-sm font-semibold text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40';

  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn('flex flex-col-reverse items-center justify-between gap-3 sm:flex-row', className)}
    >
      {hasResultsSummary ? (
        <p className="text-sm text-muted-foreground">
          Showing <span className="font-medium text-foreground">{showingFrom}</span>
          {'–'}
          <span className="font-medium text-foreground">{showingTo}</span> of{' '}
          <span className="font-medium text-foreground">{totalItems}</span> results
        </p>
      ) : (
        <span />
      )}

      <div className="glass inline-flex items-center gap-1 rounded-2xl p-1 shadow-sm">
        <button
          type="button"
          aria-label="Previous page"
          disabled={!canGoPrev}
          onClick={() => onPageChange(page - 1)}
          className={navButtonClass}
        >
          <ChevronLeft className="size-4" />
        </button>

        {pages.map((p, idx) =>
          p === 'ellipsis' ? (
            <span
              key={`ellipsis-${idx}`}
              className="flex size-8 items-center justify-center text-muted-foreground"
            >
              <MoreHorizontal className="size-4" />
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPageChange(p)}
              className={cn(
                'flex min-w-8 items-center justify-center rounded-xl px-2.5 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.98]',
                p === page
                  ? 'bg-gradient-brand text-white shadow-md shadow-primary/25'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          aria-label="Next page"
          disabled={!canGoNext}
          onClick={() => onPageChange(page + 1)}
          className={navButtonClass}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}

export { Pagination };
