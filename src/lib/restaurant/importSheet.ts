// Excel import for restaurant mode: raw materials and recipes.
//
// Pure functions only (no Firebase, no DOM) so the parsing rules are unit-tested.
// The page reads the workbook into `SheetRow`s and saves what `parse*` returns.

import { CLOSING_PERIODS, TAX_TYPES } from './types';
import type { BaseUnit, PurchaseUnit, RawMaterial, RawMaterialDetails, Recipe, RecipeLine } from './types';
import { BASE_UNITS, costPerBase, round3, toBase, unitsOf } from './units';

/** One data row of the sheet: its Excel row number and cells keyed by normalised header. */
export interface SheetRow {
  row: number;
  cells: Record<string, unknown>;
}

export interface ImportIssue {
  row: number;
  name: string;
  reason: string;
}

export interface ImportColumn {
  /** Header text written to the template (and matched, normalised, when reading). */
  header: string;
  /** One-line help shown under the header in the template. */
  note: string;
  required?: boolean;
  width: number;
}

/** Lower-case, no markers/extra spaces: "★ Base Unit " -> "base unit". */
export const normHeader = (h: unknown): string =>
  String(h ?? '')
    .replace(/[★●▲*]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());

/** Number from a cell ("1,250", "₹ 40", 12). `undefined` when blank, `NaN` when not a number. */
export const cellNumber = (v: unknown): number | undefined => {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[₹,\s]/g, '');
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

const yes = (v: unknown) => ['yes', 'y', 'true', '1', '✓'].includes(text(v).toLowerCase());

// ---------------------------------------------------------------------------
// units
// ---------------------------------------------------------------------------

/** Spellings people type, mapped to the app's unit names. */
const UNIT_ALIASES: Record<string, string> = {
  g: 'GRM', gm: 'GRM', gms: 'GRM', gr: 'GRM', grm: 'GRM', gram: 'GRM', grams: 'GRM', gramme: 'GRM',
  kg: 'KG', kgs: 'KG', kilo: 'KG', kilos: 'KG', kilogram: 'KG', kilograms: 'KG',
  ml: 'ML', mls: 'ML', millilitre: 'ML', milliliter: 'ML', millilitres: 'ML', milliliters: 'ML',
  l: 'LTR', lt: 'LTR', ltr: 'LTR', ltrs: 'LTR', litre: 'LTR', liter: 'LTR', litres: 'LTR', liters: 'LTR',
  pc: 'PC', pcs: 'PC', piece: 'PC', pieces: 'PC', nos: 'PC', no: 'PC', unit: 'PC', units: 'PC', ea: 'PC',
  dozen: 'DOZEN', dz: 'DOZEN', doz: 'DOZEN',
};

/** The app's unit name for what was typed (packaging names pass through unchanged). */
export const canonicalUnit = (typed: string): string => {
  const t = typed.trim();
  return UNIT_ALIASES[t.toLowerCase()] ?? t;
};

/** Base unit for a typed unit: "KG" -> GRM, "LTR" -> ML, "PC"/"DOZEN" -> PC. */
export const baseUnitOf = (typed: string): BaseUnit | undefined => {
  const c = canonicalUnit(typed).toUpperCase();
  if ((BASE_UNITS as string[]).includes(c)) return c as BaseUnit;
  if (c === 'KG') return 'GRM';
  if (c === 'LTR') return 'ML';
  if (c === 'DOZEN') return 'PC';
  return undefined;
};

/** The exact unit name of `rm` matching what was typed, or undefined when it isn't one of its units. */
export const matchUnit = (rm: Pick<RawMaterial, 'baseUnit' | 'purchaseUnit'>, typed: string): string | undefined => {
  const want = canonicalUnit(typed).toLowerCase();
  return unitsOf(rm).find((u) => u.name.toLowerCase() === want)?.name;
};

// ---------------------------------------------------------------------------
// raw materials
// ---------------------------------------------------------------------------

/**
 * The raw-material template: Petpooja's raw-material export layout (so a Petpooja file and
 * our template are the same thing) plus Opening Stock. Every column is a field on the
 * create / edit form too.
 */
