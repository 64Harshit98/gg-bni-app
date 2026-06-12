import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { collection, doc, updateDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { db } from '../lib/Firebase';
import { useAuth } from "../context/auth-context";
import { Search, Phone, Filter } from 'lucide-react'

type RequestType = {
    id: string;
    customerName?: string;
    customerNumber?: string;
    businessCard?: string;
    status?: string;
    createdAt?: any;
    type?: 'notify' | 'approval';
    items?: { name: string; qty?: number, id?: string, inStock?: boolean }[];
    inStock?: boolean;
    messageSent?: boolean;
    // bulk quote fields
    itemName?: string;
    itemImage?: string;
    quantity?: string;
    note?: string;
};
type BulkQuoteType = {
    id: string;
    customerName?: string;
    customerNumber?: string;
    itemId?: string;
    itemName?: string;
    itemImage?: string;
    quantity?: string;
    note?: string;
    status?: string;
    createdAt?: any;
};
type PersonalizationType = {
    id: string;
    customerName?: string;
    customerNumber?: string;
    itemId?: string;
    itemName?: string;
    itemImage?: string;
    note?: string;
    status?: string;
    createdAt?: any;
};

function RequestPage() {
    const navigate = useNavigate()
    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId;
    const [requireApproval, setRequireApproval] = useState<boolean>(false);
    const [requestType, setRequestType] = useState<'notify' | 'approval'>('approval')
    const [approvalStatus, setApprovalStatus] = useState<'pending' | 'completed'>('pending')
    const [requests, setRequests] = useState<RequestType[]>([]);
    const [bulkQuotes, setBulkQuotes] = useState<BulkQuoteType[]>([]);
    const [personalizationRequests, setPersonalizationRequests] = useState<PersonalizationType[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [animatingId, setAnimatingId] = useState<string | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [completedFilter, setCompletedFilter] = useState<'all' | 'approved' | 'declined'>('all')

    useEffect(() => {
        if (!companyId) return;
        const fetchSettings = async () => {
            try {
                const { doc, getDoc } = await import('firebase/firestore');
                const settingsRef = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');
                const snap = await getDoc(settingsRef);
                if (snap.exists()) {
                    const data = snap.data();
                    setRequireApproval(data.requireApproval === true);
                    // If approval disabled, lock to notify tab
                    if (!data.requireApproval) {
                        setRequestType('notify');
                    } else {
                        setRequestType('approval');
                    }
                }
            } catch (err) {
                console.error('Failed to fetch settings:', err);
            }
        };
        fetchSettings();
    }, [companyId]);
    const formatDate = (timestamp: any) => {
        if (!timestamp) return "--/-- , --:--";

        if (typeof timestamp.toDate !== "function")
            return "--/-- , --:--";

        const date = timestamp.toDate();

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");

        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");

        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12 || 12; // 0 -> 12

        return `${day}/${month} , ${hours}:${minutes} ${ampm}`;
    };

    const getStatusStyle = (status?: string) => {
        switch (status) {
            case "approved":
                return "bg-green-50 text-green-600 border-green-100";
            case "declined":
                return "bg-red-50 text-red-600 border-red-100";
            default:
                return "bg-gray-50 text-gray-600 border-gray-100"; // pending
        }
    };

    const getNotifyBadge = (req: RequestType) => {
        const items = req.items || [];

        const anyInStock = items.some(i => i.inStock === true);

        const allOutOfStock =
            items.length > 0 &&
            items.every(i => i.inStock === false || i.inStock === undefined);

        if (allOutOfStock) {
            return {
                text: "Out of Stock",
                class: "bg-red-50 text-red-600 border-red-200"
            };
        }

        if (anyInStock && !req.messageSent) {
            return {
                text: "In Stock",
                class: "bg-yellow-50 text-yellow-600 border-yellow-200"
            };
        }

        if (anyInStock && req.messageSent) {
            return {
                text: "In Stock + Message Sent",
                class: "bg-emerald-50 text-emerald-600 border-emerald-200"
            };
        }

        return null;
    };

    const updateRequestStatus = async (
        requestId: string,
        newStatus: "approved" | "declined"
    ) => {
        if (!companyId) return;

        // animation start
        setAnimatingId(requestId);

        setTimeout(async () => {
            try {
                await updateDoc(
                    doc(db, "companies", companyId, "AuthorizedUser", requestId),
                    {
                        status: newStatus,
                    }
                );

                setRequests(prev =>
                    prev.map(r =>
                        r.id === requestId ? { ...r, status: newStatus } : r
                    )
                );

                setAnimatingId(null);
            } catch (err) {
                console.error(err);
                setAnimatingId(null);
            }
        }, 250); // animation duration
    };

    const filteredRequests = useMemo(() => {
        const queryText = searchQuery.toLowerCase();
        return requests
            .filter(req => {
                const matchesSearch =
                    (req.customerName || "").toLowerCase().includes(queryText) ||
                    (req.customerNumber || "").includes(queryText);

                if (!matchesSearch) return false;

                if (requestType === "notify") {
                    return req.type === "notify";
                }

                if (requestType === "approval") {
                    if (req.type !== "approval") return false;

                    if (approvalStatus === "pending") {
                        return req.status === "pending";
                    }

                    if (approvalStatus === "completed") {
                        if (completedFilter === "approved") return req.status === "approved";
                        if (completedFilter === "declined") return req.status === "declined";
                        return req.status === "approved" || req.status === "declined";
                    }
                }

                return true;
            })
            .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    }, [requests, searchQuery, requestType, approvalStatus, completedFilter]);

    // Map phone → bulk quotes for fast lookup inside expanded cards
    const bulkByPhone = useMemo(() => {
        const map: Record<string, BulkQuoteType[]> = {};
        bulkQuotes.forEach(bq => {
            const phone = (bq.customerNumber || '').replace(/\D/g, '');
            if (!phone) return;
            if (!map[phone]) map[phone] = [];
            map[phone].push(bq);
        });
        return map;
    }, [bulkQuotes]);
    const personalizationByPhone = useMemo(() => {
        const map: Record<string, PersonalizationType[]> = {};
        personalizationRequests.forEach(pr => {
            const phone = (pr.customerNumber || '').replace(/\D/g, '');
            if (!phone) return;
            if (!map[phone]) map[phone] = [];
            map[phone].push(pr);
        });
        return map;
    }, [personalizationRequests]);

    // Bulk quotes with no matching customer row → shown as standalone cards
    const unmatchedBulkQuotes = useMemo(() => {
        const knownPhones = new Set(
            requests.map(r => (r.customerNumber || '').replace(/\D/g, ''))
        );
        const queryText = searchQuery.toLowerCase();
        return bulkQuotes.filter(bq => {
            const phone = (bq.customerNumber || '').replace(/\D/g, '');
            if (knownPhones.has(phone)) return false;
            if (!queryText) return true;
            return (
                (bq.customerName || '').toLowerCase().includes(queryText) ||
                (bq.customerNumber || '').includes(queryText)
            );
        });
    }, [bulkQuotes, requests, searchQuery]);
    const unmatchedPersonalizations = useMemo(() => {
        const knownPhones = new Set(
            requests.map(r => (r.customerNumber || '').replace(/\D/g, ''))
        );
        const queryText = searchQuery.toLowerCase();
        return personalizationRequests.filter(pr => {
            const phone = (pr.customerNumber || '').replace(/\D/g, '');
            if (knownPhones.has(phone)) return false;
            if (!queryText) return true;
            return (
                (pr.customerName || '').toLowerCase().includes(queryText) ||
                (pr.customerNumber || '').includes(queryText)
            );
        });
    }, [personalizationRequests, requests, searchQuery]);

    // Merged pre-order cards: group unmatched bulk + query by phone, one card per customer
    const mergedPreOrderCards = useMemo(() => {
        const map = new Map<string, {
            phone: string;
            name: string;
            latestAt: number;
            bulks: BulkQuoteType[];
            queries: PersonalizationType[];
        }>();

        unmatchedBulkQuotes.forEach(bq => {
            const phone = (bq.customerNumber || '').replace(/\D/g, '');
            if (!map.has(phone)) {
                map.set(phone, { phone, name: bq.customerName || 'No Name', latestAt: 0, bulks: [], queries: [] });
            }
            const entry = map.get(phone)!;
            entry.bulks.push(bq);
            const ts = bq.createdAt?.seconds || 0;
            if (ts > entry.latestAt) { entry.latestAt = ts; entry.name = bq.customerName || entry.name; }
        });

        unmatchedPersonalizations.forEach(pr => {
            const phone = (pr.customerNumber || '').replace(/\D/g, '');
            if (!map.has(phone)) {
                map.set(phone, { phone, name: pr.customerName || 'No Name', latestAt: 0, bulks: [], queries: [] });
            }
            const entry = map.get(phone)!;
            entry.queries.push(pr);
            const ts = pr.createdAt?.seconds || 0;
            if (ts > entry.latestAt) { entry.latestAt = ts; entry.name = pr.customerName || entry.name; }
        });

        return Array.from(map.values()).sort((a, b) => b.latestAt - a.latestAt);
    }, [unmatchedBulkQuotes, unmatchedPersonalizations]);

    // Unified list for notify tab: notify rows + mergedPreOrderCards interleaved by time
    const unifiedNotifyList = useMemo(() => {
        if (requestType !== 'notify') return [];

        type NotifyRow = { kind: 'notify'; ts: number; data: RequestType };
        type MergedRow = { kind: 'merged'; ts: number; data: typeof mergedPreOrderCards[number] };
        type UnifiedRow = NotifyRow | MergedRow;

        const notifyRows: UnifiedRow[] = filteredRequests.map(r => ({
            kind: 'notify' as const,
            ts: r.createdAt?.seconds || 0,
            data: r,
        }));

        const mergedRows: UnifiedRow[] = mergedPreOrderCards.map(c => ({
            kind: 'merged' as const,
            ts: c.latestAt,
            data: c,
        }));

        return [...notifyRows, ...mergedRows].sort((a, b) => b.ts - a.ts);
    }, [requestType, filteredRequests, mergedPreOrderCards]);
    useEffect(() => {
        if (!companyId) return;
        const approvalRef = collection(
            db,
            "companies",
            companyId,
            "AuthorizedUser"
        );

        const notifyRef = collection(
            db,
            "companies",
            companyId,
            "NotifyRequests"
        );

        let approvalData: any[] = [];
        let notifyData: any[] = [];

        const mergeAndSet = () => {
            const combined = [...approvalData, ...notifyData];

            const uniqueMap = new Map<string, any>();

            combined.forEach((item: any) => {
                const key =
                    item.type === "approval"
                        ? `approval_${item.customerNumber}`
                        : `notify_${item.customerNumber}`;

                uniqueMap.set(key, item);
            });

            const merged = Array.from(uniqueMap.values()).sort(
                (a: any, b: any) =>
                    (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
            );

            setRequests(merged);
        };

        // approval realtime
        const unsubApproval = onSnapshot(approvalRef, (snap) => {
            approvalData = snap.docs.map(doc => ({
                id: doc.id,
                type: "approval",
                ...doc.data(),
            }));
            mergeAndSet();
        });

        // notify realtime
        const unsubNotify = onSnapshot(notifyRef, (snap) => {
            notifyData = snap.docs.map((docSnap) => {
                const data = docSnap.data() as Partial<RequestType>;

                return {
                    id: docSnap.id,
                    type: "notify" as const,

                    // spread safe
                    ...data,

                    // boolean normalize (SUPER SAFE)
                    inStock: Boolean(data?.inStock),
                    messageSent: Boolean(data?.messageSent),
                };
            });

            mergeAndSet();
        });
        const bulkRef = collection(db, 'companies', companyId, 'BulkQuoteRequests');
        const unsubBulk = onSnapshot(bulkRef, (snap) => {
            const items: BulkQuoteType[] = snap.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data() as any,
            }));
            setBulkQuotes(items); // standalone state, not merged into requests
        });
        const personalizationRef = collection(db, 'companies', companyId, 'PersonalizationRequests');
        const unsubPersonalization = onSnapshot(personalizationRef, (snap) => {
            const items: PersonalizationType[] = snap.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data() as any,
            }));
            setPersonalizationRequests(items);
        });

        return () => {
            unsubApproval();
            unsubNotify();
            unsubBulk();
            unsubPersonalization();
        };
    }, [companyId]);

    const markMessageSent = async (requestId: string) => {
        if (!companyId) return;

        try {
            await updateDoc(
                doc(db, "companies", companyId, "NotifyRequests", requestId),
                {
                    messageSent: true,
                    updatedAt: new Date(),
                }
            );

            // local state update (instant UI)
            setRequests(prev =>
                prev.map(r =>
                    r.id === requestId
                        ? { ...r, messageSent: true }
                        : r
                )
            );
        } catch (err) {
            console.error("MessageSent update error:", err);
        }
    };

    const handleDeleteNotify = async (req: RequestType) => {
        if (!companyId) return;

        try {
            if (req.type === "notify") {
                await deleteDoc(
                    doc(db, "companies", companyId, "NotifyRequests", req.id)
                );
            }

            if (req.type === "approval") {
                await deleteDoc(
                    doc(db, "companies", companyId, "AuthorizedUser", req.id)
                );
            }

            setRequests(prev => prev.filter(r => r.id !== req.id));
        } catch (err) {
            console.error("Delete error:", err);
        }
    };
    const handleDeleteBulk = async (bulkId: string) => {
        if (!companyId) return;
        try {
            await deleteDoc(
                doc(db, "companies", companyId, "BulkQuoteRequests", bulkId)
            );
            setBulkQuotes(prev => prev.filter(b => b.id !== bulkId));
        } catch (err) {
            console.error("Delete bulk error:", err);
        }
    };
    const handleDeletePersonalization = async (pid: string) => {
        if (!companyId) return;
        try {
            await deleteDoc(doc(db, "companies", companyId, "PersonalizationRequests", pid));
            setPersonalizationRequests(prev => prev.filter(p => p.id !== pid));
        } catch (err) {
            console.error("Delete personalization error:", err);
        }
    };
    const formatWhatsAppNumber = (num?: string) => {
        if (!num) return "";

        let clean = num.replace(/\D/g, "");

        // India default
        if (clean.length === 10) {
            clean = "91" + clean;
        }

        return clean;
    };

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col">

            {/* --- HEADER --- */}
            <header className="sticky top-0 z-[100] bg-white border-b border-gray-100 shadow-sm w-full">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">

                    {/* LEFT */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-1 hover:bg-gray-100 rounded-sm transition-colors"
                        >
                            <ChevronLeft className="text-[#F97316]" size={20} />
                        </button>

                        <div className="w-1 h-5 bg-[#F97316] rounded-sm"></div>

                        <h1 className="text-xs md:text-sm font-black text-[#F97316] uppercase tracking-tighter">
                            Request Page
                        </h1>
                    </div>

                    {/* RIGHT SEARCH ICON */}
                    <button
                        onClick={() => setIsSearchOpen(prev => !prev)}
                        className="p-2 rounded-sm hover:bg-gray-100 transition-colors"
                    >
                        <Search size={18} className="text-[#F97316]" />
                    </button>
                </div>
            </header>

            {isSearchOpen && (
                <div className="sticky top-[56px] z-[95] px-4 p-3 bg-white border-b border-gray-100">
                    <input
                        type="text"
                        placeholder="Search by name or number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full p-3 border border-gray-200 rounded-sm text-sm outline-none focus:border-[#F97316]"
                    />
                </div>
            )}

            {/* --- PAGE CONTENT --- */}
            <main className="p-4 flex-1 max-w-7xl mx-auto w-full">

                {/* Main Toggle: Pending / Completed */}
                <div className="sticky top-[56px] z-[90] bg-[#E9F0F7] py-1">
                    {requireApproval ? (
                        <div className="flex bg-white p-1 rounded-sm shadow-sm mb-2 border border-gray-200">
                            <button
                                onClick={() => setRequestType('notify')}
                                className={`flex-1 py-1 text-sm font-bold rounded-sm transition-all ${requestType === 'notify'
                                    ? 'bg-[#F97316] text-white'
                                    : 'text-gray-500'
                                    }`}
                            >
                                Pre-Order Requests
                            </button>
                            <button
                                onClick={() => setRequestType('approval')}
                                className={`flex-1 py-1 text-sm font-bold rounded-sm transition-all ${requestType === 'approval'
                                    ? 'bg-[#F97316] text-white'
                                    : 'text-gray-500'
                                    }`}
                            >
                                Approval Requests
                            </button>
                        </div>
                    ) : (
                        <div className="bg-white p-2 rounded-sm shadow-sm mb-2 border border-gray-200 text-center">
                            <span className="text-sm font-black text-[#F97316] uppercase tracking-tight">Pre-Order Requests</span>
                        </div>
                    )}
                </div>

                {/* Sub Toggle: Only visible when "Completed" is selected */}
                {requestType === 'approval' && (
                    <div className="flex gap-2 mb-4 items-center">
                        <button
                            onClick={() => setApprovalStatus('pending')}
                            className={`flex-1 py-2 text-xs font-bold rounded-sm border ${approvalStatus === 'pending'
                                ? 'bg-[#F97316] text-white'
                                : 'bg-white border-gray-200 text-gray-500'
                                }`}
                        >
                            Pending
                        </button>

                        <button
                            onClick={() => setApprovalStatus('completed')}
                            className={`flex-1 py-2 text-xs font-bold rounded-sm border ${approvalStatus === 'completed'
                                ? 'bg-[#F97316] text-white'
                                : 'bg-white border-gray-200 text-gray-500'
                                }`}
                        >
                            Completed
                        </button>
                    </div>
                )}

                {requestType === 'approval' && approvalStatus === 'completed' && (
                    <div className="flex justify-end">
                        <div className="relative">
                            <button
                                onClick={() => setIsFilterOpen(prev => !prev)}
                                className="p-2 border border-gray-200 rounded-sm bg-white hover:bg-gray-50"
                                title="Filter"
                            >
                                <Filter size={16} className="text-gray-600" />
                            </button>

                            {isFilterOpen && (
                                <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-200 rounded-md shadow-md z-50 overflow-hidden">
                                    {['all', 'approved', 'declined'].map(option => (
                                        <button
                                            key={option}
                                            onClick={() => {
                                                setCompletedFilter(option as any)
                                                setIsFilterOpen(false)
                                            }}
                                            className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${completedFilter === option
                                                ? 'bg-gray-100 font-semibold'
                                                : ''
                                                }`}
                                        >
                                            {option.charAt(0).toUpperCase() + option.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Content Area Placeholder */}
                <div className="mt-1 text-center text-gray-400 text-sm italic">
                    Showing {requestType === 'notify' ? 'notify' : approvalStatus} requests...
                </div>

                <div className="space-y-3 mt-1">
                    {(requestType === 'notify' ? unifiedNotifyList : filteredRequests.map(r => ({ kind: 'notify' as const, ts: 0, data: r }))).map((row) => {

                        // ── MERGED CARD (bulk + query, no approval row) ──
                        if (row.kind === 'merged') {
                            const card = row.data;
                            const cardKey = card.phone;
                            const isExpanded = expandedId === cardKey;
                            const badgeLabels = [
                                ...(card.bulks.length > 0 ? ['Bulk Quote'] : []),
                                ...(card.queries.length > 0 ? ['Query'] : []),
                            ];
                            const latestItem = [
                                ...card.bulks.map(b => ({ createdAt: b.createdAt })),
                                ...card.queries.map(q => ({ createdAt: q.createdAt })),
                            ].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];

                            return (
                                <div
                                    key={`merged_${cardKey}`}
                                    onClick={() => setExpandedId(isExpanded ? null : cardKey)}
                                    className="p-3 shadow-sm border rounded-sm cursor-pointer bg-white border-gray-100 transition-all duration-300"
                                >
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-xs font-bold text-slate-800">{card.name}</h3>
                                            <p className="text-xs font-medium flex items-center gap-1.5 p-0.5 rounded-xs border text-gray-600 bg-gray-50 border-gray-200">
                                                <Phone size={14} className="text-gray-400" />
                                                {card.phone || "No Number"}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">{formatDate(latestItem?.createdAt)}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {badgeLabels.map(label => (
                                                <span key={label} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${label === 'Bulk Quote' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-yellow-50 text-yellow-600 border-yellow-200'}`}>
                                                    {label}
                                                </span>
                                            ))}
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
                                                className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                                                <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                            </svg>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div className="mt-4 border-t pt-4 space-y-3" onClick={e => e.stopPropagation()}>
                                            {card.bulks.length > 0 && (
                                                <div className="border border-[#F97316]/20 rounded-sm overflow-hidden">
                                                    <div className="bg-[#F97316]/5 px-3 py-1.5">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-[#F97316]">Bulk Quote Requests ({card.bulks.length})</span>
                                                    </div>
                                                    <div className="space-y-2 p-2">
                                                        {card.bulks.map(bq => (
                                                            <div key={bq.id} className="flex gap-2 items-start bg-white border border-gray-100 rounded-sm p-2">
                                                                <div className="w-10 h-10 shrink-0 bg-gray-50 border border-gray-200 rounded-sm flex items-center justify-center overflow-hidden">
                                                                    {bq.itemImage ? <img src={bq.itemImage} alt={bq.itemName} className="w-full h-full object-contain" /> : <span className="text-gray-300 text-[9px]">No img</span>}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[11px] font-black text-[#1A3B5D] uppercase truncate">{bq.itemName}</p>
                                                                    <p className="text-[10px] text-gray-500"><span className="font-bold">Qty:</span> {bq.quantity}</p>
                                                                    {bq.note && <p className="text-[10px] text-gray-400 mt-0.5 italic">{bq.note}</p>}
                                                                </div>
                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteBulk(bq.id); }} className="text-red-400 hover:text-red-600 text-xs font-bold p-1 shrink-0">✕</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {card.queries.length > 0 && (
                                                <div className="border border-[#1A3B5D]/20 rounded-sm overflow-hidden">
                                                    <div className="bg-[#1A3B5D]/5 px-3 py-1.5">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-[#1A3B5D]">Query Requests ({card.queries.length})</span>
                                                    </div>
                                                    <div className="space-y-2 p-2">
                                                        {card.queries.map(pr => (
                                                            <div key={pr.id} className="flex gap-2 items-start bg-white border border-gray-100 rounded-sm p-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="bg-yellow-50 border border-yellow-100 rounded-sm p-1.5">
                                                                        <span className="text-[9px] font-black uppercase text-yellow-700 block mb-0.5">Query</span>
                                                                        <p className="text-[10px] text-gray-600">{pr.note}</p>
                                                                    </div>
                                                                </div>
                                                                <button onClick={(e) => { e.stopPropagation(); handleDeletePersonalization(pr.id); }} className="text-red-400 hover:text-red-600 text-xs font-bold p-1 shrink-0">✕</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                                                <a href={`tel:${card.phone}`} onClick={e => e.stopPropagation()} className="py-2.5 bg-white border border-emerald-200 text-emerald-600 text-xs font-bold rounded-sm text-center">Call</a>
                                                <a href={`https://wa.me/91${card.phone}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="py-2.5 bg-[#25D366] text-white text-xs font-bold rounded-sm text-center">WhatsApp</a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        // ── NOTIFY / APPROVAL ROW (existing card) ──
                        const req = row.data as RequestType;
                        const isExpanded = expandedId === req.id;
                        return (
                            <div
                                key={req.id}
                                onClick={() =>
                                    setExpandedId(isExpanded ? null : req.id)
                                }
                                className={`p-3 shadow-sm border rounded-sm cursor-pointer transition-all duration-300 bg-white border-gray-100 ${animatingId === req.id ? "opacity-0 scale-95 -translate-x-3" : "opacity-100 scale-100 translate-x-0"}`}>
                                {/* ===== COLLAPSED HEADER ===== */}
                                <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                                    {/* LEFT SIDE */}
                                    <div className="min-w-0">
                                        <div className='items-center'>
                                            <h3 className="text-xs font-bold text-slate-800">
                                                {req.customerName || "No Name"}
                                            </h3>

                                            <p
                                                className={`text-xs font-medium flex items-center gap-1.5 p-0.5 rounded-xs border w-fit ${req.type === "notify" ? "text-gray-600 bg-gray-50 border-gray-200" : "text-emerald-600 bg-emerald-50 border-emerald-200"}`}>
                                                <Phone size={14} className="text-gray-400" />
                                                {req.customerNumber || "No Number"}
                                            </p>

                                        </div>

                                        {/* DATE */}
                                        <p className="text-[10px] text-gray-400 font-medium mt-1">
                                            {formatDate(req.createdAt)}
                                        </p>
                                    </div>
                                    {/* CENTER — always rendered to hold the grid column */}
                                    <div className="self-center flex justify-center">
                                        {(() => {
                                            const phone = (req.customerNumber || '').replace(/\D/g, '');
                                            const bulkCount = (bulkByPhone[phone] || []).length;
                                            if (bulkCount === 0) return null;
                                            return (
                                                <span className="flex items-center gap-1 text-[8px] font-black px-1.5 py-1 rounded-sm bg-[#F97316]/10 text-[#F97316] border border-[#F97316]/30 uppercase tracking-wide whitespace-nowrap">
                                                    Bulk Order
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    {/* RIGHT SIDE */}
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-2">
                                            {req.type === "notify" && (() => {
                                                const badge = getNotifyBadge(req);
                                                if (!badge) return null;

                                                return (
                                                    <span
                                                        className={`text-[10px] font-bold px-2 py-0.5 rounded border ${badge.class}`}
                                                    >
                                                        {badge.text}
                                                    </span>
                                                );
                                            })()}
                                            {req.type === "approval" && (<span
                                                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getStatusStyle(req.status)}`}
                                            >
                                                {req.status || "pending"}
                                            </span>)}
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                strokeWidth={2.5}
                                                stroke="currentColor"
                                                className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""
                                                    }`}
                                            >
                                                <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>

                                {/* ===== EXPANDED CONTENT ===== */}
                                {isExpanded && (
                                    <div
                                        className="mt-4 border-t pt-4"
                                        onClick={(e) => e.stopPropagation()}
                                    >

                                        {req.type === 'notify' ? (
                                            <div className="space-y-2 mb-4">
                                                {req.items?.length ? (
                                                    req.items.map((item, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="text-xs border border-gray-200 rounded p-2 bg-gray-50 flex justify-between items-center"
                                                        >
                                                            <span className="font-semibold text-slate-700">
                                                                {item.name}
                                                            </span>

                                                            {/* NEW STOCK LABEL */}
                                                            {!item.inStock && (
                                                                <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-xs">
                                                                    Out of Stock
                                                                </span>
                                                            )}
                                                            {item.inStock && (
                                                                <span className="text-[10px] font-bold text-green-500 bg-green-50 border border-green-300 px-2 py-0.5 rounded-xs">
                                                                    In Stock
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-xs text-gray-400 italic text-center py-3">
                                                        No items found
                                                    </div>
                                                )}
                                            </div>
                                        ) : (

                                            <div className="relative w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100 group">
                                                {req.businessCard && req.businessCard !== "Placeholder" ? (
                                                    <img
                                                        src={req.businessCard}
                                                        alt="Business Card"
                                                        className="w-full h-auto max-h-[250px] object-contain"
                                                    />
                                                ) : (
                                                    <div className="h-32 flex items-center justify-center">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 italic">
                                                            No Business Card Provided
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {/* ── BULK QUOTE REQUESTS for this customer ── */}
                                        {(() => {
                                            const phone = (req.customerNumber || '').replace(/\D/g, '');
                                            const customerBulks = bulkByPhone[phone] || [];
                                            if (customerBulks.length === 0) return null;
                                            return (
                                                <div className="mt-3 border border-[#F97316]/20 rounded-sm overflow-hidden">
                                                    <div className="bg-[#F97316]/5 px-3 py-1.5">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-[#F97316]">
                                                            Bulk Quote Requests ({customerBulks.length})
                                                        </span>
                                                    </div>
                                                    <div className="space-y-2 p-2">
                                                        {customerBulks.map(bq => (
                                                            <div key={bq.id} className="flex gap-2 items-start bg-white border border-gray-100 rounded-sm p-2">
                                                                <div className="w-10 h-10 shrink-0 bg-gray-50 border border-gray-200 rounded-sm flex items-center justify-center overflow-hidden">
                                                                    {bq.itemImage ? (
                                                                        <img src={bq.itemImage} alt={bq.itemName} className="w-full h-full object-contain" />
                                                                    ) : (
                                                                        <span className="text-gray-300 text-[9px]">No img</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[11px] font-black text-[#1A3B5D] uppercase truncate">{bq.itemName}</p>
                                                                    <p className="text-[10px] text-gray-500"><span className="font-bold">Qty:</span> {bq.quantity}</p>
                                                                    {bq.note && (
                                                                        <p className="text-[10px] text-gray-400 mt-0.5 italic">{bq.note}</p>
                                                                    )}
                                                                </div>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteBulk(bq.id); }}
                                                                    className="text-red-400 hover:text-red-600 text-xs font-bold p-1 shrink-0"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        {/* ── PERSONALIZATION REQUESTS for this customer ── */}
                                        {(() => {
                                            const phone = (req.customerNumber || '').replace(/\D/g, '');
                                            const customerPersonalizations = personalizationByPhone[phone] || [];
                                            if (customerPersonalizations.length === 0) return null;
                                            return (
                                                <div className="mt-3 border border-[#1A3B5D]/20 rounded-sm overflow-hidden">
                                                    <div className="bg-[#1A3B5D]/5 px-3 py-1.5">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-[#1A3B5D]">
                                                            Query Requests ({customerPersonalizations.length})
                                                        </span>
                                                    </div>
                                                    <div className="space-y-2 p-2">
                                                        {customerPersonalizations.map(pr => (
                                                            <div key={pr.id} className="flex gap-2 items-start bg-white border border-gray-100 rounded-sm p-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="bg-yellow-50 border border-yellow-100 rounded-sm p-1.5">
                                                                        <span className="text-[9px] font-black uppercase text-yellow-700 block mb-0.5">Query</span>
                                                                        <p className="text-[10px] text-gray-600">{pr.note}</p>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDeletePersonalization(pr.id); }}
                                                                    className="text-red-400 hover:text-red-600 text-xs font-bold p-1 shrink-0"
                                                                >✕</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        {/*  NOTIFY ACTION BUTTONS */}
                                        {req.type === "notify" && (
                                            <div className="grid grid-cols-3 gap-3 pt-2 border-t">
                                                {/* CALL */}
                                                <a
                                                    href={`tel:${req.customerNumber?.replace(/\D/g, "")}`}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="py-2.5 bg-white border border-emerald-200 text-emerald-600 text-xs font-bold rounded-sm text-center"
                                                >
                                                    Call
                                                </a>

                                                {/* WHATSAPP */}
                                                <a
                                                    href="#"
                                                    onClick={async (e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();

                                                        await markMessageSent(req.id);

                                                        const waNumber = formatWhatsAppNumber(req.customerNumber);
                                                        window.open(`https://wa.me/${waNumber}`, "_blank");
                                                    }}
                                                    className="py-2.5 bg-[#25D366] text-white text-xs font-bold rounded-sm text-center"
                                                >
                                                    WhatsApp
                                                </a>

                                                {/* DELETE */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteNotify(req);
                                                    }}
                                                    className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}

                                        {/* Action Buttons - More Professional spacing */}
                                        {req.type === 'approval' && (() => {
                                            const showDecline = req.status === "pending" || req.status === "approved";
                                            const showApprove = req.status === "pending" || req.status === "declined";
                                            const bothVisible = showDecline && showApprove;

                                            return (
                                                <div
                                                    className={`grid gap-3 pt-4 mt-4 border-t border-dashed ${bothVisible ? "grid-cols-2" : "grid-cols-1"
                                                        }`}
                                                >
                                                    {/* Decline button */}
                                                    {showDecline && (
                                                        <button
                                                            className="py-2.5 bg-white border border-red-500 text-red-500 hover:bg-red-50 text-xs font-bold rounded-sm transition-colors"
                                                            onClick={() => updateRequestStatus(req.id, "declined")}
                                                        >
                                                            Decline
                                                        </button>
                                                    )}

                                                    {/* Approve button */}
                                                    {showApprove && (
                                                        <button
                                                            className="py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-sm shadow-sm transition-colors"
                                                            onClick={() => updateRequestStatus(req.id, "approved")}
                                                        >
                                                            Approve Request
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {/* ── Merged Pre-Order Cards (bulk + query grouped by customer phone) ── */}
                {requestType === 'notify' && mergedPreOrderCards.length > 0 && (
                    <div className="space-y-3 mt-3">
                        {mergedPreOrderCards.map(card => {
                            const cardKey = card.phone;
                            const isExpanded = expandedId === cardKey;
                            const badgeLabels = [
                                ...(card.bulks.length > 0 ? ['Bulk Quote'] : []),
                                ...(card.queries.length > 0 ? ['Query'] : []),
                            ];
                            // Use latest timestamp across bulks + queries for display
                            const latestItem = [
                                ...card.bulks.map(b => ({ createdAt: b.createdAt })),
                                ...card.queries.map(q => ({ createdAt: q.createdAt })),
                            ].sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];

                            return (
                                <div
                                    key={cardKey}
                                    onClick={() => setExpandedId(isExpanded ? null : cardKey)}
                                    className="p-3 shadow-sm border rounded-sm cursor-pointer bg-white border-gray-100 transition-all duration-300"
                                >
                                    {/* Header */}
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-xs font-bold text-slate-800">{card.name}</h3>
                                            <p className="text-xs font-medium flex items-center gap-1.5 p-0.5 rounded-xs border text-gray-600 bg-gray-50 border-gray-200">
                                                <Phone size={14} className="text-gray-400" />
                                                {card.phone || "No Number"}
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-medium mt-1">{formatDate(latestItem?.createdAt)}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            {badgeLabels.map(label => (
                                                <span key={label} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${label === 'Bulk Quote' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-yellow-50 text-yellow-600 border-yellow-200'}`}>
                                                    {label}
                                                </span>
                                            ))}
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
                                                className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                                                <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                            </svg>
                                        </div>
                                    </div>

                                    {/* Expanded */}
                                    {isExpanded && (
                                        <div className="mt-4 border-t pt-4 space-y-3" onClick={e => e.stopPropagation()}>

                                            {/* Bulk Quotes */}
                                            {card.bulks.length > 0 && (
                                                <div className="border border-[#F97316]/20 rounded-sm overflow-hidden">
                                                    <div className="bg-[#F97316]/5 px-3 py-1.5">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-[#F97316]">
                                                            Bulk Quote Requests ({card.bulks.length})
                                                        </span>
                                                    </div>
                                                    <div className="space-y-2 p-2">
                                                        {card.bulks.map(bq => (
                                                            <div key={bq.id} className="flex gap-2 items-start bg-white border border-gray-100 rounded-sm p-2">
                                                                <div className="w-10 h-10 shrink-0 bg-gray-50 border border-gray-200 rounded-sm flex items-center justify-center overflow-hidden">
                                                                    {bq.itemImage ? (
                                                                        <img src={bq.itemImage} alt={bq.itemName} className="w-full h-full object-contain" />
                                                                    ) : (
                                                                        <span className="text-gray-300 text-[9px]">No img</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[11px] font-black text-[#1A3B5D] uppercase truncate">{bq.itemName}</p>
                                                                    <p className="text-[10px] text-gray-500"><span className="font-bold">Qty:</span> {bq.quantity}</p>
                                                                    {bq.note && <p className="text-[10px] text-gray-400 mt-0.5 italic">{bq.note}</p>}
                                                                </div>
                                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteBulk(bq.id); }}
                                                                    className="text-red-400 hover:text-red-600 text-xs font-bold p-1 shrink-0">✕</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Queries */}
                                            {card.queries.length > 0 && (
                                                <div className="border border-[#1A3B5D]/20 rounded-sm overflow-hidden">
                                                    <div className="bg-[#1A3B5D]/5 px-3 py-1.5">
                                                        <span className="text-[9px] font-black uppercase tracking-widest text-[#1A3B5D]">
                                                            Query Requests ({card.queries.length})
                                                        </span>
                                                    </div>
                                                    <div className="space-y-2 p-2">
                                                        {card.queries.map(pr => (
                                                            <div key={pr.id} className="flex gap-2 items-start bg-white border border-gray-100 rounded-sm p-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="bg-yellow-50 border border-yellow-100 rounded-sm p-1.5">
                                                                        <span className="text-[9px] font-black uppercase text-yellow-700 block mb-0.5">Query</span>
                                                                        <p className="text-[10px] text-gray-600">{pr.note}</p>
                                                                    </div>
                                                                </div>
                                                                <button onClick={(e) => { e.stopPropagation(); handleDeletePersonalization(pr.id); }}
                                                                    className="text-red-400 hover:text-red-600 text-xs font-bold p-1 shrink-0">✕</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Action Buttons */}
                                            <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                                                <a href={`tel:${card.phone}`} onClick={e => e.stopPropagation()}
                                                    className="py-2.5 bg-white border border-emerald-200 text-emerald-600 text-xs font-bold rounded-sm text-center">Call</a>
                                                <a href={`https://wa.me/91${card.phone}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                                                    className="py-2.5 bg-[#25D366] text-white text-xs font-bold rounded-sm text-center">WhatsApp</a>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

            </main>
        </div>
    )
}

export default RequestPage