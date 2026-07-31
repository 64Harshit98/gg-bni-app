import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import { collection, query, where, orderBy, onSnapshot, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import { IconClose } from '../../constants/Icons';
import FilterSelect from '../Reports/SalesReportComponents/FilterSelect';

interface Lead {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  message: string;
  status: 'pending' | 'issue' | 'converted' | 'not_interested';
  submittedAt?: any;
}

const SUPER_ADMIN_UIDS = [
  "6vwZ1HRqX7VSnh5KP4JW0TKeuZm2",
  "1AKioGfop8PmHhry6uXOz8Rw6qT2"
];

const WebsiteLeadsDashboard: React.FC = () => {
  const navigate = useNavigate();

  const { currentUser } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeStatus, setActiveStatus] = useState<string>('all');
  const [datePreset, setDatePreset] = useState('today');

  const toDateStr = (date: Date) => date.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(() => toDateStr(new Date()));
  const [endDate, setEndDate] = useState(() => toDateStr(new Date()));

  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number }>(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const end = new Date(); end.setHours(23, 59, 59, 999);
    return { start: start.getTime(), end: end.getTime() };
  });
  const [loading, setLoading] = useState(true);
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);

  // 1. Handle Date Presets
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    if (preset === 'custom') return;

    const start = new Date();
    const end = new Date();

    switch (preset) {
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        break;
      case 'last7':
        start.setDate(start.getDate() - 6);
        break;
      case 'last30':
        start.setDate(start.getDate() - 29);
        break;
      // 'today' — start/end already today
    }

    setStartDate(toDateStr(start));
    setEndDate(toDateStr(end));
  };

  const handleApplyFilters = () => {
    const s = startDate ? new Date(startDate) : new Date(0);
    const e = endDate ? new Date(endDate) : new Date();
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: s.getTime(), end: e.getTime() });
  };
  useEffect(() => {
    const today = new Date();
    const start = new Date(today);
    const end = new Date(today);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  }, []);

  // 2. Firebase Listener
  useEffect(() => {
    if (!currentUser || !SUPER_ADMIN_UIDS.includes(currentUser.uid)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "contacts"),
      where("submittedAt", ">=", Timestamp.fromMillis(appliedFilters.start)),
      where("submittedAt", "<=", Timestamp.fromMillis(appliedFilters.end)),
      orderBy("submittedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLeads(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Lead[]);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [appliedFilters]);

  // 3. Status Update Logic
  const updateStatus = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "contacts", id), { status: newStatus as any });
    } catch (err) {
      console.error("Update failed", err);
    }
  };

  // 4. Stats & Filtering
  // Stats always reflect active date range (already filtered by Firebase query)
  const stats = useMemo(() => ({
    pending: leads.filter(l => !l.status || l.status === 'pending').length,
    issue: leads.filter(l => l.status === 'issue').length,
    converted: leads.filter(l => l.status === 'converted').length,
    not_interested: leads.filter(l => l.status === 'not_interested').length,
  }), [leads]);

  // Status filter applied on top of already date-filtered leads
  const filteredLeads = useMemo(() => {
    if (activeStatus === 'all') return leads;
    return leads.filter(l => (l.status || 'pending') === activeStatus);
  }, [leads, activeStatus]);

  const toggleExpand = (id: string) => {
    setExpandedLeadId(prev => (prev === id ? null : id));
  };

  return (
    <div className="min-h-screen bg-muted p-2 pb-16 md:p-6 md:pb-16 font-sans">

      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b mb-2 md:mb-4">
        <h1 className="flex-1 text-xl text-center font-bold text-foreground md:text-2xl">
          Website Query
        </h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

      {/* FILTERS */}
      <div className="bg-card p-2 rounded-sm shadow-md mb-2 md:p-5 md:mb-4 md:rounded-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:grid-cols-1 md:gap-3">
          <div className="sm:col-span-1 md:col-span-1">
            <FilterSelect value={datePreset} onChange={(e) => handleDatePresetChange(e.target.value)}>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="custom">Custom</option>
            </FilterSelect>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:col-span-2 md:col-span-1 md:grid-cols-2 md:gap-4">
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-muted border rounded-sm md:p-2.5" />
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-muted border rounded-sm md:p-2.5" />
          </div>
        </div>
        <div className="mt-2 md:mt-3 md:flex md:justify-center">
          <button onClick={handleApplyFilters} className="w-full px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-sm hover:bg-blue-700 md:w-auto md:px-10 md:py-2">
            Apply
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 gap-2 mb-4 md:grid-cols-4 md:gap-4">
        <div
          onClick={() => setActiveStatus('pending')}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeStatus === 'pending' ? 'border-blue-600 bg-blue-50 shadow-md scale-105' : 'border-transparent'}`}
        >
          <CustomCard variant={CardVariant.Summary} title="Pending" value={stats.pending.toString()} />
        </div>

        <div
          onClick={() => setActiveStatus('issue')}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeStatus === 'issue' ? 'border-red-600 bg-red-50 shadow-md scale-105' : 'border-transparent'}`}
        >
          <CustomCard variant={CardVariant.Summary} title="Issue" value={stats.issue.toString()} />
        </div>

        <div
          onClick={() => setActiveStatus('converted')}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeStatus === 'converted' ? 'border-green-600 bg-green-50 shadow-md scale-105' : 'border-transparent'}`}
        >
          <CustomCard variant={CardVariant.Summary} title="Converted" value={stats.converted.toString()} />
        </div>

        <div
          onClick={() => setActiveStatus('not_interested')}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeStatus === 'not_interested' ? 'border-gray-600 bg-muted shadow-md scale-105' : 'border-transparent'}`}
        >
          <CustomCard variant={CardVariant.Summary} title="Not Interested" value={stats.not_interested.toString()} />
        </div>
      </div>

      {/* RECTANGLE ROW LIST */}
      <div className="flex flex-col gap-3">
        {filteredLeads.map((lead) => {
          const isExpanded = expandedLeadId === lead.id;

          return (
            <div
              key={lead.id}
              className="bg-card rounded-sm shadow-sm border border-border transition-all hover:shadow-md overflow-hidden"
            >
              {/* MAIN ROW */}
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer" onClick={() => toggleExpand(lead.id)}>

                {/* Left: Name, Status, Email, Phone, City */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h3 className="text-base font-bold text-foreground">{lead.fullName}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase ${lead.status === 'converted' ? 'bg-green-100 text-green-600' :
                      lead.status === 'issue' ? 'bg-red-100 text-red-600' :
                        lead.status === 'not_interested' ? 'bg-muted text-muted-foreground' :
                          'bg-orange-100 text-orange-600'
                      }`}>
                      {lead.status || 'pending'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5">
                    <p className="text-sm text-muted-foreground font-medium">{lead.email}</p>
                    {lead.phone && (
                      <p className="text-sm text-muted-foreground font-medium flex items-center gap-1">
                        📞 {lead.phone}
                      </p>
                    )}
                    {lead.city && (
                      <p className="text-sm text-muted-foreground font-medium flex items-center gap-1">
                        📍 {lead.city}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: Dropdown + Expand Arrow */}
                <div className="flex items-center gap-2 mt-1 md:mt-0">
                  <div className="relative flex-1 md:flex-none">
                    <select
                      value={lead.status || 'pending'}
                      onChange={(e) => updateStatus(lead.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full md:w-56 text-xs font-bold bg-muted border border-border rounded-sm px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer"
                    >
                      <option value="pending">PENDING</option>
                      <option value="issue">PENDING ISSUE</option>
                      <option value="converted">CONVERTED</option>
                      <option value="not_interested">NOT INTERESTED</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-muted-foreground">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expand/Collapse Arrow */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleExpand(lead.id); }}
                    className="p-2 rounded-sm hover:bg-muted transition-colors flex-shrink-0"
                    aria-label={isExpanded ? 'Collapse message' : 'Expand message'}
                  >
                    <svg
                      className={`w-5 h-5 text-muted-foreground transition-transform duration-300 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* EXPANDABLE MESSAGE */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-3 border-t border-border bg-muted">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Message</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {lead.message || <span className="text-muted-foreground italic">No message provided.</span>}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {leads.length === 0 && !loading && (
        <div className="text-center p-10 text-muted-foreground">No queries found for this period.</div>
      )}
    </div>
  );
};

export default WebsiteLeadsDashboard;