import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { collection, doc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { FiCheck, FiEdit2, FiInfo, FiPlus, FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { usePurchaseSettings, useSalesSettings } from '../../context/SettingsContext';
import BackButton from '../../Components/BackButton';
import { Modal } from '../../constants/Modal';
import { Spinner } from '../../constants/Spinner';
import { State } from '../../enums';
import type { CustomerItemOverride, CustomerPricingRule, Item, ItemGroup } from '../../constants/models';
import { CUSTOMER_PRICING_COLLECTION, SUPPLIER_PRICING_COLLECTION, getPartyDocId } from '../../constants/customerSource';
import { getItemGroupsByCompany, getItemsByCompany } from '../../lib/ItemsFirebase';
import { searchParties, type PartyHit } from '../../lib/partySearch';

// Owner sets each customer's (Sale tab) or supplier's (Purchase tab) agreed discount
// here — Busy-style party-wise discount structure, without party groups. Every existing
// party is listed with a quick "% on all items" box; the editor adds category and item
// rules. On the bill the party's price is applied automatically to matching lines,
// only where it is lower.

const FIELD = 'flex items-center gap-2 h-10 px-3 rounded-sm border border-[#7a8aa3] bg-white text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc]';
const INPUT = 'flex-1 min-w-0 border-0 outline-none bg-transparent text-sm text-[#0f172b] placeholder:text-[#5b6b86]';
const LABEL = 'block mb-1.5 text-[11px] font-semibold tracking-[.08em] uppercase text-[#5b6b86]';
const CARD = 'bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]';
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-sm bg-[#155dfc] text-white text-sm font-medium hover:bg-[#1447e6] disabled:opacity-[.45]';
const BTN_OUTLINE = 'inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-sm border border-[#7a8aa3] bg-white text-sm font-medium text-[#0f172b] hover:bg-[#f5f7ff] disabled:opacity-[.45]';
const ICON_BTN = 'inline-grid place-items-center w-9 h-9 rounded-sm text-[#45556c] hover:bg-[#f5f7ff]';
const PAGE = 50;

interface Party { id: string; name: string; number: string }
interface Row extends Party { rule: CustomerPricingRule | null }
type Filter = 'all' | 'with' | 'paused' | 'without';
type RowStatus = 'saving' | 'saved' | 'error';

interface Draft {
    customerName: string;
    customerNumber: string;
    isActive: boolean;
    defaultDiscountPct: string;
    categories: { groupId: string; pct: string }[];
    items: { itemId: string; name: string; type: 'percent' | 'netPrice'; value: string }[];
    note: string;
}

const emptyDraft = (): Draft => ({
    customerName: '', customerNumber: '', isActive: true, defaultDiscountPct: '',
    categories: [], items: [], note: '',
});

const ruleToDraft = (r: CustomerPricingRule): Draft => ({
    customerName: r.customerName || '',
    customerNumber: r.customerNumber || '',
    isActive: r.isActive !== false,
    defaultDiscountPct: r.defaultDiscountPct ? String(r.defaultDiscountPct) : '',
    categories: Object.entries(r.categoryDiscounts || {}).map(([groupId, pct]) => ({ groupId, pct: String(pct) })),
    items: Object.entries(r.itemOverrides || {}).map(([itemId, o]) => ({ itemId, name: o.name, type: o.type, value: String(o.value) })),
    note: r.note || '',
});

const hasDiscount = (r: CustomerPricingRule | null | undefined): r is CustomerPricingRule =>
    !!r && (r.defaultDiscountPct > 0
        || Object.keys(r.categoryDiscounts || {}).length > 0
        || Object.keys(r.itemOverrides || {}).length > 0);

const statusOf = (r: Row): Exclude<Filter, 'all'> =>
    !hasDiscount(r.rule) ? 'without' : r.rule.isActive ? 'with' : 'paused';

const summary = (r: CustomerPricingRule) => {
    const parts: string[] = [];
    if (r.defaultDiscountPct > 0) parts.push(`${r.defaultDiscountPct}% on all items`);
    const c = Object.keys(r.categoryDiscounts || {}).length;
    if (c) parts.push(`${c} ${c === 1 ? 'category' : 'categories'}`);
    const i = Object.keys(r.itemOverrides || {}).length;
    if (i) parts.push(`${i} ${i === 1 ? 'item' : 'items'}`);
    return parts.join(' · ') || 'No discount';
};

const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
const money = (n: number) => `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const initials = (s: string) => s.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '#';
const DECIMAL = /^\d*\.?\d*$/;
const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

const CustomerPricing: React.FC = () => {
    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId;
    const uid = currentUser?.uid || '';
    const { salesSettings } = useSalesSettings();
    const { purchaseSettings } = usePurchaseSettings();

    // Sale = customer-wise discounts, Purchase = supplier-wise discounts (same rule shape).
    // Kept in the URL (?side=purchase) so a reload or a shared link opens the same tab.
    const [searchParams, setSearchParams] = useSearchParams();
    const side: 'sale' | 'purchase' = searchParams.get('side') === 'purchase' ? 'purchase' : 'sale';
    const COLL = side === 'sale' ? CUSTOMER_PRICING_COLLECTION : SUPPLIER_PRICING_COLLECTION;
    const PARTY_COLL = side === 'sale' ? 'customers' : 'suppliers';
    const party = side === 'sale' ? 'customer' : 'supplier';
    const Party = side === 'sale' ? 'Customer' : 'Supplier';
    const partiesWord = side === 'sale' ? 'customers' : 'suppliers';

    const featureOn = side === 'sale' ? !!salesSettings?.enableCustomerPricing : !!purchaseSettings?.enableSupplierPricing;
    const settingsKnown = side === 'sale' ? !!salesSettings : !!purchaseSettings;

    const [rules, setRules] = useState<CustomerPricingRule[]>([]);
    const [parties, setParties] = useState<Party[]>([]);
    const partyCache = useRef<Partial<Record<'sale' | 'purchase', Party[]>>>({});
    const [items, setItems] = useState<Item[]>([]);
    const [groups, setGroups] = useState<ItemGroup[]>([]);
    const [loadingRules, setLoadingRules] = useState(true);
    const [loadingParties, setLoadingParties] = useState(true);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [pendingDelete, setPendingDelete] = useState<CustomerPricingRule | null>(null);
    const [pendingBulkRemove, setPendingBulkRemove] = useState(false);
    const [turningOn, setTurningOn] = useState(false);

    // List
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('all');
    const [limitN, setLimitN] = useState(PAGE);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [quick, setQuick] = useState<Record<string, string>>({});       // "% on all items" being typed
    const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
    const [bulkPct, setBulkPct] = useState('');
    const [announce, setAnnounce] = useState('');
    const statusTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

    // Editor
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);   // rule being edited
    const [targetId, setTargetId] = useState<string | null>(null);     // party doc the rule is for
    const [partyLocked, setPartyLocked] = useState(false);
    const [canChangeParty, setCanChangeParty] = useState(true);
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const [saving, setSaving] = useState(false);
    const [partyHits, setPartyHits] = useState<PartyHit[]>([]);
    const [itemQuery, setItemQuery] = useState('');
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [formError, setFormError] = useState<{ id: string; message: string } | null>(null);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const openedDraft = useRef('');
    const openerRef = useRef<HTMLElement | null>(null);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timers = statusTimers.current;
        return () => timers.forEach(clearTimeout);
    }, []);

    // ───────────────────────── Data ─────────────────────────
    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        Promise.all([getItemsByCompany(companyId), getItemGroupsByCompany(companyId)])
            .then(([its, grps]) => {
                if (cancelled) return;
                setItems(its.filter(i => !i.isDeleted));
                setGroups(grps);
            })
            .catch(err => console.error(err));
        return () => { cancelled = true; };
    }, [companyId]);

    useEffect(() => {
        if (!companyId) return;
        let cancelled = false;
        setLoadingRules(true);
        setRules([]);
        getDocs(collection(db, 'companies', companyId, COLL))
            .then(snap => {
                if (!cancelled) setRules(snap.docs.map(d => ({ ...(d.data() as CustomerPricingRule), customerId: d.id })));
            })
            .catch(err => {
                console.error(err);
                if (!cancelled) setModal({ message: 'Could not load party pricing. Check your connection and reload.', type: State.ERROR });
            })
            .finally(() => { if (!cancelled) setLoadingRules(false); });
        return () => { cancelled = true; };
    }, [companyId, COLL]);

    // Every saved customer / supplier, so a discount can be set without searching first.
    useEffect(() => {
        if (!companyId) return;
        const cached = partyCache.current[side];
        if (cached) { setParties(cached); setLoadingParties(false); return; }
        let cancelled = false;
        setLoadingParties(true);
        setParties([]);
        getDocs(collection(db, 'companies', companyId, PARTY_COLL))
            .then(snap => {
                if (cancelled) return;
                const list = snap.docs
                    .map(d => {
                        const data = d.data();
                        return { id: d.id, name: String(data.name || '').trim(), number: String(data.number || '').trim() };
                    })
                    .filter(p => p.name || p.number);
                partyCache.current[side] = list;
                setParties(list);
            })
            .catch(err => console.error('Party list load failed', err))
            .finally(() => { if (!cancelled) setLoadingParties(false); });
        return () => { cancelled = true; };
    }, [companyId, side, PARTY_COLL]);

    const groupName = useMemo(() => Object.fromEntries(groups.map(g => [g.id, g.name])), [groups]);
    const itemById = useMemo(() => new Map(items.map(i => [i.id!, i])), [items]);
    const ruleById = useMemo(() => new Map(rules.map(r => [r.customerId, r])), [rules]);
    const partyIds = useMemo(() => new Set(parties.map(p => p.id)), [parties]);

    /** Parties + rules for parties that aren't in the master (e.g. added by name only). */
    const rows = useMemo<Row[]>(() => {
        const out: Row[] = parties.map(p => ({ ...p, rule: ruleById.get(p.id) ?? null }));
        for (const r of rules) {
            if (!partyIds.has(r.customerId)) out.push({ id: r.customerId, name: r.customerName, number: r.customerNumber, rule: r });
        }
        const rank = (r: Row) => ({ with: 0, paused: 1, without: 2 })[statusOf(r)];
        return out.sort((a, b) => rank(a) - rank(b) || (a.name || a.number).localeCompare(b.name || b.number));
    }, [parties, rules, ruleById, partyIds]);

    const searched = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        const digits = q.replace(/\D/g, '');
        return rows.filter(r => r.name.toLowerCase().includes(q) || (digits.length > 0 && r.number.includes(digits)));
    }, [rows, query]);

    const counts = useMemo(() => {
        const c = { all: searched.length, with: 0, paused: 0, without: 0 };
        searched.forEach(r => { c[statusOf(r)] += 1; });
        return c;
    }, [searched]);

    const shown = useMemo(() => (filter === 'all' ? searched : searched.filter(r => statusOf(r) === filter)), [searched, filter]);
    const visible = shown.slice(0, limitN);
    const selectedRows = rows.filter(r => selected.has(r.id));
    const allVisibleSelected = visible.length > 0 && visible.every(r => selected.has(r.id));
    const someVisibleSelected = visible.some(r => selected.has(r.id));

    const itemMatches = useMemo(() => {
        const q = itemQuery.trim().toLowerCase();
        if (q.length < 2) return [];
        const taken = new Set(draft.items.map(i => i.itemId));
        return items
            .filter(i => !taken.has(i.id!) && (i.name.toLowerCase().includes(q) || (i.barcode || '').includes(q)))
            .slice(0, 8);
    }, [itemQuery, items, draft.items]);

    const copySources = useMemo(
        () => rules.filter(r => r.customerId !== (editingId ?? targetId) && hasDiscount(r))
            .sort((a, b) => (a.customerName || a.customerNumber).localeCompare(b.customerName || b.customerNumber)),
        [rules, editingId, targetId]);

    // ───────────────────────── List actions ─────────────────────────
    const switchSide = (v: 'sale' | 'purchase') => {
        if (v === side) return;
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (v === 'purchase') next.set('side', 'purchase'); else next.delete('side');
            return next;
        }, { replace: true });
        setQuery(''); setFilter('all'); setLimitN(PAGE); setSelected(new Set()); setQuick({}); setBulkPct('');
    };

    const markStatus = (ids: string[], s: RowStatus) => {
        setRowStatus(prev => ({ ...prev, ...Object.fromEntries(ids.map(i => [i, s])) }));
        if (s === 'saving') return;
        statusTimers.current.push(setTimeout(() => {
            setRowStatus(prev => {
                const next = { ...prev };
                ids.forEach(i => { if (next[i] === s) delete next[i]; });
                return next;
            });
        }, 1600));
    };

    const newRule = (p: Party): CustomerPricingRule => ({
        customerId: p.id, customerName: p.name, customerNumber: p.number, isActive: true,
        defaultDiscountPct: 0, categoryDiscounts: {}, itemOverrides: {}, note: '', updatedBy: uid,
    });

    /**
     * Sets "% on all items" for one or many parties in one write. Creates the rule when
     * the party has none; removes a rule that ends up with no discount at all.
     */
    const saveDefaults = async (targets: Row[], pct: number) => {
        if (!companyId || targets.length === 0) return false;
        const ids = targets.map(t => t.id);
        const before = rules;
        const next = new Map(ruleById);
        type Op = { kind: 'set' | 'merge' | 'delete'; id: string; data?: Record<string, unknown> };
        const ops: Op[] = [];
        for (const t of targets) {
            const updated = { ...(t.rule ?? newRule(t)), defaultDiscountPct: pct };
            if (!hasDiscount(updated)) {
                if (t.rule) { ops.push({ kind: 'delete', id: t.id }); next.delete(t.id); }
                continue;
            }
            ops.push(t.rule
                ? { kind: 'merge', id: t.id, data: { defaultDiscountPct: pct, updatedAt: serverTimestamp(), updatedBy: uid } }
                : { kind: 'set', id: t.id, data: { ...updated, updatedAt: serverTimestamp() } });
            next.set(t.id, updated);
        }
        if (ops.length === 0) return true;
        markStatus(ids, 'saving');
        setRules([...next.values()]);
        try {
            for (let i = 0; i < ops.length; i += 450) {
                const batch = writeBatch(db);
                ops.slice(i, i + 450).forEach(op => {
                    const ref = doc(db, 'companies', companyId, COLL, op.id);
                    if (op.kind === 'delete') batch.delete(ref);
                    else if (op.kind === 'merge') batch.set(ref, op.data!, { merge: true });
                    else batch.set(ref, op.data!);
                });
                await batch.commit();
            }
            markStatus(ids, 'saved');
            setAnnounce(targets.length === 1
                ? `Saved ${pct}% for ${targets[0].name || targets[0].number}`
                : `Saved ${pct}% for ${targets.length} ${partiesWord}`);
            return true;
        } catch (e) {
            console.error(e);
            setRules(before);
            markStatus(ids, 'error');
            setModal({ message: 'Could not save the discount. Check your connection and try again.', type: State.ERROR });
            return false;
        }
    };

    const quickValue = (r: Row) => quick[r.id] ?? (r.rule?.defaultDiscountPct ? String(r.rule.defaultDiscountPct) : '');
    const clearQuick = (id: string) => setQuick(q => { const n = { ...q }; delete n[id]; return n; });
    const commitQuick = (r: Row) => {
        const text = quick[r.id];
        if (text === undefined) return;
        clearQuick(r.id);
        const v = text.trim() === '' ? 0 : Number(text);
        if (!Number.isFinite(v) || v < 0 || v > 100) {
            markStatus([r.id], 'error');
            setAnnounce('Enter a discount up to 100%.');
            return;
        }
        if (v === (r.rule?.defaultDiscountPct || 0)) return;
        void saveDefaults([r], v);
    };

    const toggleActive = async (rule: CustomerPricingRule) => {
        if (!companyId) return;
        const next = { ...rule, isActive: !rule.isActive };
        setRules(prev => prev.map(x => (x.customerId === rule.customerId ? next : x)));
        try {
            await setDoc(doc(db, 'companies', companyId, COLL, rule.customerId),
                { isActive: next.isActive, updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true });
        } catch (e) {
            console.error(e);
            setRules(prev => prev.map(x => (x.customerId === rule.customerId ? rule : x)));
            setModal({ message: 'Could not update. Please try again.', type: State.ERROR });
        }
    };

    const deleteRules = async (ids: string[]) => {
        if (!companyId || ids.length === 0) return false;
        const before = rules;
        setRules(prev => prev.filter(x => !ids.includes(x.customerId)));
        try {
            for (let i = 0; i < ids.length; i += 450) {
                const batch = writeBatch(db);
                ids.slice(i, i + 450).forEach(id => batch.delete(doc(db, 'companies', companyId, COLL, id)));
                await batch.commit();
            }
            return true;
        } catch (e) {
            console.error(e);
            setRules(before);
            setModal({ message: 'Could not remove. Please try again.', type: State.ERROR });
            return false;
        }
    };

    const applyBulk = async () => {
        const v = num(bulkPct);
        if (!Number.isFinite(v) || v <= 0 || v > 100) {
            setAnnounce('Enter a discount more than 0 and up to 100%.');
            document.getElementById('cp-bulk')?.focus();
            return;
        }
        if (await saveDefaults(selectedRows, v)) { setSelected(new Set()); setBulkPct(''); }
    };

    const confirmBulkRemove = async () => {
        setPendingBulkRemove(false);
        const ids = selectedRows.filter(r => r.rule).map(r => r.id);
        if (await deleteRules(ids)) setSelected(new Set());
    };

    const toggleSelect = (id: string) => setSelected(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });
    const toggleSelectVisible = () => setSelected(prev => {
        const next = new Set(prev);
        if (allVisibleSelected) visible.forEach(r => next.delete(r.id));
        else visible.forEach(r => next.add(r.id));
        return next;
    });

    const turnOn = async () => {
        if (!companyId) return;
        setTurningOn(true);
        try {
            await setDoc(doc(db, 'companies', companyId, 'settings', side === 'sale' ? 'sales-settings' : 'purchase-settings'),
                side === 'sale' ? { enableCustomerPricing: true } : { enableSupplierPricing: true }, { merge: true });
        } catch (e) {
            console.error(e);
            setModal({ message: 'Could not turn it on. Please try again.', type: State.ERROR });
        } finally {
            setTurningOn(false);
        }
    };

    // ───────────────────────── Editor ─────────────────────────
    const openEditor = (opts: { id: string | null; target: string | null; draft: Draft; locked: boolean; canChange: boolean }) => {
        openerRef.current = document.activeElement as HTMLElement | null;
        openedDraft.current = JSON.stringify(opts.draft);
        setEditingId(opts.id); setTargetId(opts.target); setDraft(opts.draft);
        setPartyLocked(opts.locked); setCanChangeParty(opts.canChange);
        setPartyHits([]); setItemQuery(''); setFormError(null);
        setEditorOpen(true);
    };
    /** "Add customer" — optionally prefilled from the search box. */
    const openNew = (prefill = '') => {
        const compact = prefill.replace(/\s/g, '');
        const isPhone = compact !== '' && /^\+?\d+$/.test(compact);
        openEditor({
            id: null, target: null, locked: false, canChange: true,
            draft: {
                ...emptyDraft(),
                customerName: isPhone ? '' : prefill.trim(),
                customerNumber: isPhone ? compact.replace(/\D/g, '').slice(-10) : '',
            },
        });
    };
    /** Row → its party is fixed; the rule is created on save if it has none. */
    const openRow = (r: Row) => openEditor({
        id: r.rule ? r.id : null, target: r.id, locked: true, canChange: false,
        draft: { ...(r.rule ? ruleToDraft(r.rule) : emptyDraft()), customerName: r.name, customerNumber: r.number },
    });
    const closeEditor = () => {
        setEditorOpen(false); setPartyHits([]); setFormError(null); setConfirmDiscard(false);
        openerRef.current?.focus?.();
    };
    const requestClose = useCallback(() => {
        if (JSON.stringify(draft) !== openedDraft.current || itemQuery.trim()) setConfirmDiscard(true);
        else closeEditor();
    }, [draft, itemQuery]);

    const confirmDelete = async () => {
        const r = pendingDelete;
        setPendingDelete(null);
        if (!r) return;
        if (await deleteRules([r.customerId]) && editorOpen) closeEditor();
    };

    const editDraft = (fn: (d: Draft) => Draft) => { setFormError(null); setDraft(fn); };
    const fail = (id: string, message: string) => {
        setFormError({ id, message });
        requestAnimationFrame(() => document.getElementById(id)?.focus());
    };
    const errorFor = (id: string) => formError?.id === id
        ? <p id={`${id}-err`} role="alert" className="mt-1.5 mb-0 text-xs text-red-700">{formError.message}</p>
        : null;
    const invalid = (id: string) => (formError?.id === id
        ? { 'aria-invalid': true, 'aria-describedby': `${id}-err` } as const
        : {});

    const onPartyType = (value: string, field: 'name' | 'number') => {
        editDraft(d => field === 'name' ? { ...d, customerName: value } : { ...d, customerNumber: value });
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (!companyId) return;
        searchTimer.current = setTimeout(async () => {
            try { setPartyHits(await searchParties(companyId, PARTY_COLL, value, field)); }
            catch (e) { console.error(e); }
        }, 350);
    };

    /** Picking an existing party: load their pricing if they already have it. */
    const pickParty = (h: PartyHit) => {
        const number = /^\d{10}$/.test(h.number) ? h.number : '';
        const existing = ruleById.get(h.id);
        const next = existing
            ? { ...ruleToDraft(existing), customerName: h.name, customerNumber: number }
            : { ...draft, customerName: h.name, customerNumber: number };
        openedDraft.current = JSON.stringify(next);
        setDraft(next);
        setEditingId(existing ? h.id : null);
        setTargetId(h.id);
        setPartyLocked(true);
        setPartyHits([]);
        setFormError(null);
        requestAnimationFrame(() => document.getElementById('cp-default')?.focus());
    };
    const changeParty = () => {
        setPartyLocked(false); setTargetId(null); setEditingId(null);
        editDraft(d => ({ ...d, customerName: '', customerNumber: '' }));
        requestAnimationFrame(() => document.getElementById('cp-phone')?.focus());
    };

    const copyFrom = (id: string) => {
        const src = ruleById.get(id);
        if (!src) return;
        const d = ruleToDraft(src);
        editDraft(cur => ({ ...cur, defaultDiscountPct: d.defaultDiscountPct, categories: d.categories, items: d.items }));
    };

    // Focus the first field on open; Esc closes; Tab stays inside the editor.
    useEffect(() => {
        if (!editorOpen) return;
        document.getElementById(partyLocked ? 'cp-default' : 'cp-phone')?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editorOpen]);
    useEffect(() => {
        if (!editorOpen || confirmDiscard || pendingDelete) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); requestClose(); return; }
            if (e.key !== 'Tab' || !dialogRef.current) return;
            const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (nodes.length === 0) return;
            const firstEl = nodes[0], lastEl = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
            else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [editorOpen, confirmDiscard, pendingDelete, requestClose]);

    const save = async () => {
        if (!companyId) return;
        const name = draft.customerName.trim();
        const phone = partyLocked ? draft.customerNumber.trim() : draft.customerNumber.replace(/\D/g, '');
        if (!name && !phone) return fail('cp-phone', `Enter the ${party}'s phone number or name.`);
        if (!partyLocked && phone && phone.length !== 10) return fail('cp-phone', 'Phone number must be exactly 10 digits.');

        const pctOk = (n: number) => Number.isFinite(n) && n > 0 && n <= 100;
        const def = num(draft.defaultDiscountPct);
        if (draft.defaultDiscountPct.trim() && !pctOk(def)) return fail('cp-default', 'Enter more than 0 and up to 100%, or leave it empty.');

        const categoryDiscounts: Record<string, number> = {};
        for (const [idx, c] of draft.categories.entries()) {
            if (!c.groupId) continue;
            const p = num(c.pct);
            if (!pctOk(p)) return fail(`cp-cat-${idx}`, `Enter more than 0 and up to 100% for ${groupName[c.groupId] || 'this category'}.`);
            categoryDiscounts[c.groupId] = p;
        }

        const itemOverrides: Record<string, CustomerItemOverride> = {};
        for (const [idx, it] of draft.items.entries()) {
            const v = num(it.value);
            if (it.type === 'percent' && !pctOk(v)) return fail(`cp-item-${idx}`, 'Enter more than 0 and up to 100%.');
            if (it.type === 'netPrice') {
                const mrp = Number(itemById.get(it.itemId)?.mrp || 0);
                if (!Number.isFinite(v) || v <= 0) return fail(`cp-item-${idx}`, 'Enter the fixed price.');
                if (mrp > 0 && v > mrp) return fail(`cp-item-${idx}`, `Price can't be more than MRP ${money(mrp)}.`);
            }
            itemOverrides[it.itemId] = { name: it.name, type: it.type, value: v };
        }

        const id = targetId ?? getPartyDocId(name, phone);
        if (!editingId && ruleById.has(id)) {
            return fail('cp-phone', `This ${party} already has pricing. Pick them from the list to edit it.`);
        }

        const rule: CustomerPricingRule = {
            customerId: id,
            customerName: name,
            customerNumber: phone,
            isActive: draft.isActive,
            defaultDiscountPct: Number.isFinite(def) ? def : 0,
            categoryDiscounts,
            itemOverrides,
            note: draft.note.trim(),
            updatedBy: uid,
        };
        if (!hasDiscount(rule)) return fail('cp-default', 'Set a discount on all items, a category or an item.');

        const isNewParty = !partyIds.has(id);
        setSaving(true);
        try {
            const batch = writeBatch(db);
            batch.set(doc(db, 'companies', companyId, COLL, id), { ...rule, updatedAt: serverTimestamp() });
            if (isNewParty) {
                // Same shape PaymentDrawer writes, so the party shows up in billing search.
                batch.set(doc(db, 'companies', companyId, PARTY_COLL, id), {
                    name, number: phone, companyId,
                    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
                    ...(side === 'sale' ? { source: 'pos' } : {}),
                }, { merge: true });
            }
            await batch.commit();
            setRules(prev => [...prev.filter(r => r.customerId !== id), rule]);
            if (isNewParty) {
                const list = [...parties, { id, name, number: phone }];
                partyCache.current[side] = list;
                setParties(list);
            }
            setAnnounce(`Saved pricing for ${name || phone}`);
            markStatus([id], 'saved');
            closeEditor();
        } catch (e) {
            console.error(e);
            setModal({ message: 'Could not save. Check your connection and try again.', type: State.ERROR });
        } finally {
            setSaving(false);
        }
    };

    const previewFor = (it: Draft['items'][number]) => {
        const src = itemById.get(it.itemId);
        if (!src) return null;
        const mrp = Number(src.mrp || 0);
        const v = num(it.value);
        const fmt = (n: number) => (n > 0 ? money(n) : '—');
        if (side === 'purchase') {
            // Supplier discounts come off the purchase rate
            const rate = Number(src.purchasePrice || 0);
            if (!rate || !Number.isFinite(v)) return `Rate ${fmt(rate)} · MRP ${fmt(mrp)}`;
            return `Rate ${money(rate)} → ${money(it.type === 'percent' ? rate * (1 - v / 100) : v)}`;
        }
        const sale = Number(src.salesPrice || 0);
        const base = mrp > 0 ? mrp : sale;
        if (!base || !Number.isFinite(v)) return `MRP ${fmt(mrp)} · sale ${fmt(sale)}`;
        const net = it.type === 'percent' ? base * (1 - v / 100) : v;
        return `${mrp > 0 ? `MRP ${money(mrp)}` : `Sale ${money(base)}`} → ${money(net)}`;
    };

    // ───────────────────────── Editor UI ─────────────────────────
    const renderPartySection = () => {
        if (partyLocked) {
            const label = draft.customerName || draft.customerNumber;
            return (
                <section className="flex items-center gap-3 p-3 rounded-sm bg-[#f5f7ff] border border-[#dfe6fb]">
                    <span aria-hidden className="grid place-items-center flex-none w-10 h-10 rounded-sm bg-[#dfe6fb] text-[#155dfc] text-sm font-semibold">{initials(label)}</span>
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{label}</div>
                        <div className="text-xs text-[#5b6b86] truncate">
                            {draft.customerName && draft.customerNumber ? draft.customerNumber : partyIds.has(targetId || '') ? `Saved ${party}` : `New ${party}`}
                        </div>
                    </div>
                    {canChangeParty && (
                        <button type="button" onClick={changeParty} className="h-9 px-3 rounded-sm text-sm font-medium text-[#155dfc] hover:bg-[#e6eeff]">Change</button>
                    )}
                </section>
            );
        }
        return (
            <section>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className={LABEL} htmlFor="cp-phone">Phone</label>
                        <div className={FIELD}>
                            <input id="cp-phone" name="partyPhone" type="tel" inputMode="tel" maxLength={10} {...invalid('cp-phone')}
                                value={draft.customerNumber}
                                onChange={(e) => onPartyType(e.target.value.replace(/\D/g, '').slice(0, 10), 'number')}
                                placeholder="9000000000" className={INPUT} autoComplete="off" />
                        </div>
                        {errorFor('cp-phone')}
                    </div>
                    <div>
                        <label className={LABEL} htmlFor="cp-name">{Party} name</label>
                        <div className={FIELD}>
                            <input id="cp-name" name="partyName" type="text"
                                value={draft.customerName}
                                onChange={(e) => onPartyType(e.target.value, 'name')}
                                placeholder="Search or type a name…" className={INPUT} autoComplete="off" spellCheck={false} />
                        </div>
                    </div>
                </div>
                {partyHits.length > 0 && (
                    <div className="mt-2 border border-[#dfe6fb] rounded-sm p-1 max-h-48 overflow-y-auto">
                        {partyHits.map(h => (
                            <button key={h.id} type="button" onClick={() => pickParty(h)}
                                className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-sm hover:bg-[#e6eeff]">
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm font-medium text-[#0f172b] truncate">{h.name || h.number}</span>
                                    {h.name && <span className="block text-xs text-[#5b6b86]">{h.number}</span>}
                                </span>
                                {hasDiscount(ruleById.get(h.id)) && (
                                    <span className="flex-none px-1.5 py-0.5 rounded-sm bg-[#dcfce7] text-[#008236] text-[11px] font-medium">Has pricing</span>
                                )}
                            </button>
                        ))}
                    </div>
                )}
                <p className="mt-2 mb-0 text-xs text-[#5b6b86]">
                    Pick a saved {party}, or type a new one — they’re added to your {partiesWord} when you save.
                </p>
            </section>
        );
    };

    const renderEditor = () => !editorOpen ? null : (
        <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center bg-[#020618]/45 md:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="cp-editor-title"
                className="w-full md:max-w-2xl max-h-[92dvh] flex flex-col bg-white rounded-t-sm md:rounded-sm border border-[#dfe6fb] shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)]">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[#dfe6fb]">
                    <h2 id="cp-editor-title" className="m-0 flex-1 text-lg font-semibold">{editingId ? `Edit ${party} pricing` : `Set ${party} pricing`}</h2>
                    <button type="button" aria-label="Close" onClick={requestClose} className={ICON_BTN}><FiX size={18} aria-hidden /></button>
                </div>

                <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-6">
                    {renderPartySection()}

                    {copySources.length > 0 && (
                        <section>
                            <label className={LABEL} htmlFor="cp-copy">Copy from another {party}</label>
                            <select id="cp-copy" value="" onChange={(e) => e.target.value && copyFrom(e.target.value)}
                                className="w-full h-10 px-2 rounded-sm border border-[#7a8aa3] bg-white text-sm text-[#0f172b]">
                                <option value="">Start from scratch, or pick a {party} to copy…</option>
                                {copySources.map(r => (
                                    <option key={r.customerId} value={r.customerId}>
                                        {(r.customerName || r.customerNumber)} — {summary(r)}
                                    </option>
                                ))}
                            </select>
                        </section>
                    )}

                    {/* Default */}
                    <section>
                        <label className={LABEL} htmlFor="cp-default">Discount on all items</label>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className={`${FIELD} w-[150px]`}>
                                <input id="cp-default" type="text" inputMode="decimal" value={draft.defaultDiscountPct} {...invalid('cp-default')}
                                    onChange={(e) => DECIMAL.test(e.target.value) && editDraft(d => ({ ...d, defaultDiscountPct: e.target.value }))}
                                    placeholder="0" className={`${INPUT} tabular-nums`} />
                                <span className="text-sm">%</span>
                            </div>
                            <div role="group" aria-label="Quick picks" className="flex gap-1">
                                {[2, 5, 10, 15, 20].map(p => (
                                    <button key={p} type="button" aria-pressed={draft.defaultDiscountPct === String(p)}
                                        onClick={() => editDraft(d => ({ ...d, defaultDiscountPct: String(p) }))}
                                        className={`h-8 min-w-10 px-2 rounded-sm border text-xs font-medium tabular-nums ${draft.defaultDiscountPct === String(p) ? 'border-[#155dfc] bg-[#e6eeff] text-[#155dfc]' : 'border-[#dfe6fb] text-[#45556c] hover:bg-[#f5f7ff]'}`}>
                                        {p}%
                                    </button>
                                ))}
                            </div>
                        </div>
                        {errorFor('cp-default')}
                        <p className="mt-1.5 mb-0 text-xs text-[#5b6b86]">{side === 'sale' ? 'Off MRP (sale price when there’s no MRP).' : 'Off the purchase rate.'} Used when no category or item rule below matches.</p>
                    </section>

                    {/* Categories */}
                    <section>
                        <div className="flex items-center justify-between mb-1.5">
                            <span className={LABEL + ' !mb-0'}>By category</span>
                            <button type="button" className="h-8 px-2 rounded-sm text-sm font-medium text-[#155dfc] hover:bg-[#e6eeff]"
                                onClick={() => editDraft(d => ({ ...d, categories: [...d.categories, { groupId: '', pct: '' }] }))}>
                                + Add category
                            </button>
                        </div>
                        {draft.categories.length === 0 && <p className="m-0 text-xs text-[#5b6b86]">No category discounts.</p>}
                        <div className="space-y-2">
                            {draft.categories.map((c, idx) => (
                                <div key={idx}>
                                    <div className="flex items-center gap-2">
                                        <select value={c.groupId} aria-label="Category"
                                            onChange={(e) => editDraft(d => ({ ...d, categories: d.categories.map((x, i) => i === idx ? { ...x, groupId: e.target.value } : x) }))}
                                            className="flex-1 min-w-0 h-10 px-2 rounded-sm border border-[#7a8aa3] bg-white text-sm text-[#0f172b]">
                                            <option value="">Choose category</option>
                                            {groups
                                                .filter(g => g.id === c.groupId || !draft.categories.some(o => o.groupId === g.id))
                                                .map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                        </select>
                                        <div className={`${FIELD} w-[110px]`}>
                                            <input id={`cp-cat-${idx}`} type="text" inputMode="decimal" value={c.pct} {...invalid(`cp-cat-${idx}`)}
                                                aria-label={`Discount % for ${groupName[c.groupId] || 'this category'}`}
                                                onChange={(e) => DECIMAL.test(e.target.value) && editDraft(d => ({ ...d, categories: d.categories.map((x, i) => i === idx ? { ...x, pct: e.target.value } : x) }))}
                                                placeholder="0" className={`${INPUT} tabular-nums`} />
                                            <span className="text-sm">%</span>
                                        </div>
                                        <button type="button" aria-label={`Remove ${groupName[c.groupId] || 'category'}`} className={ICON_BTN}
                                            onClick={() => editDraft(d => ({ ...d, categories: d.categories.filter((_, i) => i !== idx) }))}>
                                            <FiTrash2 size={16} aria-hidden />
                                        </button>
                                    </div>
                                    {errorFor(`cp-cat-${idx}`)}
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* Items */}
                    <section>
                        <span className={LABEL}>Specific items</span>
                        <div className={`${FIELD} relative`}>
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
                                            editDraft(d => ({ ...d, items: [...d.items, { itemId: i.id!, name: i.name, type: 'percent', value: '' }] }));
                                            setItemQuery('');
                                            requestAnimationFrame(() => document.getElementById(`cp-item-${idx}`)?.focus());
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
                                            onClick={() => editDraft(d => ({ ...d, items: d.items.filter((_, i) => i !== idx) }))}>
                                            <FiTrash2 size={16} aria-hidden />
                                        </button>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                        <div role="group" aria-label="Discount type" className="inline-flex p-[3px] gap-0.5 bg-[#f5f7ff] border border-[#dfe6fb] rounded-sm">
                                            {([['percent', '% off'], ['netPrice', 'Fixed ₹']] as const).map(([t, label]) => (
                                                <button key={t} type="button" aria-pressed={it.type === t}
                                                    onClick={() => editDraft(d => ({ ...d, items: d.items.map((x, i) => i === idx ? { ...x, type: t } : x) }))}
                                                    className={`h-7 px-3 rounded-sm text-xs font-medium ${it.type === t ? 'bg-white text-[#155dfc] shadow-sm' : 'text-[#45556c]'}`}>
                                                    {label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className={`${FIELD} w-[120px]`}>
                                            {it.type === 'netPrice' && <span className="text-sm">₹</span>}
                                            <input id={`cp-item-${idx}`} type="text" inputMode="decimal" value={it.value} {...invalid(`cp-item-${idx}`)}
                                                aria-label={it.type === 'percent' ? `Discount % for ${it.name}` : `Fixed price for ${it.name}`}
                                                onChange={(e) => DECIMAL.test(e.target.value) && editDraft(d => ({ ...d, items: d.items.map((x, i) => i === idx ? { ...x, value: e.target.value } : x) }))}
                                                placeholder="0" className={`${INPUT} tabular-nums`} />
                                            {it.type === 'percent' && <span className="text-sm">%</span>}
                                        </div>
                                        <span className="text-xs text-[#5b6b86] tabular-nums">{previewFor(it)}</span>
                                    </div>
                                    {errorFor(`cp-item-${idx}`)}
                                    {it.type === 'netPrice' && <p className="mt-1 mb-0 text-[11px] text-[#5b6b86]">Fixed price is for a single unit; packs use the % rules.</p>}
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div>
                            <label className={LABEL} htmlFor="cp-note">Note (optional)</label>
                            <div className={FIELD}>
                                <input id="cp-note" type="text" value={draft.note} onChange={(e) => editDraft(d => ({ ...d, note: e.target.value }))}
                                    placeholder="e.g. Dealer rate agreed in Oct…" className={INPUT} autoComplete="off" />
                            </div>
                        </div>
                        <label className="inline-flex items-center gap-2 h-9 text-sm cursor-pointer">
                            <input type="checkbox" checked={draft.isActive} onChange={(e) => editDraft(d => ({ ...d, isActive: e.target.checked }))} className="w-4 h-4 accent-[#155dfc]" />
                            Active — apply on {side === 'sale' ? 'bills' : 'purchases'}
                        </label>
                    </section>

                    <p className="m-0 text-xs text-[#5b6b86]">
                        Priority: item rule, then category, then “all items”. Applied automatically when the {party} is picked on a {side === 'sale' ? 'bill' : 'purchase'}, only where it’s lower than the normal price.
                    </p>
                </div>

                <div className="flex items-center gap-2 px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] border-t border-[#dfe6fb]">
                    {editingId && ruleById.get(editingId) && (
                        <button type="button" onClick={() => setPendingDelete(ruleById.get(editingId)!)}
                            className="h-10 px-3 -ml-3 rounded-sm text-sm font-medium text-red-700 hover:bg-red-50">
                            Remove pricing
                        </button>
                    )}
                    <div className="flex-1" />
                    <button type="button" className={BTN_OUTLINE} onClick={requestClose}>Cancel</button>
                    <button type="button" className={BTN_PRIMARY} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                </div>
            </div>
        </div>
    );

    // ───────────────────────── Page ─────────────────────────
    const loading = loadingRules || loadingParties;
    const FILTERS: [Filter, string][] = [['all', 'All'], ['with', 'With discount'], ['paused', 'Paused'], ['without', 'No discount']];

    const renderRow = (r: Row) => {
        const st = statusOf(r);
        const label = r.name || r.number;
        const rs = rowStatus[r.id];
        const isSel = selected.has(r.id);
        return (
            <li key={r.id} className={`flex items-center gap-3 px-3 sm:px-4 py-2.5 ${isSel ? 'bg-[#f5f7ff]' : ''}`}>
                <input type="checkbox" checked={isSel} onChange={() => toggleSelect(r.id)}
                    aria-label={`Select ${label}`} className="flex-none w-4 h-4 accent-[#155dfc] cursor-pointer" />
                <span aria-hidden className="hidden sm:grid place-items-center flex-none w-9 h-9 rounded-sm bg-[#eef2ff] text-[#155dfc] text-xs font-semibold">{initials(label)}</span>
                <button type="button" onClick={() => openRow(r)} className="flex-1 min-w-0 text-left rounded-sm">
                    <span className="block text-sm font-semibold truncate">
                        {label}
                        {r.name && r.number && <span className="font-normal text-[#5b6b86]"> · {r.number}</span>}
                    </span>
                    <span className={`block text-xs truncate ${st === 'with' ? 'text-[#008236]' : 'text-[#5b6b86]'}`}>
                        {st === 'without' ? 'No discount' : st === 'paused' ? `Paused · ${summary(r.rule!)}` : summary(r.rule!)}
                    </span>
                </button>

                {r.rule && hasDiscount(r.rule) && (
                    <label className="hidden sm:inline-flex items-center gap-1.5 h-9 px-2 rounded-sm text-xs text-[#45556c] cursor-pointer flex-shrink-0 hover:bg-[#f5f7ff]">
                        <input type="checkbox" checked={r.rule.isActive} onChange={() => toggleActive(r.rule!)} className="w-4 h-4 accent-[#155dfc]"
                            aria-label={`Pricing for ${label} active`} />
                        <span aria-hidden>Active</span>
                    </label>
                )}

                <div title="Discount on all items"
                    className={`flex-none flex items-center gap-1 w-[84px] h-9 px-2 rounded-sm border bg-white focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc] ${rs === 'error' ? 'border-red-600' : rs === 'saved' ? 'border-[#008236]' : 'border-[#c9d3ea]'}`}>
                    <input type="text" inputMode="decimal" value={quickValue(r)} placeholder="—"
                        aria-label={`Discount % on all items for ${label}`}
                        onChange={(e) => DECIMAL.test(e.target.value) && setQuick(q => ({ ...q, [r.id]: e.target.value }))}
                        onBlur={() => commitQuick(r)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') { clearQuick(r.id); e.currentTarget.blur(); }
                        }}
                        className="w-full min-w-0 border-0 outline-none bg-transparent text-sm text-right tabular-nums text-[#0f172b] placeholder:text-[#9aa7bd]" />
                    <span className="flex-none w-3.5 text-center text-sm text-[#5b6b86]" aria-hidden>
                        {rs === 'saving' ? '…' : rs === 'saved' ? <FiCheck size={14} className="text-[#008236]" /> : '%'}
                    </span>
                </div>

                <button type="button" aria-label={`Edit ${label} pricing — categories and items`} className={ICON_BTN} onClick={() => openRow(r)}>
                    <FiEdit2 size={16} aria-hidden />
                </button>
            </li>
        );
    };

    const renderList = () => {
        if (loading) {
            return (
                <div role="status" aria-live="polite" className="py-10 flex justify-center">
                    <Spinner />
                    <span className="sr-only">Loading…</span>
                </div>
            );
        }
        if (rows.length === 0) {
            return (
                <div className={`${CARD} p-8 text-center`}>
                    <p className="m-0 text-sm font-medium">No {partiesWord} yet</p>
                    <p className="mt-1 mb-4 text-sm text-[#5b6b86]">{Party}s are saved when you bill them. You can also add one here and set their discount.</p>
                    <button type="button" className={BTN_PRIMARY} onClick={() => openNew()}><FiPlus size={16} aria-hidden /> Add {party}</button>
                </div>
            );
        }
        if (shown.length === 0) {
            const q = query.trim();
            return (
                <div className={`${CARD} p-8 text-center`}>
                    <p className="m-0 text-sm text-[#5b6b86]">
                        {q ? `No ${party} matches “${q}”${filter !== 'all' ? ' in this filter' : ''}.` : `No ${partiesWord} in this filter.`}
                    </p>
                    {q && (
                        <button type="button" className={`${BTN_OUTLINE} mt-4`} onClick={() => openNew(q)}>
                            <FiPlus size={16} aria-hidden /> Add “{q}” as a new {party}
                        </button>
                    )}
                </div>
            );
        }
        return (
            <div className={CARD}>
                <div className="flex items-center gap-3 px-3 sm:px-4 h-11 border-b border-[#dfe6fb] text-[11px] font-semibold tracking-[.08em] uppercase text-[#5b6b86]">
                    <input type="checkbox" checked={allVisibleSelected}
                        ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                        onChange={toggleSelectVisible} aria-label="Select all shown"
                        className="flex-none w-4 h-4 accent-[#155dfc] cursor-pointer" />
                    <span className="hidden sm:block w-9 flex-none" />
                    <span className="flex-1 min-w-0 truncate">{shown.length.toLocaleString('en-IN')} {shown.length === 1 ? party : partiesWord}</span>
                    <span className="w-[84px] text-right flex-none">All items</span>
                    <span className="w-9 flex-none" />
                </div>
                <ul className="m-0 p-0 list-none divide-y divide-[#dfe6fb]">
                    {visible.map(renderRow)}
                </ul>
                {shown.length > visible.length && (
                    <div className="p-2 border-t border-[#dfe6fb]">
                        <button type="button" onClick={() => setLimitN(n => n + PAGE)}
                            className="w-full h-10 rounded-sm text-sm font-medium text-[#155dfc] hover:bg-[#e6eeff]">
                            Show {Math.min(PAGE, shown.length - visible.length)} more ({(shown.length - visible.length).toLocaleString('en-IN')} left)
                        </button>
                    </div>
                )}
            </div>
        );
    };

    const renderBulkBar = () => selected.size === 0 ? null : (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pointer-events-none">
            <div role="region" aria-label={`Selected ${partiesWord}`}
                className={`${CARD} pointer-events-auto max-w-3xl mx-auto flex flex-wrap items-center gap-2 p-3 shadow-[0_10px_28px_rgba(21,48,140,0.18),0_2px_6px_rgba(21,48,140,0.08)]`}>
                <span className="text-sm font-semibold mr-1">{selected.size} selected</span>
                <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <div className={`${FIELD} w-[96px] !h-9`}>
                        <input id="cp-bulk" type="text" inputMode="decimal" value={bulkPct} placeholder="0"
                            aria-label="Discount % on all items for the selected"
                            onChange={(e) => DECIMAL.test(e.target.value) && setBulkPct(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') void applyBulk(); }}
                            className={`${INPUT} tabular-nums`} />
                        <span className="text-sm">%</span>
                    </div>
                    <button type="button" className={`${BTN_PRIMARY} !h-9`} onClick={applyBulk}>Set on all items</button>
                </div>
                <button type="button" className={`${BTN_OUTLINE} !h-9`} disabled={!selectedRows.some(r => r.rule)}
                    onClick={() => setPendingBulkRemove(true)}>
                    Remove discount
                </button>
                <button type="button" aria-label="Clear selection" className={ICON_BTN} onClick={() => setSelected(new Set())}>
                    <FiX size={18} aria-hidden />
                </button>
            </div>
        </div>
    );

    return (
        <div className="flex min-h-screen w-full flex-col bg-[#eef2ff] font-['Poppins',system-ui,-apple-system,'Segoe_UI',sans-serif] text-[#0f172b]">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
            {confirmDiscard && (
                <Modal message="Discard your changes? What you entered will be lost."
                    onClose={() => setConfirmDiscard(false)} onConfirm={closeEditor} showConfirmButton type={State.INFO} />
            )}
            {pendingDelete && (
                <Modal
                    message={`Remove fixed pricing for ${pendingDelete.customerName || pendingDelete.customerNumber}? Bills already saved are not changed.`}
                    onClose={() => setPendingDelete(null)} onConfirm={confirmDelete} showConfirmButton type={State.INFO} />
            )}
            {pendingBulkRemove && (
                <Modal
                    message={`Remove fixed pricing for ${selectedRows.filter(r => r.rule).length} selected ${partiesWord}? Bills already saved are not changed.`}
                    onClose={() => setPendingBulkRemove(false)} onConfirm={confirmBulkRemove} showConfirmButton type={State.INFO} />
            )}
            <div className="sr-only" role="status" aria-live="polite">{announce}</div>

            <div className="sticky top-0 z-30 border-b border-[#dfe6fb] bg-white">
                <div className="flex items-center gap-3 px-3 py-3 md:px-6 md:py-3.5">
                    <BackButton />
                    <div className="min-w-0">
                        <p className="text-xs leading-4 text-[#5b6b86]">Settings</p>
                        <h1 className="text-lg font-semibold leading-6 md:text-[22px] md:leading-[30px]">Party pricing</h1>
                    </div>
                    <button type="button" className={`${BTN_PRIMARY} ml-auto`} onClick={() => openNew()}>
                        <FiPlus size={16} aria-hidden /> <span className="hidden sm:inline">Add {party}</span><span className="sm:hidden">Add</span>
                    </button>
                </div>
            </div>

            <div className={`flex-1 w-full max-w-6xl mx-auto p-4 md:px-6 md:py-5 ${selected.size > 0 ? 'pb-36 sm:pb-28' : ''}`}>
                {/* Top row: tabs + search (side by side on desktop) */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <div role="group" aria-label="Sale or purchase" className="flex w-full sm:w-auto sm:self-start lg:self-auto flex-none p-[3px] gap-0.5 bg-white border border-[#dfe6fb] rounded-sm">
                        {([['sale', 'Sale · customers'], ['purchase', 'Purchase · suppliers']] as const).map(([v, label]) => (
                            <button key={v} type="button" aria-pressed={side === v} onClick={() => switchSide(v)}
                                className={`flex-1 sm:flex-none h-9 px-4 rounded-sm text-sm font-medium whitespace-nowrap ${side === v ? 'bg-[#155dfc] text-white' : 'text-[#45556c] hover:bg-[#f5f7ff]'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <label className={`${FIELD} lg:flex-1`}>
                        <FiSearch size={16} className="flex-none" aria-hidden />
                        <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setLimitN(PAGE); }}
                            placeholder={`Search ${partiesWord} by name or phone…`} aria-label={`Search ${partiesWord}`} className={INPUT} autoComplete="off" />
                    </label>
                </div>

                {/* Desktop: side panel (status, help, filters) + list. Phones: stacked. */}
                <div className="mt-3 lg:mt-5 grid gap-3 lg:grid-cols-[272px_minmax(0,1fr)] lg:gap-6 lg:items-start">
                    <aside className="min-w-0 space-y-3 lg:sticky lg:top-[92px]">
                        {settingsKnown && !featureOn && (
                            <div className="flex flex-wrap items-center gap-3 p-3 rounded-sm border border-[#fcd9a6] bg-[#fff8eb]">
                                <FiInfo size={18} aria-hidden className="flex-none text-[#b45309]" />
                                <p className="m-0 flex-1 min-w-[180px] text-sm text-[#7a3e00]">
                                    {side === 'sale' ? 'Customer-wise discount is off' : 'Supplier-wise discount is off'} — {side === 'sale' ? 'bills' : 'purchases'} won’t use these prices yet.
                                </p>
                                <button type="button" className={`${BTN_PRIMARY} !h-9`} onClick={turnOn} disabled={turningOn}>
                                    {turningOn ? 'Turning on…' : 'Turn on'}
                                </button>
                            </div>
                        )}

                        {/* Phones: one line of help */}
                        {(!settingsKnown || featureOn) && (
                            <p className="lg:hidden m-0 flex items-start gap-2 text-sm text-[#45556c]">
                                <FiInfo size={16} aria-hidden className="flex-none mt-0.5 text-[#5b6b86]" />
                                <span>
                                    Type a % next to a {party} for a discount on all items, or tap their name for category and item prices.
                                </span>
                            </p>
                        )}

                        {/* Desktop: summary + how it works */}
                        <div className={`${CARD} hidden lg:block p-4`}>
                            <div className="flex items-baseline gap-2">
                                <span className="text-[28px] leading-8 font-semibold tabular-nums">{loading ? '…' : (counts.with + counts.paused).toLocaleString('en-IN')}</span>
                                <span className="text-sm text-[#5b6b86]">of {loading ? '…' : rows.length.toLocaleString('en-IN')} {partiesWord} have a discount</span>
                            </div>
                            {settingsKnown && featureOn && (
                                <p className="mt-1.5 mb-0 flex items-center gap-1.5 text-xs text-[#008236]">
                                    <FiCheck size={14} aria-hidden /> Applied on {side === 'sale' ? 'bills' : 'purchases'}
                                </p>
                            )}
                            <hr className="my-4 border-0 border-t border-[#dfe6fb]" />
                            <p className={LABEL}>How it works</p>
                            <ol className="m-0 p-0 list-none space-y-3 text-sm text-[#45556c]">
                                {[
                                    `Type a % next to a ${party} — that’s their discount on all items.`,
                                    'Tap the name for category or item prices.',
                                    `It’s applied automatically when the ${party} is picked on a ${side === 'sale' ? 'bill' : 'purchase'}, only where it’s lower.`,
                                ].map((t, i) => (
                                    <li key={i} className="flex gap-2.5">
                                        <span aria-hidden className="grid place-items-center flex-none w-5 h-5 rounded-sm bg-[#e6eeff] text-[#155dfc] text-[11px] font-semibold">{i + 1}</span>
                                        <span>{t}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>

                        <div role="group" aria-label="Filter"
                            className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 pb-0.5 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-1.5 lg:bg-white lg:border lg:border-[#dfe6fb] lg:rounded-sm">
                            <span className={`${LABEL} hidden lg:block px-2 pt-1.5 !mb-1`}>Show</span>
                            {FILTERS.filter(([f]) => f !== 'paused' || counts.paused > 0 || filter === 'paused').map(([f, label]) => (
                                <button key={f} type="button" aria-pressed={filter === f} onClick={() => { setFilter(f); setLimitN(PAGE); }}
                                    className={`flex-none inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border text-sm font-medium lg:w-full lg:h-9 lg:justify-between lg:border-0 ${filter === f ? 'border-[#155dfc] bg-[#e6eeff] text-[#155dfc]' : 'border-[#dfe6fb] bg-white text-[#45556c] hover:bg-[#f5f7ff]'}`}>
                                    {label}
                                    <span className="text-xs tabular-nums opacity-80">{loading ? '…' : counts[f].toLocaleString('en-IN')}</span>
                                </button>
                            ))}
                        </div>
                    </aside>

                    <div className="min-w-0">{renderList()}</div>
                </div>
            </div>

            {renderBulkBar()}
            {renderEditor()}
        </div>
    );
};

export default CustomerPricing;
