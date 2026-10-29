import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, BellRing, ChevronRight, ImageIcon, Lock, MessageCircle, MessageSquare, Minus, Package, Plus, ShoppingCart, Trash2, X } from 'lucide-react';
import { formatINR, initialsOf } from './storefront.utils';
import sellarLogo from '../../assets/sellar-logo.png';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const TONES = ['bg-sf-photo-1', 'bg-sf-photo-2', 'bg-sf-photo-3', 'bg-sf-photo-4'];
export const toneClass = (i = 0) => TONES[Math.abs(i) % 4];

// ── Photo: fixed-ratio image, tinted well with an icon when there is none ──
export const Photo: React.FC<{
    src?: string | null;
    /** Tried in order when src is missing or fails to load */
    fallbacks?: string[];
    alt: string;
    className?: string;
    tone?: number;
    fit?: 'cover' | 'contain';
    children?: React.ReactNode;
}> = ({ src, fallbacks, alt, className, tone = 0, fit = 'cover', children }) => {
    const candidates = [...new Set([src, ...(fallbacks || [])].filter((u): u is string => !!u))];
    const candidatesKey = candidates.join('|');
    const [broken, setBroken] = useState<Set<string>>(new Set());
    useEffect(() => setBroken(new Set()), [candidatesKey]);
    const current = candidates.find((u) => !broken.has(u));
    const show = !!current;
    return (
        <div className={cx('relative overflow-hidden rounded-sm', show ? (fit === 'contain' ? 'bg-white' : 'bg-sf-sunken') : toneClass(tone), className)}>
            {show ? (
                <img key={current} src={current} alt={alt} loading="lazy" onError={() => setBroken((b) => new Set(b).add(current))}
                    className={cx('absolute inset-0 h-full w-full', fit === 'contain' ? 'object-contain' : 'object-cover')} />
            ) : (
                <div className="absolute inset-0 grid place-items-center text-slate-500/70"><ImageIcon className="size-8" strokeWidth={1.25} aria-hidden /></div>
            )}
            {children}
        </div>
    );
};

/** Product photo that cross-fades through the item's (and its variants') photos. */
export const ProductPhoto: React.FC<{ images: string[]; alt: string; tone?: number; className?: string; children?: React.ReactNode; dots?: boolean }> = ({ images, alt, tone = 0, className, children, dots = true }) => {
    const [broken, setBroken] = useState<Set<string>>(new Set());
    const [idx, setIdx] = useState(0);
    const valid = useMemo(() => images.filter((u) => !broken.has(u)), [images, broken]);
    useEffect(() => {
        if (valid.length <= 1) return;
        const t = setInterval(() => setIdx((p) => (p + 1) % valid.length), 3000);
        return () => clearInterval(t);
    }, [valid.length]);
    const current = idx >= valid.length ? 0 : idx;
    if (valid.length === 0) return <Photo src={null} alt={alt} tone={tone} className={className}>{children}</Photo>;
    return (
        <div className={cx('relative overflow-hidden bg-white', className)}>
            {valid.map((url, i) => (
                <img key={url + i} src={url} alt={alt} loading="lazy"
                    onError={() => setBroken((p) => new Set(p).add(url))}
                    className={cx('absolute inset-0 h-full w-full object-contain transition-opacity duration-700', i === current ? 'opacity-100' : 'opacity-0')} />
            ))}
            {dots && valid.length > 1 && (
                <span className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1" aria-hidden>
                    {valid.slice(0, 5).map((_, i) => (
                        <i key={i} className={cx('h-1.5 rounded-sm transition-all', i === current ? 'w-3.5 bg-sf-accent' : 'w-1.5 bg-slate-300')} />
                    ))}
                </span>
            )}
            {children}
        </div>
    );
};

// ── Tags ──
export const Tag: React.FC<{ tone?: 'success' | 'warning' | 'inverse' | 'neutral' | 'soft'; children: React.ReactNode; className?: string }> = ({ tone = 'neutral', children, className }) => (
    <span className={cx('inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-sm px-2 text-[11px] font-semibold tracking-[0.02em]',
        tone === 'success' && 'bg-green-50 text-green-700',
        tone === 'warning' && 'bg-yellow-50 text-yellow-800',
        tone === 'inverse' && 'bg-slate-900 text-white',
        tone === 'soft' && 'bg-sf-soft text-sf-soft-ink',
        tone === 'neutral' && 'bg-sf-sunken text-slate-600', className)}>
        {children}
    </span>
);