export const RAW_MATERIAL_COLUMNS: ImportColumn[] = [
  { header: 'Name', note: 'Ingredient name, e.g. Tomato', required: true, width: 24 },
  { header: 'Purchase Unit', note: 'Unit you buy in, e.g. KG, BOX, Pkts', width: 13 },
  { header: 'Conversion Qty', note: 'Consumption units in 1 Purchase Unit, e.g. 12', width: 14 },
  { header: 'Consumption Unit', note: 'Unit recipes use: GRM, ML, PC (KG / LTR fine)', required: true, width: 16 },
  { header: 'Purchase Price', note: '₹ per 1 Purchase Unit', width: 13 },
  { header: 'Transfer Price', note: '₹ per 1 Purchase Unit', width: 13 },
  { header: 'Tax Type', note: 'GST / VAT / None', width: 10 },
  { header: 'Tax(%)', note: 'e.g. 5', width: 8 },
  { header: 'Excise Duty(in Amount)', note: '₹', width: 12 },
  { header: 'HSN', note: 'HSN code', width: 11 },
  { header: 'Minimum Stock Level', note: 'Low-stock alert', width: 13 },
  { header: 'Minimum Stock Level Unit', note: 'Blank = Consumption Unit', width: 14 },
  { header: 'At Par Stock Level', note: 'Refill up to', width: 13 },
  { header: 'At Par Stock Level Unit', note: 'Blank = Consumption Unit', width: 14 },
  { header: 'Description', note: 'Notes', width: 22 },
  { header: 'Category', note: 'Blank = General', width: 14 },
  { header: 'Sub Category', note: '', width: 13 },
  { header: 'Rank', note: 'Sort order', width: 7 },
  { header: 'Normal loss(%)', note: 'Expected loss %', width: 11 },
  { header: 'Set as Favourite', note: 'Yes / No', width: 10 },
  { header: 'Closing stock calculated on', note: 'Daily, Weekly, Monthly (comma separated)', width: 16 },
  { header: 'Exclusive to this restaurant', note: 'Yes / No', width: 12 },
  { header: 'Is Expiry', note: 'Yes / No', width: 9 },
  { header: 'Best Before (In Days)', note: 'Days', width: 11 },
  { header: 'Reconciliation price', note: '₹ per 1 Purchase Unit', width: 13 },
  { header: 'Barcode/Short Code', note: '', width: 15 },
  { header: 'Other Purchase Units', note: 'More buying units, e.g. Case (comma separated)', width: 15 },
  { header: 'Quantity', note: 'Consumption units in each, e.g. 24', width: 10 },
  { header: 'GTIN', note: '', width: 14 },
  { header: 'Brand', note: '', width: 12 },
  { header: 'Allow Decimal Quantity', note: 'Yes / No', width: 11 },
  { header: 'Active', note: 'Yes / No. Blank = Yes', width: 8 },
  { header: 'Opening Stock', note: 'Kitchen stock now (not in Petpooja files)', width: 13 },
  { header: 'Opening Stock Unit', note: 'Blank = Consumption Unit', width: 13 },
];

/** Example rows, in RAW_MATERIAL_COLUMNS order. */
export const RAW_MATERIAL_EXAMPLE: (string | number)[][] = [
  ['Tomato', 'KG', 1, 'GRM', 40, 0, 'GST', 0, 0, '0702', 3, 'KG', 10, 'KG', '', 'Vegetables', 'Fresh', 1, 2, 'Yes', 'Daily', 'No', 'Yes', 5, 0, 'TOM', '', '', '', '', 'Yes', 'Yes', 12, 'KG'],
  ['Burger Bun', 'pkt', 6, 'PC', 30, 0, 'GST', 5, 0, '1905', 2, 'pkt', 8, 'pkt', '', 'Bakery', '', 2, 0, 'No', 'Weekly', 'No', 'Yes', 3, 0, '', '', '', '', 'Harvest', 'No', 'Yes', 10, 'pkt'],
  ['Coke 250ml', 'case', 24, 'PC', 480, 0, 'GST', 28, 0, '2202', 1, 'case', 4, 'case', '', 'Beverages', 'Cold drinks', 3, 0, 'No', 'Weekly,Monthly', 'No', 'No', '', 0, '', 'crate', 48, '', 'Coca-Cola', 'No', 'Yes', 2, 'case'],
];

