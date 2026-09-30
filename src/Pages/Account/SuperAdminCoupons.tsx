import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { AlertTriangle, Copy } from 'lucide-react';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { PLANS } from '../../enums';
import Loading from '../Loading/Loading';
import type { AdminCoupon, PaidOrder } from './superAdmin/data';
import {
  PLAN_META, PLAN_PRICE_YEARLY, couponExpired, couponHighRisk, couponMaxShare, fmtDate, fmtMoney,
  loadPaidOrders, toCoupon, toDate,
} from './superAdmin/data';
import { Alert, Btn, Card, Chip, Field, PageHeader, PageShell, SearchBox, SelectBox, StatCard, inputCls } from './superAdmin/ui';

type ShowFilter = 'all' | 'active' | 'inactive' | 'expired' | 'risk';

interface FormState {
  code: string;
  discountType: 'percent' | 'flat';
  discountValue: string;
  maxRedemptions: string;   // '' = unlimited
  validFrom: string;        // yyyy-mm-dd, '' = now
  validTill: string;        // '' = never
  minAmount: string;
  applicablePlans: string[];
}

const emptyForm: FormState = {
  code: '', discountType: 'percent', discountValue: '20', maxRedemptions: '100',
  validFrom: '', validTill: '', minAmount: '0', applicablePlans: [],
};

const toInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

const formFrom = (c: AdminCoupon): FormState => ({
  code: c.code,
  discountType: c.discountType,
  discountValue: String(c.discountValue),
  maxRedemptions: c.maxRedemptions === null ? '' : String(c.maxRedemptions),
  validFrom: toInput(c.validFrom),
  validTill: toInput(c.validTill),
  minAmount: String(c.minAmount || 0),
  applicablePlans: c.applicablePlans || [],
});

const discountLabel = (c: AdminCoupon) => {
  const share = couponMaxShare(c);
  if (share >= 0.9) return '~100% OFF';
  return c.discountType === 'percent' ? `${c.discountValue}% OFF` : `₹${c.discountValue} OFF`;
};

// Only plans the server can price are sellable with a coupon.
const SELLABLE = Object.values(PLANS).filter(p => PLAN_PRICE_YEARLY[p]);