// ── Buttons ──
type BtnVariant = 'primary' | 'outline' | 'secondary' | 'ghost' | 'whatsapp' | 'danger';
export const btnClass = (variant: BtnVariant = 'secondary', size: 'sm' | 'md' | 'lg' = 'md', block = false) => cx(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm border font-medium transition-colors active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sf-primary',
    size === 'sm' && 'h-8 px-3 text-[13px]',
    size === 'md' && 'h-10 px-4 text-sm',
    size === 'lg' && 'h-12 px-5 text-[15px]',
    block && 'w-full',
    variant === 'primary' && 'border-transparent bg-sf-primary text-white hover:bg-sf-primary-hover',
    variant === 'outline' && 'border-sf-primary bg-white text-sf-primary hover:bg-sf-soft hover:text-sf-soft-ink',
    variant === 'secondary' && 'border-sf-control bg-white text-slate-900 hover:bg-sf-sunken',
    variant === 'ghost' && 'border-transparent bg-transparent text-slate-600 hover:bg-sf-sunken hover:text-slate-900',
    variant === 'whatsapp' && 'border-sf-whatsapp bg-white text-sf-whatsapp hover:bg-green-50',
    variant === 'danger' && 'border-transparent bg-transparent text-red-700 hover:bg-red-50',
);

// ── Quantity stepper ──
export const QtyStepper: React.FC<{ value: number; onDec: () => void; onInc: () => void; size?: 'sm' | 'md'; outline?: boolean; className?: string; trashAtOne?: boolean; trash?: boolean; incDisabled?: boolean }> = ({ value, onDec, onInc, size = 'md', outline, className, trashAtOne, trash, incDisabled }) => (
    <div role="group" aria-label="Quantity" onClick={(e) => e.stopPropagation()}
        className={cx('grid items-center rounded-sm', size === 'sm' ? 'h-8 grid-cols-[32px_1fr_32px] text-[13px]' : 'h-10 grid-cols-[40px_1fr_40px]',
            outline ? 'border border-sf-control bg-white text-slate-900' : 'bg-sf-soft text-sf-soft-ink', className)}>
        <button type="button" aria-label={trash || (trashAtOne && value <= 1) ? 'Remove from cart' : 'Remove one'} onClick={onDec} className={cx('grid h-full place-items-center rounded-sm', outline ? 'hover:bg-sf-sunken' : 'hover:bg-sf-primary hover:text-white')}>
            {trash || (trashAtOne && value <= 1) ? <Trash2 className="size-4" /> : <Minus className="size-4" />}
        </button>
        <span className="text-center font-semibold tabular-nums">{value}</span>
        <button type="button" aria-label="Add one" onClick={onInc} disabled={incDisabled} className={cx('grid h-full place-items-center rounded-sm disabled:cursor-not-allowed disabled:opacity-40', outline ? 'enabled:hover:bg-sf-sunken' : 'enabled:hover:bg-sf-primary enabled:hover:text-white')}>
            <Plus className="size-4" />
        </button>
    </div>
);

// ── Price ──
export const PriceBlock: React.FC<{ price: number; mrp?: number; hidden?: boolean; large?: boolean; stack?: boolean; showOff?: boolean; unitNote?: string }> = ({ price, mrp = 0, hidden, large, stack, showOff, unitNote }) => {
    if (hidden) {
        return <div className="flex items-center gap-1.5 text-[13px] text-slate-500"><Lock className="size-3.5" />Price after approval</div>;
    }
    const struck = mrp > price && price > 0;
    const off = struck ? Math.round((1 - price / mrp) * 100) : 0;
    return (
        <div className={cx('flex', stack ? 'flex-col items-start' : 'flex-wrap items-baseline gap-x-2 gap-y-0.5')}>
            <span className={cx('font-semibold tabular-nums text-slate-900', large ? 'text-[28px] leading-9 tracking-tight' : stack ? 'text-[15px] leading-5' : 'text-base leading-[22px]')}>{formatINR(price)}</span>
            {struck && <span className={cx('tabular-nums text-slate-500 line-through', large ? 'text-[15px]' : 'text-xs')}>{formatINR(mrp)}</span>}
            {struck && showOff && <span className={cx('font-semibold text-green-700', large ? 'text-sm' : 'text-xs')}>{off}% off</span>}
            {unitNote && <span className="text-xs text-slate-500">{unitNote}</span>}
        </div>
    );
};

