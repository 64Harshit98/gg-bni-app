import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { auth, db } from '../lib/Firebase';
import { doc, collection, query, where, getDocs, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { FiCopy, FiShare2, FiUsers, FiTrendingUp, FiList, FiPhone, FiLogOut, FiAward, FiClock, FiCheckCircle } from 'react-icons/fi';
import { CustomButton } from '../Components/CustomButton';
import { ROLES, Variant } from '../enums';
import { Spinner } from '../constants/Spinner';
import { LuIndianRupee } from 'react-icons/lu';

interface AgentData {
    name: string;
    ownReferralCode: string;
    unpaidBalance: number;
    totalEarned: number;
    minPayoutLimit: number;
    upiId: string;
    tier?: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
    hasPendingRequest?: boolean;
}

interface LeadData {
    id: string;
    name: string;
    ownerPhoneNumber: string;
    status: string;
    daysRemaining: number;
}

interface CommissionRecord {
    id: string;
    companyName: string;
    amount: number;
    date: Date;
    status: 'pending' | 'paid';
    type?: string;
}

interface PayoutRequest {
    id: string;
    amount: number;
    upiId: string;
    status: 'pending' | 'paid';
    date: Date;
}

const PartnerDashboard: React.FC = () => {
    const [agentData, setAgentData] = useState<AgentData | null>(null);
    const [leads, setLeads] = useState<LeadData[]>([]);
    const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
    const [payouts, setPayouts] = useState<PayoutRequest[]>([]);

    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // Modal States
    const [showUpiModal, setShowUpiModal] = useState(false);
    const [upiInput, setUpiInput] = useState('');
    const [isSavingUpi, setIsSavingUpi] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);

    const { currentUser } = useAuth();
    const isAgency = currentUser?.role === ROLES.AGENCY;

    useEffect(() => {
        const fetchDashboardData = async () => {
            if (!currentUser?.uid) return;

            try {
                // 1. Fetch Agent Wallet
                const agentRef = doc(db, 'agents', currentUser.uid);
                const agentSnap = await getDoc(agentRef);

                if (agentSnap.exists()) {
                    setAgentData(agentSnap.data() as AgentData);
                }

                // 2. Fetch Leads
                if (isAgency) {
                    const leadsRef = collection(db, 'companies');
                    const q = query(leadsRef, where('referralDetails.referrerId', '==', currentUser.uid));
                    const querySnapshot = await getDocs(q);

                    const fetchedLeads: LeadData[] = [];
                    querySnapshot.forEach((docSnap) => {
                        const data = docSnap.data();
                        const createdAt = data.createdAt?.toDate() || new Date();
                        const expiryDate = data.expiryDate?.toDate() || new Date();
                        const today = new Date();

                        const diffTime = expiryDate.getTime() - today.getTime();
                        const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

                        const totalPlanDays = Math.ceil((expiryDate.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
                        const calculatedStatus = totalPlanDays >= 360 ? 'Paid' : 'Trial';

                        fetchedLeads.push({
                            id: docSnap.id,
                            name: data.name || 'Unknown Business',
                            ownerPhoneNumber: data.ownerPhoneNumber || 'N/A',
                            status: calculatedStatus,
                            daysRemaining: daysRemaining
                        });
                    });
                    setLeads(fetchedLeads);
                }

                // 3. Fetch Commission History
                const commQuery = query(collection(db, 'commissions'), where('agentId', '==', currentUser.uid));
                const commSnapshot = await getDocs(commQuery);
                const fetchedCommissions: CommissionRecord[] = [];

                commSnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    fetchedCommissions.push({
                        id: docSnap.id,
                        companyName: data.companyName || 'Unknown Business',
                        amount: data.amount || 0,
                        date: data.date?.toDate() || new Date(),
                        status: data.status || 'pending',
                        type: data.type || 'New Sale'
                    });
                });

                fetchedCommissions.sort((a, b) => b.date.getTime() - a.date.getTime());
                setCommissions(fetchedCommissions);

                // 4. Fetch Payout History
                const payoutQuery = query(collection(db, 'payoutRequests'), where('agentId', '==', currentUser.uid));
                const payoutSnapshot = await getDocs(payoutQuery);
                const fetchedPayouts: PayoutRequest[] = [];

                payoutSnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
                    fetchedPayouts.push({
                        id: docSnap.id,
                        amount: data.amount || 0,
                        upiId: data.upiId || '',
                        status: data.status || 'pending',
                        date: data.date?.toDate() || new Date(),
                    });
                });

                fetchedPayouts.sort((a, b) => b.date.getTime() - a.date.getTime());
                setPayouts(fetchedPayouts);

            } catch (error) {
                console.error("Error fetching partner data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [currentUser, isAgency]);

    const copyToClipboard = () => {
        if (agentData?.ownReferralCode) {
            navigator.clipboard.writeText(agentData.ownReferralCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const shareOnWhatsApp = () => {
        if (agentData?.ownReferralCode) {
            const text = `Transform your billing and inventory with Sellar.in! Use my referral code *${agentData.ownReferralCode}* when signing up to get an extended 28-Day Free Trial.`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        }
    };

    const handleWithdrawRequest = async () => {
        if (!agentData?.upiId) {
            setShowUpiModal(true);
            return;
        }

        if (!currentUser?.uid) return;
        setIsRequesting(true);

        try {
            await addDoc(collection(db, 'payoutRequests'), {
                agentId: currentUser.uid,
                agentName: agentData.name,
                amount: agentData.unpaidBalance,
                upiId: agentData.upiId,
                status: 'pending',
                date: serverTimestamp()
            });

            const agentRef = doc(db, 'agents', currentUser.uid);
            await updateDoc(agentRef, { hasPendingRequest: true });

            setAgentData(prev => prev ? { ...prev, hasPendingRequest: true } : null);
            alert("Withdrawal request sent! We will process your payout to " + agentData.upiId + " soon.");

            window.location.reload();

        } catch (error) {
            console.error("Error submitting payout request:", error);
            alert("Failed to submit request. Please check your connection.");
        } finally {
            setIsRequesting(false);
        }
    };

    const handleSaveUpi = async () => {
        if (!upiInput.trim() || !currentUser?.uid) return;

        setIsSavingUpi(true);
        try {
            const agentRef = doc(db, 'agents', currentUser.uid);
            await updateDoc(agentRef, { upiId: upiInput.trim() });

            setAgentData(prev => prev ? { ...prev, upiId: upiInput.trim() } : null);
            setShowUpiModal(false);
            alert("UPI ID saved! You can now request your withdrawal.");
        } catch (error) {
            console.error("Error saving UPI:", error);
            alert("Failed to save UPI ID. Please try again.");
        } finally {
            setIsSavingUpi(false);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-muted"><Spinner /></div>;
    }

    const currentTier = agentData?.tier || 'Bronze';

    // ========================================================
    // 🚨 FIX: BULLETPROOF LIFETIME EARNINGS CALCULATION
    // ========================================================
    const calculatedLifetimeEarnings = commissions.reduce((sum, record) => sum + record.amount, 0);
    // ========================================================
    // DYNAMIC TIER THEME ENGINE (EXACT HEX CODES)
    // ========================================================
    const getTheme = (tier: string) => {
        const t = tier.toLowerCase();

        if (t === 'platinum') return {
            // Backgrounds use light Platinum (#E5E4E2), text uses dark Gunmetal (#363636)
            bg: 'bg-[#E5E4E2]/20',
            cardBorder: 'border-[#E5E4E2]',
            textMain: 'text-[#363636]',
            textSub: 'text-muted-foreground',
            iconBox: 'bg-gradient-to-br from-[#363636] to-gray-800 text-[#E5E4E2] shadow-sm',
            btnPrimary: '!bg-[#363636] hover:!bg-black !text-[#E5E4E2] disabled:!opacity-50',
            btnSecondary: 'bg-[#E5E4E2] hover:bg-[#C0C0C0] !text-[#363636]',
            badge: 'bg-[#363636] text-[#E5E4E2] border-gray-400',
            gradient: 'bg-gradient-to-r from-muted via-[#E5E4E2] to-gray-200', // Sleek, bright platinum header
            headerText: 'text-[#363636]', // Dark gunmetal text for perfect visibility
            headerSub: 'text-muted-foreground'
        };

        if (t === 'gold') return {
            // Gold: FFD700 | Copper shadow: B87333
            bg: 'bg-[#FFD700]/10',
            cardBorder: 'border-[#FFD700]/50',
            textMain: 'text-[#B87333]',
            textSub: 'text-yellow-700',
            iconBox: 'bg-gradient-to-br from-[#FFD700] to-[#B87333] text-white shadow-sm',
            btnPrimary: '!bg-[#FFD700] hover:!bg-[#B87333] !text-foreground disabled:!opacity-50',
            btnSecondary: 'bg-[#FFD700]/20 hover:bg-[#FFD700]/40 !text-yellow-900',
            badge: 'bg-[#FFD700] text-foreground border-[#B87333]',
            gradient: 'bg-gradient-to-r from-[#B87333] via-[#FFD700] to-[#B87333]', // Solid Gold/Copper bar
            headerText: 'text-foreground', // Dark text needed for bright gold readability
            headerSub: 'text-yellow-950'
        };

        if (t === 'silver') return {
            // Silver: C0C0C0 
            bg: 'bg-[#C0C0C0]/10',
            cardBorder: 'border-[#C0C0C0]/50',
            textMain: 'text-[#363636]',
            textSub: 'text-muted-foreground',
            iconBox: 'bg-gradient-to-br from-[#E5E4E2] to-[#C0C0C0] text-[#363636] shadow-sm',
            btnPrimary: '!bg-[#363636] hover:!bg-black !text-[#C0C0C0] disabled:!opacity-50',
            btnSecondary: 'bg-[#C0C0C0]/20 hover:bg-[#C0C0C0]/40 !text-foreground',
            badge: 'bg-[#C0C0C0] text-[#363636] border-gray-400',
            gradient: 'bg-gradient-to-r from-gray-500 via-[#C0C0C0] to-gray-500',
            headerText: 'text-foreground',
            headerSub: 'text-foreground'
        };

        // Default Bronze
        return {
            // Bronze: CD7F32 | Copper: B87333
            bg: 'bg-[#CD7F32]/10',
            cardBorder: 'border-[#CD7F32]/40',
            textMain: 'text-orange-950',
            textSub: 'text-[#B87333]',
            iconBox: 'bg-gradient-to-br from-[#CD7F32] to-[#B87333] text-white shadow-sm',
            btnPrimary: '!bg-[#CD7F32] hover:!bg-[#B87333] !text-white disabled:!opacity-50',
            btnSecondary: 'bg-[#CD7F32]/20 hover:bg-[#CD7F32]/40 !text-[#CD7F32]',
            badge: 'bg-[#CD7F32] text-white border-[#B87333]',
            gradient: 'bg-gradient-to-r from-[#B87333] via-[#CD7F32] to-[#B87333]', // Warm metallic blend
            headerText: 'text-white',
            headerSub: 'text-orange-100'
        };
    };

    const theme = getTheme(currentTier);

    return (
        <div className={`min-h-screen ${theme.bg} p-4 md:p-8 relative transition-colors duration-500`}>
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Header Area */}
                <div className={`${theme.gradient} p-6 rounded-xs border ${theme.cardBorder} shadow-sm flex justify-between items-start md:items-center flex-col md:flex-row gap-4`}>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className={`text-3xl font-bold ${theme.textMain}`}>
                                Welcome, {agentData?.name}
                            </h1>
                            <span className={`flex items-center gap-1 text-[11px] uppercase font-bold px-2.5 py-1 rounded-xs border tracking-wider shadow-sm ${theme.badge}`}>
                                <FiAward size={14} /> {currentTier} Partner
                            </span>
                        </div>
                        <p className={`mt-1 font-medium ${theme.textSub}`}>
                            {isAgency ? 'Agency Sales Dashboard' : 'Independent Partner Dashboard'}
                        </p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold bg-card border ${theme.cardBorder} rounded-xs shadow-sm hover:shadow transition-all ${theme.textMain}`}
                    >
                        <FiLogOut /> Logout
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* LEFT COLUMN: Wallet */}
                    <div className="lg:col-span-1 space-y-6">

                        {/* Share Card */}
                        <div className={`bg-card p-6 rounded-xs shadow-sm border ${theme.cardBorder}`}>
                            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${theme.textMain}`}>
                                <div className={`p-2 rounded-xs ${theme.iconBox}`}><FiUsers /></div> Your Referral Code
                            </h3>
                            <div className="bg-muted px-4 py-3 rounded-xs border border-border font-mono text-2xl font-bold tracking-widest text-center text-foreground mb-4">
                                {agentData?.ownReferralCode}
                            </div>
                            <div className="flex gap-2">
                                <CustomButton onClick={copyToClipboard} variant={Variant.Filled} className={`flex-1 rounded-xs flex justify-center gap-2 ${theme.btnSecondary}`}>
                                    <FiCopy /> {copied ? 'Copied' : 'Copy'}
                                </CustomButton>
                                <CustomButton onClick={shareOnWhatsApp} variant={Variant.Filled} className={`flex-1 rounded-xs flex justify-center gap-2 ${theme.btnPrimary}`}>
                                    <FiShare2 /> Share
                                </CustomButton>
                            </div>
                        </div>

                        {/* Wallet Card */}
                        <div className={`bg-card p-6 rounded-xs shadow-sm border ${theme.cardBorder}`}>
                            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${theme.textMain}`}>
                                <div className={`p-2 rounded-xs ${theme.iconBox}`}><LuIndianRupee /></div> Wallet Balance
                            </h3>

                            <div className="mb-6">
                                <p className={`text-sm font-medium ${theme.textSub}`}>Available to Withdraw</p>
                                <p className={`text-4xl font-bold ${theme.textMain}`}>₹{agentData?.unpaidBalance || 0}</p>
                            </div>

                            <div className="mb-6 border-t border-border pt-4">
                                <p className={`text-sm font-medium ${theme.textSub}`}>Lifetime Earnings (Total)</p>
                                <p className={`text-xl font-bold flex items-center gap-2 ${theme.textMain}`}>
                                    ₹{calculatedLifetimeEarnings.toFixed(2)} <FiTrendingUp className="text-green-500" size={16} />
                                </p>
                            </div>
                            <CustomButton
                                onClick={handleWithdrawRequest}
                                variant={Variant.Filled}
                                disabled={(agentData?.unpaidBalance || 0) < (agentData?.minPayoutLimit || 500) || agentData?.hasPendingRequest || isRequesting}
                                className={`w-full transition-all ${agentData?.hasPendingRequest ? '!bg-gray-400 !text-white' : theme.btnPrimary}`}
                            >
                                {isRequesting ? 'Submitting...' : agentData?.hasPendingRequest ? 'Payout Pending Approval' : 'Withdraw Funds'}
                            </CustomButton>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Agency Leads */}
                    {isAgency && (
                        <div className={`lg:col-span-2 bg-card rounded-xs shadow-sm border ${theme.cardBorder} flex flex-col`}>
                            <div className={`p-5 sm:p-6 border-b border-border ${theme.gradient} flex justify-between items-center rounded-t-xl`}>
                                <h3 className={`text-lg font-bold ${theme.headerText}`}>Active Leads</h3>
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-xs bg-card/20 ${theme.headerText}`}>
                                    {leads.length} Signups
                                </span>
                            </div>

                            <div className="p-4 sm:p-6">
                                {leads.length === 0 ? (
                                    <div className="text-center text-muted-foreground py-8 border border-dashed border-border rounded-xs w-full">
                                        No leads yet. Share your code to get started!
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-y-4 w-full mt-2">
                                        {leads.map((lead) => (
                                            <div key={lead.id} className="bg-card rounded-xs border border-border p-3 pt-4 sm:p-4 shadow-sm hover:shadow-md transition relative flex items-center justify-between gap-2 w-full">
                                                <div className="absolute -top-2.5 left-3">
                                                    <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap shadow-sm bg-card ${lead.status === 'Trial'
                                                        ? 'text-orange-600 border-orange-200'
                                                        : 'text-emerald-600 border-emerald-200'
                                                        }`}>
                                                        {lead.status}
                                                    </span>
                                                </div>

                                                <div className="min-w-0 flex-1 pr-2">
                                                    <p className="text-sm sm:text-base font-bold text-foreground truncate" title={lead.name}>{lead.name}</p>
                                                    <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">{lead.ownerPhoneNumber}</p>
                                                </div>

                                                <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                                                    <div className="flex items-baseline gap-1.5 text-right">
                                                        <p className={`text-lg sm:text-xl font-bold leading-none ${lead.status === 'Trial' ? 'text-orange-500' : 'text-foreground'}`}>
                                                            {lead.daysRemaining}
                                                        </p>
                                                        <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide mt-1">Days Left</p>
                                                    </div>

                                                    {lead.ownerPhoneNumber !== 'N/A' && (
                                                        <a
                                                            href={`tel:${lead.ownerPhoneNumber}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className={`px-2.5 py-2 sm:px-4 sm:py-2 text-sm font-bold rounded-xs focus:outline-none transition-colors flex items-center justify-center ${theme.btnPrimary}`}
                                                        >
                                                            <FiPhone size={14} />
                                                            <span className="hidden sm:inline ml-1.5">Call</span>
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!isAgency && (
                        <div className={`lg:col-span-2 bg-card rounded-xs shadow-sm border ${theme.cardBorder} p-8 flex flex-col items-center justify-center text-center`}>
                            <div className={`p-4 rounded-xs mb-4 ${theme.iconBox}`}>
                                <FiTrendingUp size={40} />
                            </div>
                            <h3 className={`text-xl font-bold mb-2 ${theme.textMain}`}>Grow Your Income</h3>
                            <p className={`max-w-md mx-auto font-medium ${theme.textSub}`}>
                                The higher your tier, the more you earn! Promote your code to unlock Silver, Gold, and Platinum status.
                            </p>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    {/* Commission Earned History */}
                    <div className={`bg-card rounded-xs shadow-sm border ${theme.cardBorder} overflow-hidden`}>
                        <div className={`p-5 border-b border-border ${theme.gradient} flex justify-between items-center`}>
                            <h3 className={`text-base font-bold flex items-center gap-2 ${theme.headerText}`}>
                                <FiList /> Earnings Ledger
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-muted-foreground">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted">
                                    <tr>
                                        <th className="px-5 py-3">Date</th>
                                        <th className="px-5 py-3">Business</th>
                                        <th className="px-5 py-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {commissions.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-5 py-6 text-center text-muted-foreground font-medium">No earnings recorded yet.</td>
                                        </tr>
                                    ) : (
                                        commissions.map((record) => (
                                            <tr key={record.id} className="bg-card border-b hover:bg-muted transition">
                                                <td className="px-5 py-3 whitespace-nowrap text-xs font-medium">
                                                    {record.date.toLocaleDateString()}
                                                </td>
                                                <td className="px-5 py-3 font-bold text-foreground">
                                                    {record.companyName}
                                                    <span className={`block text-[10px] font-bold uppercase mt-0.5 ${theme.textSub}`}>{record.type}</span>
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-emerald-600">
                                                    +₹{record.amount.toFixed(2)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Withdrawal / Payouts History */}
                    <div className={`bg-card rounded-xs shadow-sm border ${theme.cardBorder} overflow-hidden`}>
                        <div className={`p-5 border-b border-border ${theme.gradient} flex justify-between items-center`}>
                            <h3 className={`text-base font-bold flex items-center gap-2 ${theme.headerText}`}>
                                <LuIndianRupee /> Withdrawal History
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-muted-foreground">
                                <thead className="text-xs text-muted-foreground uppercase bg-muted">
                                    <tr>
                                        <th className="px-5 py-3">Date</th>
                                        <th className="px-5 py-3">Status</th>
                                        <th className="px-5 py-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payouts.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-5 py-6 text-center text-muted-foreground font-medium">No withdrawals requested yet.</td>
                                        </tr>
                                    ) : (
                                        payouts.map((payout) => (
                                            <tr key={payout.id} className="bg-card border-b hover:bg-muted transition">
                                                <td className="px-5 py-3 whitespace-nowrap text-xs font-medium">
                                                    {payout.date.toLocaleDateString()}
                                                </td>
                                                <td className="px-5 py-3">
                                                    {payout.status === 'pending' ? (
                                                        <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-xs text-[10px] font-bold flex items-center gap-1 w-max">
                                                            <FiClock size={10} /> PENDING
                                                        </span>
                                                    ) : (
                                                        <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-xs text-[10px] font-bold flex items-center gap-1 w-max">
                                                            <FiCheckCircle size={10} /> SETTLED
                                                        </span>
                                                    )}
                                                    <span className="block text-[10px] font-medium text-muted-foreground mt-1 truncate max-w-[120px]">to {payout.upiId}</span>
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-foreground">
                                                    -₹{payout.amount.toFixed(2)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
            </div>

            {/* UPI Modal */}
            {showUpiModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-card p-6 rounded-2xl shadow-xl w-full max-w-sm border border-border">
                        <h3 className="text-xl font-bold mb-2 text-foreground">Set up Payouts</h3>
                        <p className="text-sm text-muted-foreground mb-4 font-medium">Enter your UPI ID to receive your withdrawals.</p>

                        <input
                            type="text"
                            value={upiInput}
                            onChange={(e) => setUpiInput(e.target.value)}
                            placeholder="e.g. name@okhdfcbank"
                            className="w-full border border-border p-2.5 rounded-xs mb-4 focus:ring-2 focus:ring-black outline-none transition font-medium"
                        />

                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setShowUpiModal(false)}
                                disabled={isSavingUpi}
                                className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xs transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveUpi}
                                disabled={isSavingUpi || !upiInput.trim()}
                                className="px-4 py-2 text-sm font-bold bg-black text-white rounded-xs hover:bg-gray-800 disabled:bg-gray-400 flex items-center justify-center min-w-[100px] transition shadow-md"
                            >
                                {isSavingUpi ? 'Saving...' : 'Save UPI'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default PartnerDashboard;