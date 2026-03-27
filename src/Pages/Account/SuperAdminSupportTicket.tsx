import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  where,
  Timestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import {
  Hash,
  Mail,
  Phone,
  Calendar,
  ChevronDown,
  Edit3,
  MessageSquare,
  Search
} from 'lucide-react';

import Loading from '../Loading/Loading';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import { IconClose } from '../../constants/Icons';
import FilterSelect from '../Reports/SalesReportComponents/FilterSelect';

interface SupportTicket {
  id: string;
  referenceNumber: string;
  fullName: string;
  email: string;
  phone: string;
  subject: string;
  description: string;
  status: 'received' | 'solved' | 'problem';
  createdAt: any;
}

const SupportTicketLeads: React.FC = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'received' | 'solved' | 'problem'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest'>('recent');

  // Date filter
  const [datePreset, setDatePreset] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [appliedFilters, setAppliedFilters] = useState<{ start: Date; end: Date } | null>(null);


  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const start = new Date();
    const end = new Date();

    if (preset === 'today') {
      // already set to today
    } else if (preset === 'yesterday') {
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
    } else if (preset === 'last7') {
      start.setDate(start.getDate() - 7);
    } else if (preset === 'last30') {
      start.setDate(start.getDate() - 30);
    } else {
      setStartDate('');
      setEndDate('');
      return;
    }

    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
  };

  const handleApplyFilters = () => {
    if (!startDate && !endDate) {
      setAppliedFilters(null);
      return;
    }
    const s = startDate ? new Date(startDate) : new Date(0);
    const e = endDate ? new Date(endDate) : new Date();
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: s, end: e });
  };
  // --- LIVE FIRESTORE LISTENER ---
  useEffect(() => {
    setLoading(true);

    let q = query(collection(db, "support_tickets"), orderBy("createdAt", "desc"));
    if (appliedFilters) {
      q = query(
        collection(db, "support_tickets"),
        where("createdAt", ">=", Timestamp.fromDate(appliedFilters.start)),
        where("createdAt", "<=", Timestamp.fromDate(appliedFilters.end)),
        orderBy("createdAt", "desc")
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SupportTicket[];
      setTickets(liveData);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [appliedFilters]);

  // --- STATS FOR FILTER CARDS ---
  const stats = useMemo(() => ({
    all: tickets.length,
    received: tickets.filter(t => t.status === 'received').length,
    solved: tickets.filter(t => t.status === 'solved').length,
    problem: tickets.filter(t => t.status === 'problem').length,
  }), [tickets]);

  const filteredTickets = useMemo(() => {
    let result = activeFilter === 'all' ? tickets : tickets.filter(t => t.status === activeFilter);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(t =>
        t.referenceNumber?.toLowerCase().includes(q) ||
        t.phone?.toLowerCase().includes(q) ||
        t.fullName?.toLowerCase().includes(q)
      );
    }

    // Apply sorting - create a new array and sort it
    const sortedResult = [...result].sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);

      if (sortBy === 'oldest') {
        return dateA.getTime() - dateB.getTime();
      } else {
        // Most Recent (default)
        return dateB.getTime() - dateA.getTime();
      }
    });

    return sortedResult;
  }, [tickets, activeFilter, searchQuery, sortBy]);

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, "support_tickets", id), { status: newStatus });
    } catch {
      alert("Failed to update status.");
    }
  };

  const toggleFilter = (f: typeof activeFilter) =>
    setActiveFilter(prev => (prev === f ? 'all' : f));

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'solved': return 'bg-green-100 text-green-600';
      case 'problem': return 'bg-red-100 text-red-600';
      default: return 'bg-blue-100 text-blue-600';
    }
  };

  if (loading) return <Loading />;

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16 md:p-6 md:pb-16 font-sans">

      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b mb-6">
        <div className="w-8" />
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800 md:text-2xl uppercase tracking-wider">
          Support Ticket Leads
        </h1>
        <button onClick={() => navigate(-1)} className="p-2 rounded-sm hover:bg-gray-200 transition-colors">
          <IconClose />
        </button>
      </div>

      {/* DATE FILTER */}
      <div className="bg-white p-3 rounded-sm shadow-md mb-4 md:p-5 md:rounded-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3">
          <FilterSelect value={datePreset} onChange={(e) => handleDatePresetChange(e.target.value)}>
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom</option>
          </FilterSelect>
          <div className="grid grid-cols-2 gap-2 sm:col-span-2">
            <input
              type="date" value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setDatePreset('custom'); }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-sm"
            />
            <input
              type="date" value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setDatePreset('custom'); }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-center">
          <button
            onClick={handleApplyFilters}
            className="w-full px-3 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-sm hover:bg-blue-700 md:w-auto md:px-10"
          >
            Apply
          </button>
        </div>
      </div>

      {/* SEARCH BAR & SORT */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ticket no. (TKT-0001), phone, or name..."
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-sm shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>

        {/* SORT DROPDOWN */}
        <div className="relative sm:w-48">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'recent' | 'oldest')}
            className="appearance-none w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-sm shadow-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer font-medium text-gray-700"
          >
            <option value="recent">Newest First</option>
            <option value="oldest">Oldest First</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* FILTER CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <div onClick={() => toggleFilter('received')}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeFilter === 'received' ? 'border-blue-600 bg-blue-50 shadow-md scale-105' : 'border-transparent'}`}>
          <CustomCard variant={CardVariant.Summary} title="Received" value={stats.received.toString()} />
        </div>
        <div onClick={() => toggleFilter('solved')}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeFilter === 'solved' ? 'border-green-600 bg-green-50 shadow-md scale-105' : 'border-transparent'}`}>
          <CustomCard variant={CardVariant.Summary} title="Solved" value={stats.solved.toString()} />
        </div>
        <div onClick={() => toggleFilter('problem')}
          className={`cursor-pointer rounded-sm transition-all border-2 ${activeFilter === 'problem' ? 'border-red-600 bg-red-50 shadow-md scale-105' : 'border-transparent'}`}>
          <CustomCard variant={CardVariant.Summary} title="Problems" value={stats.problem.toString()} />
        </div>
      </div>

      {/* COUNT LABEL */}
      <p className="text-xs text-gray-400 font-semibold uppercase mb-3 ml-1">
        Showing {filteredTickets.length} of {stats.all} tickets
        {activeFilter !== 'all' && ` — filtered by "${activeFilter}"`}
        {searchQuery && ` — searching "${searchQuery}"`}
      </p>

      {/* TICKET LIST */}
      <div className="flex flex-col gap-3">
        {filteredTickets.length === 0 ? (
          <div className="text-center p-10 text-gray-400 bg-white rounded-sm border border-gray-100">
            No tickets found.
          </div>
        ) : (
          filteredTickets.map((ticket) => (
            <div key={ticket.id} className="bg-white rounded-sm shadow-sm border border-gray-100 transition-all hover:shadow-md overflow-hidden">

              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase flex items-center gap-1">
                      <Hash className="w-3 h-3" /> {ticket.referenceNumber}
                    </span>
                    <h3 className="text-base font-bold text-gray-800">{ticket.fullName}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-sm font-bold uppercase ${getStatusStyle(ticket.status)}`}>
                      {ticket.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 mt-1">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      <a href={`mailto:${ticket.email}`} className="hover:text-blue-600 transition-colors">
                        {ticket.email}
                      </a>
                    </p>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      <a href={`tel:${ticket.phone}`} className="hover:text-blue-600 transition-colors">
                        {ticket.phone || 'N/A'}
                      </a>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 ">
                  <p className="text-[11px] text-gray-400 flex items-center gap-1 whitespace-nowrap">
                    <Calendar className="w-3 h-3" />
                    {ticket.createdAt?.toDate
                      ? ticket.createdAt.toDate().toLocaleString('en-IN')
                      : 'Loading...'}
                  </p>
                  <div className="relative">
                    <select
                      value={ticket.status}
                      onChange={(e) => handleStatusChange(ticket.id, e.target.value)}
                      className="appearance-none bg-gray-50 border border-gray-200 text-xs font-bold py-2 px-4 pr-10 rounded-sm cursor-pointer focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="received">RECEIVED</option>
                      <option value="solved">SOLVED</option>
                      <option value="problem">PROBLEM</option>
                    </select>
                    <Edit3 className="w-3 h-3 absolute right-3 top-2.5 text-gray-400 pointer-events-none" />
                  </div>
                  <button
                    onClick={() => setExpandedId(expandedId === ticket.id ? null : ticket.id)}
                    className="p-2 rounded-sm text-gray-400 hover:bg-gray-100 transition-colors"
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${expandedId === ticket.id ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {expandedId === ticket.id && (
                <div className="border-t border-gray-100 bg-[#fbfcfd] p-5">
                  <div className="flex flex-col gap-6">
                    <div className="relative pl-4 border-l-4 border-blue-500">
                      <h4 className="text-[10px] font-bold text-blue-600/70 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                        <MessageSquare className="w-3 h-3" /> Subject
                      </h4>
                      <p className="text-base font-bold text-gray-900 leading-tight">{ticket.subject}</p>
                    </div>
                    <div className="group">
                      <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-sm bg-gray-300" /> Description
                      </h4>
                      <div className="relative">
                        <span className="absolute -top-2 -left-2 text-4xl text-gray-100 font-serif pointer-events-none select-none">"</span>
                        <div className="bg-white p-4 rounded-sm border border-gray-200 shadow-sm ring-1 ring-black/5 hover:ring-blue-100 transition-all duration-300">
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          ))
        )}
      </div>

    </div>
  );
};

export default SupportTicketLeads;