// ── Product card (grid and rail) ──
export interface ProductCardProps {
    name: string;
    unit?: string;
    images: string[];
    tone?: number;
    price: number;
    mrp?: number;
    slabPrice?: number | null;
    priceHidden?: boolean;
    discountPercent?: number;
    showDiscount?: boolean;
    lowStock?: number;
    bulkFrom?: number | null;
    outOfStock?: boolean;
    canNotify?: boolean;
    notified?: boolean;
    hasOptions?: boolean;
    inCart?: number;
    highlight?: boolean;
    pinned?: boolean;
    rail?: boolean;
    compact?: boolean;
    id?: string;
    onOpen: () => void;
    onAdd: (e: React.MouseEvent) => void;
    onInc: () => void;
    onDec: () => void;
    onNotify: () => void;
}

export const ProductCard: React.FC<ProductCardProps> = (p) => {
    const tag = p.outOfStock
        ? <Tag tone="inverse">Out of stock</Tag>
        : p.showDiscount && p.discountPercent && !p.priceHidden
            ? <Tag tone="success">{p.discountPercent}% off</Tag>
            : p.lowStock ? <Tag tone="warning">Only {p.lowStock} left</Tag> : null;
    const small = p.rail || p.compact;
    const price = p.slabPrice ?? p.price;
    const mrp = p.slabPrice != null ? p.price : p.mrp;

    let action: React.ReactNode;
    if (p.inCart && p.inCart > 0) {
        action = <QtyStepper value={p.inCart} onDec={p.onDec} onInc={p.onInc} size={small ? 'sm' : 'md'} className={p.rail ? 'w-[92px]' : ''} />;
    } else if (p.canNotify) {
        action = p.rail
            ? <button type="button" aria-label={p.notified ? 'We will notify you' : 'Notify me'} aria-pressed={!!p.notified} title={p.notified ? "We'll notify you when it's back" : 'Notify me when back'}
                onClick={(e) => { e.stopPropagation(); p.onNotify(); }}
                className={cx(btnClass('secondary', 'sm'), 'shrink-0', p.notified && 'border-sf-primary bg-sf-soft text-sf-soft-ink hover:bg-sf-soft')}>
                {p.notified ? <BellRing className="size-4 fill-current" /> : <Bell className="size-4" />}
            </button>
            : <button type="button" disabled={p.notified} onClick={(e) => { e.stopPropagation(); p.onNotify(); }} className={btnClass('secondary', small ? 'sm' : 'md', true)}>
                <Bell className="size-4" />{p.notified ? 'We will notify you' : 'Notify me'}
            </button>;
    } else if (p.rail && p.outOfStock) {
        action = null; // the photo badge already says "Out of stock"; no room for a disabled pill in a rail card
    } else {
        action = (
            <button type="button" disabled={p.outOfStock} onClick={(e) => { e.stopPropagation(); p.onAdd(e); }} className={btnClass('outline', small ? 'sm' : 'md', !p.rail)}>
                {!p.rail && !p.hasOptions && <Plus className="size-4" />}
                {p.outOfStock ? 'Out of stock' : p.hasOptions ? (p.rail ? 'Options' : 'Choose pack') : 'Add'}
            </button>
        );
    }

    return (
        <article id={p.id} onClick={p.onOpen}
            className={cx('group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-sm border bg-white shadow-sf-card transition-shadow hover:shadow-sf-float',
                p.highlight ? 'border-sf-primary outline-2 outline-offset-2 outline-sf-primary' : 'border-sf-line')}>
            <ProductPhoto images={p.images} alt={p.name} tone={p.tone} className={cx('aspect-square', p.outOfStock && 'grayscale-[.6]')}>
                {tag && <span className="absolute left-2 top-2">{tag}</span>}
            </ProductPhoto>
            <div className={cx('flex flex-1 flex-col', p.rail ? 'gap-1 px-3 pb-3 pt-2.5' : small ? 'gap-1.5 p-3' : 'gap-1.5 px-4 pb-4 pt-3')}>
                <h3 className={cx('line-clamp-2 font-medium text-slate-900', p.rail ? 'min-h-9 text-[13px] leading-[18px]' : 'min-h-10 text-sm leading-5')}>{p.name}</h3>
                {p.unit && p.unit !== '1 pc' && <p className="text-xs leading-4 text-slate-500">{p.unit}</p>}
                {p.rail ? (
                    <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
                        <div className="min-w-0"><PriceBlock price={price} mrp={mrp} hidden={p.priceHidden} stack /></div>
                        {action && <div className="shrink-0">{action}</div>}
                    </div>
                ) : (
                    <>
                        <PriceBlock price={price} mrp={mrp} hidden={p.priceHidden} />
                        {p.bulkFrom && !p.priceHidden ? <p className="text-xs font-medium leading-4 text-sf-primary">Bulk rates from {formatINR(p.bulkFrom)}</p> : null}
                        <div className="mt-auto pt-1.5">{action}</div>
                    </>
                )}
            </div>
        </article>
    );
};

