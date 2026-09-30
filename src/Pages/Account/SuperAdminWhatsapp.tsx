import React, { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, doc, getDoc, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ChevronDown } from 'lucide-react';
import { db } from '../../lib/Firebase';
import Loading from '../Loading/Loading';
import { SELLAR_WHATSAPP_PLANS } from '../Additional/Whatsapp/SellarWhatsappPlans';
import type { AdminCompany } from './superAdmin/data';
import { DAY_MS, ageText, companyStatus, fmtDate, fmtDateTime, fmtMoney, loadCompanies, toDate } from './superAdmin/data';
import { Alert, Btn, Card, Chip, EmptyRow, Field, PageHeader, PageShell, SearchBox, SelectBox, StatCard, inputCls } from './superAdmin/ui';

type Tier = 'none' | 'snapto' | 'sellar';
type Health = 'connected' | 'failing' | 'inactive' | 'not_set_up';

interface CompanyConfigForm {
  tier: Tier;
  active: boolean;
  snaptoApiKey: string;
  whatsappNumber: string;
  templateName: string;
  reminderTemplateName: string;
  stockAlertTemplateName: string;
  language: string;
  planId: string;
  quotaTotal: string; // '' = unlimited
  expiresAt: string;  // yyyy-mm-dd
  quotaUsed: number;
}

const emptyForm: CompanyConfigForm = {
  tier: 'none', active: false, snaptoApiKey: '', whatsappNumber: '', templateName: '',
  reminderTemplateName: '', stockAlertTemplateName: '', language: 'en', planId: '', quotaTotal: '', expiresAt: '', quotaUsed: 0,
};

interface WaStatus {
  tier: Tier;
  active: boolean;
  planId: string;
  quotaUsed: number;
  quotaTotal: number | null;
  expiresAt: Date | null;
}

interface MsgStats { sent: number; failed: number; last: Date | null; lastFailed: boolean; recentAllFailed: boolean }

interface Row {
  company: AdminCompany;
  status: WaStatus;
  msgs: MsgStats;
  health: Health;
  requested: string | null;
}

const HEALTH_META: Record<Health, { label: string; cls: string }> = {
  connected: { label: 'CONNECTED', cls: 'bg-green-100 text-green-700' },
  failing: { label: 'FAILING', cls: 'bg-red-100 text-red-700' },
  inactive: { label: 'INACTIVE', cls: 'bg-amber-100 text-amber-800' },
  not_set_up: { label: 'NOT SET UP', cls: 'bg-gray-200 text-gray-700' },
};

const EMPTY_MSGS: MsgStats = { sent: 0, failed: 0, last: null, lastFailed: false, recentAllFailed: false };

const toInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

