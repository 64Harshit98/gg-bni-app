import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check, ChevronRight, FileText, MessageCircle, Share2, ShieldCheck, ShoppingCart } from 'lucide-react';
import type { Item, ItemGroup, PriceTier } from '../../constants/models';
import { getSlabForQty } from '../../constants/models';
import type { CatalogueSalesSettings } from '../Settings/CatalogueSalesSetting';
import { getAllTiers, getEffectivePriceInfo } from '../../Pages/utils/pricingUtils';
import { productState } from './productState';
import { Photo, PriceBlock, QtyStepper, Tag, btnClass, toneClass } from './StoreUI';
import { formatINR, getItemImages } from './storefront.utils';

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
    onAdd: (item: Item, quantity: number, tier?: PriceTier) => void;
    /** Change the quantity already in the cart (single-piece line) */
    onInc: () => void;
    onDec: () => void;
    onNotify: () => void;
    onBulkQuote: () => void;
    onAsk: () => void;
    onViewCart: () => void;
}

/** Full product page (replaces the old bottom drawer): gallery, price, packs, variants, bulk rates, add to cart. */
export const ProductView: React.FC<Props> = (p) => {
    const { item, settings, pricesVisible } = p;
    const images = getItemImages(item);
    const [photo, setPhoto] = useState(0);
    const tiers = useMemo(() => (item.priceTiers?.length ? getAllTiers(item) : []), [item]);
    const [tierId, setTierId] = useState<string>('__base__');
    const minQty = Math.max(1, Number(item.moq) || 1);
    const [qty, setQty] = useState(minQty);

    useEffect(() => { setPhoto(0); setTierId('__base__'); setQty(minQty); }, [item.id, minQty]);

    const s = productState(item, settings, 0);
    // Once a single-piece product is in the cart, the stepper edits the cart itself (packs keep the picker)
    const editsCart = tiers.length === 0 && p.inCart > 0;
    const stockCap = settings?.allowNegativeInventory || tierId !== '__base__' ? Infinity : Number(item.stock || 0);
    const atCap = editsCart ? p.inCart >= stockCap : qty + p.inCart >= stockCap;
    const tier = tiers.find((t) => t.id === tierId);
    const tierPrice = tier && tier.id !== '__base__' ? getEffectivePriceInfo(tier) : null;
    const basePrice = tierPrice ? tierPrice.salePrice : s.price;
    const baseMrp = tierPrice ? (settings?.priceDisplayMode === 'salePrice' ? 0 : tierPrice.mrp) : s.mrp;
    const slab = !tierPrice && s.slabs.length ? getSlabForQty(item, qty) : null;
    const unitPrice = slab && slab.salesPrice < basePrice ? slab.salesPrice : basePrice;
    const saving = baseMrp > unitPrice ? baseMrp - unitPrice : 0;

    const share = async () => {
        const url = window.location.href;
        try {
            if (navigator.share) await navigator.share({ title: item.name, url });
            else await navigator.clipboard.writeText(url);
        } catch { /* cancelled */ }
    };

    const add = () => {
        p.onAdd(item, Math.min(qty, Math.max(0, stockCap - p.inCart)), tier && tier.id !== '__base__' ? tier : undefined);
        setQty(minQty);
    };

    const buyButton = s.outOfStock
        ? (s.canNotify
            ? <button type="button" disabled={p.notified} onClick={p.onNotify} className={btnClass('secondary', 'lg', true)}><Bell className="size-4" />{p.notified ? "We'll notify you" : 'Notify me when back'}</button>
            : <button type="button" disabled className={btnClass('secondary', 'lg', true)}>Out of stock</button>)
        : editsCart
            ? <button type="button" onClick={p.onViewCart} className={btnClass('primary', 'lg', true)}>
                <ShoppingCart className="size-4" />View cart
            </button>
            : <button type="button" onClick={add} disabled={p.inCart >= stockCap} className={btnClass('primary', 'lg', true)}>
                <ShoppingCart className="size-4" />Add to cart{pricesVisible ? ` · ${formatINR(unitPrice * qty)}` : ''}
            </button>;

    const specs: [string, string][] = [
        ['Unit', s.unit],
        ...(item.packetSize ? [['Pack', `${item.packetSize} pcs`] as [string, string]] : []),
        ...(Number(item.moq) > 1 ? [['Minimum order', `${item.moq}`] as [string, string]] : []),
        ...(item.hsnSac ? [['HSN', item.hsnSac] as [string, string]] : []),
    ];

    return (
        <>
            <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 pt-4 text-[13px] text-slate-500 md:pt-5">
                <Link to={p.homeHref} className="font-medium text-sf-primary">Store</Link><ChevronRight className="size-3.5" />
                {p.group && <><Link to={p.groupHref} className="font-medium text-sf-primary">{p.group.name}</Link><ChevronRight className="size-3.5" /></>}
                <span className="line-clamp-1">{item.name}</span>
            </nav>

            <div className="mt-4 grid items-start gap-5 md:mt-5 md:grid-cols-[7fr_5fr] md:gap-10">
                {/* Gallery */}
                <div className={cx('grid gap-3', images.length > 1 && 'md:grid-cols-[72px_minmax(0,1fr)]')}>
                    <div className="relative order-1 md:order-2">
                        <Photo src={images[photo]} alt={item.name} fit="contain" className="aspect-square border border-sf-line" />
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
                        {p.group && <Link to={p.groupHref} className="text-[13px] font-medium text-sf-primary">{p.group.name}</Link>}
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
                                    return (
                                        <Link key={v.id} to={p.variantHref(v)} replace aria-current={on}
                                            className={cx('flex min-h-12 items-center gap-2.5 rounded-sm py-1.5 pl-1.5 pr-3', on ? 'border-2 border-sf-primary bg-sf-soft' : 'border border-sf-control bg-white', vs.outOfStock && !on && 'opacity-60')}>
                                            <span className={cx('size-9 shrink-0 overflow-hidden rounded-sm', img ? 'bg-white' : toneClass(i))}>{img && <img src={img} alt="" className="h-full w-full object-cover" />}</span>
                                            <span className="min-w-0">
                                                <b className="block max-w-[160px] truncate text-[13px] font-medium leading-[18px] text-slate-900">{v.name}</b>
                                                <small className="block text-xs tabular-nums text-slate-500">{vs.outOfStock ? 'Out of stock' : pricesVisible ? formatINR(vs.price) : ''}</small>
                                            </span>
                                        </Link>
                                    );
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
                    <div className="fixed inset-x-0 bottom-0 z-[66] flex gap-3 border-t border-sf-line bg-white px-4 pb-5 pt-3 shadow-sf-float md:static md:z-auto md:grid md:grid-cols-[136px_minmax(0,1fr)] md:border-0 md:bg-transparent md:p-0 md:shadow-none">
                        {!s.outOfStock && (editsCart
                            ? <QtyStepper value={p.inCart} outline trashAtOne className="h-12 w-[128px] shrink-0 md:w-auto"
                                onDec={p.onDec} onInc={p.onInc} incDisabled={atCap} />
                            : <QtyStepper value={qty} outline className="h-12 w-[128px] shrink-0 md:w-auto" incDisabled={atCap}
                                onDec={() => setQty((q) => Math.max(minQty, q - 1))} onInc={() => setQty((q) => q + 1)} />)}
                        <div className="flex-1">{buyButton}</div>
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
                        <button type="button" onClick={share} className={btnClass('ghost')}><Share2 className="size-4" />Share</button>
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
            {p.related}
        </>
    );
};
