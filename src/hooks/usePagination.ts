import { useCallback, useState } from 'react';

export interface UsePaginationOptions {
  totalItems: number;
  pageSize: number;
  initialPage?: number;
}

export interface UsePaginationResult<T> {
  currentPage: number;
  totalPages: number;
  pageItems: (allItems: T[]) => T[];
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  canGoNext: boolean;
  canGoPrev: boolean;
}

/**
 * Simple client-side pagination over an in-memory array. Pairs with the
 * `Pagination` UI component in `src/Components/ui/pagination.tsx`.
 */
export function usePagination<T>({
  totalItems,
  pageSize,
  initialPage = 1,
}: UsePaginationOptions): UsePaginationResult<T> {
  const totalPages = Math.max(1, Math.ceil(totalItems / Math.max(pageSize, 1)));
  const [currentPage, setCurrentPage] = useState(() =>
    Math.min(Math.max(initialPage, 1), totalPages),
  );

  const clampedPage = Math.min(Math.max(currentPage, 1), totalPages);

  const goToPage = useCallback(
    (page: number) => {
      setCurrentPage(Math.min(Math.max(page, 1), totalPages));
    },
    [totalPages],
  );

  const nextPage = useCallback(() => goToPage(clampedPage + 1), [goToPage, clampedPage]);
  const prevPage = useCallback(() => goToPage(clampedPage - 1), [goToPage, clampedPage]);

  const pageItems = useCallback(
    (allItems: T[]) => {
      const start = (clampedPage - 1) * pageSize;
      return allItems.slice(start, start + pageSize);
    },
    [clampedPage, pageSize],
  );

  return {
    currentPage: clampedPage,
    totalPages,
    pageItems,
    goToPage,
    nextPage,
    prevPage,
    canGoNext: clampedPage < totalPages,
    canGoPrev: clampedPage > 1,
  };
}
