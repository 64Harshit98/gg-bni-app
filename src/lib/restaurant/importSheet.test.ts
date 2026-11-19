import { describe, expect, it } from 'vitest';
import {
  RAW_MATERIAL_COLUMNS,
  RECIPE_COLUMNS,
  baseUnitOf,
  canonicalUnit,
  cellNumber,
  isPetpoojaRawMaterialSheet,
  parsePetpoojaRawMaterialRows,
  parseRawMaterialRows,
  parseRecipeRows,
  sheetRowsFromAoa,
  type SheetRow,
} from './importSheet';
import type { RawMaterial, Recipe } from './types';

const rawRow = (row: number, cells: Record<string, unknown>): SheetRow => ({
  row,
  cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k.toLowerCase(), v])),
});

const rm = (over: Partial<RawMaterial> & { id: string; name: string }): RawMaterial => ({
  category: 'General',
  baseUnit: 'GRM',
  stock: 0,
  avgCost: 0,
  active: true,
  ...over,
});

describe('cells and units', () => {
  it('reads numbers people type', () => {
    expect(cellNumber('1,250')).toBe(1250);
    expect(cellNumber('₹ 40')).toBe(40);
    expect(cellNumber(12)).toBe(12);
    expect(cellNumber('')).toBeUndefined();
    expect(cellNumber('abc')).toBeNaN();
  });
  it('maps unit spellings', () => {
    expect(canonicalUnit('kgs')).toBe('KG');
    expect(canonicalUnit('Litre')).toBe('LTR');
    expect(canonicalUnit('pkt')).toBe('pkt');
    expect(baseUnitOf('kg')).toBe('GRM');
    expect(baseUnitOf('ltr')).toBe('ML');
    expect(baseUnitOf('pcs')).toBe('PC');
    expect(baseUnitOf('box')).toBeUndefined();
  });
});

