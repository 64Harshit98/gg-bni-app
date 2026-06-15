import React, { useState, useMemo, useEffect } from 'react';
import FilterSelect from './SalesReportComponents/FilterSelect';
import { formatDate, formatDateForInput } from './SalesReportComponents/salesReport.utils';
import usePartyLedger, { type LedgerTransaction, type PaymentRecord } from './PartyLedger/usePartyLedger';

import { CustomCard } from '../../Components/CustomCard';
import { PaymentModal } from '../../constants/Modal';
import { IconChevronDown } from '../../constants/Icons';
import BackButton from '../../Components/BackButton';

const PartyLedger: React.FC = () => {
    const {
        companyId, isLoading, authLoading, error,
        datePreset, setDatePreset,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        setAppliedFilters, partySummaries,
        selectedPartyName, setSelectedPartyName,
        selectedPartyLedger,
        updateTransactionLocally,
        updateOpeningBalanceLocally,
        addOpeningBalance,
    } = usePartyLedger();

    const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
    const [showTransactionList, setShowTransactionList] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [partyTypeFilter, setPartyTypeFilter] = useState<'all' | 'Customer' | 'Supplier' | 'Both'>('all');
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<any | null>(null);
    const [statusFilter, setStatusFilter] = useState<'all' | 'due' | 'settled'>('all');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isOBModalOpen, setIsOBModalOpen] = useState(false);
    const [availableCredit, setAvailableCredit] = useState<number>(0);
    const [obForm, setObForm] = useState({
        partyName: '',
        partyNumber: '',
        partyType: 'Customer' as 'Customer' | 'Supplier',
        balanceType: 'due' as 'due' | 'advance', // 'due' = they owe you, 'advance' = you owe them
        amount: '',
        note: ''
    });
    const [obLoading, setObLoading] = useState(false);

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };
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
        setShowTransactionList(false);
    };
    const handleAddOpeningBalance = async () => {
        if (!obForm.partyName.trim() || !obForm.amount || Number(obForm.amount) <= 0) {
            showToast('Please fill in party name and a valid amount.', 'error');
            return;
        }
        setObLoading(true);
        try {
            await addOpeningBalance(
                obForm.partyName.trim(),
                obForm.partyNumber.trim(),
                obForm.partyType,
                Number(obForm.amount),
                obForm.note.trim(),
                obForm.balanceType  // ✅ pass balanceType
            );
            setIsOBModalOpen(false);
            setObForm({ partyName: '', partyNumber: '', partyType: 'Customer', balanceType: 'due', amount: '', note: '' });
            showToast('Opening balance added successfully!', 'success');
        } catch (e) {
            showToast('Failed to add opening balance.', 'error');
        } finally {
            setObLoading(false);
        }
    };

    // ✅ FIXED: Complete rewrite of handleSettlePayment
    const handleSettlePayment = async (
        invoice: any,
        amount: number,
        method: string,
        chequeNumber?: string,
        chequeDate?: string
    ) => {
        try {
            // ✅ Validation: Check companyId exists
            if (!companyId) {
                throw new Error('Company ID not found. Please log in again.');
            }
            // Handle opening balance settlement separately
            if (invoice.isOpeningBalance) {
                const { db } = await import('../../lib/Firebase');
                const { doc, runTransaction } = await import('firebase/firestore');
                const obRef = doc(db, 'companies', companyId, 'openingBalances', invoice.id);
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(obRef);
                    if (!sfDoc.exists()) throw new Error('Opening balance record not found.');
                    const data = sfDoc.data();
                    const currentDue = data.dueAmount ?? data.amount ?? 0;
                    if (amount > currentDue) throw new Error(`Amount (₹${amount}) exceeds due (₹${currentDue}).`);
                    const paymentRecord = {
                        amount, method: method.toLowerCase(), date: new Date().toISOString(), timestamp: Date.now(),
                        ...(method.toUpperCase() === 'PDC' && { chequeNumber: chequeNumber || '', chequeDate: chequeDate || '' }),
                    };
                    transaction.update(obRef, {
                        dueAmount: Math.max(0, currentDue - amount),
                        paymentHistory: [...(data.paymentHistory || []), paymentRecord],
                    });

                    const obBalanceType = data.balanceType || 'due';
                    const partyNum = (data.partyNumber || '').trim();
                    const partyType = data.partyType || 'Customer';
                    const { doc: firestoreDoc, increment } = await import('firebase/firestore');

                    // Advance OB settle: creditBalance/debitBalance kam karo
                    if (partyNum.length >= 3 && obBalanceType === 'advance') {
                        const collectionName = partyType === 'Customer' ? 'customers' : 'suppliers';
                        const balanceField = partyType === 'Customer' ? 'creditBalance' : 'debitBalance';
                        const partyRef = firestoreDoc(db, 'companies', companyId, collectionName, partyNum);
                        transaction.update(partyRef, {
                            [balanceField]: increment(-amount),
                        });
                    }

                    // ✅ Credit Note se OB due settle: customer ka creditBalance kam karo
                    const normalizedMethod = method.toLowerCase().replace(/\s+/g, '');
                    const isCreditNote = normalizedMethod === 'credit' || normalizedMethod === 'creditnote';
                    if (isCreditNote && partyNum.length >= 3 && obBalanceType === 'due') {
                        const collectionName = partyType === 'Customer' ? 'customers' : 'suppliers';
                        const balanceField = partyType === 'Customer' ? 'creditBalance' : 'debitBalance';
                        const partyRef = firestoreDoc(db, 'companies', companyId, collectionName, partyNum);
                        transaction.update(partyRef, {
                            [balanceField]: increment(-amount),
                        });
                    }
                });
                const paymentRecord: PaymentRecord = {
                    amount, method: method.toLowerCase(), date: new Date().toISOString(), timestamp: Date.now(),
                    ...(method.toUpperCase() === 'PDC' && { chequeNumber: chequeNumber || '', chequeDate: chequeDate || '' }),
                };
                updateOpeningBalanceLocally(invoice.id, amount, paymentRecord);
                setIsPaymentModalOpen(false);
                setSelectedInvoiceForPayment(null);
                showToast(`Opening balance payment of ₹${amount} settled via ${method}!`, 'success');
                return;
            }
            // ✅ Validation: Check amount is valid
            if (amount <= 0) {
                throw new Error('Payment amount must be greater than 0.');
            }

            // ✅ Validation: Check invoice has required fields
            if (!invoice.id || !invoice.type) {
                throw new Error('Invalid invoice data.');
            }

            const { db } = await import('../../lib/Firebase');
            const { doc, runTransaction } = await import('firebase/firestore');

            // ✅ Use correct collection based on invoice type
            const collectionName = invoice.type === 'sale' ? 'sales' : 'purchases';
            const docRef = doc(db, 'companies', companyId, collectionName, invoice.id);

            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(docRef);

                // ✅ Verify document exists
                if (!sfDoc.exists()) {
                    throw new Error('Invoice not found in database.');
                }

                const data = sfDoc.data();

                // ✅ Safely get current due amount from multiple sources
                const currentPaymentMethods = data.paymentMethods || {};
                const currentDue = currentPaymentMethods.due || data.dueAmount || 0;

                // ✅ Prevent overpayment
                if (amount > currentDue) {
                    throw new Error(`Payment amount (₹${amount}) exceeds due amount (₹${currentDue}).`);
                }

                const newDue = currentDue - amount;

                // ✅ Build new payment methods object
                const newPaymentMethods = {
                    ...currentPaymentMethods,
                    [method.toLowerCase()]: (currentPaymentMethods[method.toLowerCase()] || 0) + amount,
                    due: Math.max(0, newDue), // Ensure due never goes negative
                };
                const normalizedMethod = method.toLowerCase().replace(/\s+/g, '');
                if ((normalizedMethod === 'credit' || normalizedMethod === 'creditnote') && invoice.partyNumber) {
                    const partyNum = (invoice.partyNumber || '').replace(/\D/g, '').slice(-10);
                    if (partyNum) {
                        const { doc: fsDoc, increment: fsIncrement } = await import('firebase/firestore');
                        const customerRef = fsDoc(db, 'companies', companyId, 'customers', partyNum);
                        transaction.update(customerRef, {
                            creditBalance: fsIncrement(-amount),
                        });
                        // ✅ Local state turant update
                        setAvailableCredit(prev => Math.max(0, prev - amount));
                    }
                }

                // ✅ Create payment record with proper structure
                const paymentRecord = {
                    amount,
                    method: method.toLowerCase(), // Normalize method name
                    date: new Date().toISOString(),
                    timestamp: Date.now(),
                    ...(method.toUpperCase() === 'PDC' && {
                        chequeNumber: chequeNumber || '',
                        chequeDate: chequeDate || '',
                    }),
                };

                // ✅ Update document with new payment info
                transaction.update(docRef, {
                    paymentMethods: newPaymentMethods,
                    dueAmount: Math.max(0, newDue), // Also update dueAmount field for consistency
                    paymentHistory: [...(data.paymentHistory || []), paymentRecord],
                });
            });

            // ✅ Update local state immediately — no refresh needed
            const paymentRecord: PaymentRecord = {
                amount,
                method: method.toLowerCase(),
                date: new Date().toISOString(),
                timestamp: Date.now(),
                ...(method.toUpperCase() === 'PDC' && {
                    chequeNumber: chequeNumber || '',
                    chequeDate: chequeDate || '',
                }),
            };
            updateTransactionLocally(invoice.id, amount, paymentRecord);

            setIsPaymentModalOpen(false);
            setSelectedInvoiceForPayment(null);
            showToast(`Payment of ₹${amount} settled successfully via ${method}!`, 'success');

        } catch (error) {
            console.error('Error settling payment:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            showToast(`Failed to settle payment: ${errorMessage}`, 'error');
            throw error;
        }
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
                party.partyType === partyTypeFilter ||
                party.partyType === 'Both';

            const matchesStatus =
                statusFilter === 'all' ||
                (statusFilter === 'due' && party.totalDue > 0) ||
                (statusFilter === 'settled' && party.totalDue === 0);

            return matchesSearch && matchesType && matchesStatus;
        });
    }, [searchQuery, partyTypeFilter, partySummaries, statusFilter]);

    if (isLoading || authLoading) return <div className="p-4 text-center">Loading Ledger...</div>;
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    return (
        <div className="min-h-screen bg-gray-50 pb-16">
            {/* Opening Balance Modal */}
            {isOBModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="bg-white rounded-sm shadow-xl w-full max-w-sm p-5">
                        {/* Title row + Customer/Supplier badge */}
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-base font-bold text-gray-800">Add Opening Balance</h2>
                            <span className={`text-xs font-bold px-2.5 py-1 rounded border tracking-wide
    ${obForm.partyType === 'Customer'
                                    ? 'bg-blue-50 text-blue-600 border-blue-200'
                                    : 'bg-purple-50 text-purple-600 border-purple-200'
                                }`}>
                                {obForm.partyType}
                            </span>
                        </div>

                        <div className="space-y-3">
                            {/* Name + Number in same row */}
                            <div className="flex gap-2">
                                <input
                                    placeholder="Party Name *"
                                    value={obForm.partyName}
                                    readOnly
                                    className="flex-1 p-2 border border-gray-200 rounded-sm text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                                <input
                                    placeholder="Phone"
                                    value={obForm.partyNumber}
                                    readOnly
                                    maxLength={10}
                                    className="w-28 p-2 border border-gray-200 rounded-sm text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                                />
                            </div>

                            {/* Due vs Advance toggle */}
                            <div>
                                <p className="text-xs font-semibold text-gray-500 mb-1.5">Balance Type</p>
                                <div className="flex border border-gray-200 rounded-sm overflow-hidden text-sm">
                                    <button
                                        onClick={() => setObForm(f => ({ ...f, balanceType: 'due' }))}
                                        className={`flex-1 px-3 py-2 font-medium transition ${obForm.balanceType === 'due' ? 'bg-red-500 text-white' : 'bg-white text-gray-500'}`}
                                    >
                                        Due(They Owe You)
                                    </button>
                                    <button
                                        onClick={() => setObForm(f => ({ ...f, balanceType: 'advance' }))}
                                        className={`flex-1 px-3 py-2 font-medium border-l border-gray-200 transition ${obForm.balanceType === 'advance' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-500'}`}
                                    >
                                        Debt(You Owe Them)
                                    </button>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">
                                    {obForm.balanceType === 'due'
                                        ? 'Party owes you money — receivable/debit balance.'
                                        : 'You owe the party — payable/credit balance.'}
                                </p>
                            </div>

                            <input
                                type="number"
                                placeholder="Amount (₹) *"
                                value={obForm.amount}
                                onChange={e => setObForm(f => ({ ...f, amount: e.target.value }))}
                                className="w-full p-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                            <input
                                placeholder="Note (optional)"
                                value={obForm.note}
                                onChange={e => setObForm(f => ({ ...f, note: e.target.value }))}
                                className="w-full p-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                        </div>

                        <div className="flex gap-2 mt-4">
                            <button
                                onClick={() => { setIsOBModalOpen(false); setObForm({ partyName: '', partyNumber: '', partyType: 'Customer', balanceType: 'due', amount: '', note: '' }); }}
                                className="flex-1 px-3 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-sm hover:bg-gray-200"
                            >Cancel</button>
                            <button
                                onClick={handleAddOpeningBalance}
                                disabled={obLoading}
                                className="flex-1 px-3 py-2 text-sm font-semibold text-white bg-blue-500 rounded-sm hover:bg-blue-600 disabled:opacity-50"
                            >{obLoading ? 'Saving...' : 'Save'}</button>
                        </div>
                    </div>
                </div>
            )}
            {toast && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-sm shadow-lg text-sm font-semibold text-white transition-all
                ${toast.type === 'success' ? 'bg-blue-500' : 'bg-red-500'}`}>
                    {toast.message}
                </div>
            )}
            <PaymentModal
                isOpen={isPaymentModalOpen}
                onClose={() => {
                    setIsPaymentModalOpen(false);
                    setSelectedInvoiceForPayment(null);
                    setAvailableCredit(0); // ✅ Reset on close
                }}
                invoice={selectedInvoiceForPayment}
                onSubmit={handleSettlePayment}
                availableCredit={availableCredit}
                isDebitNote={selectedInvoiceForPayment?.type === 'purchase'}
            />
            {/* HEADER FOR MASTER LIST ONLY */}
            {!selectedPartyName && (
                <div className="flex items-center justify-between p-3 border-b border-gray-200 mb-3 mt-2">
                    <BackButton />
                    <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
                        Party Ledger
                    </h1>
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
                            onChange={(e) => { setSearchQuery(e.target.value); if (e.target.value.trim()) setShowTransactionList(true); }}
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
                    </div>
                    <div className="flex gap-2 mt-3">
                        <button onClick={handleApplyFilters} className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-semibold rounded-sm hover:bg-blue-700 transition-colors">
                            Apply
                        </button>
                    </div>
                    <div className="flex flex-col items-center gap-2 mt-3">
                        <div className="flex border border-gray-200 rounded-sm overflow-hidden text-sm w-1/2">
                            <button
                                onClick={() => { setPartyTypeFilter(prev => prev === 'Customer' ? 'all' : 'Customer'); setShowTransactionList(true); }}
                                className={`flex-1 px-3 py-1.5 transition font-medium ${partyTypeFilter === 'Customer' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                            >
                                Customer
                            </button>
                            <button
                                onClick={() => { setPartyTypeFilter(prev => prev === 'Supplier' ? 'all' : 'Supplier'); setShowTransactionList(true); }}
                                className={`flex-1 px-3 py-1.5 transition font-medium border-l border-gray-200 ${partyTypeFilter === 'Supplier' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                            >
                                Supplier
                            </button>
                            <button
                                onClick={() => { setPartyTypeFilter(prev => prev === 'Both' ? 'all' : 'Both'); setShowTransactionList(true); }}
                                className={`flex-1 px-3 py-1.5 transition font-medium border-l border-gray-200 ${partyTypeFilter === 'Both' ? 'bg-blue-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                            >
                                Both
                            </button>
                        </div>
                        <div className="flex bg-gray-100 rounded-sm p-1 text-sm">
                            <button
                                onClick={() => { setStatusFilter(prev => prev === 'due' ? 'all' : 'due'); setShowTransactionList(true); }}
                                className={`px-3 py-1.5 rounded-sm transition ${statusFilter === 'due' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600'}`}
                            >
                                Due
                            </button>
                            <button
                                onClick={() => { setStatusFilter(prev => prev === 'settled' ? 'all' : 'settled'); setShowTransactionList(true); }}
                                className={`px-3 py-1.5 rounded-sm transition ${statusFilter === 'settled' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600'}`}
                            >
                                Settled
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MAIN VIEW */}
            {!selectedPartyName ? (
                // VIEW 1: MASTER LIST (Unified List Container with Card-like row layouts)
                <div className="space-y-2 mt-2">
                    {filteredParties.length === 0 ? (
                        <div className="p-6 text-center text-gray-500 bg-white">No parties found for this period.</div>
                    ) : (
                        <>
                            <button
                                onClick={() => setShowTransactionList(prev => !prev)}
                                className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-slate-200 rounded-sm text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                <span>{showTransactionList ? 'Hide' : 'Show'} List ({filteredParties.length} parties)</span>
                                <span className={`inline-block transition-transform duration-200 ${showTransactionList ? 'rotate-180' : ''}`}>▼</span>
                            </button>

                            {showTransactionList && filteredParties.map((party) => (
                                <CustomCard
                                    key={party.partyName}
                                    onClick={() => { setSelectedPartyName(party.partyNumber || party.partyName); setShowTransactionList(false); }}
                                    className="cursor-pointer transition-shadow hover:shadow-md p-3.5 bg-white"
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
                            ))}
                        </>
                    )}
                </div>
            ) : (
                // VIEW 2: DETAILED LEDGER
                <div className="flex flex-col gap-2">

                    {/* UNIFIED STICKY HEADER: Title + Summary Card */}
                    <div className="sticky top-0 z-30 pt-2 pb-3 -mx-2 px-2 bg-gray-50">
                        {/* Top Bar with Title and Close */}
                        <div className="flex items-center justify-between pb-2 mb-2">
                            <BackButton onClick={() => { setSelectedPartyName(null); setExpandedBillId(null); setShowTransactionList(false); }} />
                            <h1 className="flex-1 text-lg text-center font-bold text-gray-800 truncate px-2">
                                {selectedPartyName} - Ledger
                            </h1>
                        </div>

                        {/* Summary Card */}
                        <div className="rounded-sm border border-slate-200 bg-white overflow-hidden">
                            <div className="bg-sky-100 border-b border-slate-100 px-4 py-2 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ledger Summary</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedPartyLedger?.transactions.length} Bills</span>
                                    <button
                                        onClick={() => {
                                            // ✅ Pre-fill party details from the selected party
                                            setObForm({
                                                partyName: selectedPartyLedger?.partyName || '',
                                                partyNumber: selectedPartyLedger?.partyNumber || '',
                                                partyType: selectedPartyLedger?.partyType === 'Supplier' ? 'Supplier' : 'Customer',
                                                balanceType: 'due',
                                                amount: '',
                                                note: '',
                                            });
                                            setIsOBModalOpen(true);
                                        }}
                                        className="text-[10px] font-bold px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition whitespace-nowrap"
                                    >
                                        + Opening Balance
                                    </button>
                                </div>
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
                                            {txn.isOpeningBalance ? (
                                                <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap 
        ${(txn as any).balanceType === 'advance'
                                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                                        : 'bg-orange-50 text-orange-600 border-orange-200'
                                                    }`}>
                                                    {(txn as any).balanceType === 'advance' ? 'Advance' : 'Opening Balance'}
                                                </span>
                                            ) : (
                                                <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap ${txn.type === 'sale' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-purple-50 text-purple-600 border-purple-200'}`}>
                                                    {txn.type}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mt-2">
                                        {/* LEFT ALIGNED INFO */}
                                        <div className="flex-1">
                                            {txn.isOpeningBalance ? (
                                                <>
                                                    <p className="text-base font-semibold text-slate-800">Opening Due</p>
                                                    <p className="text-sm text-slate-500 mt-1">{formatDate(txn.createdAt)}</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-base font-semibold text-slate-800">{txn.invoiceNumber || txn.id.slice(0, 8)}</p>
                                                    <p className="text-sm text-slate-500 mt-1">{formatDate(txn.createdAt)}</p>
                                                </>
                                            )}
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
                                            {/* Show note for Opening Balance */}
                                            {txn.isOpeningBalance && (txn as any).note && (
                                                <p className="text-xs text-slate-500 italic mb-2 px-1">
                                                    Note: {(txn as any).note}
                                                </p>
                                            )}
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
                                            {/* ✅ FIXED: Settle button with corrected invoice object */}
                                            {txn.dueAmount > 0 && !(txn.isOpeningBalance && (txn as any).balanceType === 'advance') && (
                                                <div className="mt-3 pt-3 border-t border-slate-200">
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();

                                                            setSelectedInvoiceForPayment({
                                                                id: txn.id,
                                                                invoiceNumber: txn.invoiceNumber,
                                                                type: txn.type,
                                                                totalAmount: txn.totalAmount,
                                                                dueAmount: txn.dueAmount,
                                                                partyName: selectedPartyName,
                                                                partyNumber: txn.partyNumber,
                                                                createdAt: txn.createdAt,
                                                                isOpeningBalance: txn.isOpeningBalance === true,
                                                                balanceType: (txn as any).balanceType || 'due',
                                                            });

                                                            // ✅ Fetch creditBalance from customers collection
                                                            const partyNum = (txn.partyNumber || '').replace(/\D/g, '').slice(-10);
                                                            if (partyNum && companyId) {
                                                                try {
                                                                    const { doc, getDoc } = await import('firebase/firestore');
                                                                    const { db } = await import('../../lib/Firebase');
                                                                    // Purchase (Supplier) → debitBalance, Sales (Customer) → creditBalance
                                                    const isSupplier = txn.type === 'purchase';
                                                    const collectionName = isSupplier ? 'suppliers' : 'customers';
                                                    const balanceField = isSupplier ? 'debitBalance' : 'creditBalance';

                                                    const partyRef = doc(db, 'companies', companyId, collectionName, partyNum);
                                                    const snap = await getDoc(partyRef);
                                                    setAvailableCredit(snap.exists() ? Number(snap.data()[balanceField] || 0) : 0);
                                                                } catch {
                                                                    setAvailableCredit(0);
                                                                }
                                                            } else {
                                                                setAvailableCredit(0);
                                                            }

                                                            setIsPaymentModalOpen(true);
                                                        }}
                                                        className="w-full px-4 py-2 text-sm font-semibold text-white bg-blue-500 rounded-sm hover:bg-blue-600 transition-colors"
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

export default PartyLedger;