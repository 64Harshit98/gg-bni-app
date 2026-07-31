import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { fetchDashboard } from '../../../services/dashboard.service';
import { CACHE_DURATION } from '../../../lib/fetchDashboardData';
import { dashboardKeys } from '../dashboard.keys';
import type { DashboardData } from '../dashboard.types';

interface PersistedDashboard {
  data: DashboardData;
  updatedAt: number;
}

const storageKeyFor = (
  companyId?: string,
  startDate?: string,
  endDate?: string,
) => `rq:dashboard:${companyId ?? 'anon'}:${startDate ?? ''}:${endDate ?? ''}`;

/** Read a persisted snapshot if it exists and is still within the cache window. */
function readPersisted(key: string): PersistedDashboard | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PersistedDashboard;
    if (!parsed?.updatedAt || Date.now() - parsed.updatedAt > CACHE_DURATION) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Dashboard metrics for a company + date range, backed by TanStack Query.
 * The aggregation lives in the service, so the numbers are identical to the
 * previous implementation.
 *
 * Reload-persistence: the latest result is mirrored to localStorage and used
 * as `initialData` on the next mount, so a full page reload hydrates instantly
 * (and skips the refetch) while the snapshot is still within the 1-hour window
 * — matching the app's previous caching behaviour.
 */
export function useDashboard(
  companyId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
) {
  const enabled = Boolean(companyId && startDate && endDate);
  const storageKey = storageKeyFor(companyId, startDate, endDate);

  const persisted = useMemo(
    () => (enabled ? readPersisted(storageKey) : undefined),
    [enabled, storageKey],
  );

  const query = useQuery({
    queryKey: dashboardKeys.range(companyId, startDate, endDate),
    queryFn: () =>
      fetchDashboard(companyId as string, startDate as string, endDate as string),
    enabled,
    // Mirror the old 1-hour cache window.
    staleTime: CACHE_DURATION,
    gcTime: CACHE_DURATION,
    initialData: persisted?.data,
    initialDataUpdatedAt: persisted?.updatedAt,
  });

  // Persist fresh results so the next full page reload can hydrate instantly.
  const { data, dataUpdatedAt, isFetching } = query;
  useEffect(() => {
    if (!enabled || !data || isFetching) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ data, updatedAt: dataUpdatedAt } satisfies PersistedDashboard),
      );
    } catch {
      /* storage unavailable / full — non-fatal */
    }
  }, [enabled, storageKey, data, dataUpdatedAt, isFetching]);

  return query;
}
