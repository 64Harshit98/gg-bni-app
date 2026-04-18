import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  collection, getDocs, doc, setDoc, Timestamp, collectionGroup
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { PLANS } from '../../enums';
import Loading from '../Loading/Loading';
import { useAuth } from '../../context/auth-context';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';

// ─── Config ───────────────────────────────────────────────
const SUPER_ADMIN_UIDS = [
  "6vwZ1HRqX7VSnh5KP4JW0TKeuZm2",
  "1AKioGfop8PmHhry6uXOz8Rw6qT2"
];
const DEFAULT_DURATION_DAYS = 28;

const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// ─── Types ────────────────────────────────────────────────
interface CompanyData {
  id: string;
  name: string;
  ownerName?: string;
  pack: string;
  validity: 'active' | 'inactive';
  expiryDate?: any;
}

type FilterType = 'all' | 'active' | 'expired' | 'trial' | 'near_expiry';

// ─── Component ────────────────────────────────────────────
const SuperAdminCompanies: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [companies, setCompanies] = useState<CompanyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    pack: 'free',
    validity: 'active' as 'active' | 'inactive',
    expiryDate: '',
  });

  // Access guard
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

  const handleDeleteCompany = async (companyId: string) => {
    const confirmDelete = window.confirm(
      "🛑 WARNING: This will permanently delete the company, ALL its data, and ALL its users from Firebase Authentication. This cannot be undone. Are you sure?"
    );

    if (!confirmDelete) return;

    setLoading(true); // Reuse your loading state
    try {
      const functions = getFunctions();
      const deleteCompanyData = httpsCallable(functions, 'deleteCompanyData');

      const result = await deleteCompanyData({ companyId });
      console.log((result.data as any).message);

      // Remove the company from the local state
      setCompanies(prev => prev.filter(c => c.id !== companyId));
      setEditingId(null);
      alert("Company and users successfully deleted.");

    } catch (err: any) {
      console.error(err);
      alert(`Failed to delete company: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };
  // ── Fetch ──────────────────────────────────────────────
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const usersQuery = await getDocs(collectionGroup(db, 'users'));
        const companyMap = new Map<string, CompanyData>();

        usersQuery.forEach((userDoc) => {
          const parentCompany = userDoc.ref.parent.parent;
          if (parentCompany && !companyMap.has(parentCompany.id)) {
            companyMap.set(parentCompany.id, {
              id: parentCompany.id,
              name: 'Unknown (Phantom)',
              ownerName: 'Unknown',
              pack: 'free',
              validity: 'inactive',
              expiryDate: null,
            });
          }
        });

        const realSnap = await getDocs(collection(db, 'companies'));
        realSnap.forEach(d => {
          const data = d.data();
          companyMap.set(d.id, {
            id: d.id,
            name: data.name || 'Unknown Company',
            ownerName: data.ownerName || 'Unknown',
            pack: data.pack || 'free',
            validity: data.validity || 'inactive',
            expiryDate: data.expiryDate,
          });
        });

        setCompanies(Array.from(companyMap.values()));
      } catch (err) {
        console.error(err);
        alert('Error fetching companies.');
      } finally {
        setLoading(false);
      }
    };
    fetchCompanies();
  }, []);

  // ── Helpers ────────────────────────────────────────────
  const getStatus = (company: CompanyData): FilterType => {
    const now = new Date();
    const soonMs = 7 * 24 * 60 * 60 * 1000;
    const exp = company.expiryDate
      ? (company.expiryDate.toDate ? company.expiryDate.toDate() : new Date(company.expiryDate))
      : null;
    if (company.pack === 'free') return 'trial';
    if (!exp || exp.getTime() < now.getTime()) return 'expired';
    const diff = exp.getTime() - now.getTime();
    if (diff <= soonMs) return 'near_expiry';
    return 'active';
  };

  // ── Stats ──────────────────────────────────────────────
  const stats = useMemo(() => ({
    active: companies.filter(c => getStatus(c) === 'active').length,
    expired: companies.filter(c => getStatus(c) === 'expired').length,
    trial: companies.filter(c => getStatus(c) === 'trial').length,
    near_expiry: companies.filter(c => getStatus(c) === 'near_expiry').length,
  }), [companies]);

  // ── Filtered list ─────────────────────────────────────
  const filteredCompanies = useMemo(() => {
    const getExpiry = (c: CompanyData): Date | null => {
      if (!c.expiryDate) return null;
      const d = c.expiryDate.toDate ? c.expiryDate.toDate() : new Date(c.expiryDate);
      return isNaN(d.getTime()) ? null : d;
    };

    const priorityMap: Record<FilterType, number> = {
      near_expiry: 0, active: 1, trial: 2, expired: 3, all: 4
    };

    const sortByExpiry = (list: CompanyData[]) =>
      [...list].sort((a, b) => {
        const pa = priorityMap[getStatus(a)];
        const pb = priorityMap[getStatus(b)];
        if (pa !== pb) return pa - pb;
        const ea = getExpiry(a)?.getTime() ?? Infinity;
        const eb = getExpiry(b)?.getTime() ?? Infinity;
        return ea - eb;
      });

    const filtered = activeFilter === 'all'
      ? companies
      : companies.filter(c => getStatus(c) === activeFilter);

    return sortByExpiry(filtered);
  }, [companies, activeFilter]);

  // ── Edit helpers ───────────────────────────────────────
  const startEdit = (company: CompanyData) => {
    setEditingId(company.id);
    let dateStr = '';
    if (company.expiryDate) {
      const d = company.expiryDate.toDate ? company.expiryDate.toDate() : new Date(company.expiryDate);
      if (!isNaN(d.getTime())) dateStr = d.toISOString().split('T')[0];
    }
    setEditForm({ pack: company.pack, validity: company.validity, expiryDate: dateStr });
  };

  const handleSave = async () => {
    if (!editingId) return;
    try {
      const companyRef = doc(db, 'companies', editingId);
      let finalExpiry = editForm.expiryDate
        ? new Date(editForm.expiryDate)
        : addDays(new Date(), DEFAULT_DURATION_DAYS);
      finalExpiry.setHours(23, 59, 59);

      const payload: any = {
        pack: editForm.pack,
        validity: editForm.validity,
        expiryDate: Timestamp.fromDate(finalExpiry),
      };

      const current = companies.find(c => c.id === editingId);
      if (current?.name === 'Unknown (Phantom)') payload.name = `Company ${editingId}`;

      await setDoc(companyRef, payload, { merge: true });
      setCompanies(prev => prev.map(c =>
        c.id === editingId ? { ...c, ...payload, name: payload.name || c.name } : c
      ));
      setEditingId(null);
      alert(`Saved! Valid until: ${finalExpiry.toLocaleDateString()}`);
    } catch (err) {
      console.error(err);
      alert('Failed to update.');
    }
  };


  const formatExpiry = (expiryDate: any) => {
    if (!expiryDate) return null;
    const d = expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const isExpiringSoon = (expiryDate: any) => {
    if (!expiryDate) return false;
    const d = expiryDate.toDate ? expiryDate.toDate() : new Date(expiryDate);
    const diff = d.getTime() - new Date().getTime();
    return diff > 0 && diff <= 7 * 24 * 60 * 60 * 1000;
  };

  const packBadge = (pack: string) => {
    switch (pack) {
      case 'platinum': return 'bg-purple-100 text-purple-700';
      case 'gold': return 'bg-yellow-100 text-yellow-700';
      case 'basic': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  const toggleFilter = (f: FilterType) =>
    setActiveFilter(prev => (prev === f ? 'all' : f));

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16 md:p-6 md:pb-16 font-sans">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between pb-3 border-b mb-4">
        <div className="w-8" />
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800 md:text-2xl">
          Super Admin
        </h1>
        <button onClick={() => navigate(-1)} className="p-2 rounded-sm hover:bg-gray-200 transition-colors">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>


      {/* ── FILTER CARDS ── */}
      <div className="grid grid-cols-2 gap-2 mb-4 md:grid-cols-4 md:gap-4">

        <div
          onClick={() => toggleFilter('active')}
          className={`cursor-pointer rounded-sm transition-all border-2
            ${activeFilter === 'active'
              ? 'border-green-600 bg-green-50 shadow-md scale-105'
              : 'border-transparent'}`}
        >
          <CustomCard variant={CardVariant.Summary} title="Active Plans" value={stats.active.toString()} />
        </div>

        <div
          onClick={() => toggleFilter('expired')}
          className={`cursor-pointer rounded-sm transition-all border-2
            ${activeFilter === 'expired'
              ? 'border-red-600 bg-red-50 shadow-md scale-105'
              : 'border-transparent'}`}
        >
          <CustomCard variant={CardVariant.Summary} title="Expired Plans" value={stats.expired.toString()} />
        </div>

        <div
          onClick={() => toggleFilter('trial')}
          className={`cursor-pointer rounded-sm transition-all border-2
            ${activeFilter === 'trial'
              ? 'border-blue-600 bg-blue-50 shadow-md scale-105'
              : 'border-transparent'}`}
        >
          <CustomCard variant={CardVariant.Summary} title="Trial Plans" value={stats.trial.toString()} />
        </div>

        <div
          onClick={() => toggleFilter('near_expiry')}
          className={`cursor-pointer rounded-sm transition-all border-2
            ${activeFilter === 'near_expiry'
              ? 'border-orange-500 bg-orange-50 shadow-md scale-105'
              : 'border-transparent'}`}
        >
          <CustomCard variant={CardVariant.Summary} title="Near Expiry" value={stats.near_expiry.toString()} />
        </div>

      </div>

      {/* ── COMPANY LIST ── */}
      {filteredCompanies.length === 0 ? (
        <div className="text-center p-10 text-gray-400">No companies found.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredCompanies.map((company) => {
            const soon = isExpiringSoon(company.expiryDate);
            const isEditing = editingId === company.id;
            const expiryStr = formatExpiry(company.expiryDate);

            return (
              <div
                key={company.id}
                className="bg-white rounded-sm shadow-sm border border-gray-100 transition-all hover:shadow-md overflow-hidden"
              >
                {/* ── Card row ── */}
                <div
                  onClick={() => isEditing ? setEditingId(null) : startEdit(company)}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer hover:bg-gray-50 transition-colors"
                >

                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className={`text-base font-bold ${company.name === 'Unknown (Phantom)' ? 'text-red-400 italic' : 'text-gray-800'}`}>
                        {company.name}
                      </h3>
                      {/* Pack badge */}
                      <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase ${packBadge(company.pack)}`}>
                        {company.pack}
                      </span>
                      {/* Status badge */}
                      <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase ${getStatus(company) === 'expired'
                        ? 'bg-red-100 text-red-500'
                        : getStatus(company) === 'near_expiry'
                          ? 'bg-orange-100 text-orange-500'
                          : getStatus(company) === 'trial'
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-green-100 text-green-600'}`}>
                        {getStatus(company) === 'expired' ? 'inactive' : getStatus(company) === 'trial' ? 'trial' : 'active'}
                      </span>
                      {/* Near expiry warning */}
                      {soon && (
                        <span className="text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase bg-orange-100 text-orange-500">
                          ⚠ Expiring Soon
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-500">
                      Expires:{' '}
                      <span className={`font-semibold ${soon ? 'text-orange-500' : 'text-gray-700'}`}>
                        {expiryStr ?? <span className="italic text-gray-400">No Expiry</span>}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{company.id}</p>
                  </div>

                  {/* Right: chevron toggle */}
                  <div className="p-2 shrink-0 text-gray-400">
                    <svg
                      className={`w-5 h-5 transition-transform duration-200 ${isEditing ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* ── Inline edit panel ── */}
                {isEditing && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">

                      {/* Plan */}
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                          Plan
                        </label>
                        <div className="relative">
                          <select
                            value={editForm.pack}
                            onChange={e => setEditForm({ ...editForm, pack: e.target.value })}
                            className="w-full text-sm font-semibold bg-white border border-gray-200 rounded-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                          >
                            {Object.values(PLANS).map(p => (
                              <option key={p} value={p}>{p.toUpperCase()}</option>
                            ))}
                          </select>
                          <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Status */}
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                          Status
                        </label>
                        <div className="relative">
                          <select
                            value={editForm.validity}
                            onChange={e => setEditForm({ ...editForm, validity: e.target.value as 'active' | 'inactive' })}
                            className="w-full text-sm font-semibold bg-white border border-gray-200 rounded-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                          >
                            <option value="active">ACTIVE</option>
                            <option value="inactive">INACTIVE</option>
                          </select>
                          <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Expiry date */}
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">
                          Expiry Date
                        </label>
                        <input
                          type="date"
                          value={editForm.expiryDate}
                          onChange={e => setEditForm({ ...editForm, expiryDate: e.target.value })}
                          className="w-full text-sm bg-white border border-gray-200 rounded-sm px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-[10px] text-gray-400 mt-1">
                          {editForm.expiryDate ? 'Custom date selected' : 'Empty = +28 days from today'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 mt-4">
                      <button
                        onClick={handleSave}
                        className="w-full sm:w-auto px-10 py-2 bg-blue-600 text-white text-sm font-semibold rounded-sm hover:bg-blue-700 transition-colors"
                      >
                        Save Changes
                      </button>

                      <button
                        onClick={() => handleDeleteCompany(company.id)}
                        className="w-full sm:w-auto px-10 py-2 bg-red-600 text-white text-sm font-semibold rounded-sm hover:bg-red-700 transition-colors"
                      >
                        Delete Company & Users
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SuperAdminCompanies;