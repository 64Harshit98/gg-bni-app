import { describe, expect, it } from 'vitest';
import { formatStock, fromBase, toBase, unitsOf, costPerPurchaseUnit, costPerBase, round6, unitCostOf } from './units';
import { buildLineConsumption, cartLineConsumption, diffConsumption, portionsLeft, recipeCost, shortfalls, totalConsumption } from './consumption';
import { avgCostWithout, nextAvgCost, recipeUsingRawMaterial } from './stockApi';
import { planAllowsRestaurant, type RawMaterial, type Recipe } from './types';

const rm = (over: Partial<RawMaterial> & { id: string }): RawMaterial => ({
  name: over.id,
  category: 'General',
  baseUnit: 'GRM',
  stock: 0,
  avgCost: 0,
  active: true,
  ...over,
});

describe('units', () => {
  const bun = rm({ id: 'bun', baseUnit: 'PC', purchaseUnit: { name: 'pkt', factor: 10 } });

  it('lists built-in and packaging units', () => {
    expect(unitsOf(bun).map((u) => u.name)).toEqual(['PC', 'DOZEN', 'pkt']);
    expect(unitsOf(rm({ id: 'x', baseUnit: 'GRM' })).map((u) => u.name)).toEqual(['GRM', 'KG']);
  });

  it('converts to and from base units', () => {
    expect(toBase(bun, 2, 'pkt')).toBe(20);
    expect(toBase(bun, 1, 'DOZEN')).toBe(12);
    expect(toBase(rm({ id: 'f', baseUnit: 'GRM' }), 1.5, 'KG')).toBe(1500);
    expect(fromBase(bun, 25, 'pkt')).toBe(2.5);
    expect(toBase(bun, 3)).toBe(3); // no unit -> base
    expect(toBase(bun, 3, 'unknown')).toBe(3);
  });

  it('formats stock like "1 pkt 5 PC"', () => {
    expect(formatStock(bun, 15)).toBe('1 pkt 5 PC');
    expect(formatStock(bun, 20)).toBe('2 pkt');
    expect(formatStock(bun, 4)).toBe('4 PC');
    expect(formatStock(rm({ id: 'b', baseUnit: 'GRM' }), 250)).toBe('250 GRM');
    expect(formatStock(bun, -3)).toBe('-3 PC');
  });

  it('shows cost per packaging unit', () => {
    expect(costPerPurchaseUnit({ ...bun, avgCost: 5.5 })).toEqual({ cost: 55, unit: 'pkt' });
    expect(costPerPurchaseUnit(rm({ id: 'a', avgCost: 0.2 }))).toEqual({ cost: 0.2, unit: 'GRM' });
  });

  it('costs with the average cost, or the purchase price before any purchase', () => {
    expect(unitCostOf(rm({ id: 'a', avgCost: 4, purchasePrice: 5 }))).toBe(4);
    expect(unitCostOf(rm({ id: 'a', avgCost: 0, purchasePrice: 5 }))).toBe(5);
    expect(unitCostOf(rm({ id: 'a', avgCost: 0 }))).toBe(0);
    // recipe estimate for a never-bought material: 8 PC × ₹5
    const momo = rm({ id: 'momo', baseUnit: 'PC', purchasePrice: 5 });
    expect(recipeCost([{ rawMaterialId: 'momo', qty: 8, unit: 'PC' }], new Map([['momo', momo]]))).toBe(40);
  });
});

