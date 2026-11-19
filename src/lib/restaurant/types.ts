// Restaurant mode: raw-material inventory, recipes and the stock ledger.
//
// Everything is stored in BASE units (GRM / ML / PC). Display and entry units
// (KG, LTR, pkt, case ...) are converted by ./units.ts.

/** Value of the signup "business category" that turns restaurant mode on. */
export const RESTAURANT_CATEGORY = 'Restaurant';

/** Plans that can run restaurant mode (subscription `pack` values, see PLANS in src/enums). */
export const RESTAURANT_PLANS = ['pos_pro', 'enterprise'] as const;

/** True when this subscription pack may use restaurant mode. */
export const planAllowsRestaurant = (pack?: string | null): boolean =>
  (RESTAURANT_PLANS as readonly string[]).includes(String(pack || '').toLowerCase());

/** Pseudo location id for the shop / kitchen stock (what billing deducts from). */
export const KITCHEN_ID = '__shop__'; // same value as SHOP_ID in useStockTransfer
export const KITCHEN_NAME = 'Kitchen';

export type BaseUnit = 'GRM' | 'ML' | 'PC';

/** A packaging unit: 1 `name` = `factor` base units (e.g. 1 pkt = 20 PC). */
export interface PurchaseUnit {
  name: string;
  factor: number;
}

export const TAX_TYPES = ['GST', 'VAT', 'None'] as const;
export const CLOSING_PERIODS = ['Daily', 'Weekly', 'Monthly'] as const;

/**
 * Optional master details — every column of the raw-material import file (the same set
 * Petpooja keeps). Filled by the create / edit form or an Excel import.
 * Prices are rupees per ONE BASE unit, like `avgCost`.
 */
export interface RawMaterialDetails {
  subCategory?: string;
  brand?: string;
  /** Barcode or short code typed at entry / search. */
  shortCode?: string;
  gtin?: string;
  description?: string;
  /** Sort order in lists (lower first). */
  rank?: number;
  hsn?: string;
  /** 'GST' | 'VAT' | 'None'. */
  taxType?: string;
  /** Tax %. */
  taxRate?: number;
  /** Excise duty, rupees per purchase. */
  exciseDuty?: number;
  /** Standard purchase price, ₹ per base unit (the average cost moves with purchases). */
  purchasePrice?: number;
  /** Price when transferred to another outlet, ₹ per base unit. */
  transferPrice?: number;
  /** Price used to value stock differences at reconciliation, ₹ per base unit. */
  reconciliationPrice?: number;
  /** Extra buying units besides `purchaseUnit`, e.g. 1 case = 24 PC. */
  otherPurchaseUnits?: PurchaseUnit[];
  /** "At par" target stock, base units (restock up to this). */
  parLevel?: number;
  /** Units the min / par levels were entered in (for showing them back the same way). */
  restockUnit?: string;
  parUnit?: string;
  /** Expected normal loss, % of consumption. */
  normalLossPct?: number;
  /** When closing stock is counted: any of Daily / Weekly / Monthly. */
  closingStockOn?: string[];
  /** Only this outlet uses it. */
  exclusive?: boolean;
  /** Has an expiry. `shelfLifeDays` = best before, days from receipt. */
  isExpiry?: boolean;
  shelfLifeDays?: number;
  /** Quantities may have decimals (e.g. 1.5 KG). */
  allowDecimal?: boolean;
}

export interface RawMaterial extends RawMaterialDetails {
  id: string;
  name: string;
  category: string;
  baseUnit: BaseUnit;
  purchaseUnit?: PurchaseUnit;
  /** Kitchen stock, base units. Billing deducts from this. */
  stock: number;
  /** Stock held in godowns, base units, keyed by godown id. */
  godownStock?: Record<string, number>;
  /** Weighted average cost, rupees per ONE BASE unit. */
  avgCost: number;
  /** Alert level, base units. */
  restockLevel?: number;
  active: boolean;
  favourite?: boolean;
  createdAt?: number;
  updatedAt?: unknown;
}

/** One ingredient of a recipe. `unit` is the unit name the user typed qty in. */
export interface RecipeLine {
  rawMaterialId: string;
  qty: number;
  unit: string;
}

export interface Recipe {
  /** Doc id == itemId. */
  id: string;
  itemId: string;
  itemName: string;
  ingredients: RecipeLine[];
  /** Per add-on option id (AddOnOption.id) -> ingredients one add-on uses. */
  addOnRecipes: Record<string, RecipeLine[]>;
  updatedAt?: unknown;
}

/** What a bill line used, in base units. Saved on the invoice line as `rawConsumption`. */
export interface ConsumptionLine {
  rawMaterialId: string;
  name: string;
  qty: number;
  unit: BaseUnit;
  /** Rupees per base unit at the time of the sale (for food-cost reports). */
  unitCost: number;
}

export type StockMovementType =
  | 'opening'
  | 'purchase'
  | 'excess'
  | 'consumed'
  | 'wastage'
  | 'loss' // normal loss
  | 'shortage'
  | 'transfer'
  | 'production'
  | 'return';

export const MOVEMENT_LABEL: Record<StockMovementType, string> = {
  opening: 'Opening',
  purchase: 'Purchase',
  excess: 'Excess',
  consumed: 'Consumed',
  wastage: 'Wastage',
  loss: 'Normal loss',
  shortage: 'Shortage',
  transfer: 'Transfer',
  production: 'Production',
  return: 'Return',
};

/** One row of `companies/{id}/stockLedger`. `qty` is signed: the effect on that location's stock. */
export interface StockLedgerEntry {
  id?: string;
  rawMaterialId: string;
  rawMaterialName: string;
  type: StockMovementType;
  qty: number;
  /** KITCHEN_ID or a godown id. */
  locationId: string;
  locationName?: string;
  /** Business date, ms. */
  date: number;
  refType?: 'sale' | 'purchase' | 'manual';
  refId?: string;
  refNo?: string;
  /** Rupees per base unit. */
  unitCost?: number;
  note?: string;
  createdAt?: number;
}

export interface RawMaterialCategory {
  id: string;
  name: string;
}

export const COL = {
  rawMaterials: 'rawMaterials',
  categories: 'rawMaterialCategories',
  recipes: 'recipes',
  ledger: 'stockLedger',
} as const;
