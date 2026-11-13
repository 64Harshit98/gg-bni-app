import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import type { CustomerPricingRule } from '../../constants/models';
import { getPartyDocId } from '../../constants/customerSource';
import type { PriceFlagData } from '../../Components/PriceFlag';
import {
    getCustomerPriceSuggestion, MANUAL_PRICE_SKIP,
    type CustomerPriceSuggestion, type PricedLine,
} from '../utils/customerPricing';

/** How the shared logic reads / writes one kind of cart line (Sales or Purchase). */
export interface PartyPricingAdapter<L> {
    /** Party id the line's price was applied for, if any. */
    pricedFor: (line: L) => string | undefined;
    pricedName: (line: L) => string | undefined;
    pricedPct: (line: L) => number;
    /** 'manual' or a party id — see MANUAL_PRICE_SKIP. */
    skip: (line: L) => string | undefined;
    toPriced: (line: L) => PricedLine;
    currentPrice: (line: L) => number;
    /** Price before the party price was applied. */
    previousPrice: (line: L) => number | undefined;
    /** Apply the party price (clears any skip marker). */
    apply: (line: L, s: CustomerPriceSuggestion, partyId: string, partyName: string) => L;
    /** Restore the previous price, drop the tags, and set `skip` when given. */
    revert: (line: L, skip?: string) => L;
}

/** One-line message for the payment drawer / customer bar. */
export interface PartyPriceOffer {
    tone: 'info' | 'applied' | 'warn';
    text: string;
    actionLabel: string;
    onAction: () => void;
}

interface Params<L extends { id: string; quantity?: number | string }> {
    enabled: boolean;
    /** Apply the party's price automatically (off while editing a saved bill). */
    auto: boolean;
    companyId?: string;
    collectionName: string;          // customerPricing | supplierPricing
    partyName: string;
    partyPhone: string;
    items: L[];
    setItems: React.Dispatch<React.SetStateAction<L[]>>;
    rounding: { enabled: boolean; interval: number };
    canOverride: boolean;            // Permissions.OverrideCustomerDiscount
    adapter: PartyPricingAdapter<L>;
}

const money = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const qtyOf = (l: { quantity?: number | string }) => Number(l.quantity) || 1;

/**
 * Party-wise fixed pricing, shared by Sales (customers) and Purchase (suppliers).
 * When a party with a rule is picked, matching lines get the party's agreed price
 * automatically — it replaces the item's own discount, higher or lower. Undo keeps the normal price
 * for that party; a hand-edited price is never overwritten.
 */
