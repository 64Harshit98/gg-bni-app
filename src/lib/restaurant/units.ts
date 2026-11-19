import type { BaseUnit, PurchaseUnit } from './types';

export const BASE_UNITS: BaseUnit[] = ['GRM', 'ML', 'PC'];

export interface UnitDef {
  name: string;
  /** How many base units one of this unit is. */
  factor: number;
}

/** Built-in units that convert to each base unit. */
const FAMILY: Record<BaseUnit, UnitDef[]> = {
  GRM: [
    { name: 'GRM', factor: 1 },
    { name: 'KG', factor: 1000 },
  ],
  ML: [
    { name: 'ML', factor: 1 },
    { name: 'LTR', factor: 1000 },
  ],
  PC: [
    { name: 'PC', factor: 1 },
    { name: 'DOZEN', factor: 12 },
  ],
};

type UnitSource = { baseUnit: BaseUnit; purchaseUnit?: PurchaseUnit; otherPurchaseUnits?: PurchaseUnit[] };

const norm = (s: string) => s.trim().toLowerCase();

/** Every unit a quantity of this raw material can be entered in (built-in, packaging, other buying units). */
export const unitsOf = (rm: UnitSource): UnitDef[] => {
  const list = [...FAMILY[rm.baseUnit]];
  [rm.purchaseUnit, ...(rm.otherPurchaseUnits || [])].forEach((p) => {
    if (p && p.name.trim() && p.factor > 0 && !list.some((u) => norm(u.name) === norm(p.name))) {
      list.push({ name: p.name.trim(), factor: p.factor });
    }
  });
  return list;
};

/** Convert `qty` entered in `unitName` to base units. Unknown unit counts as base. */
export const toBase = (rm: UnitSource, qty: number, unitName?: string): number => {
  const q = Number(qty) || 0;
  if (!unitName) return q;
  const u = unitsOf(rm).find((x) => norm(x.name) === norm(unitName));
  return round3(q * (u ? u.factor : 1));
};

/** Convert base units to `unitName`. */
export const fromBase = (rm: UnitSource, baseQty: number, unitName?: string): number => {
  const q = Number(baseQty) || 0;
  if (!unitName) return q;
  const u = unitsOf(rm).find((x) => norm(x.name) === norm(unitName));
  return round3(q / (u && u.factor ? u.factor : 1));
};

export const round3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/** Costs are per gram / ml, so they need more precision than quantities (₹47.5/kg = 0.0475/g). */
export const round6 = (n: number) => Math.round((Number(n) || 0) * 1e6) / 1e6;

/** A price per `unitName` (e.g. ₹47.5 per KG) as rupees per ONE base unit, kept to 6 decimals. */
export const costPerBase = (rm: UnitSource, price: number, unitName?: string): number => {
  const p = Number(price) || 0;
  if (!unitName) return round6(p);
  const u = unitsOf(rm).find((x) => norm(x.name) === norm(unitName));
  return round6(p / (u && u.factor ? u.factor : 1));
};

const trim = (n: number) => String(round3(n));

/**
 * Human stock text. With a packaging unit: "1 pkt 5 PC". Otherwise the base
 * unit: "250 GRM". Negative stock keeps its sign.
 */
export const formatStock = (rm: UnitSource, baseQty: number): string => {
  const q = round3(baseQty);
  const sign = q < 0 ? '-' : '';
  const abs = Math.abs(q);
  const p = rm.purchaseUnit;
  if (p && p.factor > 1 && abs >= p.factor) {
    const whole = Math.floor(abs / p.factor);
    const rest = round3(abs - whole * p.factor);
    return rest > 0
      ? `${sign}${whole} ${p.name} ${trim(rest)} ${rm.baseUnit}`
      : `${sign}${whole} ${p.name}`;
  }
  return `${sign}${trim(abs)} ${rm.baseUnit}`;
};

/**
 * Rupees per ONE base unit to cost recipes and consumption with: the weighted average
 * cost once the material has been bought, otherwise the purchase price set on the
 * material (a new or imported material with no purchases yet still costs something).
 */
export const unitCostOf = (rm: { avgCost?: number; purchasePrice?: number }): number => {
  const avg = Number(rm.avgCost) || 0;
  if (avg > 0) return avg;
  const price = Number(rm.purchasePrice) || 0;
  return price > 0 ? price : 0;
};

/** Cost per packaging unit (or per base unit when there is none). */
export const costPerPurchaseUnit = (rm: UnitSource & { avgCost: number }): { cost: number; unit: string } => {
  const p = rm.purchaseUnit;
  return p && p.factor > 0
    ? { cost: round3(rm.avgCost * p.factor), unit: p.name }
    : { cost: round6(rm.avgCost), unit: rm.baseUnit };
};

/** The unit a purchase is normally entered in. */
export const defaultPurchaseUnitName = (rm: UnitSource): string => rm.purchaseUnit?.name?.trim() || rm.baseUnit;
