import { db } from './Firebase';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import type { QuerySnapshot, DocumentData } from 'firebase/firestore';

export const CACHE_DURATION = 60 * 60 * 1000; // ← exported so both dashboards can import it

export interface FetchDashboardOptions<T> {
    companyId: string;
    startDate: string;
    endDate: string;
    cacheKey: string;
    forceRefresh?: boolean;
    transform: (snap: QuerySnapshot<DocumentData>, start: Date, end: Date) => T;
}

export type WithCacheMeta<T> = T & {
    lastUpdated: number;
    cacheStart: string;
    cacheEnd: string;
};

export async function fetchDashboardData<T>(
    options: FetchDashboardOptions<T>
): Promise<WithCacheMeta<T>> {
    const { companyId, startDate, endDate, cacheKey, forceRefresh = false, transform } = options;

    // 1. Cache check
    if (!forceRefresh) {
        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed: WithCacheMeta<T> = JSON.parse(cached);
                const timeOk = Date.now() - parsed.lastUpdated < CACHE_DURATION;
                const dateOk = parsed.cacheStart === startDate && parsed.cacheEnd === endDate;
                if (timeOk && dateOk) return parsed;
            }
        } catch {
            // Corrupted cache — fall through to fetch
            localStorage.removeItem(cacheKey);
        }
    }

    // 2. Firestore fetch
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end   = new Date(endDate);   end.setHours(23, 59, 59, 999);

    const snap = await getDocs(query(
        collection(db, 'companies', companyId, 'Orders'),
        where('createdAt', '>=', Timestamp.fromDate(start)),
        where('createdAt', '<=', Timestamp.fromDate(end)),
        orderBy('createdAt', 'asc')
    ));

    // 3. Caller-owned transform
    const result: WithCacheMeta<T> = {
        ...transform(snap, start, end),
        lastUpdated: Date.now(),
        cacheStart: startDate,
        cacheEnd: endDate,
    };

    // 4. Write cache
    localStorage.setItem(cacheKey, JSON.stringify(result));

    return result;
}