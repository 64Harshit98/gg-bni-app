import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, Timestamp, updateDoc } from 'firebase/firestore';
import { LineChart, Trash2, X } from 'lucide-react';
import { db } from '../../lib/Firebase';
import Loading from '../Loading/Loading';
import type { AdminLead, DateRange, LeadSalesStatus, LeadStage, RangeKey } from './superAdmin/data';
import {
  LEAD_SALES_META, LEAD_STAGE_META, ageText, buildLeads, daysUntil, downloadCsv, fmtDate,
  inRange, loadCompanies, previousRange, rangeFor, waLink,
} from './superAdmin/data';
import { Btn, Card, CardTitle, Chip, EmptyRow, LinkBtn, Pager, PageHeader, PageShell, RangeTabs, SearchBox, SelectBox, StatCard } from './superAdmin/ui';

type CardFilter = 'all' | 'new' | 'follow_today' | 'converted' | 'not_interested';
type SortKey = 'followup' | 'newest' | 'oldest' | 'stuck';

const PAGE_SIZE = 25;
const STEPS = 3;

const isClosed = (l: AdminLead) => l.sales === 'converted' || l.sales === 'not_interested';

const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
const followUpDue = (l: AdminLead) => !isClosed(l) && !!l.followUpAt && l.followUpAt.getTime() <= endOfToday();

const nudgeText = (l: AdminLead) => {
  const name = l.fullName.split(' ')[0] || 'there';
  if (l.stage === 'details') return `Hi ${name}, this is the Sellar team. You started setting up your Sellar account but didn't finish the business details. Can we help you complete it? It takes 2 minutes.`;
  if (l.stage === 'trial') return `Hi ${name}, this is the Sellar team. How is your free trial going? Happy to help you set up billing, stock or your catalogue.`;
  if (l.stage === 'trial_ended') return `Hi ${name}, this is the Sellar team. Your free trial has ended — want to continue with a plan? We can help you pick the right one.`;
  return `Hi ${name}, this is the Sellar team. Thanks for choosing Sellar! Anything we can help with?`;
};

const stepTime = (l: AdminLead) => {
  if (l.stage === 'paid') return { text: `Converted ${fmtDate(l.convertedAt || l.lastUpdated)}`, cls: 'text-green-700' };
  if (l.stage === 'trial' && l.company) {
    const d = daysUntil(l.company.expiry);
    return { text: d === null ? 'On trial' : `Trial ends in ${d} day${d === 1 ? '' : 's'}`, cls: 'text-green-700' };
  }
  if (l.stage === 'trial_ended') return { text: `Trial ended ${fmtDate(l.company?.expiry)}`, cls: 'text-red-600' };
  return { text: `Stuck ${ageText(l.lastUpdated)}`, cls: 'text-red-600' };
};

const LeadsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<AdminLead[]>([]);

  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [compare, setCompare] = useState(false);

  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [stepFilter, setStepFilter] = useState<'all' | LeadStage>('all');
  const [assignedFilter, setAssignedFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('followup');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [nudgeOpen, setNudgeOpen] = useState(false);

  useEffect(() => {
    Promise.all([getDocs(collection(db, 'leads')), loadCompanies()])
      .then(([snap, companies]) => setLeads(buildLeads(snap.docs.map(d => ({ id: d.id, ...d.data() })), companies)))
      .catch(err => { console.error(err); alert('Failed to load leads.'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setPage(0); }, [rangeKey, custom, cardFilter, stepFilter, assignedFilter, sortKey, search]);

  const range: DateRange = useMemo(() => rangeFor(rangeKey, custom), [rangeKey, custom]);
  // Leads carry no creation date, only lastUpdated — the range filters on last activity.
  const inR = useMemo(() => leads.filter(l => inRange(l.lastUpdated, range)), [leads, range]);
  const inPrev = useMemo(() => leads.filter(l => inRange(l.lastUpdated, previousRange(range))), [leads, range]);

  const funnel = (list: AdminLead[]) => {
    const started = list.length;
    const registered = list.filter(l => l.stage !== 'details').length;
    const paid = list.filter(l => l.stage === 'paid').length;
    return { started, registered, paid, rate: started ? paid / started : 0 };
  };
  const f = useMemo(() => funnel(inR), [inR]);
  const fPrev = useMemo(() => funnel(inPrev), [inPrev]);

  const dropOff = useMemo(() => {
    const rows = [
      { label: 'Business details', n: inR.filter(l => l.stage === 'details').length, hint: 'made an account, never finished setup' },
      { label: 'Trial ended, not paid', n: inR.filter(l => l.stage === 'trial_ended').length, hint: 'used the trial, didn’t buy' },
      { label: 'On trial now', n: inR.filter(l => l.stage === 'trial').length, hint: 'still deciding' },
    ];
    const max = Math.max(1, ...rows.map(r => r.n));
    const biggest = rows.slice(0, 2).sort((a, b) => b.n - a.n)[0];
    return { rows, max, biggest };
  }, [inR]);

  const stats = useMemo(() => ({
    all: inR.length,
    new: inR.filter(l => l.sales === 'new').length,
    followToday: leads.filter(followUpDue).length,
    converted: inR.filter(l => l.sales === 'converted').length,
    notInterested: inR.filter(l => l.sales === 'not_interested').length,
  }), [inR, leads]);

  const assignees = useMemo(() => Array.from(new Set(leads.map(l => l.assignedTo).filter(Boolean))).sort(), [leads]);

  const filtered = useMemo(() => {
    // "Follow-up today" looks across all dates — an overdue call from last month still needs making.
    const base = cardFilter === 'follow_today' ? leads.filter(followUpDue) : inR;
    const q = search.trim().toLowerCase();
    const list = base.filter(l => {
      if (cardFilter === 'new' && l.sales !== 'new') return false;
      if (cardFilter === 'converted' && l.sales !== 'converted') return false;
      if (cardFilter === 'not_interested' && l.sales !== 'not_interested') return false;
      if (stepFilter !== 'all' && l.stage !== stepFilter) return false;
      if (assignedFilter === 'none' && l.assignedTo) return false;
      if (assignedFilter !== 'all' && assignedFilter !== 'none' && l.assignedTo !== assignedFilter) return false;
      if (q && ![l.fullName, l.email, l.phone].some(x => x && x.toLowerCase().includes(q))) return false;
      return true;
    });
    const t = (d: Date | null) => d?.getTime() ?? 0;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case 'newest': return t(b.lastUpdated) - t(a.lastUpdated);
        case 'oldest': return t(a.lastUpdated) - t(b.lastUpdated);
        case 'stuck': return (a.stage === 'details' ? 0 : 1) - (b.stage === 'details' ? 0 : 1) || t(a.lastUpdated) - t(b.lastUpdated);
        default: {
          // Due follow-ups first (earliest first), then open leads without one, closed last.
          const rank = (l: AdminLead) => (isClosed(l) ? 3 : l.followUpAt ? (followUpDue(l) ? 0 : 1) : 2);
          return rank(a) - rank(b) || t(a.followUpAt) - t(b.followUpAt) || t(b.lastUpdated) - t(a.lastUpdated);
        }
      }
    });
  }, [inR, leads, cardFilter, stepFilter, assignedFilter, sortKey, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const update = async (l: AdminLead, payload: Record<string, any>, patch: Partial<AdminLead>) => {
    setLeads(prev => prev.map(x => (x.id === l.id ? { ...x, ...patch } : x)));
    try {
      await updateDoc(doc(db, 'leads', l.id), payload);
    } catch (err) {
      console.error(err);
      alert('Failed to save. Reverting.');
      setLeads(prev => prev.map(x => (x.id === l.id ? l : x)));
    }
  };

  const setSales = (l: AdminLead, s: LeadSalesStatus) => update(l, { salesStatus: s }, { sales: s });
  const setAssignee = (l: AdminLead, v: string) => update(l, { assignedTo: v.trim() }, { assignedTo: v.trim() });
  const setFollowUp = (l: AdminLead, v: string) => {
    const d = v ? new Date(`${v}T10:00:00`) : null;
    update(l, { followUpAt: d ? Timestamp.fromDate(d) : null }, { followUpAt: d });
  };
  const markContacted = (l: AdminLead) => { if (l.sales === 'new') setSales(l, 'contacted'); };

  const remove = async (l: AdminLead) => {
    if (!window.confirm(`Permanently delete the lead for ${l.fullName || l.email}?`)) return;
    try {
      await deleteDoc(doc(db, 'leads', l.id));
      setLeads(prev => prev.filter(x => x.id !== l.id));
    } catch (err) {
      console.error(err);
      alert('Failed to delete lead.');
    }
  };

  const toggleSel = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const exportCsv = () => downloadCsv(
    `sellar-app-leads-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Name', 'Email', 'Phone', 'Step', 'Sales status', 'Assigned to', 'Follow-up', 'Last activity', 'Company'],
    filtered.map(l => [l.fullName, l.email, l.phone, LEAD_STAGE_META[l.stage].label, LEAD_SALES_META[l.sales].label,
      l.assignedTo, l.followUpAt?.toISOString().slice(0, 10) || '', l.lastUpdated?.toISOString() || '', l.company?.id || '']),
  );

  if (loading) return <Loading />;

  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
  const deltaPts = compare ? Math.round((f.rate - fPrev.rate) * 100) : null;
  const lastLead = [...leads].sort((a, b) => (b.lastUpdated?.getTime() ?? 0) - (a.lastUpdated?.getTime() ?? 0))[0];
  const selectedLeads = leads.filter(l => selected.has(l.id) && l.phone);

  const funnelRows = [
    { label: 'Started signup', sub: '100%', n: f.started, prevN: fPrev.started, drop: null as number | null, color: 'bg-blue-700' },
    { label: 'Registered · trial started', sub: `${pct(f.registered, f.started)} of started`, n: f.registered, prevN: fPrev.registered, drop: f.started - f.registered, color: 'bg-blue-500' },
    { label: 'Became paid', sub: `${pct(f.paid, f.registered)} of trials`, n: f.paid, prevN: fPrev.paid, drop: f.registered - f.paid, color: 'bg-green-600' },
  ];

  return (
    <PageShell>
      <PageHeader
        title="App Registration Leads"
        subtitle="Everyone who started signing up in the Sellar app, and where they stopped"
        actions={<>
          <RangeTabs value={rangeKey} options={['today', '7d', '30d', '90d', 'custom']} onChange={setRangeKey} custom={custom} onCustomChange={setCustom} />
          <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} /> Compare to previous
          </label>
          <Btn onClick={exportCsv}>Export CSV</Btn>
        </>}
      />

      {inR.length === 0 && cardFilter !== 'follow_today' ? (
        <Card className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center shrink-0"><LineChart className="w-5 h-5 text-blue-600" /></div>
          <div className="flex-1">
            <p className="font-semibold text-gray-900">No leads in this period</p>
            <p className="text-sm text-gray-600">
              {lastLead ? `The last lead came in ${ageText(lastLead.lastUpdated)} ago.` : 'No leads yet.'} {stats.followToday} lead{stats.followToday === 1 ? '' : 's'} need a follow-up.
            </p>
          </div>
          <div className="flex gap-2">
            <Btn onClick={() => setRangeKey('7d')}>Show last 7 days</Btn>
            <Btn variant="primary" onClick={() => setCardFilter('follow_today')}>Open follow-ups</Btn>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4 mb-4">
          <Card className="p-5">
            <CardTitle title="Signup funnel" right={
              <Chip cls="bg-green-100 text-green-800" className="text-xs">
                Overall {pct(f.paid, f.started)} paid{deltaPts !== null && ` · ${deltaPts >= 0 ? '+' : ''}${deltaPts} pts vs prev.`}
              </Chip>
            } />
            {funnelRows.map(r => (
              <div key={r.label} className="grid grid-cols-[minmax(0,140px)_1fr_auto] sm:grid-cols-[180px_1fr_110px] items-center gap-3 mb-3">
                <div><p className="text-sm font-semibold text-gray-900">{r.label}</p><p className="text-xs text-gray-500">{r.sub}</p></div>
                <div className="h-8 rounded-md bg-gray-100 overflow-hidden">
                  <div className={`h-full ${r.color} text-white text-sm font-semibold flex items-center px-3`}
                    style={{ width: f.started ? `${Math.max((r.n / f.started) * 100, 8)}%` : '8%' }}>{r.n}</div>
                </div>
                <div className="text-xs">
                  {r.drop !== null ? <span className="text-red-600">{r.drop} dropped</span> : <span className="text-gray-400">—</span>}
                  {compare && <p className="text-gray-500">prev: {r.prevN}</p>}
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-500">Registering starts the free trial automatically, so those are one step. The period filters on each lead’s last activity.</p>
          </Card>

          <Card className="p-5">
            <CardTitle title="Where people drop off" sub="Leads in this period by the step they’re stuck at" />
            {dropOff.rows.map(r => (
              <div key={r.label} className="mb-3">
                <div className="flex justify-between text-sm"><span className="font-medium text-gray-800">{r.label}</span><span className="font-semibold">{r.n} here</span></div>
                <div className="h-2 rounded-full bg-red-100 mt-1 overflow-hidden"><div className="h-full bg-red-600" style={{ width: `${(r.n / dropOff.max) * 100}%` }} /></div>
                <p className="text-xs text-gray-500 mt-0.5">{r.hint}</p>
              </div>
            ))}
            {dropOff.biggest.n > 0 && (
              <p className="text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-900">
                <b>Biggest leak: {dropOff.biggest.label}.</b> {dropOff.biggest.n} people stopped here — worth a WhatsApp nudge.{' '}
                <button className="underline font-semibold" onClick={() => setStepFilter(dropOff.biggest.label === 'Business details' ? 'details' : 'trial_ended')}>Show them</button>
              </p>
            )}
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 my-4">
        <StatCard dot="bg-gray-500" label="All leads" value={stats.all} sub="in selected range" active={cardFilter === 'all'} onClick={() => setCardFilter('all')} />
        <StatCard dot="bg-blue-600" label="New" value={stats.new} sub="not contacted yet" active={cardFilter === 'new'} onClick={() => setCardFilter(c => c === 'new' ? 'all' : 'new')} />
        <StatCard dot="bg-amber-500" label="Follow-up due" value={stats.followToday} sub="today or overdue" active={cardFilter === 'follow_today'} onClick={() => setCardFilter(c => c === 'follow_today' ? 'all' : 'follow_today')} />
        <StatCard dot="bg-green-600" label="Converted" value={stats.converted} sub="became paid" active={cardFilter === 'converted'} onClick={() => setCardFilter(c => c === 'converted' ? 'all' : 'converted')} />
        <StatCard dot="bg-gray-400" label="Not interested" value={stats.notInterested} sub="closed" active={cardFilter === 'not_interested'} onClick={() => setCardFilter(c => c === 'not_interested' ? 'all' : 'not_interested')} />
      </div>

      <Card>
        <div className="p-4 flex flex-col lg:flex-row gap-3 lg:items-center border-b border-gray-200">
          <SearchBox className="flex-1" value={search} onChange={setSearch} placeholder="Search by name, email or phone…" />
          <div className="grid grid-cols-2 sm:flex gap-2 items-center">
            <SelectBox label="Step" value={stepFilter} onChange={v => setStepFilter(v as any)}>
              <option value="all">All steps</option>
              {(Object.keys(LEAD_STAGE_META) as LeadStage[]).map(s => <option key={s} value={s}>{LEAD_STAGE_META[s].label}</option>)}
            </SelectBox>
            <SelectBox label="Assigned" value={assignedFilter} onChange={setAssignedFilter}>
              <option value="all">Anyone</option>
              <option value="none">Unassigned</option>
              {assignees.map(a => <option key={a} value={a}>{a}</option>)}
            </SelectBox>
            <SelectBox label="Sort" value={sortKey} onChange={v => setSortKey(v as SortKey)}>
              <option value="followup">Follow-up due</option>
              <option value="newest">Newest activity</option>
              <option value="oldest">Oldest activity</option>
              <option value="stuck">Stuck longest</option>
            </SelectBox>
          </div>
        </div>
        {selected.size > 0 && (
          <div className="px-4 py-2.5 border-b border-gray-200 flex items-center gap-3 bg-green-50/50">
            <Btn size="sm" variant="green" onClick={() => setNudgeOpen(true)}>Nudge selected on WhatsApp ({selected.size})</Btn>
            <button className="text-sm text-gray-600" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input type="checkbox" aria-label="Select all on page"
                    checked={rows.length > 0 && rows.every(r => selected.has(r.id))}
                    onChange={e => setSelected(prev => {
                      const next = new Set(prev);
                      rows.forEach(r => e.target.checked ? next.add(r.id) : next.delete(r.id));
                      return next;
                    })} />
                </th>
                <th className="text-left py-2.5">Lead</th><th className="text-left py-2.5">Progress</th><th className="text-left py-2.5">Time at step</th>
                <th className="text-left py-2.5">Sales status</th><th className="text-left py-2.5">Assigned to</th><th className="text-left py-2.5">Follow-up</th>
                <th className="text-right px-4 py-2.5">Contact</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8}><EmptyRow>No leads match these filters.</EmptyRow></td></tr>
              ) : rows.map(l => {
                const st = stepTime(l);
                const step = LEAD_STAGE_META[l.stage].step;
                return (
                  <tr key={l.id} className="border-b border-gray-100 align-top">
                    <td className="px-4 py-3"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleSel(l.id)} aria-label={`Select ${l.fullName}`} /></td>
                    <td className="py-3 pr-3">
                      <p className="font-semibold text-gray-900">{l.fullName || '—'}</p>
                      <p className="text-xs text-gray-500">{l.phone || 'no phone'} · {fmtDate(l.lastUpdated)}</p>
                      <p className="text-xs text-gray-400 truncate max-w-[200px]">{l.email}</p>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="flex gap-1 mb-1">
                        {Array.from({ length: STEPS }).map((_, i) => (
                          <span key={i} className={`h-1.5 w-6 rounded-full ${i < step ? (l.stage === 'trial_ended' ? 'bg-red-500' : 'bg-blue-600') : 'bg-gray-200'}`} />
                        ))}
                      </div>
                      <p className="text-xs font-medium text-gray-800">{LEAD_STAGE_META[l.stage].label} · {step}/{STEPS}</p>
                      {l.company && <p className="text-[11px] font-mono text-gray-500">{l.company.id}</p>}
                    </td>
                    <td className={`py-3 pr-3 text-xs font-semibold ${st.cls}`}>{st.text}</td>
                    <td className="py-3 pr-3">
                      <select value={l.sales} onChange={e => setSales(l, e.target.value as LeadSalesStatus)}
                        className={`text-[11px] font-bold rounded-full px-2 py-1 border-0 cursor-pointer ${LEAD_SALES_META[l.sales].cls}`}>
                        {(Object.keys(LEAD_SALES_META) as LeadSalesStatus[]).map(s => <option key={s} value={s}>{LEAD_SALES_META[s].label}</option>)}
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      <input list="lead-assignees" defaultValue={l.assignedTo} placeholder="—"
                        onBlur={e => { if (e.target.value.trim() !== l.assignedTo) setAssignee(l, e.target.value); }}
                        className="w-28 text-sm border border-transparent hover:border-gray-300 focus:border-gray-300 rounded px-1.5 py-1 bg-transparent" />
                    </td>
                    <td className="py-3 pr-3">
                      {!isClosed(l) ? (
                        <input type="date" value={l.followUpAt ? l.followUpAt.toISOString().slice(0, 10) : ''}
                          onChange={e => setFollowUp(l, e.target.value)}
                          className={`text-xs border rounded px-1.5 py-1 ${followUpDue(l) ? 'border-amber-400 text-amber-800 bg-amber-50 font-semibold' : 'border-gray-200'}`} />
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {l.phone && <>
                        <LinkBtn href={`tel:${l.phone}`} target="_self" onClick={() => markContacted(l)}>Call</LinkBtn>{' '}
                        <LinkBtn variant="green" href={waLink(l.phone, nudgeText(l))} onClick={() => markContacted(l)}>WhatsApp</LinkBtn>{' '}
                      </>}
                      <button onClick={() => remove(l)} className="p-1.5 text-gray-400 hover:text-red-600 align-middle" aria-label="Delete lead"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <datalist id="lead-assignees">{assignees.map(a => <option key={a} value={a} />)}</datalist>
        </div>
        <Pager page={page} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} onPage={setPage} />
      </Card>

      {/* Browsers block opening many WhatsApp tabs at once, so bulk nudging is a click-through queue. */}
      {nudgeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setNudgeOpen(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div>
                <h2 className="font-semibold text-gray-900">Nudge {selectedLeads.length} lead{selectedLeads.length === 1 ? '' : 's'} on WhatsApp</h2>
                <p className="text-xs text-gray-500">Each opens WhatsApp with a message for their step. Opening marks the lead contacted.</p>
              </div>
              <button onClick={() => setNudgeOpen(false)} aria-label="Close"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="overflow-y-auto divide-y divide-gray-100">
              {selectedLeads.map(l => (
                <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0"><p className="font-semibold text-sm truncate">{l.fullName || l.phone}</p><p className="text-xs text-gray-500">{LEAD_STAGE_META[l.stage].label}</p></div>
                  <LinkBtn variant="green" href={waLink(l.phone, nudgeText(l))} onClick={() => markContacted(l)}>Open WhatsApp</LinkBtn>
                </div>
              ))}
              {selected.size > selectedLeads.length && <p className="px-4 py-3 text-xs text-gray-500">{selected.size - selectedLeads.length} selected lead(s) have no phone number.</p>}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end"><Btn onClick={() => { setNudgeOpen(false); setSelected(new Set()); }}>Done</Btn></div>
          </div>
        </div>
      )}
    </PageShell>
  );
};

export default LeadsPage;
