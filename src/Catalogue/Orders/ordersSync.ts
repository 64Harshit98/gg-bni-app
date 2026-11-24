import {
    collection,
    getDocs,
    onSnapshot,
    query,
    Timestamp,
    where,
    type DocumentChange,
    type DocumentData,
} from 'firebase/firestore';
import { del, delMany, get, keys, set } from 'idb-keyval';
import { db } from '../../lib/Firebase';
import { formatDate } from '../../lib/format';
import { reviveTimestamps } from '../../lib/timestampJson';
import type { Order } from './orders.types';

// Local replica of a company's catalogue Orders, shared by the whole app
// (the Orders page and NotificationContext both read from it).
//
// - IndexedDB keeps every order created since `windowStart` (30 days on first
//   use, widened on demand, pruned after 90 days), so opening the page renders
//   instantly and switching between date presets costs no reads.
// - One delta listener (`updatedAt >= cursor`) keeps it live: after the first
//   sync, only orders that actually changed are read. Every Orders write sets
//   `updatedAt: serverTimestamp()` for this reason.
// - Hard deletes never match the delta query, so a Cloud Function writes a
//   tombstone to `deletedOrders/{id}` on every delete; a second listener
//   applies those.

const CACHE_VERSION = 1;
const CACHE_PREFIX = 'orders_cache:';
const DAY_MS = 24 * 60 * 60 * 1000;
const SEED_DAYS = 30;
const KEEP_DAYS = 90;
// Tombstones expire (TTL policy, ~120 days); a cache older than this may have
// missed deletes, so it's thrown away and re-seeded.
const MAX_CURSOR_AGE_MS = 100 * DAY_MS;
// The first cursor comes from the client clock, so it starts a little early.
const CLOCK_SKEW_MS = 10 * 60 * 1000;
const PERSIST_DELAY_MS = 1000;

type RawOrder = DocumentData;

interface PersistedCache {
    v: number;
    windowStart: number;
    cursor: number;
    deletedCursor: number;
    /** JSON of Record<id, RawOrder>; Timestamps are revived on load. */
    ordersJson: string;
}

export interface OrdersSnapshot {
    orders: Order[];
    /** False until the cache (or the first server fetch) has loaded. */
    ready: boolean;
    error: string | null;
    /** Earliest createdAt (ms) the replica is complete from. */
    windowStart: number;
}

type Subscriber = (snapshot: OrdersSnapshot, addedIds: string[]) => void;

interface Store {
    companyId: string;
    raw: Map<string, RawOrder>;
    orders: Map<string, Order>;
    list: Order[];
    windowStart: number;
    cursor: number;
    deletedCursor: number;
    hasData: boolean;
    loaded: boolean;
    ready: boolean;
    error: string | null;
    subscribers: Set<Subscriber>;
    running: boolean;
    generation: number;
    unsubs: (() => void)[];
    persistTimer: ReturnType<typeof setTimeout> | null;
    rangeChain: Promise<void>;
    seeded: Promise<void>;
    resolveSeeded: () => void;
}

const stores = new Map<string, Store>();

const cacheKey = (companyId: string) => `${CACHE_PREFIX}v${CACHE_VERSION}:${companyId}`;

const startOfDay = (ms: number) => {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
};

// A Firestore Timestamp, a plain { seconds } after a JSON round-trip, a Date,
// millis or a date string — whatever older code saved.
export const toMillis = (value: unknown): number => {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const ms = new Date(value).getTime();
        return Number.isNaN(ms) ? 0 : ms;
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value !== 'object') return 0;
    const v = value as { toMillis?: () => number; seconds?: unknown; nanoseconds?: unknown };
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor(Number(v.nanoseconds || 0) / 1e6);
    return 0;
};

