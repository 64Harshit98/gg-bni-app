import { useCallback, useEffect, useRef, useState } from 'react';
import type { RangeLoadResult } from './reportRangeCache';

type RangeLoader<T> = (
  companyId: string,
  start: number,
  end: number,
  options?: { force?: boolean },
) => Promise<RangeLoadResult<T>>;

// Loads a report's records for the applied date range through a range cache
// (see reportRangeCache.ts). Shared by the sales, purchase and P&L reports.
export function useCachedRange<T>(
  load: RangeLoader<T>,
  companyId: string | undefined,
  range: { start: number; end: number } | null,
  authLoading: boolean,
) {
  const [records, setRecords] = useState<T[]>([]);
  // True only until the first data arrives; later range changes use isFetching.
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const requestId = useRef(0);
  const forceNext = useRef(false);

  // Force-refresh bypasses the cache (Refresh button).
  const refresh = useCallback(() => {
    forceNext.current = true;
    setRefreshToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!companyId) {
      setIsLoading(false);
      setError('Company information not found. Please log in again.');
      return;
    }
    if (!range) return;

    const id = ++requestId.current;
    const force = forceNext.current;
    forceNext.current = false;

    setIsFetching(true);
    load(companyId, range.start, range.end, { force })
      .then((result) => {
        if (id !== requestId.current) return; // a newer range was requested
        setRecords(result.records);
        setLastUpdated(result.fetchedAt);
        setError(null);
      })
      .catch((err) => {
        if (id !== requestId.current) return;
        console.error('Report load failed:', err);
        setError('Failed to load report data.');
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setIsFetching(false);
        setIsLoading(false);
      });
  }, [load, companyId, authLoading, range, refreshToken]);

  return { records, isLoading, isFetching, lastUpdated, error, refresh };
}
