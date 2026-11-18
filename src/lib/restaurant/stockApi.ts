import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '../Firebase';
import {
  COL,
  KITCHEN_ID,
  type BaseUnit,
  type PurchaseUnit,
  type RawMaterial,
  type RawMaterialDetails,
  type Recipe,
  type StockLedgerEntry,
  type StockMovementType,
} from './types';
import { round3, round6 } from './units';

// ---------------------------------------------------------------------------
// refs
// ---------------------------------------------------------------------------
export const rawMaterialRef = (companyId: string, id: string) => doc(db, 'companies', companyId, COL.rawMaterials, id);
export const ledgerCol = (companyId: string) => collection(db, 'companies', companyId, COL.ledger);

/** Firestore field that holds a location's stock on a raw material doc. */
export const stockField = (locationId: string) => (locationId === KITCHEN_ID ? 'stock' : `godownStock.${locationId}`);

/** What `tx.set` / `tx.update` / `batch.set` / `batch.update` all look like. */
type Writer = {
  set: (ref: DocumentReference, data: any) => unknown;
  update: (ref: DocumentReference, data: any) => unknown;
};

const clean = <T extends Record<string, any>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

// ---------------------------------------------------------------------------
// stock movements
// ---------------------------------------------------------------------------
export interface MovementInput {
  rawMaterialId: string;
  rawMaterialName: string;
  type: StockMovementType;
  /** Signed, base units: the effect on `locationId`'s stock. */
  qty: number;
  locationId: string;
  locationName?: string;
  /** Business date (ms). Defaults to now. */
  date?: number;
  refType?: StockLedgerEntry['refType'];
  refId?: string;
  refNo?: string;
  unitCost?: number;
  note?: string;
}

/**
 * Queue one stock change: increment the raw material and add a ledger row.
 * Needs no reads, so it is safe to call after the transaction's reads.
 */
export const queueMovement = (writer: Writer, companyId: string, m: MovementInput, newAvgCost?: number) => {
  if (!m.qty) return;
  const patch: Record<string, unknown> = {
    [stockField(m.locationId)]: increment(round3(m.qty)),
    updatedAt: serverTimestamp(),
  };
  if (newAvgCost !== undefined) patch.avgCost = newAvgCost;
  writer.update(rawMaterialRef(companyId, m.rawMaterialId), patch);
  const row: StockLedgerEntry = clean({
    rawMaterialId: m.rawMaterialId,
    rawMaterialName: m.rawMaterialName,
    type: m.type,
    qty: round3(m.qty),
    locationId: m.locationId,
    locationName: m.locationName,
    date: m.date ?? Date.now(),
    refType: m.refType ?? 'manual',
    refId: m.refId,
    refNo: m.refNo,
    unitCost: m.unitCost,
    note: m.note,
    createdAt: Date.now(),
  });
  writer.set(doc(ledgerCol(companyId)), row);
};

const totalStockOf = (rm: Partial<RawMaterial>) =>
  (Number(rm.stock) || 0) + Object.values(rm.godownStock || {}).reduce((s, n) => s + (Number(n) || 0), 0);

/** Weighted average cost after receiving `qty` base units at `unitCost` per base unit. */
export const nextAvgCost = (rm: Partial<RawMaterial>, qty: number, unitCost: number) => {
  const have = Math.max(0, totalStockOf(rm));
  const cost = Number(rm.avgCost) || 0;
  if (qty <= 0 || unitCost <= 0) return cost;
  if (have <= 0) return round6(unitCost);
  return round6((have * cost + qty * unitCost) / (have + qty));
};

/**
 * Undo one receipt's effect on the weighted average (used when a purchase is edited or
 * deleted): take `qty` base units at `unitCost` back out of `rm`'s stock and value.
 * Keeps the current average when nothing sensible is left (stock already used up).
 */
export const avgCostWithout = (rm: Partial<RawMaterial>, qty: number, unitCost: number) => {
  const have = totalStockOf(rm);
  const cost = Number(rm.avgCost) || 0;
  if (qty <= 0 || unitCost <= 0) return cost;
  const left = have - qty;
  if (left <= 0) return cost;
  const value = have * cost - qty * unitCost;
  return value > 0 ? round6(value / left) : cost;
};

/**
 * Apply stock movements in one transaction (manual entries: wastage, excess,
 * shortage, normal loss). Purchases pass `unitCost` and refresh the average cost.
 */
