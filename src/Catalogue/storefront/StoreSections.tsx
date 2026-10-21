import React, { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Award, ChevronLeft, ChevronRight, Clock, LayoutGrid, MapPin, MessageCircle, Package, Phone, ShieldCheck, Truck, Users, Mail } from 'lucide-react';
import type { Item, ItemGroup } from '../../constants/models';
import type { BusinessInfo } from './useStorefront';
import type { CategoryGroupsData, FactIcon, StoreButton, StoreSection } from './storePage.types';
import { CategoryTile, Photo, btnClass } from './StoreUI';
import { formatPhone, getItemImages, itemInGroup, slugify, whatsappUrl } from './storefront.utils';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export interface SectionContext {
    groups: ItemGroup[];
    liveItems: Item[];
    pinnedCategoryIds: Set<string>;
    business: BusinessInfo;
    categoryHref: (slug: string) => string;
    /** Renders the pinned-products rail cards (needs the cart, so the page supplies it). */
    renderPinnedCards: () => React.ReactNode[];
    /** Builder preview: links don't navigate. */
    preview?: boolean;
}

const FACT_ICONS: Record<FactIcon, React.ElementType> = { award: Award, package: Package, truck: Truck, users: Users, shield: ShieldCheck, clock: Clock };

const businessAddress = (b: BusinessInfo) => [b.streetAddress, b.city, b.state && b.postalCode ? `${b.state} ${b.postalCode}` : b.state || b.postalCode].filter(Boolean).join(', ');

const SectionHead: React.FC<{ title?: string; text?: string; right?: React.ReactNode; small?: boolean }> = ({ title, text, right, small }) => (
    (title || right) ? (
        <div className={cx('flex items-end justify-between gap-4', small ? 'mb-3 md:mb-4' : 'mb-4 md:mb-6')}>
            <div className="min-w-0">
                {title && <h2 className={cx('text-balance font-semibold tracking-tight text-slate-900', small ? 'text-lg md:text-xl' : 'text-xl md:text-2xl')}>{title}</h2>}
                {text && <p className="mt-1 max-w-[60ch] text-sm text-slate-600 md:text-[15px] md:leading-6">{text}</p>}
            </div>
            {right}
        </div>
    ) : null
);

