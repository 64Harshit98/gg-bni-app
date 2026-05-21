import React, { useState, useMemo, useRef, useEffect } from 'react';

type PaymentRecord = {
    date: string | number | Date;
    method: string;
    amount: number;
};

type LedgerTransaction = {
    id: string;
    invoiceNumber: string;
    createdAt: Date;
    totalAmount: number;
    dueAmount: number;
    type: string;
    paymentHistory: PaymentRecord[];
};

import { formatDate, formatDateForInput } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import FilterSelect from '../../Pages/Reports/SalesReportComponents/FilterSelect';
import { useAuth } from '../../context/auth-context';
import { CustomCard } from '../../Components/CustomCard';
import { IconChevronDown } from '../../constants/Icons';
import { db } from '../../lib/Firebase';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import BackButton from '../../Components/BackButton';
import { PaymentModal } from '../../constants/Modal';

const useOrdersData = (companyId?: string) => {
    const [Orders, setOrders] = React.useState<any[]>([]);

    React.useEffect(() => {
        if (!companyId) return;
        const ref = collection(db, 'companies', companyId, 'Orders');
        const q = query(ref, orderBy('createdAt', 'desc'));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setOrders(data);
        });
        return () => unsub();
    }, [companyId]);

    return { Orders };
};

const CataloguePartyLedger: React.FC = () => {
    const pageTopRef = useRef<HTMLDivElement | null>(null);
    const { currentUser } = useAuth();
    const { Orders } = useOrdersData(currentUser?.companyId);
    useEffect(() => {
        setLocalPaidOverrides(prev => {
            const updated = { ...prev };
            Orders.forEach((order: any) => {
                if (updated[order.id] !== undefined) {
                    // Firestore has caught up — remove the local override
                    delete updated[order.id];
                }
            });
            return updated;
        });

        setLocalPaymentHistories(prev => {
            const updated = { ...prev };
            Orders.forEach((order: any) => {
                if (updated[order.id] !== undefined) {
                    delete updated[order.id];
                }
            });
            return updated;
        });
    }, [Orders]);
    const [selectedPartyName, setSelectedPartyName] = useState<string | null>(null);
    const [selectedPartyNumber, setSelectedPartyNumber] = useState<string>('');
    const [isLoading] = useState(false);
    const [authLoading] = useState(false);
    const [error] = useState<string | null>(null);

    const [datePreset, setDatePreset] = useState('last30');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [appliedStartDate, setAppliedStartDate] = useState('');
    const [appliedEndDate, setAppliedEndDate] = useState('');

    const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'settled'>('all');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [localPaidOverrides, setLocalPaidOverrides] = useState<Record<string, number>>({});
    const [localPaymentHistories, setLocalPaymentHistories] = useState<Record<string, PaymentRecord[]>>({});
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any | null>(null);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };
    const handleSettlePayment = async (
        invoice: any,
        amount: number,
        method: string,
        chequeNumber?: string,
        chequeDate?: string
    ) => {
        try {
            if (!currentUser?.companyId) throw new Error('Company ID not found. Please log in again.');
            if (amount <= 0) throw new Error('Payment amount must be greater than 0.');
            if (!invoice.id) throw new Error('Invalid invoice data.');

            const { doc, runTransaction } = await import('firebase/firestore');
            const docRef = doc(db, 'companies', currentUser.companyId, 'Orders', invoice.id);

            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(docRef);
                if (!sfDoc.exists()) throw new Error('Order not found in database.');

                const data = sfDoc.data();
                const currentPaid = Number(data.paidAmount || 0);
                const currentTotal = Number(data.totalAmount || 0);
                const currentDue = currentTotal - currentPaid;

                if (amount > currentDue) {
                    throw new Error(`Payment amount (₹${amount}) exceeds due amount (₹${currentDue.toFixed(0)}).`);
                }

                const newPaid = currentPaid + amount;
                const paymentRecord = {
                    amount,
                    method: method.toLowerCase(),
                    date: new Date().toISOString(),
                    timestamp: Date.now(),
                    ...(method.toUpperCase() === 'PDC' && {
                        chequeNumber: chequeNumber || '',
                        chequeDate: chequeDate || '',
                    }),
                };

                const newStatus = newPaid >= currentTotal ? 'Paid' : data.status;

                transaction.update(docRef, {
                    paidAmount: newPaid,
                    paymentHistory: [...(data.paymentHistory || []), paymentRecord],
                    status: newStatus,
                    updatedAt: new Date(),
                });
            });

            // ✅ Update local state instantly — no refresh needed
            setLocalPaidOverrides(prev => ({
                ...prev,
                [invoice.id]: (prev[invoice.id] ?? Number(
                    Orders.find((o: any) => o.id === invoice.id)?.paidAmount || 0
                )) + amount,
            }));
            const newPaymentRecord: PaymentRecord = {
                amount,
                method: method.toLowerCase(),
                date: new Date().toISOString(),
                ...(method.toUpperCase() === 'PDC' && {
                    chequeNumber: chequeNumber || '',
                    chequeDate: chequeDate || '',
                }),
            };
            setLocalPaymentHistories(prev => ({
                ...prev,
                [invoice.id]: [...(prev[invoice.id] ?? []), newPaymentRecord],
            }));

            setIsPaymentModalOpen(false);
            setSelectedInvoiceForPayment(null);
            showToast(`Payment of ₹${amount} settled successfully!`, 'success');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            showToast(`Failed to settle payment: ${errorMessage}`, 'error');
            throw error;
        }
    };
    // Set default date range on mount
    useEffect(() => {
        const start = new Date();
        start.setDate(start.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const s = formatDateForInput(start);
        const e = formatDateForInput(end);
        setCustomStartDate(s);
        setCustomEndDate(e);
        setAppliedStartDate(s);
        setAppliedEndDate(e);
    }, []);

    useEffect(() => {
        if (!selectedPartyName) return;
        requestAnimationFrame(() => {
            pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }, [selectedPartyName]);
    useEffect(() => {
        const duplicateOrders = new Map();
        Orders.forEach(order => {
            if (duplicateOrders.has(order.orderId)) {
                console.warn('Duplicate Order Found:', order.orderId, {
                    first: duplicateOrders.get(order.orderId),
                    second: { name: order.userName, phone: order.userLoginPhone }
                });
            }
            duplicateOrders.set(order.orderId, { name: order.userName, phone: order.userLoginPhone });
        });
    }, [Orders]);

    const toggleBillExpansion = (billId: string) => {
        setExpandedBillId(prev => prev === billId ? null : billId);
    };

    const handleDatePresetChange = (preset: string) => {
        setDatePreset(preset);
        if (preset === 'custom') return;

        const start = new Date();
        const end = new Date();

        switch (preset) {
            case 'today':
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'last7':
                start.setDate(start.getDate() - 6);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'last30':
                start.setDate(start.getDate() - 29);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
                break;
            case 'thisMonth':
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                end.setFullYear(end.getFullYear(), end.getMonth() + 1, 0);
                end.setHours(23, 59, 59, 999);
                break;
        }

        setCustomStartDate(formatDateForInput(start));
        setCustomEndDate(formatDateForInput(end));
    };

    // ─── FILTERED ORDERS (respects applied date range) ───────────────────────
    const dateFilteredOrders = useMemo(() => {
        if (!appliedStartDate && !appliedEndDate) return Orders;
        const start = appliedStartDate ? new Date(appliedStartDate).setHours(0, 0, 0, 0) : 0;
        const end = appliedEndDate ? new Date(appliedEndDate).setHours(23, 59, 59, 999) : Date.now();
        return Orders.filter((order: any) => {
            const orderDate = order.createdAt?.toDate
                ? order.createdAt.toDate().getTime()
                : new Date(order.createdAt).getTime();
            return orderDate >= start && orderDate <= end;
        });
    }, [Orders, appliedStartDate, appliedEndDate]);

    // ─── PARTY LIST (from date-filtered orders) ───────────────────────────────
    const filteredParties = useMemo(() => {
        const map = new Map();
        dateFilteredOrders.forEach((order: any) => {
            const name = order.userName
                || order.billingDetails?.name
                || order.shippingDetails?.name
                || 'Unknown';
            const rawNumber = order.userLoginPhone
                || order.billingDetails?.phone
                || order.shippingDetails?.phone;

            const number = (rawNumber || '').toString().trim();
            const key = number
                ? number
                : `NO_PHONE_${name.toLowerCase().replace(/\s+/g, '_')}`;

            if (!map.has(key)) {
                map.set(key, {
                    partyName: name,
                    partyNumber: number,
                    totalBilled: 0,
                    totalDue: 0,
                    totalTransactions: 0,
                    partyType: 'Customer',
                });
            } else {
                const existing = map.get(key);
                if (name.length > existing.partyName.length) {
                    existing.partyName = name;
                }
            }
            const existing = map.get(key);
            const total = Number(order.totalAmount || 0);
            const paid = localPaidOverrides[order.id] !== undefined
                ? localPaidOverrides[order.id]
                : Number(order.paidAmount || 0);
            existing.totalBilled += total;
            existing.totalDue += Math.max(0, total - paid);
            existing.totalTransactions += 1;
        });

        const partyData = Array.from(map.values());

        const lowerQuery = searchQuery.toLowerCase();
        return partyData.filter(party => {
            const matchesSearch =
                !searchQuery.trim() ||
                party.partyName.toLowerCase().includes(lowerQuery) ||
                party.partyNumber.toLowerCase().includes(lowerQuery);

            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'due' && party.totalDue > 0) ||
                (statusFilter === 'settled' && party.totalDue === 0);

            return matchesSearch && matchesStatus;
        });
    }, [dateFilteredOrders, searchQuery, localPaidOverrides, statusFilter]);

    // ─── DETAIL LEDGER (uses same date-filtered orders) ───────────────────────
    const selectedPartyLedger = useMemo(() => {
        if (!selectedPartyName) return null;

        const transactions = dateFilteredOrders
            .filter((order: any) => {
                const orderPhone = (
                    order.userLoginPhone
                    || order.billingDetails?.phone
                    || order.shippingDetails?.phone
                    || ''
                ).toString().trim();

                const selectedPhone = (selectedPartyNumber || '').toString().trim();

                // ✅ Phone number hai toh sirf number se match karo (name ignore)
                if (selectedPhone) {
                    return orderPhone === selectedPhone;
                }

                // ✅ Phone nahi hai toh name se match karo (no-phone parties)
                const orderName = order.userName
                    || order.billingDetails?.name
                    || order.shippingDetails?.name
                    || 'Unknown';

                return orderName === selectedPartyName && (
                    !order.userLoginPhone &&
                    !order.billingDetails?.phone &&
                    !order.shippingDetails?.phone
                );
            })
            .map((order: any) => {
                const total = Number(order.totalAmount || 0);
                const paid = localPaidOverrides[order.id] !== undefined
                    ? localPaidOverrides[order.id]
                    : Number(order.paidAmount || 0);
                return {
                    id: order.id,
                    invoiceNumber: order.orderId,
                    createdAt: order.createdAt?.toDate ? order.createdAt.toDate() : new Date(),
                    totalAmount: total,
                    dueAmount: Math.max(0, total - paid),
                    type: 'sale',
                    paymentHistory: localPaymentHistories[order.id]
                        ?? (order.paymentHistory as PaymentRecord[] || []),
                };
            });

        return {
            transactions,
            totalBilled: transactions.reduce((sum, t) => sum + t.totalAmount, 0),
            totalDue: transactions.reduce((sum, t) => sum + t.dueAmount, 0),
        };
    }, [selectedPartyName, selectedPartyNumber, dateFilteredOrders, localPaidOverrides, localPaymentHistories, filteredParties]);

    const goBack = () => {
        setSelectedPartyName(null);
        setSelectedPartyNumber('');
        setExpandedBillId(null);
    };

    if (isLoading || authLoading) return <div className="p-4 text-center">Loading Ledger...</div>;
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    return (
        <div ref={pageTopRef} className="min-h-screen bg-gray-50 pb-16">
            {toast && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-md shadow-lg text-sm font-semibold text-white transition-all
                ${toast.type === 'success' ? 'bg-[#F97316]' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            )}
            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => { setIsPaymentModalOpen(false); setSelectedInvoiceForPayment(null); }}
                invoice={selectedInvoiceForPayment}
                onSubmit={handleSettlePayment}
            />
            {/* HEADER — master list only */}
            {!selectedPartyName && (
                <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-3">
                    <BackButton className="mt-2 ml-3" />
                    <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Party Ledger</h1>
                    <div className="w-10 mt-2 mr-3" />
                </div>
            )}

            {/* FILTERS — master list only */}
            {!selectedPartyName && (
                <div className="bg-white p-3 rounded-sm shadow-sm border border-gray-200 mb-4">
                    <div className="mb-3">
                        <input
                            type="text"
                            placeholder="Search by Party Name or Number..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                    </div>

                    <div className="mt-3">
                        <button
                            onClick={() => {
                                setAppliedStartDate(customStartDate);
                                setAppliedEndDate(customEndDate);
                                setSelectedPartyName(null);
                                setExpandedBillId(null);
                            }}
                            className="w-full px-3 py-2 bg-orange-500 text-white text-sm font-semibold rounded-md hover:bg-orange-600 transition-colors"
                        >
                            Apply
                        </button>
                    </div>
                    <div className="flex justify-center mt-3">
                        <div className="flex bg-gray-100 rounded-sm p-1 text-sm">
                            <button
                                onClick={() => setStatusFilter(prev => prev === 'due' ? 'all' : 'due')}
                                className={`px-3 py-1.5 rounded-sm transition ${statusFilter === 'due' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600'}`}
                            >
                                Due
                            </button>
                            <button
                                onClick={() => setStatusFilter(prev => prev === 'settled' ? 'all' : 'settled')}
                                className={`px-3 py-1.5 rounded-sm transition ${statusFilter === 'settled' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-600'}`}
                            >
                                Settled
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN VIEW */}
            {!selectedPartyName ? (
                // VIEW 1: MASTER LIST
                <div className="space-y-2 mt-2">
                    {filteredParties.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 bg-white">No parties found for this period.</div>
                    ) : (
                        filteredParties.map((party) => (
                            <CustomCard
                                key={`${party.partyName}-${party.partyNumber}`}
                                onClick={() => {
                                    console.log('Selected Party:', party.partyName, '| Number:', party.partyNumber);
                                    setSelectedPartyName(party.partyName);
                                    setSelectedPartyNumber(party.partyNumber);
                                    setExpandedBillId(null);
                                }}
                                className="cursor-pointer transition-shadow hover:shadow-md p-3.5 bg-white"
                            >
                                <div className="flex items-start justify-between mb-1.5">
                                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap bg-orange-50 text-orange-600 border-orange-200">
                                        {party.partyType}
                                    </span>
                                    <p className="text-xs text-slate-400">Total: ₹{party.totalBilled.toLocaleString('en-IN')}</p>
                                </div>
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
                // VIEW 2: DETAIL LEDGER
                <div className="flex flex-col gap-2">

                    {/* STICKY HEADER */}
                    <div className="sticky top-0 z-30 pt-2 pb-3 -mx-2 px-2 bg-gray-50">
                        <div className="flex items-center justify-between pb-2 mb-2">
                            <BackButton onClick={goBack} />
                            <h1 className="flex-1 text-lg text-center font-bold text-gray-800 truncate px-2">
                                {selectedPartyName} - Ledger
                            </h1>
                            <div className="w-10 h-10" />
                        </div>

                        {/* Summary Card */}
                        <div className="rounded-sm border border-slate-200 bg-white overflow-hidden">
                            <div className="bg-orange-50 border-b border-orange-100 px-4 py-2 flex justify-between items-center">
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
                                <div className="h-10 w-px bg-slate-200 mx-3" />
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
                        {selectedPartyLedger?.transactions.length === 0 && (
                            <div className="p-6 text-center text-gray-500 bg-white rounded-sm">No transactions found for this period.</div>
                        )}
                        {selectedPartyLedger?.transactions.map((txn: LedgerTransaction) => {
                            const isExpanded = expandedBillId === txn.id;
                            return (
                                <CustomCard key={txn.id} onClick={() => toggleBillExpansion(txn.id)} className="cursor-pointer transition-shadow hover:shadow-md bg-white">
                                    <div className="flex justify-between items-end w-full -mt-5 relative pointer-events-none">
                                        <div className="flex justify-start gap-1 flex-wrap max-w-[50%] pointer-events-auto">
                                            <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap bg-orange-50 text-orange-600 border-orange-200">
                                                {txn.type}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mt-2">
                                        <div className="flex-1">
                                            <p className="text-base font-semibold text-slate-800">{txn.invoiceNumber || txn.id.slice(0, 8)}</p>
                                            <p className="text-sm text-slate-500 mt-1">{formatDate(txn.createdAt.getTime())}</p>
                                        </div>

                                        <div className="flex-shrink-0 px-2 sm:px-4 flex items-center justify-center">
                                            {txn.dueAmount <= 0 ? (
                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded uppercase tracking-widest">Settled</span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded uppercase tracking-widest">Due</span>
                                            )}
                                        </div>

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
                                            <IconChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-3">
                                            <div className="relative py-2">
                                                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
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
                                                                <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border bg-orange-50 text-orange-600 border-orange-200">
                                                                    {payment.method === 'upi' ? 'UPI' : payment.method.replace(/_/g, ' ')}
                                                                </span>
                                                            </div>
                                                            <span className="font-semibold text-emerald-600 text-sm">
                                                                + {payment.amount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}
                                                            </span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <p className="text-xs text-slate-400 text-center py-3">No payment records found.</p>
                                                )}
                                            </div>
                                            {/* ✅ Settle Payment Button */}
                                            {txn.dueAmount > 0 && (
                                                <div className="mt-3 pt-3 border-t border-slate-200">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedInvoiceForPayment({
                                                                id: txn.id,
                                                                invoiceNumber: txn.invoiceNumber,
                                                                type: 'sale',
                                                                totalAmount: txn.totalAmount,
                                                                dueAmount: txn.dueAmount,
                                                                partyName: selectedPartyName,
                                                            });
                                                            setIsPaymentModalOpen(true);
                                                        }}
                                                        className="w-full px-4 py-2 text-sm font-semibold text-white bg-[#F97316] rounded-sm hover:bg-[#F97316] transition-colors"
                                                    >
                                                        Settle Payment
                                                    </button>
                                                </div>
                                            )}
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

export default CataloguePartyLedger;