import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomId, readLeadData, readSavedCart } from './buyerStorage';

const withStorage = (values: Record<string, string>) => {
    vi.stubGlobal('localStorage', {
        getItem: (k: string) => values[k] ?? null,
        setItem: () => {},
        removeItem: () => {},
    });
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('readLeadData', () => {
    it('returns name and number as strings', () => {
        withStorage({ leadData: JSON.stringify({ name: 'Asha', number: 9876543210 }) });
        expect(readLeadData()).toEqual({ name: 'Asha', number: '9876543210' });
    });

    it('returns an empty lead for missing, corrupt or non-object values', () => {
        withStorage({});
        expect(readLeadData()).toEqual({});
        for (const leadData of ['{oops', '"text"', '42', 'null']) {
            withStorage({ leadData });
            expect(readLeadData()).toEqual({});
        }
    });
});

describe('readSavedCart', () => {
    it('returns the saved cart array', () => {
        withStorage({ temp_cart: JSON.stringify([{ item: { id: '1' }, quantity: 2 }]) });
        expect(readSavedCart()).toEqual([{ item: { id: '1' }, quantity: 2 }]);
    });

    it('returns [] for a corrupt or non-array cart', () => {
        withStorage({ temp_cart: '{"item":1}' });
        expect(readSavedCart()).toEqual([]);
        withStorage({ temp_cart: '[broken' });
        expect(readSavedCart()).toEqual([]);
    });
});

describe('randomId', () => {
    it('works without crypto.randomUUID (older Safari)', () => {
        vi.stubGlobal('crypto', {});
        const a = randomId();
        const b = randomId();
        expect(a).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
        expect(a).not.toBe(b);
    });
});
