import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    subscribeOrders,
    ensureOrdersRange,
    clearOrdersCache,
    __resetOrdersStoresForTests,
    type OrdersSnapshot,
} from './ordersSync';

// In-memory Firestore (with docChanges / pending-write metadata) and IndexedDB.
const fake = vi.hoisted(() => {
    class FakeTimestamp {
        seconds: number;
        nanoseconds: number;
        constructor(seconds: number, nanoseconds: number) {
            this.seconds = seconds;
            this.nanoseconds = nanoseconds;
        }
        static fromMillis(ms: number) {
            return new FakeTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
        }
        toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
        toDate() { return new Date(this.toMillis()); }
        toJSON() { return { seconds: this.seconds, nanoseconds: this.nanoseconds, type: 'firestore/timestamp/1.0' }; }
    }

    type Data = Record<string, any>;
    const server: Record<string, Map<string, Data>> = { Orders: new Map(), deletedOrders: new Map() };
    const pending = new Set<string>();
    const idb = new Map<string, any>();
    const getDocsCalls: any[] = [];
    const listeners = new Set<{ q: any; next: (s: any) => void; last: Map<string, Data> }>();

    const millis = (v: any) => (v?.toMillis ? v.toMillis() : 0);
    const matches = (q: any, data: Data) => q.filters.every((f: any) => {
        const a = millis(data[f.field]);
        const b = millis(f.value);
        if (!a) return false; // missing field never matches a range filter
        return f.op === '>=' ? a >= b : f.op === '<' ? a < b : a > b;
    });
    const docOf = (id: string, data: Data) => ({
        id,
        data: () => data,
        metadata: { hasPendingWrites: pending.has(id) },
    });
    const run = (q: any) => {
        const docs = Array.from(server[q.name].entries())
            .filter(([, data]) => matches(q, data))
            .map(([id, data]) => docOf(id, data));
        return { docs, empty: docs.length === 0, size: docs.length };
    };
    const emit = (l: { q: any; next: (s: any) => void; last: Map<string, Data> }, initial: boolean) => {
        const now = new Map(run(l.q).docs.map((d) => [d.id, d.data()]));
        const changes: any[] = [];
        now.forEach((data, id) => {
            if (!l.last.has(id)) changes.push({ type: 'added', doc: docOf(id, data) });
            else if (l.last.get(id) !== data) changes.push({ type: 'modified', doc: docOf(id, data) });
        });
        l.last.forEach((data, id) => {
            if (!now.has(id)) changes.push({ type: 'removed', doc: docOf(id, data) });
        });
        l.last = now;
        if (initial || changes.length) l.next({ docChanges: () => changes });
    };
    const notify = () => listeners.forEach((l) => emit(l, false));
    return { FakeTimestamp, server, pending, idb, getDocsCalls, listeners, run, emit, notify };
});

vi.mock('../../lib/Firebase', () => ({ db: {} }));

vi.mock('idb-keyval', () => ({
    get: async (key: string) => structuredClone(fake.idb.get(key)),
    set: async (key: string, value: any) => { fake.idb.set(key, structuredClone(value)); },
    del: async (key: string) => { fake.idb.delete(key); },
    delMany: async (ks: string[]) => { ks.forEach((k) => fake.idb.delete(k)); },
    keys: async () => Array.from(fake.idb.keys()),
}));

vi.mock('firebase/firestore', () => ({
    Timestamp: fake.FakeTimestamp,
    collection: (_db: any, ...path: string[]) => ({ name: path[path.length - 1] }),
    query: (ref: any, ...filters: any[]) => ({ name: ref.name, filters }),
    where: (field: string, op: string, value: any) => ({ field, op, value }),
    getDocs: async (q: any) => { fake.getDocsCalls.push(q); return fake.run(q); },
    onSnapshot: (q: any, next: (s: any) => void) => {
        const listener = { q, next, last: new Map() };
        fake.listeners.add(listener);
        fake.emit(listener, true);
        return () => fake.listeners.delete(listener);
    },
}));