/** A Store page button: where it goes. */
const StoreBtn: React.FC<{ button: StoreButton; variant: 'primary' | 'secondary' | 'whatsapp'; ctx: SectionContext; size?: 'sm' | 'md' | 'lg'; block?: boolean; className?: string }> = ({ button, variant, ctx, size = 'md', block, className }) => {
    const { link } = button;
    const cls = cx(btnClass(link.kind === 'whatsapp' && variant !== 'primary' ? 'whatsapp' : variant, size, block), className);
    const icon = link.kind === 'whatsapp' ? <MessageCircle className="size-4" /> : link.kind === 'call' ? <Phone className="size-4" /> : link.kind === 'categories' ? <LayoutGrid className="size-4" /> : null;
    if (ctx.preview) return <span className={cls}>{icon}{button.label}</span>;
    if (link.kind === 'categories') {
        return <a href="#categories" className={cls} onClick={(e) => { e.preventDefault(); document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' }); }}>{icon}{button.label}</a>;
    }
    if (link.kind === 'category') {
        const g = ctx.groups.find((x) => x.id === link.groupId);
        return g ? <Link to={ctx.categoryHref(slugify(g.name))} className={cls}>{icon}{button.label}</Link> : null;
    }
    if (link.kind === 'whatsapp') {
        const href = whatsappUrl(ctx.business.whatsappNumber || ctx.business.phoneNumber, `Hi, I found your shop ${ctx.business.businessName || ''} online.`);
        return href ? <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>{icon}{button.label}</a> : null;
    }
    const phone = (ctx.business.phoneNumber || '').replace(/\D/g, '');
    return phone ? <a href={`tel:${phone}`} className={cls}>{icon}{button.label}</a> : null;
};

// ── Categories: every category with a live product, in the owner's groups ──
export interface DisplayGroup { id: string; name: string; categories: ItemGroup[] }

/** Owner's groups first; categories in no group go last under "More categories". Pinned come first in each. */
export const groupCategories = (
    ownerGroups: CategoryGroupsData['groups'] | undefined,
    groups: ItemGroup[],
    liveItems: Item[],
    pinnedCategoryIds: Set<string>,
): DisplayGroup[] => {
    const visible = groups.filter((g) => g.id && g.name.toLowerCase().trim() !== 'uncategorized' && liveItems.some((i) => itemInGroup(i, g.id!)));
    const byId = new Map(visible.map((g) => [g.id!, g]));
    const pinnedFirst = (list: ItemGroup[]) => [...list].sort((a, b) => Number(pinnedCategoryIds.has(b.id!)) - Number(pinnedCategoryIds.has(a.id!)));
    const used = new Set<string>();
    const out: DisplayGroup[] = [];
    (ownerGroups || []).forEach((grp) => {
        const cats = grp.categoryIds.map((id) => byId.get(id)).filter((g): g is ItemGroup => !!g && !used.has(g.id!));
        cats.forEach((c) => used.add(c.id!));
        if (cats.length) out.push({ id: grp.id, name: grp.name || 'Categories', categories: pinnedFirst(cats) });
    });
    const rest = visible.filter((g) => !used.has(g.id!)).sort((a, b) => a.name.localeCompare(b.name));
    if (rest.length) out.push({ id: '__more', name: out.length ? 'More categories' : 'Shop by category', categories: pinnedFirst(rest) });
    return out;
};

const CategoriesSection: React.FC<{ data: CategoryGroupsData; ctx: SectionContext }> = ({ data, ctx }) => {
    const groups = useMemo(() => groupCategories(data.groups, ctx.groups, ctx.liveItems, ctx.pinnedCategoryIds),
        [data.groups, ctx.groups, ctx.liveItems, ctx.pinnedCategoryIds]);
    const cover = (g: ItemGroup) => g.imageUrl || ctx.liveItems.filter((i) => itemInGroup(i, g.id!)).map((i) => getItemImages(i)[0]).find(Boolean) || null;
    if (!groups.length) return null;
    return (
        <section id="categories" className="scroll-mt-24 pt-8 md:pt-10">
            {groups.map((g, gi) => (
                <div key={g.id} className={gi ? 'mt-8 md:mt-10' : ''}>
                    <SectionHead title={g.name} small />
                    <div className="grid grid-cols-4 gap-x-2.5 gap-y-3.5 sm:grid-cols-6 md:grid-cols-8 md:gap-x-4 md:gap-y-5 lg:grid-cols-10">
                        {g.categories.map((c, i) => (
                            <CategoryTile key={c.id} name={c.name} image={cover(c)} tone={i + gi} to={ctx.preview ? '#' : ctx.categoryHref(slugify(c.name))} />
                        ))}
                    </div>
                </div>
            ))}
        </section>
    );
};

const PinnedRail: React.FC<{ title: string; ctx: SectionContext }> = ({ title, ctx }) => {
    const ref = useRef<HTMLDivElement>(null);
    const cards = ctx.renderPinnedCards();
    if (!cards.length) return null;
    const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * (ref.current.clientWidth - 120), behavior: 'smooth' });
    return (
        <section className="pt-8 md:pt-12">
            <SectionHead title={title} small right={
                <div className="hidden gap-2 md:flex">
                    <button type="button" aria-label="Scroll left" onClick={() => scroll(-1)} className={cx(btnClass('secondary'), 'w-10 px-0!')}><ChevronLeft className="size-4" /></button>
                    <button type="button" aria-label="Scroll right" onClick={() => scroll(1)} className={cx(btnClass('secondary'), 'w-10 px-0!')}><ChevronRight className="size-4" /></button>
                </div>
            } />
            <div ref={ref} className="-mr-4 grid snap-x auto-cols-[148px] grid-flow-col gap-2.5 overflow-x-auto pb-2 pr-4 [scrollbar-width:none] md:mr-0 md:auto-cols-[184px] md:gap-3 md:pr-0">
                {cards.map((c, i) => <div key={i} className="snap-start">{c}</div>)}
            </div>
        </section>
    );
};

