import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomId, readCheckoutDetails, readLeadData, readSavedCart, saveCheckoutDetails } from './buyerStorage';

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

describe('checkout details', () => {
    const memoryStorage = () => {
        const values: Record<string, string> = {};
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => values[k] ?? null,
            setItem: (k: string, v: string) => { values[k] = v; },
            removeItem: (k: string) => { delete values[k]; },
        });
    };
    const home = { name: 'Asha', phone: '+91 98765 43210', city: 'Pune', state: 'Maharashtra', address: '12 MG Road', gstin: '27abcde1234f1z5' };

    it('keeps city, state, address and GSTIN, not just name and number', () => {
        memoryStorage();
        saveCheckoutDetails({ billing: home, sameAsBilling: true });
        expect(readCheckoutDetails()).toEqual({
            billing: { ...home, phone: '9876543210', gstin: '27ABCDE1234F1Z5' },
            shipping: undefined,
            sameAsBilling: true,
        });
    });

    it('keeps a separate delivery address only when it differs', () => {
        memoryStorage();
        const office = { ...home, address: 'Office 4, FC Road' };
        saveCheckoutDetails({ billing: home, shipping: office, sameAsBilling: false });
        const saved = readCheckoutDetails()!;
        expect(saved.sameAsBilling).toBe(false);
        expect(saved.shipping?.address).toBe('Office 4, FC Road');
    });

    it('returns null for missing or corrupt data', () => {
        withStorage({});
        expect(readCheckoutDetails()).toBeNull();
        withStorage({ checkoutDetails: '{oops' });
        expect(readCheckoutDetails()).toBeNull();
        withStorage({ checkoutDetails: '{"billing":42}' });
        expect(readCheckoutDetails()).toBeNull();
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