const COMPANY = 'c1';
const CACHE_KEY = `orders_cache:v1:${COMPANY}`;
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-24T12:00:00').getTime();

const stamp = (ms = Date.now()) => fake.FakeTimestamp.fromMillis(ms);
const tick = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };

// Writes an order the way the app does (createdAt + updatedAt = now).
const putOrder = (id: string, fields: Record<string, any> = {}, opts: { pending?: boolean } = {}) => {
    const prev = fake.server.Orders.get(id);
    fake.server.Orders.set(id, {
        status: 'Confirmed',
        totalAmount: 100,
        createdAt: prev?.createdAt ?? stamp(),
        ...fields,
        updatedAt: stamp(),
    });
    if (opts.pending) fake.pending.add(id); else fake.pending.delete(id);
};

// What the onOrderDeleted Cloud Function does.
const deleteOrder = (id: string) => {
    const prev = fake.server.Orders.get(id)!;
    fake.server.Orders.delete(id);
    fake.server.deletedOrders.set(id, { deletedAt: stamp(), orderUpdatedAt: prev.updatedAt });
};

// Opens the app: subscribes and records every emission.
const open = async () => {
    const emissions: { snapshot: OrdersSnapshot; addedIds: string[] }[] = [];
    const unsubscribe = subscribeOrders(COMPANY, (snapshot, addedIds) => emissions.push({ snapshot, addedIds }));
    await tick();
    const latest = () => emissions[emissions.length - 1].snapshot;
    const ids = () => latest().orders.map((o) => o.id).sort();
    return { emissions, unsubscribe, latest, ids };
};

// Closes the app: unsubscribes, lets the cache persist, forgets memory.
const close = async (session: { unsubscribe: () => void }) => {
    session.unsubscribe();
    await tick(2000);
    __resetOrdersStoresForTests();
};