export const ProductCardSkeleton: React.FC = () => (
    <div className="overflow-hidden rounded-sm border border-sf-line bg-white" aria-hidden>
        <div className="aspect-square animate-pulse bg-sf-sunken motion-reduce:animate-none" />
        <div className="grid gap-2 px-4 pb-4 pt-3">
            <div className="h-3.5 w-[90%] animate-pulse rounded-sm bg-sf-sunken motion-reduce:animate-none" />
            <div className="h-3.5 w-3/5 animate-pulse rounded-sm bg-sf-sunken motion-reduce:animate-none" />
            <div className="mt-1.5 h-10 animate-pulse rounded-sm bg-sf-sunken motion-reduce:animate-none" />
        </div>
    </div>
);

// ── Category tile (Blinkit style) ──
// images: category photo first, then its items' photos — shows the first one that loads
export const CategoryTile: React.FC<{ name: string; images: string[]; tone?: number; to: string }> = ({ name, images, tone, to }) => (
    <Link to={to} className="group grid content-start gap-2 text-center text-slate-900">
        <Photo src={images[0]} fallbacks={images.slice(1)} alt={name} tone={tone} fit="cover"
            className="aspect-square border border-sf-line transition-[border-color,transform] duration-150 group-hover:-translate-y-0.5 group-hover:border-sf-primary motion-reduce:transition-none" />
        <span className="line-clamp-2 text-[13px] font-medium leading-[18px]">{name}</span>
    </Link>
);

// ── Header ──
export const StoreHeader: React.FC<{
    name: string;
    logo?: string;
    tagline?: string;
    homeTo: string;
    cartCount: number;
    onCart: () => void;
    onAsk: () => void;
    search?: React.ReactNode;
    onBack?: () => void;
    hideSearchOnMobile?: boolean;
}> = ({ name, logo, tagline, homeTo, cartCount, onCart, onAsk, search, onBack, hideSearchOnMobile }) => (
    <header className="sticky top-0 z-[60] border-b border-sf-line bg-white">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-2 pl-4 pr-2 md:h-[72px] md:gap-6 md:px-10">
            {onBack && (
                <button type="button" onClick={onBack} aria-label="Back" className="-ml-2 grid size-10 shrink-0 place-items-center rounded-sm text-slate-600 hover:bg-sf-sunken"><ArrowLeft className="size-5" /></button>
            )}
            <Link to={homeTo} className="flex min-w-0 flex-1 items-center gap-2.5 md:flex-none">
                <span className="grid size-[34px] shrink-0 place-items-center overflow-hidden rounded-sm bg-sf-soft text-[13px] font-semibold text-sf-soft-ink md:size-10 md:text-[15px]">
                    {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : initialsOf(name)}
                </span>
                <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold leading-5 text-slate-900 md:text-base">{name}</span>
                    {tagline && <span className="block truncate text-xs leading-4 text-slate-500">{tagline}</span>}
                </span>
            </Link>
            {search && <div className="hidden max-w-[640px] flex-1 md:block">{search}</div>}
            <div className="flex shrink-0 items-center gap-1 md:ml-auto md:gap-2">
                <button type="button" onClick={onAsk} aria-label="Ask a question" className={cx(btnClass('ghost'), 'w-10 px-0! md:w-auto md:px-4!')}>
                    <MessageSquare className="size-5 md:size-4" /><span className="hidden md:inline">Ask a question</span>
                </button>
                <button type="button" onClick={onCart} aria-label={`Cart, ${cartCount} items`} className={cx(btnClass('secondary'), 'relative w-10 border-transparent px-0! md:w-auto md:border-sf-control md:px-4!')}>
                    <ShoppingCart className="size-5 md:size-4" /><span className="hidden md:inline">Cart</span>
                    {cartCount > 0 && (
                        <span className="absolute right-0.5 top-0.5 min-w-[18px] rounded-sm bg-sf-primary px-1 text-center text-[11px] font-semibold leading-[18px] text-white md:static md:ml-0.5">{cartCount}</span>
                    )}
                </button>
            </div>
        </div>
        {search && !hideSearchOnMobile && <div className="px-4 pb-3 md:hidden">{search}</div>}
    </header>
);

