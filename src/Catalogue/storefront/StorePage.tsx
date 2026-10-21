import React, { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import type { Item } from '../../constants/models';
import LeadPopUp from '../PopUp';
import SearchBar from '../SearchBar';
import { useLeadStatus, useResolvedCompanyId, useStoreLinks, useStorefrontData } from './useStorefront';
import { needsLead, useStorefrontCart } from './useStorefrontCart';
import { useCustomerActions } from './useCustomerActions';
import { canSeePrices, productState } from './productState';
import { AskSheet, CartBar, Note, ProductCard, StoreFooter, StoreHeader, StoreLoading, StoreMessage, WhatsAppFab } from './StoreUI';
import { StoreSectionView, storeAddress, type SectionContext } from './StoreSections';
import { starterStorePage } from './storePage.types';
import { findItemGroup, formatPhone, getItemGroupIds, getItemImages, itemSlug, slugify, whatsappUrl } from './storefront.utils';

/** The shop's home: the owner's Store page (banners, every category as tiles, pinned products, their sections). */
const StorePage: React.FC = () => {
    const { companyId: pathId } = useParams<{ companyId: string }>();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const { companyId, error: resolveError, subdomain } = useResolvedCompanyId(pathId);
    const links = useStoreLinks(companyId, subdomain);
    const { data, error } = useStorefrontData(companyId);
    const settings = data?.settings ?? null;
    const approvalEnabled = settings?.requireApproval === true;

    const actions = useCustomerActions(companyId, approvalEnabled);
    const leadStatus = useLeadStatus(companyId, actions.leadPhoneKey);
    const pricesVisible = canSeePrices(settings, leadStatus);

    const liveItems = useMemo(() => (data?.items || []).filter((i) =>
        i.isListed && getItemGroupIds(i).some((id) => id !== 'uncategorized')), [data]);

    const cart = useStorefrontCart({ companyId, settings, allItems: data?.items || [], currentUser });
    const business = data?.business || {};
    const name = business.businessName || 'Our shop';

    useEffect(() => { if (data) document.title = name; }, [data, name]);

    // Shops that approve customers first: ask for details after 10 seconds, as before
    useEffect(() => {
        if (!approvalEnabled || !needsLead()) return;
        const t = setTimeout(() => actions.openLead(), 10000);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [approvalEnabled]);

    const productHref = (item: Item) => {
        const g = findItemGroup(item, data?.groups || []);
        return g ? links.product(slugify(g.name), itemSlug(item)) : null;
    };
    const openProduct = (item: Item) => { const href = productHref(item); if (href) navigate(href); };

    const pinnedItems = useMemo(() => liveItems.filter((i) =>
        data?.pinnedItemIds.has(i.id!) && !(settings?.hideOutOfStock && (i.stock || 0) <= 0)), [liveItems, data, settings]);

    const page = data?.storePage?.sections?.length ? data.storePage : starterStorePage(name, business.brandingText);

    const ctx: SectionContext = {
        groups: data?.groups || [],
        liveItems,
        pinnedCategoryIds: data?.pinnedCategoryIds || new Set(),
        business,
        categoryHref: links.category,
        renderPinnedCards: () => pinnedItems.map((item, i) => {
            const qty = cart.quantityOf(item.id);
            const s = productState(item, settings, qty);
            const group = findItemGroup(item, data?.groups || []);
            return (
                <ProductCard key={item.id} rail tone={i} name={item.name} unit={s.unit} images={getItemImages(item)}
                    price={s.price} mrp={s.mrp} slabPrice={s.slabPrice} priceHidden={!pricesVisible}
                    discountPercent={s.discountPercent} showDiscount={s.showDiscount} lowStock={s.lowStock}
                    outOfStock={s.outOfStock} canNotify={s.canNotify} notified={!!actions.notified[item.id!]}
                    hasOptions={s.hasOptions} inCart={qty}
                    onOpen={() => openProduct(item)}
                    onAdd={() => (s.hasOptions ? openProduct(item) : actions.requireLead(() => cart.addToCart(item, undefined, group?.id)))}
                    onInc={() => (s.hasOptions ? openProduct(item) : cart.updateQuantity(item.id!, 1))}
                    onDec={() => cart.updateQuantity(item.id!, -1)}
                    onNotify={() => actions.notify(item)} />
            );
        }),
    };

    if (resolveError) return <StoreMessage title="Store not found" text="This catalogue link is invalid or has expired. Ask the shop for its current link." />;
    if (error) return <StoreMessage title="We couldn't open this store" text="Check your internet connection and try again." />;
    if (!companyId || !data) return <StoreLoading />;

    const waHref = whatsappUrl(business.whatsappNumber || business.phoneNumber, `Hi, I'm interested in your products at ${name}.`);
    const search = (
        <SearchBar items={liveItems} itemGroups={data.groups} hideUncategorized hideOutOfStock={settings?.hideOutOfStock ?? false}
            hidePrice={!pricesVisible} placeholder="Search products" onItemSelected={openProduct} />
    );

    return (
        <div className={`flex min-h-[100dvh] flex-col bg-sf-canvas font-sans text-slate-900 ${cart.cartCount > 0 ? 'pb-24' : ''}`}>
            <LeadPopUp companyId={companyId} companyName={name} autoPopup={false} detailsOnly={!approvalEnabled}
                forceOpen={actions.leadOpen} onLeadSubmit={actions.onLeadSubmit} />
            <StoreHeader name={name} logo={business.companyLogo} tagline={[business.businessCategory, business.city].filter(Boolean).join(' · ')}
                homeTo={links.home()} cartCount={cart.cartCount} onCart={() => navigate(links.checkout())}
                onAsk={() => actions.askQuestion()} search={search} />

            <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-10 md:px-10">
                {approvalEnabled && leadStatus === 'pending' && (
                    <div className="pt-4"><Note tone="warning">Waiting for approval. You'll see prices once {name} approves you.</Note></div>
                )}
                {approvalEnabled && leadStatus === 'declined' && (
                    <div className="pt-4"><Note tone="danger">Your request was declined. Please contact the shop.</Note></div>
                )}
                {page.sections.map((s) => <StoreSectionView key={s.id} section={s} ctx={ctx} />)}
            </main>

            <StoreFooter name={name} about={business.brandingText} address={storeAddress(business)}
                phone={formatPhone(business.phoneNumber)} whatsapp={formatPhone(business.whatsappNumber)}
                instagram={business.instagram} facebook={business.facebook} gstin={business.gstin} email={business.email} />

            <CartBar count={cart.cartCount} total={cart.cartTotal} hideTotal={!pricesVisible} onClick={() => navigate(links.checkout())} />
            <WhatsAppFab href={waHref} lifted={cart.cartCount > 0} />
            <AskSheet open={actions.askOpen} itemName={actions.askItem?.name} onClose={actions.closeAsk} onSubmit={actions.submitQuestion} />
            {actions.toast && (
                <div className="fixed inset-x-3 top-3 z-[2100] md:left-1/2 md:w-[420px] md:-translate-x-1/2">
                    <Note tone="success" icon={<CheckCircle2 className="size-4" />} onClose={() => actions.setToast(null)}>{actions.toast}</Note>
                </div>
            )}
        </div>
    );
};

export default StorePage;
