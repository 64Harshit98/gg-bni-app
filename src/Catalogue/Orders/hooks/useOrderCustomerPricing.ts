import { useCallback, useMemo } from 'react';
import { CUSTOMER_PRICING_COLLECTION } from '../../../constants/customerSource';
import { usePartyPricing, type PartyPricingAdapter } from '../../../Pages/hooks/usePartyPricing';
import { withoutCustomerPrice, type PricedLine } from '../../../Pages/utils/customerPricing';
import { computeLineTax, isTaxEnabled as computeIsTaxEnabled } from '../orders.calculations';
import type { Order, OrderItem } from '../orders.types';

export type { PartyPriceOffer as OrderPriceOffer } from '../../../Pages/hooks/usePartyPricing';

const EMPTY: OrderItem[] = [];
// Customer prices only make sense while the order is still being prepared
const EDITABLE_STATUSES = ['Upcoming', 'Confirmed', 'Packed'];

const round2 = (n: number) => Number(Number(n).toFixed(2));
const unitOf = (l: OrderItem) =>
    Number(l.effectiveUnitPrice ?? l.customPrice ?? l.salesPrice ?? l.mrp ?? 0);

interface Params {
    enabled: boolean;                 // catalogue-sales-settings.enableCustomerPricing
    companyId?: string;
    editingOrder: Order | null;
    setEditingOrder: React.Dispatch<React.SetStateAction<Order | null>>;
    salesSettings: any;
}

/** Customer-wise fixed discount inside the catalogue order editor. Never auto-applies. */
export const useOrderCustomerPricing = ({
    enabled, companyId, editingOrder, setEditingOrder, salesSettings,
}: Params) => {
    const taxOn = computeIsTaxEnabled(salesSettings);

    // Sets the new unit price AND recalculates the line total, same as handleDiscountChange
    const withPrice = useCallback((l: OrderItem, unit: number, discount: number, discount2: number): OrderItem => {
        const { finalPrice } = computeLineTax(
            unit, Number(l.quantity || 1), l.taxType, Number(l.tax ?? l.taxRate ?? 0), taxOn
        );
        return {
            ...l,
            effectiveUnitPrice: round2(unit),
            customPrice: round2(unit),
            discount: round2(discount),
            discount2: round2(discount2),
            finalPrice: round2(finalPrice),
        };
    }, [taxOn]);

    const adapter = useMemo<PartyPricingAdapter<OrderItem>>(() => ({
        pricedFor: l => l.customerPricingFor,
        pricedName: l => l.customerPricingName,
        pricedPct: l => Number(l.customerDiscountPct || 0),
        skip: l => l.customerPriceSkip,
        // Same shape the editor already gives the cart list (see mappedOrderItems)
        toPriced: l => ({ ...l, productId: l.itemId || l.id, customPrice: unitOf(l) } as unknown as PricedLine),
        currentPrice: l => unitOf(l),
        previousPrice: l => (l.preCustomerPrice !== undefined ? Number(l.preCustomerPrice) : undefined),
        apply: (l, s, partyId, partyName) => withPrice({
            ...(withoutCustomerPrice(l as any) as OrderItem),
            preCustomerPrice: unitOf(l),
            preCustomerDiscount: Number(l.discount ?? 0),
            preCustomerDiscount2: Number(l.discount2 ?? 0),
            customerDiscountPct: s.pct,
            customerDiscountSource: s.source,
            customerPricingFor: partyId,
            customerPricingName: partyName,
        }, s.net, s.discount, 0),
        revert: (l, skip) => withPrice({
            ...(withoutCustomerPrice(l as any) as OrderItem),
            ...(skip ? { customerPriceSkip: skip } : {}),
        }, l.preCustomerPrice ?? unitOf(l), l.preCustomerDiscount ?? Number(l.discount ?? 0), l.preCustomerDiscount2 ?? Number(l.discount2 ?? 0)),
    }), [withPrice]);

    const setItems = useCallback<React.Dispatch<React.SetStateAction<OrderItem[]>>>((updater) => {
        setEditingOrder(prev => prev
            ? { ...prev, items: typeof updater === 'function' ? updater(prev.items ?? []) : updater }
            : prev);
    }, [setEditingOrder]);

    const rounding = useMemo(() => ({
        enabled: salesSettings?.enableRounding ?? true,
        interval: Number(salesSettings?.roundingInterval ?? 1) || 1,
    }), [salesSettings?.enableRounding, salesSettings?.roundingInterval]);

    // Billing name/phone first, same fallback the editor uses when it saves
    const customerName = editingOrder?.billingDetails?.name || editingOrder?.userName || '';
    const customerPhone = (editingOrder?.billingDetails?.phone || editingOrder?.userLoginPhone || '').replace(/\D/g, '').slice(-10);

    return usePartyPricing<OrderItem>({
        enabled: enabled && !!editingOrder && EDITABLE_STATUSES.includes(editingOrder.status),
        auto: false,                  // owner taps "Apply prices"; nothing changes by itself
        companyId,
        collectionName: CUSTOMER_PRICING_COLLECTION,
        partyName: customerName,
        partyPhone: customerPhone,
        items: editingOrder?.items ?? EMPTY,
        setItems,
        rounding,
        canOverride: true,
        adapter,
    });
};