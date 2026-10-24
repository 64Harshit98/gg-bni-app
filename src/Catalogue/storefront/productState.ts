import type { Item } from '../../constants/models';
import { getSlabForQty } from '../../constants/models';
import type { CatalogueSalesSettings } from '../Settings/CatalogueSalesSetting';
import { getEffectivePriceInfo, hasMultiplePricing, hasQuantitySlabs } from '../../Pages/utils/pricingUtils';
import type { LeadStatus } from './useStorefront';

/** Can this customer see prices? (shop setting + approval) */
export const canSeePrices = (settings: CatalogueSalesSettings | null, leadStatus: LeadStatus) =>
    settings?.hidePrice !== true && (settings?.requireApproval !== true || leadStatus === 'approved');

export const unitLabel = (item: Item) => {
    const m = Number(item.unitMultiplier || 1);
    if (m > 1) return `${m} pcs`;
    return item.unit && item.unit !== 'pcs' ? `1 ${item.unit}` : '1 pc';
};

const LOW_STOCK = 5;

/** Everything a product card or the product page needs to know about price and stock. */
export const productState = (item: Item, settings: CatalogueSalesSettings | null, inCart: number) => {
    const { mrp, salePrice, discountPercent, hasDiscount } = getEffectivePriceInfo(item);
    const priceMode = settings?.priceDisplayMode || 'both';
    const actuallyOut = (item.stock || 0) <= 0;
    const outOfStock = !settings?.allowNegativeInventory && actuallyOut;
    const slabs = hasQuantitySlabs(item) ? [...(item.quantitySlabs || [])].sort((a, b) => a.minQty - b.minQty) : [];
    const activeSlab = inCart > 0 && slabs.length ? getSlabForQty(item, inCart) : null;
    const slabPrice = activeSlab && activeSlab.salesPrice < salePrice ? activeSlab.salesPrice : null;
    const bulkFrom = slabs.length ? Math.min(...slabs.map((s) => s.salesPrice)) : null;
    const stock = Number(item.stock || 0);
    return {
        mrp: priceMode === 'salePrice' ? 0 : mrp,
        price: priceMode === 'mrp' ? mrp || salePrice : salePrice,
        discountPercent,
        showDiscount: settings?.showDiscountBadge === true && hasDiscount && priceMode !== 'mrp',
        outOfStock,
        canNotify: settings?.enableOutOfStockNotification === true && actuallyOut,
        slabPrice,
        slabs,
        activeSlab,
        bulkFrom: bulkFrom !== null && bulkFrom < salePrice ? bulkFrom : null,
        lowStock: !settings?.allowNegativeInventory && stock > 0 && stock <= LOW_STOCK ? stock : undefined,
        hasOptions: hasMultiplePricing(item) || (item.addOnGroups?.length ?? 0) > 0,
        unit: unitLabel(item),
    };
};
