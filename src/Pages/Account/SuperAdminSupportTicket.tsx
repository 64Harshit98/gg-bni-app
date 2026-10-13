import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { arrayUnion, collection, doc, onSnapshot, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import Loading from '../Loading/Loading';
import type { AdminCompany, AdminTicket, RangeKey, TicketPriority, TicketStatus } from './superAdmin/data';
import {
  DAY_MS, PRIORITY_META, TICKET_STATUS_META, buildTickets, downloadCsv, fmtDate, fmtDateTime, inRange,
  last10, loadCompanies, rangeFor, ticketHasContact, waLink,
} from './superAdmin/data';
import { Btn, Card, Chip, EmptyRow, PageHeader, PageShell, RangeTabs, SearchBox, SelectBox, StatCard, inputCls } from './superAdmin/ui';

const SLA_HOURS = 48;
const CATEGORIES = ['Billing', 'Subscription', 'Bug', 'How-to', 'WhatsApp', 'Catalogue', 'Other'];
const SAVED_REPLIES = [
  { label: 'Acknowledge', text: 'Hi {name}, thanks for reaching out to Sellar support. We’ve received your ticket {ticket} and are looking into it.' },
  { label: 'Need details', text: 'Hi {name}, to help with {ticket} could you share a screenshot of the issue and the phone model / browser you’re using?' },
  { label: 'Fixed', text: 'Hi {name}, the issue in {ticket} has been fixed. Please update or reload the app and let us know if it still happens.' },
  { label: 'Renewal help', text: 'Hi {name}, you can renew from Account → Subscription in the app. Reply here if the payment doesn’t go through and we’ll activate it manually.' },
];

type Composer = 'whatsapp' | 'email' | 'note';

const daysOpen = (t: AdminTicket) => t.createdAt ? Math.floor(((t.solvedAt?.getTime() ?? Date.now()) - t.createdAt.getTime()) / DAY_MS) : 0;
const breaching = (t: AdminTicket) => t.status !== 'solved' && !!t.createdAt && Date.now() - t.createdAt.getTime() > SLA_HOURS * 3_600_000;

const SupportTicketLeads: React.FC = () => {
  const { currentUser } = useAuth();
  const [params] = useSearchParams();
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);

  const [rangeKey, setRangeKey] = useState<RangeKey>('all');
  const [cardFilter, setCardFilter] = useState<'all' | 'open' | 'waiting' | 'solved' | 'sla'>('open');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TicketPriority>('all');
  const [sortKey, setSortKey] = useState<'oldest_open' | 'newest' | 'priority'>('oldest_open');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(params.get('t'));

  // All tickets are loaded (not just the range) because display numbers come from creation order.
  useEffect(() => {
    loadCompanies().then(setCompanies).catch(console.error);
    return onSnapshot(collection(db, 'support_tickets'), snap => {
      setTickets(buildTickets(snap.docs.map(d => ({ id: d.id, data: d.data() }))));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
  }, []);

  const range = useMemo(() => rangeFor(rangeKey), [rangeKey]);
  const inR = useMemo(() => tickets.filter(t => rangeKey === 'all' || inRange(t.createdAt, range)), [tickets, range, rangeKey]);

  const stats = useMemo(() => {
    const open = inR.filter(t => t.status !== 'solved');
    const oldest = [...open].sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))[0];
    const solved = inR.filter(t => t.status === 'solved');
    const resolved = solved.filter(t => t.solvedAt && t.createdAt);
    const avgRes = resolved.length ? resolved.reduce((s, t) => s + (t.solvedAt!.getTime() - t.createdAt!.getTime()), 0) / resolved.length / DAY_MS : null;
    return {
      open: open.length, oldest, waiting: inR.filter(t => t.status === 'waiting').length,
      solved: solved.length, avgRes, sla: inR.filter(breaching).length,
    };
  }, [inR]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = inR.filter(t => {
      if (cardFilter === 'open' && t.status === 'solved') return false;
      if (cardFilter === 'waiting' && t.status !== 'waiting') return false;
      if (cardFilter === 'solved' && t.status !== 'solved') return false;
      if (cardFilter === 'sla' && !breaching(t)) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (q && ![t.number, t.customerRef, t.fullName, t.phone, t.email, t.subject].some(x => x && x.toLowerCase().includes(q))) return false;
      return true;
    });
    const time = (t: AdminTicket) => t.createdAt?.getTime() ?? 0;
    const pr = { high: 0, medium: 1, low: 2 };
    return [...list].sort((a, b) => {
      if (sortKey === 'newest') return time(b) - time(a);
      if (sortKey === 'priority') return pr[a.priority] - pr[b.priority] || time(a) - time(b);
      return (a.status === 'solved' ? 1 : 0) - (b.status === 'solved' ? 1 : 0) || time(a) - time(b);
    });
  }, [inR, cardFilter, priorityFilter, sortKey, search]);

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = tickets.find(t => t.id === selectedId) || null;

  const update = async (t: AdminTicket, payload: Record<string, any>) => {
    try {
      await updateDoc(doc(db, 'support_tickets', t.id), payload);
    } catch (err) {
      console.error(err);
      alert('Failed to update ticket.');
    }
  };

  const exportCsv = () => downloadCsv(
    `sellar-support-tickets-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Ticket', 'Customer ref', 'Opened', 'Name', 'Email', 'Phone', 'Subject', 'Category', 'Priority', 'Status', 'Assigned to', 'First reply', 'Solved'],
    filtered.map(t => [t.number, t.customerRef, t.createdAt?.toISOString() || '', t.fullName, t.email, t.phone, t.subject, t.category,
      t.priority, TICKET_STATUS_META[t.status].label, t.assignedTo, t.firstRepliedAt?.toISOString() || '', t.solvedAt?.toISOString() || '']),
  );

  if (loading) return <Loading />;

  const toggle = (f: typeof cardFilter) => setCardFilter(prev => (prev === f ? 'all' : f));

  return (
    <PageShell wide>
      <PageHeader
        title="Support Tickets"
        subtitle="Problems customers raised from the Sellar app"
        actions={<>
          <RangeTabs value={rangeKey} options={['7d', '30d', '90d', 'all']} onChange={setRangeKey} />
          <Btn onClick={exportCsv}>Export CSV</Btn>
        </>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
        <StatCard dot="bg-red-600" label="Open" value={stats.open} sub="not yet solved" active={cardFilter === 'open'} onClick={() => toggle('open')} />
        <StatCard dot="bg-red-600" label="Oldest open" value={stats.oldest ? `${daysOpen(stats.oldest)} d` : '—'}
          valueCls={stats.oldest ? 'text-red-600' : 'text-gray-900'} sub={stats.oldest ? `since ${fmtDate(stats.oldest.createdAt)}` : 'nothing open'}
          onClick={stats.oldest ? () => setSelectedId(stats.oldest!.id) : undefined} />
        <StatCard dot="bg-amber-500" label="Waiting on customer" value={stats.waiting} sub="ball in their court" active={cardFilter === 'waiting'} onClick={() => toggle('waiting')} />
        <StatCard dot="bg-green-600" label="Solved" value={stats.solved} sub={rangeKey === 'all' ? 'all time' : 'this period'} active={cardFilter === 'solved'} onClick={() => toggle('solved')} />
        <StatCard dot="bg-violet-600" label="Avg. resolution" value={stats.avgRes === null ? '—' : `${stats.avgRes.toFixed(1)} d`} sub="time to solve" />
        <StatCard dot="bg-red-600" label="Breaching SLA" value={stats.sla} sub={`open over ${SLA_HOURS} hrs`} active={cardFilter === 'sla'} onClick={() => toggle('sla')} />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs mb-4">
        <span className="font-bold uppercase tracking-wider text-gray-600">One status per ticket:</span>
        {(Object.keys(TICKET_STATUS_META) as TicketStatus[]).map((s, i) => (
          <React.Fragment key={s}>{i > 0 && <span className="text-gray-400">→</span>}<Chip cls={TICKET_STATUS_META[s].cls}>{TICKET_STATUS_META[s].label}</Chip></React.Fragment>
        ))}
        <span className="text-gray-500 w-full sm:w-auto">Ticket numbers are assigned by date — the app used to give every ticket TKT-0001.</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_1fr] gap-4 items-start">
        <Card>
          <div className="p-4 flex flex-col md:flex-row gap-3 md:items-center border-b border-gray-200">
            <SearchBox className="flex-1" value={search} onChange={setSearch} placeholder="Search ticket no., phone or name…" />
            <div className="grid grid-cols-2 sm:flex gap-2">
              <SelectBox label="Priority" value={priorityFilter} onChange={v => setPriorityFilter(v as any)}>
                <option value="all">Any</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </SelectBox>
              <SelectBox label="Sort" value={sortKey} onChange={v => setSortKey(v as any)}>
                <option value="oldest_open">Oldest open</option><option value="newest">Newest</option><option value="priority">Priority</option>
              </SelectBox>
            </div>
          </div>
          <div className="hidden md:grid grid-cols-[90px_1.6fr_1fr_0.8fr_0.9fr_1fr] gap-3 px-4 py-2.5 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200">
            <span>Ticket</span><span>Customer</span><span>Category</span><span>Priority</span><span>Age</span><span>Status</span>
          </div>
          {filtered.length === 0 ? <EmptyRow>No tickets match.</EmptyRow> : filtered.map(t => {
            const noContact = !ticketHasContact(t) && t.status !== 'solved';
            return (
              <button key={t.id} onClick={() => setSelectedId(t.id)}
                className={`w-full text-left grid grid-cols-[1fr_auto] md:grid-cols-[90px_1.6fr_1fr_0.8fr_0.9fr_1fr] gap-x-3 gap-y-1 px-4 py-3 border-b border-gray-100 items-center ${selectedId === t.id ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}>
                <span className="font-mono text-xs font-semibold text-blue-700">{t.number}</span>
                <div className="min-w-0 col-span-1">
                  <p className={`font-semibold truncate ${t.fullName ? 'text-gray-900' : 'text-gray-500'}`}>{t.fullName || 'Unknown sender'}</p>
                  <p className="text-xs text-gray-500 truncate">{[t.email, t.phone].filter(Boolean).join(' · ') || 'no email · no phone'}</p>
                </div>
                <span className="hidden md:block text-sm text-gray-700">{t.category || '—'}</span>
                <span className="hidden md:block"><Chip cls={PRIORITY_META[t.priority].cls}>{PRIORITY_META[t.priority].label}</Chip></span>
                <span className={`hidden md:block text-sm font-semibold ${t.status === 'solved' ? 'text-green-700' : breaching(t) ? 'text-red-600' : 'text-gray-800'}`}>
                  {t.status === 'solved' ? `Solved in ${daysOpen(t)} d` : `${daysOpen(t)} days`}
                </span>
                <span>{noContact
                  ? <Chip cls="bg-violet-100 text-violet-700">NEEDS CONTACT</Chip>
                  : <Chip cls={TICKET_STATUS_META[t.status].cls}>{TICKET_STATUS_META[t.status].label}</Chip>}</span>
              </button>
            );
          })}
          <p className="px-4 py-3 text-sm text-gray-600">Showing {filtered.length} of {inR.length} tickets</p>
        </Card>

        {selected
          ? <TicketDetail key={selected.id} t={selected} companies={companies} tickets={tickets} adminName={currentUser?.name || 'Admin'} onUpdate={update} />
          : <Card className="p-8 text-center text-sm text-gray-500">Select a ticket.</Card>}
      </div>
    </PageShell>
  );
};

