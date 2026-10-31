import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { getItemGroupsByCompany, getItemsByCompany } from '../../lib/ItemsFirebase';
import type { Item, ItemGroup, AddOnGroup } from '../../constants/models';
import { resolveAddOnGroups } from '../../constants/models';
import { fromTemplateDoc } from '../../lib/addOnTemplates';
import type { CatalogueSalesSettings } from '../Settings/CatalogueSalesSetting';
import type { StorePageDoc } from './storePage.types';
import { getLeadData } from './storefront.utils';

// ── Which shop is this? ───────────────────────────────────────────
// <slug>.sellar.in resolves through companies.domainAliases; legacy links carry the id in the path.
const getStoreSubdomain = () => {
    const hostname = window.location.hostname;
    const parts = hostname.split('.');
    return parts.length >= 3 && !['www', 'app'].includes(parts[0].toLowerCase()) && !hostname.includes('localhost')
        ? parts[0]
        : null;
};

const resolvedIds: Record<string, string> = {};

export const useResolvedCompanyId = (pathId?: string) => {
    const subdomain = useMemo(getStoreSubdomain, []);
    const [companyId, setCompanyId] = useState<string | null>(subdomain ? resolvedIds[subdomain] ?? null : pathId ?? null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!subdomain) {
            if (pathId) setCompanyId(pathId); else setError(true);
            return;
        }
        if (resolvedIds[subdomain]) { setCompanyId(resolvedIds[subdomain]); return; }
        let cancelled = false;
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, 'companies'), where('domainAliases', 'array-contains', subdomain)));
                if (cancelled) return;
                if (snap.empty) { setError(true); return; }
                const companyDoc = snap.docs[0];
                const data = companyDoc.data();
                // Old link: send them to the shop's current address
                if (data.subdomain && data.subdomain !== subdomain) {
                    window.location.replace(`https://${data.subdomain}.sellar.in`);
                    return;
                }
                resolvedIds[subdomain] = companyDoc.id;
                setCompanyId(companyDoc.id);
            } catch (e) {
                console.error('Error resolving subdomain:', e);
                if (!cancelled) setError(true);
            }
        })();
        return () => { cancelled = true; };
    }, [subdomain, pathId]);

    return { companyId, error, subdomain };
};

/** Links inside the storefront, for both <shop>.sellar.in and legacy app links. */
export const useStoreLinks = (companyId: string | null, subdomain: string | null) => useMemo(() => ({
    home: () => (subdomain ? '/' : `/catalogue/${companyId}`),
    category: (slug: string) => (subdomain ? `/${slug}` : `/${companyId}/${slug}`),
    product: (catSlug: string, itemSlug: string) => (subdomain ? `/${catSlug}/${itemSlug}` : `/${companyId}/${catSlug}/${itemSlug}`),
    checkout: () => (subdomain ? '/checkout' : `/checkout/${companyId}`),
}), [companyId, subdomain]);

// ── Everything a storefront page reads, loaded once per shop ──────
export interface BusinessInfo {
    businessName?: string;
    companyLogo?: string;
    phoneNumber?: string;
    whatsappNumber?: string;
    email?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    gstin?: string;
    instagram?: string;
    facebook?: string;
    twitter?: string;
    gmail?: string;
    brandingText?: string;
    businessCategory?: string;
    businessType?: string;
}

export interface StorefrontData {
    items: Item[];
    groups: ItemGroup[];
    settings: CatalogueSalesSettings | null;
    business: BusinessInfo;
    pinnedItemIds: Set<string>;
    pinnedCategoryIds: Set<string>;
    storePage: StorePageDoc | null;
}

const dataCache = new Map<string, Promise<StorefrontData>>();

const loadStorefront = (companyId: string): Promise<StorefrontData> => {
    const cached = dataCache.get(companyId);
    if (cached) return cached;
    const settingsDoc = (name: string) => getDoc(doc(db, 'companies', companyId, 'settings', name));
    const p = Promise.all([
        getItemsByCompany(companyId),
        getItemGroupsByCompany(companyId),
        settingsDoc('catalogue-sales-settings'),
        getDoc(doc(db, 'companies', companyId, 'business_info', companyId)),
        settingsDoc('pinned_items'),
        settingsDoc('pinned_categories'),
        settingsDoc('store_page'),
        // Optional for the storefront: if this read is not allowed, add-ons simply stay off
        settingsDoc('item-settings').catch(() => null),
        // The shared add-on library (public read, see firestore.rules)
        getDocs(collection(db, 'companies', companyId, 'addOnTemplates'))
            .then((snap) => snap.docs.map((d) => fromTemplateDoc(d.id, d.data())))
            .catch(() => [] as AddOnGroup[]),
    ]).then(([items, groups, settings, business, pinnedItems, pinnedCats, storePage, itemSettings, addOnLibrary]) => ({
        // Add-ons show only when "Enable add-ons" is ON; each item's groups come from the library
        items: items.map((i) => ({
            ...i,
            addOnGroups: itemSettings?.exists() && itemSettings.data()?.enableAddOns === true
                ? resolveAddOnGroups(i, addOnLibrary, {
                    items,
                    allowNegative: settings.exists() && (settings.data() as any)?.allowNegativeInventory === true,
                })
                : undefined,
        })),
        groups,
        settings: settings.exists() ? (settings.data() as CatalogueSalesSettings) : null,
        business: business.exists() ? (business.data() as BusinessInfo) : {},
        pinnedItemIds: new Set<string>(pinnedItems.exists() ? pinnedItems.data().ids || [] : []),
        pinnedCategoryIds: new Set<string>(pinnedCats.exists() ? pinnedCats.data().ids || [] : []),
        storePage: storePage.exists() ? (storePage.data() as StorePageDoc) : null,
    }));
    p.catch(() => dataCache.delete(companyId));
    dataCache.set(companyId, p);
    return p;
};

export const useStorefrontData = (companyId: string | null) => {
    const [data, setData] = useState<StorefrontData | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        loadStorefront(companyId)
            .then((d) => { if (!cancelled) setData(d); })
            .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load the store.'); });
        return () => { cancelled = true; };
    }, [companyId]);

    return { data, error, loading: !data && !error };
};

// ── Is this customer approved to see prices? ──────────────────────
export type LeadStatus = 'approved' | 'pending' | 'declined' | null;

export const useLeadStatus = (companyId: string | null, phoneKey: string) => {
    const [status, setStatus] = useState<LeadStatus>(null);
    useEffect(() => {
        if (!companyId) return;
        const phone = (getLeadData().number || '').replace(/\D/g, '').trim();
        if (!phone) { setStatus(null); return; }
        const q = query(collection(db, 'companies', companyId, 'AuthorizedUser'), where('customerNumber', '==', phone));
        return onSnapshot(q,
            (snap) => setStatus(snap.empty ? null : ((snap.docs[0].data().status as LeadStatus) || 'pending')),
            (e) => { console.error('Realtime approval error:', e); setStatus(null); });
    }, [companyId, phoneKey]);
    return status;
};
