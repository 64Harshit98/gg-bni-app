import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AlertTriangle, Gift } from 'lucide-react';
import { db } from '../../lib/Firebase';
import { ROUTES } from '../../constants/routes.constants';
import Loading from '../Loading/Loading';
import type { AdminCompany, AdminCoupon, AdminLead, AdminTicket, DateRange, PaidOrder, RangeKey } from './superAdmin/data';
import {
  DAY_MS, ageText, buildLeads, buildTickets, companyStatus, couponHighRisk, daysUntil, estimateMrr,
  fmtDate, fmtMoney, inRange, invalidateAdminCache, loadCompanies, loadPaidOrders, looksLikeTest, previousRange,
  rangeFor, toCoupon, toDate, ticketHasContact,
} from './superAdmin/data';
import { Btn, Card, CardTitle, Chip, PageHeader, PageShell, RangeTabs, SearchBox, StatCard } from './superAdmin/ui';
import { MAX_EXPIRY_YEARS_AHEAD } from './superAdminExpiryGuard';

interface Agent { id: string; name: string; role: string }
interface Payout { amount: number; status: string }
interface WebQuery { status: string; submittedAt: Date | null }

const Link2: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="text-sm font-semibold text-blue-600 hover:underline whitespace-nowrap">{children} →</Link>
);

