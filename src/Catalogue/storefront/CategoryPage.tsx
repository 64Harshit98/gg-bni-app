import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { collection, getDocs, updateDoc } from 'firebase/firestore';
import { CheckCircle2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import type { Item, PriceTier } from '../../constants/models';
import LeadPopUp from '../PopUp';
import BulkQuotePopup from '../BulkQuotePopup';
import SearchBar from '../SearchBar';
import { TierPickerModal } from '../../Components/TierPickerModal';
import { useLeadStatus, useResolvedCompanyId, useStoreLinks, useStorefrontData } from './useStorefront';
import { needsLead, useStorefrontCart } from './useStorefrontCart';
import { useCustomerActions } from './useCustomerActions';
import { canSeePrices, productState } from './productState';
import { groupCategories, storeAddress } from './StoreSections';
import { ProductView } from './ProductView';
import { AskSheet, CartBar, EmptyState, Note, ProductCard, ProductCardSkeleton, StoreFooter, StoreHeader, StoreLoading, StoreMessage, WhatsAppFab, btnClass } from './StoreUI';
import { type CartLineItem, findItemBySlug, findItemGroup, formatPhone, getItemGroupIds, getItemImages, itemInGroup, itemSlug, slugify, variantGroup, whatsappUrl } from './storefront.utils';

const BATCH = 24;
type Sort = 'popular' | 'az' | 'za' | 'low' | 'high';
type Filter = 'all' | 'stock' | 'offer' | 'bulk';
const SORTS: { id: Sort; label: string }[] = [
    { id: 'popular', label: 'Pinned first' }, { id: 'az', label: 'Name A–Z' }, { id: 'za', label: 'Name Z–A' },
    { id: 'low', label: 'Price: low to high' }, { id: 'high', label: 'Price: high to low' },
];

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const notifySynced = new Set<string>();

/** Products in one category (/:groupId), and a single product (/:groupId/:itemSlug). */
const CategoryPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { companyId: pathId, groupId: groupSlug, itemSlug: productSlug } = useParams<{ companyId: string; groupId: string; itemSlug: string }>();
    const { currentUser } = useAuth();
    const { companyId, error: resolveError, subdomain } = useResolvedCompanyId(pathId);
    const links = useStoreLinks(companyId, subdomain);
    const { data, error } = useStorefrontData(companyId);
    const settings = data?.settings ?? null;
    const approvalEnabled = settings?.requireApproval === true;

    const actions = useCustomerActions(companyId, approvalEnabled);
    const leadStatus = useLeadStatus(companyId, actions.leadPhoneKey);
    const pricesVisible = canSeePrices(settings, leadStatus);
    const cart = useStorefrontCart({ companyId, settings, allItems: data?.items || [], currentUser });

    const [sort, setSort] = useState<Sort>('popular');
    const [filter, setFilter] = useState<Filter>('all');
    const [renderCount, setRenderCount] = useState(BATCH);
    const [bulkItem, setBulkItem] = useState<Item | null>(null);
    const [tierItem, setTierItem] = useState<Item | null>(null);
    const [highlight, setHighlight] = useState<string | null>(null);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    const groups = data?.groups || [];
    const group = useMemo(() => groups.find((g) => slugify(g.name) === groupSlug) ?? groups.find((g) => g.id === groupSlug), [groups, groupSlug]);
    const groupId = group?.id;
    const business = data?.business || {};
    const name = business.businessName || 'Our shop';

    const liveItems = useMemo(() => (data?.items || []).filter((i) => i.isListed && getItemGroupIds(i).some((id) => id !== 'uncategorized')), [data]);
    const listed = useMemo(() => (data?.items || []).filter((i) => i.isListed === true), [data]);

    const product = useMemo(() => (productSlug && data ? findItemBySlug(listed, productSlug, groupId) : undefined), [productSlug, data, listed, groupId]);

    useEffect(() => { setRenderCount(BATCH); setFilter('all'); }, [groupId]);
    useEffect(() => { if (data) document.title = product ? `${product.name} · ${name}` : group ? `${group.name} · ${name}` : name; }, [data, product, group, name]);

    // Ask for name and number after 10 seconds, as the catalogue always has
    useEffect(() => {
        if (!settings || !needsLead()) return;
        const t = setTimeout(() => actions.openLead(), 10000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings]);

    // Keep NotifyRequests' in-stock flags in step with the catalogue (once per visit)
    useEffect(() => {
        if (!companyId || !data || notifySynced.has(companyId)) return;
        notifySynced.add(companyId);
        (async () => {
            try {
                const snap = await getDocs(collection(db, 'companies', companyId, 'NotifyRequests'));
                await Promise.all(snap.docs.map((d) => {
                    const req = d.data();
                    const items = (req.items || []).map((ni: { id?: string }) => ({ ...ni, inStock: Boolean((data.items.find((i) => i.id === ni.id)?.stock || 0) > 0) }));
                    const any = items.some((ni: { inStock: boolean }) => ni.inStock);
                    return req.inStock !== any ? updateDoc(d.ref, { inStock: any, items, updatedAt: new Date() }) : null;
                }));
            } catch (err) { console.error('Notify stock sync error:', err); }
        })();
    }, [companyId, data]);

    const categoryItems = useMemo(() => {
        if (!groupId) return [];
        const pinned = data?.pinnedItemIds || new Set<string>();
        const res = listed.filter((i) => itemInGroup(i, groupId) && !(settings?.hideOutOfStock && (i.stock || 0) <= 0));
        const price = (i: Item) => productState(i, settings, 0).price;
        return res.sort((a, b) => {
            if (sort === 'popular') { const d = Number(pinned.has(b.id!)) - Number(pinned.has(a.id!)); if (d) return d; return a.name.localeCompare(b.name); }
            if (sort === 'az') return a.name.localeCompare(b.name);
            if (sort === 'za') return b.name.localeCompare(a.name);
            if (sort === 'low') return price(a) - price(b);
            return price(b) - price(a);
        });
    }, [listed, groupId, settings, sort, data]);

    const filtered = useMemo(() => categoryItems.filter((i) => {
        if (filter === 'all') return true;
        const s = productState(i, settings, 0);
        if (filter === 'stock') return !s.outOfStock && (i.stock || 0) > 0;
        if (filter === 'offer') return s.mrp > s.price;
        return s.slabs.length > 0;
    }), [categoryItems, filter, settings]);

    const counts = useMemo(() => ({
        stock: categoryItems.filter((i) => (i.stock || 0) > 0).length,
        offer: categoryItems.filter((i) => { const s = productState(i, settings, 0); return s.mrp > s.price; }).length,
        bulk: categoryItems.filter((i) => (i.quantitySlabs?.length || 0) > 0).length,
    }), [categoryItems, settings]);

    const shown = filtered.slice(0, renderCount);
    const hasMore = renderCount < filtered.length;

    useEffect(() => {
        if (!loadMoreRef.current || !hasMore) return;
        const obs = new IntersectionObserver((e) => { if (e[0].isIntersecting) setRenderCount((c) => c + BATCH); }, { threshold: 0.1 });
        obs.observe(loadMoreRef.current);
        return () => obs.disconnect();
    }, [hasMore, shown.length]);

    // Arriving from search (state.highlightItemId) or an old share link (?itemId=): scroll to it and ring it briefly
    useEffect(() => {
        const fromQuery = new URLSearchParams(location.search).get('itemId');
        const target = (location.state as { highlightItemId?: string } | null)?.highlightItemId || fromQuery;
        if (!target || productSlug || filtered.length === 0) return;
        const idx = filtered.findIndex((i) => String(i.id) === String(target));
        if (idx === -1) return;
        setRenderCount((c) => Math.max(c, idx + 1));
        setHighlight(String(target));
        const s = setTimeout(() => document.getElementById(String(target))?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
        const h = setTimeout(() => { setHighlight(null); if (fromQuery) navigate(location.pathname, { replace: true }); }, 1600);
        return () => { clearTimeout(s); clearTimeout(h); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state, location.search, filtered.length, productSlug]);

    const productHref = useCallback((item: Item) => {
        const g = (groupId && itemInGroup(item, groupId) ? group : undefined) ?? findItemGroup(item, groups);
        return g ? links.product(slugify(g.name), itemSlug(item)) : null;
    }, [groupId, group, groups, links]);
    const openProduct = (item: Item) => { const h = productHref(item); if (h) navigate(h); };

    const addLine = (item: Item, tier?: PriceTier, qty?: number) => {
        const withTier: Item = tier ? { ...item, mrp: tier.mrp, salesPrice: tier.salesPrice, discount: tier.discount ?? 0, tierLabel: tier.label, unitMultiplier: tier.quantity } as CartLineItem : item;
        cart.addToCart(withTier, tier?.id, groupId, qty);
    };

    const renderCard = (item: Item, i: number, opts: { rail?: boolean } = {}) => {
        const qty = cart.quantityOf(item.id);
        const s = productState(item, settings, qty);
        return (
            <ProductCard key={item.id} id={opts.rail ? undefined : String(item.id)} rail={opts.rail} tone={i} name={item.name} unit={s.unit}
                images={getItemImages(item)} price={s.price} mrp={s.mrp} slabPrice={s.slabPrice} priceHidden={!pricesVisible}
                discountPercent={s.discountPercent} showDiscount={s.showDiscount} lowStock={s.lowStock} bulkFrom={s.bulkFrom}
                outOfStock={s.outOfStock} canNotify={s.canNotify} notified={!!actions.notified[item.id!]} hasOptions={s.hasOptions}
                inCart={qty} highlight={highlight === String(item.id)}
                onOpen={() => openProduct(item)}
                onAdd={() => (s.hasOptions ? openProduct(item) : actions.requireLead(() => addLine(item)))}
                onInc={() => (s.hasOptions ? setTierItem(item) : cart.updateQuantity(item.id!, 1))}
                onDec={() => cart.updateQuantity(item.id!, -1)}
                onNotify={() => actions.notify(item)} />
        );
    };

    const sideGroups = useMemo(() => {
        const sec = data?.storePage?.sections?.find((s) => s.type === 'categoryGroups');
        return groupCategories(sec?.type === 'categoryGroups' ? sec.data.groups : undefined, groups, liveItems, data?.pinnedCategoryIds || new Set());
    }, [data, groups, liveItems]);
    const groupHeading = sideGroups.find((g) => g.categories.some((c) => c.id === groupId))?.name;
    const countIn = (gid: string) => liveItems.filter((i) => itemInGroup(i, gid)).length;

    if (resolveError) return <StoreMessage title="Store not found" text="This catalogue link is invalid or has expired. Ask the shop for its current link." />;
    if (error) return <StoreMessage title="We couldn't open this store" text="Check your internet connection and try again." />;
    if (!companyId || !data) return <StoreLoading />;

    const waNumber = business.whatsappNumber || business.phoneNumber;
    const waHref = whatsappUrl(waNumber, product
        ? `Hi, I have a question about ${product.name}: ${window.location.href}`
        : `Hi, I'm interested in your products at ${name}.`);

    const search = (
        <SearchBar items={liveItems} itemGroups={groups} hideUncategorized hideOutOfStock={settings?.hideOutOfStock ?? false}
            hidePrice={!pricesVisible} placeholder="Search products"
            onItemSelected={(item: Item) => {
                if (groupId && itemInGroup(item, groupId) && !productSlug) {
                    navigate(location.pathname, { state: { highlightItemId: item.id, trigger: Date.now() }, replace: true });
                } else openProduct(item);
            }} />
    );

    let body: React.ReactNode;
    if (!group) {
        body = <EmptyState title="This category isn't available" text="The shop may have renamed or removed it. Browse their other categories instead."
            action={<Link to={links.home()} className={btnClass('secondary', 'sm')}>Back to store</Link>} />;
    } else if (productSlug) {
        if (!product) {
            body = <EmptyState title="This product isn't available any more" text={`Have a look at the rest of ${group.name}.`}
                action={<Link to={links.category(slugify(group.name))} className={btnClass('secondary', 'sm')}>See {group.name}</Link>} />;
        } else {
            const related = categoryItems.filter((i) => i.id !== product.id).slice(0, 8);
            body = (
                <div>
                    <ProductView item={product} group={group} groupHref={links.category(slugify(group.name))} homeHref={links.home()}
                        shopName={name} hasGstin={!!business.gstin} settings={settings} pricesVisible={pricesVisible}
                        inCart={cart.quantityOf(product.id)} variants={variantGroup(product, listed)}
                        variantHref={(v) => productHref(v) || '#'} notified={!!actions.notified[product.id!]} whatsappHref={waHref}
                        onAdd={(item, qty, tier) => actions.requireLead(() => addLine(item, tier, qty))}
                        onInc={() => cart.updateQuantity(product.id!, 1)} onDec={() => cart.updateQuantity(product.id!, -1)}
                        onNotify={() => actions.notify(product)}
                        onBulkQuote={() => (approvalEnabled ? actions.requireLead(() => setBulkItem(product)) : setBulkItem(product))}
                        onAsk={() => actions.askQuestion(product)} onViewCart={() => navigate(links.checkout())}
                        related={related.length > 0 && (
                            <section className="pt-10 md:pt-14">
                                <div className="mb-4 flex items-end justify-between gap-4">
                                    <h2 className="text-lg font-semibold text-slate-900 md:text-xl">More from {group.name}</h2>
                                    <Link to={links.category(slugify(group.name))} className="inline-flex items-center gap-0.5 whitespace-nowrap text-sm font-medium text-sf-primary">See all<ChevronRight className="size-4" /></Link>
                                </div>
                                <div className="-mr-4 grid snap-x auto-cols-[148px] grid-flow-col gap-2.5 overflow-x-auto pb-2 pr-4 [scrollbar-width:none] md:mr-0 md:auto-cols-[184px] md:gap-3 md:pr-0">
                                    {related.map((it, i) => <div key={it.id} className="snap-start">{renderCard(it, i, { rail: true })}</div>)}
                                </div>
                            </section>
                        )} />
                </div>
            );
        }
    } else {
        body = (
            <div className="grid items-start gap-6 pt-4 md:grid-cols-[232px_minmax(0,1fr)] md:gap-8 md:pt-6">
                <aside aria-label="Categories" className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto md:grid md:gap-0.5">
                    {sideGroups.map((g, gi) => (
                        <div key={g.id} className={gi ? 'mt-4' : ''}>
                            <h2 className="mb-2 px-3 text-[13px] font-semibold text-slate-500">{g.name}</h2>
                            {g.categories.map((c) => (
                                <Link key={c.id} to={links.category(slugify(c.name))} aria-current={c.id === groupId ? 'page' : undefined}
                                    className={cx('flex justify-between gap-2 rounded-sm px-3 py-2 text-sm', c.id === groupId ? 'bg-sf-soft font-medium text-sf-soft-ink' : 'text-slate-600 hover:bg-white hover:text-slate-900')}>
                                    <span className="truncate">{c.name}</span><span className="text-xs tabular-nums opacity-80">{countIn(c.id!)}</span>
                                </Link>
                            ))}
                        </div>
                    ))}
                </aside>

                <div className="min-w-0">
                    {/* Category chips (phones) */}
                    <div className="-mx-4 -mt-4 mb-4 flex gap-2 overflow-x-auto border-b border-sf-line bg-white px-4 py-3 [scrollbar-width:none] md:hidden">
                        {sideGroups.flatMap((g) => g.categories).map((c) => (
                            <Link key={c.id} to={links.category(slugify(c.name))} replace aria-current={c.id === groupId ? 'page' : undefined}
                                className={cx('inline-flex h-[34px] shrink-0 items-center rounded-sm border px-3.5 text-[13px] font-medium', c.id === groupId ? 'border-slate-900 bg-slate-900 text-white' : 'border-sf-control bg-white text-slate-600')}>
                                {c.name}
                            </Link>
                        ))}
                    </div>

                    <nav aria-label="Breadcrumb" className="hidden flex-wrap items-center gap-1.5 text-[13px] text-slate-500 md:flex">
                        <Link to={links.home()} className="font-medium text-sf-primary">Store</Link><ChevronRight className="size-3.5" />
                        {groupHeading && <><span>{groupHeading}</span><ChevronRight className="size-3.5" /></>}
                        <span>{group.name}</span>
                    </nav>

                    <div className="flex flex-wrap items-end justify-between gap-3 md:mt-2">
                        <div className="min-w-0">
                            <h1 className="text-lg font-semibold tracking-tight text-slate-900 md:text-2xl">{group.name}</h1>
                            <p className="text-xs text-slate-500 md:text-[13px]">{categoryItems.length} product{categoryItems.length === 1 ? '' : 's'}{group.description ? ` · ${group.description}` : ''}</p>
                        </div>
                        <label className="relative inline-flex items-center">
                            <span className="sr-only">Sort</span>
                            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}
                                className="h-[34px] appearance-none rounded-sm border border-sf-control bg-white pl-3 pr-8 text-[13px] font-medium text-slate-900">
                                {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2.5 size-4 text-slate-500" />
                        </label>
                    </div>

                    <div className="-mx-4 mb-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:mb-5 md:mt-4 md:flex-wrap md:px-0">
                        {([['all', `All ${categoryItems.length}`, true], ['stock', 'In stock', counts.stock > 0], ['offer', 'On offer', pricesVisible && counts.offer > 0], ['bulk', 'Bulk rates', pricesVisible && counts.bulk > 0]] as [Filter, string, boolean][])
                            .filter(([, , show]) => show)
                            .map(([id, label]) => (
                                <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setRenderCount(BATCH); }}
                                    className={cx('inline-flex h-[34px] shrink-0 items-center rounded-sm border px-3.5 text-[13px] font-medium', filter === id ? 'border-slate-900 bg-slate-900 text-white' : 'border-sf-control bg-white text-slate-600')}>
                                    {label}
                                </button>
                            ))}
                    </div>

                    {filtered.length === 0 ? (
                        <div className="rounded-sm border border-sf-line bg-white">
                            <EmptyState icon={<Search className="size-7" strokeWidth={1.5} />}
                                title={categoryItems.length ? 'No products match this filter' : 'Nothing here yet'}
                                text={categoryItems.length ? 'Try All to see every product in this category.' : `New stock for ${group.name} arrives soon. Browse other categories meanwhile.`}
                                action={categoryItems.length
                                    ? <button type="button" onClick={() => setFilter('all')} className={btnClass('secondary', 'sm')}>Show all</button>
                                    : <Link to={links.home()} className={btnClass('secondary', 'sm')}>Back to store</Link>} />
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-4 lg:grid-cols-4">
                            {shown.map((item, i) => renderCard(item, i))}
                            {hasMore && Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={`sk${i}`} />)}
                        </div>
                    )}
                    {hasMore && <div ref={loadMoreRef} className="h-10" aria-hidden />}
                    {filtered.length > 0 && <p className="mt-3 text-center text-xs text-slate-500">Showing {shown.length} of {filtered.length}</p>}
                </div>
            </div>
        );
    }

    return (
        // Room under the footer for the floating cart bar, or the product page's buy row on phones
        <div className={cx('flex min-h-[100dvh] flex-col bg-sf-canvas font-sans text-slate-900', productSlug ? 'pb-24 md:pb-0' : cart.cartCount > 0 && 'pb-24')}>
            <LeadPopUp companyId={companyId} companyName={name} autoPopup={false} detailsOnly={!approvalEnabled}
                forceOpen={actions.leadOpen} onLeadSubmit={actions.onLeadSubmit} />
            <StoreHeader name={name} logo={business.companyLogo} tagline={[business.businessCategory, business.city].filter(Boolean).join(' · ')}
                homeTo={links.home()} cartCount={cart.cartCount} onCart={() => navigate(links.checkout())}
                onAsk={() => actions.askQuestion()} search={search}
                onBack={() => (window.history.length > 1 ? navigate(-1) : navigate(product && group ? links.category(slugify(group.name)) : links.home()))}
                hideSearchOnMobile={!!productSlug} />

            <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-10 md:px-10">
                {approvalEnabled && leadStatus === 'pending' && <div className="pt-4"><Note tone="warning">Waiting for approval. You'll see prices once {name} approves you.</Note></div>}
                {approvalEnabled && leadStatus === 'declined' && <div className="pt-4"><Note tone="danger">Your request was declined. Please contact the shop.</Note></div>}
                {body}
            </main>

            <StoreFooter name={name} about={business.brandingText} address={storeAddress(business)}
                phone={formatPhone(business.phoneNumber)} whatsapp={formatPhone(business.whatsappNumber)}
                instagram={business.instagram} facebook={business.facebook} gstin={business.gstin} email={business.email} />

            {!productSlug && <CartBar count={cart.cartCount} total={cart.cartTotal} hideTotal={!pricesVisible} onClick={() => navigate(links.checkout())} />}
            {!productSlug && <WhatsAppFab href={waHref} lifted={cart.cartCount > 0} />}

            {bulkItem && <BulkQuotePopup item={bulkItem} companyId={companyId} onClose={() => setBulkItem(null)} />}
            <TierPickerModal item={tierItem} isOpen={!!tierItem} onClose={() => setTierItem(null)} hidePrice={!pricesVisible}
                onSelect={(item, tier) => actions.requireLead(() => addLine(item, tier.id === '__base__' ? undefined : tier))} />
            <AskSheet open={actions.askOpen} itemName={actions.askItem?.name} onClose={actions.closeAsk} onSubmit={actions.submitQuestion} />
            {actions.toast && (
                <div className="fixed inset-x-3 top-3 z-[2100] md:left-1/2 md:w-[420px] md:-translate-x-1/2">
                    <Note tone="success" icon={<CheckCircle2 className="size-4" />} onClose={() => actions.setToast(null)}>{actions.toast}</Note>
                </div>
            )}
        </div>
    );
};

export default CategoryPage;
