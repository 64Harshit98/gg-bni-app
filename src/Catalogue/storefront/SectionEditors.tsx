import React, { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import type { ItemGroup } from '../../constants/models';
import type { ButtonLink, CategoryGroup, FactIcon, SectionMap, StoreButton, StoreSection } from './storePage.types';
import { newId } from './storePage.types';
import { btnClass, Photo } from './StoreUI';
import { uploadStoreImage } from './uploadStoreImage';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
const inputCls = 'h-10 w-full rounded-sm border border-sf-control bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-2 focus:outline-offset-1 focus:outline-sf-primary';
const areaCls = 'block w-full resize-y rounded-sm border border-sf-control bg-white px-3 py-2.5 text-sm leading-[22px] text-slate-900 placeholder:text-slate-500 focus:outline-2 focus:outline-offset-1 focus:outline-sf-primary';

export interface EditorEnv {
    companyId: string;
    categories: ItemGroup[];
    /** A photo path that is no longer used; deleted from storage after publish. */
    onRemovedImage: (path?: string) => void;
}

const Field: React.FC<{ label: string; hint?: string; count?: [number, number]; children: React.ReactNode; htmlFor?: string }> = ({ label, hint, count, children, htmlFor }) => (
    <div>
        <label htmlFor={htmlFor} className="mb-1.5 flex justify-between text-[13px] font-medium text-slate-900">
            <span>{label}</span>
            {count && <small className={cx('font-normal tabular-nums', count[0] > count[1] ? 'text-red-700' : 'text-slate-500')}>{count[0]} / {count[1]}</small>}
        </label>
        {children}
        {hint && <p className="mt-1.5 text-xs leading-[18px] text-slate-500">{hint}</p>}
    </div>
);

const TextField: React.FC<{ id: string; label: string; value: string; onChange: (v: string) => void; max?: number; placeholder?: string; hint?: string }> = ({ id, label, value, onChange, max, placeholder, hint }) => (
    <Field label={label} htmlFor={id} hint={hint} count={max ? [value.length, max] : undefined}>
        <input id={id} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </Field>
);

const AreaField: React.FC<{ id: string; label: string; value: string; onChange: (v: string) => void; max?: number; rows?: number; placeholder?: string; hint?: string }> = ({ id, label, value, onChange, max, rows = 3, placeholder, hint }) => (
    <Field label={label} htmlFor={id} hint={hint} count={max ? [value.length, max] : undefined}>
        <textarea id={id} rows={rows} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={areaCls} />
    </Field>
);

/** Photo picker: compresses and uploads straight away; the old file is removed on publish. */
export const PhotoField: React.FC<{ env: EditorEnv; sectionId: string; label: string; url?: string; path?: string; banner?: boolean; hint?: string; onChange: (v: { url?: string; path?: string }) => void }> = ({ env, sectionId, label, url, path, banner, hint, onChange }) => {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const pick = async (file?: File) => {
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setErr('That photo is over 10 MB. Pick a smaller one.'); return; }
        setErr(null); setBusy(true);
        try {
            const res = await uploadStoreImage(env.companyId, sectionId, file, banner ? 'banner' : 'photo');
            env.onRemovedImage(path);
            onChange(res);
        } catch (e) {
            console.error(e);
            setErr("The photo didn't upload. Check your connection and try again.");
        } finally { setBusy(false); if (input.current) input.current.value = ''; }
    };
    return (
        <Field label={label} hint={hint ?? (banner ? 'JPG or PNG. Wide photos (3:1) fill the banner on computers; phones show the middle. We shrink big photos so the page opens fast.' : 'JPG or PNG. We shrink big photos so the page opens fast.')}>
            <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
            {url ? (
                <div className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3 rounded-sm border border-sf-line bg-sf-sunken p-3">
                    <Photo src={url} alt="" className="aspect-[4/3]" />
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={btnClass('secondary', 'sm')}>
                            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}Replace
                        </button>
                        <button type="button" disabled={busy} onClick={() => { env.onRemovedImage(path); onChange({ url: undefined, path: undefined }); }} className={btnClass('ghost', 'sm')}>Remove</button>
                    </div>
                </div>
            ) : (
                <button type="button" disabled={busy} onClick={() => input.current?.click()}
                    className="grid w-full place-items-center gap-1 rounded-sm border-[1.5px] border-dashed border-sf-control px-4 py-5 text-center text-xs text-slate-500 hover:bg-sf-sunken">
                    {busy ? <Loader2 className="size-5 animate-spin text-sf-primary" /> : <ImagePlus className="size-5 text-sf-primary" />}
                    <b className="text-[13px] font-medium text-slate-900">{busy ? 'Uploading…' : 'Add a photo'}</b>
                </button>
            )}
            {err && <p className="mt-1.5 text-xs text-red-700">{err}</p>}
        </Field>
    );
};