export interface RawMaterialImportRow extends RawMaterialDetails {
  /** Defaults to true. */
  active?: boolean;
  row: number;
  name: string;
  category: string;
  baseUnit: BaseUnit;
  purchaseUnit?: PurchaseUnit;
  /** Base units, kitchen. */
  openingStock: number;
  /** Rupees per base unit. */
  openingCost: number;
  /** Base units. */
  restockLevel?: number;
  favourite: boolean;
}

/**
 * OLD template layout (Name, Category, Base Unit, Packaging Unit/Size, Unit, …) — kept so
 * files filled before the template moved to the Petpooja layout still import.
 * Names already in the app (or repeated in the file) are reported and skipped — stock of an
 * existing material changes only through stock entries, never by re-importing.
 */
export const parseRawMaterialRows = (
  rows: SheetRow[],
  existing: Pick<RawMaterial, 'name'>[],
): { ready: RawMaterialImportRow[]; issues: ImportIssue[] } => {
  const ready: RawMaterialImportRow[] = [];
  const issues: ImportIssue[] = [];
  const taken = new Set(existing.map((r) => r.name.trim().toLowerCase()));
  const inFile = new Set<string>();

  rows.forEach(({ row, cells }) => {
    const c = (h: string) => cells[normHeader(h)];
    const name = text(c('Name'));
    const fail = (reason: string) => issues.push({ row, name: name || '(no name)', reason });

    if (!name) return fail('Name is empty.');
    const key = name.toLowerCase();
    if (taken.has(key)) return fail('Already exists in Raw Materials (skipped).');
    if (inFile.has(key)) return fail('Repeated in this file (only the first row is used).');

    const baseTyped = text(c('Base Unit'));
    const baseUnit = baseTyped ? baseUnitOf(baseTyped) : undefined;
    if (!baseUnit) return fail(baseTyped ? `Base Unit "${baseTyped}" is not GRM, ML or PC.` : 'Base Unit is empty.');

    let purchaseUnit: PurchaseUnit | undefined;
    const packName = text(c('Packaging Unit'));
    const packSize = cellNumber(c('Packaging Size'));
    if (packName) {
      if (packSize === undefined || Number.isNaN(packSize) || packSize <= 0) {
        return fail(`Packaging Size must be a number above 0 for "${packName}".`);
      }
      if (baseUnitOf(packName)) return fail(`Packaging Unit "${packName}" is a standard unit; leave it blank or use a name like pkt / box.`);
      purchaseUnit = { name: packName, factor: round3(packSize) };
    }
    const unitSource = { baseUnit, purchaseUnit };

    const unitTyped = text(c('Unit'));
    const unit = unitTyped ? matchUnit(unitSource, unitTyped) : purchaseUnit?.name || baseUnit;
    if (!unit) {
      return fail(`Unit "${unitTyped}" doesn't fit ${baseUnit}. Use ${unitsOf(unitSource).map((u) => u.name).join(', ')}.`);
    }

    const nums: Record<string, number> = {};
    for (const h of ['Opening Stock', 'Cost', 'Restock Level', 'Par Level', 'GST %']) {
      const n = cellNumber(c(h));
      if (Number.isNaN(n)) return fail(`${h} is not a number.`);
      if ((n ?? 0) < 0) return fail(`${h} can't be negative.`);
      nums[h] = n ?? 0;
    }

    inFile.add(key);
    ready.push({
      row,
      name,
      category: text(c('Category')) || 'General',
      baseUnit,
      purchaseUnit,
      openingStock: toBase(unitSource, nums['Opening Stock'], unit),
      openingCost: costPerBase(unitSource, nums['Cost'], unit),
      restockLevel: nums['Restock Level'] > 0 ? toBase(unitSource, nums['Restock Level'], unit) : undefined,
      favourite: yes(c('Favourite')),
      parLevel: nums['Par Level'] > 0 ? toBase(unitSource, nums['Par Level'], unit) : undefined,
      taxRate: nums['GST %'] || undefined,
      subCategory: text(c('Sub Category')) || undefined,
      hsn: text(c('HSN')) || undefined,
      brand: text(c('Brand')) || undefined,
      shortCode: text(c('Short Code')) || undefined,
      description: text(c('Description')) || undefined,
    });
  });

  return { ready, issues };
};

