import React, { useEffect, useMemo, useState } from 'react';
import { FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { CUSTOMER_PRICING_COLLECTION, getPartyDocId } from '../constants/customerSource';
import { getItemGroupsByCompany, getItemsByCompany } from '../lib/ItemsFirebase';
import type { CustomerItemOverride, CustomerPricingRule, Item, ItemGroup } from '../constants/models';

// Same editor as Party pricing → Edit customer, but for one fixed customer (opened from the bill).

const FIELD = 'flex items-center gap-2 h-10 px-3 rounded-sm border border-[#7a8aa3] bg-white text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc]';
const INPUT = 'flex-1 min-w-0 border-0 outline-none bg-transparent text-sm text-[#0f172b] placeholder:text-[#5b6b86]';
const LABEL = 'block mb-1.5 text-[11px] font-semibold tracking-[.08em] uppercase text-[#5b6b86]';
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-sm bg-[#155dfc] text-white text-sm font-medium hover:bg-[#1447e6] disabled:opacity-[.45]';
const BTN_OUTLINE = 'inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-sm border border-[#7a8aa3] bg-white text-sm font-medium text-[#0f172b] hover:bg-[#f5f7ff] disabled:opacity-[.45]';
const ICON_BTN = 'inline-grid place-items-center w-9 h-9 rounded-sm text-[#45556c] hover:bg-[#f5f7ff]';
const DECIMAL = /^\d*\.?\d*$/;
const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
const money = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const initials = (s: string) => s.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '#';

interface Draft {
    isActive: boolean;
    defaultDiscountPct: string;
    categories: { groupId: string; pct: string }[];
    items: { itemId: string; name: string; type: 'percent' | 'netPrice'; value: string }[];
    note: string;
}

const toDraft = (r: CustomerPricingRule | null): Draft => ({
    isActive: r ? r.isActive !== false : true,
    defaultDiscountPct: r?.defaultDiscountPct ? String(r.defaultDiscountPct) : '',
    categories: Object.entries(r?.categoryDiscounts || {}).map(([groupId, pct]) => ({ groupId, pct: String(pct) })),
    items: Object.entries(r?.itemOverrides || {}).map(([itemId, o]) => ({ itemId, name: o.name, type: o.type, value: String(o.value) })),
    note: r?.note || '',
});

interface Props {
    companyId: string;
    uid: string;
    party: { name: string; number: string };
    rule: CustomerPricingRule | null;
    onClose: () => void;
    /** Called after a save / remove so the bill can re-read the customer's prices. */
    onSaved: () => void;
}

const CustomerPricingEditorModal: React.FC<Props> = ({ companyId, uid, party, rule, onClose, onSaved }) => {
    const [draft, setDraft] = useState<Draft>(() => toDraft(rule));
    const [items, setItems] = useState<Item[]>([]);
    const [groups, setGroups] = useState<ItemGroup[]>([]);
    const [itemQuery, setItemQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const [error, setError] = useState<{ id: string; message: string } | null>(null);

    const partyId = rule?.customerId ?? getPartyDocId(party.name, party.number);
    const label = party.name || party.number;

    useEffect(() => {
        let cancelled = false;
        Promise.all([getItemsByCompany(companyId), getItemGroupsByCompany(companyId)])
            .then(([its, grps]) => { if (!cancelled) { setItems(its.filter(i => !i.isDeleted)); setGroups(grps); } })
            .catch(console.error);
        return () => { cancelled = true; };
    }, [companyId]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const groupName = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g.name])), [groups]);
    const itemById = useMemo(() => new Map(items.map(i => [i.id!, i])), [items]);
    const itemMatches = useMemo(() => {
        const q = itemQuery.trim().toLowerCase();
        if (q.length < 2) return [];
        const taken = new Set(draft.items.map(i => i.itemId));
        return items.filter(i => !taken.has(i.id!) && (i.name.toLowerCase().includes(q) || (i.barcode || '').includes(q))).slice(0, 8);
    }, [itemQuery, items, draft.items]);

    const edit = (fn: (d: Draft) => Draft) => { setError(null); setDraft(fn); };
    const fail = (id: string, message: string) => {
        setError({ id, message });
        requestAnimationFrame(() => document.getElementById(id)?.focus());
    };
    const errorFor = (id: string) => error?.id === id ? <p role="alert" className="mt-1.5 mb-0 text-xs text-red-700">{error.message}</p> : null;

    const previewFor = (it: Draft['items'][number]) => {
        const src = itemById.get(it.itemId);
        if (!src) return null;
        const mrp = Number(src.mrp || 0);
        const sale = Number(src.salesPrice || 0);
        const base = mrp > 0 ? mrp : sale;
        const v = num(it.value);
        if (!base || !Number.isFinite(v)) return `MRP ${mrp > 0 ? money(mrp) : '—'} · sale ${sale > 0 ? money(sale) : '—'}`;
        const net = it.type === 'percent' ? base * (1 - v / 100) : v;
        return `${mrp > 0 ? `MRP ${money(mrp)}` : `Sale ${money(base)}`} → ${money(net)}`;
    };

    const save = async () => {
        const pctOk = (n: number) => Number.isFinite(n) && n > 0 && n <= 100;
        const def = num(draft.defaultDiscountPct);
        if (draft.defaultDiscountPct.trim() && !pctOk(def)) return fail('pe-default', 'Enter more than 0 and up to 100%, or leave it empty.');

        const categoryDiscounts: Record<string, number> = {};
        for (const [idx, c] of draft.categories.entries()) {
            if (!c.groupId) continue;
            const p = num(c.pct);
            if (!pctOk(p)) return fail(`pe-cat-${idx}`, `Enter more than 0 and up to 100% for ${groupName[c.groupId] || 'this category'}.`);
            categoryDiscounts[c.groupId] = p;
        }

        const itemOverrides: Record<string, CustomerItemOverride> = {};
        for (const [idx, it] of draft.items.entries()) {
            const v = num(it.value);
            if (it.type === 'percent' && !pctOk(v)) return fail(`pe-item-${idx}`, 'Enter more than 0 and up to 100%.');
            if (it.type === 'netPrice') {
                const mrp = Number(itemById.get(it.itemId)?.mrp || 0);
                if (!Number.isFinite(v) || v <= 0) return fail(`pe-item-${idx}`, 'Enter the fixed price.');
                if (mrp > 0 && v > mrp) return fail(`pe-item-${idx}`, `Price can't be more than MRP ${money(mrp)}.`);
            }
            itemOverrides[it.itemId] = { name: it.name, type: it.type, value: v };
        }

        const next: CustomerPricingRule = {
            customerId: partyId,
            customerName: party.name,
            customerNumber: party.number,
            isActive: draft.isActive,
            defaultDiscountPct: Number.isFinite(def) ? def : 0,
            categoryDiscounts,
            itemOverrides,
            note: draft.note.trim(),
            updatedBy: uid,
        };
        if (!(next.defaultDiscountPct > 0) && !Object.keys(categoryDiscounts).length && !Object.keys(itemOverrides).length) {
            return fail('pe-default', 'Set a discount on all items, a category or an item.');
        }

        setSaving(true);
        try {
            await setDoc(doc(db, 'companies', companyId, CUSTOMER_PRICING_COLLECTION, partyId), { ...next, updatedAt: serverTimestamp() });
            onSaved();
            onClose();
        } catch (e) {
            console.error(e);
            setError({ id: 'pe-save', message: 'Could not save. Check your connection and try again.' });
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!confirmRemove) { setConfirmRemove(true); return; }
        setSaving(true);
        try {
            await deleteDoc(doc(db, 'companies', companyId, CUSTOMER_PRICING_COLLECTION, partyId));
            onSaved();
            onClose();
        } catch (e) {
            console.error(e);
            setError({ id: 'pe-save', message: 'Could not remove. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[2100] flex items-end md:items-center justify-center bg-[#020618]/45 md:p-4"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-labelledby="pe-title"
                className="w-full md:max-w-2xl max-h-[92dvh] flex flex-col bg-white rounded-t-sm md:rounded-sm border border-[#dfe6fb] shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] text-[#0f172b]">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[#dfe6fb]">
                    <h2 id="pe-title" className="m-0 flex-1 text-lg font-semibold">{rule ? 'Edit customer pricing' : 'Set customer pricing'}</h2>
                    <button type="button" aria-label="Close" onClick={onClose} className={ICON_BTN}><FiX size={18} aria-hidden /></button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-6">
                    {/* Customer (fixed) */}
                    <section className="flex items-center gap-3 p-3 rounded-sm bg-[#f5f7ff] border border-[#dfe6fb]">
                        <span aria-hidden className="grid place-items-center flex-none w-10 h-10 rounded-sm bg-[#dfe6fb] text-[#155dfc] text-sm font-semibold">{initials(label)}</span>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold truncate">{label}</div>
                            {party.name && party.number && <div className="text-xs text-[#5b6b86] truncate">{party.number}</div>}
                        </div>
                    </section>

                    {/* Default */}
                    <section>
                        <label className={LABEL} htmlFor="pe-default">Discount on all items</label>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className={`${FIELD} w-[150px]`}>
                                <input id="pe-default" type="text" inputMode="decimal" value={draft.defaultDiscountPct}
                                    onChange={(e) => DECIMAL.test(e.target.value) && edit(d => ({ ...d, defaultDiscountPct: e.target.value }))}
                                    placeholder="0" className={`${INPUT} tabular-nums`} />
                                <span className="text-sm">%</span>
                            </div>
                            <div role="group" aria-label="Quick picks" className="flex gap-1">
                                {[2, 5, 10, 15, 20].map(p => (
                                    <button key={p} type="button" aria-pressed={draft.defaultDiscountPct === String(p)}
                                        onClick={() => edit(d => ({ ...d, defaultDiscountPct: String(p) }))}
                                        className={`h-8 min-w-10 px-2 rounded-sm border text-xs font-medium tabular-nums ${draft.defaultDiscountPct === String(p) ? 'border-[#155dfc] bg-[#e6eeff] text-[#155dfc]' : 'border-[#dfe6fb] text-[#45556c] hover:bg-[#f5f7ff]'}`}>
                                        {p}%
                                    </button>
                                ))}
                            </div>
                        </div>
                        {errorFor('pe-default')}
                        <p className="mt-1.5 mb-0 text-xs text-[#5b6b86]">Off MRP (sale price when there’s no MRP). Used when no category or item rule below matches.</p>
                    </section>

                    {/* Categories */}
                    <section>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className={LABEL + ' !mb-0'}>By category</span>
                            <button type="button" className="h-8 px-2 rounded-sm text-sm font-medium text-[#155dfc] hover:bg-[#e6eeff]"
                                onClick={() => edit(d => ({ ...d, categories: [...d.categories, { groupId: '', pct: '' }] }))}>
                                + Add category
                            </button>
                        </div>
                        {draft.categories.length === 0 && <p className="m-0 text-xs text-[#5b6b86]">No category discounts.</p>}
                        <div className="space-y-2">
                            {draft.categories.map((c, idx) => (
                                <div key={idx}>
                                    <div className="flex items-center gap-2">
                                        <select value={c.groupId} aria-label="Category"
                                            onChange={(e) => edit(d => ({ ...d, categories: d.categories.map((x, i) => i === idx ? { ...x, groupId: e.target.value } : x) }))}
                                            className="flex-1 min-w-0 h-10 px-2 rounded-sm border border-[#7a8aa3] bg-white text-sm text-[#0f172b]">
                                            <option value="">Choose category</option>
                                            {groups.filter(g => g.id === c.groupId || !draft.categories.some(o => o.groupId === g.id))
                                                .map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                        </select>
                                        <div className={`${FIELD} w-[110px]`}>
                                            <input id={`pe-cat-${idx}`} type="text" inputMode="decimal" value={c.pct}
                                                aria-label={`Discount % for ${groupName[c.groupId] || 'this category'}`}
                                                onChange={(e) => DECIMAL.test(e.target.value) && edit(d => ({ ...d, categories: d.categories.map((x, i) => i === idx ? { ...x, pct: e.target.value } : x) }))}
                                                placeholder="0" className={`${INPUT} tabular-nums`} />
                                            <span className="text-sm">%</span>
                                        </div>
                                        <button type="button" aria-label="Remove category" className={ICON_BTN}
                                            onClick={() => edit(d => ({ ...d, categories: d.categories.filter((_, i) => i !== idx) }))}>
                                            <FiTrash2 size={16} aria-hidden />
                                        </button>
                                    </div>
                                    {errorFor(`pe-cat-${idx}`)}
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Items */}
                    <section>
                        <span className={LABEL}>Specific items</span>
                        <div className={FIELD}>
                            <FiSearch size={16} className="flex-none" aria-hidden />
                            <input type="text" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} autoComplete="off"
                                placeholder="Search item to add a fixed % or price…" className={INPUT} aria-label="Search item" />
                        </div>
                        {itemMatches.length > 0 && (
                            <div className="mt-1 border border-[#dfe6fb] rounded-sm p-1 max-h-48 overflow-y-auto">
                                {itemMatches.map(i => (
                                    <button key={i.id} type="button"
                                        onClick={() => {
                                            const idx = draft.items.length;
                                            edit(d => ({ ...d, items: [...d.items, { itemId: i.id!, name: i.name, type: 'percent', value: '' }] }));
                                            setItemQuery('');
                                            requestAnimationFrame(() => document.getElementById(`pe-item-${idx}`)?.focus());
                                        }}
                                        className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-sm hover:bg-[#e6eeff]">
                                        <span className="flex-1 min-w-0 text-sm truncate">{i.name}</span>
                                        <span className="text-xs text-[#5b6b86] tabular-nums">MRP {Number(i.mrp) > 0 ? money(Number(i.mrp)) : '—'}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="mt-2 space-y-2">
                            {draft.items.map((it, idx) => (
                                <div key={it.itemId} className="border border-[#dfe6fb] rounded-sm p-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="flex-1 min-w-0 text-sm font-medium truncate">{it.name}</span>
                                        <button type="button" aria-label={`Remove ${it.name}`} className={ICON_BTN}
                                            onClick={() => edit(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }))}>
                                            <FiTrash2 size={16} aria-hidden />
                                        </button>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                        <div role="group" aria-label="Discount type" className="inline-flex p-[3px] gap-0.5 bg-[#f5f7ff] border border-[#dfe6fb] rounded-sm">
                                            {([['percent', '% off'], ['netPrice', 'Fixed ₹']] as const).map(([t, l]) => (
                                                <button key={t} type="button" aria-pressed={it.type === t}
                                                    onClick={() => edit(d => ({ ...d, items: d.items.map((x, i) => i === idx ? { ...x, type: t } : x) }))}
                                                    className={`h-7 px-3 rounded-sm text-xs font-medium ${it.type === t ? 'bg-white text-[#155dfc] shadow-sm' : 'text-[#45556c]'}`}>
                                                    {l}
                                                </button>
                                            ))}
                                        </div>
                                        <div className={`${FIELD} w-[120px]`}>
                                            {it.type === 'netPrice' && <span className="text-sm">₹</span>}
                                            <input id={`pe-item-${idx}`} type="text" inputMode="decimal" value={it.value}
                                                aria-label={it.type === 'percent' ? `Discount % for ${it.name}` : `Fixed price for ${it.name}`}
                                                onChange={(e) => DECIMAL.test(e.target.value) && edit(d => ({ ...d, items: d.items.map((x, i) => i === idx ? { ...x, value: e.target.value } : x) }))}
                                                placeholder="0" className={`${INPUT} tabular-nums`} />
                                            {it.type === 'percent' && <span className="text-sm">%</span>}
                                        </div>
                                        <span className="text-xs text-[#5b6b86] tabular-nums">{previewFor(it)}</span>
                                    </div>
                                    {errorFor(`pe-item-${idx}`)}
                                    {it.type === 'netPrice' && <p className="mt-1 mb-0 text-[11px] text-[#5b6b86]">Fixed price is for a single unit; packs use the % rules.</p>}
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div>
                            <label className={LABEL} htmlFor="pe-note">Note (optional)</label>
                            <div className={FIELD}>
                                <input id="pe-note" type="text" value={draft.note} onChange={(e) => edit(d => ({ ...d, note: e.target.value }))}
                                    placeholder="e.g. Dealer rate agreed in Oct…" className={INPUT} autoComplete="off" />
                            </div>
                        </div>
                        <label className="inline-flex items-center gap-2 h-9 text-sm cursor-pointer">
                            <input type="checkbox" checked={draft.isActive} onChange={(e) => edit(d => ({ ...d, isActive: e.target.checked }))} className="w-4 h-4 accent-[#155dfc]" />
                            Active — apply on bills
                        </label>
                    </section>

                    <p className="m-0 text-xs text-[#5b6b86]">
                        Priority: item rule, then category, then “all items”. Applied automatically when the customer is picked on a bill and replaces the item’s own discount.
                    </p>
                </div>

                <div className="px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-[#dfe6fb]">
                    {error?.id === 'pe-save' && <p role="alert" className="mt-0 mb-2 text-xs text-red-700">{error.message}</p>}
                    <div className="flex items-center gap-2">
                        {rule && (
                            <button type="button" onClick={remove} disabled={saving}
                                className="h-10 px-3 -ml-3 rounded-sm text-sm font-medium text-red-700 hover:bg-red-50">
                                {confirmRemove ? 'Tap again to remove' : 'Remove pricing'}
                            </button>
                        )}
                        <div className="flex-1" />
                        <button type="button" className={BTN_OUTLINE} onClick={onClose}>Cancel</button>
                        <button type="button" className={BTN_PRIMARY} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CustomerPricingEditorModal;