import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { db } from '../../lib/Firebase';
import { PLANS } from '../../enums';
import Loading from '../Loading/Loading';
import { confirmExpiryChange, MAX_EXPIRY_YEARS_AHEAD } from './superAdminExpiryGuard';
import type { AdminCompany, PaidOrder } from './superAdmin/data';
import {
  COMPANY_STATUS_META, addMonths, extensionBase, PLAN_META, PLAN_PRICE_YEARLY, DAY_MS,
  companyStatus, daysUntil, downloadCsv, estimateMrr, fmtDate, fmtMoney, fmtShortDate, invalidateAdminCache,
  isPaying, loadCompanies, loadPaidOrders, looksLikeTest, planLabel,
} from './superAdmin/data';
import { Alert, Btn, Card, Chip, Pager, PageHeader, PageShell, SearchBox, SelectBox, StatCard, EmptyRow } from './superAdmin/ui';

type CardFilter = 'all' | 'active' | 'expiring' | 'expired' | 'trial' | 'test';
type ExpiresFilter = 'any' | '7d' | '30d' | 'expired' | 'suspicious';
type SortKey = 'expiry_asc' | 'expiry_desc' | 'newest' | 'name';

const PAGE_SIZE = 25;
const EXTEND_OPTIONS = [1, 3, 6, 12];

const relativeExpiry = (c: AdminCompany) => {
  const days = daysUntil(c.expiry);
  const status = companyStatus(c);
  if (days === null) return { text: 'no expiry set', cls: 'text-red-600' };
  if (status === 'check_date') return { text: 'looks wrong — check credit', cls: 'text-purple-600' };
  if (days < 0) return { text: `${Math.abs(days)} days ago`, cls: 'text-red-600' };
  if (days === 0) return { text: 'today', cls: 'text-red-600' };
  if (days <= 1) return { text: 'in 1 day', cls: 'text-red-600' };
  if (days <= 7) return { text: `in ${days} days`, cls: 'text-amber-600' };
  return { text: `in ${days} days`, cls: 'text-green-700' };
};