const paragraphs = (text?: string) => (text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

const Prose: React.FC<{ text?: string }> = ({ text }) => (
    <div className="max-w-[62ch] space-y-3 text-sm leading-[22px] text-slate-600 md:text-base md:leading-[26px]">
        {paragraphs(text).map((p, i) => {
            const lines = p.split('\n');
            if (lines.every((l) => /^\s*[-•]\s+/.test(l))) {
                return <ul key={i} className="list-disc space-y-1.5 pl-5">{lines.map((l, j) => <li key={j}>{l.replace(/^\s*[-•]\s+/, '')}</li>)}</ul>;
            }
            return <p key={i} className="whitespace-pre-line">{p}</p>;
        })}
    </div>
);

export const StoreSectionView: React.FC<{ section: StoreSection; ctx: SectionContext }> = ({ section, ctx }) => {
    if (section.hidden) return null;
    const b = ctx.business;

    switch (section.type) {
        case 'hero': {
            const d = section.data;
            if (!d.heading && !d.imageUrl) return null;
            const buttons = d.buttons.filter((x) => x.label.trim());
            if (d.layout === 'beside') {
                return (
                    <section className="grid items-center gap-5 pt-4 md:grid-cols-[5fr_6fr] md:gap-10 md:pt-10">
                        <Photo src={d.imageUrl} alt={d.heading} className="aspect-[4/3] md:order-2" />
                        <div>
                            <h1 className="text-balance text-[26px] font-semibold leading-[34px] tracking-tight text-slate-900 md:text-[40px] md:leading-[48px]">{d.heading}</h1>
                            {d.text && <p className="mt-2.5 max-w-[46ch] text-[15px] leading-6 text-slate-600 md:mt-4 md:text-base md:leading-[26px]">{d.text}</p>}
                            {buttons.length > 0 && (
                                <div className="mt-5 grid gap-2 sm:flex md:mt-6 md:gap-3">
                                    {buttons.map((btn, i) => <StoreBtn key={i} button={btn} ctx={ctx} variant={i === 0 ? 'primary' : 'secondary'} size="lg" />)}
                                </div>
                            )}
                        </div>
                    </section>
                );
            }
            return (
                <section className="relative mt-4 overflow-hidden rounded-sm md:mt-5">
                    <Photo src={d.imageUrl} alt={d.heading} className="aspect-square rounded-none sm:aspect-[2/1] md:aspect-[3/1]" />
                    <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[rgba(20,12,6,0.62)] via-[rgba(20,12,6,0.3)] to-transparent p-5 text-white md:p-10">
                        <h1 className="text-balance text-[26px] font-semibold leading-[34px] tracking-tight md:text-[40px] md:leading-[48px]">{d.heading}</h1>
                        {d.text && <p className="mt-2 max-w-[46ch] text-sm leading-[22px] opacity-95 md:mt-3 md:text-base md:leading-[26px]">{d.text}</p>}
                        {buttons.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2 md:mt-6 md:gap-3">
                                {buttons.map((btn, i) => (
                                    <span key={i} className={i > 0 ? 'hidden sm:contents' : 'contents'}>
                                        <StoreBtn button={btn} ctx={ctx} variant={i === 0 ? 'primary' : 'secondary'} size="lg" className={i === 0 ? 'flex-1 sm:flex-none' : ''} />
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            );
        }
        case 'banners': {
            const items = section.data.items.filter((x) => x.title.trim() || x.imageUrl);
            if (!items.length) return null;
            return (
                <section className="-mr-4 mt-3 grid auto-cols-[300px] grid-flow-col gap-2.5 overflow-x-auto pr-4 [scrollbar-width:none] md:mr-0 md:mt-4 md:grid-flow-row md:grid-cols-3 md:gap-4 md:pr-0">
                    {items.map((bn, i) => (
                        <div key={bn.id} className={cx('grid aspect-[2.1/1] grid-cols-[1.15fr_1fr] overflow-hidden rounded-sm border border-sf-line', ['bg-sf-photo-1', 'bg-sf-photo-2', 'bg-sf-photo-3'][i % 3])}>
                            <div className="grid content-center gap-0.5 px-4 py-3 md:px-5">
                                <b className="line-clamp-2 text-base font-semibold leading-[22px] text-slate-900 md:text-[17px]">{bn.title}</b>
                                {bn.text && <span className="line-clamp-2 text-[13px] leading-[19px] text-slate-600">{bn.text}</span>}
                                {bn.button.label && <StoreBtn button={bn.button} ctx={ctx} variant="secondary" size="sm" className="mt-2 justify-self-start" />}
                            </div>
                            <Photo src={bn.imageUrl} alt={bn.title} tone={i + 1} className="h-full rounded-none" />
                        </div>
                    ))}
                </section>
            );
        }
        case 'categoryGroups':
            return <CategoriesSection data={section.data} ctx={ctx} />;
        case 'products':
            return <PinnedRail title={section.data.title || 'Our picks'} ctx={ctx} />;
        case 'facts': {
            const items = section.data.items.filter((f) => f.title.trim());
            if (!items.length) return null;
            return (
                <section className="mt-8 grid grid-cols-2 gap-x-3 gap-y-4 rounded-sm border border-sf-line bg-white p-4 md:mt-12 md:grid-cols-4 md:gap-4 md:px-6 md:py-5">
                    {items.map((f) => {
                        const Icon = FACT_ICONS[f.icon] ?? Award;
                        return (
                            <div key={f.id} className="flex min-w-0 items-start gap-3">
                                <Icon className="mt-0.5 size-6 shrink-0 text-sf-primary" aria-hidden />
                                <div className="min-w-0">
                                    <b className="block text-sm font-semibold leading-5 text-slate-900">{f.title}</b>
                                    {f.text && <span className="block text-xs leading-[18px] text-slate-500">{f.text}</span>}
                                </div>
                            </div>
                        );
                    })}
                </section>
            );
        }
        case 'imageText': {
            const d = section.data;
            if (!d.title && !d.paragraphs) return null;
            return (
                <section className="pt-10 md:pt-16">
                    <div className="grid items-center gap-4 md:grid-cols-2 md:gap-10">
                        <Photo src={d.imageUrl} alt={d.title} tone={1} className={cx('aspect-[4/3]', d.flip && 'md:order-2')} />
                        <div>
                            <SectionHead title={d.title} />
                            <Prose text={d.paragraphs} />
                            {d.button?.label && <div className="mt-5"><StoreBtn button={d.button} ctx={ctx} variant="secondary" /></div>}
                        </div>
                    </div>
                </section>
            );
        }
        case 'gallery': {
            const d = section.data;
            const imgs = d.images.slice(0, 9);
            if (!imgs.length) return null;
            return (
                <section className="pt-10 md:pt-16">
                    <SectionHead title={d.title} text={d.text} />
                    <div className="grid grid-cols-2 gap-2 md:h-[420px] md:grid-cols-[2fr_1fr_1fr] md:grid-rows-2 md:gap-3">
                        {imgs.slice(0, 5).map((im, i) => (
                            <Photo key={im.id} src={im.url} alt={`${d.title} photo ${i + 1}`} tone={i}
                                className={cx(i === 0 ? 'col-span-2 aspect-video md:col-span-1 md:row-span-2 md:aspect-auto' : 'aspect-square md:aspect-auto', 'md:h-full')} />
                        ))}
                    </div>
                    {imgs.length > 5 && (
                        <div className="mt-2 grid grid-cols-2 gap-2 md:mt-3 md:grid-cols-4 md:gap-3">
                            {imgs.slice(5).map((im, i) => <Photo key={im.id} src={im.url} alt={`${d.title} photo ${i + 6}`} tone={i + 1} className="aspect-square" />)}
                        </div>
                    )}
                </section>
            );
        }
        case 'text': {
            const d = section.data;
            if (!d.title && !d.body) return null;
            return (
                <section className="pt-10 md:pt-16">
                    <div className="grid items-center gap-4 rounded-sm border border-sf-line bg-white p-5 md:grid-cols-[1fr_auto] md:gap-6 md:p-8">
                        <div>
                            {d.title && <h2 className="mb-2 text-balance text-xl font-semibold tracking-tight text-slate-900 md:text-2xl">{d.title}</h2>}
                            <Prose text={d.body} />
                        </div>
                        {d.button?.label && <StoreBtn button={d.button} ctx={ctx} variant="secondary" size="lg" block className="md:w-auto" />}
                    </div>
                </section>
            );
        }
        case 'contact': {
            const d = section.data;
            const address = businessAddress(b);
            const phone = b.phoneNumber;
            const wa = b.whatsappNumber || b.phoneNumber;
            if (!address && !phone && !wa && !d.hours) return null;
            const hours = d.hours.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
                const k = l.indexOf(':');
                return k > 0 ? [l.slice(0, k).trim(), l.slice(k + 1).trim()] : [l, ''];
            });
            const waHref = whatsappUrl(wa, `Hi, I found your shop ${b.businessName || ''} online.`);
            return (
                <section className="pt-10 md:pt-16">
                    <SectionHead title={d.title || 'Visit or contact us'} />
                    <div className="grid gap-3 md:grid-cols-[1.2fr_1fr] md:gap-6">
                        <div className="grid content-start gap-4 rounded-sm border border-sf-line bg-white p-4 shadow-sf-card md:p-5">
                            {address && (
                                <div className="flex items-start gap-3">
                                    <MapPin className="mt-0.5 size-5 shrink-0 text-sf-primary" aria-hidden />
                                    <div className="text-sm">
                                        <b className="block font-semibold text-slate-900">{b.businessName}</b>
                                        <span className="text-slate-600">{address}</span>
                                        <div className="mt-1.5">
                                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${b.businessName || ''} ${address}`)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-sf-primary hover:underline">Open in Google Maps</a>
                                        </div>
                                    </div>
                                </div>
                            )}
                            {hours.length > 0 && (
                                <div className="flex items-start gap-3">
                                    <Clock className="mt-0.5 size-5 shrink-0 text-sf-primary" aria-hidden />
                                    <div className="flex-1 text-sm">
                                        <b className="block font-semibold text-slate-900">Opening hours</b>
                                        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[13px] text-slate-600">
                                            {hours.map(([day, time], i) => (
                                                <React.Fragment key={i}><dt className="font-medium text-slate-900">{day}</dt><dd className="tabular-nums">{time}</dd></React.Fragment>
                                            ))}
                                        </dl>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="grid content-start gap-4 rounded-sm border border-sf-line bg-white p-4 shadow-sf-card md:p-5">
                            {phone && <div className="flex items-start gap-3"><Phone className="mt-0.5 size-5 shrink-0 text-sf-primary" aria-hidden /><div className="text-sm"><b className="block font-semibold text-slate-900">Call</b><span className="select-all text-slate-600">{formatPhone(phone)}</span></div></div>}
                            {wa && <div className="flex items-start gap-3"><MessageCircle className="mt-0.5 size-5 shrink-0 text-sf-primary" aria-hidden /><div className="text-sm"><b className="block font-semibold text-slate-900">WhatsApp</b><span className="select-all text-slate-600">{formatPhone(wa)}</span></div></div>}
                            {b.email && <div className="flex items-start gap-3"><Mail className="mt-0.5 size-5 shrink-0 text-sf-primary" aria-hidden /><div className="text-sm"><b className="block font-semibold text-slate-900">Email</b><span className="select-all text-slate-600">{b.email}</span></div></div>}
                            <div className="mt-1 grid grid-cols-2 gap-2">
                                {waHref && (ctx.preview ? <span className={btnClass('whatsapp')}>WhatsApp</span> : <a href={waHref} target="_blank" rel="noopener noreferrer" className={btnClass('whatsapp')}><MessageCircle className="size-4" />WhatsApp</a>)}
                                {phone && (ctx.preview ? <span className={btnClass('secondary')}>Call shop</span> : <a href={`tel:${phone.replace(/\D/g, '')}`} className={btnClass('secondary')}><Phone className="size-4" />Call shop</a>)}
                            </div>
                        </div>
                    </div>
                </section>
            );
        }
    }
};

export const storeAddress = businessAddress;
