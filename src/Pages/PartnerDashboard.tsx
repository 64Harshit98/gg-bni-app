import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { auth, db } from '../lib/Firebase';
import { doc, collection, query, where, getDocs, getDoc, updateDoc, addDoc, deleteDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { FiCopy, FiShare2, FiUsers, FiTrendingUp, FiList, FiPhone, FiLogOut, FiAward, FiClock, FiCheckCircle, FiPlus, FiTrash2, FiX, FiEdit2, FiMessageSquare, FiChevronDown, FiChevronUp } from 'react-icons/fi';
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

const MANUAL_LEAD_STATUSES = ['New', 'Contacted', 'Interested', 'Converted', 'Lost'] as const;
type ManualLeadStatus = typeof MANUAL_LEAD_STATUSES[number];

const LEAD_SOURCES = ['Referral', 'Cold Call', 'Walk-in', 'Online', 'Other'] as const;
type LeadSource = typeof LEAD_SOURCES[number];

interface RemarkEntry {
    text: string;
    createdAt: string; // ISO string
}

interface ManualLeadData {
    id: string;
    name: string;
    phoneNumber: string;
    email?: string;
    notes?: string;
    status: ManualLeadStatus;
    source?: LeadSource;
    followUpDate?: string;
    address?: string;
    remarks?: RemarkEntry[];
}

const manualLeadStatusStyles: Record<ManualLeadStatus, string> = {
    New: 'text-blue-600 border-blue-200 bg-blue-50',
    Contacted: 'text-orange-600 border-orange-200 bg-orange-50',
    Interested: 'text-purple-600 border-purple-200 bg-purple-50',
    Converted: 'text-emerald-600 border-emerald-200 bg-emerald-50',
    Lost: 'text-gray-500 border-gray-200 bg-gray-50',
};

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
    const [manualLeads, setManualLeads] = useState<ManualLeadData[]>([]);
    const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
    const [payouts, setPayouts] = useState<PayoutRequest[]>([]);

    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // Leads tab
    const [leadsTab, setLeadsTab] = useState<'signups' | 'myLeads'>('signups');

    // Modal States
    const [showUpiModal, setShowUpiModal] = useState(false);
    const [upiInput, setUpiInput] = useState('');
    const [isSavingUpi, setIsSavingUpi] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);

    // Manual Lead Add Form (inline, not a modal)
    const [showAddForm, setShowAddForm] = useState(false);
    const emptyLeadForm = { name: '', phoneNumber: '', email: '', address: '', notes: '', source: '' as LeadSource | '', followUpDate: '', status: 'New' as ManualLeadStatus };
    const [leadForm, setLeadForm] = useState(emptyLeadForm);
    const [isSavingLead, setIsSavingLead] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    // Manual Lead Edit Form (inline)
    const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState(emptyLeadForm);
    const [isSavingEdit, setIsSavingEdit] = useState(false);

    // Remarks history panel
    const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
    const [remarkText, setRemarkText] = useState('');
    const [isAddingRemark, setIsAddingRemark] = useState(false);

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

                    // 2b. Fetch Manually-Added Leads
                    const manualLeadsRef = collection(db, 'manualLeads');
                    const manualQ = query(manualLeadsRef, where('agencyId', '==', currentUser.uid));
                    const manualSnapshot = await getDocs(manualQ);

                    const fetchedManualLeads: ManualLeadData[] = [];
                    manualSnapshot.forEach((docSnap) => {
                        const data = docSnap.data();
                        fetchedManualLeads.push({
                            id: docSnap.id,
                            name: data.name || 'Unknown',
                            phoneNumber: data.phoneNumber || 'N/A',
                            email: data.email || '',
                            notes: data.notes || '',
                            status: (data.status as ManualLeadStatus) || 'New',
                            source: data.source || undefined,
                            followUpDate: data.followUpDate || undefined,
                            address: data.address || undefined,
                            remarks: Array.isArray(data.remarks) ? data.remarks : [],
                        });
                    });
                    setManualLeads(fetchedManualLeads);
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

    const handleAddLead = async () => {
        if (!leadForm.name.trim() || !leadForm.phoneNumber.trim() || !currentUser?.uid) return;

        setIsSavingLead(true);
        try {
            const docRef = await addDoc(collection(db, 'manualLeads'), {
                agencyId: currentUser.uid,
                name: leadForm.name.trim(),
                phoneNumber: leadForm.phoneNumber.trim(),
                email: leadForm.email.trim(),
                address: leadForm.address.trim(),
                notes: leadForm.notes.trim(),
                source: leadForm.source || null,
                followUpDate: leadForm.followUpDate || null,
                status: leadForm.status,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            setManualLeads(prev => [
                {
                    id: docRef.id,
                    name: leadForm.name.trim(),
                    phoneNumber: leadForm.phoneNumber.trim(),
                    email: leadForm.email.trim(),
                    address: leadForm.address.trim(),
                    notes: leadForm.notes.trim(),
                    source: leadForm.source || undefined,
                    followUpDate: leadForm.followUpDate || undefined,
                    status: leadForm.status,
                },
                ...prev,
            ]);

            setLeadForm(emptyLeadForm);
            setShowAddForm(false);
        } catch (error) {
            console.error("Error adding lead:", error);
            alert("Failed to add lead. Please try again.");
        } finally {
            setIsSavingLead(false);
        }
    };

    const handleUpdateLeadStatus = async (leadId: string, status: ManualLeadStatus) => {
        const prevLeads = manualLeads;
        setManualLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));

        try {
            await updateDoc(doc(db, 'manualLeads', leadId), { status, updatedAt: serverTimestamp() });
        } catch (error) {
            console.error("Error updating lead status:", error);
            alert("Failed to update lead status. Please try again.");
            setManualLeads(prevLeads);
        }
    };

    const handleDeleteLead = async (leadId: string) => {
        const prevLeads = manualLeads;
        setConfirmDeleteId(null);
        setManualLeads(prev => prev.filter(l => l.id !== leadId));

        try {
            await deleteDoc(doc(db, 'manualLeads', leadId));
        } catch (error) {
            console.error("Error deleting lead:", error);
            alert("Failed to remove lead. Please try again.");
            setManualLeads(prevLeads);
        }
    };

    const startEditLead = (lead: ManualLeadData) => {
        setExpandedLeadId(null);
        setConfirmDeleteId(null);
        setEditForm({
            name: lead.name,
            phoneNumber: lead.phoneNumber === 'N/A' ? '' : lead.phoneNumber,
            email: lead.email || '',
            address: lead.address || '',
            notes: lead.notes || '',
            source: lead.source || '',
            followUpDate: lead.followUpDate || '',
            status: lead.status,
        });
        setEditingLeadId(lead.id);
    };

    const handleSaveEditLead = async (leadId: string) => {
        if (!editForm.name.trim() || !editForm.phoneNumber.trim()) return;

        setIsSavingEdit(true);
        try {
            await updateDoc(doc(db, 'manualLeads', leadId), {
                name: editForm.name.trim(),
                phoneNumber: editForm.phoneNumber.trim(),
                email: editForm.email.trim(),
                address: editForm.address.trim(),
                notes: editForm.notes.trim(),
                source: editForm.source || null,
                followUpDate: editForm.followUpDate || null,
                status: editForm.status,
                updatedAt: serverTimestamp(),
            });

            setManualLeads(prev => prev.map(l => l.id === leadId ? {
                ...l,
                name: editForm.name.trim(),
                phoneNumber: editForm.phoneNumber.trim(),
                email: editForm.email.trim(),
                address: editForm.address.trim(),
                notes: editForm.notes.trim(),
                source: editForm.source || undefined,
                followUpDate: editForm.followUpDate || undefined,
                status: editForm.status,
            } : l));

            setEditingLeadId(null);
        } catch (error) {
            console.error("Error updating lead:", error);
            alert("Failed to update lead. Please try again.");
        } finally {
            setIsSavingEdit(false);
        }
    };

    const handleAddRemark = async (leadId: string) => {
        if (!remarkText.trim()) return;

        const remark: RemarkEntry = { text: remarkText.trim(), createdAt: new Date().toISOString() };

        setIsAddingRemark(true);
        try {
            await updateDoc(doc(db, 'manualLeads', leadId), {
                remarks: arrayUnion(remark),
                updatedAt: serverTimestamp(),
            });

            setManualLeads(prev => prev.map(l => l.id === leadId
                ? { ...l, remarks: [remark, ...(l.remarks || [])] }
                : l));

            setRemarkText('');
        } catch (error) {
            console.error("Error adding remark:", error);
            alert("Failed to add remark. Please try again.");
        } finally {
            setIsAddingRemark(false);
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
        return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Spinner /></div>;
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
            textSub: 'text-gray-600',
            iconBox: 'bg-gradient-to-br from-[#363636] to-gray-800 text-[#E5E4E2] shadow-sm',
            btnPrimary: '!bg-[#363636] hover:!bg-black !text-[#E5E4E2] disabled:!opacity-50',
            btnSecondary: 'bg-[#E5E4E2] hover:bg-[#C0C0C0] !text-[#363636]',
            badge: 'bg-[#363636] text-[#E5E4E2] border-gray-400',
            gradient: 'bg-gradient-to-r from-gray-100 via-[#E5E4E2] to-gray-200', // Sleek, bright platinum header
            headerText: 'text-[#363636]', // Dark gunmetal text for perfect visibility
            headerSub: 'text-gray-600'
        };

        if (t === 'gold') return {
            // Gold: FFD700 | Copper shadow: B87333
            bg: 'bg-[#FFD700]/10',
            cardBorder: 'border-[#FFD700]/50',
            textMain: 'text-[#B87333]',
            textSub: 'text-yellow-700',
            iconBox: 'bg-gradient-to-br from-[#FFD700] to-[#B87333] text-white shadow-sm',
            btnPrimary: '!bg-[#FFD700] hover:!bg-[#B87333] !text-black disabled:!opacity-50',
            btnSecondary: 'bg-[#FFD700]/20 hover:bg-[#FFD700]/40 !text-yellow-900',
            badge: 'bg-[#FFD700] text-black border-[#B87333]',
            gradient: 'bg-gradient-to-r from-[#B87333] via-[#FFD700] to-[#B87333]', // Solid Gold/Copper bar
            headerText: 'text-black', // Dark text needed for bright gold readability
            headerSub: 'text-yellow-950'
        };

        if (t === 'silver') return {
            // Silver: C0C0C0 
            bg: 'bg-[#C0C0C0]/10',
            cardBorder: 'border-[#C0C0C0]/50',
            textMain: 'text-[#363636]',
            textSub: 'text-gray-600',
            iconBox: 'bg-gradient-to-br from-[#E5E4E2] to-[#C0C0C0] text-[#363636] shadow-sm',
            btnPrimary: '!bg-[#363636] hover:!bg-black !text-[#C0C0C0] disabled:!opacity-50',
            btnSecondary: 'bg-[#C0C0C0]/20 hover:bg-[#C0C0C0]/40 !text-gray-900',
            badge: 'bg-[#C0C0C0] text-[#363636] border-gray-400',
            gradient: 'bg-gradient-to-r from-gray-500 via-[#C0C0C0] to-gray-500',
            headerText: 'text-black',
            headerSub: 'text-gray-800'
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
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold bg-white border ${theme.cardBorder} rounded-xs shadow-sm hover:shadow transition-all ${theme.textMain}`}
                    >
                        <FiLogOut /> Logout
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* LEFT COLUMN: Wallet */}
                    <div className="lg:col-span-1 space-y-6">

                        {/* Share Card */}
                        <div className={`bg-white p-6 rounded-xs shadow-sm border ${theme.cardBorder}`}>
                            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${theme.textMain}`}>
                                <div className={`p-2 rounded-xs ${theme.iconBox}`}><FiUsers /></div> Your Referral Code
                            </h3>
                            <div className="bg-gray-50 px-4 py-3 rounded-xs border border-gray-200 font-mono text-2xl font-bold tracking-widest text-center text-gray-800 mb-4">
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
                        <div className={`bg-white p-6 rounded-xs shadow-sm border ${theme.cardBorder}`}>
                            <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 ${theme.textMain}`}>
                                <div className={`p-2 rounded-xs ${theme.iconBox}`}><LuIndianRupee /></div> Wallet Balance
                            </h3>

                            <div className="mb-6">
                                <p className={`text-sm font-medium ${theme.textSub}`}>Available to Withdraw</p>
                                <p className={`text-4xl font-bold ${theme.textMain}`}>₹{agentData?.unpaidBalance || 0}</p>
                            </div>

                            <div className="mb-6 border-t border-gray-100 pt-4">
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
                        <div className={`lg:col-span-2 bg-white rounded-xs shadow-sm border ${theme.cardBorder} flex flex-col`}>
                            <div className={`p-5 sm:p-6 border-b border-gray-100 ${theme.gradient} rounded-t-xl`}>
                                <div className="flex justify-between items-center">
                                    <h3 className={`text-lg font-bold ${theme.headerText}`}>Leads</h3>
                                    {leadsTab === 'myLeads' && (
                                        <button
                                            onClick={() => setShowAddForm(prev => !prev)}
                                            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xs bg-white shadow-sm hover:shadow transition-all ${theme.textMain}`}
                                        >
                                            {showAddForm ? <FiX size={14} /> : <FiPlus size={14} />} {showAddForm ? 'Close' : 'Add Lead'}
                                        </button>
                                    )}
                                </div>
                                {/* Tab Toggle */}
                                <div className="inline-flex p-1 mt-4 rounded-xs bg-black/20 gap-1">
                                    <button
                                        onClick={() => setLeadsTab('signups')}
                                        className={`text-xs font-bold px-4 py-2 rounded-xs transition-all ${leadsTab === 'signups' ? `bg-white shadow-sm ${theme.textMain}` : 'text-white hover:bg-white/10'}`}
                                    >
                                        Signups ({leads.length})
                                    </button>
                                    <button
                                        onClick={() => setLeadsTab('myLeads')}
                                        className={`text-xs font-bold px-4 py-2 rounded-xs transition-all ${leadsTab === 'myLeads' ? `bg-white shadow-sm ${theme.textMain}` : 'text-white hover:bg-white/10'}`}
                                    >
                                        My Leads ({manualLeads.length})
                                    </button>
                                </div>
                            </div>

                            <div className="p-4 sm:p-6">
                                {leadsTab === 'signups' && (
                                    leads.length === 0 ? (
                                        <div className="text-center text-gray-500 py-8 border border-dashed border-gray-300 rounded-xs w-full">
                                            No leads yet. Share your code to get started!
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-y-4 w-full mt-2">
                                            {leads.map((lead) => (
                                                <div key={lead.id} className="bg-white rounded-xs border border-slate-200 p-3 pt-4 sm:p-4 shadow-sm hover:shadow-md transition relative flex items-center justify-between gap-2 w-full">
                                                    <div className="absolute -top-2.5 left-3">
                                                        <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap shadow-sm bg-white ${lead.status === 'Trial'
                                                            ? 'text-orange-600 border-orange-200'
                                                            : 'text-emerald-600 border-emerald-200'
                                                            }`}>
                                                            {lead.status}
                                                        </span>
                                                    </div>

                                                    <div className="min-w-0 flex-1 pr-2">
                                                        <p className="text-sm sm:text-base font-bold text-slate-800 truncate" title={lead.name}>{lead.name}</p>
                                                        <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">{lead.ownerPhoneNumber}</p>
                                                    </div>

                                                    <div className="flex items-center gap-3 sm:gap-5 shrink-0">
                                                        <div className="flex items-baseline gap-1.5 text-right">
                                                            <p className={`text-lg sm:text-xl font-bold leading-none ${lead.status === 'Trial' ? 'text-orange-500' : 'text-slate-800'}`}>
                                                                {lead.daysRemaining}
                                                            </p>
                                                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide mt-1">Days Left</p>
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
                                    )
                                )}

                                {leadsTab === 'myLeads' && (
                                    <div className="w-full">
                                        {/* Inline Add Lead Form */}
                                        {showAddForm && (
                                            <div className="border border-slate-200 rounded-xs p-4 mb-4 bg-slate-50">
                                                <h4 className="text-sm font-bold text-slate-700 mb-3">New Lead Details</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    <input
                                                        type="text"
                                                        value={leadForm.name}
                                                        onChange={(e) => setLeadForm(prev => ({ ...prev, name: e.target.value }))}
                                                        placeholder="Business / Contact name *"
                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm"
                                                    />
                                                    <input
                                                        type="tel"
                                                        value={leadForm.phoneNumber}
                                                        onChange={(e) => setLeadForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
                                                        placeholder="Phone number *"
                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm"
                                                    />
                                                    <input
                                                        type="email"
                                                        value={leadForm.email}
                                                        onChange={(e) => setLeadForm(prev => ({ ...prev, email: e.target.value }))}
                                                        placeholder="Email (optional)"
                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={leadForm.address}
                                                        onChange={(e) => setLeadForm(prev => ({ ...prev, address: e.target.value }))}
                                                        placeholder="Address / location (optional)"
                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm"
                                                    />
                                                    <select
                                                        value={leadForm.source}
                                                        onChange={(e) => setLeadForm(prev => ({ ...prev, source: e.target.value as LeadSource }))}
                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm text-gray-700"
                                                    >
                                                        <option value="">Lead source (optional)</option>
                                                        {LEAD_SOURCES.map((s) => (
                                                            <option key={s} value={s}>{s}</option>
                                                        ))}
                                                    </select>
                                                    <input
                                                        type="date"
                                                        value={leadForm.followUpDate}
                                                        onChange={(e) => setLeadForm(prev => ({ ...prev, followUpDate: e.target.value }))}
                                                        title="Follow-up date"
                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm text-gray-700"
                                                    />
                                                    <select
                                                        value={leadForm.status}
                                                        onChange={(e) => setLeadForm(prev => ({ ...prev, status: e.target.value as ManualLeadStatus }))}
                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm text-gray-700"
                                                    >
                                                        {MANUAL_LEAD_STATUSES.map((s) => (
                                                            <option key={s} value={s}>{s}</option>
                                                        ))}
                                                    </select>
                                                    <textarea
                                                        value={leadForm.notes}
                                                        onChange={(e) => setLeadForm(prev => ({ ...prev, notes: e.target.value }))}
                                                        placeholder="Notes (optional)"
                                                        rows={1}
                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm resize-none sm:col-span-2"
                                                    />
                                                </div>

                                                <div className="flex justify-end gap-2 mt-3">
                                                    <button
                                                        onClick={() => { setShowAddForm(false); setLeadForm(emptyLeadForm); }}
                                                        disabled={isSavingLead}
                                                        className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200 rounded-xs transition"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={handleAddLead}
                                                        disabled={isSavingLead || !leadForm.name.trim() || !leadForm.phoneNumber.trim()}
                                                        className={`px-4 py-2 text-sm font-bold rounded-xs disabled:!bg-gray-400 flex items-center justify-center min-w-[100px] transition shadow-sm ${theme.btnPrimary}`}
                                                    >
                                                        {isSavingLead ? 'Saving...' : 'Save Lead'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {manualLeads.length === 0 ? (
                                            <div className="text-center text-gray-500 py-8 border border-dashed border-gray-300 rounded-xs w-full">
                                                No leads added yet. Click "Add Lead" to track your own prospects.
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-y-4 w-full mt-2">
                                                {manualLeads.map((lead) => (
                                                    <div key={lead.id} className="bg-white rounded-xs border border-slate-200 shadow-sm hover:shadow-md transition relative w-full">
                                                        {editingLeadId === lead.id ? (
                                                            /* --- Inline Edit Form --- */
                                                            <div className="p-4 bg-slate-50 rounded-xs">
                                                                <h4 className="text-sm font-bold text-slate-700 mb-3">Edit Lead</h4>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                                    <input
                                                                        type="text"
                                                                        value={editForm.name}
                                                                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                                                                        placeholder="Business / Contact name *"
                                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm"
                                                                    />
                                                                    <input
                                                                        type="tel"
                                                                        value={editForm.phoneNumber}
                                                                        onChange={(e) => setEditForm(prev => ({ ...prev, phoneNumber: e.target.value }))}
                                                                        placeholder="Phone number *"
                                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm"
                                                                    />
                                                                    <input
                                                                        type="email"
                                                                        value={editForm.email}
                                                                        onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                                                                        placeholder="Email (optional)"
                                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm"
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        value={editForm.address}
                                                                        onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                                                                        placeholder="Address / location (optional)"
                                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm"
                                                                    />
                                                                    <select
                                                                        value={editForm.source}
                                                                        onChange={(e) => setEditForm(prev => ({ ...prev, source: e.target.value as LeadSource }))}
                                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm text-gray-700"
                                                                    >
                                                                        <option value="">Lead source (optional)</option>
                                                                        {LEAD_SOURCES.map((s) => (
                                                                            <option key={s} value={s}>{s}</option>
                                                                        ))}
                                                                    </select>
                                                                    <input
                                                                        type="date"
                                                                        value={editForm.followUpDate}
                                                                        onChange={(e) => setEditForm(prev => ({ ...prev, followUpDate: e.target.value }))}
                                                                        title="Follow-up date"
                                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm text-gray-700"
                                                                    />
                                                                    <select
                                                                        value={editForm.status}
                                                                        onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value as ManualLeadStatus }))}
                                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm text-gray-700"
                                                                    >
                                                                        {MANUAL_LEAD_STATUSES.map((s) => (
                                                                            <option key={s} value={s}>{s}</option>
                                                                        ))}
                                                                    </select>
                                                                    <textarea
                                                                        value={editForm.notes}
                                                                        onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                                                                        placeholder="Notes (optional)"
                                                                        rows={1}
                                                                        className="w-full border border-gray-300 p-2.5 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-sm resize-none sm:col-span-2"
                                                                    />
                                                                </div>

                                                                <div className="flex justify-end gap-2 mt-3">
                                                                    <button
                                                                        onClick={() => setEditingLeadId(null)}
                                                                        disabled={isSavingEdit}
                                                                        className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-200 rounded-xs transition"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleSaveEditLead(lead.id)}
                                                                        disabled={isSavingEdit || !editForm.name.trim() || !editForm.phoneNumber.trim()}
                                                                        className={`px-4 py-2 text-sm font-bold rounded-xs disabled:!bg-gray-400 flex items-center justify-center min-w-[100px] transition shadow-sm ${theme.btnPrimary}`}
                                                                    >
                                                                        {isSavingEdit ? 'Saving...' : 'Save Changes'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            /* --- Normal Row --- */
                                                            <div className="p-3 pt-4 sm:p-4 flex items-center justify-between gap-2 w-full">
                                                                <div className="absolute -top-2.5 left-3">
                                                                    <select
                                                                        value={lead.status}
                                                                        onChange={(e) => handleUpdateLeadStatus(lead.id, e.target.value as ManualLeadStatus)}
                                                                        className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap shadow-sm cursor-pointer outline-none ${manualLeadStatusStyles[lead.status]}`}
                                                                    >
                                                                        {MANUAL_LEAD_STATUSES.map((s) => (
                                                                            <option key={s} value={s}>{s}</option>
                                                                        ))}
                                                                    </select>
                                                                </div>

                                                                <div className="min-w-0 flex-1 pr-2">
                                                                    <p className="text-sm sm:text-base font-bold text-slate-800 truncate" title={lead.name}>{lead.name}</p>
                                                                    <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 truncate">{lead.phoneNumber}{lead.email ? ` · ${lead.email}` : ''}</p>
                                                                    {lead.address && <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate" title={lead.address}>{lead.address}</p>}
                                                                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                        {lead.source && (
                                                                            <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{lead.source}</span>
                                                                        )}
                                                                        {lead.followUpDate && (
                                                                            <span className="text-[9px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Follow-up: {lead.followUpDate}</span>
                                                                        )}
                                                                    </div>
                                                                    {lead.notes && <p className="text-[11px] sm:text-xs text-slate-400 mt-1 truncate" title={lead.notes}>{lead.notes}</p>}
                                                                </div>

                                                                <div className="flex items-center gap-2 shrink-0">
                                                                    {confirmDeleteId === lead.id ? (
                                                                        <>
                                                                            <button
                                                                                onClick={() => handleDeleteLead(lead.id)}
                                                                                className="px-2.5 py-2 text-xs font-bold rounded-xs bg-red-500 text-white hover:bg-red-600 transition-colors"
                                                                            >
                                                                                Confirm
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setConfirmDeleteId(null)}
                                                                                className="px-2.5 py-2 text-xs font-bold rounded-xs border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                                                                            >
                                                                                Cancel
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            {lead.phoneNumber !== 'N/A' && (
                                                                                <a
                                                                                    href={`tel:${lead.phoneNumber}`}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className={`px-2.5 py-2 sm:px-4 sm:py-2 text-sm font-bold rounded-xs focus:outline-none transition-colors flex items-center justify-center ${theme.btnPrimary}`}
                                                                                >
                                                                                    <FiPhone size={14} />
                                                                                    <span className="hidden sm:inline ml-1.5">Call</span>
                                                                                </a>
                                                                            )}
                                                                            <button
                                                                                onClick={() => setExpandedLeadId(prev => prev === lead.id ? null : lead.id)}
                                                                                className={`px-2.5 py-2 text-sm font-bold rounded-xs border transition-colors flex items-center justify-center gap-1 ${expandedLeadId === lead.id ? 'border-slate-400 bg-slate-100 text-slate-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                                                                title="Remarks"
                                                                            >
                                                                                <FiMessageSquare size={14} />
                                                                                {lead.remarks && lead.remarks.length > 0 && (
                                                                                    <span className="text-[10px] font-bold">{lead.remarks.length}</span>
                                                                                )}
                                                                                {expandedLeadId === lead.id ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
                                                                            </button>
                                                                            <button
                                                                                onClick={() => startEditLead(lead)}
                                                                                className="px-2.5 py-2 text-sm font-bold rounded-xs border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors flex items-center justify-center"
                                                                                title="Edit lead"
                                                                            >
                                                                                <FiEdit2 size={14} />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => setConfirmDeleteId(lead.id)}
                                                                                className="px-2.5 py-2 text-sm font-bold rounded-xs border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center"
                                                                            >
                                                                                <FiTrash2 size={14} />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* --- Remarks History Panel --- */}
                                                        {editingLeadId !== lead.id && expandedLeadId === lead.id && (
                                                            <div className="border-t border-slate-100 p-3 sm:p-4 bg-slate-50/60">
                                                                <div className="flex gap-2 mb-3">
                                                                    <input
                                                                        type="text"
                                                                        value={remarkText}
                                                                        onChange={(e) => setRemarkText(e.target.value)}
                                                                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddRemark(lead.id); }}
                                                                        placeholder="Add a remark..."
                                                                        className="flex-1 border border-gray-300 p-2 rounded-xs focus:ring-2 focus:ring-black outline-none transition font-medium text-xs sm:text-sm"
                                                                    />
                                                                    <button
                                                                        onClick={() => handleAddRemark(lead.id)}
                                                                        disabled={isAddingRemark || !remarkText.trim()}
                                                                        className={`px-3 py-2 text-xs font-bold rounded-xs disabled:!bg-gray-400 transition shadow-sm ${theme.btnPrimary}`}
                                                                    >
                                                                        {isAddingRemark ? 'Adding...' : 'Add'}
                                                                    </button>
                                                                </div>

                                                                {(!lead.remarks || lead.remarks.length === 0) ? (
                                                                    <p className="text-xs text-slate-400 text-center py-2">No remarks yet.</p>
                                                                ) : (
                                                                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                                                                        {lead.remarks.map((remark, idx) => (
                                                                            <div key={idx} className="bg-white border border-slate-200 rounded-xs px-3 py-2">
                                                                                <p className="text-xs sm:text-sm text-slate-700">{remark.text}</p>
                                                                                <p className="text-[10px] text-slate-400 mt-1 font-medium">
                                                                                    {new Date(remark.createdAt).toLocaleString()}
                                                                                </p>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {!isAgency && (
                        <div className={`lg:col-span-2 bg-white rounded-xs shadow-sm border ${theme.cardBorder} p-8 flex flex-col items-center justify-center text-center`}>
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
                    <div className={`bg-white rounded-xs shadow-sm border ${theme.cardBorder} overflow-hidden`}>
                        <div className={`p-5 border-b border-gray-100 ${theme.gradient} flex justify-between items-center`}>
                            <h3 className={`text-base font-bold flex items-center gap-2 ${theme.headerText}`}>
                                <FiList /> Earnings Ledger
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-500">
                                <thead className="text-xs text-gray-400 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3">Date</th>
                                        <th className="px-5 py-3">Business</th>
                                        <th className="px-5 py-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {commissions.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-5 py-6 text-center text-gray-400 font-medium">No earnings recorded yet.</td>
                                        </tr>
                                    ) : (
                                        commissions.map((record) => (
                                            <tr key={record.id} className="bg-white border-b hover:bg-gray-50 transition">
                                                <td className="px-5 py-3 whitespace-nowrap text-xs font-medium">
                                                    {record.date.toLocaleDateString()}
                                                </td>
                                                <td className="px-5 py-3 font-bold text-gray-800">
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
                    <div className={`bg-white rounded-xs shadow-sm border ${theme.cardBorder} overflow-hidden`}>
                        <div className={`p-5 border-b border-gray-100 ${theme.gradient} flex justify-between items-center`}>
                            <h3 className={`text-base font-bold flex items-center gap-2 ${theme.headerText}`}>
                                <LuIndianRupee /> Withdrawal History
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-500">
                                <thead className="text-xs text-gray-400 uppercase bg-gray-50">
                                    <tr>
                                        <th className="px-5 py-3">Date</th>
                                        <th className="px-5 py-3">Status</th>
                                        <th className="px-5 py-3 text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payouts.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-5 py-6 text-center text-gray-400 font-medium">No withdrawals requested yet.</td>
                                        </tr>
                                    ) : (
                                        payouts.map((payout) => (
                                            <tr key={payout.id} className="bg-white border-b hover:bg-gray-50 transition">
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
                                                    <span className="block text-[10px] font-medium text-gray-400 mt-1 truncate max-w-[120px]">to {payout.upiId}</span>
                                                </td>
                                                <td className="px-5 py-3 text-right font-bold text-gray-800">
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
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm border border-gray-100">
                        <h3 className="text-xl font-bold mb-2 text-gray-900">Set up Payouts</h3>
                        <p className="text-sm text-gray-500 mb-4 font-medium">Enter your UPI ID to receive your withdrawals.</p>

                        <input
                            type="text"
                            value={upiInput}
                            onChange={(e) => setUpiInput(e.target.value)}
                            placeholder="e.g. name@okhdfcbank"
                            className="w-full border border-gray-300 p-2.5 rounded-xs mb-4 focus:ring-2 focus:ring-black outline-none transition font-medium"
                        />

                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setShowUpiModal(false)}
                                disabled={isSavingUpi}
                                className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xs transition"
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