const SuperAdminCompanies: React.FC = () => {
  const [params] = useSearchParams();
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // ?filter=expiring|expired|trial|test and ?expires=suspicious let the dashboard deep-link here.
  const [cardFilter, setCardFilter] = useState<CardFilter>((params.get('filter') as CardFilter) || 'all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [expiresFilter, setExpiresFilter] = useState<ExpiresFilter>((params.get('expires') as ExpiresFilter) || 'any');
  const [sortKey, setSortKey] = useState<SortKey>('expiry_asc');
  const [showTest, setShowTest] = useState(false);
  const [searchQuery, setSearchQuery] = useState(params.get('q') || '');
  const [page, setPage] = useState(0);

  const [expandedId, setExpandedId] = useState<string | null>(params.get('open'));
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState(false);

  useEffect(() => {
    Promise.all([loadCompanies(true), loadPaidOrders(true)])
      .then(([c, o]) => { setCompanies(c); setOrders(o); })
      .catch(err => { console.error(err); alert('Error fetching companies.'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPage(0); }, [cardFilter, planFilter, expiresFilter, sortKey, showTest, searchQuery]);

  const patchCompany = (id: string, patch: Partial<AdminCompany>) => {
    invalidateAdminCache('companies');
    setCompanies(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
  };

  const ordersByCompany = useMemo(() => {
    const m = new Map<string, PaidOrder[]>();
    orders.forEach(o => m.set(o.companyId, [...(m.get(o.companyId) || []), o]));
    m.forEach(list => list.sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0)));
    return m;
  }, [orders]);

  // ── Stats (test accounts excluded unless shown) ────────
  const counted = useMemo(() => companies.filter(c => showTest || !c.isTestAccount), [companies, showTest]);

  const stats = useMemo(() => {
    const s = { all: counted.length, active: 0, expiring: 0, expired: 0, trial: 0, check: 0 };
    let nextExpiry: Date | null = null;
    counted.forEach(c => {
      const st = companyStatus(c);
      if (st === 'active' || st === 'expiring') s.active++;
      if (st === 'expiring') {
        s.expiring++;
        if (!nextExpiry || (c.expiry && c.expiry < nextExpiry)) nextExpiry = c.expiry;
      }
      if (st === 'expired') s.expired++;
      if (st === 'check_date') s.check++;
      if (c.isTrial && st !== 'expired') s.trial++;
    });
    return {
      ...s,
      nextExpiry: nextExpiry as Date | null,
      tests: companies.filter(c => c.isTestAccount).length,
      suspectedTests: companies.filter(looksLikeTest).length,
    };
  }, [counted, companies]);

  const money = useMemo(() => {
    const mrr = estimateMrr(companies, orders);
    const since = Date.now() - 30 * DAY_MS;
    const revenue30 = orders.filter(o => (o.paidAt?.getTime() ?? 0) >= since).reduce((s, o) => s + o.finalAmount, 0);
    const atRisk = companies
      .filter(c => !c.isTestAccount && isPaying(c))
      .filter(c => { const d = daysUntil(c.expiry); return d !== null && d <= 30; })
      .reduce((s, c) => s + (PLAN_PRICE_YEARLY[c.pack] || 0), 0);
    return { mrr, revenue30, atRisk };
  }, [companies, orders]);

  const planMix = useMemo(() => {
    const live = counted.filter(c => companyStatus(c) !== 'expired');
    return { total: live.length, counts: Object.values(PLANS).map(p => ({ plan: p, n: live.filter(c => c.pack === p).length })) };
  }, [counted]);

  // ── Filter + sort ──────────────────────────────────────
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = companies.filter(c => {
      if (cardFilter === 'test') {
        if (!c.isTestAccount) return false;
      } else if (!showTest && c.isTestAccount) return false;

      const st = companyStatus(c);
      if (cardFilter === 'active' && st !== 'active' && st !== 'expiring') return false;
      if (cardFilter === 'expiring' && st !== 'expiring') return false;
      if (cardFilter === 'expired' && st !== 'expired') return false;
      if (cardFilter === 'trial' && !(c.isTrial && st !== 'expired')) return false;
      if (planFilter !== 'all' && c.pack !== planFilter) return false;

      const days = daysUntil(c.expiry);
      if (expiresFilter === '7d' && !(days !== null && days >= 0 && days <= 7)) return false;
      if (expiresFilter === '30d' && !(days !== null && days >= 0 && days <= 30)) return false;
      if (expiresFilter === 'expired' && st !== 'expired') return false;
      if (expiresFilter === 'suspicious' && st !== 'check_date') return false;

      if (q && ![c.name, c.ownerName, c.email, c.phone, c.id, c.pack].some(f => f && f.toLowerCase().includes(q))) return false;
      return true;
    });

    const exp = (c: AdminCompany) => c.expiry?.getTime() ?? -Infinity;
    const rank = (c: AdminCompany) => ({ expiring: 0, active: 1, check_date: 2, expired: 3 }[companyStatus(c)]);

    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'expiry_desc': return exp(b) - exp(a);
        case 'newest': return (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0);
        case 'name': return a.name.localeCompare(b.name);
        default: {
          // Soonest first among live plans; expired afterwards, most recently lapsed first.
          const r = rank(a) - rank(b);
          if (r !== 0) return r;
          return rank(a) === 3 ? exp(b) - exp(a) : exp(a) - exp(b);
        }
      }
    });
  }, [companies, cardFilter, planFilter, expiresFilter, sortKey, showTest, searchQuery]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Actions ────────────────────────────────────────────
  const writeCompany = async (c: AdminCompany, payload: Record<string, any>, patch: Partial<AdminCompany>) => {
    setBusyId(c.id);
    try {
      await setDoc(doc(db, 'companies', c.id), payload, { merge: true });
      patchCompany(c.id, patch);
      return true;
    } catch (err: any) {
      console.error(err);
      alert(`Failed to update ${c.name}: ${err.message || err}`);
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const applyExpiry = async (c: AdminCompany, newExpiry: Date) => {
    if (!confirmExpiryChange(c.name, c.expiry, newExpiry)) return false;
    return writeCompany(c, { expiryDate: Timestamp.fromDate(newExpiry), validity: 'active' }, { expiry: newExpiry, validity: 'active' });
  };

  const sendReminder = async (c: AdminCompany, silent = false): Promise<boolean> => {
    if (!c.phone) {
      if (!silent) alert(`${c.name} has no owner phone number.`);
      return false;
    }
    if (!silent && !window.confirm(`Send WhatsApp renewal reminder to ${c.name} (${c.phone})?`)) return false;

    setBusyId(c.id);
    try {
      // Sent from Sellar's shared number; the function resolves the owner's
      // phone and the message template server-side.
      const fn = httpsCallable(getFunctions(), 'sendRenewalReminder');
      const result = await fn({ companyId: c.id });
      patchCompany(c.id, { lastRenewalReminderAt: new Date() });
      if (!silent) alert(`Reminder sent to ${(result.data as { to: string }).to}.`);
      return true;
    } catch (err: any) {
      console.error('Reminder Send Error:', err);
      if (!silent) alert(`Failed to send reminder: ${err.message || err}`);
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const remindAllExpiring = async () => {
    const targets = companies.filter(c => !c.isTestAccount && companyStatus(c) === 'expiring');
    if (targets.length === 0) return;
    if (!window.confirm(`Send WhatsApp renewal reminders to ${targets.length} expiring companies?`)) return;
    setBulkSending(true);
    const failed: string[] = [];
    for (const c of targets) {
      if (!(await sendReminder(c, true))) failed.push(c.name);
    }
    setBulkSending(false);
    alert(failed.length
      ? `Sent ${targets.length - failed.length} of ${targets.length}. Failed: ${failed.join(', ')}`
      : `Sent ${targets.length} reminders.`);
  };

  const toggleTest = async (c: AdminCompany) => {
    const next = !c.isTestAccount;
    if (!window.confirm(next
      ? `Mark ${c.name} as a test account? It will be hidden from all counts.`
      : `Unmark ${c.name} as a test account?`)) return;
    await writeCompany(c, { isTestAccount: next }, { isTestAccount: next });
  };

  const toggleSuspend = async (c: AdminCompany) => {
    const next = c.validity === 'active' ? 'inactive' : 'active';
    if (!window.confirm(next === 'inactive'
      ? `Suspend ${c.name}? Their plan will be marked inactive.`
      : `Reactivate ${c.name}?`)) return;
    await writeCompany(c, { validity: next }, { validity: next });
  };

  const deleteCompany = async (c: AdminCompany) => {
    if (!window.confirm(
      `🛑 WARNING: This will permanently delete ${c.name}, ALL its data, and ALL its users from Firebase Authentication. This cannot be undone. Are you sure?`
    )) return;
    setBusyId(c.id);
    try {
      const fn = httpsCallable(getFunctions(), 'deleteCompanyData');
      await fn({ companyId: c.id });
      invalidateAdminCache('companies');
      setCompanies(prev => prev.filter(x => x.id !== c.id));
      setExpandedId(null);
      alert('Company and users successfully deleted.');
    } catch (err: any) {
      console.error(err);
      alert(`Failed to delete company: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  };

  const exportCsv = () => downloadCsv(
    `sellar-companies-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Company ID', 'Name', 'Owner', 'Phone', 'Email', 'Plan', 'Trial', 'Status', 'Expiry', 'Signed up', 'Test account', 'Paid orders'],
    filtered.map(c => [
      c.id, c.name, c.ownerName, c.phone, c.email, c.pack, c.isTrial ? 'yes' : 'no',
      COMPANY_STATUS_META[companyStatus(c)].label, c.expiry?.toISOString().slice(0, 10) || '',
      c.createdAt?.toISOString().slice(0, 10) || '', c.isTestAccount ? 'yes' : 'no',
      ordersByCompany.get(c.id)?.length || 0,
    ])
  );

  const toggleCard = (f: CardFilter) => setCardFilter(prev => (prev === f ? 'all' : f));

  if (loading) return <Loading />;

  return (
    <PageShell>
      <div onClick={() => setMenuId(null)}>
        <PageHeader
          title="Companies"
          subtitle="Subscriptions, plans and renewals for every Sellar company"
          actions={<>
            <Btn onClick={exportCsv}>Export CSV</Btn>
            <Btn variant="green" onClick={remindAllExpiring} disabled={stats.expiring === 0 || bulkSending}>
              {bulkSending ? 'Sending…' : `Remind all expiring (${stats.expiring})`}
            </Btn>
          </>}
        />

        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <StatCard dot="bg-gray-500" label="All companies" value={stats.all}
            sub={stats.suspectedTests ? `${stats.suspectedTests} look like tests` : `${stats.tests} marked as test`}
            active={cardFilter === 'all'} onClick={() => setCardFilter('all')} />
          <StatCard dot="bg-green-600" label="Active" value={stats.active}
            sub={stats.all ? `${Math.round((stats.active / stats.all) * 100)}% of total` : '—'}
            active={cardFilter === 'active'} onClick={() => toggleCard('active')} />
          <StatCard dot="bg-amber-500" label="Expiring · 7 days" value={stats.expiring}
            sub={stats.nextExpiry ? `Next: ${fmtShortDate(stats.nextExpiry)}` : 'None this week'}
            active={cardFilter === 'expiring'} onClick={() => toggleCard('expiring')} />
          <StatCard dot="bg-red-600" label="Expired" value={stats.expired} sub="Win-back list"
            active={cardFilter === 'expired'} onClick={() => toggleCard('expired')} />
          <StatCard dot="bg-blue-600" label="On trial" value={stats.trial} sub="Not expired yet"
            active={cardFilter === 'trial'} onClick={() => toggleCard('trial')} />
          <StatCard dot="bg-gray-400" label="Test accounts" value={stats.tests} sub="Hidden from counts"
            active={cardFilter === 'test'} onClick={() => toggleCard('test')} />
        </div>

        {stats.check > 0 && (
          <Alert tone="purple" action={
            <Btn size="sm" onClick={() => { setCardFilter('all'); setExpiresFilter('suspicious'); }}>Show them</Btn>
          }>
            <b>{stats.check} {stats.check === 1 ? 'company expires' : 'companies expire'} more than {MAX_EXPIRY_YEARS_AHEAD} years from now.</b>{' '}
            Usually a typo in the year or credit added twice.
          </Alert>
        )}

        {/* ── PLAN MIX + MONEY ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mb-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-medium text-gray-900">Plan mix · live companies</h2>
              <span className="text-xs text-gray-500">Click a plan to filter</span>
            </div>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100 mb-3">
              {planMix.counts.map(({ plan, n }) => n > 0 && (
                <div key={plan} className={PLAN_META[plan].color} style={{ width: `${(n / planMix.total) * 100}%` }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {planMix.counts.map(({ plan, n }) => (
                <button key={plan} onClick={() => setPlanFilter(prev => (prev === plan ? 'all' : plan))}
                  className={`flex items-center gap-2 text-xs font-semibold rounded px-1 -mx-1 ${planFilter === plan ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:text-gray-900'}`}>
                  <span className={`w-2.5 h-2.5 rounded-sm ${PLAN_META[plan].color}`} />
                  {PLAN_META[plan].label} <span className="font-normal text-gray-500">{n}</span>
                </button>
              ))}
            </div>
          </Card>
          <Card className="p-5 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">MRR (est.)</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{fmtMoney(money.mrr.total)}</p>
              <p className="text-xs text-gray-500" title="Latest paid order per paying company, net of discount, ex-GST, ÷ 12. List price where no order exists.">
                paying plans ÷ 12
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">Revenue · 30d</p>
              <p className="text-2xl font-semibold text-gray-900 mt-1">{fmtMoney(money.revenue30)}</p>
              <p className="text-xs text-gray-500">paid orders, incl. GST</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-600">At risk</p>
              <p className="text-2xl font-semibold text-amber-600 mt-1">{fmtMoney(money.atRisk)}</p>
              <p className="text-xs text-gray-500">paid plans expiring ≤ 30d</p>
            </div>
          </Card>
        </div>

        {/* ── TABLE ── */}
        <Card>
          <div className="p-4 flex flex-col lg:flex-row gap-3 lg:items-center border-b border-gray-200">
            <SearchBox className="flex-1" value={searchQuery} onChange={setSearchQuery} placeholder="Search by company, owner, phone, email or CMP ID…" />
            <div className="grid grid-cols-2 sm:flex gap-2 items-center">
              <SelectBox label="Plan" value={planFilter} onChange={setPlanFilter}>
                <option value="all">All plans</option>
                {Object.values(PLANS).map(p => <option key={p} value={p}>{PLAN_META[p].label}</option>)}
              </SelectBox>
              <SelectBox label="Expires" value={expiresFilter} onChange={v => setExpiresFilter(v as ExpiresFilter)}>
                <option value="any">Any time</option>
                <option value="7d">Within 7 days</option>
                <option value="30d">Within 30 days</option>
                <option value="expired">Already expired</option>
                <option value="suspicious">&gt; {MAX_EXPIRY_YEARS_AHEAD} years away</option>
              </SelectBox>
              <SelectBox label="Sort" value={sortKey} onChange={v => setSortKey(v as SortKey)}>
                <option value="expiry_asc">Expiry: soonest</option>
                <option value="expiry_desc">Expiry: latest</option>
                <option value="newest">Newest signup</option>
                <option value="name">Name A–Z</option>
              </SelectBox>
              <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={showTest} onChange={e => setShowTest(e.target.checked)} />
                Show test
              </label>
            </div>
          </div>

          <div className="hidden md:grid grid-cols-[40px_minmax(0,2.2fr)_1fr_1fr_1.2fr_1fr_auto] gap-3 px-4 py-2.5 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
            <span /><span>Company</span><span>Plan</span><span>Status</span><span>Expires</span><span>Last payment</span>
            <span className="text-right w-[190px]">Actions</span>
          </div>

          {pageRows.length === 0 ? <EmptyRow>No companies match these filters.</EmptyRow> : pageRows.map(c => (
            <CompanyRow
              key={c.id}
              company={c}
              orders={ordersByCompany.get(c.id) || []}
              expanded={expandedId === c.id}
              menuOpen={menuId === c.id}
              busy={busyId === c.id}
              onToggle={() => setExpandedId(prev => (prev === c.id ? null : c.id))}
              onMenu={() => setMenuId(prev => (prev === c.id ? null : c.id))}
              onRemind={() => sendReminder(c)}
              onApplyExpiry={d => applyExpiry(c, d)}
              onChangePlan={(pack, isTrial) => writeCompany(c, { pack, isTrial }, { pack, isTrial })}
              onToggleTest={() => toggleTest(c)}
              onToggleSuspend={() => toggleSuspend(c)}
              onDelete={() => deleteCompany(c)}
            />
          ))}

          <Pager page={page} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage}
            note={sortKey === 'expiry_asc' ? 'sorted by soonest expiry' : undefined} />
        </Card>
      </div>
    </PageShell>
  );
};

// ─── Row ──────────────────────────────────────────────────
interface CompanyRowProps {
  company: AdminCompany;
  orders: PaidOrder[];
  expanded: boolean;
  menuOpen: boolean;
  busy: boolean;
  onToggle: () => void;
  onMenu: () => void;
  onRemind: () => void;
  onApplyExpiry: (d: Date) => Promise<boolean>;
  onChangePlan: (pack: string, isTrial: boolean) => Promise<boolean>;
  onToggleTest: () => void;
  onToggleSuspend: () => void;
  onDelete: () => void;
}

const CompanyRow: React.FC<CompanyRowProps> = ({
  company: c, orders, expanded, menuOpen, busy,
  onToggle, onMenu, onRemind, onApplyExpiry, onChangePlan, onToggleTest, onToggleSuspend, onDelete,
}) => {
  const status = companyStatus(c);
  const rel = relativeExpiry(c);
  const suspended = c.validity !== 'active';
  const lastOrder = orders[0];

  return (
    <div className={`border-b border-gray-100 ${expanded ? 'bg-blue-50/30' : ''}`}>
      <div className="grid grid-cols-[32px_minmax(0,1fr)] md:grid-cols-[40px_minmax(0,2.2fr)_1fr_1fr_1.2fr_1fr_auto] gap-x-3 gap-y-2 px-4 py-3 items-center">
        <button onClick={onToggle} aria-label={expanded ? 'Collapse' : 'Expand'}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-200 bg-white hover:bg-gray-50">
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{c.name}</span>
            {c.isTestAccount && <Chip cls="bg-gray-200 text-gray-700">TEST</Chip>}
            {looksLikeTest(c) && <Chip cls="bg-gray-100 text-gray-600">TEST?</Chip>}
            {suspended && <Chip cls="bg-red-50 text-red-700 border border-red-200">SUSPENDED</Chip>}
          </div>
          <p className="text-xs text-gray-500 truncate">
            <span className="font-mono">{c.id}</span>
            {c.ownerName && ` · ${c.ownerName}`}
            {c.phone && ` · ${c.phone}`}
          </p>
        </div>

        <div className="col-start-2 md:col-start-auto flex md:block items-center gap-2 text-sm">
          <span className="font-medium text-gray-900">{planLabel(c.pack)}</span>
          {c.isTrial && <span className="md:block text-xs text-blue-600 font-semibold">Trial</span>}
        </div>
        <div className="col-start-2 md:col-start-auto">
          <Chip cls={COMPANY_STATUS_META[status].cls}>{COMPANY_STATUS_META[status].label}</Chip>
        </div>
        <div className="col-start-2 md:col-start-auto text-sm">
          <p className="font-medium text-gray-900">{fmtDate(c.expiry)}</p>
          <p className={`text-xs font-semibold ${rel.cls}`}>{rel.text}</p>
        </div>
        <div className="hidden md:block text-sm text-gray-600">
          {lastOrder ? <>{fmtDate(lastOrder.paidAt)}<p className="text-xs text-gray-500">{fmtMoney(lastOrder.finalAmount)}</p></> : <span className="text-gray-400">none</span>}
        </div>

        <div className="col-start-2 md:col-start-auto flex items-center gap-2 md:justify-end md:w-[190px]">
          {status === 'check_date' ? (
            <Btn size="sm" onClick={() => { if (!expanded) onToggle(); }}>Fix date</Btn>
          ) : (
            <>
              <Btn size="sm" variant="green" onClick={onRemind} disabled={busy}>{status === 'expired' ? 'Win back' : 'Remind'}</Btn>
              <Btn size="sm" onClick={() => { if (!expanded) onToggle(); }}>Extend</Btn>
            </>
          )}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button onClick={onMenu} aria-label="More actions"
              className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-lg bg-white hover:bg-gray-50">
              <MoreHorizontal className="w-4 h-4 text-gray-600" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-9 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
                <MenuItem onClick={() => { onMenu(); onToggleTest(); }}>{c.isTestAccount ? 'Unmark as test' : 'Mark as test'}</MenuItem>
                <MenuItem onClick={() => { onMenu(); onToggleSuspend(); }}>{suspended ? 'Reactivate' : 'Suspend'}</MenuItem>
                <MenuItem danger onClick={() => { onMenu(); onDelete(); }}>Delete company & users</MenuItem>
              </div>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <ExpandedPanel company={c} orders={orders} busy={busy} onApplyExpiry={onApplyExpiry}
          onChangePlan={onChangePlan} onToggleTest={onToggleTest} onToggleSuspend={onToggleSuspend} />
      )}
    </div>
  );
};

const ExpandedPanel: React.FC<{
  company: AdminCompany;
  orders: PaidOrder[];
  busy: boolean;
  onApplyExpiry: (d: Date) => Promise<boolean>;
  onChangePlan: (pack: string, isTrial: boolean) => Promise<boolean>;
  onToggleTest: () => void;
  onToggleSuspend: () => void;
}> = ({ company: c, orders, busy, onApplyExpiry, onChangePlan, onToggleTest, onToggleSuspend }) => {
  const [months, setMonths] = useState(3);
  const [exactDate, setExactDate] = useState('');
  const [editingPlan, setEditingPlan] = useState(false);
  const [showPayments, setShowPayments] = useState(false);
  const [planDraft, setPlanDraft] = useState(c.pack || PLANS.ENTERPRISE);
  const [trialDraft, setTrialDraft] = useState(c.isTrial);

  const newExpiry = exactDate
    ? (() => { const d = new Date(exactDate); d.setHours(23, 59, 59, 0); return d; })()
    : addMonths(extensionBase(c.expiry), months);
  const lapsed = !c.expiry || c.expiry < new Date();
  const couponsUsed = Array.from(new Set(orders.map(o => o.couponCode).filter(Boolean)));

  return (
    <div className="px-4 pb-4 md:pl-[68px]">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <InfoCard title="Owner & contact">
          <p className="font-semibold text-gray-900">{c.ownerName || 'Unknown owner'}</p>
          <p>{c.phone ? <a href={`tel:${c.phone}`} className="text-blue-600">{c.phone}</a> : 'No phone'}</p>
          <p className="truncate">{c.email ? <a href={`mailto:${c.email}`} className="text-blue-600">{c.email}</a> : 'No email'}</p>
        </InfoCard>
        <InfoCard title="Subscription">
          <p className="font-semibold text-gray-900">
            {planLabel(c.pack)}{c.isTrial ? ' · Trial' : PLAN_PRICE_YEARLY[c.pack] ? ` · ${fmtMoney(PLAN_PRICE_YEARLY[c.pack])}/yr` : ''}
          </p>
          <p>Customer since {fmtDate(c.createdAt)}</p>
          <p>Status: {c.validity === 'active' ? 'Active' : 'Suspended'}</p>
          <p>Coupon used: {couponsUsed.length ? couponsUsed.join(', ') : 'none'}</p>
        </InfoCard>
        <InfoCard title="Payments">
          <p className="font-semibold text-gray-900">{orders.length} paid order{orders.length === 1 ? '' : 's'}</p>
          <p>{orders[0] ? `Last: ${fmtDate(orders[0].paidAt)} · ${fmtMoney(orders[0].finalAmount)}` : 'No online payment on record'}</p>
          <p>Lifetime: {fmtMoney(orders.reduce((s, o) => s + o.finalAmount, 0))}</p>
          {orders.length > 0 && (
            <button onClick={() => setShowPayments(v => !v)} className="text-blue-600 font-semibold">
              {showPayments ? 'Hide' : 'Payment history →'}
            </button>
          )}
        </InfoCard>
        <InfoCard title="Source & reminders">
          <p className="font-semibold text-gray-900">{c.referralCode ? `Referred · ${c.referralCode}` : 'No referral'}</p>
          {c.referralType && <p>Referrer type: {c.referralType}</p>}
          <p>Referral credits: {c.referralCredits} months</p>
          <p>Last reminder: {c.lastRenewalReminderAt ? fmtDate(c.lastRenewalReminderAt) : 'never'}</p>
        </InfoCard>
      </div>

      {showPayments && (
        <div className="mb-4 bg-white border border-gray-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
              <tr><th className="text-left p-2.5">Paid on</th><th className="text-left p-2.5">Plan</th><th className="text-right p-2.5">List</th>
                <th className="text-right p-2.5">Discount</th><th className="text-right p-2.5">GST</th><th className="text-right p-2.5">Paid</th><th className="text-left p-2.5">Coupon</th></tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="p-2.5">{fmtDate(o.paidAt)}</td><td className="p-2.5">{planLabel(o.planId)}</td>
                  <td className="p-2.5 text-right">{fmtMoney(o.baseAmount)}</td><td className="p-2.5 text-right">{o.discountAmount ? `−${fmtMoney(o.discountAmount)}` : '—'}</td>
                  <td className="p-2.5 text-right">{fmtMoney(o.taxAmount)}</td><td className="p-2.5 text-right font-semibold">{fmtMoney(o.finalAmount)}</td>
                  <td className="p-2.5 font-mono text-xs">{o.couponCode || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Extend by</span>
          <div className="flex border border-gray-300 rounded-lg overflow-hidden bg-white">
            {EXTEND_OPTIONS.map(m => (
              <button key={m} onClick={() => { setMonths(m); setExactDate(''); }}
                className={`px-3 py-1.5 text-sm font-semibold ${!exactDate && months === m ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>
                {m} M
              </button>
            ))}
          </div>
          <span className="text-sm text-gray-500">or</span>
          <input type="date" value={exactDate} onChange={e => setExactDate(e.target.value)} aria-label="Set exact expiry date"
            className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white" />
          <span className="text-sm text-gray-600">
            New expiry: <b className="text-gray-900">{fmtDate(newExpiry)}</b>
            {!exactDate && lapsed && <span className="text-xs text-gray-500"> (from today)</span>}
          </span>
          <Btn variant="primary" disabled={busy} onClick={async () => { if (await onApplyExpiry(newExpiry)) setExactDate(''); }}>
            Apply extension
          </Btn>
        </div>

        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => setEditingPlan(v => !v)}>Change plan</Btn>
          <Btn onClick={onToggleTest}>{c.isTestAccount ? 'Unmark test' : 'Mark as test'}</Btn>
          <Btn variant={c.validity === 'active' ? 'danger' : 'green'} onClick={onToggleSuspend}>
            {c.validity === 'active' ? 'Suspend' : 'Reactivate'}
          </Btn>
        </div>
      </div>

      {editingPlan && (
        <div className="mt-3 flex flex-wrap items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
          <select value={planDraft} onChange={e => setPlanDraft(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2">
            {Object.values(PLANS).map(p => <option key={p} value={p}>{PLAN_META[p].label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={trialDraft} onChange={e => setTrialDraft(e.target.checked)} />
            Trial
          </label>
          <Btn variant="primary" disabled={busy} onClick={async () => { if (await onChangePlan(planDraft, trialDraft)) setEditingPlan(false); }}>
            Save plan
          </Btn>
          <Btn variant="ghost" onClick={() => setEditingPlan(false)}>Cancel</Btn>
        </div>
      )}
    </div>
  );
};

const InfoCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-600 space-y-1 min-w-0">
    <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{title}</p>
    {children}
  </div>
);

const MenuItem: React.FC<{ onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ onClick, danger, children }) => (
  <button onClick={onClick} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${danger ? 'text-red-600' : 'text-gray-700'}`}>
    {children}
  </button>
);

export default SuperAdminCompanies;
