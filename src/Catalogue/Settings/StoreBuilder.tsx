import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Image as ImageIcon, LayoutGrid, Loader2, MapPin, Monitor, MoreHorizontal, Pin, Plus, Smartphone, Sparkles, Trash2, Type, CheckCircle2, Columns2, Images, X } from 'lucide-react';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { getItemGroupsByCompany, getItemsByCompany } from '../../lib/ItemsFirebase';
import type { Item, ItemGroup } from '../../constants/models';
import { ROUTES } from '../../constants/routes.constants';
import type { BusinessInfo } from '../storefront/useStorefront';
import { SECTION_INFO, emptySection, newId, starterStorePage, type SectionType, type StoreSection } from '../storefront/storePage.types';
import { StoreSectionView, type SectionContext } from '../storefront/StoreSections';
import { SectionEditor, DragHandle } from '../storefront/SectionEditors';
import { ProductCard, Sheet, btnClass } from '../storefront/StoreUI';
import { deleteStoreImages } from '../storefront/uploadStoreImage';
import { getItemGroupIds, getItemImages, initialsOf } from '../storefront/storefront.utils';
import { productState } from '../storefront/productState';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const TYPE_ICONS: Record<SectionType, React.ElementType> = {
    hero: ImageIcon, banners: Columns2, categoryGroups: LayoutGrid, products: Pin, facts: Sparkles,
    imageText: Columns2, gallery: Images, text: Type, contact: MapPin,
};
const ORDER: SectionType[] = ['hero', 'banners', 'categoryGroups', 'products', 'facts', 'imageText', 'gallery', 'text', 'contact'];

const summary = (s: StoreSection, cats: ItemGroup[]): string => {
    switch (s.type) {
        case 'hero': return s.data.heading || 'No heading yet';
        case 'banners': return `${s.data.items.length} banner${s.data.items.length === 1 ? '' : 's'}${s.data.items[0]?.title ? `: ${s.data.items.map((b) => b.title).filter(Boolean).join(', ')}` : ''}`;
        case 'categoryGroups': {
            const n = s.data.groups.length;
            return n ? `${n} group${n === 1 ? '' : 's'} · all ${cats.length} categories` : `All ${cats.length} categories in one grid`;
        }
        case 'products': return `${s.data.title || 'Our picks'}: your pinned products`;
        case 'facts': return s.data.items.map((f) => f.title).filter(Boolean).join(', ') || 'No highlights yet';
        case 'imageText': return s.data.title || 'No title yet';
        case 'gallery': return `${s.data.title || 'Gallery'}: ${s.data.images.length} photo${s.data.images.length === 1 ? '' : 's'}`;
        case 'text': return s.data.title || s.data.body.slice(0, 60) || 'Empty';
        case 'contact': return 'Address, hours, phone and WhatsApp';
    }
};

