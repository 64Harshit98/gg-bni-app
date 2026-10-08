import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import BackButton from '../../Components/BackButton';
import { SELLAR_WHATSAPP_PLANS } from '../Additional/Whatsapp/SellarWhatsappPlans';

const SUPER_ADMIN_UIDS = [
  '6vwZ1HRqX7VSnh5KP4JW0TKeuZm2',
  '1AKioGfop8PmHhry6uXOz8Rw6qT2',
];

type Tier = 'none' | 'snapto' | 'sellar';

interface CompanyRow {
  id: string;
  name: string;
}

interface CompanyConfigForm {
  tier: Tier;
  active: boolean;
  // tier: snapto
  snaptoApiKey: string;
  whatsappNumber: string;
  templateName: string;
  reminderTemplateName: string;
  stockAlertTemplateName: string;
  language: string;
  // tier: sellar
  planId: string;
  quotaTotal: string; // '' = unlimited
  expiresAt: string; // yyyy-mm-dd
  quotaUsed: number;
}

const emptyForm: CompanyConfigForm = {
  tier: 'none',
  active: false,
  snaptoApiKey: '',
  whatsappNumber: '',
  templateName: '',
  reminderTemplateName: '',
  stockAlertTemplateName: '',
  language: 'en',
  planId: '',
  quotaTotal: '',
  expiresAt: '',
  quotaUsed: 0,
};

interface ActivationRequest {
  id: string; // companyId
  requestedPlanId?: string;
  requestedAt?: any;
  status?: string;
}

