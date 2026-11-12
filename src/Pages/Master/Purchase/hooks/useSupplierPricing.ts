import { useMemo } from 'react';
import { SUPPLIER_PRICING_COLLECTION } from '../../../../constants/customerSource';
import { usePartyPricing, type PartyPricingAdapter } from '../../../hooks/usePartyPricing';
import { withoutSupplierPrice } from '../../../utils/customerPricing';
import type { PurchaseItem } from '../purchase.types';
import { isRealProductLine } from '../purchasePriceBook';

interface Params {
    enabled: boolean;
    /** False while editing a saved purchase: rates there are never changed automatically. */
    auto: boolean;
    companyId?: string;
    supplierName: string;
    supplierPhone: string;
    items: PurchaseItem[];
    setItems: React.Dispatch<React.SetStateAction<PurchaseItem[]>>;
    roundingOff: boolean;
    canOverride: boolean;   // Permissions.OverrideCustomerDiscount
}

/**
 * The supplier's % comes off the purchase rate: the item's purchase price, else the
 * line's rate before any supplier price (e.g. MRP less the item's purchase discount).
 */
const purchaseBase = (l: PurchaseItem) =>
    Number(l.originalPurchasePrice) > 0
        ? Number(l.originalPurchasePrice)
        : Number(l.preSupplierPrice ?? l.purchasePrice) || 0;

/** The Purchase screen's Disc% is off MRP (else the item's purchase price) — keep it that way. */
const screenDiscount = (l: PurchaseItem, net: number) => {
    const base = Number(l.mrp) > 0 ? Number(l.mrp) : Number(l.originalPurchasePrice) || 0;
    return base > 0 ? parseFloat((((base - net) / base) * 100).toFixed(2)) : 0;
};

const purchaseAdapter: PartyPricingAdapter<PurchaseItem> = {
    pricedFor: l => l.supplierPricingFor,
    pricedName: l => l.supplierPricingName,
    pricedPct: l => Number(l.supplierDiscountPct || 0),
    skip: l => l.supplierPriceSkip,
    // Supplier discount is % off the purchase rate (not MRP), used only when it lowers the rate.
    toPriced: l => ({
        productId: isRealProductLine(l) ? l.productId : undefined,
        itemGroupId: l.itemGroupId,
        itemGroupIds: l.itemGroupIds,
        tierId: l.tierId,
        mrp: Number(l.mrp) || 0,
        salesPrice: Number(l.originalPurchasePrice) || 0,
        basePrice: purchaseBase(l),
        customPrice: Number(l.purchasePrice),
    }),
    currentPrice: l => Number(l.purchasePrice) || 0,
    previousPrice: l => (l.preSupplierPrice !== undefined ? Number(l.preSupplierPrice) : undefined),
    apply: (l, s, partyId, partyName) => ({
        ...withoutSupplierPrice(l),
        preSupplierPrice: l.purchasePrice,
        preSupplierDiscount: l.purchasediscount ?? l.discount,
        preSupplierDiscount2: l.purchasediscount2,
        purchasePrice: s.net,
        discount: screenDiscount(l, s.net),
        purchasediscount: screenDiscount(l, s.net),
        purchasediscount2: 0,
        supplierDiscountPct: s.pct,
        supplierDiscountSource: s.source,
        supplierPricingFor: partyId,
        supplierPricingName: partyName,
    }),
    revert: (l, skip) => ({
        ...withoutSupplierPrice(l),
        purchasePrice: l.preSupplierPrice ?? l.purchasePrice,
        discount: l.preSupplierDiscount ?? l.discount,
        purchasediscount: l.preSupplierDiscount ?? l.purchasediscount,
        purchasediscount2: l.preSupplierDiscount2 ?? l.purchasediscount2 ?? 0,
        ...(skip ? { supplierPriceSkip: skip } : {}),
    }),
};

/** Supplier-wise fixed pricing on the Purchase screen (see usePartyPricing). */
export const useSupplierPricing = ({
    enabled, auto, companyId, supplierName, supplierPhone, items, setItems, roundingOff, canOverride,
}: Params) => {
    const rounding = useMemo(() => ({ enabled: roundingOff, interval: 1 }), [roundingOff]);
    return usePartyPricing<PurchaseItem>({
        enabled, auto, companyId,
        collectionName: SUPPLIER_PRICING_COLLECTION,
        partyName: supplierName,
        partyPhone: supplierPhone,
        items, setItems, rounding, canOverride,
        adapter: purchaseAdapter,
    });
};