const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Owner page: build the shop's customer-facing Store page from sections (text and images only). */
const StoreBuilder: React.FC = () => {
    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId || '';
    const [loading, setLoading] = useState(true);
    const [groups, setGroups] = useState<ItemGroup[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [business, setBusiness] = useState<BusinessInfo>({});
    const [pinnedItems, setPinnedItems] = useState<Set<string>>(new Set());
    const [pinnedCats, setPinnedCats] = useState<Set<string>>(new Set());
    const [storeUrl, setStoreUrl] = useState('');
    const [saved, setSaved] = useState<StoreSection[]>([]);
    const [isStarter, setIsStarter] = useState(false);
    const [sections, setSections] = useState<StoreSection[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [mobileEditing, setMobileEditing] = useState(false);
    const [adding, setAdding] = useState(false);
    const [menuFor, setMenuFor] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const [previewMode, setPreviewMode] = useState<'phone' | 'computer'>('phone');
    const [mobilePreview, setMobilePreview] = useState(false);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
    const removedPaths = useRef<string[]>([]);
    const dragFrom = useRef<number | null>(null);

    useEffect(() => {
        if (!companyId) return;
        (async () => {
            try {
                const [g, it, bi, pi, pc, sp, co] = await Promise.all([
                    getItemGroupsByCompany(companyId),
                    getItemsByCompany(companyId),
                    getDoc(doc(db, 'companies', companyId, 'business_info', companyId)),
                    getDoc(doc(db, 'companies', companyId, 'settings', 'pinned_items')),
                    getDoc(doc(db, 'companies', companyId, 'settings', 'pinned_categories')),
                    getDoc(doc(db, 'companies', companyId, 'settings', 'store_page')),
                    getDoc(doc(db, 'companies', companyId)),
                ]);
                const biz = (bi.exists() ? bi.data() : {}) as BusinessInfo;
                setGroups(g); setItems(it); setBusiness(biz);
                setPinnedItems(new Set(pi.exists() ? pi.data().ids || [] : []));
                setPinnedCats(new Set(pc.exists() ? pc.data().ids || [] : []));
                const sub = co.exists() ? co.data().subdomain : '';
                setStoreUrl(sub ? `https://${sub}.sellar.in` : `/catalogue/${companyId}`);
                const existing: StoreSection[] = sp.exists() ? sp.data().sections || [] : [];
                const start = existing.length ? existing : starterStorePage(biz.businessName || '', biz.brandingText).sections;
                setIsStarter(!existing.length);
                setSaved(existing);
                setSections(clean(start));
                setSelected(start[0]?.id ?? null);
            } catch (e) {
                console.error(e);
                setStatus({ tone: 'danger', text: "Couldn't load your Store page. Refresh to try again." });
            } finally { setLoading(false); }
        })();
    }, [companyId]);

    const liveItems = useMemo(() => items.filter((i) => i.isListed && getItemGroupIds(i).some((id) => id !== 'uncategorized')), [items]);
    const categories = useMemo(() => groups.filter((g) => g.id && g.name.toLowerCase().trim() !== 'uncategorized' && liveItems.some((i) => getItemGroupIds(i).includes(g.id!)))
        .sort((a, b) => a.name.localeCompare(b.name)), [groups, liveItems]);

    const savedById = useMemo(() => new Map(saved.map((s) => [s.id, JSON.stringify(s)])), [saved]);
    const changedIds = useMemo(() => new Set(sections.filter((s) => savedById.get(s.id) !== JSON.stringify(s)).map((s) => s.id)), [sections, savedById]);
    const orderChanged = saved.length > 0 && saved.map((s) => s.id).join() !== sections.filter((s) => savedById.has(s.id)).map((s) => s.id).join();
    const removedCount = saved.filter((s) => !sections.some((x) => x.id === s.id)).length;
    const dirty = isStarter || changedIds.size > 0 || orderChanged || removedCount > 0;
    const changeNotes = [
        ...sections.filter((s) => changedIds.has(s.id)).map((s) => `${SECTION_INFO[s.type].name} ${savedById.has(s.id) ? 'edited' : 'added'}`),
        ...(removedCount ? [`${removedCount} removed`] : []),
        ...(orderChanged ? ['order changed'] : []),
    ];

    useEffect(() => {
        if (!dirty) return;
        const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [dirty]);

    const current = sections.find((s) => s.id === selected) || null;
    const update = (id: string, patch: Partial<StoreSection>) => setSections((p) => p.map((s) => (s.id === id ? ({ ...s, ...patch } as StoreSection) : s)));
    const moveSection = (from: number, to: number) => setSections((p) => {
        if (to < 0 || to >= p.length || from === to) return p;
        const next = [...p];
        const [m] = next.splice(from, 1);
        next.splice(to, 0, m);
        return next;
    });
    const imagePathsOf = (s: StoreSection): string[] => {
        if (s.type === 'hero' || s.type === 'imageText') return s.data.imagePath ? [s.data.imagePath] : [];
        if (s.type === 'banners') return s.data.items.map((b) => b.imagePath || '').filter(Boolean);
        if (s.type === 'gallery') return s.data.images.map((i) => i.path || '').filter(Boolean);
        return [];
    };

    const addSection = (type: SectionType) => {
        const s = emptySection(type);
        setSections((p) => [...p, s]);
        setSelected(s.id);
        setAdding(false);
        setMobileEditing(true);
    };
    const duplicate = (id: string) => {
        const i = sections.findIndex((s) => s.id === id);
        if (i < 0) return;
        // The copy shares the original's photos; publish only deletes a photo once no section uses it
        const copy = clean({ ...sections[i], id: newId() }) as StoreSection;
        setSections((p) => [...p.slice(0, i + 1), copy, ...p.slice(i + 1)]);
        setSelected(copy.id);
        setMenuFor(null);
    };
    const remove = (id: string) => {
        const s = sections.find((x) => x.id === id);
        if (s) removedPaths.current.push(...imagePathsOf(s));
        setSections((p) => p.filter((x) => x.id !== id));
        if (selected === id) setSelected(null);
        setConfirmDelete(null);
        setMobileEditing(false);
    };

    const discard = () => {
        setSections(clean(saved.length ? saved : starterStorePage(business.businessName || '', business.brandingText).sections));
        removedPaths.current = [];
        setStatus(null);
    };

    const publish = async () => {
        if (!companyId) return;
        setSaving(true); setStatus(null);
        try {
            const payload = clean(sections);
            await setDoc(doc(db, 'companies', companyId, 'settings', 'store_page'), { sections: payload, updatedAt: serverTimestamp(), updatedBy: currentUser?.uid || '' });
            // Old photos go only once nothing published still points at them
            const stillUsed = new Set(payload.flatMap(imagePathsOf));
            await deleteStoreImages(removedPaths.current.filter((p) => !stillUsed.has(p)));
            removedPaths.current = [];
            setSaved(payload);
            setIsStarter(false);
            setStatus({ tone: 'success', text: 'Published. Customers see the new Store page now.' });
        } catch (e) {
            console.error(e);
            setStatus({ tone: 'danger', text: "Couldn't publish. Check your connection and try again." });
        } finally { setSaving(false); }
    };

    const ctx: SectionContext = {
        groups, liveItems, pinnedCategoryIds: pinnedCats, business, preview: true, categoryHref: () => '#',
        renderPinnedCards: () => liveItems.filter((i) => pinnedItems.has(i.id!)).slice(0, 8).map((item, i) => {
            const s = productState(item, null, 0);
            return <ProductCard key={item.id} rail tone={i} name={item.name} unit={s.unit} images={getItemImages(item)} price={s.price} mrp={s.mrp}
                hasOptions={s.hasOptions} outOfStock={s.outOfStock} onOpen={() => { }} onAdd={() => { }} onInc={() => { }} onDec={() => { }} onNotify={() => { }} />;
        }),
    };
    const env = { companyId, categories, onRemovedImage: (p?: string) => { if (p) removedPaths.current.push(p); } };

    const preview = (
        <div className="sf min-h-full bg-sf-canvas font-sans text-slate-900">
            <div className="flex h-14 items-center gap-2.5 border-b border-sf-line bg-white px-4">
                <span className="grid size-[34px] place-items-center overflow-hidden rounded-sm bg-sf-soft text-[13px] font-semibold text-sf-soft-ink">
                    {business.companyLogo ? <img src={business.companyLogo} alt="" className="h-full w-full object-cover" /> : initialsOf(business.businessName)}
                </span>
                <b className="truncate text-[15px] font-semibold">{business.businessName || 'Your shop'}</b>
            </div>
            <div className="px-4 pb-8">{sections.map((s) => <StoreSectionView key={s.id} section={s} ctx={ctx} />)}</div>
        </div>
    );

    if (loading) {
        return <div className="grid min-h-[60vh] place-items-center bg-sf-canvas"><Loader2 className="size-6 animate-spin text-sf-primary" /></div>;
    }

    const row = (s: StoreSection, i: number) => {
        const Icon = TYPE_ICONS[s.type];
        const on = s.id === selected;
        return (
            <div key={s.id} role="option" aria-selected={on} draggable
                onDragStart={() => { dragFrom.current = i; }} onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragFrom.current !== null) moveSection(dragFrom.current, i); dragFrom.current = null; }}
                onClick={() => { setSelected(s.id); setMobileEditing(true); }}
                className={cx('relative grid cursor-pointer grid-cols-[20px_36px_minmax(0,1fr)_auto] items-center gap-3 rounded-sm border py-2.5 pl-2 pr-2.5',
                    on ? 'border-sf-primary bg-sf-soft' : 'border-sf-line bg-white hover:border-sf-control')}>
                <DragHandle className="size-4 cursor-grab text-slate-500" aria-label="Drag to reorder" />
                <span className={cx('grid size-9 place-items-center rounded-sm text-sf-primary', on ? 'bg-white' : 'bg-sf-sunken')}><Icon className="size-5" /></span>
                <span className={cx('min-w-0', s.hidden && 'opacity-55')}>
                    <span className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold leading-5 text-slate-900">
                        {SECTION_INFO[s.type].name}
                        {s.hidden && <span className="rounded-sm bg-sf-sunken px-1.5 text-[11px] font-semibold text-slate-600">Hidden</span>}
                    </span>
                    <span className="block truncate text-xs leading-[18px] text-slate-500">
                        {changedIds.has(s.id) && <span className="mr-1 inline-block rounded-sm bg-sf-primary px-1.5 text-[10px] font-semibold leading-[18px] tracking-wide text-white">CHANGED</span>}
                        {summary(s, categories)}
                    </span>
                </span>
                <span className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <button type="button" aria-label={s.hidden ? 'Show section' : 'Hide section'} onClick={() => update(s.id, { hidden: !s.hidden })}
                        className="grid size-8 place-items-center rounded-sm text-slate-600 hover:bg-sf-sunken">{s.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
                    <button type="button" aria-label="More actions" aria-expanded={menuFor === s.id} onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}
                        className="grid size-8 place-items-center rounded-sm text-slate-600 hover:bg-sf-sunken"><MoreHorizontal className="size-4" /></button>
                </span>
                {menuFor === s.id && (
                    <div className="absolute right-2 top-12 z-20 w-44 overflow-hidden rounded-sm border border-sf-line bg-white py-1 shadow-sf-float" onClick={(e) => e.stopPropagation()}>
                        <button type="button" disabled={i === 0} onClick={() => { moveSection(i, i - 1); setMenuFor(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sf-sunken disabled:opacity-45"><ArrowUp className="size-4" />Move up</button>
                        <button type="button" disabled={i === sections.length - 1} onClick={() => { moveSection(i, i + 1); setMenuFor(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sf-sunken disabled:opacity-45"><ArrowDown className="size-4" />Move down</button>
                        <button type="button" onClick={() => duplicate(s.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-sf-sunken"><Copy className="size-4" />Duplicate</button>
                        <button type="button" onClick={() => { setConfirmDelete(s.id); setMenuFor(null); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><Trash2 className="size-4" />Delete</button>
                    </div>
                )}
            </div>
        );
    };

    const editorBody = current && (
        <SectionEditor key={current.id} section={current} env={env} onChange={(data) => update(current.id, { data } as Partial<StoreSection>)} />
    );
    const currentIndex = current ? sections.findIndex((s) => s.id === current.id) : -1;

    return (
        <div className="min-h-full bg-sf-canvas font-sans text-slate-900" onClick={() => setMenuFor(null)}>
            <header className="flex flex-wrap items-center gap-4 px-4 pb-4 pt-5 md:px-6">
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Store page</h1>
                    <p className="text-[13px] text-slate-600">The home customers see at {storeUrl.replace(/^https?:\/\//, '')}</p>
                </div>
                <div className="flex min-w-0 flex-wrap gap-2">
                    <button type="button" onClick={() => setMobilePreview(true)} className={cx(btnClass('secondary'), 'md:hidden')}><Eye className="size-4" />Preview</button>
                    <button type="button" onClick={() => navigator.clipboard?.writeText(storeUrl.startsWith('http') ? storeUrl : window.location.origin + storeUrl).then(() => setStatus({ tone: 'success', text: 'Store link copied.' })).catch(() => undefined)}
                        className={cx(btnClass('secondary'), 'max-md:hidden')}><Copy className="size-4" />Copy link</button>
                    <a href={storeUrl} target="_blank" rel="noopener noreferrer" className={cx(btnClass('secondary'), 'max-md:hidden')}><Monitor className="size-4" />View store</a>
                </div>
            </header>

            <div className="grid items-start gap-5 px-4 md:grid-cols-[320px_minmax(0,1fr)] md:px-6 xl:grid-cols-[320px_minmax(0,1fr)_264px]">
                <section>
                    {isStarter && (
                        <p className="mb-3 rounded-sm bg-sf-soft px-3 py-2.5 text-[13px] leading-5 text-sf-soft-ink">
                            We made a starter page from your profile. Edit any section, then publish.
                        </p>
                    )}
                    <div className="mb-2.5 flex items-baseline justify-between">
                        <b className="text-[15px] font-semibold">Sections</b>
                        <span className="hidden text-xs text-slate-500 md:inline">Drag to reorder</span>
                    </div>
                    <div role="listbox" aria-label="Sections" className="grid gap-2">
                        {sections.map(row)}
                        <button type="button" onClick={(e) => { e.stopPropagation(); setAdding(true); }}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border-[1.5px] border-dashed border-sf-control font-medium text-sf-primary hover:bg-white">
                            <Plus className="size-4" />Add section
                        </button>
                    </div>
                    <p className="mt-2.5 text-xs text-slate-500">Hidden sections stay saved; customers don't see them. Edit your logo, address and phone in <Link to={`${ROUTES.CHOME}/${ROUTES.CATA_EDIT}`} className="font-medium text-sf-primary">Edit profile</Link>.</p>
                </section>

                {/* Editor (desktop) */}
                <section className="hidden rounded-sm border border-sf-line bg-white p-5 shadow-sf-card md:block">
                    {current ? (
                        <>
                            <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-base font-semibold">{SECTION_INFO[current.type].name}</h2>
                                    <p className="text-xs text-slate-500">Section {currentIndex + 1} of {sections.length} · {SECTION_INFO[current.type].text}</p>
                                </div>
                                <div className="flex gap-0.5">
                                    <button type="button" aria-label="Move up" disabled={currentIndex === 0} onClick={() => moveSection(currentIndex, currentIndex - 1)} className={cx(btnClass('ghost', 'sm'), 'w-8 px-0!')}><ArrowUp className="size-4" /></button>
                                    <button type="button" aria-label="Move down" disabled={currentIndex === sections.length - 1} onClick={() => moveSection(currentIndex, currentIndex + 1)} className={cx(btnClass('ghost', 'sm'), 'w-8 px-0!')}><ArrowDown className="size-4" /></button>
                                </div>
                            </div>
                            {editorBody}
                            <div className="mt-5 flex justify-between border-t border-sf-line pt-4">
                                <button type="button" onClick={() => setConfirmDelete(current.id)} className={btnClass('danger', 'sm')}><Trash2 className="size-4" />Delete section</button>
                                <button type="button" onClick={() => duplicate(current.id)} className={btnClass('ghost', 'sm')}><Copy className="size-4" />Duplicate</button>
                            </div>
                        </>
                    ) : (
                        <div className="grid place-items-center gap-2 py-16 text-center text-[13px] text-slate-500">
                            <b className="text-[15px] font-semibold text-slate-900">Pick a section to edit</b>
                            Or add a new one from the list.
                        </div>
                    )}
                </section>

                {/* Live preview (wide screens) */}
                <section className="sticky top-4 hidden justify-items-center gap-2.5 xl:grid">
                    <div role="group" className="inline-flex gap-0.5 rounded-sm border border-sf-line bg-sf-sunken p-[3px]">
                        {(['phone', 'computer'] as const).map((m) => (
                            <button key={m} type="button" aria-pressed={previewMode === m} onClick={() => setPreviewMode(m)}
                                className={cx('flex h-[30px] items-center gap-1.5 rounded-sm px-3 text-[13px] font-medium', previewMode === m ? 'bg-white text-sf-primary shadow-sf-card' : 'text-slate-600')}>
                                {m === 'phone' ? <Smartphone className="size-4" /> : <Monitor className="size-4" />}{m === 'phone' ? 'Phone' : 'Computer'}
                            </button>
                        ))}
                    </div>
                    <div className="h-[520px] w-[242px] overflow-hidden rounded-[20px] border border-sf-line bg-sf-canvas shadow-sf-float">
                        <div className={cx('pointer-events-none origin-top-left overflow-hidden', previewMode === 'phone' ? 'h-[840px] w-[390px] scale-[.62]' : 'h-[1560px] w-[1210px] scale-[.2]')}>{preview}</div>
                    </div>
                    <span className="text-xs text-slate-500">Live preview · unsaved changes included</span>
                </section>
            </div>

            {/* Save bar */}
            {(dirty || status) && (
                <div className="sticky bottom-0 z-40 mt-6 flex items-center gap-3 border-t border-sf-line bg-white px-4 py-3 shadow-sf-float md:px-5">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">
                        {status ? (
                            <span className={cx('inline-flex items-center gap-1.5', status.tone === 'success' ? 'text-green-700' : 'text-red-700')}>
                                {status.tone === 'success' && <CheckCircle2 className="size-4" />}{status.text}
                            </span>
                        ) : (
                            <><b className="font-semibold text-slate-900">{isStarter ? 'Not published yet' : `${changeNotes.length} unsaved change${changeNotes.length === 1 ? '' : 's'}`}</b>
                                <span className="hidden md:inline">{changeNotes.length ? ` · ${changeNotes.slice(0, 3).join(' · ')}` : ''}</span></>
                        )}
                    </span>
                    {status && !dirty
                        ? <button type="button" aria-label="Dismiss" onClick={() => setStatus(null)} className={cx(btnClass('ghost'), 'w-10 px-0!')}><X className="size-4" /></button>
                        : <>
                            {!isStarter && <button type="button" disabled={saving} onClick={discard} className={btnClass('ghost')}>Discard</button>}
                            <button type="button" disabled={saving} onClick={publish} className={btnClass('primary')}>{saving && <Loader2 className="size-4 animate-spin" />}Publish</button>
                        </>}
                </div>
            )}

            {/* Phones: editor as a bottom sheet */}
            <div className="md:hidden">
                <Sheet open={mobileEditing && !!current} title={current ? SECTION_INFO[current.type].name : ''} onClose={() => setMobileEditing(false)}
                    footer={<button type="button" onClick={() => setMobileEditing(false)} className={btnClass('primary', 'md', true)}>Done</button>}>
                    {editorBody}
                    {current && <button type="button" onClick={() => setConfirmDelete(current.id)} className={cx(btnClass('danger', 'sm'), 'mt-4')}><Trash2 className="size-4" />Delete section</button>}
                </Sheet>
                <Sheet open={mobilePreview} title="Preview" onClose={() => setMobilePreview(false)} wide>
                    <div className="-mx-4 overflow-hidden border-y border-sf-line">{preview}</div>
                </Sheet>
            </div>

            <Sheet open={adding} title="Add a section" onClose={() => setAdding(false)} wide>
                <div className="grid gap-2 sm:grid-cols-2">
                    {ORDER.map((t) => {
                        const Icon = TYPE_ICONS[t];
                        return (
                            <button key={t} type="button" onClick={() => addSection(t)}
                                className="grid grid-cols-[36px_1fr] items-start gap-2.5 rounded-sm border border-sf-line bg-white p-2.5 text-left hover:border-sf-primary">
                                <span className="grid size-9 place-items-center rounded-sm bg-sf-sunken text-sf-primary"><Icon className="size-5" /></span>
                                <span><b className="block text-[13px] font-semibold leading-[18px]">{SECTION_INFO[t].name}</b><small className="block text-xs leading-[17px] text-slate-500">{SECTION_INFO[t].text}</small></span>
                            </button>
                        );
                    })}
                </div>
            </Sheet>

            <Sheet open={!!confirmDelete} title="Delete this section?" onClose={() => setConfirmDelete(null)}
                footer={<>
                    <button type="button" onClick={() => setConfirmDelete(null)} className={btnClass('ghost')}>Cancel</button>
                    <button type="button" onClick={() => confirmDelete && remove(confirmDelete)} className="inline-flex h-10 items-center rounded-sm bg-red-700 px-4 text-sm font-medium text-white hover:bg-red-800">Delete section</button>
                </>}>
                <p className="text-sm text-slate-600">Customers stop seeing it after you publish. Photos in it are deleted then too. To keep it but not show it, hide it instead.</p>
            </Sheet>
        </div>
    );
};

export default StoreBuilder;
