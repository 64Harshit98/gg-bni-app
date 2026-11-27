import { describe, expect, it, vi } from 'vitest';

vi.mock('./Firebase', () => ({ db: {} }));
vi.mock('../Pages/Reports/CustomerReportComponents/customerAliases', () => ({
    loadAliases: async () => ({}),
    groupPhones: (_a: unknown, p: string) => [p],
}));

import { catalogueLedgerDue, last10, posLedgerNet } from './partyBalance';

const d = (id: string, data: Record<string, unknown>) => ({ id, data });

describe('posLedgerNet', () => {
    it('nets purchase dues against sale + opening dues, like the Party Ledger', () => {
        // Ledger shows 933 = 833 previous + 100 this bill; purchase due 120 must be netted
        const sales = [d('s1', { paymentMethods: { due: 853 } }), d('INV-412', { paymentMethods: { due: 100 } })];
        const purchases = [d('p1', { paymentMethods: { due: 120 } })];
        const obs = [d('o1', { balanceType: 'due', dueAmount: 100 })];

        expect(posLedgerNet(sales, purchases, obs)).toBe(933);
        expect(posLedgerNet(sales, purchases, obs, { id: 'INV-412', kind: 'sale' })).toBe(833);
    });

    it('ignores advance opening balances and falls back to dueAmount', () => {
        const sales = [d('s1', { dueAmount: 50 })];
        const obs = [d('o1', { balanceType: 'advance', amount: 500, dueAmount: 0 }), d('o2', { amount: 30 })];
        expect(posLedgerNet(sales, [], obs)).toBe(80);
    });

    it('excludes the purchase being printed, not a sale with the same id', () => {
        const sales = [d('x', { paymentMethods: { due: 40 } })];
        const purchases = [d('x', { paymentMethods: { due: 70 } }), d('y', { paymentMethods: { due: 10 } })];
        expect(posLedgerNet(sales, purchases, [], { id: 'x', kind: 'purchase' })).toBe(30);
    });
});

describe('catalogueLedgerDue', () => {
    it('skips Upcoming orders, the printed order, and non-catalogue opening balances', () => {
        const orders = [
            d('a', { totalAmount: 500, paidAmount: 200 }),
            d('b', { totalAmount: 300, paidAmount: 0, status: 'Upcoming' }),
            d('c', { totalAmount: 100, paidAmount: 0 }),
        ];
        const obs = [d('o1', { source: 'catalogue', dueAmount: 50 }), d('o2', { dueAmount: 999 })];
        expect(catalogueLedgerDue(orders, obs, 'c')).toBe(350);
    });
});

describe('last10', () => {
    it('normalizes common phone spellings', () => {
        expect(last10('+91 98188 37719')).toBe('9818837719');
        expect(last10('09818837719')).toBe('9818837719');
        expect(last10(undefined)).toBe('');
    });
});
