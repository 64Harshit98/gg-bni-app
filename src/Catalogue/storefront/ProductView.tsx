import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, ChevronRight, FileText, MessageCircle, Share2, ShieldCheck, ShoppingCart, X } from 'lucide-react';
import type { Item, ItemGroup, PriceTier, AddOnGroup, AddOnOption } from '../../constants/models';
import { getSlabForQty, extraChargeOf } from '../../constants/models';
import type { CatalogueSalesSettings } from '../Settings/CatalogueSalesSetting';
import { getAllTiers, getEffectivePriceInfo } from '../../Pages/utils/pricingUtils';
import { productState } from './productState';
import { PriceBlock, QtyStepper, Tag, btnClass, toneClass } from './StoreUI';
import { formatINR, getItemImages } from './storefront.utils';
import { ZoomPhoto } from './ZoomPhoto';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

interface Props {
    item: Item;
    group?: ItemGroup;
    groupHref: string;
    homeHref: string;
    shopName: string;
    hasGstin: boolean;
    settings: CatalogueSalesSettings | null;
    pricesVisible: boolean;
    inCart: number;
    variants: Item[];
    variantHref: (v: Item) => string;
    notified: boolean;
    whatsappHref: string | null;
    related: React.ReactNode;
    onAdd: (item: Item, quantity: number, tier?: PriceTier, addOns?: AddOnOption[]) => void;
    /** Item settings "Enable add-ons". Defaults to true */
    addOnsEnabled?: boolean;
    /** Change the quantity already in the cart (single-piece line) */
    onInc: () => void;
    onDec: () => void;
    onNotify: () => void;
    onBulkQuote: () => void;
    onAsk: () => void;
    onViewCart: () => void;
    /** Product page builder: breadcrumbs don't navigate and variants switch through onVariantSelect */
    preview?: boolean;
    onVariantSelect?: (v: Item) => void;
    /** Link the Share button sends (defaults to this page); null hides Share */
    shareUrl?: string | null;
}