const linkValue = (l: ButtonLink) => (l.kind === 'category' ? `category:${l.groupId}` : l.kind);
const parseLink = (v: string): ButtonLink => (v.startsWith('category:') ? { kind: 'category', groupId: v.slice(9) } : { kind: v as 'categories' | 'whatsapp' | 'call' });

const ButtonRow: React.FC<{ env: EditorEnv; value: StoreButton; onChange: (b: StoreButton) => void; onRemove?: () => void; idPrefix: string }> = ({ env, value, onChange, onRemove, idPrefix }) => (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
        <input aria-label="Button label" id={`${idPrefix}-label`} value={value.label} maxLength={24} placeholder="Button label" onChange={(e) => onChange({ ...value, label: e.target.value })} className={inputCls} />
        <select aria-label="Button opens" value={linkValue(value.link)} onChange={(e) => onChange({ ...value, link: parseLink(e.target.value) })} className={cx(inputCls, 'pr-2')}>
            <option value="categories">Categories on this page</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="call">Phone call</option>
            {env.categories.map((c) => <option key={c.id} value={`category:${c.id}`}>{c.name}</option>)}
        </select>
        {onRemove ? <button type="button" aria-label="Remove button" onClick={onRemove} className={cx(btnClass('ghost'), 'w-10 px-0!')}><X className="size-4" /></button> : <span className="w-10" />}
    </div>
);

const OptionalButton: React.FC<{ env: EditorEnv; value?: StoreButton; onChange: (b?: StoreButton) => void; id: string }> = ({ env, value, onChange, id }) => (
    <Field label="Button" hint="Optional.">
        {value
            ? <ButtonRow env={env} value={value} idPrefix={id} onChange={onChange} onRemove={() => onChange(undefined)} />
            : <button type="button" onClick={() => onChange({ label: 'Shop now', link: { kind: 'categories' } })} className={btnClass('secondary', 'sm')}><Plus className="size-4" />Add a button</button>}
    </Field>
);

const move = <T,>(list: T[], i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
};

