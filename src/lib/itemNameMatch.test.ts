import { describe, expect, it } from 'vitest';
import type { Item } from '../constants/models';
import { buildItemMatcher, nameKey, nameTokens } from './itemNameMatch';

const item = (id: string, name: string) => ({ id, name } as unknown as Item);

const catalogue = [
    item('1', 'Kaju 250 g'),
    item('2', 'Kaju 500 g'),
    item('3', 'Parle G Biscuit 100g'),
    item('4', 'Tata Tea Premium 500g'),
    item('5', 'Dairy Milk Chocolate 50g'),
    item('6', 'Surf Excel 1 kg'),
];
const matcher = buildItemMatcher(catalogue);
const top = (q: string) => matcher.rank(q, 3, 0)[0];

describe('nameTokens', () => {
    it('splits sizes and unifies unit spellings', () => {
        expect(nameTokens('KAJU 250GM')).toEqual(['kaju', '250', 'g']);
        expect(nameTokens('Surf Excel 1 KGS')).toEqual(['surf', 'excel', '1', 'kg']);
    });
    it('fixes OCR O for 0 only next to digits', () => {
        expect(nameTokens('Biscuit 1O0g')).toEqual(['biscuit', '100', 'g']);
        expect(nameTokens('Oreo')).toEqual(['oreo']);
    });
    it('keeps decimals and thousands', () => {
        expect(nameTokens('Oil 1.5L')).toEqual(['oil', '1.5', 'l']);
        expect(nameTokens('Rice 1,000 gm')).toEqual(['rice', '1000', 'g']);
    });
});

describe('buildItemMatcher', () => {
    it('finds the same name regardless of case, spacing and word order', () => {
        expect(matcher.exact('kaju 250gm')?.id).toBe('1');
        expect(matcher.exact('Tea Tata Premium 500 GM')?.id).toBe('4');
        expect(nameKey('Parle-G Biscuit 100g')).toBe(nameKey('parle g biscuit 100 g'));
    });

    it('scores a close OCR spelling high', () => {
        const m = top('PARLE-G BISCUT 1OO GM');
        expect(m.item.id).toBe('3');
        expect(m.score).toBeGreaterThan(0.84);
    });

    it('never treats a different pack size as a strong match', () => {
        const ranked = matcher.rank('Kaju 250g', 3, 0);
        expect(ranked[0].item.id).toBe('1');
        const other = ranked.find(r => r.item.id === '2');
        expect(other ? other.score : 0).toBeLessThan(0.5);
    });

    it('lists items for a partial search', () => {
        expect(matcher.rank('kaj', 5).map(r => r.item.id)).toEqual(expect.arrayContaining(['1', '2']));
        expect(top('choc')?.item.id).toBe('5');
    });

    it('returns nothing for unrelated names', () => {
        expect(matcher.rank('Hammer Drill', 5)).toEqual([]);
    });
});