export const applyMovements = async (companyId: string, movements: MovementInput[]) => {
  const list = movements.filter((m) => m.qty);
  if (!list.length) return;
  await runTransaction(db, async (tx) => {
    // reads first
    const ids = [...new Set(list.map((m) => m.rawMaterialId))];
    const snaps = new Map<string, RawMaterial>();
    await Promise.all(
      ids.map(async (id) => {
        const s = await tx.get(rawMaterialRef(companyId, id));
        if (!s.exists()) throw new Error('A raw material in this entry no longer exists.');
        snaps.set(id, { id, ...(s.data() as Omit<RawMaterial, 'id'>) });
      }),
    );
    // average cost per raw material, folding every purchase line in order
    const running = new Map<string, Partial<RawMaterial>>(ids.map((id) => [id, { ...snaps.get(id)! }]));
    list.forEach((m) => {
      const rm = running.get(m.rawMaterialId)!;
      let avg: number | undefined;
      if (m.type === 'purchase' && m.qty > 0 && m.unitCost) {
        avg = nextAvgCost(rm, m.qty, m.unitCost);
        rm.avgCost = avg;
      }
      // keep the running copy's stock in step so later lines average correctly
      if (m.locationId === KITCHEN_ID) rm.stock = (Number(rm.stock) || 0) + m.qty;
      else rm.godownStock = { ...(rm.godownStock || {}), [m.locationId]: (Number(rm.godownStock?.[m.locationId]) || 0) + m.qty };
      queueMovement(tx, companyId, m, avg);
    });
  });
};

export interface TransferInput {
  items: { rawMaterialId: string; rawMaterialName: string; qty: number }[]; // base units, > 0
  from: { id: string; name: string };
  to: { id: string; name: string };
  date?: number;
  note?: string;
}

/** Move stock between the kitchen and godowns (or between godowns). Never goes below zero. */
export const transferRawMaterials = async (companyId: string, t: TransferInput) => {
  if (t.from.id === t.to.id) throw new Error('Source and destination cannot be the same.');
  if (!t.items.length) throw new Error('Add at least one raw material.');
  await runTransaction(db, async (tx) => {
    const snaps = await Promise.all(t.items.map((i) => tx.get(rawMaterialRef(companyId, i.rawMaterialId))));
    snaps.forEach((s, idx) => {
      const it = t.items[idx];
      if (!s.exists()) throw new Error(`${it.rawMaterialName} no longer exists.`);
      const data = s.data() as RawMaterial;
      const have = t.from.id === KITCHEN_ID ? Number(data.stock) || 0 : Number(data.godownStock?.[t.from.id]) || 0;
      if (have < it.qty) throw new Error(`Not enough ${it.rawMaterialName} in ${t.from.name} (have ${round3(have)}).`);
    });
    t.items.forEach((it) => {
      const base = {
        rawMaterialId: it.rawMaterialId,
        rawMaterialName: it.rawMaterialName,
        type: 'transfer' as const,
        date: t.date,
        note: t.note,
      };
      queueMovement(tx, companyId, { ...base, qty: -it.qty, locationId: t.from.id, locationName: t.from.name });
      queueMovement(tx, companyId, { ...base, qty: it.qty, locationId: t.to.id, locationName: t.to.name });
    });
  });
};

// ---------------------------------------------------------------------------
// raw materials
// ---------------------------------------------------------------------------
/** Trimmed / rounded optional details; blank and zero values are left out. */
export const cleanDetails = (d: RawMaterialDetails): RawMaterialDetails => {
  const s = (v?: string) => (v && String(v).trim()) || undefined;
  const pos = (v?: number) => (Number(v) > 0 ? round3(Number(v)) : undefined);
  const price = (v?: number) => (Number(v) > 0 ? round6(Number(v)) : undefined);
  const flag = (v?: boolean) => (v === undefined ? undefined : !!v);
  const units = (d.otherPurchaseUnits || [])
    .filter((u) => u && u.name?.trim() && Number(u.factor) > 0)
    .map((u) => ({ name: u.name.trim(), factor: round3(Number(u.factor)) }));
  const periods = (d.closingStockOn || []).filter(Boolean);
  return clean({
    subCategory: s(d.subCategory),
    brand: s(d.brand),
    shortCode: s(d.shortCode),
    gtin: s(d.gtin),
    description: s(d.description),
    rank: pos(d.rank),
    hsn: s(d.hsn),
    taxType: s(d.taxType),
    taxRate: pos(d.taxRate),
    exciseDuty: pos(d.exciseDuty),
    purchasePrice: price(d.purchasePrice),
    transferPrice: price(d.transferPrice),
    reconciliationPrice: price(d.reconciliationPrice),
    otherPurchaseUnits: units.length ? units : undefined,
    parLevel: pos(d.parLevel),
    restockUnit: s(d.restockUnit),
    parUnit: s(d.parUnit),
    normalLossPct: pos(d.normalLossPct),
    closingStockOn: periods.length ? periods : undefined,
    exclusive: flag(d.exclusive),
    isExpiry: flag(d.isExpiry),
    shelfLifeDays: Number(d.shelfLifeDays) > 0 ? Math.round(Number(d.shelfLifeDays)) : undefined,
    allowDecimal: flag(d.allowDecimal),
  });
};