// ---------------------------------------------------------------------------
// Petpooja raw-material export
// ---------------------------------------------------------------------------

/** True when the sheet is Petpooja's raw-material export (it has these two columns). */
export const isPetpoojaRawMaterialSheet = (rows: SheetRow[]): boolean =>
  rows.length > 0 && 'conversion qty' in rows[0].cells && 'consumption unit' in rows[0].cells;

/** Base units in ONE of a standard unit (KG -> 1000 GRM). Non-standard names count as 1. */
const standardFactor = (typed: string): number => {
  const c = canonicalUnit(typed).toUpperCase();
  return c === 'KG' || c === 'LTR' ? 1000 : c === 'DOZEN' ? 12 : 1;
};

/**
 * Petpooja's raw-material export -> rows ready to save.
 * - Consumption Unit is what recipes use: it becomes the base unit (Piece / PCS -> PC,
 *   KG -> GRM, LTR -> ML; any other count word such as Bottle is treated as PC).
 * - Purchase Unit + Conversion Qty becomes the packaging unit ("1 BOX = 1000 GRM").
 *   A standard purchase unit of the same kind (KG for GRM) needs no packaging.
 * - Purchase / Transfer / Reconciliation prices are per Purchase Unit. Min / At Par levels
 *   use their own Unit columns. Other Purchase Units + Quantity become extra buying units.
 * - This is also our own template's layout, which adds Opening Stock (+ Unit). Petpooja's
 *   export has no stock, so its rows start at 0 (enter it via Stock Entry).
 */