// Firestore order data → the Order shape the page uses. Shared by live docs
// and cache rehydration so both produce identical objects.
export const mapOrderData = (id: string, data: RawOrder): Order => {
    const createdMs = toMillis(data.createdAt);
    const createdAt = new Date(createdMs); // epoch fallback, NOT current time
    const updatedMs = toMillis(data.updatedAt);
    const updatedAt = updatedMs ? new Date(updatedMs) : createdAt;
    return {
        id,
        orderId: data.orderId || '',
        type: data.type || 'order',
        isLead: data.isLead || false,
        totalAmount: Number(data.totalAmount || 0),
        totalTax: Number(data.totalTax || 0),
        baseAmount: Number(data.baseAmount || 0),
        // Bill-level scheme/tax mode as saved at checkout/edit time; the PDF
        // print pipeline reads these instead of the company's live settings.
        gstScheme: data.gstScheme || '',
        taxType: data.taxType || '',
        paidAmount: Number(data.paidAmount || 0),
        creditNoteAmount: Number(data.creditNoteAmount || 0),
        refundAmount: Number(data.refundAmount || 0),
        status: data.status || 'Upcoming',
        paymentMethod: data.paymentMethod,
        paymentMethods: data.paymentMethods,
        returnHistory: Array.isArray(data.returnHistory) ? data.returnHistory : [],
        specialInstruction: data.specialInstruction || '',
        expenses: Array.isArray(data.expenses) ? data.expenses : [],
        manualDiscount: Number(data.manualDiscount || 0),
        transportDetails: data.transportDetails || undefined,
        // What the order did to loyalty points (read by print / return / delete)
        loyalty: data.loyalty || null,
        updatedAt,
        userName: data.userName || data.billingDetails?.name || 'Anonymous',
        userLoginPhone: data.userLoginPhone || data.billingDetails?.phone || '',
        billingDetails: data.billingDetails,
        shippingDetails: data.shippingDetails,
        createdAt,
        time: formatDate(createdAt),
        items: Array.isArray(data.items)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore line items
            ? data.items.map((i: any) => {
                const salesPrice = Number(i.salesPrice || 0);
                const mrp = Number(i.mrp || 0);
                const finalPrice = i.finalPrice ?? (salesPrice > 0 ? salesPrice : mrp);
                return {
                    id: i.id,
                    itemId: i.itemId || i.id,
                    name: i.name,
                    quantity: Number(i.quantity || 0),
                    mrp,
                    salesPrice,
                    effectiveUnitPrice: i.effectiveUnitPrice, // keeps an edited price from resetting
                    customPrice: i.customPrice,
                    unitPrice: finalPrice,
                    moq: Number(i.moq ?? 0),
                    itemGroupId: i.itemGroupId || i.groupId || null,
                    tax: Number(i.tax ?? i.taxRate ?? 0),
                    taxRate: Number(i.taxRate ?? i.tax ?? 0),
                    taxType: i.taxType || '',
                    discount: Number(i.discount ?? 0),
                    discount2: Number(i.discount2 ?? 0), // keeps tax from vanishing
                    unitMultiplier: Number(i.unitMultiplier ?? i.multiplier ?? 1),
                    unit: i.unit ?? 'pcs',
                    finalPrice: Number(i.finalPrice ?? finalPrice * Number(i.quantity || 0)),
                    note: i.note || '',
                    addOnLines: Array.isArray(i.addOnLines) ? i.addOnLines : undefined,
                    customerPricingFor: i.customerPricingFor,
                    customerPricingName: i.customerPricingName,
                    customerDiscountPct: i.customerDiscountPct,
                    customerDiscountSource: i.customerDiscountSource,
                    customerPriceSkip: i.customerPriceSkip,
                    preCustomerPrice: i.preCustomerPrice,
                    preCustomerDiscount: i.preCustomerDiscount,
                    preCustomerDiscount2: i.preCustomerDiscount2,
                    imageUrl: i.imageUrl || '',
                    imageBase64: '',
                };
            })
            : [],
    } as Order;
};

const createStore = (companyId: string): Store => {
    let resolveSeeded = () => { };
    const seeded = new Promise<void>((resolve) => { resolveSeeded = resolve; });
    return {
        companyId,
        raw: new Map(),
        orders: new Map(),
        list: [],
        windowStart: 0,
        cursor: 0,
        deletedCursor: 0,
        hasData: false,
        loaded: false,
        ready: false,
        error: null,
        subscribers: new Set(),
        running: false,
        generation: 0,
        unsubs: [],
        persistTimer: null,
        rangeChain: Promise.resolve(),
        seeded,
        resolveSeeded,
    };
};

const snapshotOf = (store: Store): OrdersSnapshot => ({
    orders: store.list,
    ready: store.ready,
    error: store.error,
    windowStart: store.windowStart,
});

const emit = (store: Store, addedIds: string[] = []) => {
    store.list = Array.from(store.orders.values());
    const snapshot = snapshotOf(store);
    store.subscribers.forEach((cb) => cb(snapshot, addedIds));
};

const putOrder = (store: Store, id: string, data: RawOrder) => {
    store.raw.set(id, data);
    store.orders.set(id, mapOrderData(id, data));
};

const removeOrder = (store: Store, id: string) => {
    store.raw.delete(id);
    return store.orders.delete(id);
};