export const usePartyPricing = <L extends { id: string; quantity?: number | string }>({
    enabled, auto, companyId, collectionName, partyName, partyPhone,
    items, setItems, rounding, canOverride, adapter,
}: Params<L>) => {
    const partyId = getPartyDocId(partyName, partyPhone);
    const [rule, setRule] = useState<CustomerPricingRule | null>(null);
    const [loading, setLoading] = useState(false);
    // The party id the current `rule` was loaded for — auto-apply waits until it matches,
    // so half-typed names/numbers in the drawer don't touch prices.
    const [resolvedFor, setResolvedFor] = useState<string | null>(null);

    useEffect(() => {
        setResolvedFor(null);
        if (!enabled || !companyId || !partyId) {
            setRule(null); setLoading(false); setResolvedFor(partyId);
            return;
        }
        let cancelled = false;
        setLoading(true);
        const t = setTimeout(() => {
            getDoc(doc(db, 'companies', companyId, collectionName, partyId))
                .then(snap => {
                    if (cancelled) return;
                    const data = snap.exists() ? (snap.data() as CustomerPricingRule) : null;
                    setRule(data && data.isActive ? data : null);
                })
                .catch(err => { console.error('Party pricing load failed', err); if (!cancelled) setRule(null); })
                .finally(() => { if (!cancelled) { setLoading(false); setResolvedFor(partyId); } });
        }, 350);
        return () => { cancelled = true; clearTimeout(t); };
    }, [enabled, companyId, collectionName, partyId]);

    const suggestFor = (line: L) =>
        rule ? getCustomerPriceSuggestion(adapter.toPriced(line), rule, rounding.enabled, rounding.interval) : null;

    // Automatic: revert prices set for another party, then apply this party's agreed price.
    useEffect(() => {
        if (!enabled || !auto || resolvedFor === null || resolvedFor !== partyId) return;
        const displayName = rule?.customerName || partyName;
        setItems(prev => {
            let changed = false;
            const next = prev.map(original => {
                let line = original;
                const pf = adapter.pricedFor(line);
                if (pf !== undefined && pf !== partyId) { line = adapter.revert(line); changed = true; }
                if (rule && adapter.pricedFor(line) === undefined) {
                    const sk = adapter.skip(line);
                    if (sk !== MANUAL_PRICE_SKIP && sk !== partyId) {
                        const s = suggestFor(line);
                        if (s) { line = adapter.apply(line, s, partyId, displayName); changed = true; }
                    }
                }
                return line;
            });
            return changed ? next : prev;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, auto, resolvedFor, partyId, rule, items]);

    /** lineId → party price, for lines that don't carry an applied price. */
    const suggestions = useMemo(() => {
        const out = new Map<string, CustomerPriceSuggestion>();
        if (!enabled || !rule) return out;
        for (const line of items) {
            if (adapter.pricedFor(line) !== undefined) continue;
            const s = suggestFor(line);
            if (s) out.set(line.id, s);
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, rule, items, rounding.enabled, rounding.interval]);

    const appliedHere = items.filter(l => adapter.pricedFor(l) !== undefined && adapter.pricedFor(l) === partyId);
    const appliedElsewhere = items.filter(l => adapter.pricedFor(l) !== undefined && adapter.pricedFor(l) !== partyId);

    const apply = (lineId: string) => {
        const s = suggestions.get(lineId);
        if (!s) return;
        setItems(prev => prev.map(l => (l.id === lineId ? adapter.apply(l, s, partyId, rule?.customerName || partyName) : l)));
    };
    const applyAll = () => {
        if (suggestions.size === 0) return;
        setItems(prev => prev.map(l => {
            const s = suggestions.get(l.id);
            return s ? adapter.apply(l, s, partyId, rule?.customerName || partyName) : l;
        }));
    };
    /** User tapped Revert: keep the normal price for this party. */
    const revert = (lineId: string) =>
        setItems(prev => prev.map(l => (l.id === lineId && adapter.pricedFor(l) !== undefined ? adapter.revert(l, partyId) : l)));
    const revertWhere = (pred: (l: L) => boolean, skip?: string) =>
        setItems(prev => prev.map(l => (adapter.pricedFor(l) !== undefined && pred(l) ? adapter.revert(l, skip) : l)));

    /** Cart line extras: the strip under the line and the per-line lock. */
    const decorate = (line: L): { priceFlag: PriceFlagData | null; lockPricing: boolean } => {
        if (!enabled) return { priceFlag: null, lockPricing: false };
        if (adapter.pricedFor(line) !== undefined) {
            // No strip under applied lines (kept clean on purpose) — the Disc% shows the
            // discount, and the banner's Undo puts the normal prices back.
            return { priceFlag: null, lockPricing: !canOverride };
        }
        const s = suggestions.get(line.id);
        if (s) {
            return {
                priceFlag: {
                    tone: 'info',
                    text: `${firstName(rule?.customerName || partyName)}'s price ${money(s.net)} (−${s.pct}%)`,
                    actions: [{ label: 'Apply', onClick: () => apply(line.id), primary: true }],
                },
                lockPricing: false,
            };
        }
        return { priceFlag: null, lockPricing: false };
    };

    const offer: PartyPriceOffer | null = (() => {
        if (!enabled || loading) return null;
        const who = firstName(rule?.customerName || partyName || 'Party');
        if (!auto && appliedElsewhere.length > 0) {
            const other = firstName(adapter.pricedName(appliedElsewhere[0]) || 'another party');
            return {
                tone: 'warn',
                text: `${appliedElsewhere.length} ${appliedElsewhere.length === 1 ? 'item has' : 'items have'} ${other}'s fixed price, not this party's.`,
                actionLabel: 'Remove',
                onAction: () => revertWhere(l => adapter.pricedFor(l) !== partyId),
            };
        }
        if (appliedHere.length > 0) {
            const saved = appliedHere.reduce(
                (sum, l) => sum + ((adapter.previousPrice(l) ?? adapter.currentPrice(l)) - adapter.currentPrice(l)) * qtyOf(l), 0);
            return {
                tone: 'applied',
                text: `${who}'s fixed prices applied on ${appliedHere.length} ${appliedHere.length === 1 ? 'item' : 'items'}${saved > 0.005 ? ` — saved ${money(saved)}` : ''}.`,
                actionLabel: 'Undo',
                onAction: () => revertWhere(l => adapter.pricedFor(l) === partyId, partyId),
            };
        }
        if (suggestions.size > 0) {
            const saves = items.reduce((sum, l) => {
                const s = suggestions.get(l.id);
                return s ? sum + (adapter.currentPrice(l) - s.net) * qtyOf(l) : sum;
            }, 0);
            const change = saves > 0.005 ? ` — saves ${money(saves)}` : saves < -0.005 ? ` — ${money(-saves)} more than now` : '';
            return {
                tone: 'info',
                text: `${who} has fixed prices on ${suggestions.size} ${suggestions.size === 1 ? 'item' : 'items'}${change}.`,
                actionLabel: 'Apply prices',
                onAction: applyAll,
            };
        }
        return null;
    })();

    return { partyId, rule, loading, suggestions, decorate, offer, apply, applyAll, revert };
};
