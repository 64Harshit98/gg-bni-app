import { useEffect, useState } from 'react' // State manage karne ke liye add kiya
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from '../lib/Firebase';
import { useAuth } from "../context/auth-context";

type RequestType = {
    id: string;
    customerName?: string;
    customerNumber?: string;
    businessCard?: string;
    status?: string;
    createdAt?: any;
};

function RequestPage() {
    const navigate = useNavigate()
    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId;
    const [status, setStatus] = useState('pending')
    const [subStatus, setSubStatus] = useState('approved')
    const [requests, setRequests] = useState<RequestType[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [animatingId, setAnimatingId] = useState<string | null>(null);

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
            case "decline":
                return "bg-red-50 text-red-600 border-red-100";
            default:
                return "bg-blue-50 text-blue-600 border-blue-100"; // pending
        }
    };

    const updateRequestStatus = async (
        requestId: string,
        newStatus: "approved" | "decline"
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
        if (status === "pending") {
            return req.status === "pending";
        }

        if (status === "completed") {
            return req.status === subStatus; // approved / decline
        }

        return true;
    });

    useEffect(() => {
        if (!companyId) return;

        const fetchRequests = async () => {
            const snap = await getDocs(
                collection(db, "companies", companyId, "AuthorizedUser")
            );

            const list = snap.docs
                .map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
                .sort((a: any, b: any) => {
                    const aTime = a.createdAt?.seconds || 0;
                    const bTime = b.createdAt?.seconds || 0;

                    return bTime - aTime; // DESCENDING (latest first)
                }) as RequestType[];

            setRequests(list);
        };

        fetchRequests();
    }, [companyId]);

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col">

            {/* --- HEADER --- */}
            <header className="sticky top-0 z-[100] bg-white border-b border-gray-100 shadow-sm w-full">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center">
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
                </div>
            </header>

            {/* --- PAGE CONTENT --- */}
            <main className="p-4 flex-1 max-w-7xl mx-auto w-full">

                {/* Main Toggle: Pending / Completed */}
                <div className="sticky top-[56px] z-[90] bg-[#E9F0F7] py-2">
                    <div className="flex bg-white p-1 rounded-sm shadow-sm mb-4 border border-gray-200">
                        <button
                            onClick={() => setStatus('pending')}
                            className={`flex-1 py-2 text-sm font-bold rounded-sm transition-all ${status === 'pending' ? 'bg-[#1A3B5D] text-white' : 'text-gray-500'}`}
                        >
                            Pending
                        </button>
                        <button
                            onClick={() => setStatus('completed')}
                            className={`flex-1 py-2 text-sm font-bold rounded-sm transition-all ${status === 'completed' ? 'bg-[#1A3B5D] text-white' : 'text-gray-500'}`}
                        >
                            Completed
                        </button>
                    </div>
                </div>
                {/* Sub Toggle: Only visible when "Completed" is selected */}
                {status === 'completed' && (
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setSubStatus('decline')}
                            className={`flex-1 py-2 text-xs font-bold rounded-sm border transition-all ${subStatus === 'decline' ? 'bg-red-100 border-red-500 text-red-600' : 'bg-white border-gray-200 text-gray-500'}`}
                        >
                            Decline
                        </button>
                        <button
                            onClick={() => setSubStatus('approved')}
                            className={`flex-1 py-2 text-xs font-bold rounded-sm border transition-all ${subStatus === 'approved' ? 'bg-green-100 border-green-500 text-green-600' : 'bg-white border-gray-200 text-gray-500'}`}
                        >
                            Approved
                        </button>
                    </div>
                )}

                {/* Content Area Placeholder */}
                <div className="mt-4 text-center text-gray-400 text-sm italic">
                    Showing {status} {status === 'completed' ? `(${subStatus})` : ''} requests...
                </div>

                <div className="space-y-3 mt-4">
                    {filteredRequests.map((req) => {
                        const isExpanded = expandedId === req.id;

                        return (
                            <div
                                key={req.id}
                                onClick={() =>
                                    setExpandedId(isExpanded ? null : req.id)
                                }
                                className={`p-5 bg-white shadow-sm border border-gray-100 rounded-sm cursor-pointer transition-all duration-300 ${animatingId === req.id ? "opacity-0 scale-95 -translate-x-3" : "opacity-100 scale-100 translate-x-0"}`}
                            >
                                {/* ===== COLLAPSED HEADER ===== */}
                                <div className="flex justify-between items-start">
                                    {/* LEFT SIDE */}
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800">
                                            {req.customerName || "No Name"}
                                        </h3>

                                        <p className="text-xs text-gray-600 font-medium mt-1">
                                            📞 {req.customerNumber || "No Number"}
                                        </p>
                                    </div>

                                    {/* RIGHT SIDE */}
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-2">
                                            <span
                                                className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${getStatusStyle(req.status)}`}
                                            >
                                                {req.status || "pending"}
                                            </span>

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

                                        {/* DATE */}
                                        <p className="text-[10px] text-gray-400 font-medium">
                                            {formatDate(req.createdAt)}
                                        </p>
                                    </div>
                                </div>

                                {/* ===== EXPANDED CONTENT ===== */}
                                {isExpanded && (
                                    <div
                                        className="mt-4 border-t pt-4"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* Business Card */}
                                        <div className="border-2 border-dashed border-gray-200 bg-gray-50 rounded-sm h-16 flex items-center justify-center">
                                            {req.businessCard &&
                                                req.businessCard !== "Placeholder" ? (
                                                <img
                                                    src={req.businessCard}
                                                    alt="Business Card"
                                                    className="h-full object-contain"
                                                />
                                            ) : (
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 italic">
                                                    Business Card Placeholder
                                                </span>
                                            )}
                                        </div>

                                        {/* Buttons */}
                                        <div className="grid grid-cols-2 gap-3 pt-4 mt-4 border-t">
                                            <button
                                                className="py-2.5 bg-red-500 text-white text-xs font-bold rounded-sm"
                                                onClick={() => updateRequestStatus(req.id, "decline")}
                                            >
                                                Decline
                                            </button>

                                            <button
                                                className="py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-sm"
                                                onClick={() => updateRequestStatus(req.id, "approved")}
                                            >
                                                Approved
                                            </button>
                                        </div>
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