export interface RawMaterialInput extends RawMaterialDetails {
  /** Defaults to true. */
  active?: boolean;
  name: string;
  category: string;
  baseUnit: BaseUnit;
  purchaseUnit?: PurchaseUnit;
  openingStock?: number; // base units, kitchen
  openingCost?: number; // rupees per base unit
  restockLevel?: number;
  favourite?: boolean;
}

export const createRawMaterial = async (companyId: string, input: RawMaterialInput): Promise<string> => {
  const ref = doc(collection(db, 'companies', companyId, COL.rawMaterials));
  const opening = round3(Number(input.openingStock) || 0);
  const data = clean({
    name: input.name.trim(),
    category: input.category.trim() || 'General',
    baseUnit: input.baseUnit,
    purchaseUnit: input.purchaseUnit && input.purchaseUnit.factor > 0 && input.purchaseUnit.name.trim() ? input.purchaseUnit : undefined,
    stock: 0,
    godownStock: {},
    avgCost: round6(Number(input.openingCost) || 0),
    restockLevel: input.restockLevel ? round3(input.restockLevel) : undefined,
    active: input.active !== false,
    favourite: !!input.favourite,
    ...cleanDetails(input),
    createdAt: Date.now(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(ref, data);
  if (opening) {
    await applyMovements(companyId, [
      {
        rawMaterialId: ref.id,
        rawMaterialName: data.name,
        type: 'opening',
        qty: opening,
        locationId: KITCHEN_ID,
        locationName: 'Kitchen',
        unitCost: data.avgCost || undefined,
        note: 'Opening stock',
      },
    ]);
  }
  return ref.id;
};

/** Rows per Firestore batch: each raw material is up to 3 writes (doc, stock update, ledger row). */
const IMPORT_CHUNK = 150;

/**
 * Create many raw materials at once (Excel import). Same docs as `createRawMaterial`,
 * written in batches; opening stock goes through the ledger like a single add.
 * `onProgress` gets the number saved so far.
 */
export const importRawMaterials = async (
  companyId: string,
  rows: RawMaterialInput[],
  onProgress?: (done: number) => void,
): Promise<number> => {
  // new categories first (merge: an existing one is untouched)
  const cats = [...new Set(rows.map((r) => r.category.trim() || 'General'))];
  for (let i = 0; i < cats.length; i += 400) {
    const b = writeBatch(db);
    cats.slice(i, i + 400).forEach((name) =>
      b.set(doc(db, 'companies', companyId, COL.categories, encodeURIComponent(name.toLowerCase())), { name }, { merge: true }),
    );
    await b.commit();
  }

  let done = 0;
  for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
    const batch = writeBatch(db);
    rows.slice(i, i + IMPORT_CHUNK).forEach((input) => {
      const ref = doc(collection(db, 'companies', companyId, COL.rawMaterials));
      const name = input.name.trim();
      const avgCost = round6(Number(input.openingCost) || 0);
      batch.set(
        ref,
        clean({
          name,
          category: input.category.trim() || 'General',
          baseUnit: input.baseUnit,
          purchaseUnit: input.purchaseUnit && input.purchaseUnit.factor > 0 && input.purchaseUnit.name.trim() ? input.purchaseUnit : undefined,
          stock: 0,
          godownStock: {},
          avgCost,
          restockLevel: input.restockLevel ? round3(input.restockLevel) : undefined,
          active: input.active !== false,
          favourite: !!input.favourite,
          ...cleanDetails(input),
          createdAt: Date.now(),
          updatedAt: serverTimestamp(),
        }),
      );
      const opening = round3(Number(input.openingStock) || 0);
      if (opening > 0) {
        queueMovement(batch, companyId, {
          rawMaterialId: ref.id,
          rawMaterialName: name,
          type: 'opening',
          qty: opening,
          locationId: KITCHEN_ID,
          locationName: 'Kitchen',
          unitCost: avgCost || undefined,
          note: 'Opening stock (Excel import)',
        });
      }
    });
    await batch.commit();
    done = Math.min(rows.length, i + IMPORT_CHUNK);
    onProgress?.(done);
  }
  return done;
};

export const updateRawMaterial = async (companyId: string, id: string, patch: Partial<Omit<RawMaterial, 'id'>>) => {
  await updateDoc(rawMaterialRef(companyId, id), { ...clean(patch as Record<string, any>), updatedAt: serverTimestamp() });
};

export const deleteRawMaterial = async (companyId: string, id: string) => {
  await deleteDoc(rawMaterialRef(companyId, id));
};

/** The first recipe (item or add-on part) that uses this raw material, if any. */
export const recipeUsingRawMaterial = (recipes: Recipe[], id: string): Recipe | undefined =>
  recipes.find(
    (r) =>
      (r.ingredients || []).some((l) => l.rawMaterialId === id) ||
      Object.values(r.addOnRecipes || {}).some((lines) => (lines || []).some((l) => l.rawMaterialId === id)),
  );

/**
 * Why this raw material must not be deleted, or null when it is safe.
 * Bills, purchases and the stock ledger point at it by id — deleting it would make those
 * bills fail to edit / return / delete. Such materials should be marked inactive instead.
 */
export const rawMaterialDeleteBlocker = async (
  companyId: string,
  id: string,
  recipes: Recipe[],
): Promise<string | null> => {
  const recipe = recipeUsingRawMaterial(recipes, id);
  if (recipe) return `it is used in the recipe of "${recipe.itemName}"`;
  const history = await getDocs(query(ledgerCol(companyId), where('rawMaterialId', '==', id), limit(1)));
  if (!history.empty) return 'it has stock history (purchases, sales or adjustments)';
  return null;
};

export const addRawMaterialCategory = async (companyId: string, name: string) => {
  const clean_ = name.trim();
  if (!clean_) return;
  const id = encodeURIComponent(clean_.toLowerCase());
  await setDoc(doc(db, 'companies', companyId, COL.categories, id), { name: clean_ }, { merge: true });
};

// ---------------------------------------------------------------------------
// recipes
// ---------------------------------------------------------------------------
export const saveRecipe = async (companyId: string, recipe: Omit<Recipe, 'updatedAt'>) => {
  const ingredients = recipe.ingredients.filter((l) => l.rawMaterialId && Number(l.qty) > 0);
  const addOnRecipes: Recipe['addOnRecipes'] = {};
  Object.entries(recipe.addOnRecipes || {}).forEach(([optionId, lines]) => {
    const kept = lines.filter((l) => l.rawMaterialId && Number(l.qty) > 0);
    if (kept.length) addOnRecipes[optionId] = kept;
  });
  await setDoc(doc(db, 'companies', companyId, COL.recipes, recipe.itemId), {
    itemId: recipe.itemId,
    itemName: recipe.itemName,
    ingredients,
    addOnRecipes,
    updatedAt: serverTimestamp(),
  });
};

/** Save many recipes at once (Excel import), 400 per batch. Same doc shape as `saveRecipe`. */
export const saveRecipesBulk = async (
  companyId: string,
  recipes: Omit<Recipe, 'updatedAt'>[],
  onProgress?: (done: number) => void,
): Promise<number> => {
  const keep = (lines: Recipe['ingredients']) => (lines || []).filter((l) => l.rawMaterialId && Number(l.qty) > 0);
  let done = 0;
  for (let i = 0; i < recipes.length; i += 400) {
    const batch = writeBatch(db);
    recipes.slice(i, i + 400).forEach((r) => {
      const addOnRecipes: Recipe['addOnRecipes'] = {};
      Object.entries(r.addOnRecipes || {}).forEach(([optionId, lines]) => {
        const kept = keep(lines);
        if (kept.length) addOnRecipes[optionId] = kept;
      });
      batch.set(doc(db, 'companies', companyId, COL.recipes, r.itemId), {
        itemId: r.itemId,
        itemName: r.itemName,
        ingredients: keep(r.ingredients),
        addOnRecipes,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    done = Math.min(recipes.length, i + 400);
    onProgress?.(done);
  }
  return done;
};

export const deleteRecipe = async (companyId: string, itemId: string) => {
  await deleteDoc(doc(db, 'companies', companyId, COL.recipes, itemId));
};

// ---------------------------------------------------------------------------
// ledger reads
// ---------------------------------------------------------------------------
/** Every ledger row from `startMs` onward. Reports derive opening/closing from this plus current stock. */
export const fetchLedgerSince = async (companyId: string, startMs: number): Promise<StockLedgerEntry[]> => {
  const snap = await getDocs(query(ledgerCol(companyId), where('date', '>=', startMs)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as StockLedgerEntry) }));
};
