import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { db } from '../../lib/Firebase';
import { collection, getDocs, doc, updateDoc, writeBatch, query, orderBy, where, increment, serverTimestamp } from 'firebase/firestore';
import { FiUsers, FiCheckCircle, FiCalendar, FiGift, FiList, FiEdit2 } from 'react-icons/fi';
import { LuIndianRupee } from 'react-icons/lu';
import { Spinner } from '../../constants/Spinner';
import { IconClose } from '../../constants/Icons';
import { useNavigate } from 'react-router-dom';

interface Agent {
    id: string;
    name: string;
    phoneNumber: string;
    role: string;
    tier: string;
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

interface Company {
    id: string;
    name: string;
    ownerPhoneNumber: string;
    createdAt: Date;
    expiryDate: Date;
    referralCredits: number;
}

interface CreditRecord {
    id: string;
    referrerName: string;
    referredCompanyName: string;
    type: 'Earned' | 'Claimed';
    date: Date;
}

// ========================================================
// Custom Settlement Modal
// ========================================================
const SettlePayoutModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    request: PayoutRequest | null;
    onSubmit: (amount: number) => Promise<void>;
}> = ({ isOpen, onClose, request, onSubmit }) => {
    const [amount, setAmount] = useState<number | string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && request) {
            setAmount(request.amount); // Default to full amount
        }
    }, [isOpen, request]);

    if (!isOpen || !request) return null;

    const handleSubmit = async () => {
        setIsSubmitting(true);
        await onSubmit(Number(amount));
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-sm p-6 border border-gray-200">
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-lg font-bold text-gray-900">Settle Payout</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-sm transition-colors">
                        <IconClose width={18} height={18} />
                    </button>
                </div>

                <div className="mb-5 bg-gray-50 p-3 rounded-sm border border-gray-100 text-sm">
                    <div className="flex justify-between mb-1">
                        <span className="text-gray-500 font-medium">Agent:</span>
                        <span className="font-bold text-gray-900">{request.agentName}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Requested:</span>
                        <span className="font-bold text-gray-900">₹{request.amount.toFixed(2)}</span>
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-2">
                        Settlement Amount (₹)
                    </label>
                    <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        max={request.amount}
                        min={1}
                        placeholder="Enter amount"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-sm focus:outline-none focus:ring-2 focus:ring-black text-sm font-semibold text-gray-900 transition-shadow"
                    />
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-sm text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !amount || Number(amount) <= 0}
                        className="flex-1 px-4 py-2 bg-black text-white rounded-sm text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? 'Processing...' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ========================================================
// Edit Credits Modal
// ========================================================
const EditCreditsModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    company: Company | null;
    onSubmit: (newCredits: number) => Promise<void>;
}> = ({ isOpen, onClose, company, onSubmit }) => {
    const [credits, setCredits] = useState<number | string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (isOpen && company) {
            setCredits(company.referralCredits);
        }
    }, [isOpen, company]);

    if (!isOpen || !company) return null;

    const handleSubmit = async () => {
        setIsSubmitting(true);
        await onSubmit(Number(credits));
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="bg-white rounded-sm shadow-xl w-full max-w-sm p-6 border border-gray-200">
                <div className="flex justify-between items-center mb-5">
                    <h2 className="text-lg font-bold text-gray-900">Edit Credits</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 rounded-sm transition-colors">
                        <IconClose width={18} height={18} />
                    </button>
                </div>

                <div className="mb-5 bg-gray-50 p-3 rounded-sm border border-gray-100 text-sm">
                    <div className="flex justify-between mb-1">
                        <span className="text-gray-500 font-medium">Business:</span>
                        <span className="font-bold text-gray-900">{company.name}</span>
                    </div>
                    <div className="flex justify-between">
                        <span className="text-gray-500 font-medium">Current Credits:</span>
                        <span className="font-bold text-purple-700">{company.referralCredits}</span>
                    </div>
                </div>

                <div className="mb-6">
                    <label className="block text-xs font-bold text-gray-600 uppercase mb-2">
                        New Credit Balance
                    </label>
                    <input
                        type="number"
                        value={credits}
                        onChange={(e) => setCredits(e.target.value)}
                        min={0}
                        placeholder="Enter total credits"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-sm focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm font-semibold text-gray-900 transition-shadow"
                    />
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-sm text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || credits === '' || Number(credits) < 0}
                        className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-sm text-sm font-bold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ========================================================
