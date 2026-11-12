import { useMemo } from 'react';
import { CUSTOMER_PRICING_COLLECTION } from '../../../../constants/customerSource';
import { usePartyPricing, type PartyPricingAdapter } from '../../../hooks/usePartyPricing';
import { withoutCustomerPrice } from '../../../utils/customerPricing';
import type { SalesItem } from '../sales.types';

export type { PartyPriceOffer as CustomerPriceOffer } from '../../../hooks/usePartyPricing';

interface Params {
    enabled: boolean;
    /** False while editing a saved bill: prices there are never changed automatically. */
    auto: boolean;
    companyId?: string;
    /** The customer picked at the top of the bill or in the payment drawer. */
    customerName: string;
    customerPhone: string;
    items: SalesItem[];
    setItems: React.Dispatch<React.SetStateAction<SalesItem[]>>;
    salesSettings: { enableRounding?: boolean; roundingInterval?: number } | null | undefined;
    canOverride: boolean;   // Permissions.OverrideCustomerDiscount
}

const salesAdapter: PartyPricingAdapter<SalesItem> = {
    pricedFor: l => l.customerPricingFor,
    pricedName: l => l.customerPricingName,
    pricedPct: l => Number(l.customerDiscountPct || 0),
    skip: l => l.customerPriceSkip,
    toPriced: l => l,
    currentPrice: l => Number(l.customPrice) || 0,
    previousPrice: l => (l.preCustomerPrice !== undefined ? Number(l.preCustomerPrice) : undefined),
    apply: (l, s, partyId, partyName) => ({
        ...withoutCustomerPrice(l),
        preCustomerPrice: l.customPrice,
        preCustomerDiscount: l.discount,
        preCustomerDiscount2: l.discount2,
        customPrice: s.net,
        discount: s.discount,
        discount2: 0,
        customerDiscountPct: s.pct,
        customerDiscountSource: s.source,
        customerPricingFor: partyId,
        customerPricingName: partyName,
    }),
    revert: (l, skip) => ({
        ...withoutCustomerPrice(l),
        // A bill opened for editing has no saved "before" price — keep the current one then
        customPrice: l.preCustomerPrice ?? l.customPrice,
        discount: l.preCustomerDiscount ?? l.discount,
        discount2: l.preCustomerDiscount2 ?? l.discount2 ?? 0,
        ...(skip ? { customerPriceSkip: skip } : {}),
    }),
};

/** Customer-wise fixed pricing on the Sales screen (see usePartyPricing). */
export const useCustomerPricing = ({
    enabled, auto, companyId, customerName, customerPhone, items, setItems, salesSettings, canOverride,
}: Params) => {
    const rounding = useMemo(() => ({
        enabled: salesSettings?.enableRounding ?? true,
        interval: salesSettings?.roundingInterval ?? 1,
    }), [salesSettings?.enableRounding, salesSettings?.roundingInterval]);

    const p = usePartyPricing<SalesItem>({
        enabled, auto, companyId,
        collectionName: CUSTOMER_PRICING_COLLECTION,
        partyName: customerName,
        partyPhone: customerPhone,
        items, setItems, rounding, canOverride,
        adapter: salesAdapter,
    });
    return { ...p, customerId: p.partyId };
};