const SuperAdminWhatsapp: React.FC = () => {
  const { currentUser } = useAuth();

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [sharedForm, setSharedForm] = useState({
    snaptoApiKey: '', whatsappNumber: '', templateName: '',
    reminderTemplateName: '', stockAlertTemplateName: '', language: 'en',
  });
  const [sharedSaving, setSharedSaving] = useState(false);
  const [sharedLoaded, setSharedLoaded] = useState(false);

  const [requests, setRequests] = useState<ActivationRequest[]>([]);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formsByCompany, setFormsByCompany] = useState<Record<string, CompanyConfigForm>>({});
  const [loadingCompanyId, setLoadingCompanyId] = useState<string | null>(null);
  const [savingCompanyId, setSavingCompanyId] = useState<string | null>(null);

  const isAdmin = !!currentUser && SUPER_ADMIN_UIDS.includes(currentUser.uid);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchAll = async () => {
      try {
        const [companiesSnap, sharedSnap, requestsSnap] = await Promise.all([
          getDocs(collection(db, 'companies')),
          getDoc(doc(db, 'sellarWhatsappSharedConfig', 'global')),
          getDocs(collection(db, 'whatsappActivationRequests')),
        ]);

        setCompanies(
          companiesSnap.docs.map(d => ({ id: d.id, name: d.data().name || 'Unknown Company' }))
        );

        if (sharedSnap.exists()) {
          const s = sharedSnap.data();
          setSharedForm({
            snaptoApiKey: s.snaptoApiKey || '',
            whatsappNumber: s.whatsappNumber || '',
            templateName: s.templateName || '',
            reminderTemplateName: s.reminderTemplateName || '',
            stockAlertTemplateName: s.stockAlertTemplateName || '',
            language: s.language || 'en',
          });
        }
        setSharedLoaded(true);

        setRequests(requestsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ActivationRequest)));
      } catch (err) {
        console.error('Failed to load WhatsApp admin data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [isAdmin]);

  if (!currentUser || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="text-5xl mb-3">⛔</div>
          <p className="text-red-500 font-bold text-xl">ACCESS DENIED</p>
        </div>
      </div>
    );
  }

  const timestampToDateInput = (ts: any): string => {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  const loadCompanyConfig = async (companyId: string) => {
    if (formsByCompany[companyId]) return; // already loaded
    setLoadingCompanyId(companyId);
    try {
      const snap = await getDoc(doc(db, 'adminWhatsappConfig', companyId));
      if (snap.exists()) {
        const c = snap.data();
        setFormsByCompany(prev => ({
          ...prev,
          [companyId]: {
            tier: (c.tier || 'none') as Tier,
            active: !!c.active,
            snaptoApiKey: c.snaptoApiKey || '',
            whatsappNumber: c.whatsappNumber || '',
            templateName: c.templateName || '',
            reminderTemplateName: c.reminderTemplateName || '',
            stockAlertTemplateName: c.stockAlertTemplateName || '',
            language: c.language || 'en',
            planId: c.planId || '',
            quotaTotal: c.quotaTotal === null || c.quotaTotal === undefined ? '' : String(c.quotaTotal),
            expiresAt: timestampToDateInput(c.expiresAt),
            quotaUsed: c.quotaUsed || 0,
          },
        }));
      } else {
        setFormsByCompany(prev => ({ ...prev, [companyId]: { ...emptyForm } }));
      }
    } catch (err) {
      console.error('Failed to load company WhatsApp config:', err);
      setFormsByCompany(prev => ({ ...prev, [companyId]: { ...emptyForm } }));
    } finally {
      setLoadingCompanyId(null);
    }
  };

  const toggleExpand = (companyId: string) => {
    if (expandedId === companyId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(companyId);
    loadCompanyConfig(companyId);
  };

  const updateForm = (companyId: string, patch: Partial<CompanyConfigForm>) => {
    setFormsByCompany(prev => ({ ...prev, [companyId]: { ...prev[companyId], ...patch } }));
  };

  const saveCompanyConfig = async (companyId: string) => {
    const form = formsByCompany[companyId];
    if (!form) return;
    setSavingCompanyId(companyId);
    try {
      const functions = getFunctions();
      const setCompanyWhatsappConfig = httpsCallable(functions, 'setCompanyWhatsappConfig');
      await setCompanyWhatsappConfig({
        companyId,
        tier: form.tier,
        active: form.active,
        snaptoApiKey: form.snaptoApiKey,
        whatsappNumber: form.whatsappNumber,
        templateName: form.templateName,
        reminderTemplateName: form.reminderTemplateName,
        stockAlertTemplateName: form.stockAlertTemplateName,
        language: form.language,
        planId: form.planId,
        quotaTotal: form.quotaTotal === '' ? null : Number(form.quotaTotal),
        expiresAt: form.expiresAt || null,
      });
      alert('Saved WhatsApp config.');
    } catch (err: any) {
      console.error('Failed to save company WhatsApp config:', err);
      alert(`Failed to save: ${err.message || err}`);
    } finally {
      setSavingCompanyId(null);
    }
  };

  const saveSharedConfig = async () => {
    setSharedSaving(true);
    try {
      const functions = getFunctions();
      const setSellarSharedWhatsappConfig = httpsCallable(functions, 'setSellarSharedWhatsappConfig');
      await setSellarSharedWhatsappConfig(sharedForm);
      alert('Saved shared Sellar WhatsApp config.');
    } catch (err: any) {
      console.error('Failed to save shared config:', err);
      alert(`Failed to save: ${err.message || err}`);
    } finally {
      setSharedSaving(false);
    }
  };

  const filteredCompanies = companies.filter(c => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
  });

  const pendingRequests = requests.filter(r => (r.status || 'pending') === 'pending');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-24">
      <div className="flex items-center bg-white border-b border-gray-200 sticky top-0 z-10">
        <BackButton className="ml-3" />
        <div className="px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">WhatsApp Config</h1>
          <p className="text-xs text-gray-500">Manage per-company Snapto credentials & Sellar WhatsApp plans</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-4 space-y-6">

        {/* Shared Sellar config */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-800">Sellar Shared WhatsApp Number</h2>
            <p className="text-xs text-gray-500">
              One set of credentials used for every company on the "Sellar WhatsApp Number" tier.
            </p>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Snapto API Key</label>
              <input type="password" value={sharedForm.snaptoApiKey}
                onChange={e => setSharedForm(prev => ({ ...prev, snaptoApiKey: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number</label>
              <input type="text" value={sharedForm.whatsappNumber}
                onChange={e => setSharedForm(prev => ({ ...prev, whatsappNumber: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice/Order Template Name</label>
              <input type="text" value={sharedForm.templateName}
                onChange={e => setSharedForm(prev => ({ ...prev, templateName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Template Name</label>
              <input type="text" value={sharedForm.reminderTemplateName}
                onChange={e => setSharedForm(prev => ({ ...prev, reminderTemplateName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock Alert Template Name</label>
              <input type="text" value={sharedForm.stockAlertTemplateName}
                onChange={e => setSharedForm(prev => ({ ...prev, stockAlertTemplateName: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Language Code</label>
              <input type="text" value={sharedForm.language}
                onChange={e => setSharedForm(prev => ({ ...prev, language: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
            </div>
          </div>
          <div className="px-6 pb-6">
            <button
              onClick={saveSharedConfig}
              disabled={sharedSaving || !sharedLoaded}
              className="bg-emerald-600 text-white px-5 py-2 rounded-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
            >
              {sharedSaving ? 'Saving...' : 'Save Shared Config'}
            </button>
          </div>
        </div>

        {/* Pending activation requests */}
        {pendingRequests.length > 0 && (
          <div className="bg-white rounded-sm shadow-sm border border-amber-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-amber-100 bg-amber-50">
              <h2 className="text-lg font-semibold text-gray-800">Pending Activation Requests ({pendingRequests.length})</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {pendingRequests.map(r => {
                const company = companies.find(c => c.id === r.id);
                const plan = SELLAR_WHATSAPP_PLANS.find(p => p.id === r.requestedPlanId);
                return (
                  <div key={r.id} className="px-6 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-gray-800">{company?.name || r.id}</p>
                      <p className="text-xs text-gray-500">Requested: {plan?.name || r.requestedPlanId || 'N/A'}</p>
                    </div>
                    <button
                      onClick={() => { setExpandedId(r.id); loadCompanyConfig(r.id); document.getElementById(`company-${r.id}`)?.scrollIntoView({ behavior: 'smooth' }); }}
                      className="text-xs font-bold text-blue-600 hover:underline"
                    >
                      Activate →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Company search + list */}
        <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h2 className="text-lg font-semibold text-gray-800">Companies</h2>
            <input
              type="text"
              placeholder="Search company name or ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-sm text-sm"
            />
          </div>
          <div className="divide-y divide-gray-100">
            {filteredCompanies.map(company => {
              const isExpanded = expandedId === company.id;
              const form = formsByCompany[company.id];
              return (
                <div key={company.id} id={`company-${company.id}`}>
                  <div
                    onClick={() => toggleExpand(company.id)}
                    className="px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-sm font-bold text-gray-800">{company.name}</p>
                      <p className="text-xs text-gray-400">{company.id}</p>
                    </div>
                    <span className="text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                  </div>

                  {isExpanded && (
                    <div className="px-6 pb-5 bg-gray-50/50">
                      {loadingCompanyId === company.id || !form ? (
                        <p className="text-xs text-gray-400 py-3">Loading...</p>
                      ) : (
                        <div className="space-y-4 pt-2">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
                            <select
                              value={form.tier}
                              onChange={e => updateForm(company.id, { tier: e.target.value as Tier })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm bg-white"
                            >
                              <option value="none">Not connected</option>
                              <option value="snapto">WhatsApp Business (their own Snapto account)</option>
                              <option value="sellar">Sellar WhatsApp Number (shared)</option>
                            </select>
                          </div>

                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={form.active}
                              onChange={e => updateForm(company.id, { active: e.target.checked })}
                            />
                            Active
                          </label>

                          {form.tier === 'snapto' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Snapto API Key</label>
                                <input type="password" value={form.snaptoApiKey}
                                  onChange={e => updateForm(company.id, { snaptoApiKey: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">WhatsApp Number</label>
                                <input type="text" value={form.whatsappNumber}
                                  onChange={e => updateForm(company.id, { whatsappNumber: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Invoice/Order Template</label>
                                <input type="text" value={form.templateName}
                                  onChange={e => updateForm(company.id, { templateName: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Reminder Template</label>
                                <input type="text" value={form.reminderTemplateName}
                                  onChange={e => updateForm(company.id, { reminderTemplateName: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Stock Alert Template</label>
                                <input type="text" value={form.stockAlertTemplateName}
                                  onChange={e => updateForm(company.id, { stockAlertTemplateName: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Language Code</label>
                                <input type="text" value={form.language}
                                  onChange={e => updateForm(company.id, { language: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
                              </div>
                            </div>
                          )}

                          {form.tier === 'sellar' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Plan</label>
                                <select
                                  value={form.planId}
                                  onChange={e => {
                                    const plan = SELLAR_WHATSAPP_PLANS.find(p => p.id === e.target.value);
                                    updateForm(company.id, {
                                      planId: e.target.value,
                                      quotaTotal: plan?.quota === null || plan?.quota === undefined ? '' : String(plan.quota),
                                    });
                                  }}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm bg-white"
                                >
                                  <option value="">Select a plan</option>
                                  {SELLAR_WHATSAPP_PLANS.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.quota === null ? 'unlimited' : p.quota})</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                  Quota Total (blank = unlimited)
                                </label>
                                <input type="number" value={form.quotaTotal}
                                  onChange={e => updateForm(company.id, { quotaTotal: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Expiry Date</label>
                                <input type="date" value={form.expiresAt}
                                  onChange={e => updateForm(company.id, { expiresAt: e.target.value })}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-600 mb-1">Quota Used</label>
                                <p className="px-3 py-2 text-sm text-gray-500">{form.quotaUsed}</p>
                              </div>
                            </div>
                          )}

                          <button
                            onClick={() => saveCompanyConfig(company.id)}
                            disabled={savingCompanyId === company.id}
                            className="bg-blue-600 text-white px-5 py-2 rounded-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
                          >
                            {savingCompanyId === company.id ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminWhatsapp;