describe('consumption', () => {
  const raw = new Map<string, RawMaterial>([
    ['bun', rm({ id: 'bun', name: 'Bun', baseUnit: 'PC', stock: 20, avgCost: 5 })],
    ['patty', rm({ id: 'patty', name: 'Patty', baseUnit: 'GRM', stock: 1000, avgCost: 0.2 })],
    ['cheese', rm({ id: 'cheese', name: 'Cheese slice', baseUnit: 'PC', stock: 3, avgCost: 6 })],
    ['oil', rm({ id: 'oil', name: 'Oil', baseUnit: 'ML', stock: 500, avgCost: 0.1 })],
  ]);
  const recipes = new Map<string, Recipe>([
    [
      'burger',
      {
        id: 'burger',
        itemId: 'burger',
        itemName: 'Burger',
        ingredients: [
          { rawMaterialId: 'bun', qty: 1, unit: 'PC' },
          { rawMaterialId: 'patty', qty: 0.1, unit: 'KG' },
        ],
        addOnRecipes: { cheeseAddOn: [{ rawMaterialId: 'cheese', qty: 1, unit: 'PC' }] },
      },
    ],
  ]);

  it('multiplies the recipe by the quantity sold', () => {
    const lines = buildLineConsumption({ productId: 'burger', quantity: 3 }, recipes, raw);
    expect(lines.find((l) => l.rawMaterialId === 'bun')?.qty).toBe(3);
    expect(lines.find((l) => l.rawMaterialId === 'patty')?.qty).toBe(300); // 0.1 KG x 3 -> 300 GRM
  });

  it('adds the recipe of each chosen add-on, per portion', () => {
    const lines = buildLineConsumption({ productId: 'burger', quantity: 2, addOns: [{ id: 'cheeseAddOn' }] }, recipes, raw);
    expect(lines.find((l) => l.rawMaterialId === 'cheese')?.qty).toBe(2);
  });

  it('ignores add-ons that have no recipe and items that have no recipe', () => {
    expect(buildLineConsumption({ productId: 'burger', quantity: 1, addOns: [{ id: 'nope' }] }, recipes, raw)).toHaveLength(2);
    expect(buildLineConsumption({ productId: 'unknown', quantity: 5 }, recipes, raw)).toEqual([]);
    expect(buildLineConsumption({ productId: 'burger', quantity: 1, isCustomAmount: true }, recipes, raw)).toEqual([]);
  });

  it('skips a deleted ingredient instead of failing the bill', () => {
    const broken = new Map(recipes);
    broken.set('burger', { ...recipes.get('burger')!, ingredients: [{ rawMaterialId: 'gone', qty: 1, unit: 'PC' }] });
    expect(buildLineConsumption({ productId: 'burger', quantity: 1 }, broken, raw)).toEqual([]);
  });

  it('snapshots the cost per base unit', () => {
    const lines = buildLineConsumption({ productId: 'burger', quantity: 1 }, recipes, raw);
    expect(lines.find((l) => l.rawMaterialId === 'bun')?.unitCost).toBe(5);
  });

  it('totals and diffs consumption for bill edits', () => {
    const a = totalConsumption([buildLineConsumption({ productId: 'burger', quantity: 2 }, recipes, raw)]);
    const b = totalConsumption([buildLineConsumption({ productId: 'burger', quantity: 3 }, recipes, raw)]);
    const d = diffConsumption(a, b);
    expect(d.get('bun')).toBe(1);
    expect(d.get('patty')).toBe(100);
    expect(diffConsumption(a, a).size).toBe(0);
  });

  it('reports shortfalls, adding back what an edited bill already took', () => {
    const need = new Map([['cheese', 5]]);
    expect(shortfalls(need, raw)).toEqual([{ rawMaterialId: 'cheese', name: 'Cheese slice', need: 5, have: 3, unit: 'PC' }]);
    expect(shortfalls(need, raw, new Map([['cheese', 2]]))).toEqual([]);
  });

  it('works out portions left and cost per portion', () => {
    expect(portionsLeft(recipes.get('burger')!.ingredients, raw)).toBe(10); // patty: 1000 / 100
    expect(recipeCost(recipes.get('burger')!.ingredients, raw)).toBe(25); // 5 + 100 g x 0.2
  });

  it('does not lose a portion to float drift in stock', () => {
    const drift = new Map([['salt', rm({ id: 'salt', stock: 0.1 + 0.2 })]]); // 0.30000000000000004
    expect(portionsLeft([{ rawMaterialId: 'salt', qty: 0.1, unit: 'GRM' }], drift)).toBe(3);
  });
});

