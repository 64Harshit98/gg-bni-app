// Party-wise fixed pricing (customer-wise on Sales, supplier-wise on Purchase).
//
// These helpers only work out what the party's agreed price would be. The billing
// screens apply it (automatically when a party is picked, with Revert on each line).
// Sales totals / tax / PDF keep reading customPrice + discount, so the three
// calculation functions in sales.calculations.ts are untouched.

import type { CustomerPricingRule } from '../../constants/models';
import { applyLineRounding } from '../Master/Sales/sales.calculations';
import { omitKeys } from '../../lib/omitKeys';

/**
 * A line's "don't auto-apply" marker: 'manual' after a hand-edited price (never
 * auto-apply over it), or a party id after the user tapped Revert for that party.
 */
export const MANUAL_PRICE_SKIP = 'manual';

/** Cart-only fields that back Revert / auto-apply — never saved on the invoice. */
export const CART_ONLY_CUSTOMER_KEYS = ['preCustomerPrice', 'preCustomerDiscount', 'preCustomerDiscount2', 'customerPriceSkip'] as const;
const CUSTOMER_PRICE_KEYS = [
    'customerDiscountPct', 'customerDiscountSource', 'customerPricingFor', 'customerPricingName',
    ...CART_ONLY_CUSTOMER_KEYS,
] as const;

/** The line without any customer-price tag or marker (price fields untouched). */
export const withoutCustomerPrice = <T extends object>(line: T): T => omitKeys(line, CUSTOMER_PRICE_KEYS);

/** Same for Purchase lines and the supplier's agreed price. */
export const CART_ONLY_SUPPLIER_KEYS = ['preSupplierPrice', 'preSupplierDiscount', 'preSupplierDiscount2', 'supplierPriceSkip'] as const;
const SUPPLIER_PRICE_KEYS = [
    'supplierDiscountPct', 'supplierDiscountSource', 'supplierPricingFor', 'supplierPricingName',
    ...CART_ONLY_SUPPLIER_KEYS,
] as const;
export const withoutSupplierPrice = <T extends object>(line: T): T => omitKeys(line, SUPPLIER_PRICE_KEYS);

export type CustomerDiscountSource = 'item' | 'category' | 'default';

export interface ResolvedCustomerDiscount {
    type: 'percent' | 'netPrice';
    value: number;
    source: CustomerDiscountSource;
}

/** The minimal line shape the helpers need (a Sales cart line satisfies it). */
export interface PricedLine {
    productId?: string;
    itemGroupId?: string;
    itemGroupIds?: string[];
    tierId?: string;
    mrp?: number;
    salesPrice?: number;
    /** Price the % is taken off. Default: MRP, else sale price. Purchase passes the purchase rate. */
    basePrice?: number;
    customPrice?: number | string;
    isCustomAmount?: boolean;
}

export interface CustomerPriceSuggestion {
    net: number;          // suggested net unit price (before add-ons)
    discount: number;     // % off the base (basePrice, else MRP, else sale price), 2 decimals
    pct: number;          // the rule's % (or the effective % for a fixed net price)
    source: CustomerDiscountSource;
}

const clampPct = (n: unknown) => {
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0) return 0;
    return Math.min(v, 100);
};

/** Item override → best category % → customer default %. Null when nothing applies. */
export const resolveCustomerDiscount = (
    rule: CustomerPricingRule | null | undefined,
    line: PricedLine
): ResolvedCustomerDiscount | null => {
    if (!rule || !rule.isActive) return null;

    const override = line.productId ? rule.itemOverrides?.[line.productId] : undefined;
    if (override && Number(override.value) > 0) {
        // A fixed net price is for the base unit; a tier pack falls through to the % rules.
        if (override.type === 'percent') {
            const pct = clampPct(override.value);
            if (pct > 0) return { type: 'percent', value: pct, source: 'item' };
        } else if (!line.tierId) {
            return { type: 'netPrice', value: Number(override.value), source: 'item' };
        }
    }

    const groupIds = new Set<string>(
        [line.itemGroupId, ...(line.itemGroupIds ?? [])].filter((g): g is string => !!g)
    );
    let bestCategory = 0;
    groupIds.forEach(g => {
        bestCategory = Math.max(bestCategory, clampPct(rule.categoryDiscounts?.[g]));
    });
    if (bestCategory > 0) return { type: 'percent', value: bestCategory, source: 'category' };

    const def = clampPct(rule.defaultDiscountPct);
    if (def > 0) return { type: 'percent', value: def, source: 'default' };

    return null;
};

/**
 * What the line would cost at the customer's agreed price — only returned when it is
 * different from the line's current net price. The party's agreed price always wins over the
 * item's own discount / slab price — higher or lower (e.g. item 10% off, customer only 5%).
 */
export const getCustomerPriceSuggestion = (
    line: PricedLine,
    rule: CustomerPricingRule | null | undefined,
    isRoundingEnabled = true,
    roundingInterval = 1
): CustomerPriceSuggestion | null => {
    if (!line.productId || line.isCustomAmount) return null;

    const resolved = resolveCustomerDiscount(rule, line);
    if (!resolved) return null;

    const mrp = Number(line.mrp || 0);
    const sales = Number(line.salesPrice || 0);
    const given = Number(line.basePrice || 0);
    const base = given > 0 ? given : mrp > 0 ? mrp : sales;
    if (base <= 0) return null;

    let net = resolved.type === 'percent'
        ? base * (1 - resolved.value / 100)
        : resolved.value;
    net = applyLineRounding(net, isRoundingEnabled, roundingInterval, mrp);
    if (mrp > 0) net = Math.min(net, mrp);
    if (net <= 0) return null;

    const current = Number(line.customPrice);
    if (Number.isFinite(current) && current > 0 && Math.abs(net - current) < 0.005) return null;

    const discount = parseFloat((((base - net) / base) * 100).toFixed(2));
    const pct = resolved.type === 'percent' ? resolved.value : discount;
    return { net, discount, pct: parseFloat(pct.toFixed(2)), source: resolved.source };
};
