import type { Item } from '../../../constants/models';

// Data problems that make the item / P&L reports wrong. Shared by the Item
// reports hub (counts) and the Item report (filtered view).
export type ItemIssue = 'negativeStock' | 'noMrp' | 'noCost';

export const ITEM_ISSUES: { value: ItemIssue; label: string }[] = [
  { value: 'negativeStock', label: 'Negative stock' },
  { value: 'noMrp', label: 'No MRP' },
  { value: 'noCost', label: 'No cost price' },
];

export const isItemIssue = (value: unknown): value is ItemIssue =>
  ITEM_ISSUES.some((i) => i.value === value);

// Shop stock plus every godown — the same total the Item report shows.
export const totalStock = (item: Pick<Item, 'stock' | 'godownStock'>) =>
  (Number(item.stock) || 0) +
  Object.values(item.godownStock || {}).reduce((sum, qty) => sum + (Number(qty) || 0), 0);

export const hasItemIssue = (
  item: Pick<Item, 'mrp' | 'purchasePrice'>,
  issue: ItemIssue,
  stock: number,
) => {
  if (issue === 'negativeStock') return stock < 0;
  if (issue === 'noMrp') return !(Number(item.mrp) > 0);
  return !(Number(item.purchasePrice) > 0);
};

// Same formula as the Item report's "Avg. Margin %" card: average sale price
// (avg MRP less avg discount) against average cost.
export const averageMarginPercent = (items: Pick<Item, 'mrp' | 'purchasePrice' | 'discount'>[]) => {
  if (items.length === 0) return 0;
  const avg = (pick: (i: (typeof items)[number]) => number) =>
    items.reduce((sum, i) => sum + (pick(i) || 0), 0) / items.length;
  const avgSale = avg((i) => i.mrp) * (1 - avg((i) => i.discount ?? 0) / 100);
  const avgCost = avg((i) => i.purchasePrice);
  return avgSale > 0 ? ((avgSale - avgCost) / avgSale) * 100 : 0;
};
