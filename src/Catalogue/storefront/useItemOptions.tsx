import { useState } from 'react';
import type { AddOnOption, Item, PriceTier } from '../../constants/models';
import type { CatalogueSalesSettings } from '../Settings/CatalogueSalesSetting';
import { getEffectivePriceInfo, hasMultiplePricing } from '../../Pages/utils/pricingUtils';
import { TierPickerModal } from '../../Components/TierPickerModal';
import { AddOnSheet } from './AddOnSheet';
import { VariantSheet } from './VariantSheet';
import { getMaxOrderQty, productState } from './productState';
import { variantGroup } from './storefront.utils';

interface Args {
    listed: Item[];
    settings: CatalogueSalesSettings | null;
    pricesVisible: boolean;
    requireLead: (fn: () => void) => void;
        addLine: (item: Item, tier?: PriceTier, qty?: number, addOns?: AddOnOption[]) => void;
    /** Item ki max order limit pehle se poori hai: caller toast dikhaye */
    onLimit?: (item: Item, limit: number) => void;
    /** Cart mein is item ki total quantity */
    quantityOf?: (itemId?: string) => number;
}

const hasAddOns = (i: Item) => (i.addOnGroups?.length ?? 0) > 0;

/**
 * Card "Add" / "Choose options":
 *  variants (separate items) -> variant popup -> (tiers popup) -> (add-on popup) -> cart
 *  add-ons only              -> add-on popup -> cart
 *  neither                   -> cart
 */
export const useItemOptions = ({ listed, settings, pricesVisible, requireLead, addLine: rawAddLine, onLimit, quantityOf }: Args) => {
    // Limit poori ho chuki ho to add mat karo, customer ko batao
    const addLine: Args['addLine'] = (item, tier, qty, addOns) => {
        const limit = getMaxOrderQty(item, settings);
        if (limit !== null && quantityOf && quantityOf(item.id) >= limit) {
            onLimit?.(item, limit);
            return;
        }
        rawAddLine(item, tier, qty, addOns);
    };
    const [variantBase, setVariantBase] = useState<Item | null>(null);
    const [tierItem, setTierItem] = useState<Item | null>(null);
    const [addOnTarget, setAddOnTarget] = useState<{ item: Item; tier?: PriceTier } | null>(null);

    const variantsOf = (item: Item): Item[] => {
        const g = variantGroup(item, listed);
        return g.some((v) => v.id === item.id) ? g : [item, ...g];
    };
    const hasVariants = (item: Item) => hasMultiplePricing(item) || variantsOf(item).length > 1;
    const needsChoice = (item: Item) => hasVariants(item) || hasAddOns(item);

    // a concrete item is chosen: tiers -> add-ons -> cart
    const proceed = (item: Item) => {
        if (hasMultiplePricing(item)) setTierItem(item);
        else if (hasAddOns(item)) setAddOnTarget({ item });
        else requireLead(() => addLine(item));
    };

    const start = (item: Item) => {
        if (variantsOf(item).length > 1) setVariantBase(item);
        else proceed(item);
    };

    const unitPrice = addOnTarget
        ? (addOnTarget.tier ? getEffectivePriceInfo(addOnTarget.tier).salePrice : productState(addOnTarget.item, settings, 0).price)
        : 0;

    const modals = (
        <>
            <VariantSheet title={variantBase?.name ?? null} variants={variantBase ? variantsOf(variantBase) : []}
                settings={settings} pricesVisible={pricesVisible} onClose={() => setVariantBase(null)}
                onSelect={(v) => { setVariantBase(null); proceed(v); }} />
            <TierPickerModal item={tierItem} isOpen={!!tierItem} onClose={() => setTierItem(null)} hidePrice={!pricesVisible}
                onSelect={(item, tier) => {
                    const t = tier.id === '__base__' ? undefined : tier;
                    setTierItem(null);
                    if (hasAddOns(item)) setAddOnTarget({ item, tier: t });
                    else requireLead(() => addLine(item, t));
                }} />
            <AddOnSheet item={addOnTarget?.item ?? null} unitPrice={unitPrice} pricesVisible={pricesVisible}
                onClose={() => setAddOnTarget(null)}
                onConfirm={(addOns) => {
                    const target = addOnTarget;
                    setAddOnTarget(null);
                    if (target) requireLead(() => addLine(target.item, target.tier, undefined, addOns));
                }} />
        </>
    );

    return { start, modals, hasVariants, needsChoice };
};