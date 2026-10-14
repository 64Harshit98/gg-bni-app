import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { createPortal } from 'react-dom'
import {
    ChevronLeft, ChevronRight, X, Check, Bell, Package, MessageSquare, Inbox, Search, Phone,
    Filter, Reply, Trash2, MoreHorizontal, UserPlus,
} from 'lucide-react'
import { collection, doc, updateDoc, deleteDoc, onSnapshot, getDoc, query, limit } from "firebase/firestore";
import { db } from '../lib/Firebase';
import { useAuth } from "../context/auth-context";
import { State } from '../enums'
import { Modal } from '../constants/Modal'
import { botMasterService } from '../Pages/Additional/Whatsapp/WhatsappApi';
import { sendCompanyWhatsappMessage } from '../Pages/Additional/Whatsapp/sendCompanyWhatsappMessage';
import { useWhatsappProvider } from '../Pages/Additional/Whatsapp/useWhatsappProvider';
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

// One customer in the Pre-orders list (a notify row, or a bulk/query-only customer)
type PreOrderRow = {
    key: string;
    phone: string;
    name: string;
    createdAt: any;
    ts: number;
    firstTs: number;
    req?: RequestType;
    bulks: BulkQuoteType[];
    queries: PersonalizationType[];
};

type KindFilter = 'all' | 'notify' | 'bulk' | 'query';

// ───────────────────────── Tailwind class tokens (Catalogue / orange theme) ─────────────────────────
const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

const BTN = 'inline-flex items-center justify-center gap-2 rounded-sm border border-transparent text-sm font-medium leading-5 whitespace-nowrap cursor-pointer transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600';
const BTN_MD = 'h-10 px-4';
const BTN_SM = 'h-8 px-3 text-[13px]';
const BTN_ICON = 'h-8 w-8';
const PRIMARY = 'bg-orange-700 text-white hover:bg-orange-800';
const SECONDARY = 'bg-white text-slate-900 !border-[#7a8aa3] hover:bg-[#fff8f2]';
const GHOST = 'text-slate-600 hover:bg-[#fff8f2] hover:text-slate-900';
const GHOST_DANGER = 'text-red-600 hover:bg-red-50';

const SECTION = 'border border-[#f6e1d0] rounded-sm overflow-hidden';
const SECTION_HEAD = 'flex flex-wrap items-center gap-x-2.5 gap-y-2 px-3.5 py-2.5 bg-[#fff8f2] border-b border-[#f6e1d0]';
const ROW = 'flex items-center gap-3 px-3.5 py-2.5 border-b border-[#f6e1d0] last:border-b-0 text-[13px]';
const QUOTE = 'text-[13px] italic text-slate-600 bg-[#fff8f2] rounded-sm px-2.5 py-2 break-words';
const INPUT = 'w-full h-10 px-3 text-sm text-slate-900 bg-white border border-[#7a8aa3] rounded-sm placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-600';
const ICONBTN = 'inline-grid place-items-center h-10 w-10 shrink-0 rounded-sm border border-[#7a8aa3] bg-white text-slate-600 hover:bg-[#fff8f2] cursor-pointer';

const SEG = 'inline-flex gap-0.5 p-[3px] bg-[#fff8f2] border border-[#f6e1d0] rounded-sm';
const segBtn = (on: boolean) => cx(
    'h-7 px-3 rounded-sm text-xs font-medium cursor-pointer whitespace-nowrap transition-colors',
    on ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
);

const KB_TONE = {
    notify: 'bg-[#fff8f2] text-slate-600 border border-[#f6e1d0]',
    bulk: 'bg-orange-100 text-orange-800',
    query: 'bg-yellow-100 text-yellow-700',
    ok: 'bg-green-50 text-green-700',
    no: 'bg-red-50 text-red-600',
} as const;

const Kb = ({ tone, children }: { tone: keyof typeof KB_TONE; children: React.ReactNode }) => (
    <span className={cx('text-[10px] font-semibold tracking-wide uppercase px-[7px] py-px rounded-sm whitespace-nowrap', KB_TONE[tone])}>
        {children}
    </span>
);

