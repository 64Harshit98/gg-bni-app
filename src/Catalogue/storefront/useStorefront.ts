import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { getSubdomain } from '../../lib/subdomain';
import type { Item, ItemGroup } from '../../constants/models';
import { resolveAddOnGroups } from '../../constants/models';
import { fromTemplateDoc } from '../../lib/addOnTemplates';
import type { CatalogueSalesSettings } from '../Settings/CatalogueSalesSetting';
import type { StorePageDoc } from './storePage.types';
import { getLeadData } from './storefront.utils';
import {
    getStorefrontTarget,
    loadStorefront,
    peekStorefront,
    StorefrontNotFoundError,
    type StorefrontBusinessInfo,
    type StorefrontData,
} from './storefrontClient';

export type StorefrontStatus = 'loading' | 'ready' | 'not-found' | 'error';

interface StorefrontState {
    status: StorefrontStatus;
    data: StorefrontData | null;
}

// The storefront bundle for the current page: resolved from the merchant
// subdomain, or from `pathCompanyId` on legacy main-domain links. Starts as
// 'ready' with no loader at all when another storefront page already loaded
// the same store in this session.
export const useStorefront = (pathCompanyId?: string | null) => {
    const target = useMemo(() => getStorefrontTarget(pathCompanyId), [pathCompanyId]);

    const [state, setState] = useState<StorefrontState>(() => {
        if (!target) return { status: 'not-found', data: null };
        const ready = peekStorefront(target);
        return ready ? { status: 'ready', data: ready } : { status: 'loading', data: null };
    });
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        if (!target) {
            setState({ status: 'not-found', data: null });
            return;
        }

        const ready = peekStorefront(target);
        if (ready) {
            setState({ status: 'ready', data: ready });
            return;
        }

        let cancelled = false;
        setState({ status: 'loading', data: null });
        loadStorefront(target)
            .then((data) => {
                if (!cancelled) setState({ status: 'ready', data });
            })
            .catch((error) => {
                if (cancelled) return;
                console.error('Failed to load storefront:', error);
                setState({ status: error instanceof StorefrontNotFoundError ? 'not-found' : 'error', data: null });
            });

        return () => {
            cancelled = true;
        };
    }, [target, attempt]);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);

    return { status: state.status, data: state.data, retry };
};

/** Links inside the storefront, for both <shop>.sellar.in and legacy app links. */
export const useStoreLinks = (companyId: string | null, subdomain: string | null) => useMemo(() => ({
    home: () => (subdomain ? '/' : `/catalogue/${companyId}`),
    category: (slug: string) => (subdomain ? `/${slug}` : `/${companyId}/${slug}`),
    product: (catSlug: string, itemSlug: string) => (subdomain ? `/${catSlug}/${itemSlug}` : `/${companyId}/${catSlug}/${itemSlug}`),
    checkout: () => (subdomain ? '/checkout' : `/checkout/${companyId}`),
}), [companyId, subdomain]);

// ── Everything a storefront page reads, derived from the one bundle ──
export type BusinessInfo = StorefrontBusinessInfo;

export interface StorefrontPageData {
    items: Item[];
    groups: ItemGroup[];
    settings: CatalogueSalesSettings | null;
    business: BusinessInfo;
    pinnedItemIds: Set<string>;
    pinnedCategoryIds: Set<string>;
    storePage: StorePageDoc | null;
}

export const toStorefrontPageData = (bundle: StorefrontData): StorefrontPageData => {
    const library = bundle.addOnTemplates.map((t) => fromTemplateDoc(t.id, t));
    const allowNegative = bundle.catalogueSettings?.allowNegativeInventory === true;
    return {
        // Add-ons show only when "Enable add-ons" is ON; each item's groups come from the library
        items: bundle.items.map((i) => ({
            ...i,
            addOnGroups: bundle.enableAddOns
                ? resolveAddOnGroups(i, library, { items: bundle.items, allowNegative })
                : undefined,
        })),
        groups: bundle.itemGroups,
        settings: bundle.catalogueSettings,
        business: bundle.businessInfo ?? {},
        pinnedItemIds: new Set(bundle.pinnedItemIds),
        pinnedCategoryIds: new Set(bundle.pinnedCategoryIds),
        storePage: bundle.storePage,
    };
};

/** Which shop this page is for, plus its data. <slug>.sellar.in wins; legacy links carry the id in the path. */
export const useStorefrontPage = (pathId?: string) => {
    const { status, data: bundle, retry } = useStorefront(pathId);
    const data = useMemo(() => (bundle ? toStorefrontPageData(bundle) : null), [bundle]);
    return {
        companyId: bundle?.companyId ?? null,
        subdomain: getSubdomain(),
        data,
        notFound: status === 'not-found',
        loadFailed: status === 'error',
        retry,
    };
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