const TicketDetail: React.FC<{
  t: AdminTicket;
  companies: AdminCompany[];
  tickets: AdminTicket[];
  adminName: string;
  onUpdate: (t: AdminTicket, payload: Record<string, any>) => Promise<void>;
}> = ({ t, companies, tickets, adminName, onUpdate }) => {
  const [mode, setMode] = useState<Composer>(t.phone ? 'whatsapp' : t.email ? 'email' : 'note');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const company = useMemo(() => {
    const p = last10(t.phone);
    const e = t.email.toLowerCase();
    return companies.find(c => (p && last10(c.phone) === p) || (e && c.email.toLowerCase() === e)) || null;
  }, [companies, t.phone, t.email]);

  const assignees = useMemo(() => Array.from(new Set(tickets.map(x => x.assignedTo).filter(Boolean))).sort(), [tickets]);
  const firstName = t.fullName.split(' ')[0] || 'there';

  const setStatus = (s: TicketStatus) => {
    const payload: Record<string, any> = { status: s };
    if (s === 'solved') payload.solvedAt = Timestamp.now();
    else if (t.status === 'solved') payload.solvedAt = null;
    onUpdate(t, payload);
  };

  const send = async (markSolved: boolean) => {
    const body = text.trim();
    if (!body) return;
    if (mode === 'whatsapp' && !t.phone) return alert('This customer has no phone number.');
    if (mode === 'email' && !t.email) return alert('This customer has no email.');

    // WhatsApp and email open the admin's own app with the reply filled in;
    // the reply is logged on the ticket so the thread stays complete.
    if (mode === 'whatsapp') window.open(waLink(t.phone, body), '_blank', 'noopener');
    if (mode === 'email') window.location.href = `mailto:${t.email}?subject=${encodeURIComponent(`Re: ${t.number} ${t.subject}`)}&body=${encodeURIComponent(body)}`;

    setSending(true);
    const msg = { kind: mode === 'note' ? 'note' : 'reply', ...(mode !== 'note' ? { channel: mode } : {}), text: body, at: Timestamp.now(), by: adminName };
    const payload: Record<string, any> = { messages: arrayUnion(msg) };
    if (mode !== 'note') {
      if (!t.firstRepliedAt) payload.firstRepliedAt = Timestamp.now();
      if (!markSolved && t.status === 'open') payload.status = 'in_progress';
    }
    if (markSolved) { payload.status = 'solved'; payload.solvedAt = Timestamp.now(); }
    await onUpdate(t, payload);
    setText('');
    setSending(false);
  };

  const insertSaved = (i: string) => {
    const r = SAVED_REPLIES[Number(i)];
    if (r) setText(r.text.replace('{name}', firstName).replace('{ticket}', t.number));
  };

  const thread = [...t.messages].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));

  return (
    <Card className="p-5 xl:sticky xl:top-4 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-blue-700">{t.number}{t.customerRef && t.customerRef !== t.number && <span className="text-gray-400"> · customer was told {t.customerRef}</span>}</p>
          <h2 className="text-lg font-semibold text-gray-900">{t.subject}</h2>
          <p className="text-sm text-gray-600">
            {[t.fullName || 'Unknown sender', t.phone, company ? `${company.name} (${company.id})` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        {t.status !== 'solved'
          ? <Chip cls="bg-red-100 text-red-700">{daysOpen(t)} DAYS OPEN</Chip>
          : <Chip cls="bg-green-100 text-green-700">SOLVED</Chip>}
      </div>

      {!ticketHasContact(t) && (
        <p className="mt-3 text-sm bg-violet-50 border border-violet-200 text-violet-900 rounded-lg px-3 py-2">
          No phone or email on this ticket. {company ? `Possible match: ${company.name}.` : 'Search Companies by name to find the owner.'}
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 mt-4">
        <label className="text-sm font-semibold text-gray-800">Status
          <select value={t.status} onChange={e => setStatus(e.target.value as TicketStatus)} className={`${inputCls} mt-1 font-normal`}>
            {(Object.keys(TICKET_STATUS_META) as TicketStatus[]).map(s => <option key={s} value={s}>{TICKET_STATUS_META[s].label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-800">Priority
          <select value={t.priority} onChange={e => onUpdate(t, { priority: e.target.value })} className={`${inputCls} mt-1 font-normal`}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-gray-800">Assigned to
          <input list="ticket-assignees" defaultValue={t.assignedTo} placeholder="Nobody"
            onBlur={e => { if (e.target.value.trim() !== t.assignedTo) onUpdate(t, { assignedTo: e.target.value.trim() }); }}
            className={`${inputCls} mt-1 font-normal`} />
          <datalist id="ticket-assignees">{[adminName, ...assignees.filter(a => a !== adminName)].map(a => <option key={a} value={a} />)}</datalist>
        </label>
      </div>
      <label className="text-sm font-semibold text-gray-800 mt-2">Category
        <select value={t.category} onChange={e => onUpdate(t, { category: e.target.value })} className={`${inputCls} mt-1 font-normal`}>
          <option value="">Not set</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>

      <div className="mt-4 border border-gray-200 rounded-lg p-3 space-y-3 max-h-[360px] overflow-y-auto">
        <div>
          <p className="text-xs font-semibold text-gray-700">{t.fullName || 'Customer'} · {fmtDateTime(t.createdAt)}</p>
          <div className="mt-1 inline-block max-w-[90%] bg-gray-100 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">{t.description || '(no description)'}</div>
        </div>
        {thread.map((m, i) => m.kind === 'note' ? (
          <div key={i} className="text-center">
            <span className="inline-block bg-gray-100 text-gray-600 text-xs rounded-md px-2 py-1 whitespace-pre-wrap">Internal note · {m.by}: {m.text}</span>
          </div>
        ) : (
          <div key={i} className="text-right">
            <p className="text-xs font-semibold text-gray-700">{m.by || 'You'} · {m.channel === 'email' ? 'Email' : 'WhatsApp'} · {fmtDateTime(m.at)}</p>
            <div className="mt-1 inline-block max-w-[90%] text-left bg-blue-50 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap">{m.text}</div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="inline-flex border border-gray-200 rounded-lg p-1 mb-2">
          {([['whatsapp', 'Reply on WhatsApp'], ['email', 'Email'], ['note', 'Internal note']] as [Composer, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`px-3 py-1.5 text-sm font-semibold rounded-md ${mode === k ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'}`}>{label}</button>
          ))}
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
          placeholder={mode === 'note' ? 'Only admins see this…' : 'Type a reply…'} className={inputCls} />
        <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
          <select value="" onChange={e => insertSaved(e.target.value)} className="text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
            <option value="">Insert saved reply</option>
            {SAVED_REPLIES.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
          </select>
          <div className="flex gap-2">
            {mode !== 'note' && t.status !== 'solved' && <Btn variant="green" disabled={sending || !text.trim()} onClick={() => send(true)}>Send & mark solved</Btn>}
            <Btn variant="primary" disabled={sending || !text.trim()} onClick={() => send(false)}>{mode === 'note' ? 'Add note' : 'Send'}</Btn>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default SupportTicketLeads;