export const parsePetpoojaRawMaterialRows = (
  rows: SheetRow[],
  existing: Pick<RawMaterial, 'name'>[],
): { ready: RawMaterialImportRow[]; issues: ImportIssue[] } => {
  const ready: RawMaterialImportRow[] = [];
  const issues: ImportIssue[] = [];
  const taken = new Set(existing.map((r) => r.name.trim().toLowerCase()));
  const inFile = new Set<string>();

  rows.forEach(({ row, cells }) => {
    const c = (h: string) => cells[normHeader(h)];
    const name = text(c('Name'));
    const fail = (reason: string) => issues.push({ row, name: name || '(no name)', reason });

    if (!name) return fail('Name is empty.');
    const key = name.toLowerCase();
    if (taken.has(key)) return fail('Already exists in Raw Materials (skipped).');
    if (inFile.has(key)) return fail('Repeated in this file (only the first row is used).');

    const consTyped = text(c('Consumption Unit')) || text(c('Purchase Unit'));
    if (!consTyped) return fail('Consumption Unit is empty.');
    const baseUnit = baseUnitOf(consTyped) ?? 'PC';
    // base units in ONE consumption unit (1 for GRM / PC / Bottle, 1000 for KG)
    const consFactor = baseUnitOf(consTyped) ? standardFactor(consTyped) : 1;

    const purTyped = text(c('Purchase Unit'));
    const conv = cellNumber(c('Conversion Qty'));
    const sameAsConsumption = !purTyped || canonicalUnit(purTyped).toLowerCase() === canonicalUnit(consTyped).toLowerCase();
    const standardSameKind = !!purTyped && baseUnitOf(purTyped) === baseUnit && !!baseUnitOf(consTyped);

    let purchaseUnit: PurchaseUnit | undefined;
    // base units in ONE purchase unit; 0 = unknown (no conversion given)
    let purFactor = consFactor;
    if (!sameAsConsumption) {
      if (standardSameKind) {
        purFactor = standardFactor(purTyped);
      } else if (conv !== undefined && !Number.isNaN(conv) && conv > 0) {
        purFactor = round3(conv * consFactor);
        purchaseUnit = { name: purTyped, factor: purFactor };
      } else {
        purFactor = 0; // e.g. "pkt" with Conversion Qty 0: can't convert its price
      }
    }
    // Other Purchase Units + Quantity (comma separated, paired; Quantity in consumption units)
    const otherNames = text(c('Other Purchase Units')).split(',').map((s) => s.trim()).filter(Boolean);
    const otherQtys = text(c('Quantity')).split(',').map((s) => cellNumber(s.trim()));
    const otherPurchaseUnits: PurchaseUnit[] = [];
    otherNames.forEach((n, i) => {
      const q = otherQtys[i];
      const dup = [purchaseUnit?.name, ...otherPurchaseUnits.map((u) => u.name)].some((x) => x && x.toLowerCase() === n.toLowerCase());
      if (q !== undefined && !Number.isNaN(q) && q > 0 && !dup && baseUnitOf(n) !== baseUnit) {
        otherPurchaseUnits.push({ name: n, factor: round3(q * consFactor) });
      }
    });

    const unitSource = { baseUnit, purchaseUnit, otherPurchaseUnits };

    /** ₹ per Purchase Unit -> ₹ per base unit (0 when the purchase unit can't be converted). */
    const priceCol = (h: string): number | undefined | 'bad' => {
      const p = cellNumber(c(h));
      if (Number.isNaN(p) || (p ?? 0) < 0) return 'bad';
      return p && purFactor > 0 ? costPerBase({ baseUnit }, p / purFactor) : undefined;
    };
    const purchasePrice = priceCol('Purchase Price');
    const transferPrice = priceCol('Transfer Price');
    const reconciliationPrice = priceCol('Reconciliation price');
    if (purchasePrice === 'bad') return fail('Purchase Price is not a valid number.');
    if (transferPrice === 'bad') return fail('Transfer Price is not a valid number.');
    if (reconciliationPrice === 'bad') return fail('Reconciliation price is not a valid number.');

    /** A quantity in its own unit column (blank / unknown unit = consumption unit): [base qty, unit name]. */
    const qtyIn = (valueCol: string, unitCol: string): [number | undefined, string | undefined] => {
      const n = cellNumber(c(valueCol));
      if (n === undefined || Number.isNaN(n) || n <= 0) return [undefined, undefined];
      const typed = text(c(unitCol)) || consTyped;
      const unit = matchUnit(unitSource, typed) ?? matchUnit(unitSource, consTyped);
      return unit ? [toBase(unitSource, n, unit), unit] : [round3(n * consFactor), undefined];
    };
    const [restockLevel, restockUnit] = qtyIn('Minimum Stock Level', 'Minimum Stock Level Unit');
    const [parLevel, parUnit] = qtyIn('At Par Stock Level', 'At Par Stock Level Unit');
    const [openingStock] = qtyIn('Opening Stock', 'Opening Stock Unit');

    const num = (h: string) => {
      const n = cellNumber(c(h));
      return n !== undefined && !Number.isNaN(n) && n > 0 ? n : undefined;
    };
    const flag = (h: string) => (text(c(h)) ? yes(c(h)) : undefined);
    const activeCell = text(c('Active'));
    const isExpiry = flag('Is Expiry');
    const periods = text(c('Closing stock calculated on'))
      .split(',')
      .map((p) => CLOSING_PERIODS.find((x) => x.toLowerCase() === p.trim().toLowerCase()))
      .filter((p): p is (typeof CLOSING_PERIODS)[number] => !!p);
    const taxTyped = text(c('Tax Type'));

    inFile.add(key);
    ready.push({
      row,
      name,
      category: text(c('Category')) || 'General',
      baseUnit,
      purchaseUnit,
      otherPurchaseUnits: otherPurchaseUnits.length ? otherPurchaseUnits : undefined,
      openingStock: openingStock ?? 0,
      openingCost: purchasePrice ?? 0,
      purchasePrice,
      transferPrice,
      reconciliationPrice,
      restockLevel,
      restockUnit,
      parLevel,
      parUnit,
      favourite: yes(c('Set as Favourite')),
      active: activeCell ? yes(activeCell) : true,
      subCategory: text(c('Sub Category')) || undefined,
      description: text(c('Description')) || undefined,
      rank: num('Rank'),
      hsn: text(c('HSN')) || undefined,
      taxType: TAX_TYPES.find((t) => t.toLowerCase() === taxTyped.toLowerCase()) ?? (taxTyped || undefined),
      taxRate: num('Tax(%)'),
      exciseDuty: num('Excise Duty(in Amount)'),
      brand: text(c('Brand')) || undefined,
      shortCode: text(c('Barcode/Short Code')) || undefined,
      gtin: text(c('GTIN')) || undefined,
      normalLossPct: num('Normal loss(%)'),
      closingStockOn: periods.length ? periods : undefined,
      exclusive: flag('Exclusive to this restaurant'),
      isExpiry,
      shelfLifeDays: isExpiry ? num('Best Before (In Days)') : undefined,
      allowDecimal: flag('Allow Decimal Quantity'),
    });
  });

  return { ready, issues };
};

