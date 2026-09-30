import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, getDocs, increment, orderBy, query, serverTimestamp, Timestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { Pencil, X } from 'lucide-react';
import { db } from '../../lib/Firebase';
import { ROUTES } from '../../constants/routes.constants';
import Loading from '../Loading/Loading';
import { MAX_EXPIRY_YEARS_AHEAD } from './superAdminExpiryGuard';
import type { AdminCompany, RangeKey } from './superAdmin/data';
import {
  addMonths, companyStatus, daysUntil, extensionBase, fmtDate, fmtMoney, inRange, invalidateAdminCache,
  isPaying, loadCompanies, rangeFor, toDate,
} from './superAdmin/data';
import { Btn, Card, CardTitle, Chip, EmptyRow, Field, Pager, PageHeader, PageShell, RangeTabs, SearchBox, SelectBox, StatCard, inputCls } from './superAdmin/ui';

interface Agent {
  id: string;
  name: string;
  phoneNumber: string;
  role: string;
  tier: string;
  city: string;
  ownReferralCode: string;
  totalEarned: number;
  unpaidBalance: number;
  upiId: string;
}

interface PayoutRequest {
  id: string;
  agentId: string;
  agentName: string;
  amount: number;
  upiId: string;
  status: string;
  date: Date;
}

interface CreditRecord {
  id: string;
  referrerName: string;
  referredCompanyName: string;
  type: 'Earned' | 'Claimed';
  date: Date;
}

type Tab = 'users' | 'partners' | 'payouts';
const PAGE_SIZE = 25;
const CREDIT_OPTIONS = [1, 2, 3, 6, 12];

const SuperAdminDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [ledger, setLedger] = useState<CreditRecord[]>([]);

  const [rangeKey, setRangeKey] = useState<RangeKey>('all');
  const [tab, setTab] = useState<Tab>('users');
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'any' | 'credits' | 'active' | 'expired' | 'check'>('any');
  const [page, setPage] = useState(0);

  const [monthsById, setMonthsById] = useState<Record<string, number>>({});
  const [preview, setPreview] = useState<{ company: AdminCompany; months: number } | null>(null);
  const [savingCredit, setSavingCredit] = useState(false);
  const [settling, setSettling] = useState<PayoutRequest | null>(null);
  const [editingCredits, setEditingCredits] = useState<AdminCompany | null>(null);

  useEffect(() => {
    Promise.all([
      getDocs(collection(db, 'agents')),
      getDocs(query(collection(db, 'payoutRequests'), orderBy('date', 'desc'))),
      loadCompanies(true),
      getDocs(query(collection(db, 'creditLedger'), orderBy('date', 'desc'))),
    ]).then(([a, p, c, l]) => {
      setAgents(a.docs.map(d => {
        const x = d.data();
        return {
          id: d.id, name: x.name || 'Unknown', phoneNumber: x.phoneNumber || '', role: x.role || 'agent',
          tier: x.tier || 'Bronze', city: x.city || '', ownReferralCode: x.ownReferralCode || '',
          totalEarned: x.totalEarned || 0, unpaidBalance: x.unpaidBalance || 0, upiId: x.upiId || '',
        };
      }));
      setPayouts(p.docs.map(d => {
        const x = d.data();
        return { id: d.id, agentId: x.agentId, agentName: x.agentName || 'Unknown', amount: Number(x.amount) || 0, upiId: x.upiId || 'No UPI', status: x.status || 'pending', date: toDate(x.date) || new Date() };
      }));
      setCompanies(c);
      setLedger(l.docs.map(d => {
        const x = d.data();
        return { id: d.id, referrerName: x.referrerName || 'Admin', referredCompanyName: x.referredCompanyName || 'System Credit', type: x.type || 'Earned', date: toDate(x.date) || new Date() };
      }));
    }).catch(err => {
      console.error('Error fetching partner data:', err);
      alert('Failed to load partner data.');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPage(0); }, [tab, search, partnerFilter, statusFilter]);

  const range = useMemo(() => rangeFor(rangeKey), [rangeKey]);
  const agentById = useMemo(() => new Map(agents.map(a => [a.id, a])), [agents]);
  const companyById = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);

  const referrerName = (c: AdminCompany) => {
    if (!c.referrerId) return null;
    return agentById.get(c.referrerId)?.name || companyById.get(c.referrerId)?.name || c.referralCode || 'Unknown';
  };

  const referred = useMemo(() => companies.filter(c => c.referrerId && !c.isTestAccount), [companies]);

  const leaderboard = useMemo(() => agents.map(a => {
    const mine = referred.filter(c => c.referrerId === a.id && (rangeKey === 'all' || inRange(c.createdAt, range)));
    const paid = mine.filter(c => !c.isTrial).length;
    return { agent: a, signups: mine.length, paid, conv: mine.length ? paid / mine.length : 0 };
  }).sort((x, y) => y.paid - x.paid || y.signups - x.signups || y.agent.totalEarned - x.agent.totalEarned), [agents, referred, range, rangeKey]);

  const stats = useMemo(() => {
    const byAgent = referred.filter(c => c.referrerId && agentById.has(c.referrerId));
    const paidConv = byAgent.filter(c => !c.isTrial).length;
    const pending = payouts.filter(p => p.status === 'pending');
    return {
      partners: agents.length,
      activePartners: leaderboard.filter(r => r.signups > 0).length,
      referred: referred.length,
      paidConv,
      convRate: byAgent.length ? Math.round((paidConv / byAgent.length) * 100) : 0,
      payoutsDue: pending.reduce((s, p) => s + p.amount, 0),
      pendingCount: pending.length,
      paidOut: agents.reduce((s, a) => s + Math.max(0, a.totalEarned - a.unpaidBalance), 0),
      creditUsers: companies.filter(c => c.referralCredits > 0),
    };
  }, [agents, referred, payouts, companies, leaderboard, agentById]);

  const userRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter(c => {
      if (partnerFilter === 'none' && c.referrerId) return false;
      if (partnerFilter !== 'all' && partnerFilter !== 'none' && c.referrerId !== partnerFilter) return false;
      const st = companyStatus(c);
      if (statusFilter === 'credits' && c.referralCredits <= 0) return false;
      if (statusFilter === 'active' && !['active', 'expiring'].includes(st)) return false;
      if (statusFilter === 'expired' && st !== 'expired') return false;
      if (statusFilter === 'check' && st !== 'check_date') return false;
      if (q && ![c.name, c.phone, c.id, referrerName(c) || ''].some(x => x.toLowerCase().includes(q))) return false;
      return true;
    }).sort((a, b) => {
      // Problems first, then unclaimed credits, then soonest expiry.
      const r = (c: AdminCompany) => (companyStatus(c) === 'check_date' ? 0 : c.referralCredits > 0 ? 1 : 2);
      return r(a) - r(b) || b.referralCredits - a.referralCredits || (a.expiry?.getTime() ?? 0) - (b.expiry?.getTime() ?? 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, search, partnerFilter, statusFilter, agentById]);

  const pageCount = Math.max(1, Math.ceil(userRows.length / PAGE_SIZE));
  const pageRows = userRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // ── Actions ────────────────────────────────────────────
  const confirmCredit = async () => {
    if (!preview) return;
    const { company: c, months } = preview;
    const newExpiry = addMonths(extensionBase(c.expiry), months);
    const newCredits = Math.max(0, c.referralCredits - months);
    setSavingCredit(true);
    try {
      const batch = writeBatch(db);
      const ledgerRef = doc(collection(db, 'creditLedger'));
      batch.update(doc(db, 'companies', c.id), { expiryDate: Timestamp.fromDate(newExpiry), referralCredits: newCredits, validity: 'active' });
      batch.set(ledgerRef, {
        referrerId: c.id, referrerName: c.name,
        referredCompanyName: `${months} Month(s) Extension Applied`,
        type: 'Claimed', date: serverTimestamp(),
      });
      await batch.commit();
      invalidateAdminCache('companies');
      setCompanies(prev => prev.map(x => x.id === c.id ? { ...x, expiry: newExpiry, referralCredits: newCredits, validity: 'active' } : x));
      setLedger(prev => [{ id: ledgerRef.id, referrerName: c.name, referredCompanyName: `${months} Month(s) Extension Applied`, type: 'Claimed', date: new Date() }, ...prev]);
      setPreview(null);
    } catch (err) {
      console.error('Error adding credit:', err);
      alert('Failed to add credit.');
    } finally {
      setSavingCredit(false);
    }
  };

  const saveCredits = async (c: AdminCompany, n: number) => {
    try {
      await updateDoc(doc(db, 'companies', c.id), { referralCredits: n });
      invalidateAdminCache('companies');
      setCompanies(prev => prev.map(x => x.id === c.id ? { ...x, referralCredits: n } : x));
      setEditingCredits(null);
    } catch (err) {
      console.error(err);
      alert('Failed to update credits.');
    }
  };

  const changeTier = async (a: Agent, tier: string) => {
    try {
      await updateDoc(doc(db, 'agents', a.id), { tier });
      setAgents(prev => prev.map(x => x.id === a.id ? { ...x, tier } : x));
    } catch (err) {
      console.error(err);
      alert('Failed to update tier.');
    }
  };

  const settle = async (req: PayoutRequest, amount: number) => {
    if (isNaN(amount) || amount <= 0) return alert('Enter an amount greater than 0.');
    if (amount > req.amount) return alert(`You cannot settle more than the requested ₹${req.amount}.`);
    const full = amount === req.amount;
    try {
      const batch = writeBatch(db);
      const reqRef = doc(db, 'payoutRequests', req.id);
      const agentRef = doc(db, 'agents', req.agentId);
      if (full) {
        batch.update(reqRef, { status: 'paid' });
        batch.update(agentRef, { unpaidBalance: increment(-amount), hasPendingRequest: false });
        const comm = await getDocs(query(collection(db, 'commissions'), where('agentId', '==', req.agentId), where('status', '==', 'pending')));
        comm.forEach(c => batch.update(c.ref, { status: 'paid' }));
      } else {
        batch.update(reqRef, { amount: increment(-amount) });
        batch.update(agentRef, { unpaidBalance: increment(-amount) });
      }
      await batch.commit();
      setPayouts(prev => prev.map(r => r.id === req.id ? (full ? { ...r, status: 'paid' } : { ...r, amount: r.amount - amount }) : r));
      setAgents(prev => prev.map(a => a.id === req.agentId ? { ...a, unpaidBalance: Math.max(0, a.unpaidBalance - amount) } : a));
      setSettling(null);
    } catch (err) {
      console.error('Error settling payout:', err);
      alert('Failed to process settlement.');
    }
  };

  if (loading) return <Loading />;

  const previewExpiry = preview ? addMonths(extensionBase(preview.company.expiry), preview.months) : null;
  const previewTooFar = previewExpiry ? (daysUntil(previewExpiry) ?? 0) > 365 * MAX_EXPIRY_YEARS_AHEAD : false;
  const firstCredit = stats.creditUsers[0];

  return (
    <PageShell>
      <PageHeader
        title="Agents & Partners"
        subtitle="Who brings in customers, what they earn, and credits you owe"
        actions={<RangeTabs value={rangeKey} options={['30d', '90d', 'year', 'all']} onChange={setRangeKey} />}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        <StatCard dot="bg-blue-600" label="Partners" value={stats.partners} sub={`${stats.activePartners} with signups ${rangeKey === 'all' ? 'ever' : 'this period'}`} />
        <StatCard dot="bg-violet-600" label="Referred users" value={stats.referred} sub="across partners & users" />
        <StatCard dot="bg-green-600" label="Paid conversions" value={stats.paidConv} sub={`${stats.convRate}% of partner referrals`} />
        <StatCard dot="bg-amber-500" label="Payouts due" value={fmtMoney(stats.payoutsDue)} sub={stats.pendingCount ? `${stats.pendingCount} request${stats.pendingCount === 1 ? '' : 's'}` : 'nothing pending'}
          onClick={() => setTab('payouts')} active={tab === 'payouts'} />
        <StatCard dot="bg-gray-500" label="Paid out" value={fmtMoney(stats.paidOut)} sub="lifetime" />
        <StatCard dot="bg-violet-600" label="Unclaimed credits" value={`${stats.creditUsers.length} user${stats.creditUsers.length === 1 ? '' : 's'}`}
          sub={firstCredit ? `${firstCredit.name} · ${firstCredit.referralCredits} months` : 'none'}
          onClick={() => { setTab('users'); setStatusFilter('credits'); }} active={tab === 'users' && statusFilter === 'credits'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 mb-6">
        <Card className="p-5">
          <CardTitle title="Partner leaderboard" right={<span className="text-xs text-gray-500">Ranked by paid conversions</span>} />
          {leaderboard.length === 0 ? <p className="text-sm text-gray-500">No partners yet.</p> : leaderboard.slice(0, 5).map((r, i) => (
            <div key={r.agent.id} className="grid grid-cols-[28px_1fr_auto] sm:grid-cols-[28px_1.4fr_repeat(4,auto)] items-center gap-3 py-2.5 border-t border-gray-100 first:border-0 text-sm">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700'}`}>{i + 1}</span>
              <div className="min-w-0"><p className="font-semibold text-gray-900 truncate">{r.agent.name}</p><p className="text-xs text-gray-500 truncate">{r.agent.role} · {r.agent.tier}{r.agent.city ? ` · ${r.agent.city}` : ''}</p></div>
              <span className="hidden sm:inline font-semibold">{r.signups} signups</span>
              <span className="hidden sm:inline font-semibold">{r.paid} paid</span>
              <span className="hidden sm:inline font-semibold text-green-700">{Math.round(r.conv * 100)}% conv.</span>
              <span className="font-semibold text-right">{fmtMoney(r.agent.totalEarned)}</span>
            </div>
          ))}
        </Card>

        <Card className="p-5">
          <CardTitle title="Credit preview" />
          <p className="text-sm text-gray-600 mb-3">Shown before any credit is added, so a typo can't push an expiry to 2052 again.</p>
          {preview && previewExpiry ? (
            <>
              <dl className="bg-gray-50 rounded-lg p-3 text-sm space-y-2">
                <div className="flex justify-between"><dt className="text-gray-600">Company</dt><dd className="font-semibold">{preview.company.name}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-600">Current expiry</dt><dd className="font-semibold">{fmtDate(preview.company.expiry)}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-600">Adding</dt><dd className="font-semibold">+{preview.months} month{preview.months === 1 ? '' : 's'}</dd></div>
                <div className="flex justify-between"><dt className="text-gray-600">Credits left after</dt><dd className="font-semibold">{Math.max(0, preview.company.referralCredits - preview.months)}</dd></div>
                <div className="flex justify-between border-t border-gray-200 pt-2"><dt className="text-gray-600">New expiry</dt>
                  <dd className={`font-semibold ${previewTooFar ? 'text-red-600' : 'text-green-700'}`}>{fmtDate(previewExpiry)}</dd></div>
              </dl>
              {(!preview.company.expiry || preview.company.expiry < new Date()) && <p className="text-xs text-gray-500 mt-2">Plan has lapsed, so the credit starts from today.</p>}
              {previewTooFar && (
                <p className="mt-3 text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2">
                  New expiry is more than {MAX_EXPIRY_YEARS_AHEAD} years away. Check the current expiry first.
                </p>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <Btn onClick={() => setPreview(null)}>Cancel</Btn>
                <Btn variant="primary" disabled={savingCredit || previewTooFar} onClick={confirmCredit}>{savingCredit ? 'Saving…' : 'Confirm credit'}</Btn>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-4 text-center">Click <b>Add credit</b> on a row below to preview it here.</p>
          )}
        </Card>
      </div>

      <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
        {([['users', 'User referrals', companies.length], ['partners', 'Partners', agents.length], ['payouts', 'Payout requests', stats.pendingCount]] as [Tab, string, number][]).map(([k, label, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap ${tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
            {label} <span className="ml-1 text-xs text-gray-500">{n}</span>
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <>
          <Card className="mb-6">
            <div className="p-4 flex flex-col lg:flex-row gap-3 lg:items-center border-b border-gray-200">
              <SearchBox className="flex-1" value={search} onChange={setSearch} placeholder="Search business, phone or partner…" />
              <div className="grid grid-cols-2 sm:flex gap-2">
                <SelectBox label="Partner" value={partnerFilter} onChange={setPartnerFilter}>
                  <option value="all">All</option>
                  <option value="none">Not referred</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </SelectBox>
                <SelectBox label="Status" value={statusFilter} onChange={v => setStatusFilter(v as any)}>
                  <option value="any">Any</option>
                  <option value="credits">Has unclaimed credits</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="check">Expiry looks wrong</option>
                </SelectBox>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <tr><th className="text-left px-4 py-2.5">Business</th><th className="text-left py-2.5">Referred by</th><th className="text-left py-2.5">Signed up</th>
                    <th className="text-left py-2.5">Current expiry</th><th className="text-left py-2.5">Credits</th><th className="text-right px-4 py-2.5">Action</th></tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? <tr><td colSpan={6}><EmptyRow>No users match.</EmptyRow></td></tr> : pageRows.map(c => {
                    const st = companyStatus(c);
                    const d = daysUntil(c.expiry);
                    const months = monthsById[c.id] ?? 1;
                    return (
                      <tr key={c.id} className={`border-b border-gray-100 ${preview?.company.id === c.id ? 'bg-blue-50/50' : st === 'check_date' ? 'bg-purple-50/40' : ''}`}>
                        <td className="px-4 py-3"><p className="font-semibold text-gray-900">{c.name}</p><p className="text-xs text-gray-500">{c.phone || 'N/A'}</p></td>
                        <td className="py-3 text-gray-700">{referrerName(c) || <span className="text-gray-400">—</span>}</td>
                        <td className="py-3 text-gray-700">{fmtDate(c.createdAt)}</td>
                        <td className="py-3">
                          <p className="font-semibold text-gray-900">{fmtDate(c.expiry)}</p>
                          {st === 'check_date' ? <p className="text-xs font-semibold text-purple-600">looks wrong — check</p>
                            : st === 'expired' ? <p className="text-xs font-semibold text-red-600">expired {d !== null ? `${Math.abs(d)} days ago` : ''}</p>
                              : <p className="text-xs text-green-700">{isPaying(c) ? 'paid' : c.isTrial ? 'trial' : 'active'} · {d} days left</p>}
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            {c.referralCredits > 0 ? <Chip cls="bg-violet-100 text-violet-700">{c.referralCredits} MONTH{c.referralCredits === 1 ? '' : 'S'} · UNCLAIMED</Chip> : <span className="text-gray-500">None</span>}
                            <button onClick={() => setEditingCredits(c)} className="p-1 text-gray-400 hover:text-violet-600" aria-label="Edit credit balance"><Pencil className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {st === 'check_date' && (
                              <Link to={`${ROUTES.SUPER_ADMIN}?q=${encodeURIComponent(c.id)}&open=${c.id}`}
                                className="px-3 py-1.5 text-sm font-semibold rounded-lg border border-red-300 text-red-700 hover:bg-red-50 whitespace-nowrap">Fix expiry</Link>
                            )}
                            <select value={months} onChange={e => setMonthsById(p => ({ ...p, [c.id]: Number(e.target.value) }))}
                              className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white" aria-label="Months to add">
                              {CREDIT_OPTIONS.map(m => <option key={m} value={m}>+{m} month{m === 1 ? '' : 's'}</option>)}
                            </select>
                            <Btn size="sm" variant="primary" disabled={st === 'check_date'} title={st === 'check_date' ? 'Fix the expiry first' : undefined}
                              onClick={() => { setPreview({ company: c, months }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Add credit</Btn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={page} pageCount={pageCount} total={userRows.length} pageSize={PAGE_SIZE} onPage={setPage} />
          </Card>

          <Card>
            <div className="p-4 border-b border-gray-200"><h3 className="font-medium text-gray-900">Credit history</h3></div>
            {ledger.length === 0 ? <EmptyRow>No referral history yet.</EmptyRow> : (
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {ledger.slice(0, 100).map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{r.referrerName}</p>
                      <p className="text-xs text-gray-600 truncate">{r.type === 'Earned' ? <>Referred <b>{r.referredCompanyName}</b></> : r.referredCompanyName} · {fmtDate(r.date)}</p>
                    </div>
                    {r.type === 'Earned' ? <Chip cls="bg-green-100 text-green-700">+1 EARNED</Chip> : <Chip cls="bg-violet-100 text-violet-700">CLAIMED</Chip>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'partners' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <tr><th className="text-left px-4 py-2.5">Partner</th><th className="text-left py-2.5">Role & code</th><th className="text-left py-2.5">Tier</th>
                  <th className="text-right py-2.5">Signups</th><th className="text-right py-2.5">Paid</th><th className="text-right py-2.5">Lifetime earned</th><th className="text-right px-4 py-2.5">Unpaid</th></tr>
              </thead>
              <tbody>
                {agents.length === 0 ? <tr><td colSpan={7}><EmptyRow>No partners yet.</EmptyRow></td></tr> : leaderboard.map(({ agent: a, signups, paid }) => (
                  <tr key={a.id} className="border-b border-gray-100">
                    <td className="px-4 py-3"><p className="font-semibold text-gray-900">{a.name}</p><p className="text-xs text-gray-500">{a.phoneNumber}{a.upiId ? ` · UPI ${a.upiId}` : ''}</p></td>
                    <td className="py-3"><Chip cls="bg-blue-50 text-blue-700">{a.role.toUpperCase()}</Chip><p className="font-mono text-xs text-gray-500 mt-1">{a.ownReferralCode || '—'}</p></td>
                    <td className="py-3">
                      <select value={a.tier} onChange={e => changeTier(a, e.target.value)} className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 bg-white">
                        {['Bronze', 'Silver', 'Gold', 'Platinum'].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td className="py-3 text-right font-semibold">{signups}</td>
                    <td className="py-3 text-right font-semibold">{paid}</td>
                    <td className="py-3 text-right font-semibold">{fmtMoney(a.totalEarned)}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${a.unpaidBalance > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{fmtMoney(a.unpaidBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'payouts' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
                <tr><th className="text-left px-4 py-2.5">Requested</th><th className="text-left py-2.5">Partner</th><th className="text-left py-2.5">Pay to</th>
                  <th className="text-right py-2.5">Amount</th><th className="text-right px-4 py-2.5">Action</th></tr>
              </thead>
              <tbody>
                {payouts.length === 0 ? <tr><td colSpan={5}><EmptyRow>No payout requests.</EmptyRow></td></tr> : payouts.map(r => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="px-4 py-3">{fmtDate(r.date)}</td>
                    <td className="py-3 font-semibold text-gray-900">{r.agentName}</td>
                    <td className="py-3"><Chip cls="bg-blue-50 text-blue-700">UPI: {r.upiId}</Chip></td>
                    <td className="py-3 text-right font-semibold text-base">{fmtMoney(r.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      {r.status === 'pending' ? <Btn size="sm" variant="primary" onClick={() => setSettling(r)}>Settle</Btn> : <Chip cls="bg-green-100 text-green-700">SETTLED</Chip>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {settling && <AmountModal title="Settle payout" lines={[['Partner', settling.agentName], ['Requested', fmtMoney(settling.amount)]]}
        label="Settlement amount (₹)" initial={settling.amount} confirmLabel="Confirm"
        onClose={() => setSettling(null)} onSubmit={n => settle(settling, n)} />}
      {editingCredits && <AmountModal title="Edit credit balance" lines={[['Business', editingCredits.name], ['Current credits', `${editingCredits.referralCredits} months`]]}
        label="New credit balance (months)" initial={editingCredits.referralCredits} confirmLabel="Save" min={0}
        onClose={() => setEditingCredits(null)} onSubmit={n => saveCredits(editingCredits, n)} />}
    </PageShell>
  );
};

const AmountModal: React.FC<{
  title: string;
  lines: [string, string][];
  label: string;
  initial: number;
  confirmLabel: string;
  min?: number;
  onClose: () => void;
  onSubmit: (n: number) => Promise<void> | void;
}> = ({ title, lines, label, initial, confirmLabel, min = 1, onClose, onSubmit }) => {
  const [value, setValue] = useState(String(initial));
  const [busy, setBusy] = useState(false);
  const n = Number(value);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <dl className="bg-gray-50 rounded-lg p-3 text-sm space-y-1 mb-4">
          {lines.map(([k, v]) => <div key={k} className="flex justify-between"><dt className="text-gray-600">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
        </dl>
        <Field label={label}>
          <input type="number" min={min} value={value} onChange={e => setValue(e.target.value)} className={inputCls} />
        </Field>
        <div className="flex justify-end gap-2 mt-4">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" disabled={busy || value === '' || isNaN(n) || n < min}
            onClick={async () => { setBusy(true); await onSubmit(n); setBusy(false); }}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
