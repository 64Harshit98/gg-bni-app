import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import FilterSelect from './SalesReportComponents/FilterSelect';
import { formatDate, formatDateForInput } from './SalesReportComponents/salesReport.utils';
import usePartyLedger, { type LedgerTransaction, type PaymentRecord } from './PartyLedger/usePartyLedger';

import { CustomCard } from '../../Components/CustomCard';
import { IconClose, IconChevronDown } from '../../constants/Icons';

const PartyLedger: React.FC = () => {
    const navigate = useNavigate();
    const {
        isLoading, authLoading, error,
        datePreset, setDatePreset,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        setAppliedFilters, partySummaries,
        selectedPartyName, setSelectedPartyName,
        selectedPartyLedger,
    } = usePartyLedger();

    const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [partyTypeFilter, setPartyTypeFilter] = useState<'all' | 'Customer' | 'Supplier'>('all');

    useEffect(() => {
        // Set default to last 30 days (acts as last month)
        handleDatePresetChange('last30');
    }, []);

    const toggleBillExpansion = (billId: string) => {
        setExpandedBillId(prev => prev === billId ? null : billId);
    };

    const handleDatePresetChange = (preset: string) => {
        setDatePreset(preset);
        const start = new Date();
        const end = new Date();

        switch (preset) {
            case 'today':
                break;
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
            case 'thisMonth':
                start.setDate(1);
                end.setFullYear(end.getFullYear(), end.getMonth() + 1, 0);
                break;
            case 'custom':
                return;
        }

        setCustomStartDate(formatDateForInput(start));
        setCustomEndDate(formatDateForInput(end));
    };

    const handleApplyFilters = () => {
        const start = customStartDate ? new Date(customStartDate) : new Date(0);
        start.setHours(0, 0, 0, 0);
        const end = customEndDate ? new Date(customEndDate) : new Date();
        end.setHours(23, 59, 59, 999);

        setAppliedFilters({ start: start.getTime(), end: end.getTime() });
        setSelectedPartyName(null);
        setExpandedBillId(null);
    };

    const filteredParties = useMemo(() => {
        const lowerQuery = searchQuery.toLowerCase();
        return partySummaries.filter(party => {
            const matchesSearch =
                !searchQuery.trim() ||
                party.partyName.toLowerCase().includes(lowerQuery) ||
                party.partyNumber.toLowerCase().includes(lowerQuery);

            const matchesType =
                partyTypeFilter === 'all' ||
                party.partyType === partyTypeFilter;

            return matchesSearch && matchesType;
        });
    }, [searchQuery, partyTypeFilter, partySummaries]);

    if (isLoading || authLoading) return <div className="p-4 text-center">Loading Ledger...</div>;
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-16">

            {/* HEADER FOR MASTER LIST ONLY */}
            {!selectedPartyName && (
                <div className="flex items-center justify-between pb-2 border-b border-gray-200 mb-3">
                    <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
                        Party Ledger
                    </h1>
                    <button onClick={() => navigate(-1)} className="p-2">
                        <IconClose width={20} height={20} />
                    </button>
                </div>
            )}

            {/* FILTERS & SEARCH (Hidden when viewing detail) */}
            {!selectedPartyName && (
                <div className="bg-white p-3 rounded-sm shadow-sm border border-gray-200 mb-4">
                    <div className="mb-3">
                        <input
                            type="text"
                            placeholder="Search by Party Name or Number..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <FilterSelect value={datePreset} onChange={(e) => handleDatePresetChange(e.target.value)}>
                            <option value="today">Today</option>
                            <option value="yesterday">Yesterday</option>
                            <option value="last7">Last 7 Days</option>
                            <option value="last30">Last 30 Days</option>
                            <option value="thisMonth">This Month</option>
                            <option value="custom">Custom</option>
                        </FilterSelect>
                        <div className="grid grid-cols-2 gap-2 sm:gap-4">
                            <input type="date" value={customStartDate} onChange={(e) => { setCustomStartDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-gray-50 border border-gray-200 rounded-sm" />
                            <input type="date" value={customEndDate} onChange={(e) => { setCustomEndDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-gray-50 border border-gray-200 rounded-sm" />
                        </div>
                        <FilterSelect value={partyTypeFilter} onChange={(e) => setPartyTypeFilter(e.target.value as any)}>
                            <option value="all">All Parties</option>
                            <option value="Customer">Customer</option>
                            <option value="Supplier">Supplier</option>
                        </FilterSelect>
                    </div>
                    <button onClick={handleApplyFilters} className="w-full mt-3 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-sm hover:bg-blue-700 transition-colors">
                        Apply
                    </button>
                </div>
            )}

            {/* MAIN VIEW */}
            {!selectedPartyName ? (
                // VIEW 1: MASTER LIST (Unified List Container with Card-like row layouts)
                <div className="space-y-2 mt-2">
                    {filteredParties.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 bg-white">No parties found for this period.</div>
                    ) : (
                        filteredParties.map((party) => (
                            <CustomCard
                                key={party.partyName}
                                onClick={() => setSelectedPartyName(party.partyName)}
                                className="cursor-pointer transition-shadow hover:shadow-md bg-white"
                            >
                                {/* Top Row: Badge and Total */}
                                <div className="flex items-start justify-between mb-1.5">
                                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap ${party.partyType === 'Customer' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                        party.partyType === 'Supplier' ? 'bg-purple-50 text-purple-600 border-purple-200' :
                                            'bg-orange-50 text-orange-600 border-orange-200'
                                        }`}>
                                        {party.partyType}
                                    </span>
                                    <p className="text-xs text-slate-400">
                                        Total: ₹{party.totalBilled.toLocaleString('en-IN')}
                                    </p>
                                </div>

                                {/* Bottom Row: Name/Number and Pending Due */}
                                <div className="flex items-end justify-between">
                                    <div>
                                        <p className="text-base font-semibold text-slate-800">{party.partyName}</p>
                                        <p className="text-sm text-slate-500 mt-0.5">
                                            {party.partyNumber || 'N/A'} <span className="mx-1 text-slate-300">•</span> {party.totalTransactions} Bills
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-lg font-bold ${party.totalDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                            {party.totalDue > 0 ? 'Due: ' : ''}₹{party.totalDue.toLocaleString('en-IN')}
                                        </p>
                                    </div>
                                </div>
                            </CustomCard>
                        ))
                    )}
                </div>
            ) : (
                // VIEW 2: DETAILED LEDGER
                <div className="flex flex-col gap-2">

                    {/* UNIFIED STICKY HEADER: Title + Summary Card */}
                    <div className="sticky top-0 z-30 pt-2 pb-3 -mx-2 px-2 backdrop-blur-md ">
                        {/* Top Bar with Title and Close */}
                        <div className="flex items-center justify-between pb-2 mb-2">
                            <h1 className="flex-1 text-lg text-center font-bold text-gray-800 truncate px-2">
                                {selectedPartyName} - Ledger
                            </h1>
                            <button
                                onClick={() => {
                                    setSelectedPartyName(null);
                                    setExpandedBillId(null);
                                }}
                                className="p-2 text-gray-500 hover:bg-gray-200 rounded-full transition-colors"
                            >
                                <IconClose width={20} height={20} />
                            </button>
                        </div>

                        {/* Summary Card */}
                        <div className="rounded-sm border border-slate-200 bg-white overflow-hidden">
                            <div className="bg-sky-100 border-b border-slate-100 px-4 py-2 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ledger Summary</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedPartyLedger?.transactions.length} Bills</span>
                            </div>
                            <div className="p-4 flex justify-between items-center">
                                <div className="flex flex-col flex-1">
                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Billed</span>
                                    <span className="text-lg sm:text-xl font-extrabold text-slate-800 truncate">
                                        ₹{selectedPartyLedger?.totalBilled.toLocaleString('en-IN')}
                                    </span>
                                </div>
                                <div className="h-10 w-px bg-slate-200 mx-3"></div>
                                <div className="flex flex-col flex-1 text-right">
                                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Pending</span>
                                    <span className={`text-lg sm:text-xl font-extrabold truncate ${selectedPartyLedger && selectedPartyLedger.totalDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                        ₹{selectedPartyLedger?.totalDue.toLocaleString('en-IN')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bill Cards */}
                    <div className="px-1 space-y-3">
                        {selectedPartyLedger?.transactions.map((txn: LedgerTransaction) => {
                            const isExpanded = expandedBillId === txn.id;

                            return (
                                <CustomCard key={txn.id} onClick={() => toggleBillExpansion(txn.id)} className="cursor-pointer transition-shadow hover:shadow-md bg-white">
                                    <div className="flex justify-between items-end w-full -mt-5 relative pointer-events-none">
                                        {/* LEFT: Transaction Type Badge */}
                                        <div className="flex justify-start gap-1 flex-wrap max-w-[50%] pointer-events-auto">
                                            <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap ${txn.type === 'sale' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-purple-50 text-purple-600 border-purple-200'}`}>
                                                {txn.type}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mt-2">
                                        {/* LEFT ALIGNED INFO */}
                                        <div className="flex-1">
                                            <p className="text-base font-semibold text-slate-800">{txn.invoiceNumber || txn.id.slice(0, 8)}</p>
                                            <p className="text-sm text-slate-500 mt-1">{formatDate(txn.createdAt)}</p>
                                        </div>

                                        {/* CENTER SETTLED BADGE */}
                                        <div className="flex-shrink-0 px-2 sm:px-4 flex items-center justify-center">
                                            {txn.dueAmount <= 0 ? (
                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded uppercase tracking-widest">
                                                    Settled
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded uppercase tracking-widest">
                                                    Due
                                                </span>
                                            )}
                                        </div>

                                        {/* RIGHT ALIGNED AMOUNTS & CHEVRON */}
                                        <div className="flex items-center justify-end space-x-3 flex-1">
                                            <div className="text-right">
                                                {txn.dueAmount > 0 ? (
                                                    <>
                                                        <p className="text-lg font-bold text-red-600">{txn.dueAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
                                                        <p className="text-xs text-slate-400">Total: {txn.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
                                                    </>
                                                ) : (
                                                    <p className="text-lg font-bold text-slate-800">{txn.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</p>
                                                )}
                                            </div>
                                            {IconChevronDown ? (
                                                <IconChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                                            ) : (
                                                <div className={`transition-transform duration-200 text-slate-400 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}>▼</div>
                                            )}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-3">
                                            <div className="relative py-2">
                                                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                                    <div className="w-full border-t border-slate-200"></div>
                                                </div>
                                                <div className="relative flex justify-center">
                                                    <span className="bg-white px-2 text-xs font-bold text-slate-400 uppercase tracking-widest">Payment History</span>
                                                </div>
                                            </div>

                                            <div className="space-y-1 mt-2">
                                                {txn.paymentHistory && txn.paymentHistory.length > 0 ? (
                                                    txn.paymentHistory.map((payment: PaymentRecord, index: number) => (
                                                        <div key={index} className="flex justify-between items-center text-slate-700 py-2 border-b border-slate-50 last:border-0">
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex flex-col">
                                                                    <span className="font-medium text-sm text-slate-600">
                                                                        {new Date(payment.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-400">
                                                                        {new Date(payment.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                                                    </span>
                                                                </div>

                                                                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-600 border-blue-200">
                                                                    {payment.method === 'upi' ? 'UPI' : payment.method.replace(/_/g, ' ')}
                                                                </span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="font-semibold text-emerald-600 text-sm">
                                                                    + {payment.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-xs text-slate-400 text-center py-3">No payment records found.</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </CustomCard>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default PartyLedger;