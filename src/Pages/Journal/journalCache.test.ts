import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadJournalCache, saveJournalCache, clearJournalCache } from './journalCache';
import type { Invoice } from './journal.types';

const idb = vi.hoisted(() => new Map<string, any>());

vi.mock('idb-keyval', () => ({
    get: async (key: string) => structuredClone(idb.get(key)),
    set: async (key: string, value: any) => { idb.set(key, structuredClone(value)); },
    del: async (key: string) => { idb.delete(key); },
    delMany: async (ks: string[]) => { ks.forEach((k) => idb.delete(k)); },
    keys: async () => Array.from(idb.keys()),
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-24T12:00:00').getTime();

const invoice = (id: string, createdMs: number): Invoice =>
    ({ id, invoiceNumber: id, amount: 10, type: 'Credit', createdAt: new Date(createdMs) } as unknown as Invoice);

beforeEach(() => idb.clear());

describe('journalCache', () => {
    it('serves a range the cached range covers, filtered to it', async () => {
        await saveJournalCache('c1', NOW - 30 * DAY, NOW, [invoice('old', NOW - 20 * DAY), invoice('new', NOW - DAY)]);

        const week = await loadJournalCache('c1', NOW - 7 * DAY, NOW);
        expect(week?.map((i) => i.id)).toEqual(['new']);
        expect(week?.[0].createdAt).toBeInstanceOf(Date);
    });

    it('misses when the cached range does not cover the request', async () => {
        await saveJournalCache('c1', NOW - 7 * DAY, NOW, [invoice('a', NOW - DAY)]);
        expect(await loadJournalCache('c1', NOW - 30 * DAY, NOW)).toBeNull();
        expect(await loadJournalCache('c1', null, null)).toBeNull();
        expect(await loadJournalCache('other', NOW - DAY, NOW)).toBeNull();
    });

    it('keeps the "All" list separate from date ranges', async () => {
        await saveJournalCache('c1', null, null, [invoice('a', NOW - 100 * DAY)]);
        expect((await loadJournalCache('c1', null, null))?.map((i) => i.id)).toEqual(['a']);
        expect(await loadJournalCache('c1', NOW - DAY, NOW)).toBeNull();
    });

    it('clears every company on logout', async () => {
        await saveJournalCache('c1', null, null, [invoice('a', NOW)]);
        await saveJournalCache('c2', null, null, [invoice('b', NOW)]);
        idb.set('unrelated', 1);
        await clearJournalCache();
        expect(Array.from(idb.keys())).toEqual(['unrelated']);
    });
});
