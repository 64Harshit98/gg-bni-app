import { get, set, del } from 'idb-keyval';
import {
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../lib/Firebase';

// Date-range cache for report pages (sales, purchases, expenses).
//
// Records are fetched per date range (not the whole collection) and cached per
// company in IndexedDB together with the window they cover. A range inside a
// fresh cached window is served with zero Firestore reads; a wider range only
// fetches the part outside the window.
//
// This deliberately isn't a delta sync on `updatedAt` (like the items cache):
// new invoices are written without `updatedAt`, `createdAt` can be backdated
// and invoice deletes are hard deletes, so a delta query would silently miss
// them. Staleness is bounded by the TTL and the report's Refresh button
// instead, and every write to the collection in this app calls clear().

export const REPORT_CACHE_TTL = 30 * 60 * 1000; // 30 min

const CACHE_VERSION = 1;

export interface RangeRecord {
  id: string;
}

interface RangeCache<T> {
  start: number;
  end: number;
  fetchedAt: number;
  records: T[];
}

export interface RangeLoadResult<T> {
  records: T[];
  fetchedAt: number;
  fromCache: boolean;
}

interface RangeCacheConfig<T> {
  name: string;
  collectionName: string;
  mapDoc: (snap: QueryDocumentSnapshot) => T;
  /** Field the range query filters on. Defaults to `createdAt`. */
  dateField?: string;
  /** How a millisecond bound is written in the query. Defaults to a Timestamp. */
  toQueryValue?: (ms: number) => unknown;
  /** Record time in ms, used for ordering. Defaults to `record.createdAt`. */
  timeOf?: (record: T) => number;
}

// JSON round-trip strips Firestore class instances so IndexedDB can clone them.
export const toPlain = <V>(value: V): V => JSON.parse(JSON.stringify(value ?? null));

export const createRangeCache = <T extends RangeRecord>({
  name,
  collectionName,
  mapDoc,
  dateField = 'createdAt',
  toQueryValue = (ms) => Timestamp.fromMillis(ms),
  timeOf = (record) => (record as unknown as { createdAt: number }).createdAt,
}: RangeCacheConfig<T>) => {
  const cacheKey = (companyId: string) => `${name}:v${CACHE_VERSION}:${companyId}`;
  // Keeps in-app navigation instant without re-reading IndexedDB.
  const memoryCache = new Map<string, RangeCache<T>>();

  const readCache = async (companyId: string): Promise<RangeCache<T> | null> => {
    const key = cacheKey(companyId);
    const inMemory = memoryCache.get(key);
    if (inMemory) return inMemory;
    try {
      const stored = await get<RangeCache<T>>(key);
      if (stored?.records) {
        memoryCache.set(key, stored);
        return stored;
      }
    } catch (e) {
      console.warn(`${name} read failed`, e);
    }
    return null;
  };

  const writeCache = async (companyId: string, cache: RangeCache<T>) => {
    const key = cacheKey(companyId);
    memoryCache.set(key, cache);
    try {
      await set(key, cache);
    } catch (e) {
      // Quota / private mode: the in-memory copy still serves this session.
      console.warn(`${name} write failed`, e);
    }
  };

  const clear = async (companyId?: string | null) => {
    if (!companyId) return;
    const key = cacheKey(companyId);
    memoryCache.delete(key);
    try {
      await del(key);
    } catch {
      /* nothing cached */
    }
  };

  const fetchRange = async (companyId: string, start: number, end: number): Promise<T[]> => {
    const q = query(
      collection(db, 'companies', companyId, collectionName),
      where(dateField, '>=', toQueryValue(start)),
      where(dateField, '<=', toQueryValue(end)),
      orderBy(dateField, 'desc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(mapDoc);
  };

  const load = async (
    companyId: string,
    start: number,
    end: number,
    { force = false }: { force?: boolean } = {},
  ): Promise<RangeLoadResult<T>> => {
    const now = Date.now();
    const cache = force ? null : await readCache(companyId);
    const isFresh = !!cache && now - cache.fetchedAt < REPORT_CACHE_TTL;

    if (cache && isFresh) {
      // 1. Fully covered — no reads at all.
      if (start >= cache.start && end <= cache.end) {
        return { records: cache.records, fetchedAt: cache.fetchedAt, fromCache: true };
      }

      // 2. Overlapping / adjacent — fetch only the missing edges and merge.
      const overlaps = start <= cache.end + 1 && end >= cache.start - 1;
      if (overlaps) {
        const gaps: [number, number][] = [];
        if (start < cache.start) gaps.push([start, cache.start - 1]);
        if (end > cache.end) gaps.push([cache.end + 1, end]);

        const fetched = (
          await Promise.all(gaps.map(([s, e]) => fetchRange(companyId, s, e)))
        ).flat();

        const byId = new Map(cache.records.map((r) => [r.id, r]));
        fetched.forEach((r) => byId.set(r.id, r));

        const merged: RangeCache<T> = {
          start: Math.min(start, cache.start),
          end: Math.max(end, cache.end),
          // The older part decides how fresh the whole window is.
          fetchedAt: cache.fetchedAt,
          records: [...byId.values()].sort((a, b) => timeOf(b) - timeOf(a)),
        };
        await writeCache(companyId, merged);
        return { records: merged.records, fetchedAt: merged.fetchedAt, fromCache: false };
      }
    }

    // 3. Nothing usable (no cache, stale, forced or a disjoint range) — fetch just this range.
    const records = await fetchRange(companyId, start, end);
    await writeCache(companyId, { start, end, fetchedAt: now, records });
    return { records, fetchedAt: now, fromCache: false };
  };

  return { load, clear };
};
