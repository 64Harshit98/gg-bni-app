import type { ConsumptionLine, RawMaterial, Recipe, RecipeLine } from './types';
import { round3, round6, toBase, unitCostOf } from './units';

/** The parts of a cart / bill line the recipe maths needs. */
export interface ConsumptionLineInput {
  productId?: string;
  id?: string;
  quantity?: number;
  tierQuantity?: number;
  isCustomAmount?: boolean;
  /** Chosen add-ons (only the id is needed). */
  addOns?: { id: string }[];
  /** Set on cart lines loaded from a saved bill (edit mode): the quantity the bill had. */
  _origQuantity?: number;
  /** What the saved bill line consumed (edit mode). */
  rawConsumption?: ConsumptionLine[] | null;
}

const ingredientsToLines = (
  lines: RecipeLine[] | undefined,
  multiplier: number,
  raw: Map<string, RawMaterial>,
  into: Map<string, ConsumptionLine>,
) => {
  (lines ?? []).forEach((l) => {
    const rm = raw.get(l.rawMaterialId);
    if (!rm) return; // ingredient was deleted: skip rather than block the bill
    const qty = toBase(rm, l.qty, l.unit) * multiplier;
    if (!qty) return;
    const prev = into.get(rm.id);
    if (prev) prev.qty = round3(prev.qty + qty);
    else into.set(rm.id, { rawMaterialId: rm.id, name: rm.name, qty: round3(qty), unit: rm.baseUnit, unitCost: unitCostOf(rm) });
  });
};

/**
 * Raw materials ONE bill line takes: the item's recipe plus each chosen add-on's
 * recipe, times the quantity sold. An item without a recipe uses nothing.
 */
export const buildLineConsumption = (
  line: ConsumptionLineInput,
  recipes: Map<string, Recipe>,
  raw: Map<string, RawMaterial>,
): ConsumptionLine[] => {
  if (line.isCustomAmount) return [];
  const itemId = line.productId || line.id;
  const recipe = itemId ? recipes.get(itemId) : undefined;
  if (!recipe) return [];
  const mult = (Number(line.quantity) || 1) * (Number(line.tierQuantity) || 1);
  const out = new Map<string, ConsumptionLine>();
  ingredientsToLines(recipe.ingredients, mult, raw, out);
  const addOnMult = Number(line.quantity) || 1;
  (line.addOns ?? []).forEach((a) => ingredientsToLines(recipe.addOnRecipes?.[a.id], addOnMult, raw, out));
  return [...out.values()];
};

/**
 * Consumption of one CART line, edit mode included.
 * A line loaded from the saved bill (has `_origQuantity`) and whose add-ons were not
 * re-picked uses the bill's own snapshot, scaled to the new quantity. A loaded line with
 * no snapshot (bill saved before restaurant mode, or the item had no recipe then) uses
 * nothing, so editing an old bill never deducts a whole recipe. New lines use the recipe.
 */
export const cartLineConsumption = (
  line: ConsumptionLineInput,
  recipes: Map<string, Recipe>,
  raw: Map<string, RawMaterial>,
): ConsumptionLine[] => {
  const loaded = line._origQuantity !== undefined && line._origQuantity !== null;
  if (loaded && !line.addOns?.length) {
    const snap = Array.isArray(line.rawConsumption) ? line.rawConsumption : [];
    if (!snap.length) return [];
    const origQty = Number(line._origQuantity) || 1;
    const ratio = (Number(line.quantity) || 1) / origQty;
    return snap.map((c) => ({ ...c, qty: round3((Number(c.qty) || 0) * ratio) }));
  }
  return buildLineConsumption(line, recipes, raw);
};

/** Sum several lines' consumption into one map rawMaterialId -> base qty. */
export const totalConsumption = (perLine: (ConsumptionLine[] | undefined)[]): Map<string, number> => {
  const total = new Map<string, number>();
  perLine.forEach((lines) =>
    (lines ?? []).forEach((c) => total.set(c.rawMaterialId, round3((total.get(c.rawMaterialId) || 0) + c.qty))),
  );
  return total;
};

/** new - old per raw material (positive = this edit uses more). Zero differences are dropped. */
export const diffConsumption = (oldTotal: Map<string, number>, newTotal: Map<string, number>): Map<string, number> => {
  const out = new Map<string, number>();
  new Set([...oldTotal.keys(), ...newTotal.keys()]).forEach((id) => {
    const d = round3((newTotal.get(id) || 0) - (oldTotal.get(id) || 0));
    if (d !== 0) out.set(id, d);
  });
  return out;
};

/** Raw materials a bill would take beyond kitchen stock: [{name, need, have}] in base units. */
export const shortfalls = (
  needs: Map<string, number>,
  raw: Map<string, RawMaterial>,
  /** Quantity this same bill already took (edit mode), added back before checking. */
  alreadyTaken: Map<string, number> = new Map(),
): { rawMaterialId: string; name: string; need: number; have: number; unit: string }[] => {
  const out: { rawMaterialId: string; name: string; need: number; have: number; unit: string }[] = [];
  needs.forEach((need, id) => {
    const rm = raw.get(id);
    if (!rm) return;
    const have = round3((rm.stock || 0) + (alreadyTaken.get(id) || 0));
    if (have < need) out.push({ rawMaterialId: id, name: rm.name, need, have, unit: rm.baseUnit });
  });
  return out;
};

/** How many portions the current kitchen stock can still make from a recipe (Infinity when it has no ingredients). */
export const portionsLeft = (ingredients: RecipeLine[], raw: Map<string, RawMaterial>): number => {
  let min = Infinity;
  ingredients.forEach((l) => {
    const rm = raw.get(l.rawMaterialId);
    if (!rm) return;
    const per = toBase(rm, l.qty, l.unit);
    // round first: float sums like 0.30000000000000004 / 0.1 must give 3, not 2
    if (per > 0) min = Math.min(min, Math.floor(round3((rm.stock || 0) / per)));
  });
  return min;
};

/** Cost of one portion of a recipe, rupees. */
export const recipeCost = (ingredients: RecipeLine[], raw: Map<string, RawMaterial>): number =>
  round6(
    ingredients.reduce((sum, l) => {
      const rm = raw.get(l.rawMaterialId);
      return rm ? sum + toBase(rm, l.qty, l.unit) * unitCostOf(rm) : sum;
    }, 0),
  );