describe('raw material import', () => {
  it('converts stock, cost and restock to base units using the Unit column', () => {
    const { ready, issues } = parseRawMaterialRows(
      [rawRow(5, { Name: 'Tomato', Category: 'Veg', 'Base Unit': 'kg', Unit: 'KG', 'Opening Stock': 12, Cost: 40, 'Restock Level': 3, Favourite: 'yes' })],
      [],
    );
    expect(issues).toEqual([]);
    expect(ready[0]).toMatchObject({
      name: 'Tomato', category: 'Veg', baseUnit: 'GRM', openingStock: 12000, openingCost: 0.04, restockLevel: 3000, favourite: true,
    });
  });

  it('defaults the Unit to the packaging unit', () => {
    const { ready } = parseRawMaterialRows(
      [rawRow(5, { Name: 'Bun', 'Base Unit': 'PC', 'Packaging Unit': 'pkt', 'Packaging Size': 6, 'Opening Stock': 10, Cost: 30 })],
      [],
    );
    expect(ready[0]).toMatchObject({ purchaseUnit: { name: 'pkt', factor: 6 }, openingStock: 60, openingCost: 5, category: 'General' });
  });

  it('skips existing names, repeats and bad rows with a reason', () => {
    const { ready, issues } = parseRawMaterialRows(
      [
        rawRow(5, { Name: 'Salt', 'Base Unit': 'GRM' }),
        rawRow(6, { Name: 'Sugar', 'Base Unit': 'GRM' }),
        rawRow(7, { Name: 'sugar', 'Base Unit': 'GRM' }),
        rawRow(8, { Name: 'Oil', 'Base Unit': 'gallon' }),
        rawRow(9, { Name: 'Milk', 'Base Unit': 'ML', Unit: 'KG' }),
        rawRow(10, { Name: 'Rice', 'Base Unit': 'GRM', 'Opening Stock': -2 }),
        rawRow(11, { Name: 'Box item', 'Base Unit': 'PC', 'Packaging Unit': 'box' }),
        rawRow(12, { Name: '', 'Base Unit': 'PC' }),
      ],
      [{ name: 'salt' }],
    );
    expect(ready.map((r) => r.name)).toEqual(['Sugar']);
    expect(issues.map((i) => i.row)).toEqual([5, 7, 8, 9, 10, 11, 12]);
    expect(issues[0].reason).toMatch(/Already exists/);
    expect(issues[3].reason).toMatch(/doesn't fit ML/);
  });
});

describe('recipe import', () => {
  const raw = [
    rm({ id: 'bun', name: 'Burger Bun', baseUnit: 'PC' }),
    rm({ id: 'mayo', name: 'Mayonnaise', baseUnit: 'GRM' }),
    rm({ id: 'cheese', name: 'Cheese Slice', baseUnit: 'PC' }),
  ];
  const saved: Recipe = {
    id: 'burger', itemId: 'burger', itemName: 'Veg Burger',
    ingredients: [{ rawMaterialId: 'bun', qty: 2, unit: 'PC' }],
    addOnRecipes: { egg: [{ rawMaterialId: 'mayo', qty: 5, unit: 'GRM' }] },
  };
  const ctx = {
    items: [
      { id: 'burger', name: 'Veg Burger', barcode: '1001' },
      { id: 'tea', name: 'Tea' },
      { id: 'tea2', name: 'tea' },
    ],
    addOnsOf: (id: string) => (id === 'burger' ? [{ id: 'cheeseOpt', name: 'Extra Cheese' }, { id: 'egg', name: 'Egg' }] : []),
    rawMaterials: raw,
    recipes: new Map([['burger', saved]]),
  };
  const row = (n: number, item: string, addOn: string, mat: string, qty: unknown, unit = '') =>
    rawRow(n, { 'Item Name': item, 'Add-on': addOn, 'Raw Material': mat, Qty: qty, Unit: unit });

  it('replaces the parts listed in the file and keeps the rest', () => {
    const res = parseRecipeRows(
      [row(5, 'veg burger', '', 'Burger Bun', 1, 'pcs'), row(6, 'Veg Burger', '', 'Mayonnaise', 0.02, 'kg'), row(7, '1001', 'Extra Cheese', 'cheese slice', 1)],
      ctx,
    );
    expect(res.issues).toEqual([]);
    expect(res.lineCount).toBe(3);
    expect(res.recipes).toHaveLength(1);
    const r = res.recipes[0];
    expect(r.ingredients).toEqual([{ rawMaterialId: 'bun', qty: 1, unit: 'PC' }, { rawMaterialId: 'mayo', qty: 0.02, unit: 'KG' }]);
    expect(r.addOnRecipes.cheeseOpt).toEqual([{ rawMaterialId: 'cheese', qty: 1, unit: 'PC' }]);
    expect(r.addOnRecipes.egg).toEqual(saved.addOnRecipes.egg); // not in the file: kept
  });

  it('keeps the saved main recipe when only an add-on is imported', () => {
    const res = parseRecipeRows([row(5, 'Veg Burger', 'Egg', 'Mayonnaise', 8, 'g')], ctx);
    expect(res.recipes[0].ingredients).toEqual(saved.ingredients);
    expect(res.recipes[0].addOnRecipes.egg).toEqual([{ rawMaterialId: 'mayo', qty: 8, unit: 'GRM' }]);
  });

  it('reports rows it cannot place', () => {
    const res = parseRecipeRows(
      [
        row(5, 'Pizza', '', 'Burger Bun', 1),
        row(6, 'Tea', '', 'Burger Bun', 1),
        row(7, 'Veg Burger', 'Bacon', 'Burger Bun', 1),
        row(8, 'Veg Burger', '', 'Ketchup', 1),
        row(9, 'Veg Burger', '', 'Burger Bun', 0),
        row(10, 'Veg Burger', '', 'Burger Bun', 1, 'KG'),
      ],
      ctx,
    );
    expect(res.recipes).toEqual([]);
    expect(res.issues.map((i) => i.reason)).toEqual([
      'No item "Pizza" in Items.',
      '2 items are named "Tea". Use the barcode instead.',
      '"Veg Burger" has no add-on "Bacon".',
      'No raw material "Ketchup". Import or add it first.',
      'Qty must be a number above 0.',
      'Unit "KG" doesn\'t fit Burger Bun. Use PC, DOZEN.',
    ]);
  });
});

describe('Petpooja raw-material export', () => {
  // Header row and first rows exactly as in a Petpooja export (header on row 5)
  const HEAD = ['Name', 'Purchase Unit', 'Conversion Qty', 'Consumption Unit', 'Purchase Price', 'Transfer Price', 'Tax Type', 'Tax(%)',
    'Excise Duty(in Amount)', 'HSN', 'Minimum Stock Level', 'Minimum Stock Level Unit', 'At Par Stock Level', 'At Par Stock Level Unit',
    'Description', 'Category', 'Sub Category', 'Rank', 'Normal loss(%)', 'Set as Favourite', 'Closing stock calculated on',
    'Exclusive to this restaurant', 'Is Expiry', 'Best Before (In Days)', 'Reconciliation price', 'Barcode/Short Code',
    'Other Purchase Units', 'Quantity', 'GTIN', 'Brand', 'Allow Decimal Quantity', 'Active'];
  const line = (o: Record<string, unknown>) => HEAD.map((h) => o[h] ?? '');
  const aoa = [
    ['Raw Material'], [], [], [],
    HEAD,
    line({ Name: 'Tortilla Wrap (wheat)', 'Purchase Unit': 'Pkts', 'Conversion Qty': 12, 'Consumption Unit': 'PCS', 'Purchase Price': 160, 'Tax(%)': 0, 'Minimum Stock Level': 0, 'At Par Stock Level': 0, Category: 'Wrap', 'Set as Favourite': 'No', 'Is Expiry': 'Yes', 'Barcode/Short Code': 'tortilla wrap (wheat', 'Allow Decimal Quantity': 'No', Active: 'Yes' }),
    line({ Name: 'Tortilla Wrap', 'Purchase Unit': 'Pkts', 'Conversion Qty': 10, 'Consumption Unit': 'Piece', 'Purchase Price': 110, 'Tax(%)': 5, 'Minimum Stock Level': 10, 'Minimum Stock Level Unit': 'Piece', 'At Par Stock Level': 20, 'At Par Stock Level Unit': 'Piece', Category: 'Wrap', 'Is Expiry': 'No', 'Best Before (In Days)': 30, 'Allow Decimal Quantity': 'Yes', Active: 'Yes' }),
    line({ Name: 'Strawberry', 'Purchase Unit': 'BOX', 'Conversion Qty': 1000, 'Consumption Unit': 'GRM', 'Purchase Price': 0, 'At Par Stock Level': 100, 'At Par Stock Level Unit': 'GRM', Category: 'Dessert', 'Is Expiry': 'Yes', 'Best Before (In Days)': 4 }),
    line({ Name: 'Brownie', 'Purchase Unit': 'PC', 'Conversion Qty': 0, 'Consumption Unit': 'PC', 'At Par Stock Level': 1, 'At Par Stock Level Unit': 'PC', Category: 'Dessert' }),
    line({ Name: 'Icecream Dressing', 'Purchase Unit': 'pkt', 'Conversion Qty': 50, 'Consumption Unit': 'GRM', 'At Par Stock Level': 5, 'At Par Stock Level Unit': 'GRM', Category: 'Dessert', Active: 'No' }),
    line({ Name: 'Paneer', 'Purchase Unit': 'KG', 'Conversion Qty': 1000, 'Consumption Unit': 'GRM', 'Purchase Price': 400, 'Minimum Stock Level': 2, 'Minimum Stock Level Unit': 'KG', Category: 'Dairy' }),
    line({ Name: 'Coke', 'Purchase Unit': 'Case', 'Conversion Qty': 24, 'Consumption Unit': 'Bottle', 'Purchase Price': 480, Category: 'Beverages' }),
  ];
  const rows = sheetRowsFromAoa(aoa, RAW_MATERIAL_COLUMNS)!;
  const { ready, issues } = parsePetpoojaRawMaterialRows(rows, [{ name: 'brownie' }]);
  const byName = new Map(ready.map((r) => [r.name, r]));

  it('is detected from its columns', () => {
    expect(isPetpoojaRawMaterialSheet(rows)).toBe(true);
    expect(rows[0].row).toBe(6);
  });

  it('turns Purchase Unit + Conversion Qty into packaging, price into cost per base unit', () => {
    expect(byName.get('Tortilla Wrap (wheat)')).toMatchObject({
      baseUnit: 'PC', purchaseUnit: { name: 'Pkts', factor: 12 }, openingCost: 13.333333, openingStock: 0,
      category: 'Wrap', shortCode: 'tortilla wrap (wheat', allowDecimal: false, active: true, favourite: false,
    });
    expect(byName.get('Strawberry')).toMatchObject({ baseUnit: 'GRM', purchaseUnit: { name: 'BOX', factor: 1000 }, parLevel: 100, shelfLifeDays: 4 });
  });

  it('reads min / par levels, tax, expiry and active', () => {
    expect(byName.get('Tortilla Wrap')).toMatchObject({
      baseUnit: 'PC', openingCost: 11, taxRate: 5, restockLevel: 10, parLevel: 20, allowDecimal: true,
    });
    expect(byName.get('Tortilla Wrap')!.shelfLifeDays).toBeUndefined(); // Is Expiry = No
    expect(byName.get('Icecream Dressing')).toMatchObject({ purchaseUnit: { name: 'pkt', factor: 50 }, parLevel: 5, active: false });
  });

  it('needs no packaging for a standard unit of the same kind (KG for GRM)', () => {
    expect(byName.get('Paneer')).toMatchObject({ baseUnit: 'GRM', purchaseUnit: undefined, openingCost: 0.4, restockLevel: 2000 });
  });

  it('treats other count words (Bottle) as PC', () => {
    expect(byName.get('Coke')).toMatchObject({ baseUnit: 'PC', purchaseUnit: { name: 'Case', factor: 24 }, openingCost: 20 });
  });

  it('skips names that already exist', () => {
    expect(issues).toEqual([{ row: 9, name: 'Brownie', reason: 'Already exists in Raw Materials (skipped).' }]);
  });
});

describe('reading the template sheet', () => {
  it('finds the header, skips the help row and blank rows, keeps Excel row numbers', () => {
    const aoa = [
      ['Raw materials — fill rows below'],
      [],
      ['★ Name', 'Category', '★ Base Unit'],
      [RAW_MATERIAL_COLUMNS[0].note, 'x', 'y'],
      ['Tomato', 'Veg', 'KG'],
      ['', '', ''],
      ['Onion', '', 'GRM'],
    ];
    const rows = sheetRowsFromAoa(aoa, RAW_MATERIAL_COLUMNS)!;
    expect(rows.map((r) => [r.row, r.cells['name'], r.cells['base unit']])).toEqual([
      [5, 'Tomato', 'KG'],
      [7, 'Onion', 'GRM'],
    ]);
  });
  it('returns null when the header is missing', () => {
    expect(sheetRowsFromAoa([['foo', 'bar']], RECIPE_COLUMNS)).toBeNull();
  });
});