// ---------------------------------------------------------------------------
// recipes
// ---------------------------------------------------------------------------

export const RECIPE_COLUMNS: ImportColumn[] = [
  { header: 'Item Name', note: 'Menu item exactly as in Items (or its barcode)', required: true, width: 26 },
  { header: 'Add-on', note: 'Blank = the item itself. Else the add-on name', width: 20 },
  { header: 'Raw Material', note: 'Exactly as in Raw Materials', required: true, width: 24 },
  { header: 'Qty', note: 'Used for 1 portion', required: true, width: 10 },
  { header: 'Unit', note: 'GRM, KG, ML, LTR, PC… Blank = base unit', width: 14 },
];

export const RECIPE_EXAMPLE: (string | number)[][] = [
  ['Veg Burger', '', 'Burger Bun', 1, 'PC'],
  ['Veg Burger', '', 'Aloo Patty', 1, 'PC'],
  ['Veg Burger', '', 'Mayonnaise', 20, 'GRM'],
  ['Veg Burger', 'Extra Cheese', 'Cheese Slice', 1, 'PC'],
  ['Masala Chai', '', 'Milk', 120, 'ML'],
  ['Masala Chai', '', 'Tea Powder', 5, 'GRM'],
];

export interface RecipeImportItem {
  id: string;
  name: string;
  barcode?: string;
}

export interface RecipeImportContext {
  items: RecipeImportItem[];
  /** Add-on options the item offers (id + name). */
  addOnsOf: (itemId: string) => { id: string; name: string }[];
  rawMaterials: RawMaterial[];
  /** Saved recipes, by item id — parts the file doesn't mention are kept. */
  recipes: Map<string, Recipe>;
}

export interface RecipeImportResult {
  /** Full recipes to save (one per item touched), already merged with the saved ones. */
  recipes: Omit<Recipe, 'updatedAt'>[];
  issues: ImportIssue[];
  /** Ingredient lines accepted. */
  lineCount: number;
}

/**
 * Check every recipe row and build the recipes to save. For each item in the file,
 * the parts it lists (the item itself and/or named add-ons) are REPLACED by the file;
 * parts not listed keep their saved ingredients.
 */
