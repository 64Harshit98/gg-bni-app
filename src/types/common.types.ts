/**
 * Shared cross-cutting types used across pages/features. New shared shapes
 * should land here rather than being redefined ad hoc per-page; a grep for
 * `PaginatedResult` / `DateRange` across the codebase found no existing
 * duplicates at the time this file was added.
 */

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  column: string;
  direction: SortDirection;
}

export interface DateRange {
  from: Date | null;
  to: Date | null;
}