describe('cart line consumption (edit mode)', () => {
  const raw = new Map<string, RawMaterial>([
    ['bun', rm({ id: 'bun', name: 'Bun', baseUnit: 'PC', stock: 20, avgCost: 5 })],
  ]);
  const recipes = new Map<string, Recipe>([
    ['burger', { id: 'burger', itemId: 'burger', itemName: 'Burger', ingredients: [{ rawMaterialId: 'bun', qty: 1, unit: 'PC' }], addOnRecipes: {} }],
  ]);
  const snap = [{ rawMaterialId: 'bun', name: 'Bun', qty: 2, unit: 'PC' as const, unitCost: 4 }];

  it('uses the recipe for a new line', () => {
    expect(cartLineConsumption({ productId: 'burger', quantity: 2 }, recipes, raw)[0].qty).toBe(2);
  });

  it('scales the saved snapshot of a loaded line, ignoring later recipe changes', () => {
    const lines = cartLineConsumption({ productId: 'burger', quantity: 3, _origQuantity: 2, rawConsumption: snap }, recipes, raw);
    expect(lines).toEqual([{ ...snap[0], qty: 3 }]); // 2 x 3/2, cost from the bill
  });

  it('uses nothing for a loaded line saved without a snapshot (old bill), so editing it deducts nothing', () => {
    expect(cartLineConsumption({ productId: 'burger', quantity: 2, _origQuantity: 2 }, recipes, raw)).toEqual([]);
    expect(cartLineConsumption({ productId: 'burger', quantity: 2, _origQuantity: 2, rawConsumption: null }, recipes, raw)).toEqual([]);
    const oldTotal = totalConsumption([undefined]);
    const newTotal = totalConsumption([cartLineConsumption({ productId: 'burger', quantity: 5, _origQuantity: 2 }, recipes, raw)]);
    expect(diffConsumption(oldTotal, newTotal).size).toBe(0);
  });

  it('recomputes a loaded line whose add-ons were picked again', () => {
    const lines = cartLineConsumption({ productId: 'burger', quantity: 1, _origQuantity: 1, rawConsumption: snap, addOns: [{ id: 'x' }] }, recipes, raw);
    expect(lines[0].qty).toBe(1);
  });
});

describe('cost precision', () => {
  it('keeps 6 decimals for per-gram cost', () => {
    const flour = rm({ id: 'flour', baseUnit: 'GRM' });
    expect(costPerBase(flour, 47.5, 'KG')).toBe(0.0475);
    expect(costPerBase(flour, 0.4, 'KG')).toBe(0.0004); // used to round to 0
    expect(round6(1 / 3)).toBe(0.333333);
  });
  it('averages without dropping cheap materials to 0', () => {
    expect(nextAvgCost({ stock: 0, avgCost: 0 }, 1000, 0.0004)).toBe(0.0004);
  });
});

describe('undoing a receipt from the average cost', () => {
  it('reverses nextAvgCost', () => {
    const before = { stock: 10, avgCost: 2 };
    const avg = nextAvgCost(before, 10, 4); // 3
    expect(avgCostWithout({ stock: 20, avgCost: avg }, 10, 4)).toBe(2);
  });
  it('keeps the current average when the stock is already used up', () => {
    expect(avgCostWithout({ stock: 5, avgCost: 3 }, 10, 4)).toBe(3);
    expect(avgCostWithout({ stock: 20, avgCost: 3 }, 10, 0)).toBe(3);
  });
});

describe('delete guard and plan gating', () => {
  const recipes: Recipe[] = [
    { id: 'b', itemId: 'b', itemName: 'Burger', ingredients: [{ rawMaterialId: 'bun', qty: 1, unit: 'PC' }], addOnRecipes: { c: [{ rawMaterialId: 'cheese', qty: 1, unit: 'PC' }] } },
  ];
  it('finds a recipe using a raw material, add-on recipes included', () => {
    expect(recipeUsingRawMaterial(recipes, 'bun')?.itemName).toBe('Burger');
    expect(recipeUsingRawMaterial(recipes, 'cheese')?.itemName).toBe('Burger');
    expect(recipeUsingRawMaterial(recipes, 'salt')).toBeUndefined();
  });
  it('allows restaurant mode only on POS Pro and Enterprise', () => {
    expect(planAllowsRestaurant('pos_pro')).toBe(true);
    expect(planAllowsRestaurant('ENTERPRISE')).toBe(true);
    expect(planAllowsRestaurant('pos_basic')).toBe(false);
    expect(planAllowsRestaurant('catalogue_pro')).toBe(false);
    expect(planAllowsRestaurant(undefined)).toBe(false);
  });
});

describe('average cost', () => {
  it('takes the unit cost when there is no stock yet', () => {
    expect(nextAvgCost({ stock: 0, avgCost: 0 }, 10, 4)).toBe(4);
  });
  it('weights by stock across kitchen and godowns', () => {
    expect(nextAvgCost({ stock: 10, godownStock: { g1: 10 }, avgCost: 2 }, 20, 5)).toBe(3.5);
  });
  it('ignores a free or empty receipt', () => {
    expect(nextAvgCost({ stock: 10, avgCost: 2 }, 5, 0)).toBe(2);
  });
});