// ── Cart bar ──
export const CartBar: React.FC<{ count: number; total: number; hideTotal?: boolean; onClick: () => void }> = ({ count, total, hideTotal, onClick }) => {
    if (count <= 0) return null;
    return (
        <div className="fixed inset-x-3 bottom-4 z-[70] md:inset-x-auto md:left-1/2 md:w-[520px] md:-translate-x-1/2">
            <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-sm bg-slate-900 py-2.5 pl-4 pr-2.5 text-left text-white shadow-sf-float">
                <span className="min-w-0 flex-1 leading-[18px]">
                    <b className="block text-[15px] font-semibold tabular-nums">{count} item{count === 1 ? '' : 's'}{hideTotal ? '' : ` · ${formatINR(total)}`}</b>
                    <small className="text-xs opacity-80">{hideTotal ? 'Prices shown after approval' : 'Incl. GST · the shop confirms delivery'}</small>
                </span>
                <span className={btnClass('primary')}>View cart<ChevronRight className="size-4" /></span>
            </button>
        </div>
    );
};

export const WhatsAppFab: React.FC<{ href: string | null; lifted?: boolean }> = ({ href, lifted }) => href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp"
        className={cx('fixed right-4 z-[65] grid size-12 place-items-center rounded-sm border border-sf-line bg-white text-sf-whatsapp shadow-sf-float md:bottom-6 md:right-6', lifted ? 'bottom-24' : 'bottom-4')}>
        <MessageCircle className="size-6" />
    </a>
) : null;

