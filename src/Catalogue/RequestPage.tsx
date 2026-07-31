import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { collection, doc, updateDoc, deleteDoc, onSnapshot, getDoc } from "firebase/firestore";
import { db } from '../lib/Firebase';
import { useAuth } from "../context/auth-context";
import { Search, Phone, Filter, Reply, Trash2 } from 'lucide-react'
import { State } from '../enums'
import { Modal } from '../constants/Modal'
import { botMasterService } from '../Pages/Additional/Whatsapp/WhatsappApi';
import { ROUTES } from '../constants/routes.constants'

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
    const [catalogueBaseUrl, setCatalogueBaseUrl] = useState<string>('');
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
    const [isDateFilterOpen, setIsDateFilterOpen] = useState(false)
    const [activeDateFilter, setActiveDateFilter] = useState<string>('today')
    const [customStartDate, setCustomStartDate] = useState<string>('')
    const [customEndDate, setCustomEndDate] = useState<string>('')
    const dateFilterRef = useRef<HTMLDivElement>(null)
    const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({})
    const [replyMessage, setReplyMessage] = useState<Record<string, string>>({})
    const [sendingId, setSendingId] = useState<string | null>(null)   // tracks which row is currently sending
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null)   // ⬅ same pattern as Journal.tsx

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
            // ── Fetch catalogue base URL (subdomain or fallback) ──
            try {
                const companySnap = await getDoc(doc(db, 'companies', companyId));
                if (companySnap.exists() && companySnap.data().subdomain) {
                    setCatalogueBaseUrl(`https://${companySnap.data().subdomain}.sellar.in`);
                } else {
                    setCatalogueBaseUrl(`${window.location.origin}/catalogue/${companyId}`);
                }
            } catch (err) {
                console.error('Failed to fetch subdomain:', err);
                setCatalogueBaseUrl(`${window.location.origin}/catalogue/${companyId}`);
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

    const dateFilters = [
        { label: 'All', value: 'all' },
        { label: 'Today', value: 'today' },
        { label: 'Yesterday', value: 'yesterday' },
        { label: 'Last 7 Days', value: 'last7' },
        { label: 'Last 15 Days', value: 'last15' },
        { label: 'Last 30 Days', value: 'last30' },
        { label: 'Custom Range', value: 'custom' },
    ];

    const handleDateFilterSelect = (value: string) => {
        setActiveDateFilter(value);
        if (value !== 'custom') {
            setIsDateFilterOpen(false);
        }
    };

    const handleApplyCustomDate = () => {
        if (customStartDate && customEndDate) {
            setIsDateFilterOpen(false);
        }
    };

    const matchesDateFilter = (timestamp: any) => {
        if (activeDateFilter === 'all') return true;
        if (!timestamp?.toDate) return false;

        const itemDate: Date = timestamp.toDate();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const daysAgo = (date: Date, days: number) =>
            new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);

        switch (activeDateFilter) {
            case 'today':
                return itemDate >= today;
            case 'yesterday':
                return itemDate >= daysAgo(today, 1) && itemDate < today;
            case 'last7':
                return itemDate >= daysAgo(today, 7);
            case 'last15':
                return itemDate >= daysAgo(today, 15);
            case 'last30':
                return itemDate >= daysAgo(today, 30);
            case 'custom': {
                if (!customStartDate || !customEndDate) return true;
                const start = new Date(customStartDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(customEndDate);
                end.setHours(23, 59, 59, 999);
                return itemDate >= start && itemDate <= end;
            }
            default:
                return true;
        }
    };

    const getStatusStyle = (status?: string) => {
        switch (status) {
            case "approved":
                return "bg-green-50 text-green-600 border-green-100";
            case "declined":
                return "bg-red-50 text-red-600 border-red-100";
            default:
                return "bg-muted text-muted-foreground border-border"; // pending
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
                text: "Message Sent",
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

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dateFilterRef.current && !dateFilterRef.current.contains(event.target as Node)) {
                setIsDateFilterOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    const filteredRequests = useMemo(() => {
        const queryText = searchQuery.toLowerCase();
        return requests
            .filter(req => {
                const matchesSearch =
                    (req.customerName || "").toLowerCase().includes(queryText) ||
                    (req.customerNumber || "").includes(queryText);

                if (!matchesSearch) return false;
                if (!matchesDateFilter(req.createdAt)) return false;
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
    }, [requests, searchQuery, requestType, approvalStatus, completedFilter, activeDateFilter, customStartDate, customEndDate]);

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
            requests
                .filter(r => r.type === 'notify')
                .map(r => (r.customerNumber || '').replace(/\D/g, ''))
        );
        const queryText = searchQuery.toLowerCase();
        return bulkQuotes.filter(bq => {
            const phone = (bq.customerNumber || '').replace(/\D/g, '');
            if (knownPhones.has(phone)) return false;
             if (!matchesDateFilter(bq.createdAt)) return false; 
            if (!queryText) return true;
            return (
                (bq.customerName || '').toLowerCase().includes(queryText) ||
                (bq.customerNumber || '').includes(queryText)
            );
        });
    }, [bulkQuotes, requests, searchQuery, activeDateFilter, customStartDate, customEndDate]);
    const unmatchedPersonalizations = useMemo(() => {
        const knownPhones = new Set(
            requests
                .filter(r => r.type === 'notify')
                .map(r => (r.customerNumber || '').replace(/\D/g, ''))
        );
        const queryText = searchQuery.toLowerCase();
        return personalizationRequests.filter(pr => {
            const phone = (pr.customerNumber || '').replace(/\D/g, '');
            if (knownPhones.has(phone)) return false;
            if (!matchesDateFilter(pr.createdAt)) return false;
            if (!queryText) return true;
            return (
                (pr.customerName || '').toLowerCase().includes(queryText) ||
                (pr.customerNumber || '').includes(queryText)
            );
        });
    }, [personalizationRequests, requests, searchQuery, activeDateFilter, customStartDate, customEndDate]);

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

            // ── Cascade delete: remove associated bulk quotes & queries for this phone ──
            const phone = (req.customerNumber || '').replace(/\D/g, '');
            if (phone) {
                const relatedBulks = bulkQuotes.filter(
                    bq => (bq.customerNumber || '').replace(/\D/g, '') === phone
                );
                const relatedQueries = personalizationRequests.filter(
                    pr => (pr.customerNumber || '').replace(/\D/g, '') === phone
                );

                await Promise.all([
                    ...relatedBulks.map(bq =>
                        deleteDoc(doc(db, "companies", companyId, "BulkQuoteRequests", bq.id))
                    ),
                    ...relatedQueries.map(pr =>
                        deleteDoc(doc(db, "companies", companyId, "PersonalizationRequests", pr.id))
                    ),
                ]);

                setBulkQuotes(prev => prev.filter(bq => (bq.customerNumber || '').replace(/\D/g, '') !== phone));
                setPersonalizationRequests(prev => prev.filter(pr => (pr.customerNumber || '').replace(/\D/g, '') !== phone));
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
    const handleDeleteMergedCard = async (phone: string) => {
        if (!companyId) return;
        try {
            const relatedBulks = bulkQuotes.filter(
                bq => (bq.customerNumber || '').replace(/\D/g, '') === phone
            );
            const relatedQueries = personalizationRequests.filter(
                pr => (pr.customerNumber || '').replace(/\D/g, '') === phone
            );

            await Promise.all([
                ...relatedBulks.map(bq =>
                    deleteDoc(doc(db, "companies", companyId, "BulkQuoteRequests", bq.id))
                ),
                ...relatedQueries.map(pr =>
                    deleteDoc(doc(db, "companies", companyId, "PersonalizationRequests", pr.id))
                ),
            ]);

            setBulkQuotes(prev => prev.filter(bq => (bq.customerNumber || '').replace(/\D/g, '') !== phone));
            setPersonalizationRequests(prev => prev.filter(pr => (pr.customerNumber || '').replace(/\D/g, '') !== phone));
        } catch (err) {
            console.error("Delete merged card error:", err);
        }
    };
    const sendDirectWhatsappMessage = async (
        customerNumber: string | undefined,
        message: string,
        rowKey: string
    ): Promise<boolean> => {
        if (!companyId) {
            setModal({ message: "Company not found.", type: State.ERROR });
            return false;
        }
        if (!customerNumber) {
            setModal({ message: "Customer phone number is missing.", type: State.ERROR });
            return false;
        }

        setSendingId(rowKey);

        try {
            const businessDocRef = doc(db, 'companies', companyId, 'business_info', companyId);
            const businessSnap = await getDoc(businessDocRef);
            const { botMasterToken, whatsappNumber } = businessSnap.data() || {};

            if (!botMasterToken || !whatsappNumber) {
                setSendingId(null);
                navigate(ROUTES.WHATSAPP_PLAN);
                return false;
            }

            const response = await botMasterService.sendMessage(
                botMasterToken,
                whatsappNumber,
                customerNumber,
                message
            );

            let isSuccess = false;
            if (Array.isArray(response) && response.length > 0) {
                const res = response[0];
                if (res.status === 'sent' || res.status === 'delivered') isSuccess = true;
            } else if (response?.status === 'sent' || response?.status === 'success' || response?.status === 200) {
                isSuccess = true;
            }

            if (isSuccess) {
                setModal({ message: "Message sent on WhatsApp!", type: State.SUCCESS });
                return true;
            } else {
                throw new Error("API reported failure.");
            }
        } catch (err) {
            console.error("WhatsApp Send Error:", err);
            setModal({ message: "Failed to send WhatsApp message.", type: State.ERROR });
            return false;
        } finally {
            setSendingId(null);
        }
    };

    return (
        <div className="bg-[#E9F0F7] min-h-screen font-sans text-[#333] flex flex-col">
            {modal && (
                <Modal
                    message={modal.message}
                    type={modal.type}
                    onClose={() => setModal(null)}
                    onConfirm={() => setModal(null)}
                    showConfirmButton={false}
                />
            )}
            {/* --- HEADER --- */}
            <header className="sticky top-0 z-[100] bg-card border-b border-border shadow-sm w-full">
                <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">

                    {/* LEFT */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-1 hover:bg-muted rounded-sm transition-colors"
                        >
                            <ChevronLeft className="text-[#F97316]" size={20} />
                        </button>

                        <div className="w-1 h-5 bg-[#F97316] rounded-sm"></div>

                        <h1 className="text-xs md:text-sm font-black text-[#F97316] uppercase tracking-tighter">
                            Request Page
                        </h1>
                    </div>

                    {/* RIGHT SIDE — SEARCH + DATE FILTER */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsSearchOpen(prev => !prev)}
                            className="p-2 rounded-sm hover:bg-muted transition-colors"
                        >
                            <Search size={18} className="text-[#F97316]" />
                        </button>

                        <div ref={dateFilterRef} className="relative">
                            <button
                                onClick={() => setIsDateFilterOpen(prev => !prev)}
                                className="p-2 rounded-sm hover:bg-muted transition-colors"
                                title="Filter by date"
                            >
                                <Filter size={18} className="text-[#F97316]" />
                            </button>

                            {isDateFilterOpen && (
                                <div className="absolute right-0 mt-2 w-64 bg-card border border-border rounded-sm shadow-md z-50 p-3">
                                    <ul className="py-1 border-b mb-2">
                                        {dateFilters.map(filter => (
                                            <li key={filter.value}>
                                                <button
                                                    onClick={() => handleDateFilterSelect(filter.value)}
                                                    className={`w-full text-left px-3 py-2 text-xs rounded-sm hover:bg-muted ${activeDateFilter === filter.value ? 'bg-orange-50 text-[#F97316] font-bold' : 'text-foreground'
                                                        }`}
                                                >
                                                    {filter.label}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    {activeDateFilter === 'custom' && (
                                        <div className="space-y-2 mt-2">
                                            <input
                                                type="date"
                                                value={customStartDate}
                                                onChange={(e) => setCustomStartDate(e.target.value)}
                                                className="text-xs p-1.5 border border-border rounded-sm w-full outline-none focus:border-[#F97316]"
                                            />
                                            <input
                                                type="date"
                                                value={customEndDate}
                                                onChange={(e) => setCustomEndDate(e.target.value)}
                                                className="text-xs p-1.5 border border-border rounded-sm w-full outline-none focus:border-[#F97316]"
                                            />
                                            <button
                                                onClick={handleApplyCustomDate}
                                                className="w-full bg-[#F97316] text-white py-1.5 rounded-sm text-xs font-bold mt-2 hover:opacity-90 transition-opacity"
                                            >
                                                Apply Filter
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {isSearchOpen && (
                <div className="sticky top-[56px] z-[95] px-4 p-3 bg-card border-b border-border">
                    <input
                        type="text"
                        placeholder="Search by name or number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full p-3 border border-border rounded-sm text-sm outline-none focus:border-[#F97316]"
                    />
                </div>
            )}

            {/* --- PAGE CONTENT --- */}
            <main className="py-2 px-2 flex-1 max-w-7xl mx-auto w-full">

                {/* Main Toggle: Pending / Completed */}
                <div className="sticky top-[56px] z-[90] bg-[#E9F0F7] py-0">
                    {requireApproval ? (
                        <div className="flex bg-card p-1 rounded-sm shadow-sm mb-2 border border-border">
                            <button
                                onClick={() => setRequestType('notify')}
                                className={`flex-1 py-1 text-sm font-bold rounded-sm transition-all ${requestType === 'notify'
                                    ? 'bg-[#F97316] text-white'
                                    : 'text-muted-foreground'
                                    }`}
                            >
                                Pre-Order Requests
                            </button>
                            <button
                                onClick={() => setRequestType('approval')}
                                className={`flex-1 py-1 text-sm font-bold rounded-sm transition-all ${requestType === 'approval'
                                    ? 'bg-[#F97316] text-white'
                                    : 'text-muted-foreground'
                                    }`}
                            >
                                Approval Requests
                            </button>
                        </div>
                    ) : (
                        <div className="bg-card p-2 rounded-sm shadow-sm mb-2 border border-border text-center">
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
                                : 'bg-card border-border text-muted-foreground'
                                }`}
                        >
                            Pending
                        </button>

                        <button
                            onClick={() => setApprovalStatus('completed')}
                            className={`flex-1 py-2 text-xs font-bold rounded-sm border ${approvalStatus === 'completed'
                                ? 'bg-[#F97316] text-white'
                                : 'bg-card border-border text-muted-foreground'
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
                                className="p-2 border border-border rounded-sm bg-card hover:bg-muted"
                                title="Filter"
                            >
                                <Filter size={16} className="text-muted-foreground" />
                            </button>

                            {isFilterOpen && (
                                <div className="absolute right-0 mt-2 w-32 bg-card border border-border rounded-sm shadow-md z-50 overflow-hidden">
                                    {['all', 'approved', 'declined'].map(option => (
                                        <button
                                            key={option}
                                            onClick={() => {
                                                setCompletedFilter(option as any)
                                                setIsFilterOpen(false)
                                            }}
                                            className={`w-full text-left px-3 py-2 text-xs hover:bg-muted ${completedFilter === option
                                                ? 'bg-muted font-semibold'
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
                <div className="mt-1 text-center text-muted-foreground text-sm italic">
                    Showing {requestType === 'notify' ? 'notify' : approvalStatus} requests...
                </div>

                <div className="space-y-2 mt-1">
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
                                    className="p-3.5 shadow-sm border rounded-sm cursor-pointer bg-card border-border transition-all duration-300"
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <a
                                                href={`tel:${card.phone}`}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                                title="Call"
                                            >
                                                <Phone size={16} />
                                            </a>
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-bold text-foreground truncate">{card.name}</h3>
                                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                    <Phone size={12} className="text-muted-foreground shrink-0" />
                                                    {card.phone || "No Number"}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            <div className="flex items-center gap-1">
                                                {badgeLabels.map(label => (
                                                    <span key={label} className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${label === 'Bulk Quote' ? 'bg-[#F97316]/10 text-[#9A4A14]' : 'bg-yellow-50 text-yellow-700'}`}>
                                                        {label === 'Bulk Quote' ? 'Bulk' : label}
                                                    </span>
                                                ))}
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"
                                                    className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                                                    <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                </svg>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground font-medium">{formatDate(latestItem?.createdAt)}</span>
                                        </div>
                                    </div>
                                    {isExpanded && (
                                        <div className="mt-4 border-t pt-4 space-y-3" onClick={e => e.stopPropagation()}>
                                            {card.bulks.length > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="flex-1 h-px bg-muted" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Bulk Quote Requests ({card.bulks.length})</span>
                                                        <div className="flex-1 h-px bg-muted" />
                                                    </div>
                                                    <div className="rounded-sm overflow-hidden border border-[#F97316]/30">
                                                        <div className="bg-[#F97316] px-3 py-1.5 flex items-center justify-between">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-white">Quote Item</span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setReplyMessage(prev => ({ ...prev, [cardKey]: '' }));
                                                                    setReplyOpen(prev => ({ ...prev, [cardKey]: true }));
                                                                }}
                                                                className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-sm bg-card/20 hover:bg-card/30 text-white shrink-0"
                                                            >
                                                                <Reply size={11} /> Reply
                                                            </button>
                                                        </div>
                                                        <div className="bg-[#F97316]/5 divide-y divide-[#F97316]/10">
                                                            {card.bulks.map(bq => (
                                                                <div key={bq.id} className="flex gap-3 items-center p-3">
                                                                    <div className="w-10 h-10 shrink-0 bg-card border border-border rounded-sm flex items-center justify-center overflow-hidden">
                                                                        {bq.itemImage ? <img src={bq.itemImage} alt={bq.itemName} className="w-full h-full object-contain" /> : <span className="text-gray-300 text-[8px] text-center">No img</span>}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-[12px] font-black text-foreground uppercase truncate">{bq.itemName}</p>
                                                                        <p className="text-[10px] text-muted-foreground"><span className="font-bold">Qty:</span> {bq.quantity}</p>
                                                                        {bq.note && <p className="text-[10px] text-muted-foreground mt-0.5 italic">{bq.note}</p>}
                                                                    </div>
                                                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteBulk(bq.id); }} className="text-red-400 hover:text-red-600 text-sm font-bold p-1 shrink-0">✕</button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            {card.queries.length > 0 && (
                                                <div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="flex-1 h-px bg-muted" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">Query Requests ({card.queries.length})</span>
                                                        <div className="flex-1 h-px bg-muted" />
                                                    </div>
                                                    <div className="rounded-sm overflow-hidden border border-[#1A3B5D]/30">
                                                        <div className="bg-[#1A3B5D] px-3 py-1.5 flex items-center justify-between">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-white">Customer Query</span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setReplyMessage(prev => ({ ...prev, [cardKey]: '' }));
                                                                    setReplyOpen(prev => ({ ...prev, [cardKey]: true }));
                                                                }}
                                                                className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-sm bg-card/20 hover:bg-card/30 text-white shrink-0"
                                                            >
                                                                <Reply size={11} /> Reply
                                                            </button>
                                                        </div>
                                                        <div className="bg-[#1A3B5D]/5 divide-y divide-[#1A3B5D]/10">
                                                            {card.queries.map(pr => (
                                                                <div key={pr.id} className="flex gap-2 items-center p-3">
                                                                    <div className="flex-1 min-w-0">
                                                                        <span className="text-[9px] font-black uppercase text-muted-foreground block mb-0.5">Query</span>
                                                                        <p className="text-[11px] text-foreground italic">"{pr.note}"</p>
                                                                    </div>
                                                                    <button onClick={(e) => { e.stopPropagation(); handleDeletePersonalization(pr.id); }} className="text-red-400 hover:text-red-600 text-sm font-bold p-1 shrink-0">✕</button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                            <div className="pt-2 border-t space-y-2">
                                                <div className="flex rounded-sm overflow-hidden">
                                                    <a
                                                        href={`tel:${card.phone}`}
                                                        onClick={e => e.stopPropagation()}
                                                        className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-emerald-50 text-emerald-600 text-xs font-bold"
                                                    >
                                                        <Phone size={14} /> Call
                                                    </a>
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            handleDeleteMergedCard(cardKey);
                                                        }}
                                                        className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-[#FF3B30] text-white text-xs font-bold"
                                                    >
                                                        <Trash2 size={14} /> Delete
                                                    </button>
                                                </div>

                                                {/* ── Reply Popup Modal ── */}
                                                {replyOpen[cardKey] && (
                                                    <div
                                                        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setReplyOpen(prev => ({ ...prev, [cardKey]: false }));
                                                        }}
                                                    >
                                                        <div
                                                            className="bg-card w-full max-w-sm rounded-sm shadow-xl p-4 space-y-3"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-black uppercase tracking-widest text-[#1A3B5D]">Reply to Customer</span>
                                                                <button
                                                                    onClick={() => setReplyOpen(prev => ({ ...prev, [cardKey]: false }))}
                                                                    className="text-muted-foreground hover:text-muted-foreground text-sm font-bold"
                                                                >✕</button>
                                                            </div>
                                                            <textarea
                                                                rows={8}
                                                                placeholder="Type your message to the customer..."
                                                                value={replyMessage[cardKey] || ''}
                                                                onChange={e => setReplyMessage(prev => ({ ...prev, [cardKey]: e.target.value }))}
                                                                className="w-full p-2 border border-border rounded-sm text-xs outline-none focus:border-[#25D366] resize-none"
                                                            />
                                                            <button
                                                                disabled={sendingId === `reply_${cardKey}` || !replyMessage[cardKey]?.trim()}
                                                                onClick={async () => {
                                                                    const sent = await sendDirectWhatsappMessage(
                                                                        card.phone,
                                                                        replyMessage[cardKey] || '',
                                                                        `reply_${cardKey}`
                                                                    );
                                                                    if (sent) {
                                                                        setReplyMessage(prev => ({ ...prev, [cardKey]: '' }));
                                                                        setReplyOpen(prev => ({ ...prev, [cardKey]: false }));
                                                                    }
                                                                }}
                                                                className="block w-full py-2 bg-[#25D366] text-white text-xs font-bold rounded-sm text-center disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {sendingId === `reply_${cardKey}` ? 'Sending...' : 'Send on WhatsApp'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
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
                                className={`p-3 shadow-sm border rounded-sm cursor-pointer transition-all duration-300 bg-card border-border ${animatingId === req.id ? "opacity-0 scale-95 -translate-x-3" : "opacity-100 scale-100 translate-x-0"}`}>
                                {/* ===== COLLAPSED HEADER ===== */}
                                <div className="flex justify-between items-start gap-2">
                                    {/* LEFT SIDE — avatar + name + phone */}
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <a
                                            href={`tel:${req.customerNumber?.replace(/\D/g, "")}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                            title="Call"
                                        >
                                            <Phone size={16} />
                                        </a>
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-bold text-foreground truncate">
                                                {req.customerName || "No Name"}
                                            </h3>
                                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                                <Phone size={12} className="text-muted-foreground shrink-0" />
                                                {req.customerNumber || "No Number"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* RIGHT SIDE — badges + date, stacked */}
                                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                                        <div className="flex items-center gap-1.5">
                                            {(() => {
                                                const phone = (req.customerNumber || '').replace(/\D/g, '');
                                                const bulkCount = (bulkByPhone[phone] || []).length;
                                                if (bulkCount === 0) return null;
                                                return (
                                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-[#F97316]/10 text-[#9A4A14] uppercase tracking-wide whitespace-nowrap">
                                                        Bulk
                                                    </span>
                                                );
                                            })()}
                                            {req.type === "notify" && (() => {
                                                const badge = getNotifyBadge(req);
                                                if (!badge) return null;
                                                return (
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${badge.class}`}>
                                                        {badge.text}
                                                    </span>
                                                );
                                            })()}
                                            {req.type === "approval" && (
                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm ${getStatusStyle(req.status)}`}>
                                                    {req.status || "pending"}
                                                </span>
                                            )}
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                strokeWidth={2.5}
                                                stroke="currentColor"
                                                className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                            >
                                                <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                            </svg>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground font-medium">
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

                                        {req.type === 'notify' ? (
                                            <div className="mb-3">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="flex-1 h-px bg-muted" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                                                        Notify Me Items ({req.items?.length || 0})
                                                    </span>
                                                    <div className="flex-1 h-px bg-muted" />
                                                </div>
                                                {req.items?.length ? (
                                                    <div className="rounded-sm overflow-hidden border border-[#334155]/30">
                                                        <div className="bg-gray-500 px-3 py-1.5 flex items-center justify-between">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-white">
                                                                Requested Item
                                                            </span>
                                                            {(req.items || []).some(i => i.inStock === true) && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const inStockItems = (req.items || []).filter(i => i.inStock === true);
                                                                        const itemLines = inStockItems
                                                                            .map(i => {
                                                                                const productLink = i.id && catalogueBaseUrl
                                                                                    ? `${catalogueBaseUrl}?itemId=${i.id}`
                                                                                    : null;
                                                                                return productLink
                                                                                    ? `• ${i.name}\n${productLink}`
                                                                                    : `• ${i.name}`;
                                                                            })
                                                                            .join('\n\n');
                                                                        const message =
                                                                            `Hi ${req.customerName || 'there'},\n\n` +
                                                                            `Great news! The following item(s) you were waiting for are now *In Stock*:\n\n` +
                                                                            `${itemLines}\n\n` +
                                                                            `Please visit us or reply here to place your order.`;
                                                                        setReplyMessage(prev => ({ ...prev, [req.id]: message }));
                                                                        setReplyOpen(prev => ({ ...prev, [req.id]: true }));
                                                                    }}
                                                                    className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-sm bg-card/20 hover:bg-card/30 text-white shrink-0"
                                                                >
                                                                    <Reply size={11} /> Send In Stock
                                                                </button>
                                                            )}
                                                        </div>
                                                        <div className="bg-[#334155]/5 divide-y divide-[#334155]/10">
                                                            {req.items.map((item, idx) => (
                                                                <div key={idx} className="flex justify-between items-center p-3">
                                                                    <span className="text-[12px] font-black text-foreground uppercase truncate">
                                                                        {item.name}
                                                                    </span>
                                                                    <span
                                                                        className={`text-[9px] font-bold px-2 py-0.5 rounded-sm border shrink-0 ${item.inStock
                                                                            ? 'text-green-600 bg-green-100 border-green-200'
                                                                            : 'text-red-600 bg-red-100 border-red-200'
                                                                            }`}
                                                                    >
                                                                        {item.inStock ? 'In Stock' : 'Out of Stock'}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-muted-foreground italic text-center py-3">
                                                        No items found
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            req.businessCard && req.businessCard !== "Placeholder" && (
                                                <div className="relative w-full overflow-hidden rounded-sm border border-border bg-muted group">
                                                    <img
                                                        src={req.businessCard}
                                                        alt="Business Card"
                                                        className="w-full h-auto max-h-[250px] object-contain"
                                                    />
                                                </div>
                                            )
                                        )}
                                        {/* ── BULK QUOTE REQUESTS for this customer (notify cards only) ── */}
                                        {req.type === "notify" && (() => {
                                            const phone = (req.customerNumber || '').replace(/\D/g, '');
                                            const customerBulks = bulkByPhone[phone] || [];
                                            if (customerBulks.length === 0) return null;
                                            return (
                                                <div className="mt-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="flex-1 h-px bg-muted" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                                                            Bulk Quote Requests ({customerBulks.length})
                                                        </span>
                                                        <div className="flex-1 h-px bg-muted" />
                                                    </div>
                                                    <div className="rounded-sm overflow-hidden border border-[#F97316]/30">
                                                        <div className="bg-[#F97316] px-3 py-1.5 flex items-center justify-between">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-white">
                                                                Quote Item
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setReplyMessage(prev => ({ ...prev, [req.id]: '' }));
                                                                    setReplyOpen(prev => ({ ...prev, [req.id]: true }));
                                                                }}
                                                                className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-sm bg-card/20 hover:bg-card/30 text-white shrink-0"
                                                            >
                                                                <Reply size={11} /> Reply
                                                            </button>
                                                        </div>
                                                        <div className="bg-[#F97316]/5 divide-y divide-[#F97316]/10">
                                                            {customerBulks.map(bq => (
                                                                <div key={bq.id} className="flex gap-3 items-center p-3">
                                                                    <div className="w-10 h-10 shrink-0 bg-card border border-border rounded-sm flex items-center justify-center overflow-hidden">
                                                                        {bq.itemImage ? (
                                                                            <img src={bq.itemImage} alt={bq.itemName} className="w-full h-full object-contain" />
                                                                        ) : (
                                                                            <span className="text-gray-300 text-[8px] text-center">No img</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-[12px] font-black text-foreground uppercase truncate">{bq.itemName}</p>
                                                                        <p className="text-[10px] text-muted-foreground"><span className="font-bold">Qty:</span> {bq.quantity}</p>
                                                                        {bq.note && (
                                                                            <p className="text-[10px] text-muted-foreground mt-0.5 italic">{bq.note}</p>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteBulk(bq.id); }}
                                                                        className="text-red-400 hover:text-red-600 text-sm font-bold p-1 shrink-0"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        {/* ── PERSONALIZATION REQUESTS for this customer (notify cards only) ── */}
                                        {req.type === "notify" && (() => {
                                            const phone = (req.customerNumber || '').replace(/\D/g, '');
                                            const customerPersonalizations = personalizationByPhone[phone] || [];
                                            if (customerPersonalizations.length === 0) return null;
                                            return (
                                                <div className="mt-3">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <div className="flex-1 h-px bg-muted" />
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                                                            Query Requests ({customerPersonalizations.length})
                                                        </span>
                                                        <div className="flex-1 h-px bg-muted" />
                                                    </div>
                                                    <div className="rounded-sm overflow-hidden border border-[#1A3B5D]/30">
                                                        <div className="bg-[#1A3B5D] px-3 py-1.5 flex items-center justify-between">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-white">
                                                                Customer Query
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setReplyMessage(prev => ({ ...prev, [req.id]: '' }));
                                                                    setReplyOpen(prev => ({ ...prev, [req.id]: true }));
                                                                }}
                                                                className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-sm bg-card/20 hover:bg-card/30 text-white shrink-0"
                                                            >
                                                                <Reply size={11} /> Reply
                                                            </button>
                                                        </div>
                                                        <div className="bg-[#1A3B5D]/5 divide-y divide-[#1A3B5D]/10">
                                                            {customerPersonalizations.map(pr => (
                                                                <div key={pr.id} className="flex gap-2 items-center p-3">
                                                                    <div className="flex-1 min-w-0">
                                                                        <span className="text-[9px] font-black uppercase text-muted-foreground block mb-0.5">Query</span>
                                                                        <p className="text-[11px] text-foreground italic">"{pr.note}"</p>
                                                                    </div>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeletePersonalization(pr.id); }}
                                                                        className="text-red-400 hover:text-red-600 text-sm font-bold p-1 shrink-0"
                                                                    >✕</button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        {req.type === "notify" && (
                                            <div className="space-y-2 pt-2 border-t">
                                                {/* ── Solid footer bar: In Stock (if applicable) / Call / Reply / Delete ── */}
                                                <div className="flex rounded-sm overflow-hidden">
                                                    <a
                                                        href={`tel:${req.customerNumber?.replace(/\D/g, "")}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-emerald-50 text-emerald-600 text-xs font-bold"
                                                    >
                                                        <Phone size={14} /> Call
                                                    </a>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteNotify(req);
                                                        }}
                                                        className="flex-1 flex items-center justify-center gap-1.5 py-3 bg-[#FF3B30] text-white text-xs font-bold"
                                                    >
                                                        <Trash2 size={14} /> Delete
                                                    </button>
                                                </div>

                                                {/* ── Reply Popup Modal ── */}
                                                {replyOpen[req.id] && (
                                                    <div
                                                        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setReplyOpen(prev => ({ ...prev, [req.id]: false }));
                                                        }}
                                                    >
                                                        <div
                                                            className="bg-card w-full max-w-sm rounded-sm shadow-xl p-4 space-y-3"
                                                            onClick={e => e.stopPropagation()}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-xs font-black uppercase tracking-widest text-[#1A3B5D]">Reply to Customer</span>
                                                                <button
                                                                    onClick={() => setReplyOpen(prev => ({ ...prev, [req.id]: false }))}
                                                                    className="text-muted-foreground hover:text-muted-foreground text-sm font-bold"
                                                                >✕</button>
                                                            </div>
                                                            <textarea
                                                                rows={8}
                                                                placeholder="Type your message to the customer..."
                                                                value={replyMessage[req.id] || ''}
                                                                onChange={e => setReplyMessage(prev => ({ ...prev, [req.id]: e.target.value }))}
                                                                className="w-full p-2 border border-border rounded-sm text-xs outline-none focus:border-[#25D366] resize-none"
                                                            />
                                                            <button
                                                                disabled={sendingId === `reply_${req.id}` || !replyMessage[req.id]?.trim()}
                                                                onClick={async () => {
                                                                    const sent = await sendDirectWhatsappMessage(
                                                                        req.customerNumber,
                                                                        replyMessage[req.id] || '',
                                                                        `reply_${req.id}`
                                                                    );
                                                                    if (sent) {
                                                                        await markMessageSent(req.id);
                                                                        setReplyMessage(prev => ({ ...prev, [req.id]: '' }));
                                                                        setReplyOpen(prev => ({ ...prev, [req.id]: false }));
                                                                    }
                                                                }}
                                                                className="block w-full py-2 bg-[#25D366] text-white text-xs font-bold rounded-sm text-center disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {sendingId === `reply_${req.id}` ? 'Sending...' : 'Send on WhatsApp'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
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
                                                            className="py-2.5 bg-card border border-red-500 text-red-500 hover:bg-red-50 text-xs font-bold rounded-sm transition-colors"
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
                                )
                                }
                            </div>
                        );
                    })}
                </div >

            </main >
        </div >
    )
}

export default RequestPage