import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/Firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({}));

import { toStorefrontPageData } from './useStorefront';
import type { StorefrontData } from './storefrontClient';

const template = {
    id: 't1',
    name: 'Extras',
    multiple: true,
    options: [{ id: 'o1', name: 'Cheese', price: 10, itemId: 'stock-item', itemQty: 1 }],
};

const bundle = (over: Partial<StorefrontData> = {}): StorefrontData => ({
    companyId: 'c1',
    businessInfo: null,
    catalogueSettings: null,
    pinnedCategoryIds: ['g1'],
    pinnedItemIds: ['i1'],
    itemGroups: [],
    items: [
        { id: 'i1', name: 'Burger', addOnGroupIds: ['t1'] },
        { id: 'stock-item', name: 'Cheese slice', stock: 0 },
    ] as unknown as StorefrontData['items'],
    storePage: null,
    enableAddOns: true,
    addOnTemplates: [template],
    ...over,
});

describe('toStorefrontPageData', () => {
    it('turns the bundle into what the pages read', () => {
        const data = toStorefrontPageData(bundle({ businessInfo: { businessName: 'Acme' } }));
        expect(data.business.businessName).toBe('Acme');
        expect(data.pinnedItemIds.has('i1')).toBe(true);
        expect(data.pinnedCategoryIds.has('g1')).toBe(true);
    });

    it('defaults to an empty business when the store has no business_info', () => {
        expect(toStorefrontPageData(bundle()).business).toEqual({});
    });

    it('resolves add-ons from the library, marking linked options with no stock as sold out', () => {
        const [burger] = toStorefrontPageData(bundle()).items;
        expect(burger.addOnGroups?.[0].name).toBe('Extras');
        expect(burger.addOnGroups?.[0].options[0].soldOut).toBe(true);
    });

    it('sells linked options past zero stock when negative inventory is allowed', () => {
        const settings = { allowNegativeInventory: true } as StorefrontData['catalogueSettings'];
        const [burger] = toStorefrontPageData(bundle({ catalogueSettings: settings })).items;
        expect(burger.addOnGroups?.[0].options[0].soldOut).toBeUndefined();
    });

    it('hides add-ons when "Enable add-ons" is off', () => {
        const [burger] = toStorefrontPageData(bundle({ enableAddOns: false })).items;
        expect(burger.addOnGroups).toBeUndefined();
    });
});