export const parseRecipeRows = (rows: SheetRow[], ctx: RecipeImportContext): RecipeImportResult => {
  const issues: ImportIssue[] = [];

  const byName = new Map<string, RecipeImportItem[]>();
  const byBarcode = new Map<string, RecipeImportItem>();
  ctx.items.forEach((it) => {
    const k = it.name.trim().toLowerCase();
    byName.set(k, [...(byName.get(k) || []), it]);
    if (it.barcode?.trim()) byBarcode.set(it.barcode.trim().toLowerCase(), it);
  });
  const rmByName = new Map<string, RawMaterial[]>();
  ctx.rawMaterials.forEach((r) => {
    const k = r.name.trim().toLowerCase();
    rmByName.set(k, [...(rmByName.get(k) || []), r]);
  });

  // itemId -> part ('' = the item itself, else add-on option id) -> lines
  const parts = new Map<string, { item: RecipeImportItem; lines: Map<string, RecipeLine[]> }>();
  let lineCount = 0;

  rows.forEach(({ row, cells }) => {
    const c = (h: string) => cells[normHeader(h)];
    const itemTyped = text(c('Item Name'));
    const fail = (reason: string) => issues.push({ row, name: itemTyped || '(no item)', reason });

    if (!itemTyped) return fail('Item Name is empty.');
    const named = byName.get(itemTyped.toLowerCase()) || [];
    if (named.length > 1) return fail(`${named.length} items are named "${itemTyped}". Use the barcode instead.`);
    const item = named[0] ?? byBarcode.get(itemTyped.toLowerCase());
    if (!item) return fail(`No item "${itemTyped}" in Items.`);

    let partId = '';
    const addOnTyped = text(c('Add-on'));
    if (addOnTyped) {
      const opt = ctx.addOnsOf(item.id).find((o) => o.name.trim().toLowerCase() === addOnTyped.toLowerCase());
      if (!opt) return fail(`"${item.name}" has no add-on "${addOnTyped}".`);
      partId = opt.id;
    }

    const rmTyped = text(c('Raw Material'));
    if (!rmTyped) return fail('Raw Material is empty.');
    const rms = rmByName.get(rmTyped.toLowerCase()) || [];
    if (rms.length === 0) return fail(`No raw material "${rmTyped}". Import or add it first.`);
    if (rms.length > 1) return fail(`${rms.length} raw materials are named "${rmTyped}". Rename one first.`);
    const rm = rms[0];

    const qty = cellNumber(c('Qty'));
    if (qty === undefined) return fail('Qty is empty.');
    if (Number.isNaN(qty) || qty <= 0) return fail('Qty must be a number above 0.');

    const unitTyped = text(c('Unit'));
    const unit = unitTyped ? matchUnit(rm, unitTyped) : rm.baseUnit;
    if (!unit) return fail(`Unit "${unitTyped}" doesn't fit ${rm.name}. Use ${unitsOf(rm).map((u) => u.name).join(', ')}.`);

    const entry = parts.get(item.id) ?? { item, lines: new Map<string, RecipeLine[]>() };
    parts.set(item.id, entry);
    entry.lines.set(partId, [...(entry.lines.get(partId) || []), { rawMaterialId: rm.id, qty: round3(qty), unit }]);
    lineCount += 1;
  });

  const recipes: Omit<Recipe, 'updatedAt'>[] = [];
  parts.forEach(({ item, lines }, itemId) => {
    const saved = ctx.recipes.get(itemId);
    const addOnRecipes: Record<string, RecipeLine[]> = { ...(saved?.addOnRecipes || {}) };
    lines.forEach((l, partId) => {
      if (partId) addOnRecipes[partId] = l;
    });
    recipes.push({
      id: itemId,
      itemId,
      itemName: item.name,
      ingredients: lines.get('') ?? saved?.ingredients ?? [],
      addOnRecipes,
    });
  });

  return { recipes, issues, lineCount };
};

// ---------------------------------------------------------------------------
// reading a sheet (array-of-arrays from SheetJS)
// ---------------------------------------------------------------------------

/**
 * Turn a sheet's rows (as SheetJS `sheet_to_json(ws, { header: 1 })` gives them) into
 * `SheetRow`s. Finds the header row by its first column, skips the template's help row
 * and blank rows. Returns null when no header row is found.
 */
export const sheetRowsFromAoa = (aoa: unknown[][], columns: ImportColumn[]): SheetRow[] | null => {
  const first = normHeader(columns[0].header);
  const headerIdx = aoa.slice(0, 25).findIndex((r) => (r || []).some((v) => normHeader(v) === first));
  if (headerIdx < 0) return null;

  const headers = (aoa[headerIdx] || []).map(normHeader);
  const firstNote = columns[0].note.trim().toLowerCase();
  const out: SheetRow[] = [];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    if (!r.some((v) => text(v) !== '')) continue; // blank row
    const cells: Record<string, unknown> = {};
    headers.forEach((h, ci) => {
      if (h) cells[h] = r[ci];
    });
    if (text(cells[first]).toLowerCase() === firstNote) continue; // template help row
    out.push({ row: i + 1, cells });
  }
  return out;
};