const persistNow = async (store: Store) => {
    if (store.persistTimer) {
        clearTimeout(store.persistTimer);
        store.persistTimer = null;
    }
    if (!store.hasData) return;
    const payload: PersistedCache = {
        v: CACHE_VERSION,
        windowStart: store.windowStart,
        cursor: store.cursor,
        deletedCursor: store.deletedCursor,
        ordersJson: JSON.stringify(Object.fromEntries(store.raw)),
    };
    try {
        await set(cacheKey(store.companyId), payload);
    } catch (e) {
        // Quota / private mode: the in-memory copy still serves this session.
        console.warn('Orders cache write failed', e);
    }
};

const schedulePersist = (store: Store) => {
    if (store.persistTimer) return;
    store.persistTimer = setTimeout(() => { void persistNow(store); }, PERSIST_DELAY_MS);
};

const loadFromDisk = async (store: Store) => {
    try {
        const cached = await get<PersistedCache>(cacheKey(store.companyId));
        if (!cached || cached.v !== CACHE_VERSION || typeof cached.ordersJson !== 'string') return;
        if (Date.now() - cached.deletedCursor > MAX_CURSOR_AGE_MS) return; // may have missed deletes
        const raw: Record<string, RawOrder> = JSON.parse(cached.ordersJson, reviveTimestamps);
        Object.entries(raw).forEach(([id, data]) => putOrder(store, id, data));
        store.windowStart = cached.windowStart;
        store.cursor = cached.cursor;
        store.deletedCursor = cached.deletedCursor;
        store.hasData = true;
    } catch (e) {
        console.warn('Orders cache read failed', e);
    }
};

// Orders older than KEEP_DAYS leave the cache; the window shrinks to match.
const prune = (store: Store) => {
    const keepFrom = startOfDay(Date.now() - KEEP_DAYS * DAY_MS);
    if (store.windowStart >= keepFrom) return;
    store.orders.forEach((order, id) => {
        if (order.createdAt.getTime() < keepFrom) removeOrder(store, id);
    });
    store.windowStart = keepFrom;
    schedulePersist(store);
};

const fetchCreatedBetween = async (companyId: string, start: number, endExclusive?: number) => {
    const constraints = [where('createdAt', '>=', Timestamp.fromMillis(start))];
    if (endExclusive !== undefined) constraints.push(where('createdAt', '<', Timestamp.fromMillis(endExclusive)));
    const snap = await getDocs(query(collection(db, 'companies', companyId, 'Orders'), ...constraints));
    return snap.docs;
};

const applyOrderChanges = (store: Store, changes: DocumentChange<DocumentData>[], reportAdded: boolean) => {
    const added: string[] = [];
    let changed = false;

    changes.forEach((change) => {
        const { doc } = change;
        if (change.type === 'removed') {
            // Left the delta query: only a delete can do that (updatedAt only grows).
            if (removeOrder(store, doc.id)) changed = true;
            return;
        }

        if (!doc.metadata.hasPendingWrites) {
            const serverUpdated = toMillis(doc.data().updatedAt);
            if (serverUpdated > store.cursor) store.cursor = serverUpdated;
        }

        // 'estimate' gives this tab's own just-written orders a date right away.
        const data = doc.data({ serverTimestamps: 'estimate' });
        const createdMs = toMillis(data.createdAt);
        if (!createdMs || createdMs < store.windowStart) {
            if (removeOrder(store, doc.id)) changed = true;
            return;
        }
        if (reportAdded && !store.orders.has(doc.id)) added.push(doc.id);
        putOrder(store, doc.id, data);
        changed = true;
    });

    return { added, changed };
};

const attachListeners = (store: Store, generation: number) => {
    const { companyId } = store;
    let firstDelta = true;

    const unsubOrders = onSnapshot(
        query(
            collection(db, 'companies', companyId, 'Orders'),
            where('updatedAt', '>=', Timestamp.fromMillis(store.cursor)),
        ),
        (snapshot) => {
            if (generation !== store.generation) return;
            // The first snapshot is what changed while the app was closed —
            // those are synced silently, not announced as new orders.
            const { added, changed } = applyOrderChanges(store, snapshot.docChanges(), !firstDelta);
            firstDelta = false;
            if (store.error) { store.error = null; emit(store); }
            if (!changed) return;
            schedulePersist(store);
            emit(store, added);
        },
        (err) => {
            console.error('Orders live sync error:', err);
            if (generation !== store.generation) return;
            store.error = 'Failed to load orders';
            emit(store);
        },
    );

    const unsubDeletes = onSnapshot(
        query(
            collection(db, 'companies', companyId, 'deletedOrders'),
            where('deletedAt', '>=', Timestamp.fromMillis(store.deletedCursor)),
        ),
        (snapshot) => {
            if (generation !== store.generation) return;
            let changed = false;
            snapshot.docChanges().forEach(({ type, doc }) => {
                if (type === 'removed') return; // tombstone expired, nothing to do
                const data = doc.data();
                const deletedAt = toMillis(data.deletedAt);
                if (deletedAt > store.deletedCursor) store.deletedCursor = deletedAt;

                const cached = store.orders.get(doc.id);
                if (!cached) return;
                // upcoming_{key} draft ids are reused: a newer version of the
                // order than the one that was deleted stays.
                const deletedVersion = toMillis(data.orderUpdatedAt) || deletedAt || Infinity;
                if (cached.updatedAt && cached.updatedAt.getTime() > deletedVersion) return;
                removeOrder(store, doc.id);
                changed = true;
            });
            schedulePersist(store);
            if (changed) emit(store);
        },
        (err) => console.error('Orders delete sync error:', err),
    );

    store.unsubs.push(unsubOrders, unsubDeletes);
};