// ── Categories: name groups and choose what goes in each ──
const GroupsEditor: React.FC<{ env: EditorEnv; groups: CategoryGroup[]; onChange: (g: CategoryGroup[]) => void }> = ({ env, groups, onChange }) => {
    const [adding, setAdding] = useState<string | null>(null);
    const used = new Set(groups.flatMap((g) => g.categoryIds));
    const nameOf = (id: string) => env.categories.find((c) => c.id === id)?.name;
    const update = (id: string, patch: Partial<CategoryGroup>) => onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    const ungrouped = env.categories.filter((c) => !used.has(c.id!));
    return (
        <div className="grid gap-3">
            <p className="rounded-sm bg-sf-soft px-3 py-2.5 text-[13px] leading-5 text-sf-soft-ink">
                Every category with a live product shows as a tile. Name groups and add categories to them; categories not in a group show last under <b>More categories</b>.
            </p>
            {groups.map((g, gi) => (
                <div key={g.id} className="grid gap-2.5 rounded-sm border border-sf-line bg-sf-sunken p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <input aria-label="Group name" value={g.name} maxLength={40} placeholder="Group name, e.g. Kitchen and dining" onChange={(e) => update(g.id, { name: e.target.value })} className={inputCls} />
                        <div className="flex">
                            <button type="button" aria-label="Move group up" disabled={gi === 0} onClick={() => onChange(move(groups, gi, -1))} className={cx(btnClass('ghost', 'sm'), 'w-8 px-0!')}><ArrowUp className="size-4" /></button>
                            <button type="button" aria-label="Move group down" disabled={gi === groups.length - 1} onClick={() => onChange(move(groups, gi, 1))} className={cx(btnClass('ghost', 'sm'), 'w-8 px-0!')}><ArrowDown className="size-4" /></button>
                            <button type="button" aria-label="Delete group" onClick={() => onChange(groups.filter((x) => x.id !== g.id))} className={cx(btnClass('danger', 'sm'), 'w-8 px-0!')}><Trash2 className="size-4" /></button>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {g.categoryIds.filter(nameOf).map((cid) => (
                            <span key={cid} className="inline-flex h-7 items-center gap-0.5 rounded-sm border border-sf-control bg-white pl-2.5 pr-0.5 text-xs font-medium text-slate-900">
                                {nameOf(cid)}
                                <button type="button" aria-label={`Remove ${nameOf(cid)} from group`} onClick={() => update(g.id, { categoryIds: g.categoryIds.filter((x) => x !== cid) })} className="grid size-6 place-items-center rounded-sm text-slate-500 hover:bg-sf-sunken"><X className="size-3.5" /></button>
                            </span>
                        ))}
                        {adding === g.id ? (
                            <select autoFocus aria-label="Add a category" value="" onBlur={() => setAdding(null)}
                                onChange={(e) => { if (e.target.value) update(g.id, { categoryIds: [...g.categoryIds, e.target.value] }); setAdding(null); }}
                                className="h-7 rounded-sm border border-sf-control bg-white px-2 text-xs">
                                <option value="">{ungrouped.length ? 'Pick a category…' : 'All categories are in groups'}</option>
                                {ungrouped.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        ) : (
                            <button type="button" disabled={!ungrouped.length} onClick={() => setAdding(g.id)}
                                className="inline-flex h-7 items-center gap-1 rounded-sm border border-dashed border-sf-control px-2.5 text-xs font-medium text-sf-primary disabled:opacity-45">
                                <Plus className="size-3.5" />Add categories
                            </button>
                        )}
                    </div>
                </div>
            ))}
            <button type="button" onClick={() => onChange([...groups, { id: newId(), name: '', categoryIds: [] }])}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border-[1.5px] border-dashed border-sf-control font-medium text-sf-primary hover:bg-sf-sunken">
                <Plus className="size-4" />Add group
            </button>
            {ungrouped.length > 0 && groups.length > 0 && (
                <p className="text-xs text-slate-500">Not in a group yet: {ungrouped.map((c) => c.name).join(', ')}.</p>
            )}
        </div>
    );
};

const FACT_ICONS: { id: FactIcon; label: string }[] = [
    { id: 'award', label: 'Award' }, { id: 'package', label: 'Products' }, { id: 'truck', label: 'Delivery' },
    { id: 'users', label: 'Customers' }, { id: 'shield', label: 'Trust' }, { id: 'clock', label: 'Time' },
];

/** The editor for one section. `onChange` receives the section's new data. */
export const SectionEditor: React.FC<{ section: StoreSection; env: EditorEnv; onChange: (data: SectionMap[keyof SectionMap]) => void }> = ({ section, env, onChange }) => {
    const id = section.id;
    switch (section.type) {
        case 'hero': {
            const d = section.data;
            const set = (p: Partial<typeof d>) => onChange({ ...d, ...p });
            return (
                <div className="grid gap-4">
                    <Field label="Layout">
                        <div role="group" className="inline-flex gap-0.5 rounded-sm border border-sf-line bg-sf-sunken p-[3px]">
                            {(['over', 'beside'] as const).map((l) => (
                                <button key={l} type="button" aria-pressed={d.layout === l} onClick={() => set({ layout: l })}
                                    className={cx('h-[30px] rounded-sm px-3 text-[13px] font-medium', d.layout === l ? 'bg-white text-sf-primary shadow-sf-card' : 'text-slate-600')}>
                                    {l === 'over' ? 'Text over image' : 'Image beside text'}
                                </button>
                            ))}
                        </div>
                    </Field>
                    <PhotoField env={env} sectionId={id} label="Photo" banner url={d.imageUrl} path={d.imagePath} onChange={(v) => set({ imageUrl: v.url, imagePath: v.path })} />
                    <TextField id={`${id}-h`} label="Heading" value={d.heading} max={70} onChange={(v) => set({ heading: v })} placeholder="Steel and kitchenware since 1998" />
                    <AreaField id={`${id}-t`} label="Text" value={d.text || ''} max={160} onChange={(v) => set({ text: v })} placeholder="One or two short lines about the shop." />
                    <Field label="Buttons" hint="Up to 2. The first one is the orange button.">
                        <div className="grid gap-2">
                            {d.buttons.map((b, i) => (
                                <ButtonRow key={i} env={env} idPrefix={`${id}-b${i}`} value={b}
                                    onChange={(nb) => set({ buttons: d.buttons.map((x, j) => (j === i ? nb : x)) })}
                                    onRemove={() => set({ buttons: d.buttons.filter((_, j) => j !== i) })} />
                            ))}
                            {d.buttons.length < 2 && (
                                <button type="button" onClick={() => set({ buttons: [...d.buttons, { label: 'WhatsApp us', link: { kind: 'whatsapp' } }] })} className={cx(btnClass('secondary', 'sm'), 'justify-self-start')}>
                                    <Plus className="size-4" />Add a button
                                </button>
                            )}
                        </div>
                    </Field>
                </div>
            );
        }
        case 'banners': {
            const d = section.data;
            const setItem = (bid: string, p: object) => onChange({ items: d.items.map((b) => (b.id === bid ? { ...b, ...p } : b)) });
            return (
                <div className="grid gap-3">
                    {d.items.map((b, i) => (
                        <div key={b.id} className="grid gap-3 rounded-sm border border-sf-line bg-sf-sunken p-3">
                            <div className="flex items-center justify-between">
                                <b className="text-[13px] font-semibold text-slate-900">Banner {i + 1}</b>
                                <button type="button" aria-label="Delete banner" onClick={() => { env.onRemovedImage(b.imagePath); onChange({ items: d.items.filter((x) => x.id !== b.id) }); }} className={cx(btnClass('danger', 'sm'), 'w-8 px-0!')}><Trash2 className="size-4" /></button>
                            </div>
                            <TextField id={`${b.id}-t`} label="Title" value={b.title} max={40} onChange={(v) => setItem(b.id, { title: v })} placeholder="Diwali gift sets" />
                            <TextField id={`${b.id}-s`} label="Line under it" value={b.text || ''} max={60} onChange={(v) => setItem(b.id, { text: v })} placeholder="Brass and steel hampers from ₹499" />
                            <PhotoField env={env} sectionId={b.id} label="Photo" url={b.imageUrl} path={b.imagePath} hint="Square or 4:3 photos look best." onChange={(v) => setItem(b.id, { imageUrl: v.url, imagePath: v.path })} />
                            <Field label="Button"><ButtonRow env={env} idPrefix={`${b.id}-btn`} value={b.button} onChange={(nb) => setItem(b.id, { button: nb })} /></Field>
                        </div>
                    ))}
                    {d.items.length < 3 && (
                        <button type="button" onClick={() => onChange({ items: [...d.items, { id: newId(), title: '', text: '', button: { label: 'Shop now', link: { kind: 'categories' } } }] })}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border-[1.5px] border-dashed border-sf-control font-medium text-sf-primary hover:bg-sf-sunken">
                            <Plus className="size-4" />Add banner
                        </button>
                    )}
                </div>
            );
        }
        case 'categoryGroups':
            return <GroupsEditor env={env} groups={section.data.groups} onChange={(groups) => onChange({ groups })} />;
        case 'products':
            return (
                <div className="grid gap-4">
                    <TextField id={`${id}-t`} label="Title" value={section.data.title} max={40} onChange={(v) => onChange({ title: v })} placeholder="Our picks" />
                    <p className="rounded-sm bg-sf-sunken px-3 py-2.5 text-[13px] leading-5 text-slate-600">This row shows the products you pinned in Edit catalogue. Pin or unpin products there to change it.</p>
                </div>
            );
        case 'facts': {
            const d = section.data;
            const setItem = (fid: string, p: object) => onChange({ items: d.items.map((f) => (f.id === fid ? { ...f, ...p } : f)) });
            return (
                <div className="grid gap-3">
                    {d.items.map((f) => (
                        <div key={f.id} className="grid grid-cols-[110px_minmax(0,1fr)_auto] items-start gap-2 rounded-sm border border-sf-line bg-sf-sunken p-3">
                            <select aria-label="Icon" value={f.icon} onChange={(e) => setItem(f.id, { icon: e.target.value })} className={inputCls}>
                                {FACT_ICONS.map((ic) => <option key={ic.id} value={ic.id}>{ic.label}</option>)}
                            </select>
                            <div className="grid gap-2">
                                <input aria-label="Title" value={f.title} maxLength={30} placeholder="Since 1998" onChange={(e) => setItem(f.id, { title: e.target.value })} className={inputCls} />
                                <input aria-label="Line under it" value={f.text || ''} maxLength={40} placeholder="26 years on Ghod Dod Road" onChange={(e) => setItem(f.id, { text: e.target.value })} className={inputCls} />
                            </div>
                            <button type="button" aria-label="Delete highlight" onClick={() => onChange({ items: d.items.filter((x) => x.id !== f.id) })} className={cx(btnClass('danger', 'sm'), 'w-8 px-0!')}><Trash2 className="size-4" /></button>
                        </div>
                    ))}
                    {d.items.length < 4 && (
                        <button type="button" onClick={() => onChange({ items: [...d.items, { id: newId(), icon: 'award', title: '', text: '' }] })} className={cx(btnClass('secondary', 'sm'), 'justify-self-start')}>
                            <Plus className="size-4" />Add highlight
                        </button>
                    )}
                </div>
            );
        }
        case 'imageText': {
            const d = section.data;
            const set = (p: Partial<typeof d>) => onChange({ ...d, ...p });
            return (
                <div className="grid gap-4">
                    <TextField id={`${id}-t`} label="Title" value={d.title} max={60} onChange={(v) => set({ title: v })} />
                    <AreaField id={`${id}-p`} label="Text" rows={5} value={d.paragraphs} max={800} onChange={(v) => set({ paragraphs: v })} hint="Leave an empty line between paragraphs." />
                    <PhotoField env={env} sectionId={id} label="Photo" url={d.imageUrl} path={d.imagePath} onChange={(v) => set({ imageUrl: v.url, imagePath: v.path })} />
                    <label className="flex items-center justify-between gap-3 text-[13px] font-medium text-slate-900">
                        Photo on the right (computers)
                        <input type="checkbox" checked={!!d.flip} onChange={(e) => set({ flip: e.target.checked })} className="size-4 accent-sf-primary" />
                    </label>
                    <OptionalButton env={env} id={`${id}-btn`} value={d.button} onChange={(b) => set({ button: b })} />
                </div>
            );
        }
        case 'gallery': {
            const d = section.data;
            const set = (p: Partial<typeof d>) => onChange({ ...d, ...p });
            return (
                <div className="grid gap-4">
                    <TextField id={`${id}-t`} label="Title" value={d.title} max={50} onChange={(v) => set({ title: v })} />
                    <TextField id={`${id}-s`} label="Line under the title" value={d.text || ''} max={90} onChange={(v) => set({ text: v })} />
                    <Field label={`Photos (${d.images.length} of 9)`} hint="The first photo is shown large on computers.">
                        <div className="grid grid-cols-3 gap-2">
                            {d.images.map((im, i) => (
                                <div key={im.id} className="relative">
                                    <Photo src={im.url} alt="" className="aspect-square border border-sf-line" />
                                    <div className="absolute right-1 top-1 flex gap-0.5">
                                        {i > 0 && <button type="button" aria-label="Move earlier" onClick={() => set({ images: move(d.images, i, -1) })} className="grid size-7 place-items-center rounded-sm bg-white/90 text-slate-700 shadow-sf-card"><ArrowUp className="size-3.5 -rotate-90" /></button>}
                                        <button type="button" aria-label="Remove photo" onClick={() => { env.onRemovedImage(im.path); set({ images: d.images.filter((x) => x.id !== im.id) }); }} className="grid size-7 place-items-center rounded-sm bg-white/90 text-red-700 shadow-sf-card"><X className="size-3.5" /></button>
                                    </div>
                                </div>
                            ))}
                            {d.images.length < 9 && (
                                <GalleryAdd env={env} sectionId={id} max={9 - d.images.length}
                                    onAdded={(added) => set({ images: [...d.images, ...added.map((a) => ({ id: newId(), url: a.url, path: a.path }))] })} />
                            )}
                        </div>
                    </Field>
                </div>
            );
        }
        case 'text': {
            const d = section.data;
            const set = (p: Partial<typeof d>) => onChange({ ...d, ...p });
            return (
                <div className="grid gap-4">
                    <TextField id={`${id}-t`} label="Title" value={d.title} max={60} onChange={(v) => set({ title: v })} placeholder="Bulk orders for hotels and caterers" />
                    <AreaField id={`${id}-b`} label="Text" rows={6} value={d.body} max={1000} onChange={(v) => set({ body: v })} hint={'Leave an empty line between paragraphs. Start lines with "- " for a list.'} />
                    <OptionalButton env={env} id={`${id}-btn`} value={d.button} onChange={(b) => set({ button: b })} />
                </div>
            );
        }
        case 'contact': {
            const d = section.data;
            const set = (p: Partial<typeof d>) => onChange({ ...d, ...p });
            return (
                <div className="grid gap-4">
                    <TextField id={`${id}-t`} label="Title" value={d.title} max={40} onChange={(v) => set({ title: v })} />
                    <AreaField id={`${id}-h`} label="Opening hours" rows={3} value={d.hours} onChange={(v) => set({ hours: v })}
                        placeholder={'Mon – Sat: 10:00 am – 8:30 pm\nSunday: 11:00 am – 2:00 pm'} hint='One line per day or range, written as "Day: time".' />
                    <p className="rounded-sm bg-sf-sunken px-3 py-2.5 text-[13px] leading-5 text-slate-600">Address, phone, WhatsApp and email come from Edit profile.</p>
                </div>
            );
        }
    }
};

const GalleryAdd: React.FC<{ env: EditorEnv; sectionId: string; max: number; onAdded: (added: { url: string; path: string }[]) => void }> = ({ env, sectionId, max, onAdded }) => {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    return (
        <>
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
                const files = Array.from(e.target.files || []).slice(0, max);
                if (!files.length) return;
                setBusy(true);
                const added: { url: string; path: string }[] = [];
                try {
                    for (const f of files) added.push(await uploadStoreImage(env.companyId, sectionId, f));
                } catch (err) { console.error(err); } finally {
                    if (added.length) onAdded(added);
                    setBusy(false);
                    if (input.current) input.current.value = '';
                }
            }} />
            <button type="button" disabled={busy} onClick={() => input.current?.click()} aria-label="Add photos"
                className="grid aspect-square place-items-center rounded-sm border-[1.5px] border-dashed border-sf-control text-sf-primary hover:bg-sf-sunken">
                {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            </button>
        </>
    );
};

export const DragHandle = GripVertical;
