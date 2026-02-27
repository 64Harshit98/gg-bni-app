import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { collection, getDocs, doc, updateDoc, deleteDoc } from "firebase/firestore";
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
    items?: { name: string; qty?: number }[];
    inStock?: boolean;
    messageSent?: boolean;
};

function RequestPage() {
    const navigate = useNavigate()
    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId;
    const [requestType, setRequestType] = useState<'notify' | 'approval'>('approval')
    const [approvalStatus, setApprovalStatus] = useState<'pending' | 'completed'>('pending')
    const [requests, setRequests] = useState<RequestType[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [animatingId, setAnimatingId] = useState<string | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [completedFilter, setCompletedFilter] = useState<'all' | 'approved' | 'declined'>('all')

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
                return "bg-blue-50 text-blue-600 border-blue-100"; // pending
        }
    };

    const getNotifyCardStyle = (req: RequestType) => {
        // Case 1: Out of stock + message NOT sent → RED
        if (req.inStock === false && req.messageSent === false) {
            return "bg-red-100 border-red-200";
        }

        // Case 2: In stock + message NOT sent → YELLOW
        if (req.inStock === true && req.messageSent === false) {
            return "bg-yellow-100 border-yellow-200";
        }

        // Case 3: In stock + message sent → GREEN
        if (req.inStock === true && req.messageSent === true) {
            return "bg-emerald-100 border-emerald-200";
        }

        return "bg-white border-gray-100";
    };

    const NotifyLegend = () => (
        <div className="flex items-center gap-3 text-[10px] font-bold flex-wrap">
            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-red-400 border border-red-500"></span>
                <span className="text-gray-600">Out of Stock</span>
            </div>

            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-yellow-300 border border-yellow-400"></span>
                <span className="text-gray-600">Back in Stock</span>
            </div>

            <div className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-sm bg-emerald-400 border border-emerald-500"></span>
                <span className="text-gray-600">Message Sent</span>
            </div>
        </div>
    );

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

    const filteredRequests = requests.filter(req => {
        const queryText = searchQuery.toLowerCase();

        const matchesSearch =
            (req.customerName || "").toLowerCase().includes(queryText) ||
            (req.customerNumber || "").includes(queryText);

        if (!matchesSearch) return false;

        //  NOTIFY TAB — ONLY notify
        if (requestType === "notify") {
            return req.type === "notify";
        }

        // APPROVAL TAB — NEVER show notify
        if (requestType === "approval") {
            if (req.type !== "approval") return false;

            if (approvalStatus === "pending") {
                return req.status === "pending";
            }

            if (approvalStatus === "completed") {
                if (completedFilter === "approved") {
                    return req.status === "approved";
                }

                if (completedFilter === "declined") {
                    return req.status === "declined";
                }

                return (
                    req.status === "approved" ||
                    req.status === "declined"
                );
            }
        }

        return true;
    });

    useEffect(() => {
        if (!companyId) return;

        const fetchRequests = async () => {
            const [approvalSnap, notifySnap] = await Promise.all([
                getDocs(
                    collection(db, "companies", companyId, "AuthorizedUser")
                ),
                getDocs(
                    collection(db, "companies", companyId, "NotifyRequests")
                ),
            ]);

            const approvalList = approvalSnap.docs.map(doc => ({
                id: doc.id,
                type: "approval",
                ...doc.data(),
            }));

            const notifyList = notifySnap.docs.map(doc => {
                console.log("Notify doc data:", doc.data()); // 👈 ADD THIS
                return {
                    id: doc.id,
                    type: "notify",
                    ...doc.data(),
                };
            });

            //  MERGE
            const combined = [...approvalList, ...notifyList];

            // DEDUPE BY TYPE + NUMBER
            const uniqueMap = new Map<string, any>();

            combined.forEach((item: any) => {
                const key =
                    item.type === "approval"
                        ? `approval_${item.customerNumber}`
                        : `notify_${item.customerNumber}`;

                // latest wala rakhenge (createdAt desc later)
                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, item);
                }
            });

            const merged = Array.from(uniqueMap.values()).sort(
                (a: any, b: any) => {
                    const aTime = a.createdAt?.seconds || 0;
                    const bTime = b.createdAt?.seconds || 0;
                    return bTime - aTime;
                }
            ) as RequestType[];

            setRequests(merged);
        };

        fetchRequests();
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
                console.log("Notify status:", req.inStock, req.messageSent);
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
                            <ChevronLeft className="text-[#1A3B5D]" size={20} />
                        </button>

                        <div className="w-1 h-5 bg-[#00A3E1] rounded-sm"></div>

                        <h1 className="text-xs md:text-sm font-black text-[#1A3B5D] uppercase tracking-tighter">
                            Request Page
                        </h1>
                    </div>

                    {/* RIGHT SEARCH ICON */}
                    <button
                        onClick={() => setIsSearchOpen(prev => !prev)}
                        className="p-2 rounded-sm hover:bg-gray-100 transition-colors"
                    >
                        <Search size={18} className="text-[#1A3B5D]" />
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
                        className="w-full p-3 border border-gray-200 rounded-sm text-sm outline-none focus:border-[#00A3E1]"
                    />
                </div>
            )}

            {/* --- PAGE CONTENT --- */}
            <main className="p-4 flex-1 max-w-7xl mx-auto w-full">

                {/* Main Toggle: Pending / Completed */}
                <div className="sticky top-[56px] z-[90] bg-[#E9F0F7] py-2">
                    <div className="flex bg-white p-1 rounded-sm shadow-sm mb-4 border border-gray-200">
                        <button
                            onClick={() => setRequestType('notify')}
                            className={`flex-1 py-2 text-sm font-bold rounded-sm transition-all ${requestType === 'notify'
                                ? 'bg-[#1A3B5D] text-white'
                                : 'text-gray-500'
                                }`}
                        >
                            Notify Requests
                        </button>

                        <button
                            onClick={() => setRequestType('approval')}
                            className={`flex-1 py-2 text-sm font-bold rounded-sm transition-all ${requestType === 'approval'
                                ? 'bg-[#1A3B5D] text-white'
                                : 'text-gray-500'
                                }`}
                        >
                            Approval Requests
                        </button>
                    </div>
                </div>
                {/* 🟢 Notify Legend */}
                {requestType === "notify" && (
                    <div className="flex justify-start mb-3 px-1">
                        <NotifyLegend />
                    </div>
                )}
                {/* Sub Toggle: Only visible when "Completed" is selected */}
                {requestType === 'approval' && (
                    <div className="flex gap-2 mb-4 items-center">
                        <button
                            onClick={() => setApprovalStatus('pending')}
                            className={`flex-1 py-2 text-xs font-bold rounded-sm border ${approvalStatus === 'pending'
                                ? 'bg-[#1A3B5D] text-white'
                                : 'bg-white border-gray-200 text-gray-500'
                                }`}
                        >
                            Pending
                        </button>

                        <button
                            onClick={() => setApprovalStatus('completed')}
                            className={`flex-1 py-2 text-xs font-bold rounded-sm border ${approvalStatus === 'completed'
                                ? 'bg-[#1A3B5D] text-white'
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
                    {filteredRequests.map((req) => {
                        const isExpanded = expandedId === req.id;
                        return (
                            <div
                                key={req.id}
                                onClick={() =>
                                    setExpandedId(isExpanded ? null : req.id)
                                }
                                className={`p-3 shadow-sm border rounded-sm cursor-pointer transition-all duration-300 ${req.type === "notify" ? getNotifyCardStyle(req) : "bg-white border-gray-100"} ${animatingId === req.id ? "opacity-0 scale-95 -translate-x-3" : "opacity-100 scale-100 translate-x-0"}`}>
                                {/* ===== COLLAPSED HEADER ===== */}
                                <div className="flex justify-between items-start">
                                    {/* LEFT SIDE */}
                                    <div>
                                        <div className='flex gap-2 items-center'>
                                            <h3 className="text-sm font-bold text-slate-800">
                                                {req.customerName || "No Name"}
                                            </h3>

                                            <p className="text-xs font-medium flex items-center gap-1.5 text-emerald-600 bg-emerald-50 border border-emerald-200 p-0.5 rounded-xs">
                                                <Phone size={14} className="text-gray-400" />
                                                {req.customerNumber || "No Number"}
                                            </p>

                                        </div>

                                        {/* DATE */}
                                        <p className="text-[10px] text-gray-400 font-medium mt-1">
                                            {formatDate(req.createdAt)}
                                        </p>
                                    </div>

                                    {/* RIGHT SIDE */}
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-2">
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
                                        {/* Business Card - Optimized Container */}
                                        {req.type === 'notify' ? (
                                            <div className="space-y-2 mb-4">
                                                {req.items?.length ? (
                                                    req.items.map((item, idx) => (
                                                        <div
                                                            key={idx}
                                                            className="text-xs border border-gray-200 rounded p-2 bg-gray-50 flex justify-between"
                                                        >
                                                            <span className="font-semibold text-slate-700">
                                                                {item.name}
                                                            </span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-xs text-gray-400 italic text-center py-3">
                                                        No items found
                                                    </div>
                                                )}
                                            </div>
                                        ) : (

                                            //  APPROVAL REQUESTS → OLD IMAGE UI
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
            </main>
        </div>
    )
}

export default RequestPage