const SuperAdminCoupons: React.FC = () => {
  const { currentUser } = useAuth();
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [lastUsed, setLastUsed] = useState<Record<string, Date>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [show, setShow] = useState<ShowFilter>('all');
  const [editing, setEditing] = useState<string | null>(null); // code being edited, null = creating
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [snap, ord, red] = await Promise.all([
        getDocs(collection(db, 'coupons')),
        loadPaidOrders(true),
        getDocs(collection(db, 'couponRedemptions')),
      ]);
      setCoupons(snap.docs.map(d => toCoupon(d.data())));
      setOrders(ord);
      const lu: Record<string, Date> = {};
      red.docs.forEach(d => {
        const x = d.data();
        const at = toDate(x.redeemedAt);
        if (x.code && at && (!lu[x.code] || at > lu[x.code])) lu[x.code] = at;
      });
      setLastUsed(lu);
    } catch (err) {
      console.error(err);
      alert('Error fetching coupons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const couponOrders = orders.filter(o => o.couponCode);
    // Companies that paid with a coupon and later paid again without one.
    const payingAfter = new Set<string>();
    couponOrders.forEach(co => {
      if (orders.some(o => o.companyId === co.companyId && !o.couponCode && (o.paidAt?.getTime() ?? 0) > (co.paidAt?.getTime() ?? 0))) payingAfter.add(co.companyId);
    });
    return {
      active: coupons.filter(c => c.isActive && !couponExpired(c)).length,
      inactive: coupons.filter(c => !c.isActive).length,
      redemptions: coupons.reduce((s, c) => s + c.redemptionCount, 0),
      discountGiven: couponOrders.reduce((s, o) => s + o.discountAmount, 0),
      payingAfter: payingAfter.size,
      couponCustomers: new Set(couponOrders.map(o => o.companyId)).size,
      risky: coupons.filter(couponHighRisk),
    };
  }, [coupons, orders]);

  const visible = useMemo(() => {
    const q = search.trim().toUpperCase();
    return coupons.filter(c => {
      if (q && !c.code.includes(q)) return false;
      if (show === 'active') return c.isActive && !couponExpired(c);
      if (show === 'inactive') return !c.isActive;
      if (show === 'expired') return couponExpired(c);
      if (show === 'risk') return couponHighRisk(c);
      return true;
    }).sort((a, b) => Number(couponHighRisk(b)) - Number(couponHighRisk(a)) || Number(b.isActive) - Number(a.isActive) || a.code.localeCompare(b.code));
  }, [coupons, search, show]);

  const startEdit = (c: AdminCoupon) => { setEditing(c.code); setForm(formFrom(c)); setError(''); };
  const startNew = () => { setEditing(null); setForm(emptyForm); setError(''); };

  const generate = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = 'SELLAR';
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setForm(f => ({ ...f, code: s }));
  };

  const togglePlan = (p: string) => setForm(f => ({
    ...f, applicablePlans: f.applicablePlans.includes(p) ? f.applicablePlans.filter(x => x !== p) : [...f.applicablePlans, p],
  }));

  // Live preview of what the form would do.
  const draft: AdminCoupon = useMemo(() => ({
    code: form.code, discountType: form.discountType, discountValue: Number(form.discountValue) || 0,
    applicablePlans: form.applicablePlans.length ? form.applicablePlans : null,
    maxRedemptions: form.maxRedemptions === '' ? null : Number(form.maxRedemptions),
    redemptionCount: 0, minAmount: Number(form.minAmount) || 0, isActive: true,
    validFrom: null, validTill: form.validTill ? new Date(form.validTill) : null, createdAt: null, createdBy: null,
  }), [form]);

  const previewPlans = (draft.applicablePlans || SELLABLE).filter(p => PLAN_PRICE_YEARLY[p]);
  const discountOn = (p: string) => {
    const price = PLAN_PRICE_YEARLY[p];
    const off = draft.discountType === 'percent' ? Math.round((price * draft.discountValue) / 100) : Math.round(draft.discountValue);
    return Math.max(0, Math.min(off, price - 1));
  };
  const maxCost = draft.maxRedemptions === null ? null : draft.maxRedemptions * Math.max(0, ...previewPlans.map(discountOn));

  const save = async () => {
    const code = form.code.trim().toUpperCase();
    const value = Number(form.discountValue);
    if (!/^[A-Z0-9]+$/.test(code)) return setError('Code must be letters and numbers only.');
    if (!value || value <= 0) return setError('Enter a discount greater than 0.');
    if (form.discountType === 'percent' && value > 100) return setError('Percent discount can be at most 100.');
    if (form.maxRedemptions !== '' && (!Number.isInteger(Number(form.maxRedemptions)) || Number(form.maxRedemptions) < 1)) return setError('Max redemptions must be a whole number, or empty for unlimited.');
    if (form.validFrom && form.validTill && form.validTill < form.validFrom) return setError('“Valid till” is before “Valid from”.');
    if (!editing && coupons.some(c => c.code === code)) return setError(`${code} already exists.`);
    if (couponHighRisk(draft) && !window.confirm(`${code} is ~100% off with no usage limit and no end date. Anyone who finds it gets Sellar almost free, forever. Save anyway?`)) return;

    const till = form.validTill ? new Date(`${form.validTill}T23:59:59`) : null;
    const payload: Record<string, any> = {
      discountType: form.discountType,
      discountValue: value,
      applicablePlans: form.applicablePlans.length ? form.applicablePlans : null,
      maxRedemptions: form.maxRedemptions === '' ? null : Number(form.maxRedemptions),
      minAmount: Number(form.minAmount) || 0,
      validFrom: form.validFrom ? Timestamp.fromDate(new Date(`${form.validFrom}T00:00:00`)) : Timestamp.now(),
      validTill: till ? Timestamp.fromDate(till) : null,
    };

    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateDoc(doc(db, 'coupons', editing), payload);
      } else {
        await setDoc(doc(db, 'coupons', code), {
          ...payload, code, redemptionCount: 0, isActive: true,
          createdBy: currentUser?.uid ?? null, createdByName: currentUser?.name ?? null, createdAt: serverTimestamp(),
        });
      }
      startNew();
      await load();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to save coupon.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: AdminCoupon) => {
    if (c.isActive && !window.confirm(`Deactivate ${c.code}? Customers won’t be able to apply it.`)) return;
    try {
      await updateDoc(doc(db, 'coupons', c.code), { isActive: !c.isActive });
      setCoupons(prev => prev.map(x => x.code === c.code ? { ...x, isActive: !x.isActive } : x));
    } catch (err) {
      console.error(err);
      alert('Failed to update coupon.');
    }
  };

  const remove = async (c: AdminCoupon) => {
    if (c.redemptionCount > 0) return;
    if (!window.confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'coupons', c.code));
      setCoupons(prev => prev.filter(x => x.code !== c.code));
      if (editing === c.code) startNew();
    } catch (err) {
      console.error(err);
      alert('Failed to delete coupon.');
    }
  };

  if (loading) return <Loading />;

  return (
    <PageShell wide>
      <PageHeader
        title="Coupon Codes"
        subtitle="Discounts on Sellar subscriptions — who used them and what they cost"
        actions={<>
          <SearchBox className="w-full sm:w-56" value={search} onChange={setSearch} placeholder="Search code…" />
          <SelectBox label="Show" value={show} onChange={v => setShow(v as ShowFilter)}>
            <option value="all">All</option><option value="active">Active</option><option value="inactive">Deactivated</option>
            <option value="expired">Expired</option><option value="risk">High risk</option>
          </SelectBox>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard dot="bg-green-600" label="Active coupons" value={stats.active} sub={`${stats.inactive} deactivated`} />
        <StatCard dot="bg-blue-600" label="Redemptions" value={stats.redemptions} sub="all time" />
        <StatCard dot="bg-amber-500" label="Discount given" value={fmtMoney(stats.discountGiven)} sub="revenue waived on paid orders" />
        <StatCard dot="bg-violet-600" label="Paying after coupon" value={stats.payingAfter} sub={`of ${stats.couponCustomers} coupon customers renewed at full price`} />
      </div>

      {stats.risky.length > 0 && (
        <Alert tone="red" action={<Btn size="sm" onClick={() => startEdit(stats.risky[0])}>Add limits</Btn>}>
          <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />
            <b>{stats.risky.length} active coupon{stats.risky.length === 1 ? ' gives' : 's give'} ~100% off with no usage limit and no end date.</b></span>
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4 items-start">
        <div className="space-y-3">
          {visible.length === 0 ? <Card className="p-10 text-center text-sm text-gray-400">No coupons match.</Card> : visible.map(c => {
            const risk = couponHighRisk(c);
            const expired = couponExpired(c);
            const usedPct = c.maxRedemptions ? Math.min(100, (c.redemptionCount / c.maxRedemptions) * 100) : 0;
            return (
              <Card key={c.code} className={`p-5 ${editing === c.code ? 'border-blue-600 ring-1 ring-blue-600' : ''}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-lg font-semibold text-gray-900">{c.code}</span>
                  <button onClick={() => navigator.clipboard?.writeText(c.code)} className="p-1.5 border border-gray-200 rounded-md hover:bg-gray-50" aria-label={`Copy ${c.code}`}><Copy className="w-3.5 h-3.5 text-gray-600" /></button>
                  <Chip cls="bg-blue-50 text-blue-700">{discountLabel(c)}</Chip>
                  {expired ? <Chip cls="bg-gray-200 text-gray-700">EXPIRED</Chip>
                    : c.isActive ? <Chip cls="bg-green-100 text-green-700">ACTIVE</Chip> : <Chip cls="bg-gray-200 text-gray-700">DEACTIVATED</Chip>}
                  {risk && <Chip cls="bg-red-100 text-red-700">HIGH RISK</Chip>}
                  <div className="flex gap-2 ml-auto">
                    <Btn size="sm" onClick={() => startEdit(c)}>Edit</Btn>
                    <Btn size="sm" variant={c.isActive ? 'danger' : 'green'} onClick={() => toggleActive(c)}>{c.isActive ? 'Deactivate' : 'Activate'}</Btn>
                    {c.redemptionCount === 0 && <Btn size="sm" variant="danger" onClick={() => remove(c)}>Delete</Btn>}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 text-sm">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Used</p>
                    <p className="font-semibold">{c.redemptionCount} / {c.maxRedemptions ?? '∞'}</p>
                    <div className="h-1.5 rounded-full bg-gray-200 mt-1 overflow-hidden"><div className="h-full bg-blue-600" style={{ width: `${usedPct}%` }} /></div>
                  </div>
                  <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Plans</p>
                    <p className="font-semibold">{c.applicablePlans ? c.applicablePlans.map(p => PLAN_META[p]?.label || p).join(', ') : `All ${SELLABLE.length} plans`}</p></div>
                  <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Expires</p>
                    <p className={`font-semibold ${!c.validTill ? 'text-amber-600' : expired ? 'text-gray-500' : ''}`}>{c.validTill ? fmtDate(c.validTill) : 'Never'}</p></div>
                  <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Last used</p>
                    <p className="font-semibold">{lastUsed[c.code] ? fmtDate(lastUsed[c.code]) : 'Never'}</p></div>
                  <div><p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Created</p>
                    <p className="font-semibold">{fmtDate(c.createdAt || c.validFrom)}</p></div>
                </div>

                {risk && (
                  <p className="mt-4 text-sm bg-red-50 text-red-800 rounded-lg px-3 py-2">
                    Anyone with this code gets a Sellar plan almost free, forever. Add a max redemptions limit or an end date.
                  </p>
                )}
                {c.minAmount > 0 && <p className="text-xs text-gray-500 mt-2">Minimum order {fmtMoney(c.minAmount)}.</p>}
                <p className="text-xs text-gray-500 mt-2">
                  {c.redemptionCount > 0 ? 'Used coupons can only be deactivated, not deleted — keeps redemption history intact.' : 'Never used — can be deleted.'}
                </p>
              </Card>
            );
          })}
        </div>

        <Card className="p-5 xl:sticky xl:top-4">
          <h2 className="text-lg font-medium text-gray-900 mb-4">{editing ? `Edit ${editing}` : 'New coupon'}</h2>
          <div className="space-y-4">
            <Field label="Code" hint={editing ? 'Codes can’t be renamed — create a new coupon instead.' : 'Letters and numbers only, saved in capitals'}>
              <div className="flex gap-2">
                <input value={form.code} disabled={!!editing} placeholder="DIWALI20"
                  onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))}
                  className={`${inputCls} font-mono disabled:bg-gray-50`} />
                {!editing && <Btn onClick={generate}>Generate</Btn>}
              </div>
            </Field>

            <Field label="Discount" hint="The server caps any discount at plan price − ₹1.">
              <div className="flex gap-2">
                <div className="flex border border-gray-300 rounded-lg p-1 shrink-0">
                  {(['percent', 'flat'] as const).map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, discountType: t }))}
                      className={`px-3 py-1 text-sm font-semibold rounded-md ${form.discountType === t ? 'bg-blue-600 text-white' : 'text-gray-700'}`}>
                      {t === 'percent' ? 'Percent %' : 'Flat ₹'}
                    </button>
                  ))}
                </div>
                <input type="number" min={1} max={form.discountType === 'percent' ? 100 : undefined} value={form.discountValue}
                  onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} className={inputCls} />
              </div>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Max redemptions" hint="Empty = unlimited">
                <input type="number" min={1} value={form.maxRedemptions} placeholder="Unlimited"
                  onChange={e => setForm(f => ({ ...f, maxRedemptions: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Per customer" hint="Enforced by checkout">
                <input value="1" disabled className={`${inputCls} bg-gray-50`} />
              </Field>
              <Field label="Valid from" hint="Empty = now">
                <input type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Valid till" hint="Empty = no end date">
                <input type="date" value={form.validTill} onChange={e => setForm(f => ({ ...f, validTill: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Min order ₹">
                <input type="number" min={0} value={form.minAmount} onChange={e => setForm(f => ({ ...f, minAmount: e.target.value }))} className={inputCls} />
              </Field>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-800 mb-1.5">Plans · none selected = all</p>
              <div className="flex flex-wrap gap-2">
                {SELLABLE.map(p => (
                  <button key={p} onClick={() => togglePlan(p)}
                    className={`px-3 py-1.5 text-sm font-semibold rounded-lg border ${form.applicablePlans.includes(p) ? 'bg-blue-50 border-blue-600 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                    {form.applicablePlans.includes(p) && '✓ '}{PLAN_META[p].label}
                  </button>
                ))}
              </div>
            </div>

            <div className={`rounded-lg border p-3 ${couponHighRisk(draft) ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-green-800 mb-1.5">Customer sees (yearly, before GST)</p>
              {previewPlans.map(p => (
                <div key={p} className="flex justify-between text-sm">
                  <span>{PLAN_META[p].label}</span>
                  <span><span className="line-through text-gray-500 mr-2">{fmtMoney(PLAN_PRICE_YEARLY[p])}</span><b>{fmtMoney(PLAN_PRICE_YEARLY[p] - discountOn(p))}</b></span>
                </div>
              ))}
              <p className="text-xs text-gray-700 mt-1.5">
                {maxCost === null ? 'No usage limit — cost to you has no ceiling.' : `Max cost to you if fully used: ${fmtMoney(maxCost)}`}
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Btn onClick={startNew}>{editing ? 'Cancel edit' : 'Clear'}</Btn>
              <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Create coupon'}</Btn>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
};

export default SuperAdminCoupons;