// Row Component for Dynamic Month Selection
// ========================================================
const ActionCell: React.FC<{
    company: Company;
    onAdd: (companyId: string, currentExpiry: Date, currentCredits: number, companyName: string, monthsToAdd: number) => void;
}> = ({ company, onAdd }) => {
    const [months, setMonths] = useState(1);

    return (
        <div className="flex items-center justify-center gap-2">
            <select
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                className={`border rounded-sm text-xs font-bold px-2 py-2 focus:ring-purple-500 focus:border-purple-500 outline-none transition-colors ${company.referralCredits >= months
                    ? 'border-purple-300 text-purple-700 bg-purple-50'
                    : 'border-gray-300 text-gray-700 bg-white'
                    }`}
            >
                <option value={1}>1 M</option>
                <option value={2}>2 M</option>
                <option value={3}>3 M</option>
            </select>
            <button
                onClick={() => onAdd(company.id, company.expiryDate, company.referralCredits, company.name, months)}
                className={`px-3 py-2 rounded-sm text-xs font-bold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${company.referralCredits > 0
                    ? 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                    }`}
            >
                <FiCalendar size={14} /> Add
            </button>
        </div>
    );
};

const SuperAdminDashboard: React.FC = () => {
    const { currentUser } = useAuth();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [payoutRequests, setPayoutRequests] = useState<PayoutRequest[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [creditLedger, setCreditLedger] = useState<CreditRecord[]>([]);
    const navigate = useNavigate();
    const [_totalCommissionsCount, setTotalCommissionsCount] = useState(0);
    const [loading, setLoading] = useState(true);

    // Modal States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState<PayoutRequest | null>(null);

    const [isEditCreditsModalOpen, setIsEditCreditsModalOpen] = useState(false);
    const [selectedCompanyForCredits, setSelectedCompanyForCredits] = useState<Company | null>(null);

    const [activeTab, setActiveTab] = useState<'agents' | 'payouts' | 'users'>('users');

    const MASTER_ADMIN_UID = "6vwZ1HRqX7VSnh5KP4JW0TKeuZm2";

    const fetchData = async () => {
        setLoading(true);
        try {
            // 1. Fetch Agents
            const agentsSnap = await getDocs(collection(db, 'agents'));
            const agentsList: Agent[] = [];
            agentsSnap.forEach(doc => {
                const data = doc.data();
                agentsList.push({
                    id: doc.id,
                    name: data.name || 'Unknown',
                    phoneNumber: data.phoneNumber || 'N/A',
                    role: data.role || 'agent',
                    tier: data.tier || 'Bronze',
                    ownReferralCode: data.ownReferralCode || 'N/A',
                    totalEarned: data.totalEarned || 0,
                    unpaidBalance: data.unpaidBalance || 0,
                    upiId: data.upiId || 'Not Set'
                });
            });
            setAgents(agentsList);

            // 2. Fetch Payout Requests
            const prQuery = query(collection(db, 'payoutRequests'), orderBy('date', 'desc'));
            const prSnap = await getDocs(prQuery);
            const prList: PayoutRequest[] = [];
            prSnap.forEach(doc => {
                const data = doc.data();
                prList.push({
                    id: doc.id,
                    agentId: data.agentId,
                    agentName: data.agentName || 'Unknown',
                    amount: data.amount,
                    upiId: data.upiId || 'No UPI',
                    status: data.status || 'pending',
                    date: data.date?.toDate() || new Date()
                });
            });
            setPayoutRequests(prList);

            // 3. Fetch Existing Users (Companies)
            const compSnap = await getDocs(collection(db, 'companies'));
            const compList: Company[] = [];
            compSnap.forEach(doc => {
                const data = doc.data();
                compList.push({
                    id: doc.id,
                    name: data.name || 'Unknown Business',
                    ownerPhoneNumber: data.ownerPhoneNumber || 'N/A',
                    createdAt: data.createdAt?.toDate() || new Date(),
                    expiryDate: data.expiryDate?.toDate() || new Date(),
                    referralCredits: data.referralCredits || 0
                });
            });

            // Sort: Users with credits to the top, then sort the rest by expiry date
            compList.sort((a, b) => {
                if (b.referralCredits !== a.referralCredits) {
                    return b.referralCredits - a.referralCredits;
                }
                return a.expiryDate.getTime() - b.expiryDate.getTime();
            });

            setCompanies(compList);

            // 4. Fetch Credit Ledger
            const ledgerQuery = query(collection(db, 'creditLedger'), orderBy('date', 'desc'));
            const ledgerSnap = await getDocs(ledgerQuery);
            const ledgerList: CreditRecord[] = [];
            ledgerSnap.forEach(doc => {
                const data = doc.data();
                ledgerList.push({
                    id: doc.id,
                    referrerName: data.referrerName || 'Admin',
                    referredCompanyName: data.referredCompanyName || 'System Credit',
                    type: data.type || 'Earned',
                    date: data.date?.toDate() || new Date()
                });
            });
            setCreditLedger(ledgerList);

            // Fetch generic stats
            const commSnap = await getDocs(collection(db, 'commissions'));
            setTotalCommissionsCount(commSnap.size);

        } catch (error) {
            console.error("Error fetching admin data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (currentUser?.uid === MASTER_ADMIN_UID) {
            fetchData();
        }
    }, [currentUser]);

    const handleTierChange = async (agentId: string, newTier: string) => {
        try {
            const agentRef = doc(db, 'agents', agentId);
            await updateDoc(agentRef, { tier: newTier });
            setAgents(prev => prev.map(a => a.id === agentId ? { ...a, tier: newTier } : a));
            alert(`Tier updated to ${newTier} successfully!`);
        } catch (error) {
            console.error("Error updating tier:", error);
            alert("Failed to update tier.");
        }
    };

    const handleSettlePayment = async (settleAmount: number) => {
        if (!selectedRequest) return;

        const { id: requestId, agentId, amount: currentAmount } = selectedRequest;

        if (isNaN(settleAmount) || settleAmount <= 0) {
            return alert("Please enter a valid amount greater than 0.");
        }
        if (settleAmount > currentAmount) {
            return alert(`You cannot settle more than the requested amount (₹${currentAmount}).`);
        }

        const isFullSettlement = settleAmount === currentAmount;

        try {
            const batch = writeBatch(db);
            const reqRef = doc(db, 'payoutRequests', requestId);
            const agentRef = doc(db, 'agents', agentId);

            if (isFullSettlement) {
                batch.update(reqRef, { status: 'paid' });
                batch.update(agentRef, { unpaidBalance: increment(-settleAmount), hasPendingRequest: false });

                const commQuery = query(collection(db, 'commissions'), where('agentId', '==', agentId), where('status', '==', 'pending'));
                const commSnap = await getDocs(commQuery);
                commSnap.forEach(cDoc => { batch.update(cDoc.ref, { status: 'paid' }); });
            } else {
                batch.update(reqRef, { amount: increment(-settleAmount) });
                batch.update(agentRef, { unpaidBalance: increment(-settleAmount) });
            }

            await batch.commit();

            setPayoutRequests(prev => prev.map(r => {
                if (r.id === requestId) {
                    return isFullSettlement
                        ? { ...r, status: 'paid' }
                        : { ...r, amount: r.amount - settleAmount };
                }
                return r;
            }));

            setAgents(prev => prev.map(a =>
                a.id === agentId
                    ? { ...a, unpaidBalance: Math.max(0, a.unpaidBalance - settleAmount) }
                    : a
            ));

            alert(`Successfully settled ₹${settleAmount}!`);
            setIsModalOpen(false);
            setSelectedRequest(null);

        } catch (error) {
            console.error("Error processing settlement:", error);
            alert("Failed to process settlement.");
        }
    };

    // ========================================================
    // UPDATE DIRECT CREDITS
    // ========================================================
    const handleUpdateCredits = async (newCredits: number) => {
        if (!selectedCompanyForCredits) return;

        try {
            const companyRef = doc(db, 'companies', selectedCompanyForCredits.id);

            // Only updating the document directly
            await updateDoc(companyRef, {
                referralCredits: newCredits
            });

            // Updating Local State
            setCompanies(prev => prev.map(c =>
                c.id === selectedCompanyForCredits.id ? { ...c, referralCredits: newCredits } : c
            ));

            alert(`Credits for ${selectedCompanyForCredits.name} successfully updated to ${newCredits}!`);
            setIsEditCreditsModalOpen(false);
            setSelectedCompanyForCredits(null);

        } catch (error) {
            console.error("Error updating credits:", error);
            alert("Failed to update credits.");
        }
    };


    const handleAddFreeMonth = async (companyId: string, currentExpiry: Date, currentCredits: number, companyName: string, monthsToAdd: number) => {
        const confirmAdd = window.confirm(`Add ${monthsToAdd} Month(s) (${monthsToAdd * 30} Days) of free software to ${companyName}?`);
        if (!confirmAdd) return;

        try {
            const newExpiryDate = new Date(currentExpiry);
            newExpiryDate.setDate(newExpiryDate.getDate() + (monthsToAdd * 30));
            const newCredits = Math.max(0, currentCredits - monthsToAdd);

            const batch = writeBatch(db);
            const companyRef = doc(db, 'companies', companyId);
            const ledgerRef = doc(collection(db, 'creditLedger'));

            batch.update(companyRef, {
                expiryDate: newExpiryDate,
                referralCredits: newCredits
            });

            batch.set(ledgerRef, {
                referrerId: companyId,
                referrerName: companyName,
                referredCompanyName: `${monthsToAdd} Month(s) Extension Applied`,
                type: 'Claimed',
                date: serverTimestamp()
            });

            await batch.commit();

            setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, expiryDate: newExpiryDate, referralCredits: newCredits } : c));

            const newRecord: CreditRecord = {
                id: ledgerRef.id,
                referrerName: companyName,
                referredCompanyName: `${monthsToAdd} Month(s) Extension Applied`,
                type: 'Claimed',
                date: new Date()
            };
            setCreditLedger([newRecord, ...creditLedger]);

            alert(`Successfully added ${monthsToAdd * 30} days to their subscription!`);

        } catch (error) {
            console.error("Error adding month:", error);
            alert("Failed to update subscription.");
        }
    };

    if (currentUser?.uid !== MASTER_ADMIN_UID) {
        return <div className="min-h-screen flex items-center justify-center text-red-600 font-bold text-xl">Access Denied. Master Admin Only.</div>;
    }

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Spinner /></div>;

    const pendingPayouts = payoutRequests.filter(r => r.status === 'pending');
    const totalPendingAmount = pendingPayouts.reduce((sum, r) => sum + r.amount, 0);
    const usersWithCredits = companies.filter(c => c.referralCredits > 0).length;

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">

                {/* Header Stats */}
                <div className="flex items-center justify-between pb-3 border-b mb-2">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Super Admin Console</h1>
                        <p className="text-gray-500 mt-1">Manage partners, payouts, and user subscriptions globally.</p>
                    </div>
                    <button onClick={() => navigate(-1)} className="p-2 rounded-sm hover:bg-gray-200 transition-colors">
                        <IconClose width={20} height={20} />
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-sm shadow-sm border border-gray-200">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-sm"><FiUsers size={24} /></div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Total Partners</p>
                                <p className="text-2xl font-bold text-gray-900">{agents.length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-sm shadow-sm border border-gray-200">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-sm"><FiCheckCircle size={24} /></div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Total Users</p>
                                <p className="text-2xl font-bold text-gray-900">{companies.length}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-sm shadow-sm border border-gray-200">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-orange-50 text-orange-600 rounded-sm"><LuIndianRupee size={24} /></div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Pending Payouts</p>
                                <p className="text-2xl font-bold text-gray-900">₹{totalPendingAmount.toFixed(2)}</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-sm shadow-sm border border-gray-200">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-sm"><FiGift size={24} /></div>
                            <div>
                                <p className="text-sm text-gray-500 font-medium">Unclaimed Credits</p>
                                <p className="text-2xl font-bold text-gray-900">{usersWithCredits} Users</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'users' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Users Referrals
                    </button>
                    <button
                        onClick={() => setActiveTab('agents')}
                        className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'agents' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Partner Management
                    </button>
                    <button
                        onClick={() => setActiveTab('payouts')}
                        className={`py-3 px-6 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${activeTab === 'payouts' ? 'border-black text-black' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Payout Requests {pendingPayouts.length > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{pendingPayouts.length}</span>}
                    </button>
                </div>

                {/* TAB CONTENT: USERS (COMPANIES) */}
                {activeTab === 'users' && (
                    <div className="space-y-6">
                        <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-gray-600">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-4">Business Name</th>
                                            <th className="px-6 py-4">Sign Up Date</th>
                                            <th className="px-6 py-4">Current Expiry</th>
                                            <th className="px-6 py-4 text-center">Credits Earned</th>
                                            <th className="px-6 py-4 text-center">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {companies.map(company => {
                                            const isExpired = company.expiryDate < new Date();
                                            return (
                                                <tr key={company.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="px-6 py-4">
                                                        <p className="font-bold text-gray-900">{company.name}</p>
                                                        <p className="text-xs text-gray-500">{company.ownerPhoneNumber}</p>
                                                    </td>
                                                    <td className="px-6 py-4 font-medium text-gray-500">
                                                        {company.createdAt.toLocaleDateString('en-IN')}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2.5 py-1 rounded-sm text-xs font-bold tracking-wide ${isExpired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                            {company.expiryDate.toLocaleDateString('en-IN')}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            {company.referralCredits > 0 ? (
                                                                <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-sm text-xs font-bold flex items-center justify-center gap-1 border border-purple-200">
                                                                    <FiGift /> {company.referralCredits} Months
                                                                </span>
                                                            ) : (
                                                                <span className="text-gray-400 font-medium">0</span>
                                                            )}

                                                            {/* EDIT CREDITS BUTTON */}
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedCompanyForCredits(company);
                                                                    setIsEditCreditsModalOpen(true);
                                                                }}
                                                                className="text-gray-400 hover:text-purple-600 transition-colors p-1"
                                                                title="Edit Credits"
                                                            >
                                                                <FiEdit2 size={15} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <ActionCell company={company} onAdd={handleAddFreeMonth} />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
                            <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                                    <FiList className="text-gray-600" /> Credit History & Referrals
                                </h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-gray-500">
                                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-4">Date</th>
                                            <th className="px-6 py-4">Existing User</th>
                                            <th className="px-6 py-4">Activity</th>
                                            <th className="px-6 py-4 text-right">Credit Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {creditLedger.length === 0 ? (
                                            <tr><td colSpan={4} className="p-8 text-center text-gray-500">No referral history yet.</td></tr>
                                        ) : (
                                            creditLedger.map(record => (
                                                <tr key={record.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="px-6 py-4 font-medium text-gray-500">
                                                        {record.date.toLocaleDateString('en-IN')}
                                                    </td>
                                                    <td className="px-6 py-4 font-bold text-gray-900">
                                                        {record.referrerName}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {record.type === 'Earned' ? (
                                                            <span>Referred <strong className="text-gray-800">{record.referredCompanyName}</strong></span>
                                                        ) : (
                                                            <span className="text-purple-600 font-medium">{record.referredCompanyName}</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {record.type === 'Earned' ? (
                                                            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-sm text-xs font-bold border border-green-200">+1 Earned</span>
                                                        ) : (
                                                            <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-sm text-xs font-bold border border-purple-200">Claimed</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB CONTENT: AGENTS */}
                {activeTab === 'agents' && (
                    <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-600">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4">Partner Name</th>
                                        <th className="px-6 py-4">Role & Code</th>
                                        <th className="px-6 py-4">Current Tier</th>
                                        <th className="px-6 py-4 text-right">Lifetime Earned</th>
                                        <th className="px-6 py-4 text-right">Unpaid Wallet</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agents.map(agent => (
                                        <tr key={agent.id} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="px-6 py-4">
                                                <p className="font-bold text-gray-900">{agent.name}</p>
                                                <p className="text-xs text-gray-500">{agent.phoneNumber}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-sm text-xs font-bold uppercase tracking-wider block w-max mb-1">
                                                    {agent.role}
                                                </span>
                                                <span className="font-mono text-xs font-bold text-gray-500">{agent.ownReferralCode}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <select
                                                    value={agent.tier}
                                                    onChange={(e) => handleTierChange(agent.id, e.target.value)}
                                                    className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-sm focus:ring-black focus:border-black block w-full p-2.5 font-semibold cursor-pointer"
                                                >
                                                    <option value="Bronze">Bronze</option>
                                                    <option value="Silver">Silver</option>
                                                    <option value="Gold">Gold</option>
                                                    <option value="Platinum">Platinum</option>
                                                </select>
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-gray-700">
                                                ₹{agent.totalEarned.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={`font-bold ${agent.unpaidBalance > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                                                    ₹{agent.unpaidBalance.toFixed(2)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* TAB CONTENT: PAYOUTS */}
                {activeTab === 'payouts' && (
                    <div className="bg-white rounded-sm shadow-sm border border-gray-200 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-600">
                                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4">Request Date</th>
                                        <th className="px-6 py-4">Agent Name</th>
                                        <th className="px-6 py-4">Payout Destination</th>
                                        <th className="px-6 py-4 text-right">Amount</th>
                                        <th className="px-6 py-4 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payoutRequests.length === 0 ? (
                                        <tr><td colSpan={5} className="p-8 text-center text-gray-500">No payout requests found.</td></tr>
                                    ) : (
                                        payoutRequests.map(req => {
                                            return (
                                                <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="px-6 py-4">
                                                        <p className="text-sm font-medium text-gray-800">{req.date.toLocaleDateString('en-IN')}</p>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <p className="font-bold text-gray-900">{req.agentName}</p>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-sm text-xs font-bold tracking-wide">
                                                            UPI: {req.upiId}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-bold text-gray-900 text-lg">
                                                        ₹{req.amount.toFixed(2)}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        {req.status === 'pending' ? (
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedRequest(req);
                                                                    setIsModalOpen(true);
                                                                }}
                                                                className="bg-black text-white px-4 py-2 rounded-sm text-xs font-bold hover:bg-gray-800 transition-colors w-full"
                                                            >
                                                                Settle Amount
                                                            </button>
                                                        ) : (
                                                            <span className="bg-green-100 text-green-700 px-4 py-2 rounded-sm text-xs font-bold flex items-center justify-center gap-1 w-full">
                                                                <FiCheckCircle /> Settled
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <SettlePayoutModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedRequest(null);
                    }}
                    request={selectedRequest}
                    onSubmit={handleSettlePayment}
                />

                <EditCreditsModal
                    isOpen={isEditCreditsModalOpen}
                    onClose={() => {
                        setIsEditCreditsModalOpen(false);
                        setSelectedCompanyForCredits(null);
                    }}
                    company={selectedCompanyForCredits}
                    onSubmit={handleUpdateCredits}
                />
            </div>
        </div>
    );
};

export default SuperAdminDashboard;