const start = (store: Store) => {
    store.running = true;
    const generation = ++store.generation;

    void (async () => {
        if (!store.loaded) {
            await loadFromDisk(store);
            if (generation !== store.generation) return;
            store.loaded = true;
        }

        if (store.hasData) {
            prune(store);
            store.ready = true;
            store.resolveSeeded();
            emit(store);
        } else {
            // First use on this device: one read of the last SEED_DAYS days.
            const windowStart = startOfDay(Date.now() - (SEED_DAYS - 1) * DAY_MS);
            const cursor = Date.now() - CLOCK_SKEW_MS; // taken BEFORE the fetch
            try {
                const docs = await fetchCreatedBetween(store.companyId, windowStart);
                if (generation !== store.generation) return;
                docs.forEach((d) => putOrder(store, d.id, d.data()));
                store.windowStart = windowStart;
                store.cursor = cursor;
                store.deletedCursor = cursor;
                store.hasData = true;
                store.error = null;
                schedulePersist(store);
            } catch (err) {
                console.error('Orders initial load error:', err);
                if (generation !== store.generation) return;
                store.error = 'Failed to load orders';
                store.ready = true;
                emit(store);
                stop(store); // the next subscriber retries
                return;
            }
            store.ready = true;
            store.resolveSeeded();
            emit(store);
        }

        attachListeners(store, generation);
    })();
};

const stop = (store: Store) => {
    store.running = false;
    store.generation++;
    store.unsubs.forEach((unsub) => unsub());
    store.unsubs = [];
    void persistNow(store);
};

/** Live orders for a company. Calls back right away if data is already loaded. */
export const subscribeOrders = (companyId: string, callback: Subscriber): (() => void) => {
    let store = stores.get(companyId);
    if (!store) {
        store = createStore(companyId);
        stores.set(companyId, store);
    }
    const target = store;
    target.subscribers.add(callback);
    if (target.ready) callback(snapshotOf(target), []);
    if (!target.running) start(target);

    return () => {
        target.subscribers.delete(callback);
        if (target.subscribers.size === 0 && target.running) stop(target);
    };
};

/**
 * Makes sure orders created since `startMs` are in the replica. Only the part
 * before the current window is read (once); after that the delta listener
 * keeps it live like the rest.
 */
export const ensureOrdersRange = (companyId: string, startMs: number): Promise<void> => {
    const store = stores.get(companyId);
    if (!store) return Promise.resolve();

    const run = async () => {
        await store.seeded;
        if (!store.hasData || startMs >= store.windowStart) return;
        const docs = await fetchCreatedBetween(companyId, startMs, store.windowStart);
        if (stores.get(companyId) !== store) return; // cleared (logout) meanwhile
        docs.forEach((d) => {
            if (!store.orders.has(d.id)) putOrder(store, d.id, d.data());
        });
        store.windowStart = startMs;
        schedulePersist(store);
        emit(store);
    };

    store.rangeChain = store.rangeChain.then(run, run);
    return store.rangeChain;
};

/** Drops the local replica (logout). With no companyId, every company's. */
export const clearOrdersCache = async (companyId?: string) => {
    const targets = companyId ? [companyId] : Array.from(stores.keys());
    targets.forEach((id) => {
        const store = stores.get(id);
        if (!store) return;
        store.hasData = false; // keeps stop()'s final persist from rewriting it
        stop(store);
        stores.delete(id);
    });
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

/** Test hook: forget all in-memory stores without touching IndexedDB. */
export const __resetOrdersStoresForTests = () => {
    stores.forEach((store) => {
        store.generation++;
        store.unsubs.forEach((unsub) => unsub());
        if (store.persistTimer) clearTimeout(store.persistTimer);
    });
    stores.clear();
};
