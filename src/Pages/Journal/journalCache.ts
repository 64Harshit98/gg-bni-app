import { del, delMany, get, keys, set } from 'idb-keyval';
import { reviveTimestamps } from '../../lib/timestampJson';
import type { Invoice } from './journal.types';

// Local copy of the last transactions list shown (sales + purchases), so the
// Transactions page renders instantly on open instead of waiting for its
// listeners. Display only: the live onSnapshot listeners in useJournalData
// still run and replace this as soon as they deliver — it saves no reads.

const CACHE_PREFIX = 'journal_cache:';
const CACHE_VERSION = 1;

interface JournalCacheEntry {
    /** null/null = the "All" (recent 300) list rather than a date range */
    start: number | null;
    end: number | null;
    savedAt: number;
    /** JSON of Invoice[]; Timestamps are revived on load */
    json: string;
}

const cacheKey = (companyId: string) => `${CACHE_PREFIX}v${CACHE_VERSION}:${companyId}`;

const covers = (entry: JournalCacheEntry, start: number | null, end: number | null) => {
    if (start === null || end === null) return entry.start === null && entry.end === null;
    return entry.start !== null && entry.end !== null && entry.start <= start && entry.end >= end;
};

/** Cached invoices for this range, or null when the cache doesn't cover it. */
export const loadJournalCache = async (
    companyId: string,
    start: number | null,
    end: number | null,
): Promise<Invoice[] | null> => {
    try {
        const entry = await get<JournalCacheEntry>(cacheKey(companyId));
        if (!entry || typeof entry.json !== 'string' || !covers(entry, start, end)) return null;
        const invoices = (JSON.parse(entry.json, reviveTimestamps) as Invoice[])
            .map((inv) => ({ ...inv, createdAt: new Date(inv.createdAt) }));
        if (start === null || end === null) return invoices;
        return invoices.filter((inv) => {
            const t = inv.createdAt.getTime();
            return t >= start && t <= end;
        });
    } catch (e) {
        console.warn('Journal cache read failed', e);
        return null;
    }
};

/** Replaces the cache with the list currently on screen. */
export const saveJournalCache = async (
    companyId: string,
    start: number | null,
    end: number | null,
    invoices: Invoice[],
) => {
    try {
        const entry: JournalCacheEntry = { start, end, savedAt: Date.now(), json: JSON.stringify(invoices) };
        await set(cacheKey(companyId), entry);
    } catch (e) {
        // Quota / private mode: the page just loads from the listeners.
        console.warn('Journal cache write failed', e);
    }
};

/** Drops the cache (logout). With no companyId, every company's. */
export const clearJournalCache = async (companyId?: string) => {
    try {
        if (companyId) {
            await del(cacheKey(companyId));
        } else {
            const all = await keys();
            await delMany(all.filter((k) => typeof k === 'string' && k.startsWith(CACHE_PREFIX)));
        }
    } catch {
        /* nothing cached */
    }
};