const Avatar = ({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) => (
    <span
        className={cx(
            'grid place-items-center shrink-0 rounded-sm font-semibold',
            size === 'lg' ? 'h-11 w-11 text-base bg-orange-100 text-orange-800' : 'h-9 w-9 text-[13px] bg-[#fff8f2] text-slate-600'
        )}
    >
        {(name || '?').charAt(0).toUpperCase()}
    </span>
);

const EmptyState = ({ title, text }: { title: string; text: string }) => (
    <div className="grid justify-items-center gap-1.5 px-4 py-10 text-center bg-white border border-dashed border-[#7a8aa3] rounded-sm">
        <span className="grid place-items-center h-12 w-12 mb-1 rounded-sm bg-orange-100 text-orange-800">
            <Inbox size={24} />
        </span>
        <b className="text-[15px] font-semibold">{title}</b>
        <p className="m-0 max-w-sm text-[13px] text-slate-500">{text}</p>
    </div>
);

const digits = (s?: string) => (s || '').replace(/\D/g, '');
const secs = (t: any) => t?.seconds || 0;

// Display only — "26 Sep, 2:46 pm"
const formatDate = (timestamp: any) => {
    if (!timestamp || typeof timestamp.toDate !== "function") return "—";
    const date: Date = timestamp.toDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12 || 12;
    return `${date.getDate()} ${months[date.getMonth()]}, ${hours}:${minutes} ${ampm}`;
};
const formatSecs = (s: number) => (s ? formatDate({ toDate: () => new Date(s * 1000) }) : '—');

// Display only — "98188 37719". Raw number is still used for tel: links and sending.
const formatPhone = (raw?: string) => {
    const d = digits(raw);
    if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
    if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
    return raw || '';
};

const useMediaQuery = (q: string) => {
    const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
    useEffect(() => {
        const mql = window.matchMedia(q);
        const on = () => setMatch(mql.matches);
        on();
        mql.addEventListener('change', on);
        return () => mql.removeEventListener('change', on);
    }, [q]);
    return match;
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

function RequestPage() {
    const navigate = useNavigate()
    const location = useLocation()
    const { currentUser } = useAuth();
    const companyId = currentUser?.companyId;
    const { provider: whatsappProvider } = useWhatsappProvider(companyId);
    const isDesktop = useMediaQuery('(min-width: 1280px)'); // two-pane needs room: sidebar + 380px list + detail

    const [requireApproval, setRequireApproval] = useState<boolean>(false);
    const [requestType, setRequestType] = useState<'notify' | 'approval'>('notify')
    const [catalogueBaseUrl, setCatalogueBaseUrl] = useState<string>('');
    const [approvalStatus, setApprovalStatus] = useState<'pending' | 'completed'>('pending')
    const [requests, setRequests] = useState<RequestType[]>([]);
    const [bulkQuotes, setBulkQuotes] = useState<BulkQuoteType[]>([]);
    const [personalizationRequests, setPersonalizationRequests] = useState<PersonalizationType[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [kindFilter, setKindFilter] = useState<KindFilter>('all');
    const [animatingId, setAnimatingId] = useState<string | null>(null);
    const [isSearchOpen, setIsSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [completedFilter, setCompletedFilter] = useState<'all' | 'approved' | 'declined'>('all')
    const [isDateFilterOpen, setIsDateFilterOpen] = useState(false)
    const [menuOpen, setMenuOpen] = useState(false)
    const [showAllQueries, setShowAllQueries] = useState<Record<string, boolean>>({})

    // "View All Requests" on the Orders page hands over its own active date filter as route state.
    const [activeDateFilter, setActiveDateFilter] = useState<string>(location.state?.activeDateFilter || 'today')
    const [customStartDate, setCustomStartDate] = useState<string>(location.state?.customDateRange?.start || '')
    const [customEndDate, setCustomEndDate] = useState<string>(location.state?.customDateRange?.end || '')
        const [showCustomInputs, setShowCustomInputs] = useState<boolean>(location.state?.activeDateFilter === 'custom')
    const [customDraft, setCustomDraft] = useState({ start: customStartDate, end: customEndDate })

    const dateFilterRef = useRef<HTMLDivElement>(null)
    const menuRef = useRef<HTMLDivElement>(null)
    const [replyOpen, setReplyOpen] = useState<Record<string, boolean>>({})
    const [replyMessage, setReplyMessage] = useState<Record<string, string>>({})
    const [sendingId, setSendingId] = useState<string | null>(null)
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null)

    // Approval tab only exists when approval is required
    const tab: 'notify' | 'approval' = requireApproval ? requestType : 'notify';

    useEffect(() => {
        if (!companyId) return;
        const fetchSettings = async () => {
            try {
                const settingsRef = doc(db, 'companies', companyId, 'settings', 'catalogue-sales-settings');
                const snap = await getDoc(settingsRef);
                if (snap.exists()) {
                    const data = snap.data();
                    setRequireApproval(data.requireApproval === true);
                    setRequestType(data.requireApproval ? 'approval' : 'notify');
                }
            } catch (err) {
                console.error('Failed to fetch settings:', err);
            }
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

    // ───────────── date filter ─────────────
        const handleDateFilterSelect = (value: string) => {
        if (value === 'custom') {
            // do NOT change the active filter yet — edit a draft, apply on "Apply"
            setCustomDraft({ start: customStartDate, end: customEndDate });
            setShowCustomInputs(true);
            return;
        }
        setShowCustomInputs(false);
        setActiveDateFilter(value);
        setIsDateFilterOpen(false);
    };

    const canApplyCustom = !!customDraft.start && !!customDraft.end;
    const applyCustomRange = () => {
        if (!canApplyCustom) return;
        const [s, e] = customDraft.start <= customDraft.end
            ? [customDraft.start, customDraft.end]
            : [customDraft.end, customDraft.start];
        setCustomStartDate(s);
        setCustomEndDate(e);
        setActiveDateFilter('custom');
        setShowCustomInputs(false);
        setIsDateFilterOpen(false);
    };

    // Dropdown closed (outside click / Cancel / Apply) → next open starts on the preset list
    useEffect(() => {
        if (!isDateFilterOpen) setShowCustomInputs(false);
    }, [isDateFilterOpen]);

    const matchesDateFilter = (timestamp: any) => {
        if (activeDateFilter === 'all') return true;
        if (!timestamp?.toDate) return false;

        const itemDate: Date = timestamp.toDate();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const daysAgo = (date: Date, days: number) =>
            new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);

        switch (activeDateFilter) {
            case 'today': return itemDate >= today;
            case 'yesterday': return itemDate >= daysAgo(today, 1) && itemDate < today;
            case 'last7': return itemDate >= daysAgo(today, 7);
            case 'last15': return itemDate >= daysAgo(today, 15);
            case 'last30': return itemDate >= daysAgo(today, 30);
            case 'custom': {
                if (!customStartDate || !customEndDate) return true;
                const start = new Date(customStartDate);
                start.setHours(0, 0, 0, 0);
                const end = new Date(customEndDate);
                end.setHours(23, 59, 59, 999);
                return itemDate >= start && itemDate <= end;
            }
            default: return true;
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const t = event.target as Node;
            if (dateFilterRef.current && !dateFilterRef.current.contains(t)) setIsDateFilterOpen(false);
            if (menuRef.current && !menuRef.current.contains(t)) setMenuOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ───────────── realtime data ─────────────
    useEffect(() => {
        if (!companyId) return;
        const approvalRef = collection(db, "companies", companyId, "AuthorizedUser");
        const notifyRef = collection(db, "companies", companyId, "NotifyRequests");

        let approvalData: any[] = [];
        let notifyData: any[] = [];

        const mergeAndSet = () => {
            const combined = [...approvalData, ...notifyData];
            const uniqueMap = new Map<string, any>();
            combined.forEach((item: any) => {
                const key = item.type === "approval"
                    ? `approval_${item.customerNumber}`
                    : `notify_${item.customerNumber}`;
                uniqueMap.set(key, item);
            });
            const merged = Array.from(uniqueMap.values()).sort(
                (a: any, b: any) => secs(b.createdAt) - secs(a.createdAt)
            );
            setRequests(merged);
        };

        // safety cap so this never re-downloads a whole unbounded collection
        const unsubApproval = onSnapshot(query(approvalRef, limit(1000)), (snap) => {
            approvalData = snap.docs.map(d => ({ id: d.id, type: "approval", ...d.data() }));
            mergeAndSet();
        });

        const unsubNotify = onSnapshot(query(notifyRef, limit(1000)), (snap) => {
            notifyData = snap.docs.map((docSnap) => {
                const data = docSnap.data() as Partial<RequestType>;
                return {
                    id: docSnap.id,
                    type: "notify" as const,
                    ...data,
                    inStock: Boolean(data?.inStock),
                    messageSent: Boolean(data?.messageSent),
                };
            });
            mergeAndSet();
        });

        const bulkRef = collection(db, 'companies', companyId, 'BulkQuoteRequests');
        const unsubBulk = onSnapshot(query(bulkRef, limit(1000)), (snap) => {
            setBulkQuotes(snap.docs.map(d => ({ id: d.id, ...d.data() as any })));
        });
        const personalizationRef = collection(db, 'companies', companyId, 'PersonalizationRequests');
        const unsubPersonalization = onSnapshot(query(personalizationRef, limit(1000)), (snap) => {
            setPersonalizationRequests(snap.docs.map(d => ({ id: d.id, ...d.data() as any })));
        });

        return () => {
            unsubApproval();
            unsubNotify();
            unsubBulk();
            unsubPersonalization();
        };
    }, [companyId]);

    // ───────────── derived data ─────────────
    // search + date applied once; each tab derives from it
    const baseFiltered = useMemo(() => {
        const q = searchQuery.toLowerCase();
        return requests
            .filter(req =>
                ((req.customerName || "").toLowerCase().includes(q) || (req.customerNumber || "").includes(q)) &&
                matchesDateFilter(req.createdAt)
            )
            .sort((a, b) => secs(b.createdAt) - secs(a.createdAt));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requests, searchQuery, activeDateFilter, customStartDate, customEndDate]);

    const notifyRequests = useMemo(() => baseFiltered.filter(r => r.type === 'notify'), [baseFiltered]);
    const approvalRequests = useMemo(() => baseFiltered.filter(r => r.type === 'approval'), [baseFiltered]);
    const pendingApprovals = useMemo(() => approvalRequests.filter(r => r.status === 'pending'), [approvalRequests]);
    const completedAll = useMemo(
        () => approvalRequests.filter(r => r.status === 'approved' || r.status === 'declined'),
        [approvalRequests]
    );
    const completedApprovals = useMemo(
        () => completedAll.filter(r => completedFilter === 'all' || r.status === completedFilter),
        [completedAll, completedFilter]
    );

    const groupByPhone = <T extends { customerNumber?: string }>(list: T[]) => {
        const map: Record<string, T[]> = {};
        list.forEach(item => {
            const phone = digits(item.customerNumber);
            if (!phone) return;
            (map[phone] = map[phone] || []).push(item);
        });
        return map;
    };
    const bulkByPhone = useMemo(() => groupByPhone(bulkQuotes), [bulkQuotes]);
    const personalizationByPhone = useMemo(() => groupByPhone(personalizationRequests), [personalizationRequests]);

    // Bulk / query-only customers (no notify row) → one merged row per phone
    const mergedPreOrderCards = useMemo(() => {
        const knownPhones = new Set(
            requests.filter(r => r.type === 'notify').map(r => digits(r.customerNumber))
        );
        const q = searchQuery.toLowerCase();
        const keep = (x: { customerNumber?: string; customerName?: string; createdAt?: any }) => {
            const phone = digits(x.customerNumber);
            if (knownPhones.has(phone)) return false;
            if (!matchesDateFilter(x.createdAt)) return false;
            if (!q) return true;
            return (x.customerName || '').toLowerCase().includes(q) || (x.customerNumber || '').includes(q);
        };

        const map = new Map<string, { phone: string; name: string; latestAt: number; bulks: BulkQuoteType[]; queries: PersonalizationType[] }>();
        const entryFor = (phone: string, name?: string) => {
            if (!map.has(phone)) map.set(phone, { phone, name: name || 'No Name', latestAt: 0, bulks: [], queries: [] });
            return map.get(phone)!;
        };

        bulkQuotes.filter(keep).forEach(bq => {
            const e = entryFor(digits(bq.customerNumber), bq.customerName);
            e.bulks.push(bq);
            if (secs(bq.createdAt) > e.latestAt) { e.latestAt = secs(bq.createdAt); e.name = bq.customerName || e.name; }
        });
        personalizationRequests.filter(keep).forEach(pr => {
            const e = entryFor(digits(pr.customerNumber), pr.customerName);
            e.queries.push(pr);
            if (secs(pr.createdAt) > e.latestAt) { e.latestAt = secs(pr.createdAt); e.name = pr.customerName || e.name; }
        });
        return Array.from(map.values());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bulkQuotes, personalizationRequests, requests, searchQuery, activeDateFilter, customStartDate, customEndDate]);

    // Unified Pre-orders list (notify rows + bulk/query-only customers), newest first
    const preOrderRows = useMemo<PreOrderRow[]>(() => {
        const firstOf = (list: any[]) => {
            const all = list.map(secs).filter(Boolean);
            return all.length ? Math.min(...all) : 0;
        };

        const notifyRows: PreOrderRow[] = notifyRequests.map(r => {
            const phone = digits(r.customerNumber);
            const bulks = bulkByPhone[phone] || [];
            const queries = personalizationByPhone[phone] || [];
            return {
                key: r.id,
                phone,
                name: r.customerName || 'No name',
                createdAt: r.createdAt,
                ts: secs(r.createdAt),
                firstTs: firstOf([r.createdAt, ...bulks.map(b => b.createdAt), ...queries.map(q => q.createdAt)]),
                req: r,
                bulks,
                queries,
            };
        });

        const mergedRows: PreOrderRow[] = mergedPreOrderCards.map(c => {
            const latest = [...c.bulks, ...c.queries].sort((a, b) => secs(b.createdAt) - secs(a.createdAt))[0];
            return {
                key: `m_${c.phone}`,
                phone: c.phone,
                name: c.name,
                createdAt: latest?.createdAt,
                ts: c.latestAt,
                firstTs: firstOf([...c.bulks, ...c.queries].map(x => x.createdAt)),
                bulks: c.bulks,
                queries: c.queries,
            };
        });

        return [...notifyRows, ...mergedRows].sort((a, b) => b.ts - a.ts);
    }, [notifyRequests, mergedPreOrderCards, bulkByPhone, personalizationByPhone]);

    const kindCounts = useMemo(() => ({
        all: preOrderRows.length,
        notify: preOrderRows.filter(r => r.req).length,
        bulk: preOrderRows.filter(r => r.bulks.length > 0).length,
        query: preOrderRows.filter(r => r.queries.length > 0).length,
    }), [preOrderRows]);

    const visiblePreOrders = useMemo(() => preOrderRows.filter(r => {
        if (kindFilter === 'notify') return !!r.req;
        if (kindFilter === 'bulk') return r.bulks.length > 0;
        if (kindFilter === 'query') return r.queries.length > 0;
        return true;
    }), [preOrderRows, kindFilter]);

    const selectedRow = tab === 'notify' ? visiblePreOrders.find(r => r.key === selectedKey) : undefined;

    // Desktop: always have a customer open on the right. Phone: nothing until tapped.
    useEffect(() => {
        if (tab !== 'notify' || !isDesktop) return;
        if (visiblePreOrders.length && !visiblePreOrders.some(r => r.key === selectedKey)) {
            setSelectedKey(visiblePreOrders[0].key);
        }
    }, [isDesktop, tab, visiblePreOrders, selectedKey]);

    useEffect(() => { setMenuOpen(false); }, [selectedKey, tab]);

    // ───────────── actions ─────────────
    const updateRequestStatus = async (requestId: string, newStatus: "approved" | "declined") => {
        if (!companyId) return;
        setAnimatingId(requestId);
        setTimeout(async () => {
            try {
                await updateDoc(doc(db, "companies", companyId, "AuthorizedUser", requestId), { status: newStatus });
                setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: newStatus } : r));
            } catch (err) {
                console.error(err);
            } finally {
                setAnimatingId(null);
            }
        }, 250);
    };

    const approveAll = async () => {
        if (!companyId || pendingApprovals.length === 0) return;
        if (!window.confirm(`Approve all ${pendingApprovals.length} pending requests?`)) return;
        const ids = pendingApprovals.map(r => r.id);
        try {
            await Promise.all(ids.map(id =>
                updateDoc(doc(db, "companies", companyId, "AuthorizedUser", id), { status: 'approved' })
            ));
            setRequests(prev => prev.map(r => ids.includes(r.id) ? { ...r, status: 'approved' } : r));
        } catch (err) {
            console.error("Approve all error:", err);
            setModal({ message: "Could not approve all requests.", type: State.ERROR });
        }
    };

    const markMessageSent = async (requestId: string) => {
        if (!companyId) return;
        try {
            await updateDoc(doc(db, "companies", companyId, "NotifyRequests", requestId), {
                messageSent: true,
                updatedAt: new Date(),
            });
            setRequests(prev => prev.map(r => r.id === requestId ? { ...r, messageSent: true } : r));
        } catch (err) {
            console.error("MessageSent update error:", err);
        }
    };

    const deleteRelated = async (phone: string) => {
        if (!companyId || !phone) return;
        const relatedBulks = bulkQuotes.filter(bq => digits(bq.customerNumber) === phone);
        const relatedQueries = personalizationRequests.filter(pr => digits(pr.customerNumber) === phone);
        await Promise.all([
            ...relatedBulks.map(bq => deleteDoc(doc(db, "companies", companyId, "BulkQuoteRequests", bq.id))),
            ...relatedQueries.map(pr => deleteDoc(doc(db, "companies", companyId, "PersonalizationRequests", pr.id))),
        ]);
        setBulkQuotes(prev => prev.filter(bq => digits(bq.customerNumber) !== phone));
        setPersonalizationRequests(prev => prev.filter(pr => digits(pr.customerNumber) !== phone));
    };

    // Deletes the notify row (if any) + every bulk quote / query of that customer
    const handleDeleteRow = async (row: PreOrderRow) => {
        if (!companyId) return;
        if (!window.confirm(`Delete ${row.name}'s request and everything linked to it?`)) return;
        try {
            if (row.req) {
                await deleteDoc(doc(db, "companies", companyId, "NotifyRequests", row.req.id));
                setRequests(prev => prev.filter(r => r.id !== row.req!.id));
            }
            await deleteRelated(row.phone);
            setSelectedKey(null);
        } catch (err) {
            console.error("Delete error:", err);
        }
    };

    const handleDeleteBulk = async (bulkId: string) => {
        if (!companyId) return;
        try {
            await deleteDoc(doc(db, "companies", companyId, "BulkQuoteRequests", bulkId));
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

    // "Back in stock" via the sendCompanyWhatsappMessage Cloud Function (snapto / sellar tiers).
    // Template messages can't carry newlines in variables, so item names are joined with " | ".
    const sendStockAlertSnapto = async (
        customerNumber: string | undefined,
        customerName: string | undefined,
        itemNames: string[],
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
            const businessData = businessSnap.exists() ? businessSnap.data() : {};

            await sendCompanyWhatsappMessage({
                to: customerNumber,
                messageType: 'stockAlert',
                // stock_alert template order: {{1}}=company, {{2}}=customer, {{3}}=items
                templateVariables: [
                    businessData.businessName || businessData.name || '',
                    customerName || 'there',
                    itemNames.join(' | '),
                ],
            });

            setModal({ message: "Stock alert sent via WhatsApp!", type: State.SUCCESS });
            return true;
        } catch (err: any) {
            console.error("Stock Alert Send Error:", err);
            setModal({ message: err?.message ? `Failed to send: ${err.message}` : "Failed to send stock alert.", type: State.ERROR });
            return false;
        } finally {
            setSendingId(null);
        }
    };

    const openReply = (key: string, prefill: string = '') => {
        setReplyMessage(prev => ({ ...prev, [key]: prefill }));
        setReplyOpen(prev => ({ ...prev, [key]: true }));
    };

    // ───────────── render helpers ─────────────
    const renderReplyDialog = (key: string, customerNumber: string | undefined, afterSend?: () => Promise<void>) => {
        if (!replyOpen[key]) return null;
        const close = () => setReplyOpen(prev => ({ ...prev, [key]: false }));
        return (
            <div
                className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center sm:p-4 bg-slate-950/45"
                onClick={close}
            >
                <div
                    className="w-full max-w-[440px] max-h-full overflow-y-auto grid gap-3.5 p-4 pt-5 sm:p-5 bg-white rounded-sm shadow-2xl"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between">
                        <b className="text-lg font-semibold">Reply to customer</b>
                        <button onClick={close} className={cx(BTN, BTN_ICON, GHOST)} aria-label="Close">
                            <X size={18} />
                        </button>
                    </div>
                    <label className="grid gap-1 text-xs font-medium text-slate-500">
                        Message
                        <textarea
                            rows={8}
                            placeholder="Type your message to the customer..."
                            value={replyMessage[key] || ''}
                            onChange={e => setReplyMessage(prev => ({ ...prev, [key]: e.target.value }))}
                            className={cx(INPUT, 'h-auto min-h-[160px] py-2.5 resize-none leading-[22px]')}
                        />
                    </label>
                    <div className="flex gap-2 justify-end">
                        <button className={cx(BTN, BTN_MD, GHOST)} onClick={close}>Cancel</button>
                        <button
                            disabled={sendingId === `reply_${key}` || !replyMessage[key]?.trim()}
                            onClick={async () => {
                                const sent = await sendDirectWhatsappMessage(customerNumber, replyMessage[key] || '', `reply_${key}`);
                                if (sent) {
                                    if (afterSend) await afterSend();
                                    setReplyMessage(prev => ({ ...prev, [key]: '' }));
                                    close();
                                }
                            }}
                            className={cx(BTN, BTN_MD, PRIMARY)}
                        >
                            {sendingId === `reply_${key}` ? 'Sending...' : 'Send on WhatsApp'}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderNotifySection = (row: PreOrderRow) => {
        const req = row.req!;
        const items = req.items || [];
        const inStockItems = items.filter(i => i.inStock === true);
        const n = inStockItems.length;
        const label = `Tell them ${n} ${n === 1 ? 'is' : 'are'} in stock`;

        return (
            <div className={SECTION}>
                <div className={SECTION_HEAD}>
                    <Bell size={16} className="text-slate-500 shrink-0" />
                    <b className="flex-1 min-w-[160px] text-sm font-semibold">Notify me when in stock · {items.length}</b>
                    {n > 0 && whatsappProvider === 'botmaster' && (
                        <button
                            onClick={() => {
                                const itemLines = inStockItems
                                    .map(i => {
                                        const productLink = i.id && catalogueBaseUrl ? `${catalogueBaseUrl}?itemId=${i.id}` : null;
                                        return productLink ? `• ${i.name}\n${productLink}` : `• ${i.name}`;
                                    })
                                    .join('\n\n');
                                const message =
                                    `Hi ${req.customerName || 'there'},\n\n` +
                                    `Great news! The following item(s) you were waiting for are now *In Stock*:\n\n` +
                                    `${itemLines}\n\n` +
                                    `Please visit us or reply here to place your order.`;
                                openReply(row.key, message);
                            }}
                            className={cx(BTN, BTN_SM, PRIMARY, 'max-sm:w-full')}
                        >
                            <Reply size={14} /> {label}
                        </button>
                    )}
                    {n > 0 && (whatsappProvider === 'snapto' || whatsappProvider === 'sellar') && (
                        <button
                            disabled={sendingId === `stock_snapto_${req.id}`}
                            onClick={() => {
                                sendStockAlertSnapto(
                                    req.customerNumber,
                                    req.customerName,
                                    inStockItems.map(i => i.name),
                                    `stock_snapto_${req.id}`
                                ).then(sent => { if (sent) markMessageSent(req.id); });
                            }}
                            className={cx(BTN, BTN_SM, PRIMARY, 'max-sm:w-full')}
                        >
                            <Reply size={14} /> {sendingId === `stock_snapto_${req.id}` ? 'Sending...' : label}
                        </button>
                    )}
                </div>
                {items.length ? items.map((item, idx) => (
                    <div key={idx} className={ROW}>
                        <span className="flex-1 min-w-0 font-medium truncate">{item.name}</span>
                        <span className={cx(
                            'text-[11px] font-semibold px-2 py-0.5 rounded-sm whitespace-nowrap',
                            item.inStock ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                        )}>
                            {item.inStock ? 'In stock' : 'Out of stock'}
                        </span>
                    </div>
                )) : (
                    <div className="p-3 text-center text-[13px] text-slate-500">No items found</div>
                )}
            </div>
        );
    };

    const renderBulkSection = (row: PreOrderRow) => (
        <div className={SECTION}>
            <div className={SECTION_HEAD}>
                <Package size={16} className="text-slate-500 shrink-0" />
                <b className="flex-1 text-sm font-semibold">Bulk quote · {row.bulks.length}</b>
            </div>
            {row.bulks.map(bq => (
                <div key={bq.id} className={cx(ROW, 'items-start flex-wrap sm:flex-nowrap')}>
                    <div className="grid place-items-center h-11 w-11 shrink-0 overflow-hidden rounded-sm bg-orange-100 text-orange-800 text-sm font-semibold">
                        {bq.itemImage
                            ? <img src={bq.itemImage} alt={bq.itemName} className="h-full w-full object-contain bg-white" />
                            : <span>{(bq.itemName || '?').charAt(0).toUpperCase()}</span>}
                    </div>
                    <div className="flex-1 min-w-[160px] grid gap-1">
                        <b className="font-medium break-words">{bq.itemName}</b>
                        <span className="text-xs text-slate-500">
                            Wants <b className="text-slate-900 font-semibold tabular-nums">{bq.quantity}</b>
                            {' · '}{formatDate(bq.createdAt)}
                        </span>
                        {bq.note && <div className={QUOTE}>“{bq.note}”</div>}
                    </div>
                    <div className="flex gap-1.5 shrink-0 max-sm:w-full max-sm:justify-end">
                        <button
                            onClick={() => handleDeleteBulk(bq.id)}
                            className={cx(BTN, BTN_ICON, GHOST)}
                            aria-label="Dismiss"
                        >
                            <X size={16} />
                        </button>
                        <button onClick={() => openReply(row.key)} className={cx(BTN, BTN_SM, PRIMARY)}>
                            <Reply size={14} /> Send quote
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );

    const renderQuerySection = (row: PreOrderRow) => {
        const expanded = !!showAllQueries[row.key];
        const list = expanded ? row.queries : row.queries.slice(0, 2);
        const hidden = row.queries.length - list.length;
        return (
            <div className={SECTION}>
                <div className={SECTION_HEAD}>
                    <MessageSquare size={16} className="text-slate-500 shrink-0" />
                    <b className="flex-1 text-sm font-semibold">Questions · {row.queries.length}</b>
                </div>
                {list.map(pr => (
                    <div key={pr.id} className={cx(ROW, 'items-start flex-wrap sm:flex-nowrap')}>
                        <div className="flex-1 min-w-[160px] grid gap-1">
                            <div className={QUOTE}>“{pr.note}”</div>
                            <span className="text-xs text-slate-500">{formatDate(pr.createdAt)}</span>
                        </div>
                        <div className="flex gap-1.5 shrink-0 max-sm:w-full max-sm:justify-end">
                            <button
                                onClick={() => handleDeletePersonalization(pr.id)}
                                className={cx(BTN, BTN_ICON, GHOST)}
                                aria-label="Dismiss"
                            >
                                <X size={16} />
                            </button>
                            <button onClick={() => openReply(row.key)} className={cx(BTN, BTN_SM, SECONDARY)}>
                                <Reply size={14} /> Reply
                            </button>
                        </div>
                    </div>
                ))}
                {(hidden > 0 || (expanded && row.queries.length > 2)) && (
                    <button
                        onClick={() => setShowAllQueries(prev => ({ ...prev, [row.key]: !expanded }))}
                        className="w-full px-3.5 py-2.5 text-left text-[13px] font-medium text-orange-700 hover:bg-[#fff8f2]"
                    >
                        {expanded ? 'Show fewer questions' : `Show ${hidden} more question${hidden > 1 ? 's' : ''}`}
                    </button>
                )}
            </div>
        );
    };

    const renderKinds = (row: PreOrderRow) => (
        <span className="inline-flex flex-wrap gap-1">
            {row.req && <Kb tone="notify">Notify me{row.req.items?.length ? ` · ${row.req.items.length}` : ''}</Kb>}
            {row.bulks.length > 0 && <Kb tone="bulk">Bulk quote{row.bulks.length > 1 ? ` · ${row.bulks.length}` : ''}</Kb>}
            {row.queries.length > 0 && <Kb tone="query">Query{row.queries.length > 1 ? ` · ${row.queries.length}` : ''}</Kb>}
        </span>
    );

    const renderStockCaption = (row: PreOrderRow) => {
        const items = row.req?.items || [];
        const n = items.filter(i => i.inStock === true).length;
        if (n === 0) return null;
        if (row.req?.messageSent) return <span className="text-xs font-medium text-slate-500">Message sent</span>;
        return <span className="text-xs font-medium text-green-700">{n} item{n > 1 ? 's' : ''} back in stock</span>;
    };

    const renderDetail = (row: PreOrderRow) => {
        const tel = `tel:${row.phone}`;
        return (
            <div className="flex flex-col flex-1 min-h-0">
                {/* header */}
                <div className="flex items-center xl:items-start gap-3 px-4 pb-3 pt-[calc(12px+env(safe-area-inset-top,0px))] xl:px-5 xl:py-4 bg-white border-b border-[#f6e1d0]">
                    <button onClick={() => setSelectedKey(null)} className={cx(BTN, BTN_ICON, GHOST, 'xl:hidden -ml-2')} aria-label="Back">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="hidden xl:block"><Avatar name={row.name} size="lg" /></span>
                    <div className="flex-1 min-w-0">
                        <h2 className="m-0 text-lg xl:text-xl font-semibold leading-7 truncate">{row.name}</h2>
                        <div className="xl:hidden text-xs text-slate-500">
                            {formatPhone(row.phone) || 'No number'} · {(row.req?.items?.length || 0) + row.bulks.length + row.queries.length} requests
                        </div>
                        {/* desktop: full info + kind chips */}
                        <div className="hidden xl:block text-xs text-slate-500 mt-0.5">
                            {formatPhone(row.phone) || 'No number'} · first request {formatSecs(row.firstTs)}
                        </div>
                        <div className="hidden xl:block mt-1.5">{renderKinds(row)}</div>
                    </div>
                    <div className="hidden xl:flex items-center gap-1.5">
                        <a href={tel} className={cx(BTN, BTN_SM, SECONDARY)}><Phone size={16} /> Call</a>
                        <button onClick={() => openReply(row.key)} className={cx(BTN, BTN_SM, SECONDARY)}>
                            <Reply size={16} /> WhatsApp
                        </button>
                    </div>
                    <div ref={menuRef} className="relative">
                        <button
                            onClick={() => setMenuOpen(p => !p)}
                            className={cx(BTN, BTN_ICON, GHOST)}
                            aria-label="More"
                        >
                            <MoreHorizontal size={18} />
                        </button>
                        {menuOpen && (
                            <div className="absolute right-0 top-full mt-1 z-30 w-44 p-1 bg-white border border-[#f6e1d0] rounded-sm shadow-xl">
                                <button
                                    onClick={() => { setMenuOpen(false); handleDeleteRow(row); }}
                                    className="flex items-center gap-2 w-full px-3 py-2 rounded-sm text-[13px] font-medium text-red-600 hover:bg-red-50"
                                >
                                    <Trash2 size={16} /> Delete request
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* body — centred + width-capped on tablet so sections don't stretch edge to edge */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 xl:px-5 xl:py-4 bg-[#fff5ec] xl:bg-white">
                    <div className="grid gap-4 content-start w-full max-w-3xl mx-auto xl:max-w-none">
                        {row.req && renderNotifySection(row)}
                        {row.bulks.length > 0 && renderBulkSection(row)}
                        {row.queries.length > 0 && renderQuerySection(row)}
                    </div>
                </div>

                {/* phone / tablet: pinned Call / WhatsApp */}
                <div className="xl:hidden flex gap-2 p-3 bg-white border-t border-[#f6e1d0] pb-[calc(12px+env(safe-area-inset-bottom,0px))]">
                    <a href={tel} className={cx(BTN, BTN_MD, SECONDARY, 'flex-1')}><Phone size={16} /> Call</a>
                    <button onClick={() => openReply(row.key)} className={cx(BTN, BTN_MD, PRIMARY, 'flex-1')}>
                        <Reply size={16} /> WhatsApp
                    </button>
                </div>

                {renderReplyDialog(row.key, row.phone, row.req ? () => markMessageSent(row.req!.id) : undefined)}
            </div>
        );
    };

    // ───────────── approvals ─────────────
    const renderApprovalRow = (req: RequestType) => {
        const phone = digits(req.customerNumber);
        const hasBulk = (bulkByPhone[phone] || []).length > 0;
        const showDecline = req.status === "pending" || req.status === "approved";
        const showApprove = req.status === "pending" || req.status === "declined";
        const done = req.status === 'approved' || req.status === 'declined';

        return (
            <div
                key={req.id}
                className={cx(
                    'flex flex-wrap items-center gap-x-3.5 gap-y-3 p-4 transition-all duration-200',
                    'bg-white border border-[#f6e1d0] rounded-sm shadow-sm lg:rounded-none lg:border-0 lg:border-b lg:shadow-none lg:last:border-b-0',
                    animatingId === req.id && 'opacity-0 -translate-x-3 scale-[.97]'
                )}
            >
                <Avatar name={req.customerName || '?'} />
                <div className="flex-1 min-w-[140px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <b className="text-sm font-semibold break-words">{req.customerName || 'No name'}</b>
                        {hasBulk && <Kb tone="bulk">Bulk buyer</Kb>}
                        {done && <Kb tone={req.status === 'approved' ? 'ok' : 'no'}>{req.status}</Kb>}
                    </div>
                    <div className="text-xs text-slate-500">
                        {formatPhone(req.customerNumber) || 'No number'} · asked {formatDate(req.createdAt)}
                    </div>
                </div>
                {req.businessCard && req.businessCard !== 'Placeholder' && (
                    <a href={req.businessCard} target="_blank" rel="noreferrer" className={cx(BTN, BTN_SM, GHOST)}>
                        Business card
                    </a>
                )}
                <a
                    href={`tel:${phone}`}
                    className={cx(BTN, BTN_ICON, GHOST, 'hidden sm:inline-flex')}
                    aria-label="Call"
                >
                    <Phone size={16} />
                </a>
                <div className="grid grid-cols-2 sm:flex gap-1.5 w-full sm:w-auto">
                    {showDecline && (
                        <button
                            onClick={() => updateRequestStatus(req.id, "declined")}
                            className={cx(BTN, BTN_SM, 'max-sm:border-[#7a8aa3] max-sm:bg-white', GHOST_DANGER)}
                        >
                            {req.status === 'approved' ? 'Remove access' : 'Decline'}
                        </button>
                    )}
                    {showApprove && (
                        <button onClick={() => updateRequestStatus(req.id, "approved")} className={cx(BTN, BTN_SM, PRIMARY)}>
                            <Check size={14} /> Approve
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const approvalList = approvalStatus === 'pending' ? pendingApprovals : completedApprovals;

    return (
        <div className="min-h-screen w-full min-w-0 overflow-x-hidden flex flex-col bg-[#fff5ec] text-slate-900 text-sm leading-[22px]">
            <div className="relative z-[300]">
                {modal && (
                    <Modal
                        message={modal.message}
                        type={modal.type}
                        onClose={() => setModal(null)}
                        onConfirm={() => setModal(null)}
                        showConfirmButton={false}
                    />
                )}
            </div>

            {/* --- PAGE HEADER ---
                Wraps instead of squeezing: title keeps its own space, the actions drop to a second
                line when the content area is narrow (e.g. tablet with the sidebar open). */}
            <header className="flex flex-wrap items-center gap-x-3 gap-y-3 px-4 pt-4 pb-3 lg:px-6 lg:pt-5 lg:pb-4">
                <button onClick={() => navigate(-1)} className={cx(BTN, BTN_ICON, GHOST, 'lg:hidden -ml-2')} aria-label="Back">
                    <ChevronLeft size={20} />
                </button>
                <div className="flex-1 min-w-[150px]">
                    <h1 className="m-0 text-xl lg:text-2xl font-semibold leading-8 tracking-tight">Requests</h1>
                    <p className="m-0 text-[13px] text-slate-600">
                        <span className="lg:hidden">From your catalogue</span>
                        <span className="hidden lg:inline">What customers asked for from your catalogue</span>
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {/* desktop: always-visible search (only when there's real room) */}
                    <label className="hidden lg:flex items-center gap-2 w-60 xl:w-72 h-10 px-3 bg-white border border-[#7a8aa3] rounded-sm text-slate-500 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-orange-600">
                        <Search size={16} className="shrink-0" />
                        <input
                            type="text"
                            placeholder="Search name or phone"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="flex-1 min-w-0 border-0 outline-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-500"
                        />
                    </label>
                    {/* phone + tablet: search toggle */}
                    <button
                        onClick={() => setIsSearchOpen(p => !p)}
                        className={cx(ICONBTN, 'lg:hidden', isSearchOpen && '!bg-orange-100 !border-orange-700 !text-orange-800')}
                        aria-label="Search"
                    >
                        <Search size={18} />
                    </button>

                    <div ref={dateFilterRef} className="relative">
                        <button
                            onClick={() => setIsDateFilterOpen(p => !p)}
                            className={cx(
                                BTN, 'h-10 px-3 md:px-4', SECONDARY,
                                (isDateFilterOpen || activeDateFilter !== 'today') && '!bg-orange-100 !border-orange-700 !text-orange-800'
                            )}
                            aria-label="Filter by date"
                            title="Filter by date"
                        >
                            <Filter size={16} />
                            <span className="hidden md:inline">
                                {dateFilters.find(f => f.value === activeDateFilter)?.label || 'Filter'}
                            </span>
                        </button>

                                                {isDateFilterOpen && (
                            <div className={cx(
                                'absolute right-0 top-[calc(100%+8px)] z-[120] max-w-[calc(100vw-2rem)] bg-white border border-[#f6e1d0] rounded-sm shadow-xl',
                                showCustomInputs ? 'w-[328px] p-4' : 'w-60 p-2'
                            )}>
                                {showCustomInputs ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <label className="grid gap-1.5 text-[13px] font-medium text-slate-500">
                                                From
                                                <input
                                                    type="date"
                                                    value={customDraft.start}
                                                    onChange={e => setCustomDraft(d => ({ ...d, start: e.target.value }))}
                                                    className={cx(INPUT, 'min-w-0')}
                                                />
                                            </label>
                                            <label className="grid gap-1.5 text-[13px] font-medium text-slate-500">
                                                To
                                                <input
                                                    type="date"
                                                    value={customDraft.end}
                                                    onChange={e => setCustomDraft(d => ({ ...d, end: e.target.value }))}
                                                    className={cx(INPUT, 'min-w-0')}
                                                />
                                            </label>
                                        </div>
                                        <div className="mt-4 flex justify-end gap-2">
                                            <button
                                                onClick={() => setIsDateFilterOpen(false)}
                                                className={cx(BTN, BTN_MD, SECONDARY)}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                disabled={!canApplyCustom}
                                                onClick={applyCustomRange}
                                                className={cx(BTN, BTN_MD, PRIMARY)}
                                            >
                                                Apply
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    dateFilters.map(f => (
                                        <button
                                            key={f.value}
                                            onClick={() => handleDateFilterSelect(f.value)}
                                            aria-pressed={activeDateFilter === f.value}
                                            className={cx(
                                                'block w-full text-left px-3 py-2 rounded-sm text-[13px] cursor-pointer',
                                                activeDateFilter === f.value
                                                    ? 'bg-orange-100 text-orange-800 font-semibold'
                                                    : 'font-medium text-slate-600 hover:bg-[#fff8f2]'
                                            )}
                                        >
                                            {f.label}
                                        </button>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {isSearchOpen && (
                <div className="lg:hidden px-4 pb-3">
                    <label className="flex items-center gap-2 h-10 px-3 bg-white border border-[#7a8aa3] rounded-sm text-slate-500">
                        <Search size={16} className="shrink-0" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Search by name or number..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="flex-1 min-w-0 border-0 outline-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-500"
                        />
                    </label>
                </div>
            )}

            {/* --- MAIN TABS --- */}
            <div className="px-4 pb-3 lg:px-6 lg:pb-4">
                {requireApproval ? (
                    <>
                        {/* phone: segmented */}
                        <div className={cx(SEG, 'grid grid-cols-2 w-full md:hidden')} role="group">
                            <button onClick={() => { setRequestType('notify'); setSelectedKey(null); }} aria-pressed={tab === 'notify'} className={cx(segBtn(tab === 'notify'), 'h-9 text-sm')}>
                                Pre-orders · {preOrderRows.length}
                            </button>
                            <button onClick={() => { setRequestType('approval'); setSelectedKey(null); }} aria-pressed={tab === 'approval'} className={cx(segBtn(tab === 'approval'), 'h-9 text-sm')}>
                                Approvals · {pendingApprovals.length}
                            </button>
                        </div>
                        {/* tablet / desktop: tabs with counts — wrap if the content area is tight */}
                        <div className="hidden md:flex flex-wrap items-center gap-2">
                            {([
                                { id: 'notify', label: 'Pre-order requests', icon: <Bell size={16} />, count: preOrderRows.length },
                                { id: 'approval', label: 'Approval requests', icon: <UserPlus size={16} />, count: pendingApprovals.length },
                            ] as const).map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => { setRequestType(t.id); setSelectedKey(null); }}
                                    aria-pressed={tab === t.id}
                                    className={cx(
                                        'inline-flex items-center gap-2 h-10 px-4 rounded-sm border text-sm font-medium whitespace-nowrap cursor-pointer transition-colors',
                                        tab === t.id
                                            ? 'bg-orange-700 border-orange-700 text-white'
                                            : 'bg-white border-[#f6e1d0] text-slate-600 hover:bg-[#fff8f2]'
                                    )}
                                >
                                    {t.icon}{t.label}
                                    <span className={cx(
                                        'grid place-items-center min-w-[22px] h-5 px-1.5 rounded-sm text-[11px] font-semibold',
                                        tab === t.id ? 'bg-white/25 text-white' : 'bg-[#fff8f2] text-slate-600'
                                    )}>
                                        {t.count}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="inline-flex items-center gap-2 h-10 px-4 rounded-sm bg-orange-700 text-white text-sm font-medium max-md:flex max-md:justify-center">
                        <Bell size={16} /> Pre-order requests
                        <span className="grid place-items-center min-w-[22px] h-5 px-1.5 rounded-sm text-[11px] font-semibold bg-white/25">
                            {preOrderRows.length}
                        </span>
                    </div>
                )}
            </div>

            {/* --- PAGE CONTENT --- */}
            <main className="flex-1 w-full min-w-0 px-4 pb-6 lg:px-6 lg:pb-6">

                {/* ========== PRE-ORDERS: list (left) + detail (right) ========== */}
                {tab === 'notify' && (
                    preOrderRows.length === 0 ? (
                        <EmptyState
                            title="No requests here yet"
                            text="When a customer asks to be notified or wants a bulk quote from your catalogue, it shows up here. Try another date range if you expected some."
                        />
                    ) : (
                        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[380px_minmax(0,1fr)] xl:items-start">
                            {/* LEFT: list */}
                            <div className="grid grid-cols-[minmax(0,1fr)] gap-3 xl:gap-0 xl:bg-white xl:border xl:border-[#f6e1d0] xl:rounded-sm xl:shadow-sm xl:overflow-hidden">
                                <div className="xl:px-4 xl:py-3 xl:border-b xl:border-[#f6e1d0] overflow-x-auto">
                                    <div className={cx(SEG, 'max-sm:flex max-sm:w-full')} role="group">
                                        {([
                                            ['all', 'All'], ['notify', 'Notify me'], ['bulk', 'Bulk'], ['query', 'Queries'],
                                        ] as [KindFilter, string][]).map(([id, label]) => (
                                            <button key={id} onClick={() => setKindFilter(id)} aria-pressed={kindFilter === id} className={cx(segBtn(kindFilter === id), 'max-sm:flex-1 max-sm:px-1.5')}>
                                                {label} {kindCounts[id]}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* phone: 1 column · tablet: cards auto-fit into 2+ columns · desktop: single stacked list */}
                                <div className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] xl:grid-cols-[minmax(0,1fr)] gap-3 xl:gap-0 xl:max-h-[calc(100vh-250px)] xl:overflow-y-auto">
                                    {visiblePreOrders.length === 0 && (
                                        <div className="col-span-full p-6 text-center text-[13px] text-slate-500">Nothing in this view.</div>
                                    )}
                                    {visiblePreOrders.map(row => {
                                        const selected = row.key === selectedKey;
                                        return (
                                            <button
                                                key={row.key}
                                                type="button"
                                                onClick={() => setSelectedKey(row.key)}
                                                aria-selected={selected}
                                                className={cx(
                                                    'w-full min-w-0 text-left flex items-start gap-3 p-3.5 xl:px-4 cursor-pointer transition-colors',
                                                    'bg-white border border-[#f6e1d0] rounded-sm shadow-sm hover:border-orange-700',
                                                    'xl:rounded-none xl:border-0 xl:border-b xl:shadow-none xl:hover:bg-[#fff8f2]',
                                                    selected && 'xl:!bg-orange-100 xl:shadow-[inset_3px_0_0_#c2410c]'
                                                )}
                                            >
                                                <Avatar name={row.name} />
                                                <div className="flex-1 min-w-0 grid gap-1">
                                                    <b className="text-sm font-semibold truncate">{row.name}</b>
                                                    <span className="text-xs text-slate-500 tabular-nums">
                                                        {formatPhone(row.phone) || '—'} · {formatDate(row.createdAt)}
                                                    </span>
                                                    <div>{renderKinds(row)}</div>
                                                    {/* phone / tablet: caption under the chips */}
                                                    <div className="xl:hidden">{renderStockCaption(row)}</div>
                                                </div>
                                                <ChevronRight size={18} className="xl:hidden shrink-0 self-center text-slate-400" />
                                                <span className="hidden xl:block text-right max-w-[120px] shrink-0">{renderStockCaption(row)}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* RIGHT: desktop = side pane · phone/tablet = full-screen page in a portal */}
                            {isDesktop ? (
                                <section className="sticky top-4 min-w-0">
                                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden max-h-[calc(100vh-130px)] bg-white border border-[#f6e1d0] rounded-sm shadow-sm">
                                        {selectedRow ? renderDetail(selectedRow) : (
                                            <div className="grid place-items-center gap-1.5 p-16 text-center text-slate-500">
                                                <Inbox size={28} />
                                                <span>Select a customer to see what they asked for.</span>
                                            </div>
                                        )}
                                    </div>
                                </section>
                            ) : (
                                selectedRow && createPortal(
                                    <section className="fixed inset-0 z-[150] flex flex-col bg-[#fff5ec] text-slate-900 text-sm leading-[22px]">
                                        {renderDetail(selectedRow)}
                                    </section>,
                                    document.body
                                )
                            )}
                        </div>
                    )
                )}

                {/* ========== APPROVALS ========== */}
                {tab === 'approval' && (
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-3 max-w-5xl">
                        <div className="flex gap-2 items-start px-3 py-2.5 rounded-sm bg-orange-100 text-orange-800 text-xs leading-[19px]">
                            <UserPlus size={16} className="shrink-0 mt-0.5" />
                            <span>Customers who asked to see your catalogue prices and order. Approve to let them in; you can decline later from Completed.</span>
                        </div>

                        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:gap-0 lg:bg-white lg:border lg:border-[#f6e1d0] lg:rounded-sm lg:shadow-sm lg:overflow-hidden">
                            <div className="flex flex-wrap items-center gap-2 lg:px-4 lg:py-3 lg:border-b lg:border-[#f6e1d0]">
                                <div className={cx(SEG, 'max-sm:grid max-sm:grid-cols-2 max-sm:basis-full')} role="group">
                                    <button onClick={() => setApprovalStatus('pending')} aria-pressed={approvalStatus === 'pending'} className={segBtn(approvalStatus === 'pending')}>
                                        Pending {pendingApprovals.length}
                                    </button>
                                    <button onClick={() => setApprovalStatus('completed')} aria-pressed={approvalStatus === 'completed'} className={segBtn(approvalStatus === 'completed')}>
                                        Completed {completedAll.length}
                                    </button>
                                </div>

                                {approvalStatus === 'completed' && (
                                    <div className={cx(SEG, 'max-sm:grid max-sm:grid-cols-3 max-sm:basis-full')} role="group">
                                        {(['all', 'approved', 'declined'] as const).map(o => (
                                            <button key={o} onClick={() => setCompletedFilter(o)} aria-pressed={completedFilter === o} className={cx(segBtn(completedFilter === o), 'capitalize')}>
                                                {o}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                <span className="flex-1 max-sm:hidden" />
                                {approvalStatus === 'pending' && pendingApprovals.length > 0 && (
                                    <button onClick={approveAll} className={cx(BTN, BTN_SM, SECONDARY, 'max-sm:w-full')}>
                                        <Check size={14} /> Approve all {pendingApprovals.length}
                                    </button>
                                )}
                            </div>

                            {approvalList.length === 0 ? (
                                <div className="p-8 text-center text-[13px] text-slate-500 bg-white border border-dashed border-[#7a8aa3] rounded-sm lg:border-0 lg:rounded-none">
                                    {approvalStatus === 'pending'
                                        ? 'No pending approvals. Try another date range if you expected some.'
                                        : 'Nothing completed in this view.'}
                                </div>
                            ) : (
                                approvalList.map(renderApprovalRow)
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}

export default RequestPage