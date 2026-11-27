import React, { useEffect, useMemo, useState } from 'react';
import { deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { FiSearch, FiTrash2, FiX } from 'react-icons/fi';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { Spinner } from '../../constants/Spinner';
import type { Item, ItemGroup } from '../../constants/models';
import { getItemGroupsByCompany, getItemsByCompany } from '../../lib/ItemsFirebase';

interface Props {
  open: boolean;
  onClose: () => void;
}

const FIELD = 'flex items-center gap-2 h-10 px-3 rounded-sm border border-[#7a8aa3] bg-white focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#F97316]';
const INPUT = 'flex-1 min-w-0 border-0 outline-none bg-transparent text-sm text-[#0f172b] placeholder:text-[#5b6b86]';
const LABEL = 'block mb-1.5 text-[11px] font-semibold tracking-[.08em] uppercase text-[#5b6b86]';
const BOX = 'rounded-sm border border-[#f6e3d0] bg-white p-4';
const BTN_PRIMARY = 'inline-flex h-10 items-center justify-center rounded-sm bg-[#F97316] px-4 text-sm font-medium text-white hover:bg-[#EA580C] disabled:opacity-[.45]';
const BTN_SECONDARY = 'inline-flex h-10 items-center justify-center rounded-sm border border-[#7a8aa3] bg-white px-4 text-sm font-medium text-[#0f172b] hover:bg-[#fff3e6]';
const ICON_BTN = 'inline-grid h-9 w-9 place-items-center rounded-sm text-[#45556c] hover:bg-[#fff3e6]';
const DIGITS = /^\d*$/;
const isQty = (v: string) => /^\d+$/.test(v) && Number(v) > 0;

export const OrderLimitsModal: React.FC<Props> = ({ open, onClose }) => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;

  const [enabled, setEnabled] = useState(false);
  const [allQty, setAllQty] = useState('');
  const [cats, setCats] = useState<{ groupId: string; qty: string }[]>([]);
  const [rows, setRows] = useState<{ itemId: string; qty: string }[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [itemQuery, setItemQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Har baar khulne par Firestore se taza settings
  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setItemQuery('');
    getDoc(doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings'))
      .then((snap) => {
        if (cancelled) return;
        const d: any = snap.exists() ? snap.data() : {};
        setEnabled(!!d.enableOrderLimits);
        setAllQty(d.maxOrderQtyAll ? String(d.maxOrderQtyAll) : '');
        setCats(Object.entries(d.maxOrderQtyByCategory || {}).map(([groupId, q]) => ({ groupId, qty: String(q) })));
        setRows(Object.entries(d.maxOrderQtyByItem || {}).map(([itemId, q]) => ({ itemId, qty: String(q) })));
      })
      .catch((e) => { console.error(e); if (!cancelled) setError('Could not load settings.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, companyId]);

  useEffect(() => {
    if (!open || !companyId || items.length > 0) return;
    let cancelled = false;
    Promise.all([getItemsByCompany(companyId), getItemGroupsByCompany(companyId)])
      .then(([its, grps]) => { if (!cancelled) { setItems(its.filter((i) => !i.isDeleted)); setGroups(grps); } })
      .catch((e) => console.error(e));
    return () => { cancelled = true; };
  }, [open, companyId, items.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id!, i])), [items]);
  const itemMatches = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const taken = new Set(rows.map((r) => r.itemId));
    return items.filter((i) => !taken.has(i.id!) && i.name.toLowerCase().includes(q)).slice(0, 8);
  }, [itemQuery, items, rows]);

  if (!open) return null;

  const save = async () => {
    if (!companyId) return;
    if (allQty.trim() && !isQty(allQty)) return setError('Limit for all items must be a whole number above 0.');
    const byCategory: Record<string, number> = {};
    for (const c of cats) {
      if (!c.groupId) continue;
      if (!isQty(c.qty)) return setError('Enter a whole number above 0 for every category.');
      byCategory[c.groupId] = Number(c.qty);
    }
    const byItem: Record<string, number> = {};
    for (const r of rows) {
      if (!isQty(r.qty)) return setError('Enter a whole number above 0 for every item.');
      byItem[r.itemId] = Number(r.qty);
    }
    setSaving(true);
    setError(null);
    const ref = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');
    try {
      // updateDoc maps ko poora replace karta hai, to hataayi hui limit Firestore se bhi hat jaati hai
      await updateDoc(ref, {
        enableOrderLimits: enabled,
        maxOrderQtyAll: allQty.trim() ? Number(allQty) : deleteField(),
        maxOrderQtyByCategory: byCategory,
        maxOrderQtyByItem: byItem,
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch (e: any) {
      if (e?.code === 'not-found') {
        try {
          await setDoc(ref, {
            enableOrderLimits: enabled,
            ...(allQty.trim() ? { maxOrderQtyAll: Number(allQty) } : {}),
            maxOrderQtyByCategory: byCategory,
            maxOrderQtyByItem: byItem,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          onClose();
        } catch (e2) { console.error(e2); setError('Could not save. Check your connection and try again.'); }
      } else {
        console.error(e);
        setError('Could not save. Check your connection and try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-end justify-center bg-[rgba(15,23,43,.45)] md:items-center md:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ol-title"
        className="flex max-h-[92dvh] w-full flex-col rounded-t-sm bg-[#fff7ed] font-['Poppins',system-ui,sans-serif] text-sm text-[#0f172b] shadow-[0_10px_28px_rgba(124,58,0,.14)] md:max-w-xl md:rounded-sm"
      >
        <div className="flex items-center gap-3 border-b border-[#f6e3d0] bg-white px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id="ol-title" className="m-0 text-lg font-semibold">Order limits</h2>
            <p className="m-0 text-xs text-[#5b6b86]">Max pieces of one item a customer can add to the cart</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className={ICON_BTN}><FiX size={18} aria-hidden /></button>
        </div>

        {loading ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : (
          <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 py-4">
            <label className={`${BOX} flex cursor-pointer items-center justify-between gap-3`}>
              <span className="text-sm font-medium">Limit customer order quantity</span>
              <input type="checkbox" className="h-4 w-4 accent-[#F97316]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            </label>

            <div className={enabled ? 'space-y-3' : 'pointer-events-none space-y-3 opacity-50'}>
              <p className="m-0 text-sm text-[#45556c]">Priority: item, then category, then all items. Leave empty for no limit.</p>

              <section className={BOX}>
                <label className={LABEL} htmlFor="ol-all">Limit on all items</label>
                <div className={`${FIELD} w-[160px]`}>
                  <input id="ol-all" inputMode="numeric" value={allQty} placeholder="No limit" className={`${INPUT} tabular-nums`}
                    onChange={(e) => { if (DIGITS.test(e.target.value)) { setError(null); setAllQty(e.target.value); } }} />
                  <span className="text-xs text-[#5b6b86]">qty</span>
                </div>
                <p className="mb-0 mt-1.5 text-xs text-[#5b6b86]">Used when no category or item limit below matches.</p>
              </section>

              <section className={BOX}>
                <div className="mb-2 flex items-center justify-between">
                  <span className={`${LABEL} !mb-0`}>By category</span>
                  <button type="button" className="h-8 rounded-sm px-2 text-sm font-medium text-[#C2410C] hover:bg-[#ffedd5]"
                    onClick={() => setCats((c) => [...c, { groupId: '', qty: '' }])}>+ Add category</button>
                </div>
                {cats.length === 0 && <p className="m-0 text-xs text-[#5b6b86]">No category limits.</p>}
                <div className="space-y-2">
                  {cats.map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select value={c.groupId} aria-label="Category"
                        onChange={(e) => setCats((l) => l.map((x, i) => (i === idx ? { ...x, groupId: e.target.value } : x)))}
                        className="h-10 min-w-0 flex-1 rounded-sm border border-[#7a8aa3] bg-white px-2 text-sm">
                        <option value="">Choose category</option>
                        {groups.filter((g) => g.id === c.groupId || !cats.some((o) => o.groupId === g.id))
                          .map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      </select>
                      <div className={`${FIELD} w-[100px]`}>
                        <input inputMode="numeric" value={c.qty} placeholder="0" aria-label="Max quantity" className={`${INPUT} tabular-nums`}
                          onChange={(e) => { if (DIGITS.test(e.target.value)) { setError(null); setCats((l) => l.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x))); } }} />
                      </div>
                      <button type="button" aria-label="Remove category" className={ICON_BTN} onClick={() => setCats((l) => l.filter((_, i) => i !== idx))}>
                        <FiTrash2 size={16} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className={BOX}>
                <span className={LABEL}>Specific items</span>
                <div className={FIELD}>
                  <FiSearch size={16} className="flex-none text-[#5b6b86]" aria-hidden />
                  <input value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} autoComplete="off"
                    placeholder="Search item to set its own limit…" aria-label="Search item" className={INPUT} />
                </div>
                {itemMatches.length > 0 && (
                  <div className="mt-1 max-h-44 overflow-y-auto rounded-sm border border-[#f6e3d0] p-1">
                    {itemMatches.map((i) => (
                      <button key={i.id} type="button" className="w-full truncate rounded-sm px-2.5 py-2 text-left text-sm hover:bg-[#ffedd5]"
                        onClick={() => { setRows((r) => [...r, { itemId: i.id!, qty: '' }]); setItemQuery(''); }}>
                        {i.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-2 space-y-2">
                  {rows.map((r, idx) => (
                    <div key={r.itemId} className="flex items-center gap-2 rounded-sm border border-[#f6e3d0] p-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{itemById.get(r.itemId)?.name ?? 'Removed item'}</span>
                      <div className={`${FIELD} w-[100px]`}>
                        <input inputMode="numeric" value={r.qty} placeholder="0" aria-label="Max quantity" className={`${INPUT} tabular-nums`}
                          onChange={(e) => { if (DIGITS.test(e.target.value)) { setError(null); setRows((l) => l.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x))); } }} />
                      </div>
                      <button type="button" aria-label="Remove item" className={ICON_BTN} onClick={() => setRows((l) => l.filter((_, i) => i !== idx))}>
                        <FiTrash2 size={16} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {error && <p role="alert" className="m-0 text-xs text-red-700">{error}</p>}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-[#f6e3d0] bg-white px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>Cancel</button>
          <button type="button" className={BTN_PRIMARY} onClick={save} disabled={saving || loading}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default OrderLimitsModal;