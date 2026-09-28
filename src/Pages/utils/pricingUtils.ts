import type { Item, PriceTier } from '../../constants/models';

export interface EffectivePriceInfo {
  mrp: number;
  salePrice: number;
  discountPercent: number;
  hasDiscount: boolean;
  hasBothPrices: boolean;
}

// Same logic that was copy-pasted in SharedProduct.tsx, MyShop.tsx, ItemDetailDrawer.tsx, Sales.tsx
// Works for both a full Item and a single PriceTier (both have mrp/salesPrice/discount shape)
export const getEffectivePriceInfo = (
  source: { mrp?: number; salesPrice?: number; discount?: number }
): EffectivePriceInfo => {
  const mrp = Number(source.mrp || 0);
  const itemSalesPrice = Number(source.salesPrice || 0);
  const presetDiscount = Number(source.discount || 0);

  let salePrice = 0;
  let calculatedDiscount = 0;

  if (mrp > 0 && itemSalesPrice > 0) {
    salePrice = itemSalesPrice;
    calculatedDiscount = ((mrp - itemSalesPrice) / mrp) * 100;
  } else if (itemSalesPrice > 0) {
    calculatedDiscount = presetDiscount;
    salePrice = itemSalesPrice * (1 - presetDiscount / 100);
  } else if (mrp > 0) {
    calculatedDiscount = presetDiscount;
    salePrice = mrp * (1 - presetDiscount / 100);
  }

  salePrice = Math.round((salePrice + Number.EPSILON) * 100) / 100;

  return {
    mrp,
    salePrice,
    discountPercent: Math.round(calculatedDiscount),
    hasDiscount: calculatedDiscount > 0,
    hasBothPrices: mrp > 0 && salePrice > 0 && salePrice < mrp,
  };
};

export const hasMultiplePricing = (item: Item): boolean =>
  Array.isArray(item.priceTiers) && item.priceTiers.length > 0;

// The item's own price, represented as a pseudo-tier — so the picker can
// show "Piece" as one selectable option alongside the real tiers, uniformly.
export const getBaseTier = (item: Item): PriceTier => ({
  id: '__base__',
  label: item.unit === 'pkt' && item.packetSize
    ? `1 ${item.unit} (${item.packetSize} pcs)`
    : `1 ${item.unit || 'pcs'}`,
  quantity: item.unitMultiplier || 1,
  mrp: item.mrp,
  salesPrice: item.salesPrice,
  purchasePrice: item.purchasePrice,
  discount: item.discount,
  purchasediscount: item.purchasediscount,
  barcode: item.barcode,
});

// Base tier + all custom tiers, in display order
export const getAllTiers = (item: Item): PriceTier[] => [
  getBaseTier(item),
  ...(item.priceTiers || []),
];

// Used by barcode scanners to resolve a scanned code to (item, tier) —
// checks each item's base barcode AND every custom tier's barcode.
export const findTierByBarcode = (
  items: Item[],
  barcode: string
): { item: Item; tier: PriceTier } | null => {
  for (const item of items) {
    const tiers = getAllTiers(item);
    const match = tiers.find(t => t.barcode && t.barcode === barcode);
    if (match) return { item, tier: match };
  }
  return null;
};