const later = (ms = 60_000) => vi.setSystemTime(Date.now() + ms);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    fake.server.Orders.clear();
    fake.server.deletedOrders.clear();
    fake.pending.clear();
    fake.idb.clear();
    fake.getDocsCalls.length = 0;
    fake.listeners.clear();
    __resetOrdersStoresForTests();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ordersSync', () => {
    it('seeds the last 30 days once, then reopens from the cache with no full read', async () => {
        vi.setSystemTime(NOW - 40 * DAY);
        putOrder('old');
        vi.setSystemTime(NOW - 5 * DAY);
        putOrder('recent');
        vi.setSystemTime(NOW);

        const first = await open();
        expect(first.ids()).toEqual(['recent']);
        expect(first.latest().ready).toBe(true);
        expect(fake.getDocsCalls).toHaveLength(1);
        await close(first);

        const second = await open();
        expect(second.ids()).toEqual(['recent']);
        expect(fake.getDocsCalls).toHaveLength(1); // no new seed read
        await close(second);
    });

    it('syncs changes made while closed silently, and announces live new orders', async () => {
        putOrder('a');
        later();
        const first = await open();
        await close(first);

        later();
        putOrder('made-while-closed');
        later();

        const session = await open();
        expect(session.ids()).toEqual(['a', 'made-while-closed']);
        expect(session.emissions.every((e) => e.addedIds.length === 0)).toBe(true);

        later();
        putOrder('live-new');
        fake.notify();
        await tick();
        expect(session.emissions[session.emissions.length - 1].addedIds).toEqual(['live-new']);

        later();
        putOrder('a', { status: 'Packed' });
        fake.notify();
        await tick();
        const last = session.emissions[session.emissions.length - 1];
        expect(last.addedIds).toEqual([]);
        expect(last.snapshot.orders.find((o) => o.id === 'a')?.status).toBe('Packed');
        await close(session);
    });

    it('moves the cursor to the newest server updatedAt and skips pending writes', async () => {
        const session = await open();

        later();
        putOrder('confirmed-write');
        const confirmedAt = Date.now();
        fake.notify();
        await tick();

        later();
        putOrder('pending-write', {}, { pending: true });
        fake.notify();
        await tick(2000);

        expect(session.latest().orders.map((o) => o.id)).toContain('pending-write');
        expect(fake.idb.get(CACHE_KEY).cursor).toBe(confirmedAt);
        await close(session);
    });

    it('applies deletes from tombstones, but keeps a re-created draft with the same id', async () => {
        putOrder('keep-me');
        putOrder('delete-me');
        putOrder('upcoming_k', { status: 'Upcoming', isLead: true });
        later();
        const first = await open();
        await close(first);

        later();
        deleteOrder('delete-me');
        deleteOrder('upcoming_k');
        later();
        putOrder('upcoming_k', { status: 'Upcoming', isLead: true, createdAt: stamp() }); // customer started a new cart
        later();

        const session = await open();
        expect(session.ids()).toEqual(['keep-me', 'upcoming_k']);

        // A delete while open, of an order the delta listener isn't holding
        later();
        deleteOrder('keep-me');
        fake.notify();
        await tick();
        expect(session.ids()).toEqual(['upcoming_k']);
        await close(session);
    });

    it('drops an order deleted live after it changed this session', async () => {
        putOrder('x');
        later();
        const session = await open();
        later();
        putOrder('x', { status: 'Packed' });
        fake.notify();
        await tick();

        fake.server.Orders.delete('x'); // leaves the delta query before any tombstone
        fake.notify();
        await tick();
        expect(session.ids()).toEqual([]);
        await close(session);
    });

    it('reads only the missing days for an older range, once', async () => {
        vi.setSystemTime(NOW - 60 * DAY);
        putOrder('sixty-days-ago');
        vi.setSystemTime(NOW - 2 * DAY);
        putOrder('two-days-ago');
        vi.setSystemTime(NOW);

        const session = await open();
        const windowStart = session.latest().windowStart;
        expect(session.ids()).toEqual(['two-days-ago']);

        const start = NOW - 70 * DAY;
        await ensureOrdersRange(COMPANY, start);
        await tick();

        expect(fake.getDocsCalls).toHaveLength(2);
        const gap = fake.getDocsCalls[1].filters.map((f: any) => [f.op, f.value.toMillis()]);
        expect(gap).toEqual([['>=', start], ['<', windowStart]]);
        expect(session.ids()).toEqual(['sixty-days-ago', 'two-days-ago']);
        expect(session.latest().windowStart).toBe(start);

        await ensureOrdersRange(COMPANY, start + DAY); // already covered
        expect(fake.getDocsCalls).toHaveLength(2);
        await close(session);
    });

    it('prunes orders older than 90 days from the cache', async () => {
        const created = (ms: number) => ({ status: 'Confirmed', createdAt: stamp(ms), updatedAt: stamp(ms) });
        fake.idb.set(CACHE_KEY, {
            v: 1,
            windowStart: NOW - 120 * DAY,
            cursor: NOW - DAY,
            deletedCursor: NOW - DAY,
            ordersJson: JSON.stringify({ ancient: created(NOW - 100 * DAY), fresh: created(NOW - 10 * DAY) }),
        });

        const session = await open();
        expect(session.ids()).toEqual(['fresh']);
        expect(session.latest().windowStart).toBeGreaterThan(NOW - 91 * DAY);
        expect(fake.getDocsCalls).toHaveLength(0);
        await close(session);
    });

    it('revives nested timestamps and dates from the cache', async () => {
        putOrder('r', { returnHistory: [{ id: 'ret1', returnedAt: stamp(NOW - DAY) }] });
        later();
        const first = await open();
        await close(first);

        const session = await open();
        const order = session.latest().orders[0];
        expect(order.createdAt).toBeInstanceOf(Date);
        expect((order.returnHistory![0].returnedAt as any).toMillis()).toBe(NOW - DAY);
        await close(session);
    });

    it('clears the cache on logout', async () => {
        putOrder('a');
        const session = await open();
        await tick(2000);
        expect(fake.idb.has(CACHE_KEY)).toBe(true);
        await clearOrdersCache();
        await tick(2000);
        expect(fake.idb.has(CACHE_KEY)).toBe(false);
        session.unsubscribe();
    });
});
