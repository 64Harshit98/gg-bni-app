import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  collection, getDocs, doc, setDoc, deleteDoc, updateDoc, Timestamp, serverTimestamp
} from 'firebase/firestore';
import { PLANS } from '../../enums';
import Loading from '../Loading/Loading';
import { useAuth } from '../../context/auth-context';

const SUPER_ADMIN_UIDS = [
  "6vwZ1HRqX7VSnh5KP4JW0TKeuZm2",
  "1AKioGfop8PmHhry6uXOz8Rw6qT2"
];

interface CouponData {
  code: string;
  discountType: 'percent' | 'flat';
  discountValue: number;
  applicablePlans: string[] | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  minAmount: number;
  isActive: boolean;
  validFrom?: any;
  validTill?: any;
}

const ALL_PLANS = Object.values(PLANS);

const emptyForm = {
  code: '',
  discountType: 'percent' as 'percent' | 'flat',
  discountValue: 10,
  applicablePlans: [] as string[], // empty = all plans
  maxRedemptions: '' as string, // empty = unlimited
  minAmount: 0,
  validTill: '',
  isActive: true,
};

const SuperAdminCoupons: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!currentUser || !SUPER_ADMIN_UIDS.includes(currentUser.uid)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="text-5xl mb-3">⛔</div>
          <p className="text-red-500 font-bold text-xl">ACCESS DENIED</p>
        </div>
      </div>
    );
  }

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'coupons'));
      setCoupons(snap.docs.map(d => d.data() as CouponData));
    } catch (err) {
      console.error(err);
      alert('Error fetching coupons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCoupons(); }, []);

  const togglePlan = (plan: string) => {
    setForm(prev => ({
      ...prev,
      applicablePlans: prev.applicablePlans.includes(plan)
        ? prev.applicablePlans.filter(p => p !== plan)
        : [...prev.applicablePlans, plan],
    }));
  };

  const handleCreate = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code) { setError('Enter a coupon code.'); return; }
    if (!form.discountValue || form.discountValue <= 0) { setError('Enter a valid discount value.'); return; }

    setSaving(true);
    setError('');
    try {
      const couponRef = doc(db, 'coupons', code);
      await setDoc(couponRef, {
        code,
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        applicablePlans: form.applicablePlans.length > 0 ? form.applicablePlans : null,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        redemptionCount: 0,
        minAmount: Number(form.minAmount) || 0,
        isActive: form.isActive,
        validFrom: Timestamp.now(),
        validTill: form.validTill ? Timestamp.fromDate(new Date(form.validTill)) : null,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      setForm(emptyForm);
      setShowForm(false);
      fetchCoupons();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to create coupon.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (coupon: CouponData) => {
    try {
      await updateDoc(doc(db, 'coupons', coupon.code), { isActive: !coupon.isActive });
      setCoupons(prev => prev.map(c => c.code === coupon.code ? { ...c, isActive: !c.isActive } : c));
    } catch (err) {
      console.error(err);
      alert('Failed to update coupon.');
    }
  };

  const handleDelete = async (code: string) => {
    if (!window.confirm(`Delete coupon "${code}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'coupons', code));
      setCoupons(prev => prev.filter(c => c.code !== code));
    } catch (err) {
      console.error(err);
      alert('Failed to delete coupon.');
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16 md:p-6 md:pb-16 font-sans">
      <div className="flex items-center justify-between pb-3 border-b mb-4">
        <div className="w-8" />
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800 md:text-2xl">
          Coupon Codes
        </h1>
        <button onClick={() => navigate(-1)} className="p-2 rounded-sm hover:bg-gray-200 transition-colors">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => { setShowForm(prev => !prev); setError(''); }}
          className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-sm hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : '+ New Coupon'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-sm shadow-sm border border-gray-100 p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Code</label>
              <input
                type="text"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. WELCOME20"
                className="w-full text-sm bg-white border border-gray-200 rounded-sm px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Discount Type</label>
              <select
                value={form.discountType}
                onChange={e => setForm({ ...form, discountType: e.target.value as 'percent' | 'flat' })}
                className="w-full text-sm bg-white border border-gray-200 rounded-sm px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="percent">Percent (%)</option>
                <option value="flat">Flat (₹)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                Discount Value {form.discountType === 'percent' ? '(%)' : '(₹)'}
              </label>
              <input
                type="number"
                value={form.discountValue}
                onChange={e => setForm({ ...form, discountValue: Number(e.target.value) })}
                className="w-full text-sm bg-white border border-gray-200 rounded-sm px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Max Redemptions</label>
              <input
                type="number"
                value={form.maxRedemptions}
                onChange={e => setForm({ ...form, maxRedemptions: e.target.value })}
                placeholder="Unlimited"
                className="w-full text-sm bg-white border border-gray-200 rounded-sm px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Min Order Amount (₹)</label>
              <input
                type="number"
                value={form.minAmount}
                onChange={e => setForm({ ...form, minAmount: Number(e.target.value) })}
                className="w-full text-sm bg-white border border-gray-200 rounded-sm px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Valid Till</label>
              <input
                type="date"
                value={form.validTill}
                onChange={e => setForm({ ...form, validTill: e.target.value })}
                className="w-full text-sm bg-white border border-gray-200 rounded-sm px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-[10px] text-gray-400 mt-1">Empty = never expires</p>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
              Applicable Plans (none selected = all plans)
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_PLANS.map(plan => (
                <button
                  key={plan}
                  type="button"
                  onClick={() => togglePlan(plan)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-sm border transition-colors ${
                    form.applicablePlans.includes(plan)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {plan.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

          <button
            onClick={handleCreate}
            disabled={saving}
            className="px-10 py-2 bg-blue-600 text-white text-sm font-semibold rounded-sm hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Create Coupon'}
          </button>
        </div>
      )}

      {coupons.length === 0 ? (
        <div className="text-center p-10 text-gray-400">No coupons created yet.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {coupons.map(coupon => (
            <div key={coupon.code} className="bg-white rounded-sm shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-base font-bold font-mono text-gray-800">{coupon.code}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase bg-blue-100 text-blue-700">
                    {coupon.discountType === 'percent' ? `${coupon.discountValue}% off` : `₹${coupon.discountValue} off`}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase ${coupon.isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                    {coupon.isActive ? 'active' : 'inactive'}
                  </span>
                </div>
                <p className="text-sm text-gray-500">
                  Used {coupon.redemptionCount || 0}{coupon.maxRedemptions ? ` / ${coupon.maxRedemptions}` : ''} times
                  {' · '}Plans: {coupon.applicablePlans && coupon.applicablePlans.length > 0 ? coupon.applicablePlans.join(', ') : 'All'}
                  {' · '}Expires: {coupon.validTill ? formatDate(coupon.validTill) : 'Never'}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleToggleActive(coupon)}
                  className="px-4 py-2 text-xs font-semibold rounded-sm border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  {coupon.isActive ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => handleDelete(coupon.code)}
                  className="px-4 py-2 text-xs font-semibold rounded-sm bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SuperAdminCoupons;
