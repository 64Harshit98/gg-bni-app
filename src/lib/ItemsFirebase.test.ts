import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getFirestoreOperations } from './ItemsFirebase';
import type { Item } from '../constants/models';

// In-memory stand-ins for Firestore and IndexedDB. Values going into the fake
// IndexedDB are cloned, so timestamps lose their methods just like the real one.
const fake = vi.hoisted(() => {
  class FakeTimestamp {
    seconds: number;
    constructor(ms: number) { this.seconds = Math.floor(ms / 1000); }
    toMillis() { return this.seconds * 1000; }
  }
  const server: Record<string, Map<string, any>> = { items: new Map(), deletedItems: new Map() };
  const listeners = new Set<{ q: any; cb: (snapshot: any) => void }>();
  const idb = new Map<string, any>();

  const millis = (v: any) => (v instanceof Date ? v.getTime() : v?.toMillis?.() ?? 0);
  const run = (q: any) => {
    const docs = Array.from(server[q.name].entries())
      .filter(([, data]) => q.filters.every((f: any) => millis(data[f.field]) > millis(f.value)))
      .map(([id, data]) => ({ id, data: () => data }));
    return { docs, empty: docs.length === 0, size: docs.length };
  };
  const notify = () => listeners.forEach((l) => l.cb(run(l.q)));
  return { FakeTimestamp, server, listeners, idb, run, notify };
});

vi.mock('./Firebase', () => ({ db: {} }));

vi.mock('idb-keyval', () => ({
  get: async (key: string) => structuredClone(fake.idb.get(key)),
  set: async (key: string, value: any) => { fake.idb.set(key, structuredClone(value)); },
  update: async (key: string, updater: (old: any) => any) => {
    fake.idb.set(key, structuredClone(updater(structuredClone(fake.idb.get(key)))));
  },
}));

vi.mock('firebase/firestore', () => ({
  collection: (_parent: any, name: string) => ({ name }),
  doc: (parent: any, ...path: string[]) => ({ name: parent?.name, id: path[path.length - 1] }),
  query: (ref: any, ...filters: any[]) => ({ name: ref.name, filters }),
  where: (field: string, _op: string, value: any) => ({ field, value }),
  serverTimestamp: () => new fake.FakeTimestamp(Date.now()),
  getDocs: async (q: any) => fake.run(q),
  onSnapshot: (q: any, cb: (snapshot: any) => void) => {
    const listener = { q, cb };
    fake.listeners.add(listener);
    cb(fake.run(q));
    return () => fake.listeners.delete(listener);
  },
  writeBatch: () => {
    const writes: (() => void)[] = [];
    return {
      delete: (ref: any) => writes.push(() => fake.server[ref.name].delete(ref.id)),
      set: (ref: any, data: any) => writes.push(() => fake.server[ref.name].set(ref.id, data)),
      commit: async () => { writes.forEach((w) => w()); fake.notify(); },
    };
  },
}));

const COMPANY = 'c1';
const ITEMS_KEY = `pos_items_${COMPANY}`;
const SYNC_KEY = `pos_sync_time_${COMPANY}`;

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const later = () => vi.setSystemTime(Date.now() + 60_000);
const stamp = () => new fake.FakeTimestamp(Date.now());

const putOnServer = (id: string) => {
  fake.server.items.set(id, { name: id, isDeleted: false, updatedAt: stamp() });
  later();
};

// Opens the app on a device: subscribes, waits for the sync, returns the latest list.
const open = async () => {
  const seen: Item[][] = [];
  const close = getFirestoreOperations(COMPANY).listenToItems((items) => seen.push(items));
  await settle();
  await settle();
  const ids = () => seen[seen.length - 1].map((i) => i.id).sort();
  return { close, ids, seen };
};

// A delete made from some other device, while this one is closed
const deleteElsewhere = (id: string) => {
  fake.server.items.delete(id);
  fake.server.deletedItems.set(id, { deletedAt: stamp() });
  later();
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 3, 10, 0));
  vi.spyOn(console, 'log').mockImplementation(() => { });
  fake.server.items.clear();
  fake.server.deletedItems.clear();
  fake.listeners.clear();
  fake.idb.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('item cache and deletes', () => {
  it('keeps a deleted item gone after a reload', async () => {
    putOnServer('a');
    putOnServer('b');
    const first = await open();
    later();

    await getFirestoreOperations(COMPANY).deleteItem('a');
    await settle();
    expect(first.ids()).toEqual(['b']);
    first.close();
    later();

    const reloaded = await open();
    expect(reloaded.ids()).toEqual(['b']);
    expect(reloaded.seen[0].map((i) => i.id)).toEqual(['b']);
    reloaded.close();
  });

  it('picks up an item deleted on another device while this one was closed', async () => {
    putOnServer('a');
    putOnServer('b');
    const first = await open();
    first.close();
    later();

    deleteElsewhere('a');

    const reopened = await open();
    expect(reopened.ids()).toEqual(['b']);
    reopened.close();
  });

  it('clears items that an earlier delete left behind in the cache', async () => {
    putOnServer('b');
    deleteElsewhere('ghost');
    // The state a device is in today: the deleted item cached, the sync time past the delete
    const cached = { id: 'ghost', name: 'ghost', updatedAt: { seconds: 0 } };
    fake.idb.set(ITEMS_KEY, [cached, { id: 'b', name: 'b', updatedAt: { seconds: 0 } }]);
    fake.idb.set(SYNC_KEY, new Date().toISOString());
    later();

    const opened = await open();
    expect(opened.ids()).toEqual(['b']);
    opened.close();
  });

  it('keeps an item re-added under the same barcode after its delete', async () => {
    putOnServer('a');
    const first = await open();
    first.close();
    later();

    deleteElsewhere('a');
    putOnServer('a');

    const reopened = await open();
    expect(reopened.ids()).toEqual(['a']);
    reopened.close();

    const reloaded = await open();
    expect(reloaded.ids()).toEqual(['a']);
    reloaded.close();
  });

  it('does not re-send the list when a delete changes nothing', async () => {
    putOnServer('a');
    const first = await open();
    first.close();
    later();

    deleteElsewhere('never-cached');

    const reopened = await open();
    expect(reopened.seen).toHaveLength(1);
    expect(reopened.ids()).toEqual(['a']);
    reopened.close();
  });

  it('stops listening once closed, even if closed while still loading', async () => {
    putOnServer('a');
    const close = getFirestoreOperations(COMPANY).listenToItems(() => { });
    close();
    await settle();
    await settle();
    expect(fake.listeners.size).toBe(0);
  });

  it('syncItems removes deleted items and does not bring them back later', async () => {
    putOnServer('a');
    putOnServer('b');
    const ops = getFirestoreOperations(COMPANY);
    expect((await ops.syncItems()).map((i) => i.id).sort()).toEqual(['a', 'b']);
    later();

    deleteElsewhere('a');
    expect((await ops.syncItems()).map((i) => i.id)).toEqual(['b']);
    later();

    const opened = await open();
    expect(opened.ids()).toEqual(['b']);
    opened.close();
  });
});
