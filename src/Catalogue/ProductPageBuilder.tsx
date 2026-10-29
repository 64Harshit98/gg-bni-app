import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, ExternalLink, EyeOff, Loader2 } from 'lucide-react';
import { db } from '../lib/Firebase';
import type { Item } from '../constants/models';
import { ROUTES, productPageBuilderPath } from '../constants/routes.constants';
import { useAuth } from '../context/auth-context';
import { useCatalogueData } from '../context/CatalogueDataContext';
import type { CatalogueSalesSettings } from './Settings/CatalogueSalesSetting';
import { ItemEditDrawer } from '../Components/ItemDrawer';
import { useBusinessName } from './hooks/BusinessName';
import { syncNotifyStock } from './utils/syncNotifyStock';
import { ProductView } from './storefront/ProductView';
import { Sheet, btnClass } from './storefront/StoreUI';
import type { BusinessInfo } from './storefront/useStorefront';
import { findItemGroup, itemInGroup, productPageUrl, variantGroup, whatsappUrl } from './storefront/storefront.utils';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const noop = () => { };

/**
 * Product page builder: the customer's product page, live, beside the item form.
 * Edits show on the page as you type; Save writes the item exactly like the Edit drawer.
 */
const ProductPageBuilder: React.FC = () => {
    const { itemId } = useParams<{ itemId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const fromGroupId = (location.state as { groupId?: string } | null)?.groupId;
    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId || '';
    const { businessName } = useBusinessName(companyId);
    const { items: allItems, itemsLoading, itemGroups: groups } = useCatalogueData();

    const [current, setCurrent] = useState<Item | null>(null);
    const [draft, setDraft] = useState<Item | null>(null);
    const [baseline, setBaseline] = useState<string | null>(null);
    const [settings, setSettings] = useState<CatalogueSalesSettings | null>(null);
    const [business, setBusiness] = useState<BusinessInfo>({});
    const [subdomain, setSubdomain] = useState<string | null>(null);
    const [view, setView] = useState<'preview' | 'edit'>('preview'); // phones show one at a time

    const dirty = draft !== null && baseline !== null && JSON.stringify(draft) !== baseline;
    // Leaving with unsaved edits (Back, sidebar, variant switch) asks first
    const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname);

    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        Promise.all([
            getDoc(doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings')),
            getDoc(doc(db, 'companies', companyId, 'business_info', companyId)),
            getDoc(doc(db, 'companies', companyId)),
        ]).then(([st, bi, co]) => {
            if (cancelled) return;
            setSettings(st.exists() ? (st.data() as CatalogueSalesSettings) : null);
            setBusiness(bi.exists() ? (bi.data() as BusinessInfo) : {});
            setSubdomain(co.exists() ? co.data().subdomain || null : null);
        }).catch((err) => console.error('Error loading product page builder:', err));
        return () => { cancelled = true; };
    }, [companyId]);

    // Pick up the item from the URL (first load and variant switches); kept stable while editing
    useEffect(() => {
        if (!itemId || current?.id === itemId) return;
        const found = allItems.find((i) => i.id === itemId);
        if (!found) return;
        setCurrent(found);
        setDraft(null);
        setBaseline(null);
    }, [itemId, allItems, current?.id]);

    useEffect(() => {
        if (!dirty) return;
        const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const handleDraft = useCallback((d: Item, fresh: boolean) => {
        setDraft(d);
        if (fresh) setBaseline(JSON.stringify(d));
    }, []);

    const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate(ROUTES.CHOME));

    const handleSaved = async (updated: Partial<Item>) => {
        if (!current?.id) return;
        setCurrent((prev) => (prev ? { ...prev, ...updated } : prev));
        setBaseline(null); // the form reloads the saved item and reports a fresh baseline
        if (companyId) await syncNotifyStock(companyId, current.id, Number(updated.stock ?? current.stock ?? 0) > 0);
    };

    const shown = draft ?? current;
    const groupFor = (it: Item) => (fromGroupId && fromGroupId !== 'uncategorized' && itemInGroup(it, fromGroupId)
        ? groups.find((g) => g.id === fromGroupId)
        : undefined) ?? findItemGroup(it, groups);

    // Customers only see live variants; keep this one in (with its unsaved edits) even while it's hidden
    const variants = useMemo(() => {
        if (!shown) return [];
        const pool = allItems.map((i) => (i.id === shown.id ? shown : i)).filter((i) => i.isListed || i.id === shown.id);
        return variantGroup(shown, pool);
    }, [allItems, shown]);

    if (!current || !shown) {
        return (
            <div className="grid h-full min-h-[60vh] place-items-center bg-sf-canvas text-sm text-slate-500">
                {itemsLoading || !itemId || allItems.length === 0
                    ? <Loader2 className="size-6 animate-spin text-sf-primary" />
                    : <div className="grid justify-items-center gap-3">This product no longer exists.<button type="button" onClick={goBack} className={btnClass('secondary', 'sm')}>Back</button></div>}
            </div>
        );
    }

    const group = groupFor(shown);
    const savedGroup = groupFor(current);
    const savedUrl = current.isListed && savedGroup ? productPageUrl(current, savedGroup.name, companyId, subdomain) : null;

    const tab = (id: 'preview' | 'edit', label: string) => (
        <button type="button" aria-pressed={view === id} onClick={() => setView(id)}
            className={cx('h-[30px] rounded-sm px-3 text-[13px] font-medium', view === id ? 'bg-white text-sf-primary shadow-sf-card' : 'text-slate-600')}>
            {label}
        </button>
    );

    return (
        <div className="flex h-full min-h-0 flex-col bg-sf-canvas font-sans text-slate-900">
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-sf-line bg-white px-3 md:px-5">
                <button type="button" onClick={goBack} aria-label="Back to products" className={`${btnClass('ghost', 'sm')} w-8 px-0!`}>
                    <ArrowLeft className="size-4" />
                </button>
                <div className="min-w-0 flex-1">
                    <b className="block truncate text-sm font-semibold">Product page</b>
                    <span className="block truncate text-xs text-slate-500">
                        {dirty ? <span className="font-medium text-sf-primary">Unsaved changes · </span> : null}{shown.name}
                    </span>
                </div>
                <div role="group" aria-label="Show" className="flex rounded-sm bg-sf-sunken p-0.5 lg:hidden">
                    {tab('preview', 'Preview')}
                    {tab('edit', 'Edit')}
                </div>
                {savedUrl && (
                    <a href={savedUrl} target="_blank" rel="noopener noreferrer" className={cx(btnClass('secondary', 'sm'), 'max-lg:hidden')}>
                        <ExternalLink className="size-4" />Open in store
                    </a>
                )}
            </header>

            <div className="flex min-h-0 flex-1">
                {/* Live page */}
                <div className={cx('min-w-0 flex-1 overflow-y-auto overscroll-contain', view === 'edit' && 'max-lg:hidden')}>
                    {!(shown.isListed && group) && (
                        <p className="flex items-start gap-2 border-b border-yellow-200 bg-yellow-50 px-4 py-2.5 text-[13px] text-yellow-900 md:px-8">
                            <EyeOff className="mt-0.5 size-4 shrink-0" />
                            {group
                                ? "Hidden from your store. Customers can't open this product until you turn Live on."
                                : "Not in any category, so customers can't find it. Choose a category in the form."}
                        </p>
                    )}
                    <div className="mx-auto max-w-[1200px] px-4 pb-6 md:px-8 md:pb-14">
                        <ProductView
                            preview
                            item={shown}
                            group={group}
                            groupHref=""
                            homeHref=""
                            shopName={businessName || 'Our shop'}
                            hasGstin={!!business.gstin}
                            settings={settings}
                            pricesVisible
                            inCart={0}
                            variants={variants}
                            variantHref={() => ''}
                            onVariantSelect={(v) => { if (v.id !== current.id) navigate(productPageBuilderPath(v.id!), { replace: true, state: location.state }); }}
                            notified={false}
                            whatsappHref={whatsappUrl(business.whatsappNumber || business.phoneNumber, `Hi, I have a question about ${shown.name}`)}
                            related={null}
                            shareUrl={savedUrl}
                            onAdd={noop}
                            onInc={noop}
                            onDec={noop}
                            onNotify={noop}
                            onBulkQuote={noop}
                            onAsk={noop}
                            onViewCart={noop}
                        />
                    </div>
                </div>

                {/* Item form — same one as the Edit drawer, so both always save the same way */}
                <div className={cx('min-h-0 w-full shrink-0 lg:w-[440px] lg:border-l lg:border-sf-line xl:w-[520px]', view === 'preview' && 'max-lg:hidden')}>
                    <ItemEditDrawer
                        variant="panel"
                        isOpen
                        closeOnSave={false}
                        item={current}
                        onClose={goBack}
                        onSaveSuccess={handleSaved}
                        onDraftChange={handleDraft}
                        itemGroupRoute={`${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`}
                    />
                </div>
            </div>

            <Sheet open={blocker.state === 'blocked'} title="Discard changes?" onClose={() => blocker.reset?.()}
                footer={<>
                    <button type="button" onClick={() => blocker.reset?.()} className={btnClass('ghost')}>Keep editing</button>
                    <button type="button" onClick={() => blocker.proceed?.()} className={btnClass('primary')}>Discard</button>
                </>}>
                <p className="text-sm text-slate-600">Your changes to {shown.name} haven't been saved.</p>
            </Sheet>
        </div>
    );
};

export default ProductPageBuilder;