// ── Notes, sheets, empty states ──
export const Note: React.FC<{ tone: 'success' | 'warning' | 'info' | 'danger'; icon?: React.ReactNode; children: React.ReactNode; onClose?: () => void }> = ({ tone, icon, children, onClose }) => (
    <div role="status" className={cx('flex items-start gap-2.5 rounded-sm px-3 py-2.5 text-[13px] leading-5',
        tone === 'success' && 'bg-green-50 text-green-800', tone === 'warning' && 'bg-yellow-50 text-yellow-800',
        tone === 'info' && 'bg-sf-soft text-sf-soft-ink', tone === 'danger' && 'bg-red-50 text-red-700')}>
        {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
        <span className="flex-1">{children}</span>
        {onClose && <button type="button" aria-label="Dismiss" onClick={onClose} className="-m-1 rounded-sm p-1 opacity-70 hover:opacity-100"><X className="size-4" /></button>}
    </div>
);

export const EmptyState: React.FC<{ title: string; text: string; action?: React.ReactNode; icon?: React.ReactNode }> = ({ title, text, action, icon }) => (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-[13px] text-slate-500">
        <span className="text-sf-primary">{icon ?? <Package className="size-7" strokeWidth={1.5} />}</span>
        <strong className="text-[15px] font-semibold text-slate-900">{title}</strong>
        <p className="max-w-[36ch]">{text}</p>
        {action && <div className="mt-2">{action}</div>}
    </div>
);

/** Dialog on desktop, bottom sheet on phones. */
export const Sheet: React.FC<{ open: boolean; title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> = ({ open, title, onClose, children, footer, wide }) => {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/50 md:items-center md:p-4" onClick={onClose}>
            <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
                className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-sm bg-white px-4 pb-5 pt-2 shadow-sf-float md:rounded-sm md:p-5', wide ? 'md:max-w-2xl' : 'md:max-w-md')}>
                <div className="mx-auto mb-3 h-1 w-9 rounded-sm bg-sf-line md:hidden" />
                <div className="mb-3 flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                    <button type="button" aria-label="Close" onClick={onClose} className="grid size-10 place-items-center rounded-sm text-slate-600 hover:bg-sf-sunken"><X className="size-5" /></button>
                </div>
                {children}
                {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
            </div>
        </div>
    );
};

/** "Ask a question": the old Query modal, writes to PersonalizationRequests. */
export const AskSheet: React.FC<{ open: boolean; onClose: () => void; onSubmit: (text: string) => void; itemName?: string }> = ({ open, onClose, onSubmit, itemName }) => {
    const [text, setText] = useState('');
    useEffect(() => { if (open) setText(''); }, [open]);
    return (
        <Sheet open={open} onClose={onClose} title="Ask a question"
            footer={<>
                <button type="button" onClick={onClose} className={btnClass('ghost')}>Cancel</button>
                <button type="button" disabled={!text.trim()} onClick={() => onSubmit(text)} className={btnClass('primary')}>Send question</button>
            </>}>
            <label htmlFor="ask-text" className="mb-1.5 block text-[13px] font-medium text-slate-900">
                {itemName ? `About ${itemName}` : "Tell the shop what you're looking for"}
            </label>
            <textarea id="ask-text" rows={5} value={text} onChange={(e) => setText(e.target.value)}
                placeholder="For example: do you have this bottle in blue, and can you engrave a name?"
                className="w-full resize-none rounded-sm border border-sf-control p-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-2 focus:outline-sf-primary" />
            <p className="mt-1.5 text-xs text-slate-500">The shop usually replies on WhatsApp.</p>
        </Sheet>
    );
};

// ── Footer ──
export const StoreFooter: React.FC<{ name: string; about?: string; address?: string; phone?: string; whatsapp?: string; instagram?: string; facebook?: string; gstin?: string; email?: string }> = (p) => {
    const fix = (u?: string) => (u ? (u.startsWith('http') ? u : `https://${u}`) : '');
    return (
        <footer className="mt-10 border-t border-sf-line bg-white md:mt-16">
            <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-8 md:grid-cols-[1.4fr_1fr_1fr] md:px-10">
                <div>
                    <h4 className="mb-2 text-[13px] font-semibold text-slate-900">{p.name}</h4>
                    {p.about && <p className="text-[13px] leading-[22px] text-slate-600">{p.about}</p>}
                </div>
                {p.address && (
                    <div>
                        <h4 className="mb-2 text-[13px] font-semibold text-slate-900">Visit</h4>
                        <p className="text-[13px] leading-[22px] text-slate-600">{p.address}</p>
                    </div>
                )}
                {(p.phone || p.whatsapp || p.instagram || p.facebook || p.email) && (
                    <div>
                        <h4 className="mb-2 text-[13px] font-semibold text-slate-900">Contact</h4>
                        <div className="grid gap-0.5 text-[13px] leading-[22px] text-slate-600">
                            {p.phone && <span>{p.phone}</span>}
                            {p.whatsapp && p.whatsapp !== p.phone && <span>WhatsApp {p.whatsapp}</span>}
                            {p.email && <span>{p.email}</span>}
                            {p.instagram && <a className="hover:text-sf-primary" href={fix(p.instagram)} target="_blank" rel="noopener noreferrer">Instagram</a>}
                            {p.facebook && <a className="hover:text-sf-primary" href={fix(p.facebook)} target="_blank" rel="noopener noreferrer">Facebook</a>}
                        </div>
                    </div>
                )}
            </div>
            <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 border-t border-sf-line px-4 py-4 text-xs text-slate-500 md:px-10">
                <span>{p.gstin ? `GSTIN ${p.gstin}` : `© ${new Date().getFullYear()} ${p.name}`}</span>
                <span className="inline-flex items-center gap-1.5">Powered by <img src={sellarLogo} alt="SELLAR" className="h-3.5 w-auto" /></span>
            </div>
        </footer>
    );
};

export const StoreMessage: React.FC<{ title: string; text: string }> = ({ title, text }) => (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-2 bg-sf-canvas px-6 text-center">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        <p className="max-w-[40ch] text-sm text-slate-600">{text}</p>
    </div>
);

export const StoreLoading: React.FC = () => (
    <div className="min-h-[100dvh] bg-sf-canvas" aria-busy="true" aria-label="Loading the store">
        <div className="h-14 border-b border-sf-line bg-white md:h-[72px]" />
        <div className="mx-auto grid max-w-[1200px] gap-6 px-4 pt-5 md:px-10">
            <div className="aspect-[2/1] animate-pulse rounded-sm bg-white motion-reduce:animate-none md:aspect-[3/1]" />
            <div className="grid grid-cols-4 gap-3 md:grid-cols-10 md:gap-4">
                {Array.from({ length: 10 }).map((_, i) => <div key={i} className="aspect-square animate-pulse rounded-sm bg-white motion-reduce:animate-none" />)}
            </div>
        </div>
    </div>
);