const SuperAdminWhatsapp: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [activeCompanies, setActiveCompanies] = useState(0);

  const [sharedForm, setSharedForm] = useState({
    snaptoApiKey: '', whatsappNumber: '', templateName: '',
    reminderTemplateName: '', stockAlertTemplateName: '', renewalTemplateName: '', language: 'en',
  });
  const [sharedOpen, setSharedOpen] = useState(false);
  const [sharedSaving, setSharedSaving] = useState(false);
  const [sharedLoaded, setSharedLoaded] = useState(false);

  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<'all' | Health | 'requested'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [companies, statusSnap, sharedSnap, requestsSnap] = await Promise.all([
          loadCompanies(),
          getDocs(collectionGroup(db, 'whatsappStatus')),
          getDoc(doc(db, 'sellarWhatsappSharedConfig', 'global')),
          getDocs(collection(db, 'whatsappActivationRequests')),
        ]);

        if (sharedSnap.exists()) {
          const s = sharedSnap.data();
          setSharedForm({
            snaptoApiKey: s.snaptoApiKey || '', whatsappNumber: s.whatsappNumber || '', templateName: s.templateName || '',
            reminderTemplateName: s.reminderTemplateName || '', stockAlertTemplateName: s.stockAlertTemplateName || '',
            renewalTemplateName: s.renewalTemplateName || '', language: s.language || 'en',
          });
        }
        setSharedLoaded(true);

        const statuses = new Map<string, WaStatus>();
        statusSnap.docs.forEach(d => {
          const compId = d.ref.parent.parent?.id;
          if (!compId || d.id !== 'current') return;
          const x = d.data();
          const plan = x.sellarPlan || {};
          statuses.set(compId, {
            tier: (x.activeTier || 'none') as Tier,
            active: !!x.active,
            planId: plan.planId || '',
            quotaUsed: plan.quotaUsed || 0,
            quotaTotal: typeof plan.quotaTotal === 'number' ? plan.quotaTotal : null,
            expiresAt: toDate(plan.expiresAt),
          });
        });

        const requested = new Map<string, string>();
        requestsSnap.docs.forEach(d => {
          const x = d.data();
          if ((x.status || 'pending') === 'pending') requested.set(d.id, x.requestedPlanId || '');
        });

        // 30-day message stats, only for companies that have WhatsApp set up.
        const since = Timestamp.fromMillis(Date.now() - 30 * DAY_MS);
        const connectedIds = Array.from(statuses.entries()).filter(([, s]) => s.tier !== 'none').map(([id]) => id);
        const msgStats = new Map<string, MsgStats>();
        await Promise.all(connectedIds.map(async id => {
          try {
            const snap = await getDocs(query(collection(db, 'companies', id, 'whatsappMessages'), where('sentAt', '>=', since), orderBy('sentAt', 'desc')));
            const msgs = snap.docs.map(d => d.data());
            const recent = msgs.slice(0, 5);
            msgStats.set(id, {
              sent: msgs.filter(m => m.status !== 'failed').length,
              failed: msgs.filter(m => m.status === 'failed').length,
              last: toDate(msgs[0]?.sentAt),
              lastFailed: msgs[0]?.status === 'failed',
              recentAllFailed: recent.length >= 3 && recent.every(m => m.status === 'failed'),
            });
          } catch (err) {
            console.error(`Message stats failed for ${id}`, err);
          }
        }));

        setActiveCompanies(companies.filter(c => !c.isTestAccount && companyStatus(c) !== 'expired').length);
        setRows(companies.filter(c => !c.isTestAccount || statuses.has(c.id)).map(c => {
          const status = statuses.get(c.id) || { tier: 'none' as Tier, active: false, planId: '', quotaUsed: 0, quotaTotal: null, expiresAt: null };
          const msgs = msgStats.get(c.id) || EMPTY_MSGS;
          const health: Health = status.tier === 'none' ? 'not_set_up'
            : !status.active ? 'inactive'
              : msgs.recentAllFailed ? 'failing' : 'connected';
          return { company: c, status, msgs, health, requested: requested.get(c.id) ?? null };
        }));
      } catch (err) {
        console.error('Failed to load WhatsApp admin data:', err);
        alert('Failed to load WhatsApp data.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const stats = useMemo(() => {
    const on = rows.filter(r => r.status.tier !== 'none' && r.status.active);
    const sent = rows.reduce((s, r) => s + r.msgs.sent, 0);
    const failed = rows.reduce((s, r) => s + r.msgs.failed, 0);
    const nearQuota = rows.filter(r => r.status.tier === 'sellar' && r.status.quotaTotal && r.status.quotaUsed / r.status.quotaTotal >= 0.8).length;
    return {
      on: on.length, sent, failed, failRate: sent + failed ? Math.round((failed / (sent + failed)) * 100) : 0,
      failing: rows.filter(r => r.health === 'failing').length, nearQuota,
      requested: rows.filter(r => r.requested !== null).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rank: Record<Health, number> = { failing: 0, inactive: 1, connected: 2, not_set_up: 3 };
    return rows.filter(r => {
      if (healthFilter === 'requested' && r.requested === null) return false;
      if (healthFilter !== 'all' && healthFilter !== 'requested' && r.health !== healthFilter) return false;
      if (q && !r.company.name.toLowerCase().includes(q) && !r.company.id.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => Number(b.requested !== null) - Number(a.requested !== null) || rank[a.health] - rank[b.health] || (b.msgs.sent - a.msgs.sent));
  }, [rows, search, healthFilter]);

  const planCounts = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach(r => { if (r.status.tier === 'sellar' && r.status.planId) m.set(r.status.planId, (m.get(r.status.planId) || 0) + 1); });
    return m;
  }, [rows]);

  const saveShared = async () => {
    setSharedSaving(true);
    try {
      await httpsCallable(getFunctions(), 'setSellarSharedWhatsappConfig')(sharedForm);
      alert('Saved shared Sellar WhatsApp config.');
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save: ${err.message || err}`);
    } finally {
      setSharedSaving(false);
    }
  };

  const onSaved = (id: string, form: CompanyConfigForm) => setRows(prev => prev.map(r => {
    if (r.company.id !== id) return r;
    const status: WaStatus = {
      tier: form.tier, active: form.active, planId: form.planId, quotaUsed: r.status.quotaUsed,
      quotaTotal: form.quotaTotal === '' ? null : Number(form.quotaTotal), expiresAt: form.expiresAt ? new Date(form.expiresAt) : null,
    };
    const health: Health = form.tier === 'none' ? 'not_set_up' : !form.active ? 'inactive' : r.msgs.recentAllFailed ? 'failing' : 'connected';
    return { ...r, status, health, requested: form.tier !== 'none' && form.active ? null : r.requested };
  }));

  if (loading) return <Loading />;

  const selected = rows.find(r => r.company.id === selectedId) || null;

  return (
    <PageShell wide>
      <PageHeader
        title="WhatsApp Config"
        subtitle="Snapto connections and Sellar WhatsApp plans for each company"
        actions={<Btn onClick={() => setSharedOpen(o => !o)}>Sellar shared number {sharedOpen ? '▲' : '▼'}</Btn>}
      />

      {sharedOpen && (
        <Card className="p-5 mb-4">
          <h2 className="text-lg font-medium text-gray-900">Sellar shared WhatsApp number</h2>
          <p className="text-xs text-gray-500 mb-4">One set of credentials for every company on the “Sellar number” tier, and for renewal reminders from the Companies page.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Snapto API key"><SecretInput value={sharedForm.snaptoApiKey} onChange={v => setSharedForm(p => ({ ...p, snaptoApiKey: v }))} /></Field>
            <Field label="WhatsApp number"><input className={inputCls} value={sharedForm.whatsappNumber} onChange={e => setSharedForm(p => ({ ...p, whatsappNumber: e.target.value }))} /></Field>
            <Field label="Language code"><input className={inputCls} value={sharedForm.language} onChange={e => setSharedForm(p => ({ ...p, language: e.target.value }))} /></Field>
            <Field label="Invoice / order template"><input className={inputCls} value={sharedForm.templateName} onChange={e => setSharedForm(p => ({ ...p, templateName: e.target.value }))} /></Field>
            <Field label="Payment reminder template"><input className={inputCls} value={sharedForm.reminderTemplateName} onChange={e => setSharedForm(p => ({ ...p, reminderTemplateName: e.target.value }))} /></Field>
            <Field label="Stock alert template"><input className={inputCls} value={sharedForm.stockAlertTemplateName} onChange={e => setSharedForm(p => ({ ...p, stockAlertTemplateName: e.target.value }))} /></Field>
            <Field label="Subscription renewal template" hint="Used by “Remind”. {{1}} owner name, {{2}} plan, {{3}} “expires on …” / “expired on …”">
              <input className={inputCls} value={sharedForm.renewalTemplateName} onChange={e => setSharedForm(p => ({ ...p, renewalTemplateName: e.target.value }))} />
            </Field>
          </div>
          <div className="flex justify-end mt-4"><Btn variant="primary" onClick={saveShared} disabled={sharedSaving || !sharedLoaded}>{sharedSaving ? 'Saving…' : 'Save shared config'}</Btn></div>
        </Card>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard dot="bg-green-600" label="Companies on WhatsApp" value={stats.on} sub={`of ${activeCompanies} active companies`}
          active={healthFilter === 'connected'} onClick={() => setHealthFilter(f => f === 'connected' ? 'all' : 'connected')} />
        <StatCard dot="bg-blue-600" label="Messages sent" value={stats.sent.toLocaleString('en-IN')} sub="last 30 days" />
        <StatCard dot="bg-red-600" label="Failed" value={stats.failed.toLocaleString('en-IN')} sub={`${stats.failRate}% failure rate`} />
        <StatCard dot="bg-red-600" label="Connections failing" value={stats.failing} sub="last sends all failed"
          active={healthFilter === 'failing'} onClick={() => setHealthFilter(f => f === 'failing' ? 'all' : 'failing')} />
        <StatCard dot="bg-amber-500" label="Near quota" value={stats.nearQuota} sub="over 80% used" />
      </div>

      {stats.failing > 0 && (
        <Alert tone="red" action={<Btn size="sm" onClick={() => setHealthFilter('failing')}>Show them</Btn>}>
          <b>{stats.failing} {stats.failing === 1 ? 'company’s' : 'companies’'} bills and reminders are failing</b> — their recent sends all failed, usually an invalid Snapto key or template.
        </Alert>
      )}
      {stats.requested > 0 && (
        <Alert tone="amber" action={<Btn size="sm" onClick={() => setHealthFilter('requested')}>Show requests</Btn>}>
          <b>{stats.requested} compan{stats.requested === 1 ? 'y has' : 'ies have'} requested a Sellar WhatsApp plan</b> and {stats.requested === 1 ? 'is' : 'are'} waiting for activation.
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-4 items-start">
        <div className="space-y-4">
          <Card>
            <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center border-b border-gray-200">
              <SearchBox className="flex-1" value={search} onChange={setSearch} placeholder="Search company or CMP ID…" />
              <SelectBox label="Status" value={healthFilter} onChange={v => setHealthFilter(v as any)}>
                <option value="all">All</option><option value="connected">Connected</option><option value="failing">Failing</option>
                <option value="inactive">Inactive</option><option value="not_set_up">Not set up</option><option value="requested">Requested plan</option>
              </SelectBox>
            </div>
            <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_1.2fr_0.9fr_auto] gap-3 px-4 py-2.5 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <span>Company</span><span>Snapto</span><span>Plan</span><span>Messages</span><span>Last sent</span><span className="w-20 text-right">Action</span>
            </div>
            {filtered.length === 0 ? <EmptyRow>No companies match.</EmptyRow> : filtered.slice(0, 100).map(r => {
              const s = r.status;
              const plan = SELLAR_WHATSAPP_PLANS.find(p => p.id === s.planId);
              const used = s.tier === 'sellar' ? s.quotaUsed : r.msgs.sent + r.msgs.failed;
              const pctUsed = s.tier === 'sellar' && s.quotaTotal ? Math.min(100, (s.quotaUsed / s.quotaTotal) * 100) : 0;
              const barCls = pctUsed >= 95 ? 'bg-red-600' : pctUsed >= 80 ? 'bg-amber-500' : 'bg-blue-600';
              return (
                <div key={r.company.id} onClick={() => setSelectedId(r.company.id)}
                  className={`grid grid-cols-[1fr_auto] md:grid-cols-[1.4fr_1fr_1fr_1.2fr_0.9fr_auto] gap-x-3 gap-y-1 px-4 py-3 border-b border-gray-100 items-center cursor-pointer ${selectedId === r.company.id ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{r.company.name}</p>
                    <p className="text-xs font-mono text-gray-500">{r.company.id}{r.requested !== null && <span className="ml-2 font-sans font-semibold text-amber-700">requested plan</span>}</p>
                  </div>
                  <div><Chip cls={HEALTH_META[r.health].cls}>{HEALTH_META[r.health].label}</Chip></div>
                  <div className="hidden md:block text-sm font-medium text-gray-800">{s.tier === 'sellar' ? (plan?.name || s.planId || 'Sellar number') : s.tier === 'snapto' ? 'Own Snapto account' : 'None'}</div>
                  <div className="hidden md:block">
                    <p className="text-sm font-semibold">{used.toLocaleString('en-IN')}{s.tier === 'sellar' ? ` / ${s.quotaTotal === null ? '∞' : s.quotaTotal.toLocaleString('en-IN')}` : s.tier === 'snapto' ? ' · 30d' : ''}</p>
                    {s.tier === 'sellar' && s.quotaTotal !== null && <div className="h-1.5 rounded-full bg-gray-200 mt-1 overflow-hidden"><div className={`h-full ${barCls}`} style={{ width: `${pctUsed}%` }} /></div>}
                  </div>
                  <div className={`hidden md:block text-sm ${r.msgs.lastFailed ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                    {r.msgs.last ? `${r.msgs.lastFailed ? 'Failed · ' : ''}${ageText(r.msgs.last)} ago` : '—'}
                  </div>
                  <div className="hidden md:block w-20 text-right">
                    <button className="text-sm font-semibold text-blue-600 hover:underline">
                      {r.health === 'failing' ? 'Fix' : r.health === 'not_set_up' ? 'Set up' : 'Manage'}
                    </button>
                  </div>
                </div>
              );
            })}
            <p className="px-4 py-3 text-sm text-gray-600">Showing {Math.min(filtered.length, 100)} of {filtered.length}</p>
          </Card>

          <div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">Sellar WhatsApp plans</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {SELLAR_WHATSAPP_PLANS.map(p => (
                <Card key={p.id} className="p-4">
                  <p className="font-semibold text-gray-900">{p.subtitle}</p>
                  <p className="text-2xl font-semibold mt-1">{fmtMoney(p.price)}<span className="text-sm font-normal text-gray-500"> / {p.duration.toLowerCase()}</span></p>
                  <p className="text-sm text-gray-600 mt-1">{p.quota === null ? 'Unlimited' : p.quota.toLocaleString('en-IN')} messages · {planCounts.get(p.id) || 0} compan{(planCounts.get(p.id) || 0) === 1 ? 'y' : 'ies'} on it</p>
                </Card>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">Plans and prices are set in <span className="font-mono">SellarWhatsappPlans.ts</span>.</p>
          </div>
        </div>

        {selected
          ? <CompanyPanel key={selected.company.id} row={selected} onSaved={onSaved} />
          : <Card className="p-8 text-center text-sm text-gray-500">Select a company to manage its WhatsApp.</Card>}
      </div>
    </PageShell>
  );
};

const SecretInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex gap-2">
      <input type={shown ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} className={inputCls} autoComplete="off" />
      <Btn onClick={() => setShown(s => !s)}>{shown ? 'Hide' : 'Show'}</Btn>
    </div>
  );
};

const CompanyPanel: React.FC<{ row: Row; onSaved: (id: string, form: CompanyConfigForm) => void }> = ({ row, onSaved }) => {
  const id = row.company.id;
  const [form, setForm] = useState<CompanyConfigForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<{ type: string; to: string; status: string; at: Date | null; error: string | null }[] | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    getDoc(doc(db, 'adminWhatsappConfig', id)).then(snap => {
      if (!snap.exists()) {
        const requestedPlan = SELLAR_WHATSAPP_PLANS.find(p => p.id === row.requested);
        setForm(requestedPlan
          ? { ...emptyForm, tier: 'sellar', active: true, planId: requestedPlan.id, quotaTotal: requestedPlan.quota === null ? '' : String(requestedPlan.quota) }
          : { ...emptyForm });
        return;
      }
      const c = snap.data();
      setForm({
        tier: (c.tier || 'none') as Tier, active: !!c.active, snaptoApiKey: c.snaptoApiKey || '', whatsappNumber: c.whatsappNumber || '',
        templateName: c.templateName || '', reminderTemplateName: c.reminderTemplateName || '', stockAlertTemplateName: c.stockAlertTemplateName || '',
        language: c.language || 'en', planId: c.planId || '',
        quotaTotal: c.quotaTotal === null || c.quotaTotal === undefined ? '' : String(c.quotaTotal),
        expiresAt: toInput(toDate(c.expiresAt)), quotaUsed: c.quotaUsed || 0,
      });
    }).catch(err => { console.error(err); setForm({ ...emptyForm }); });

    getDocs(query(collection(db, 'companies', id, 'whatsappMessages'), orderBy('sentAt', 'desc'), limit(8)))
      .then(snap => setRecent(snap.docs.map(d => {
        const x = d.data();
        return { type: x.messageType || 'message', to: x.to || '', status: x.status || 'sent', at: toDate(x.sentAt), error: x.errorDetail || null };
      })))
      .catch(err => { console.error(err); setRecent([]); });
  }, [id, row.requested]);

  const update = (patch: Partial<CompanyConfigForm>) => setForm(f => (f ? { ...f, ...patch } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await httpsCallable(getFunctions(), 'setCompanyWhatsappConfig')({
        companyId: id, tier: form.tier, active: form.active,
        snaptoApiKey: form.snaptoApiKey, whatsappNumber: form.whatsappNumber, templateName: form.templateName,
        reminderTemplateName: form.reminderTemplateName, stockAlertTemplateName: form.stockAlertTemplateName, language: form.language,
        planId: form.planId, quotaTotal: form.quotaTotal === '' ? null : Number(form.quotaTotal), expiresAt: form.expiresAt || null,
      });
      onSaved(id, form);
      alert('Saved WhatsApp config.');
    } catch (err: any) {
      console.error(err);
      alert(`Failed to save: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const s = row.status;
  const plan = SELLAR_WHATSAPP_PLANS.find(p => p.id === s.planId);
  const usedPct = s.quotaTotal ? Math.round((s.quotaUsed / s.quotaTotal) * 100) : null;
  const MSG_CLS: Record<string, string> = { sent: 'bg-green-100 text-green-700', delivered: 'bg-green-100 text-green-700', read: 'bg-blue-50 text-blue-700', failed: 'bg-red-100 text-red-700' };

  return (
    <Card className="p-5 xl:sticky xl:top-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{row.company.name}</h2>
          <p className="text-sm text-gray-600"><span className="font-mono">{id}</span> · {row.company.pack.replace(/_/g, ' ') || 'no plan'}</p>
        </div>
        <Chip cls={HEALTH_META[row.health].cls}>{HEALTH_META[row.health].label}</Chip>
      </div>

      {row.requested !== null && (
        <p className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
          Requested <b>{SELLAR_WHATSAPP_PLANS.find(p => p.id === row.requested)?.name || row.requested || 'a plan'}</b>. The form below is pre-filled — check it and save to activate.
        </p>
      )}

      {!form ? <p className="text-sm text-gray-500 py-6">Loading config…</p> : (
        <div className="mt-4 bg-gray-50 rounded-lg p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Connection</p>
          <Field label="Tier">
            <select value={form.tier} onChange={e => update({ tier: e.target.value as Tier })} className={inputCls}>
              <option value="none">Not connected</option>
              <option value="snapto">Their own Snapto account</option>
              <option value="sellar">Sellar WhatsApp number (shared)</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={form.active} onChange={e => update({ active: e.target.checked })} /> Sending active
          </label>

          {form.tier === 'snapto' && <>
            <Field label="API key" hint="Stored server-side; only super admins can read it."><SecretInput value={form.snaptoApiKey} onChange={v => update({ snaptoApiKey: v })} /></Field>
            <Field label="Sender number"><input className={inputCls} value={form.whatsappNumber} placeholder="+91 …" onChange={e => update({ whatsappNumber: e.target.value })} /></Field>
            <button onClick={() => setShowAdvanced(v => !v)} className="text-sm font-semibold text-blue-600 flex items-center gap-1">
              Templates <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            </button>
            {showAdvanced && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Invoice / order"><input className={inputCls} value={form.templateName} onChange={e => update({ templateName: e.target.value })} /></Field>
              <Field label="Payment reminder"><input className={inputCls} value={form.reminderTemplateName} onChange={e => update({ reminderTemplateName: e.target.value })} /></Field>
              <Field label="Stock alert"><input className={inputCls} value={form.stockAlertTemplateName} onChange={e => update({ stockAlertTemplateName: e.target.value })} /></Field>
              <Field label="Language"><input className={inputCls} value={form.language} onChange={e => update({ language: e.target.value })} /></Field>
            </div>}
          </>}

          {form.tier === 'sellar' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Plan">
              <select value={form.planId} className={inputCls} onChange={e => {
                const p = SELLAR_WHATSAPP_PLANS.find(x => x.id === e.target.value);
                update({ planId: e.target.value, quotaTotal: p?.quota === null || p?.quota === undefined ? '' : String(p.quota) });
              }}>
                <option value="">Select a plan</option>
                {SELLAR_WHATSAPP_PLANS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Quota" hint="Empty = unlimited"><input type="number" className={inputCls} value={form.quotaTotal} onChange={e => update({ quotaTotal: e.target.value })} /></Field>
            <Field label="Plan expires"><input type="date" className={inputCls} value={form.expiresAt} onChange={e => update({ expiresAt: e.target.value })} /></Field>
            <Field label="Used so far"><input disabled className={`${inputCls} bg-gray-100`} value={form.quotaUsed.toLocaleString('en-IN')} /></Field>
          </div>}

          <div className="flex justify-end"><Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn></div>
        </div>
      )}

      {s.tier === 'sellar' && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-5 mb-2">Sellar WhatsApp plan</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-gray-200 rounded-lg p-3"><p className="text-xs text-gray-500">Plan</p><p className="font-semibold">{plan?.name || s.planId || '—'}</p></div>
            <div className="border border-gray-200 rounded-lg p-3"><p className="text-xs text-gray-500">Expires</p><p className="font-semibold">{fmtDate(s.expiresAt)}</p></div>
            <div className="border border-gray-200 rounded-lg p-3"><p className="text-xs text-gray-500">Used</p>
              <p className={`font-semibold ${usedPct !== null && usedPct >= 80 ? 'text-amber-600' : ''}`}>{usedPct === null ? `${s.quotaUsed.toLocaleString('en-IN')} · unlimited` : `${usedPct}%`}</p></div>
            <div className="border border-gray-200 rounded-lg p-3"><p className="text-xs text-gray-500">Failed · 30 days</p><p className="font-semibold">{row.msgs.failed}</p></div>
          </div>
        </>
      )}

      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-5 mb-2">Recent messages</p>
      {recent === null ? <p className="text-sm text-gray-500">Loading…</p> : recent.length === 0 ? <p className="text-sm text-gray-500">No messages sent yet.</p> : (
        <ul className="space-y-2">
          {recent.map((m, i) => (
            <li key={i} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="text-gray-800 capitalize">{m.type.replace(/([A-Z])/g, ' $1').toLowerCase()} · {m.to}</p>
                <p className="text-xs text-gray-500 truncate" title={m.error || undefined}>{fmtDateTime(m.at)}{m.error ? ` · ${m.error}` : ''}</p>
              </div>
              <Chip cls={MSG_CLS[m.status] || 'bg-gray-100 text-gray-700'}>{m.status.toUpperCase()}</Chip>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export default SuperAdminWhatsapp;
