import {
  KITCHEN_ID,
  type RawMaterial,
  type StockLedgerEntry,
} from '../../../lib/restaurant/types';
import { fromBase, round3 } from '../../../lib/restaurant/units';

export type UnitMode = 'purchase' | 'base';

export interface StockSummaryRow {
  rawMaterial: RawMaterial;
  rawMaterialId: string;
  rawMaterialName: string;
  category: string;
  unitName: string;
  /** Opening (A) */
  opening: number;
  /** Purchase (B) */
  purchase: number;
  /** Excess (C) — includes excess, opening, return within range */
  excess: number;
  /** Total In = A + B + C */
  totalIn: number;
  /** Consumed (D) */
  consumed: number;
  /** Wastage (E) */
  wastage: number;
  /** Normal Loss (F) */
  normalLoss: number;
  /** Transfer (G) */
  transfer: number;
  /** Shortage (H) */
  shortage: number;
  /** Production (I) */
  production: number;
  /** Total Out = D + E + F + G + H */
  totalOut: number;
  /** Closing Stock = Opening + Purchase + Excess + Production - Total Out */
  closingStock: number;
}

export interface ComputeStockSummaryParams {
  rawMaterials: RawMaterial[];
  /** All ledger entries with date >= fromMs (as returned by fetchLedgerSince(companyId, fromMs)). */
  ledgerSinceFrom: StockLedgerEntry[];
  fromMs: number;
  toMs: number;
  /** '' or 'all' for all locations, KITCHEN_ID for kitchen, or a godown id. */
  locationId?: string;
  unitMode?: UnitMode;
}

/** Normalize -0 to 0 and round to 3 decimal places. */
export const r3 = (n: number): number => round3(n) || 0;

/** Format a numeric stock quantity to 3 decimal places ("0.000"). */
export const formatQty3 = (n: number): string => (Number(n) || 0).toFixed(3);

/**
 * Current stock of a raw material at a given location in BASE units.
 * - Kitchen (`KITCHEN_ID`): `rm.stock`
 * - Godown (`godownId`): `rm.godownStock?.[godownId]`
 * - All locations (`''` | `'all'` | undefined): `rm.stock + sum(rm.godownStock)`
 */
export const currentStockAtLocation = (rm: RawMaterial, locationId?: string): number => {
  if (!locationId || locationId === 'all') {
    const kitchen = Number(rm.stock) || 0;
    const godowns = Object.values(rm.godownStock || {}).reduce(
      (sum, val) => sum + (Number(val) || 0),
      0,
    );
    return r3(kitchen + godowns);
  }
  if (locationId === KITCHEN_ID) {
    return r3(Number(rm.stock) || 0);
  }
  return r3(Number(rm.godownStock?.[locationId]) || 0);
};

/** Display unit label for a raw material under the chosen UnitMode. */
export const getDisplayUnit = (rm: RawMaterial, unitMode: UnitMode): string => {
  if (unitMode === 'purchase' && rm.purchaseUnit?.name?.trim()) {
    return rm.purchaseUnit.name.trim();
  }
  return rm.baseUnit;
};

/** Convert a base-unit quantity to the target UnitMode quantity. */
export const convertUnitQty = (rm: RawMaterial, baseQty: number, unitMode: UnitMode): number => {
  if (unitMode === 'purchase' && rm.purchaseUnit?.name?.trim()) {
    return r3(fromBase(rm, baseQty, rm.purchaseUnit.name));
  }
  return r3(baseQty);
};

/**
 * Compute the Stock Summary row for a single RawMaterial.
 *
 * Mathematical invariant (in base units):
 *   Opening(fromMs) = current(L) - sum_{date >= fromMs} qty
 *   Closing(toMs)   = Opening + Purchase + Excess + Production - TotalOut
 *                   = current(L) - sum_{date > toMs} qty
 */
export const computeRawMaterialSummary = (
  rm: RawMaterial,
  ledgerSinceFrom: StockLedgerEntry[],
  fromMs: number,
  toMs: number,
  locationId = '',
  unitMode: UnitMode = 'purchase',
): StockSummaryRow => {
  const isAllLocations = !locationId || locationId === 'all';
  const currentBase = currentStockAtLocation(rm, locationId);

  // Filter rows belonging to this raw material and location with date >= fromMs
  const rmRows = ledgerSinceFrom.filter(
    (row) =>
      row.rawMaterialId === rm.id &&
      row.date >= fromMs &&
      (isAllLocations || row.locationId === locationId),
  );

  const sumSinceFrom = rmRows.reduce((sum, row) => sum + (Number(row.qty) || 0), 0);
  const openingBase = r3(currentBase - sumSinceFrom);

  let purchaseNet = 0;
  let excessNet = 0;
  let productionNet = 0;
  let consumedNet = 0;
  let wastageNet = 0;
  let lossNet = 0;
  let transferNet = 0;
  let shortageNet = 0;

  for (const row of rmRows) {
    if (row.date < fromMs || row.date > toMs) continue;
    const q = Number(row.qty) || 0;
    switch (row.type) {
      case 'purchase':
        purchaseNet += q;
        break;
      case 'excess':
      case 'opening':
      case 'return':
        excessNet += q;
        break;
      case 'production':
        productionNet += q;
        break;
      case 'consumed':
        consumedNet += q;
        break;
      case 'wastage':
        wastageNet += q;
        break;
      case 'loss':
        lossNet += q;
        break;
      case 'transfer':
        if (!isAllLocations) {
          transferNet += q;
        }
        break;
      case 'shortage':
        shortageNet += q;
        break;
    }
  }

  const purchaseBase = r3(purchaseNet);
  const excessBase = r3(excessNet);
  const productionBase = r3(productionNet);
  const consumedBase = r3(-consumedNet);
  const wastageBase = r3(-wastageNet);
  const normalLossBase = r3(-lossNet);
  const transferBase = isAllLocations ? 0 : r3(-transferNet);
  const shortageBase = r3(-shortageNet);

  const totalInBase = r3(openingBase + purchaseBase + excessBase);
  const totalOutBase = r3(
    consumedBase + wastageBase + normalLossBase + transferBase + shortageBase,
  );
  const closingStockBase = r3(totalInBase + productionBase - totalOutBase);

  const conv = (val: number) => convertUnitQty(rm, val, unitMode);

  return {
    rawMaterial: rm,
    rawMaterialId: rm.id,
    rawMaterialName: rm.name,
    category: rm.category,
    unitName: getDisplayUnit(rm, unitMode),
    opening: conv(openingBase),
    purchase: conv(purchaseBase),
    excess: conv(excessBase),
    totalIn: conv(totalInBase),
    consumed: conv(consumedBase),
    wastage: conv(wastageBase),
    normalLoss: conv(normalLossBase),
    transfer: conv(transferBase),
    shortage: conv(shortageBase),
    production: conv(productionBase),
    totalOut: conv(totalOutBase),
    closingStock: conv(closingStockBase),
  };
};

/** Compute Stock Summary rows for a list of raw materials. */
export const computeStockSummary = ({
  rawMaterials,
  ledgerSinceFrom,
  fromMs,
  toMs,
  locationId = '',
  unitMode = 'purchase',
}: ComputeStockSummaryParams): StockSummaryRow[] =>
  rawMaterials.map((rm) =>
    computeRawMaterialSummary(rm, ledgerSinceFrom, fromMs, toMs, locationId, unitMode),
  );
