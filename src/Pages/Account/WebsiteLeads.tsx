import React, { useEffect, useMemo, useState } from 'react';
import { arrayUnion, collection, doc, onSnapshot, orderBy, query, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import Loading from '../Loading/Loading';
import type { AdminCompany, RangeKey } from './superAdmin/data';
import { DAY_MS, ageText, downloadCsv, fmtDate, fmtDateTime, last10, loadCompanies, rangeFor, toDate, waLink } from './superAdmin/data';
import { Alert, Btn, Card, Chip, EmptyRow, Field, LinkBtn, PageHeader, PageShell, RangeTabs, SearchBox, SelectBox, StatCard, inputCls } from './superAdmin/ui';

type QueryStatus = 'new' | 'contacted' | 'issue' | 'converted' | 'not_interested';

const STATUS_META: Record<QueryStatus, { label: string; cls: string; dot: string; sub: string }> = {
  new: { label: 'NEW', cls: 'bg-blue-50 text-blue-700', dot: 'bg-blue-600', sub: 'not replied yet' },
  contacted: { label: 'PENDING', cls: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500', sub: 'in conversation' },
  issue: { label: 'ISSUE', cls: 'bg-red-100 text-red-700', dot: 'bg-red-600', sub: 'needs a fix' },
  converted: { label: 'CONVERTED', cls: 'bg-green-100 text-green-700', dot: 'bg-green-600', sub: '' },
  not_interested: { label: 'NOT INTERESTED', cls: 'bg-gray-200 text-gray-700', dot: 'bg-gray-400', sub: 'closed' },
};

// The old page defaulted every query to "pending" whether or not anyone replied.
const normalizeStatus = (s?: string): QueryStatus =>
  s === 'contacted' || s === 'issue' || s === 'converted' || s === 'not_interested' ? s : 'new';

interface Activity { type: string; text: string; at: Date | null; by?: string }

interface WebQuery {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  businessName: string;
  message: string;
  type: string;
  sourcePage: string;
  campaign: string;
  status: QueryStatus;
  submittedAt: Date | null;
  firstRepliedAt: Date | null;
  followUpAt: Date | null;
  activity: Activity[];
}

const toQuery = (id: string, d: any): WebQuery => ({
  id,
  fullName: d.fullName || d.name || '',
  email: d.email || '',
  phone: d.phone || d.phoneNumber || '',
  city: d.city || '',
  businessName: d.businessName || d.company || '',
  message: d.message || '',
  type: d.type || d.queryType || '',
  sourcePage: d.sourcePage || d.page || '',
  campaign: d.campaign || d.utm_campaign || '',
  status: normalizeStatus(d.status),
  submittedAt: toDate(d.submittedAt),
  firstRepliedAt: toDate(d.firstRepliedAt),
  followUpAt: toDate(d.followUpAt),
  activity: (Array.isArray(d.activity) ? d.activity : []).map((a: any) => ({ ...a, at: toDate(a.at) })),
});

const TYPE_CLS = (t: string) => {
  const s = t.toLowerCase();
  if (s.includes('demo')) return 'bg-violet-100 text-violet-700';
  if (s.includes('support')) return 'bg-red-100 text-red-700';
  return 'bg-blue-50 text-blue-700';
};

const hoursWaiting = (q: WebQuery) => q.submittedAt ? (Date.now() - q.submittedAt.getTime()) / 3_600_000 : 0;

const WebsiteLeadsDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const [queries, setQueries] = useState<WebQuery[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);

  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [statusFilter, setStatusFilter] = useState<'all' | QueryStatus | 'stale'>('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortKey, setSortKey] = useState<'oldest_unreplied' | 'newest' | 'oldest'>('oldest_unreplied');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const range = useMemo(() => rangeFor(rangeKey, custom), [rangeKey, custom]);

  useEffect(() => { loadCompanies().then(setCompanies).catch(console.error); }, []);

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'contacts'),
      where('submittedAt', '>=', Timestamp.fromMillis(range.start)),
      where('submittedAt', '<=', Timestamp.fromMillis(range.end)),
      orderBy('submittedAt', 'desc')
    );
    return onSnapshot(q, snap => {
      setQueries(snap.docs.map(d => toQuery(d.id, d.data())));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
  }, [range]);

  const stats = useMemo(() => {
    const by = (s: QueryStatus) => queries.filter(q => q.status === s).length;
    const replied = queries.filter(q => q.firstRepliedAt && q.submittedAt);
    const avgH = replied.length
      ? replied.reduce((s, q) => s + (q.firstRepliedAt!.getTime() - q.submittedAt!.getTime()), 0) / replied.length / 3_600_000
      : null;
    const stale = queries.filter(q => q.status === 'new' && hoursWaiting(q) > 24).length;
    return { new: by('new'), contacted: by('contacted'), issue: by('issue'), converted: by('converted'), notInterested: by('not_interested'), avgH, stale };
  }, [queries]);

  const types = useMemo(() => Array.from(new Set(queries.map(q => q.type).filter(Boolean))).sort(), [queries]);
  const hasSource = queries.some(q => q.sourcePage);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = queries.filter(q => {
      if (statusFilter === 'stale' && !(q.status === 'new' && hoursWaiting(q) > 24)) return false;
      if (statusFilter !== 'all' && statusFilter !== 'stale' && q.status !== statusFilter) return false;
      if (typeFilter !== 'all' && q.type !== typeFilter) return false;
      if (s && ![q.fullName, q.email, q.phone, q.businessName, q.city].some(x => x && x.toLowerCase().includes(s))) return false;
      return true;
    });
    const t = (d: Date | null) => d?.getTime() ?? 0;
    return [...list].sort((a, b) => {
      if (sortKey === 'newest') return t(b.submittedAt) - t(a.submittedAt);
      if (sortKey === 'oldest') return t(a.submittedAt) - t(b.submittedAt);
      const ra = a.status === 'new' ? 0 : 1, rb = b.status === 'new' ? 0 : 1;
      return ra - rb || (ra === 0 ? t(a.submittedAt) - t(b.submittedAt) : t(b.submittedAt) - t(a.submittedAt));
    });
  }, [queries, statusFilter, typeFilter, sortKey, search]);

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = queries.find(q => q.id === selectedId) || null;

  // Every contact action is logged; the first one also stamps the reply time
  // and moves a new query into conversation.
  const logActivity = async (q: WebQuery, type: string, text: string, extra: Record<string, any> = {}) => {
    const entry = { type, text, at: Timestamp.now(), by: currentUser?.name || 'Admin' };
    const payload: Record<string, any> = { activity: arrayUnion(entry), ...extra };
    const isReply = ['call', 'whatsapp', 'email'].includes(type);
    if (isReply && !q.firstRepliedAt) payload.firstRepliedAt = Timestamp.now();
    if (isReply && q.status === 'new' && !('status' in extra)) payload.status = 'contacted';
    try {
      await updateDoc(doc(db, 'contacts', q.id), payload);
    } catch (err) {
      console.error(err);
      alert('Failed to save.');
    }
  };

  const exportCsv = () => downloadCsv(
    `sellar-web-queries-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Received', 'Name', 'Email', 'Phone', 'Business', 'City', 'Type', 'Source page', 'Status', 'First reply', 'Message'],
    filtered.map(q => [q.submittedAt?.toISOString() || '', q.fullName, q.email, q.phone, q.businessName, q.city, q.type,
      q.sourcePage, STATUS_META[q.status].label, q.firstRepliedAt?.toISOString() || '', q.message]),
  );

  if (loading && queries.length === 0) return <Loading />;

  const fmtHours = (h: number | null) => h === null ? '—' : h < 1 ? `${Math.max(1, Math.round(h * 60))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
  const total = queries.length;

  return (
    <PageShell wide>
      <PageHeader
        title="Web Customer Queries"
        subtitle="Enquiries from the Sellar website, with who replied and how fast"
        actions={<>
          <RangeTabs value={rangeKey} options={['today', '7d', '30d', '90d', 'custom']} onChange={setRangeKey} custom={custom} onCustomChange={setCustom} />
          <Btn onClick={exportCsv}>Export CSV</Btn>
        </>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
        {(['new', 'contacted', 'issue', 'converted', 'not_interested'] as QueryStatus[]).map(s => {
          const n = s === 'new' ? stats.new : s === 'contacted' ? stats.contacted : s === 'issue' ? stats.issue : s === 'converted' ? stats.converted : stats.notInterested;
          return (
            <StatCard key={s} dot={STATUS_META[s].dot} label={STATUS_META[s].label} value={n}
              sub={s === 'converted' ? `${total ? Math.round((n / total) * 100) : 0}% of queries` : STATUS_META[s].sub}
              active={statusFilter === s} onClick={() => setStatusFilter(f => f === s ? 'all' : s)} />
          );
        })}
        <StatCard dot="bg-violet-600" label="Avg. first reply" value={fmtHours(stats.avgH)} sub="target: under 2 hrs"
          valueCls={stats.avgH !== null && stats.avgH > 2 ? 'text-red-600' : 'text-gray-900'} />
      </div>

      {stats.stale > 0 && (
        <Alert tone="red" action={<Btn size="sm" onClick={() => { setStatusFilter('stale'); setSortKey('oldest_unreplied'); }}>Show them</Btn>}>
          <b>{stats.stale} quer{stats.stale === 1 ? 'y has' : 'ies have'} had no reply for over 24 hours.</b> Website leads go cold fast — reply first, sort later.
        </Alert>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-4 items-start">
        <Card>
          <div className="p-4 flex flex-col md:flex-row gap-3 md:items-center border-b border-gray-200">
            <SearchBox className="flex-1" value={search} onChange={setSearch} placeholder="Search name, phone, email…" />
            <div className="grid grid-cols-2 sm:flex gap-2">
              {types.length > 0 && (
                <SelectBox label="Type" value={typeFilter} onChange={setTypeFilter}>
                  <option value="all">All types</option>
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </SelectBox>
              )}
              <SelectBox label="Sort" value={sortKey} onChange={v => setSortKey(v as any)}>
                <option value="oldest_unreplied">Oldest unreplied</option>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
              </SelectBox>
            </div>
          </div>
          <div className={`hidden md:grid ${hasSource ? 'grid-cols-[1.6fr_1fr_1fr_0.9fr_0.9fr]' : 'grid-cols-[1.8fr_1fr_1fr_1fr]'} gap-3 px-4 py-2.5 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200`}>
            <span>From</span><span>Type</span>{hasSource && <span>Source page</span>}<span>Waiting</span><span>Status</span>
          </div>
          {filtered.length === 0 ? <EmptyRow>No queries in this period.</EmptyRow> : filtered.map(q => {
            const waiting = q.status === 'new'
              ? { text: `${ageText(q.submittedAt)}${hoursWaiting(q) > 24 ? ' · no reply' : ''}`, cls: hoursWaiting(q) > 24 ? 'text-red-600' : 'text-gray-900' }
              : q.firstRepliedAt && q.submittedAt
                ? { text: `replied in ${fmtHours((q.firstRepliedAt.getTime() - q.submittedAt.getTime()) / 3_600_000)}`, cls: 'text-gray-600' }
                : { text: ageText(q.submittedAt), cls: 'text-gray-600' };
            return (
              <button key={q.id} onClick={() => setSelectedId(q.id)}
                className={`w-full text-left grid grid-cols-[1fr_auto] ${hasSource ? 'md:grid-cols-[1.6fr_1fr_1fr_0.9fr_0.9fr]' : 'md:grid-cols-[1.8fr_1fr_1fr_1fr]'} gap-x-3 gap-y-1 px-4 py-3 border-b border-gray-100 items-center ${selectedId === q.id ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{q.fullName || 'No name'}</p>
                  <p className="text-xs text-gray-500 truncate">{[q.phone, q.email].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="hidden md:block">{q.type ? <Chip cls={TYPE_CLS(q.type)}>{q.type}</Chip> : <span className="text-gray-400 text-sm">—</span>}</div>
                {hasSource && <div className="hidden md:block font-mono text-xs text-gray-700 truncate">{q.sourcePage || '—'}</div>}
                <div className={`hidden md:block text-sm font-semibold ${waiting.cls}`}>{waiting.text}</div>
                <div><Chip cls={STATUS_META[q.status].cls}>{STATUS_META[q.status].label}</Chip></div>
              </button>
            );
          })}
          <p className="px-4 py-3 text-sm text-gray-600">Showing {filtered.length} of {total} · click a row to open it</p>
        </Card>

        {selected ? (
          <QueryDetail key={selected.id} q={selected} companies={companies} onLog={logActivity} />
        ) : (
          <Card className="p-8 text-center text-sm text-gray-500">Select a query to see it here.</Card>
        )}
      </div>
    </PageShell>
  );
};

const QueryDetail: React.FC<{
  q: WebQuery;
  companies: AdminCompany[];
  onLog: (q: WebQuery, type: string, text: string, extra?: Record<string, any>) => Promise<void>;
}> = ({ q, companies, onLog }) => {
  const [status, setStatus] = useState<QueryStatus>(q.status);
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState(q.followUpAt ? q.followUpAt.toISOString().slice(0, 10) : '');
  const [saving, setSaving] = useState(false);

  const match = useMemo(() => {
    const p = last10(q.phone);
    const e = q.email.toLowerCase();
    return companies.find(c => (p && last10(c.phone) === p) || (e && c.email.toLowerCase() === e)) || null;
  }, [companies, q.phone, q.email]);

  const firstName = q.fullName.split(' ')[0] || 'there';
  const waText = `Hi ${firstName}, this is the Sellar team — thanks for reaching out on our website. `;

  const save = async () => {
    setSaving(true);
    const extra: Record<string, any> = {};
    const parts: string[] = [];
    if (status !== q.status) {
      extra.status = status;
      parts.push(`Status → ${STATUS_META[status].label}`);
      if (q.status === 'new' && !q.firstRepliedAt) extra.firstRepliedAt = Timestamp.now();
    }
    const fu = followUp ? new Date(`${followUp}T10:00:00`) : null;
    if ((fu?.getTime() ?? null) !== (q.followUpAt?.getTime() ?? null)) {
      extra.followUpAt = fu ? Timestamp.fromDate(fu) : null;
      parts.push(fu ? `Follow-up set for ${fmtDate(fu)}` : 'Follow-up cleared');
    }
    if (note.trim()) parts.push(note.trim());
    if (parts.length) await onLog(q, note.trim() ? 'note' : 'status', parts.join(' · '), extra);
    setNote('');
    setSaving(false);
  };

  const timeline = [
    { type: 'received', text: 'Query received', at: q.submittedAt, by: '' },
    ...[...q.activity].sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0)),
  ];

  return (
    <Card className="p-5 xl:sticky xl:top-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 truncate">{q.fullName || 'No name'}</h2>
          <p className="text-sm text-gray-600 truncate">{[q.phone, q.email].filter(Boolean).join(' · ')}</p>
          {(q.businessName || q.city) && <p className="text-sm text-gray-600">{[q.businessName, q.city].filter(Boolean).join(' · ')}</p>}
        </div>
        <Chip cls={STATUS_META[q.status].cls}>{STATUS_META[q.status].label}</Chip>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        {q.phone && <LinkBtn href={`tel:${q.phone}`} target="_self" onClick={() => onLog(q, 'call', 'Called')}>Call</LinkBtn>}
        {q.phone && <LinkBtn variant="green" href={waLink(q.phone, waText)} onClick={() => onLog(q, 'whatsapp', 'Opened WhatsApp')}>WhatsApp</LinkBtn>}
        {q.email && <LinkBtn href={`mailto:${q.email}?subject=${encodeURIComponent('Your Sellar enquiry')}`} target="_self" onClick={() => onLog(q, 'email', 'Emailed')}>Email</LinkBtn>}
        {q.status !== 'converted' && <Btn size="sm" variant="primary" onClick={() => { setStatus('converted'); onLog(q, 'status', 'Status → CONVERTED', { status: 'converted' }); }}>Mark converted</Btn>}
      </div>

      <div className="grid grid-cols-2 gap-2 mt-4">
        <Tile label="Asked about" value={q.type || '—'} />
        <Tile label="Came from" value={[q.sourcePage, q.campaign].filter(Boolean).join(' · ') || '—'} mono />
        <Tile label="Received" value={fmtDateTime(q.submittedAt)} />
        <Tile label="Existing customer?" value={match ? `${match.name} · ${match.id}` : 'No match found'} />
      </div>

      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-4 mb-1.5">Their message</p>
      <div className="border border-gray-200 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">{q.message || <span className="text-gray-400 italic">No message.</span>}</div>

      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-4 mb-1.5">Activity</p>
      <ul className="space-y-1.5 max-h-48 overflow-y-auto">
        {timeline.map((a, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${i === 0 ? 'bg-blue-600' : 'bg-gray-300'}`} />
            <span><b className="font-semibold">{a.text}</b> <span className="text-gray-500">· {fmtDateTime(a.at)}{a.by ? ` · ${a.by}` : ''}</span></span>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-3">
        <Field label="Status">
          <select value={status} onChange={e => setStatus(e.target.value as QueryStatus)} className={inputCls}>
            {(Object.keys(STATUS_META) as QueryStatus[]).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </Field>
        <Field label="Add a note">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="What did they say? Next step?" className={inputCls} />
        </Field>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <Field label="Follow-up">
            <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} className={inputCls} />
          </Field>
          <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Btn>
        </div>
        {q.followUpAt && q.followUpAt.getTime() < Date.now() + DAY_MS && q.status !== 'converted' && q.status !== 'not_interested' && (
          <p className="text-xs font-semibold text-amber-700">Follow-up due {fmtDate(q.followUpAt)}</p>
        )}
      </div>
    </Card>
  );
};

const Tile: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="rounded-lg bg-gray-50 p-2.5 min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">{label}</p>
    <p className={`text-sm font-semibold text-gray-900 truncate ${mono ? 'font-mono text-xs' : ''}`} title={value}>{value}</p>
  </div>
);

export default WebsiteLeadsDashboard;