const SuperAdminHub: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [rawLeads, setRawLeads] = useState<any[]>([]);
  const [queries, setQueries] = useState<WebQuery[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);

  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [hideTest, setHideTest] = useState(true);
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    const since = new Date(Date.now() - 400 * DAY_MS);
    Promise.all([
      loadCompanies(true),
      loadPaidOrders(true),
      getDocs(collection(db, 'support_tickets')),
      getDocs(collection(db, 'coupons')),
      getDocs(collection(db, 'leads')),
      getDocs(query(collection(db, 'contacts'), where('submittedAt', '>=', since))),
      getDocs(collection(db, 'agents')),
      getDocs(collection(db, 'payoutRequests')),
    ]).then(([c, o, t, cp, l, q, a, p]) => {
      setCompanies(c);
      setOrders(o);
      setTickets(buildTickets(t.docs.map(d => ({ id: d.id, data: d.data() }))));
      setCoupons(cp.docs.map(d => toCoupon(d.data())));
      setRawLeads(l.docs.map(d => ({ id: d.id, ...d.data() })));
      setQueries(q.docs.map(d => ({ status: d.data().status || 'new', submittedAt: toDate(d.data().submittedAt) })));
      setAgents(a.docs.map(d => ({ id: d.id, name: d.data().name || 'Unknown', role: d.data().role || 'agent' })));
      setPayouts(p.docs.map(d => ({ amount: Number(d.data().amount) || 0, status: d.data().status || 'pending' })));
    }).catch(err => {
      console.error('Dashboard load failed:', err);
      alert('Some dashboard data failed to load. Check the console.');
    }).finally(() => setLoading(false));
  }, []);

  const range: DateRange = useMemo(() => rangeFor(rangeKey, custom), [rangeKey, custom]);
  const prev = useMemo(() => previousRange(range), [range]);

  const live = useMemo(() => companies.filter(c => !hideTest || !c.isTestAccount), [companies, hideTest]);
  const leads: AdminLead[] = useMemo(() => buildLeads(rawLeads, companies), [rawLeads, companies]);

  const k = useMemo(() => {
    const active = live.filter(c => ['active', 'expiring'].includes(companyStatus(c))).length;
    const expired = live.filter(c => companyStatus(c) === 'expired').length;
    const expiring = live.filter(c => companyStatus(c) === 'expiring')
      .sort((a, b) => (a.expiry?.getTime() ?? 0) - (b.expiry?.getTime() ?? 0));
    const within2 = live.filter(c => { const d = daysUntil(c.expiry); return d !== null && d >= 0 && d <= 2; }).length;
    const newInRange = live.filter(c => inRange(c.createdAt, range)).length;

    const mrr = estimateMrr(live, orders);
    const liveIds = new Set(live.map(c => c.id));
    const rev = (r: DateRange) => orders.filter(o => liveIds.has(o.companyId) && inRange(o.paidAt, r)).reduce((s, o) => s + o.finalAmount, 0);
    const revenue = rev(range);
    const revenuePrev = rev(prev);

    return { active, expired, expiring, within2, newInRange, mrr, revenue, revenuePrev };
  }, [live, orders, range, prev]);

  const renewals = useMemo(() => live
    .filter(c => { const d = daysUntil(c.expiry); return d !== null && d >= 0 && d <= 30; })
    .sort((a, b) => (a.expiry?.getTime() ?? 0) - (b.expiry?.getTime() ?? 0)), [live]);

  const support = useMemo(() => {
    const open = tickets.filter(t => t.status !== 'solved')
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
    const solved = tickets.filter(t => t.status === 'solved').length;
    const replied = tickets.filter(t => t.firstRepliedAt && t.createdAt);
    const avgReplyH = replied.length
      ? replied.reduce((s, t) => s + (t.firstRepliedAt!.getTime() - t.createdAt!.getTime()), 0) / replied.length / 3_600_000
      : null;
    return { open, solved, avgReplyH };
  }, [tickets]);

  const growth = useMemo(() => {
    const inR = leads.filter(l => inRange(l.lastUpdated, range));
    const registered = inR.filter(l => l.stage !== 'details').length;
    const paid = inR.filter(l => l.stage === 'paid').length;
    const q = queries.filter(x => inRange(x.submittedAt, range));
    return {
      started: inR.length, registered, paid,
      queries: q.length, converted: q.filter(x => x.status === 'converted').length,
    };
  }, [leads, queries, range]);

  const partners = useMemo(() => {
    const due = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
    const withCredits = companies.filter(c => c.referralCredits > 0).sort((a, b) => b.referralCredits - a.referralCredits);
    const agentIds = new Set(agents.map(a => a.id));
    const signups = new Map<string, number>();
    companies.filter(c => c.referrerId && agentIds.has(c.referrerId) && inRange(c.createdAt, range))
      .forEach(c => signups.set(c.referrerId!, (signups.get(c.referrerId!) || 0) + 1));
    const top = Array.from(signups.entries()).sort((a, b) => b[1] - a[1])[0];
    return { due, withCredits, top: top ? { agent: agents.find(a => a.id === top[0])!, n: top[1] } : null };
  }, [payouts, companies, agents, range]);

  const checks = useMemo(() => {
    const list: { tone: 'red' | 'amber'; title: string; text: string; to: string }[] = [];
    const refCounts = new Map<string, number>();
    tickets.forEach(t => t.customerRef && refCounts.set(t.customerRef, (refCounts.get(t.customerRef) || 0) + 1));
    const dupRefs = Array.from(refCounts.entries()).filter(([, n]) => n > 1);
    if (dupRefs.length) {
      const [ref, n] = dupRefs.sort((a, b) => b[1] - a[1])[0];
      list.push({ tone: 'red', title: `${n} tickets were told they're ${ref}.`, text: 'Shown renumbered by date on the tickets page.', to: ROUTES.SUPPORT_TICKET });
    }
    companies.filter(c => companyStatus(c) === 'check_date').forEach(c => list.push({
      tone: 'red', title: `${c.name} expires ${fmtDate(c.expiry)}.`,
      text: `More than ${MAX_EXPIRY_YEARS_AHEAD} years away — credit may have been added in years, not months.`,
      to: `${ROUTES.SUPER_ADMIN}?expires=suspicious`,
    }));
    const risky = coupons.filter(couponHighRisk);
    if (risky.length) list.push({
      tone: 'amber', title: `${risky.map(c => c.code).join(' and ')} ${risky.length === 1 ? 'is' : 'are'} ~100% off,`,
      text: 'unlimited uses, never expire.', to: ROUTES.SUPER_ADMIN_COUPONS,
    });
    const noPhone = companies.filter(c => !c.isTestAccount && !c.phone).length;
    if (noPhone) list.push({ tone: 'amber', title: `${noPhone} companies have no owner phone.`, text: 'Reminders can’t reach them.', to: ROUTES.SUPER_ADMIN });
    const noContact = tickets.filter(t => t.status !== 'solved' && !ticketHasContact(t)).length;
    if (noContact) list.push({ tone: 'amber', title: `${noContact} open ticket${noContact === 1 ? ' has' : 's have'} no phone or email.`, text: 'Match them to a company by name.', to: ROUTES.SUPPORT_TICKET });
    const suspected = companies.filter(looksLikeTest).length;
    if (suspected) list.push({ tone: 'amber', title: `${suspected} companies look like test accounts.`, text: 'Mark them so they stop skewing counts.', to: `${ROUTES.SUPER_ADMIN}?q=test` });
    return list;
  }, [tickets, companies, coupons]);

  const attention = useMemo(() => {
    const items: { text: string; to: string }[] = [];
    if (k.within2) items.push({ text: `${k.within2} plan${k.within2 === 1 ? '' : 's'} expire within 2 days`, to: `${ROUTES.SUPER_ADMIN}?filter=expiring` });
    if (support.open.length) {
      const oldest = support.open[0];
      items.push({ text: `${support.open.length} ticket${support.open.length === 1 ? '' : 's'} pending, oldest ${ageText(oldest.createdAt)}`, to: ROUTES.SUPPORT_TICKET });
    }
    const risky = coupons.filter(couponHighRisk).length;
    if (risky) items.push({ text: `${risky} coupon${risky === 1 ? ' gives' : 's give'} ~100% off, no limit`, to: ROUTES.SUPER_ADMIN_COUPONS });
    if (partners.due > 0) items.push({ text: `${fmtMoney(partners.due)} partner payouts due`, to: ROUTES.AGENT_DASHBOARD });
    if (checks.length) items.push({ text: `${checks.length} data issue${checks.length === 1 ? '' : 's'} found`, to: '#data-checks' });
    return items;
  }, [k.within2, support.open, coupons, partners.due, checks.length]);

  const remind = async (c: AdminCompany) => {
    if (!window.confirm(`Send WhatsApp renewal reminder to ${c.name}?`)) return;
    setSendingId(c.id);
    try {
      const res = await httpsCallable(getFunctions(), 'sendRenewalReminder')({ companyId: c.id });
      invalidateAdminCache('companies');
      alert(`Reminder sent to ${(res.data as { to: string }).to}.`);
    } catch (err: any) {
      alert(`Failed to send reminder: ${err.message || err}`);
    } finally {
      setSendingId(null);
    }
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    if (/^TKT-/i.test(q)) navigate(ROUTES.SUPPORT_TICKET);
    else if (coupons.some(c => c.code === q.toUpperCase())) navigate(ROUTES.SUPER_ADMIN_COUPONS);
    else navigate(`${ROUTES.SUPER_ADMIN}?q=${encodeURIComponent(q)}`);
  };

  if (loading) return <Loading />;

  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
  const revDelta = k.revenuePrev ? Math.round(((k.revenue - k.revenuePrev) / k.revenuePrev) * 100) : null;
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <PageShell wide>
      <PageHeader
        crumb={false}
        title="Dashboard"
        subtitle={`${today} · all Sellar companies`}
        actions={<>
          <form onSubmit={onSearch} className="w-full sm:w-72">
            <SearchBox value={search} onChange={setSearch} placeholder="Search company, phone, ticket, coupon…" />
          </form>
          <RangeTabs value={rangeKey} options={['today', '7d', '30d', '90d', 'custom']} onChange={setRangeKey} custom={custom} onCustomChange={setCustom} />
          <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={hideTest} onChange={e => setHideTest(e.target.checked)} />
            Hide test accounts
          </label>
        </>}
      />

      {attention.length > 0 && (
        <div className="flex flex-col md:flex-row md:items-center gap-3 px-4 py-3 mb-4 rounded-xl border border-amber-200 bg-amber-50">
          <p className="flex items-center gap-2 font-semibold text-amber-900 whitespace-nowrap">
            <AlertTriangle className="w-4 h-4" /> Needs attention
          </p>
          <div className="flex flex-wrap gap-2">
            {attention.map(a => a.to.startsWith('#') ? (
              <a key={a.text} href={a.to} className="px-3 py-1.5 text-sm font-semibold bg-white border border-amber-300 rounded-full text-gray-900 hover:bg-amber-100">{a.text} →</a>
            ) : (
              <Link key={a.text} to={a.to} className="px-3 py-1.5 text-sm font-semibold bg-white border border-amber-300 rounded-full text-gray-900 hover:bg-amber-100">{a.text} →</Link>
            ))}
          </div>
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatCard dot="bg-green-600" label="Active plans" value={k.active} sub={<>
          <div className="h-1.5 rounded-full bg-gray-200 my-1.5 overflow-hidden"><div className="h-full bg-green-600" style={{ width: pct(k.active, live.length) }} /></div>
          {pct(k.active, live.length)} of {live.length} companies
        </>} />
        <StatCard dot="bg-red-600" label="Expired plans" value={k.expired} sub={<Link2 to={`${ROUTES.SUPER_ADMIN}?filter=expired`}>Open win-back list</Link2>} />
        <StatCard dot="bg-amber-500" label="Expiring · 7 days" value={k.expiring.length} sub={<>
          <p>{k.expiring[0] ? `Next renewal: ${fmtDate(k.expiring[0].expiry)}` : 'Nothing this week'}</p>
          {k.expiring.length > 0 && <Link2 to={`${ROUTES.SUPER_ADMIN}?filter=expiring`}>Send reminders</Link2>}
        </>} />
        <StatCard dot="bg-blue-600" label="Total companies" value={live.length} sub={<>
          <p>{agents.length} partners onboarded</p>
          <p>New this period: {k.newInRange}</p>
        </>} />
        <StatCard dot="bg-violet-600" label="Monthly revenue (est.)" value={fmtMoney(k.mrr.total)} sub={<>
          <p>Collected this period: {fmtMoney(k.revenue)}</p>
          <p>vs previous: {revDelta === null ? '—' : <span className={revDelta >= 0 ? 'text-green-700' : 'text-red-600'}>{revDelta >= 0 ? '+' : ''}{revDelta}%</span>}</p>
        </>} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4 mb-4">
        {/* ── Renewals ── */}
        <Card className="p-5">
          <CardTitle title="Renewals due · next 30 days" right={<Link2 to={ROUTES.SUPER_ADMIN}>All companies</Link2>} />
          {renewals.length === 0 ? <p className="text-sm text-gray-500 py-6 text-center">No renewals due in the next 30 days.</p> : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
                  <tr><th className="text-left px-5 py-2">Company</th><th className="text-left py-2">Plan</th><th className="text-left py-2">Expires</th><th className="text-left py-2">Left</th><th className="text-right px-5 py-2">Action</th></tr>
                </thead>
                <tbody>
                  {renewals.slice(0, 6).map(c => {
                    const d = daysUntil(c.expiry)!;
                    return (
                      <tr key={c.id} className="border-b border-gray-100">
                        <td className="px-5 py-2.5">
                          <p className="font-semibold text-gray-900 flex items-center gap-2">{c.name}{looksLikeTest(c) && <Chip cls="bg-gray-100 text-gray-600">TEST?</Chip>}</p>
                          <p className="text-xs font-mono text-gray-500">{c.id}</p>
                        </td>
                        <td className="py-2.5 font-medium">{c.isTrial ? 'Trial' : c.pack.replace(/_/g, ' ')}</td>
                        <td className="py-2.5">{fmtDate(c.expiry)}</td>
                        <td className="py-2.5"><Chip cls={d <= 1 ? 'bg-red-100 text-red-700' : d <= 7 ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'}>{d === 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`}</Chip></td>
                        <td className="px-5 py-2.5 text-right whitespace-nowrap">
                          <Btn size="sm" variant="green" disabled={sendingId === c.id} onClick={() => remind(c)}>Remind</Btn>{' '}
                          <Btn size="sm" onClick={() => navigate(`${ROUTES.SUPER_ADMIN}?q=${encodeURIComponent(c.id)}&open=${c.id}`)}>Extend</Btn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
            “Remind” sends a WhatsApp renewal message from Sellar’s own number. “TEST?” is auto-flagged from the company name — mark it as a test on the Companies page to exclude it from counts.
          </p>
        </Card>

        {/* ── Support ── */}
        <Card className="p-5">
          <CardTitle title="Support queue" right={<Link2 to={ROUTES.SUPPORT_TICKET}>All tickets</Link2>} />
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-lg bg-red-50 p-3"><p className="text-[11px] font-bold text-red-700">OPEN</p><p className="text-2xl font-semibold">{support.open.length}</p></div>
            <div className="rounded-lg bg-green-50 p-3"><p className="text-[11px] font-bold text-green-700">SOLVED</p><p className="text-2xl font-semibold">{support.solved}</p></div>
            <div className="rounded-lg bg-gray-50 p-3"><p className="text-[11px] font-bold text-gray-600">AVG. REPLY</p><p className="text-2xl font-semibold">{support.avgReplyH === null ? '—' : support.avgReplyH < 48 ? `${Math.round(support.avgReplyH)}h` : `${Math.round(support.avgReplyH / 24)}d`}</p></div>
          </div>
          {support.open.length === 0 ? <p className="text-sm text-gray-500 text-center py-4">Queue is clear.</p> : support.open.slice(0, 4).map(t => (
            <Link key={t.id} to={`${ROUTES.SUPPORT_TICKET}?t=${t.id}`} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50 -mx-2 px-2 rounded">
              <div className="min-w-0">
                <p className={`font-semibold truncate ${t.fullName ? 'text-gray-900' : 'text-gray-500'}`}>{t.fullName || 'Unknown sender'}</p>
                <p className="text-xs text-gray-500 truncate">{t.number} · opened {fmtDate(t.createdAt)}{!ticketHasContact(t) && ' · no phone or email'}</p>
              </div>
              <Chip cls="bg-red-100 text-red-700">{ageText(t.createdAt)}</Chip>
            </Link>
          ))}
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* ── Growth ── */}
        <Card className="p-5">
          <CardTitle title="Growth · this period" right={<Link2 to={ROUTES.APP_LEADS}>Leads</Link2>} />
          {[
            { label: 'App signups started', n: growth.started, of: growth.started },
            { label: 'Registered · on trial', n: growth.registered, of: growth.started },
            { label: 'Became paid', n: growth.paid, of: growth.started },
          ].map((s, i) => (
            <div key={s.label} className="mb-3">
              <div className="flex justify-between text-sm"><span className="font-medium text-gray-800">{s.label}</span>
                <span className="font-semibold">{s.n}{i > 0 && <span className="text-gray-500 font-normal"> · {pct(s.n, s.of)}</span>}</span></div>
              <div className="h-2 rounded-full bg-blue-100 mt-1 overflow-hidden"><div className="h-full bg-blue-600" style={{ width: s.of ? `${(s.n / s.of) * 100}%` : '0%' }} /></div>
            </div>
          ))}
          <p className="text-sm text-gray-600">Web queries: {growth.queries} · converted {growth.converted}</p>
        </Card>

        {/* ── Partners ── */}
        <Card className="p-5">
          <CardTitle title="Partners & payouts" right={<Link2 to={ROUTES.AGENT_DASHBOARD}>Partners</Link2>} />
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg bg-gray-50 p-3"><p className="text-[11px] font-bold text-gray-600">PARTNERS</p><p className="text-2xl font-semibold">{agents.length}</p></div>
            <div className="rounded-lg bg-gray-50 p-3"><p className="text-[11px] font-bold text-gray-600">PAYOUTS DUE</p><p className="text-2xl font-semibold">{fmtMoney(partners.due)}</p></div>
          </div>
          {partners.withCredits.length > 0 && (
            <div className="flex items-center gap-3 p-3 mb-3 rounded-lg border border-dashed border-violet-300 bg-violet-50">
              <Gift className="w-5 h-5 text-violet-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{partners.withCredits.length} unclaimed credit{partners.withCredits.length === 1 ? '' : 's'}</p>
                <p className="text-xs text-gray-600 truncate">{partners.withCredits[0].name} · {partners.withCredits[0].referralCredits} months</p>
              </div>
              <Link to={ROUTES.AGENT_DASHBOARD} className="text-sm font-semibold text-violet-700">Review</Link>
            </div>
          )}
          <p className="text-sm text-gray-600">
            Top partner this period: {partners.top ? `${partners.top.agent.name} · ${partners.top.n} signup${partners.top.n === 1 ? '' : 's'}` : 'no partner signups'}
          </p>
        </Card>

        {/* ── Data checks ── */}
        <Card className="p-5">
          <div id="data-checks" className="scroll-mt-20" />
          <CardTitle title="Data checks" right={checks.length
            ? <Chip cls="bg-red-100 text-red-700">{checks.length} issue{checks.length === 1 ? '' : 's'}</Chip>
            : <Chip cls="bg-green-100 text-green-700">All clear</Chip>} />
          {checks.length === 0 ? <p className="text-sm text-gray-500">No problems found.</p> : (
            <ul className="space-y-2.5">
              {checks.slice(0, 5).map(c => (
                <li key={c.title} className="flex gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${c.tone === 'red' ? 'bg-red-600' : 'bg-amber-500'}`} />
                  <Link to={c.to} className="hover:underline"><b>{c.title}</b> <span className="text-gray-700">{c.text}</span></Link>
                </li>
              ))}
            </ul>
          )}
          {checks.length > 5 && <p className="text-xs text-gray-500 mt-2">+{checks.length - 5} more</p>}
        </Card>
      </div>
    </PageShell>
  );
};

export default SuperAdminHub;
