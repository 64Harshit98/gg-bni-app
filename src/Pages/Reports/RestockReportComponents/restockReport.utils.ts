// RestockReportComponents/restockReport.utils.ts
import type { Item, ItemGroup } from '../../../constants/models';
import { totalStock } from '../ItemReportComponents/itemIssues';

export type RestockStatus = 'out' | 'low';
export type RestockFilter = 'all' | RestockStatus;

export interface RestockRow {
  item: Item;
  id: string;
  name: string;
  /** Shown as the item's "ID" (its barcode). */
  barcode: string;
  unit: string;
  group: string;
  /** Shop + every godown — the same total the Item report shows. */
  stock: number;
  /** The item's restock level (restockQuantity on the Add item form). */
  level: number;
  /** How many to buy to get back to the restock level. Always positive. */
  orderQty: number;
  /** Purchase price, or null when the item has none. */
  unitCost: number | null;
  /** orderQty × unitCost, or null when the cost isn't known. */
  estCost: number | null;
  status: RestockStatus;
  /**
   * Stock is far below zero — almost always sales recorded without the
   * purchases behind them. Ordering the full gap would overbuy, so the user is
   * asked to count stock first and the row is never auto-selected.
   */
  looksWrong: boolean;
}

const UNASSIGNED_GROUP_NAME = 'Uncategorized';

// A negative stock this large compared with the restock level is treated as a
// counting/recording problem rather than real demand.
export const looksLikeWrongStock = (stock: number, level: number) =>
  stock < 0 && -stock > Math.max(50, level * 5);

export const buildRestockRows = (items: Item[], itemGroups: ItemGroup[]): RestockRow[] => {
  const groupName = (key?: string) =>
    itemGroups.find((g) => g.id === key || g.name === key)?.name || key || UNASSIGNED_GROUP_NAME;

  return items.flatMap((item) => {
    const stock = totalStock(item);
    const level = Math.max(0, Number(item.restockQuantity) || 0);
    // Below its restock level, or sold into negative stock (even with no level set).
    const needsRestock = stock < 0 || (level > 0 && stock < level);
    if (!needsRestock) return [];

    const orderQty = level - stock;
    const cost = Number(item.purchasePrice) || 0;
    return [{
      item,
      id: item.id || item.name,
      name: item.name,
      barcode: String(item.barcode || ''),
      unit: item.unit || 'pcs',
      group: groupName(item.itemGroupId),
      stock,
      level,
      orderQty,
      unitCost: cost > 0 ? cost : null,
      estCost: cost > 0 ? orderQty * cost : null,
      status: stock <= 0 ? 'out' : 'low',
      looksWrong: looksLikeWrongStock(stock, level),
    }];
  });
};

export const summarizeRestock = (rows: RestockRow[]) => ({
  total: rows.length,
  outOfStock: rows.filter((r) => r.status === 'out').length,
  lowStock: rows.filter((r) => r.status === 'low').length,
  estCost: rows.reduce((sum, r) => sum + (r.estCost ?? 0), 0),
  withoutCost: rows.filter((r) => r.estCost === null).length,
  looksWrong: rows.filter((r) => r.looksWrong),
});