/** Full product page (replaces the old bottom drawer): gallery, price, packs, variants, bulk rates, add to cart. */
export const ProductView: React.FC<Props> = (p) => {
    const { item, settings, pricesVisible } = p;
    const images = getItemImages(item);
    const [photoIdx, setPhoto] = useState(0);
    const photo = Math.min(photoIdx, Math.max(0, images.length - 1)); // photos can be removed while the builder previews
    const tiers = useMemo(() => (item.priceTiers?.length ? getAllTiers(item) : []), [item]);
    const [tierId, setTierId] = useState<string>('__base__');
    const minQty = Math.max(1, Number(item.moq) || 1);
    const [qty, setQty] = useState(minQty);
    // Add-ons: chosen option ids per group
    const [addOnSel, setAddOnSel] = useState<Record<string, string[]>>({});
    const hasAddOns = (p.addOnsEnabled ?? true) && (item.addOnGroups?.length ?? 0) > 0;
    const [addOnOpen, setAddOnOpen] = useState(false); // add-ons popup (opens on "Add to cart")

    useEffect(() => { setPhoto(0); setTierId('__base__'); setQty(minQty); setAddOnSel({}); setAddOnOpen(false); }, [item.id, minQty]);

    const s = productState(item, settings, 0);
    // Once a single-piece product is in the cart, the stepper edits the cart itself (packs keep the picker)
    const editsCart = tiers.length === 0 && !hasAddOns && p.inCart > 0;
    const stockCap = settings?.allowNegativeInventory || tierId !== '__base__' ? Infinity : Number(item.stock || 0);
    const atCap = editsCart ? p.inCart >= stockCap : qty + p.inCart >= stockCap;
    const tier = tiers.find((t) => t.id === tierId);
    const tierPrice = tier && tier.id !== '__base__' ? getEffectivePriceInfo(tier) : null;
    const basePrice = tierPrice ? tierPrice.salePrice : s.price;
    const baseMrp = tierPrice ? (settings?.priceDisplayMode === 'salePrice' ? 0 : tierPrice.mrp) : s.mrp;
    const slab = !tierPrice && s.slabs.length ? getSlabForQty(item, qty) : null;
    const unitPrice = slab && slab.salesPrice < basePrice ? slab.salesPrice : basePrice;
    const saving = baseMrp > unitPrice ? baseMrp - unitPrice : 0;

    const addOnLimit = (g: AddOnGroup) => (g.multiple ? Number(g.maxSelect) || 0 : 0);
    const hasExtraPrice = (g: AddOnGroup) => g.extraPrice != null;
    // Going over the limit is only blocked when the group has no extra price
    const atAddOnLimit = (g: AddOnGroup) => !hasExtraPrice(g) && addOnLimit(g) > 0 && (addOnSel[g.id] ?? []).length >= addOnLimit(g);
    // Selection order: choices beyond the limit carry the extra price
    const pickedAddOns: AddOnOption[] = hasAddOns
        ? (item.addOnGroups ?? []).flatMap((g: AddOnGroup) =>
            (addOnSel[g.id] ?? []).flatMap((id, idx) => {
                const o = g.options.find((x) => x.id === id);
                if (!o) return [];
                if (addOnLimit(g) > 0 && hasExtraPrice(g)) {
                    return [{ ...o, price: idx >= addOnLimit(g) ? extraChargeOf(g, o) : 0 }];
                }
                return [o];
            }))
        : [];
    const addOnExtra = pickedAddOns.reduce((sum, o) => sum + (Number(o.price) || 0), 0);
    // Price shown on an option: choices beyond the limit carry the extra price
    const optionPriceFor = (g: AddOnGroup, optId: string): number => {
        const opt = g.options.find((x) => x.id === optId);
        const base = Number(opt?.price) || 0;
        if (!opt || addOnLimit(g) <= 0 || !hasExtraPrice(g)) return base;
        const sel = addOnSel[g.id] ?? [];
        const idx = sel.indexOf(optId);
        const isExtra = idx >= 0 ? idx >= addOnLimit(g) : sel.length >= addOnLimit(g);
        return isExtra ? extraChargeOf(g, opt) : 0;
    };
    const toggleAddOn = (g: AddOnGroup, optionId: string) => {
        setAddOnSel((prev) => {
            const cur = prev[g.id] ?? [];
            const has = cur.includes(optionId);
            if (!has && !hasExtraPrice(g) && addOnLimit(g) > 0 && cur.length >= addOnLimit(g)) return prev; // "Choose up to N"
            if (!has && g.options.find((o) => o.id === optionId)?.soldOut) return prev;
            const next = g.multiple ? (has ? cur.filter((id) => id !== optionId) : [...cur, optionId]) : (has ? [] : [optionId]);
            return { ...prev, [g.id]: next };
        });
    };

    const share = async () => {
        const url = p.shareUrl ?? window.location.href;
        try {
            if (navigator.share) await navigator.share({ title: item.name, url });
            else await navigator.clipboard.writeText(url);
        } catch { /* cancelled */ }
    };

    // withAddOns=false: "Skip add-ons" adds the plain item
    const add = (withAddOns = true) => {
        p.onAdd(item, Math.min(qty, Math.max(0, stockCap - p.inCart)), tier && tier.id !== '__base__' ? tier : undefined, withAddOns ? pickedAddOns : []);
        setQty(minQty);
        setAddOnSel({});
        setAddOnOpen(false);
    };
    const closeAddOns = () => { setAddOnOpen(false); setAddOnSel({}); };
    // Items with add-ons: the button opens the popup first
    const onBuyClick = () => (hasAddOns ? setAddOnOpen(true) : add());

    const buyButton = s.outOfStock
        ? (s.canNotify
            ? <button type="button" disabled={p.notified} onClick={p.onNotify} className={cx(btnClass('secondary', 'lg', true), 'min-w-0')}>
                <Bell className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{p.notified ? "You'll be notified" : 'Notify me when in stock'}</span>
            </button>
            : <button type="button" disabled className={btnClass('secondary', 'lg', true)}>Out of stock</button>)
        : editsCart
            ? <button type="button" onClick={p.onViewCart} className={btnClass('primary', 'lg', true)}>
                <ShoppingCart className="size-4" />View cart
            </button>
            : <button type="button" onClick={onBuyClick} disabled={p.inCart >= stockCap} className={cx(btnClass('primary', 'lg', true), 'min-w-0')}>
                <ShoppingCart className="size-4 shrink-0" /><span className="min-w-0 truncate">Add to cart{pricesVisible ? ` · ${formatINR((unitPrice + addOnExtra) * qty)}` : ''}</span>
            </button>;

    // Breadcrumb / category links: plain text in the builder's preview
    const crumb = (to: string, label: string, className: string) =>
        p.preview ? <span className={className}>{label}</span> : <Link to={to} className={className}>{label}</Link>;

    const specs: [string, string][] = [
        ['Unit', s.unit],
        ...(item.packetSize ? [['Pack', `${item.packetSize} pcs`] as [string, string]] : []),
        ...(Number(item.moq) > 1 ? [['Minimum order', `${item.moq}`] as [string, string]] : []),
        ...(item.hsnSac ? [['HSN', item.hsnSac] as [string, string]] : []),
    ];

    return (
        <>
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 pt-4 text-[13px] text-slate-500 md:pt-5">
                {crumb(p.homeHref, 'Store', 'font-medium text-sf-primary')}<ChevronRight className="size-3.5" />
                {p.group && <>{crumb(p.groupHref, p.group.name, 'font-medium text-sf-primary')}<ChevronRight className="size-3.5" /></>}
                <span className="line-clamp-1">{item.name}</span>
            </nav>

            <div className="mt-4 grid items-start gap-5 md:mt-5 md:grid-cols-[7fr_5fr] md:gap-10">
                {/* Gallery */}
                <div className={cx('grid gap-3', images.length > 1 && 'md:grid-cols-[72px_minmax(0,1fr)]')}>
                    <div className="relative order-1 md:order-2">
                        <ZoomPhoto src={images[photo]} alt={item.name} className="aspect-square border border-sf-line" />
                        {s.showDiscount && pricesVisible && <span className="absolute left-3 top-3"><Tag tone="success">{s.discountPercent}% off</Tag></span>}
                    </div>
                    {images.length > 1 && (
                        <div className="order-2 flex gap-2 overflow-x-auto md:order-1 md:grid md:content-start md:overflow-visible">
                            {images.map((url, i) => (
                                <button key={url + i} type="button" onClick={() => setPhoto(i)} aria-label={`Photo ${i + 1}`} aria-current={i === photo}
                                    className={cx('size-16 shrink-0 overflow-hidden rounded-sm border bg-white md:size-[72px]', i === photo ? 'border-2 border-sf-primary' : 'border-sf-line')}>
                                    <img src={url} alt="" className="h-full w-full object-contain" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Buy box */}
                <div className="grid gap-5">
                    <div>
                        {p.group && crumb(p.groupHref, p.group.name, 'text-[13px] font-medium text-sf-primary')}
                        <h1 className="mt-1 text-[19px] font-semibold leading-[26px] tracking-tight text-slate-900 md:text-2xl md:leading-8">{item.name}</h1>
                        <p className="mt-1 text-[13px] text-slate-500">{s.unit}</p>
                    </div>

                    <div>
                        <PriceBlock price={unitPrice} mrp={baseMrp} hidden={!pricesVisible} large showOff />
                        {pricesVisible && <p className="mt-0.5 text-xs text-slate-500">Incl. GST{saving > 0 ? ` · You save ${formatINR(saving)}` : ''}</p>}
                        <div className="mt-2.5">
                            {s.outOfStock ? <Tag tone="inverse">Out of stock</Tag> : s.lowStock ? <Tag tone="warning">Only {s.lowStock} left</Tag> : <Tag tone="success"><Check className="size-3.5" />In stock</Tag>}
                        </div>
                    </div>

                    {tiers.length > 0 && (
                        <div>
                            <p className="mb-2 text-[13px] font-medium text-slate-900">Pack</p>
                            <div className="flex flex-wrap gap-2">
                                {tiers.map((t) => {
                                    const tp = getEffectivePriceInfo(t);
                                    const on = t.id === tierId;
                                    return (
                                        <button key={t.id} type="button" aria-pressed={on} onClick={() => setTierId(t.id)}
                                            className={cx('min-h-12 rounded-sm px-3.5 py-1.5 text-left', on ? 'border-2 border-sf-primary bg-sf-soft' : 'border border-sf-control bg-white')}>
                                            <b className="block text-[13px] font-medium leading-[18px] text-slate-900">{t.label || 'Single'}</b>
                                            {pricesVisible && <small className={cx('block text-xs tabular-nums', on ? 'text-sf-soft-ink' : 'text-slate-500')}>
                                                {formatINR(tp.salePrice)}{t.quantity > 1 ? ` · ${formatINR(tp.salePrice / t.quantity)} each` : ''}
                                            </small>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {p.variants.length > 1 && (
                        <div>
                            <p className="mb-2 text-[13px] font-medium text-slate-900">Options</p>
                            <div className="flex flex-wrap gap-2">
                                {p.variants.map((v, i) => {
                                    const on = v.id === item.id;
                                    const vs = productState(v, settings, 0);
                                    const img = getItemImages(v)[0];
                                    const chipClass = cx('flex min-h-12 items-center gap-2.5 rounded-sm py-1.5 pl-1.5 pr-3 text-left', on ? 'border-2 border-sf-primary bg-sf-soft' : 'border border-sf-control bg-white', vs.outOfStock && !on && 'opacity-60');
                                    const chip = (
                                        <>
                                            <span className={cx('size-9 shrink-0 overflow-hidden rounded-sm', img ? 'bg-white' : toneClass(i))}>{img && <img src={img} alt="" className="h-full w-full object-cover" />}</span>
                                            <span className="min-w-0">
                                                <b className="block max-w-[160px] truncate text-[13px] font-medium leading-[18px] text-slate-900">{v.name}</b>
                                                <small className="block text-xs tabular-nums text-slate-500">{vs.outOfStock ? 'Out of stock' : pricesVisible ? formatINR(vs.price) : ''}</small>
                                            </span>
                                        </>
                                    );
                                    return p.onVariantSelect
                                        ? <button key={v.id} type="button" onClick={() => p.onVariantSelect!(v)} aria-current={on} className={chipClass}>{chip}</button>
                                        : <Link key={v.id} to={p.variantHref(v)} replace aria-current={on} className={chipClass}>{chip}</Link>;
                                })}
                            </div>
                        </div>
                    )}

                    {pricesVisible && s.slabs.length > 0 && !tierPrice && (
                        <div>
                            <div className="mb-2 flex items-center justify-between">
                                <p className="text-[13px] font-medium text-slate-900">Bulk rates</p>
                                <button type="button" onClick={p.onBulkQuote} className="text-[13px] font-medium text-sf-primary hover:underline">Ask for a bulk quote</button>
                            </div>
                            <table className="w-full overflow-hidden rounded-sm border border-sf-line text-[13px]">
                                <thead className="bg-sf-sunken text-xs text-slate-500">
                                    <tr><th className="px-3 py-2 text-left font-medium">Quantity</th><th className="px-3 py-2 text-right font-medium">Price each</th><th className="px-3 py-2 text-right font-medium">You save</th></tr>
                                </thead>
                                <tbody className="tabular-nums">
                                    {s.slabs.map((sl) => {
                                        const on = slab?.id === sl.id;
                                        const save = basePrice - sl.salesPrice;
                                        return (
                                            <tr key={sl.id} aria-current={on} className={cx('border-t border-sf-line', on && 'bg-sf-soft font-medium text-sf-soft-ink')}>
                                                <td className="px-3 py-2">{sl.maxQty === null ? `${sl.minQty} and more` : `${sl.minQty} – ${sl.maxQty}`}</td>
                                                <td className="px-3 py-2 text-right">{formatINR(sl.salesPrice)}</td>
                                                <td className="px-3 py-2 text-right">{save > 0 ? `${formatINR(save)} each` : 'Base price'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Buy row: sticky at the bottom on phones */}
                    <div className={cx('inset-x-0 bottom-0 flex gap-3 border-t border-sf-line bg-white px-4 pb-5 pt-3 shadow-sf-float md:static md:z-auto md:grid md:border-0 md:bg-transparent md:p-0 md:shadow-none',
                        s.outOfStock ? 'md:grid-cols-1' : 'md:grid-cols-[136px_minmax(0,1fr)]',
                        p.preview ? 'sticky z-10 -mx-4 md:mx-0' : 'fixed z-[66]')}>
                        {!s.outOfStock && (editsCart
                            ? <QtyStepper value={p.inCart} outline trashAtOne className="h-12 w-[128px] shrink-0 md:w-auto"
                                onDec={p.onDec} onInc={p.onInc} incDisabled={atCap} />
                            : <QtyStepper value={qty} outline className="h-12 w-[128px] shrink-0 md:w-auto" incDisabled={atCap}
                                onDec={() => setQty((q) => Math.max(minQty, q - 1))} onInc={() => setQty((q) => q + 1)} />)}
                        <div className="min-w-0 flex-1">{buyButton}</div>
                    </div>

                    {!s.outOfStock && atCap && Number.isFinite(stockCap) && (
                        <p className="-mt-3 text-[13px] text-yellow-800">Only {stockCap} in stock{p.inCart > 0 ? ` · ${p.inCart} already in your cart` : ''}.</p>
                    )}

                    {p.inCart > 0 && (
                        <div className="flex items-center justify-between gap-3 rounded-sm bg-green-50 px-3 py-2.5 text-[13px] text-green-800">
                            <span className="flex items-center gap-2"><Check className="size-4" />{p.inCart} in your cart</span>
                            {!editsCart && <button type="button" onClick={p.onViewCart} className="font-semibold underline">View cart</button>}
                        </div>
                    )}

                    <div className="-mt-1 flex flex-wrap gap-2">
                        {p.whatsappHref && <a href={p.whatsappHref} target="_blank" rel="noopener noreferrer" className={btnClass('whatsapp')}><MessageCircle className="size-4" />Ask on WhatsApp</a>}
                        <button type="button" onClick={p.onAsk} className={btnClass('ghost')}>Ask a question</button>
                        {p.shareUrl !== null && <button type="button" onClick={share} className={btnClass('ghost')}><Share2 className="size-4" />Share</button>}
                    </div>

                    <div className="grid gap-2.5 rounded-sm bg-sf-sunken p-4 text-[13px] text-slate-600">
                        <div className="flex items-start gap-2.5"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-500" />{p.shopName} confirms stock and delivery on WhatsApp before packing.</div>
                        {p.hasGstin && <div className="flex items-start gap-2.5"><FileText className="mt-0.5 size-4 shrink-0 text-slate-500" />GST bill with every order.</div>}
                    </div>
                </div>
            </div>

            {(item.description || specs.length > 0) && (
                <section className="grid gap-4 pt-10 md:grid-cols-[7fr_5fr] md:gap-10 md:pt-14">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 md:text-xl">About this product</h2>
                        <p className="mt-3 max-w-[62ch] whitespace-pre-line text-sm leading-[22px] text-slate-600 md:text-[15px] md:leading-6">
                            {item.description || 'The shop has not added a description yet. Ask them anything about this product.'}
                        </p>
                    </div>
                    <div className="rounded-sm border border-sf-line bg-white p-4 shadow-sf-card md:p-5">
                        <h3 className="mb-3 text-base font-semibold text-slate-900">Details</h3>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
                            {specs.map(([k, v]) => <React.Fragment key={k}><dt className="text-slate-500">{k}</dt><dd className="tabular-nums text-slate-900">{v}</dd></React.Fragment>)}
                        </dl>
                    </div>
                </section>
            )}

            {/* Add-ons popup: bottom sheet on phones, centred card on desktop */}
            {addOnOpen && hasAddOns && (
                <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/45 md:items-center md:p-4" onClick={closeAddOns}>
                    <div
                        role="dialog"
                        aria-label={`Add-ons for ${item.name}`}
                        className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-sm bg-white shadow-sf-float md:max-w-md md:rounded-sm"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 border-b border-sf-line px-4 pb-3 pt-4">
                            <div className="min-w-0">
                                <h2 className="line-clamp-1 text-base font-semibold text-slate-900">{item.name}</h2>
                                <p className="mt-0.5 text-[13px] text-slate-500">Choose add-ons (optional)</p>
                            </div>
                            <button type="button" onClick={closeAddOns} aria-label="Close"
                                className="grid size-9 shrink-0 place-items-center rounded-sm text-slate-500 hover:bg-sf-sunken hover:text-slate-900">
                                <X className="size-5" />
                            </button>
                        </div>

                        <div className="grid flex-1 gap-5 overflow-y-auto px-4 py-4">
                            {(item.addOnGroups ?? []).map((g: AddOnGroup) => (
                                <div key={g.id}>
                                    <div className="mb-2 flex items-center justify-between">
                                        <p className="text-[13px] font-medium text-slate-900">{g.name}</p>
                                        <small className="text-xs text-slate-500">
                                            {g.multiple ? (addOnLimit(g) > 0 ? `Choose up to ${addOnLimit(g)}${hasExtraPrice(g) ? ' · more picks are paid' : ''}` : 'Choose any') : 'Choose one'}
                                        </small>
                                    </div>
                                    <div className="grid gap-2">
                                        {/* plain options first, linked inventory items after, under "Items" */}
                                        {[...g.options].sort((a, b) => Number(!!a.itemId) - Number(!!b.itemId)).map((o, idx, arr) => {
                                            const on = (addOnSel[g.id] ?? []).includes(o.id);
                                            const price = optionPriceFor(g, o.id);
                                            const off = !on && (atAddOnLimit(g) || !!o.soldOut);
                                            const firstLinked = !!o.itemId && (idx === 0 || !arr[idx - 1].itemId);
                                            return (
                                                <React.Fragment key={o.id}>
                                                    {firstLinked && <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Items</p>}
                                                    <button type="button" aria-pressed={on} onClick={() => toggleAddOn(g, o.id)} disabled={off}
                                                        className={cx('flex min-h-12 items-center justify-between gap-3 rounded-sm px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-45',
                                                            on ? 'border-2 border-sf-primary bg-sf-soft' : 'border border-sf-control bg-white hover:bg-sf-sunken')}>
                                                        <span className="flex min-w-0 items-center gap-2.5">
                                                            <span className={cx('grid size-5 shrink-0 place-items-center border rounded-sm',
                                                                on ? 'border-sf-primary bg-sf-primary text-white' : 'border-sf-control bg-white')}>
                                                                {on && <Check className="size-3.5" strokeWidth={3} />}
                                                            </span>
                                                            <b className={cx('truncate text-[13px] font-medium', on ? 'text-sf-soft-ink' : 'text-slate-900')}>{o.name}</b>
                                                        </span>
                                                        {(pricesVisible || o.soldOut) && (
                                                            <small className={cx('shrink-0 text-xs tabular-nums', on ? 'text-sf-soft-ink' : 'text-slate-500')}>
                                                                {o.soldOut ? 'Out of stock' : price > 0 ? `+ ${formatINR(price)}` : 'Free'}
                                                            </small>
                                                        )}
                                                    </button>
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-2 border-t border-sf-line px-4 pb-5 pt-3">
                            {pricesVisible && (
                                <p className="flex justify-between text-[13px] text-slate-600">
                                    <span>{pickedAddOns.length} add-on{pickedAddOns.length === 1 ? '' : 's'}{addOnExtra > 0 ? ` · + ${formatINR(addOnExtra)}` : ''}</span>
                                    <span>Qty {qty}</span>
                                </p>
                            )}
                            <button type="button" onClick={() => add(true)} className={btnClass('primary', 'lg', true)}>
                                <ShoppingCart className="size-4" />Add to cart{pricesVisible ? ` · ${formatINR((unitPrice + addOnExtra) * qty)}` : ''}
                            </button>
                            <button type="button" onClick={() => add(false)} className={btnClass('secondary', 'lg', true)}>Skip add-ons</button>
                        </div>
                    </div>
                </div>
            )}

            {p.related}
        </>
    );
};
