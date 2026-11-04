import { describe, it, expect, vi, afterEach } from 'vitest';
import { safeGet, safeGetJSON, safeRemove, safeSet, safeSetJSON } from './safeStorage';

const memoryStorage = (initial: Record<string, string> = {}) => {
    const store = { ...initial };
    return {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
        store,
    };
};

const throwingStorage = () => {
    const fail = () => { throw new Error('SecurityError: The operation is insecure.'); };
    return { getItem: fail, setItem: fail, removeItem: fail };
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('safeStorage with working storage', () => {
    it('reads, writes and removes values', () => {
        const storage = memoryStorage();
        vi.stubGlobal('localStorage', storage);
        safeSet('a', '1');
        expect(safeGet('a')).toBe('1');
        safeSetJSON('b', { x: 1 });
        expect(safeGetJSON('b', null)).toEqual({ x: 1 });
        safeRemove('a');
        expect(safeGet('a')).toBeNull();
    });

    it('returns the fallback for missing, corrupt or null JSON', () => {
        vi.stubGlobal('localStorage', memoryStorage({ corrupt: '{not json', nul: 'null' }));
        expect(safeGetJSON('missing', [])).toEqual([]);
        expect(safeGetJSON('corrupt', [])).toEqual([]);
        expect(safeGetJSON('nul', { ok: true })).toEqual({ ok: true });
    });
});

describe('safeStorage when storage throws (Safari "Block All Cookies")', () => {
    it('never throws', () => {
        vi.stubGlobal('localStorage', throwingStorage());
        expect(safeGet('a')).toBeNull();
        expect(() => safeSet('a', '1')).not.toThrow();
        expect(() => safeRemove('a')).not.toThrow();
        expect(safeGetJSON('a', 'fallback')).toBe('fallback');
    });

    it('never throws when localStorage itself is missing', () => {
        vi.stubGlobal('localStorage', undefined);
        expect(safeGet('a')).toBeNull();
        expect(() => safeSet('a', '1')).not.toThrow();
    });
});
