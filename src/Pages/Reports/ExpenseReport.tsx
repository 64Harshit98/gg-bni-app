import React, { useMemo, useState, useEffect } from 'react';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    CalendarDays,
    ChevronDown,
    Eye,
    EyeOff,
    FileText,
    Filter,
    MoreHorizontal,
    Pencil,
    PieChart,
    Plus,
    RefreshCw,
    Search,
    Tag,
    Trash2,
    Wallet,
    X,
} from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import BackButton from '../../Components/BackButton';
import {
    addExpenseDoc,
    deleteExpenseDoc,
    updateExpenseDoc,
    type ExpenseSource,
} from './ExpenseReport/useExpense';
import {
    UNCATEGORISED,
    categoryColor,
    categoryOf,
    loadCatalogueExpensesForRange,
    loadPosExpensesForRange,
    type ExpenseRecord,
} from './ExpenseReport/expenseRangeCache';
import { loadSalesForRange } from './SalesReportComponents/salesReportCache';
import { useCachedRange } from './useCachedRange';
import {
    DATE_PRESETS,
    formatCurrency,
    formatDateForInput,
    formatDayMonth,
    formatFullDate,
    formatRangeLabel,
    getPresetRange,
    parseInputDate,
} from './SalesReportComponents/salesReport.utils';
import ReportByDayChart from './SalesReportComponents/ReportByDayChart';
import DownloadMenu from './SalesReportComponents/DownloadMenu';
import CustomRangePanel from './SalesReportComponents/CustomRangePanel';
import { ExpenseModal } from '../../Components/ExpenseModal';
import { State } from '../../enums';
import { Modal } from '../../constants/Modal';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import sellarLogo from '../../assets/sellar-logo.png';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

type ExpenseRow = ExpenseRecord & { source: ExpenseSource };

const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const initials = (name: string) =>
    name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('') || '?';

/* ---------- PDF HELPERS ---------- */
const toDataUrl = async (src: string): Promise<string | null> => {
    try {
        const blob = await (await fetch(src)).blob();
        return await new Promise((resolve) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.onerror = () => resolve(null);
            r.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
};

type RGB = [number, number, number];
const PDF_RADIUS = 0.5;

const drawGradientRect = (doc: jsPDF, x: number, y: number, w: number, h: number, from: RGB, to: RGB) => {
    const steps = 120;
    const sw = w / steps;
    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        doc.setFillColor(
            Math.round(from[0] + (to[0] - from[0]) * t),
            Math.round(from[1] + (to[1] - from[1]) * t),
            Math.round(from[2] + (to[2] - from[2]) * t),
        );
        doc.rect(x + i * sw, y, sw + 0.3, h, 'F');
    }
};

const fmtDay = (ts: number, withWeekday = false) => {
    const d = new Date(ts);
    const mon = d.toLocaleString('en-US', { month: 'short' });
    const wd = d.toLocaleString('en-US', { weekday: 'short' });
    const base = `${d.getDate()} ${mon} ${d.getFullYear()}`;
    return withWeekday ? `${wd}, ${base}` : base;
};

const fmtDayMonth = (ts: number, withWeekday = false) => {
    const d = new Date(ts);
    const mon = d.toLocaleString('en-US', { month: 'short' });
    const wd = d.toLocaleString('en-US', { weekday: 'short' });
    const base = `${d.getDate()} ${mon}`;
    return withWeekday ? `${wd}, ${base}` : base;
};

const fmt2 = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const niceMax = (v: number) => {
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    return (steps.find((s) => f <= s + 1e-9) ?? 10) * exp;
};

const fmtCompact = (n: number) => {
    const trim = (x: number) => String(Math.round(x * 10) / 10);
    if (n >= 1e7) return `${trim(n / 1e7)}Cr`;
    if (n >= 1e5) return `${trim(n / 1e5)}L`;
    if (n >= 1e3) return `${trim(n / 1e3)}K`;
    return String(Math.round(n));
};

const ExpenseReportPage: React.FC = () => {
    const { currentUser, loading: authLoading } = useAuth();
    const companyId = currentUser?.companyId;

    const [companyName, setCompanyName] = useState<string>('');

    useEffect(() => {
        const fetchCompanyName = async () => {
            if (!currentUser?.companyId) return;
            try {
                const businessInfoRef = doc(
                    db,
                    'companies',
                    currentUser.companyId,
                    'business_info',
                    currentUser.companyId,
                );
                const snap = await getDoc(businessInfoRef);
                if (snap.exists()) {
                    setCompanyName(snap.data().businessName || '');
                }
            } catch (e) {
                console.error('Failed to fetch company name', e);
            }
        };
        fetchCompanyName();
    }, [currentUser?.companyId]);

    // --- filters ---
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 29);
        return formatDateForInput(d);
    });
    const [endDate, setEndDate] = useState(() => formatDateForInput(new Date()));
    const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(() => {
        const s = new Date(); s.setDate(s.getDate() - 29); s.setHours(0, 0, 0, 0);
        const e = new Date(); e.setHours(23, 59, 59, 999);
        return { start: s.getTime(), end: e.getTime() };
    });
    const [datePreset, setDatePreset] = useState('last30');

    // --- data (cached per date range — see reportRangeCache.ts) ---
    const posState = useCachedRange(loadPosExpensesForRange, companyId, appliedFilters, authLoading);
    const catState = useCachedRange(loadCatalogueExpensesForRange, companyId, appliedFilters, authLoading);
    // Sales only feed "Share of sales"; shares the sales report's cache.
    const salesState = useCachedRange(loadSalesForRange, companyId, appliedFilters, authLoading);
    const parts = [posState, catState, salesState];
    const isLoading = parts.some((p) => p.isLoading);
    const isFetching = parts.some((p) => p.isFetching);
    const loadError = parts.map((p) => p.error).find(Boolean) ?? null;
    const updatedTimes = parts.map((p) => p.lastUpdated).filter((t): t is number => t !== null);
    const lastUpdated = updatedTimes.length ? Math.min(...updatedTimes) : null;
    const refreshAll = () => parts.forEach((p) => p.refresh());

    const expenses: ExpenseRow[] = useMemo(
        () => [
            ...posState.records.map((e) => ({ ...e, source: 'pos' as const })),
            ...catState.records.map((e) => ({ ...e, source: 'catalogue' as const })),
        ],
        [posState.records, catState.records],
    );

    // --- ui state ---
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isListVisible, setIsListVisible] = useState(true);
    const [isRangeOpen, setIsRangeOpen] = useState(false);
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editing, setEditing] = useState<ExpenseRow | null>(null);
    const [rowMenuId, setRowMenuId] = useState<string | null>(null);
    const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: State.INFO, message: '' });
    const [deleteConfirm, setDeleteConfirm] = useState<ExpenseRow | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: keyof ExpenseRow; direction: 'asc' | 'desc' }>({
        key: 'date', direction: 'desc',
    });

    // Re-render every minute so the "Updated x min ago" label stays accurate.
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 60_000);
        return () => window.clearInterval(timer);
    }, []);
    const updatedLabel = useMemo(() => {
        if (!lastUpdated) return 'Refresh';
        const mins = Math.floor((now - lastUpdated) / 60_000);
        if (mins < 1) return 'Updated just now';
        if (mins < 60) return `Updated ${mins} min ago`;
        return `Updated at ${new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
    }, [lastUpdated, now]);

    // A category picked for one period may not exist in the next one.
    useEffect(() => {
        setCategoryFilter('all');
    }, [appliedFilters]);

    const handleDatePresetChange = (preset: string) => {
        const range = getPresetRange(preset);
        if (!range) return;
        setDatePreset(preset);
        setIsRangeOpen(false);
        setStartDate(formatDateForInput(range.start));
        setEndDate(formatDateForInput(range.end));
        setAppliedFilters({ start: range.start.getTime(), end: range.end.getTime() });
    };

    const handleApplyCustomRange = (startValue: string, endValue: string) => {
        const s = parseInputDate(startValue); s.setHours(0, 0, 0, 0);
        const e = parseInputDate(endValue); e.setHours(23, 59, 59, 999);
        setDatePreset('custom');
        setStartDate(startValue);
        setEndDate(endValue);
        setAppliedFilters({ start: s.getTime(), end: e.getTime() });
        setIsRangeOpen(false);
    };

    const handleSort = (key: keyof ExpenseRow) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    /* ---------- FILTER + SUMMARY ---------- */
    // Date range + search: drives the summary cards and charts.
    const rangeExpenses = useMemo(() => {
        if (!appliedFilters) return [];
        const q = searchQuery.trim().toLowerCase();
        return expenses.filter(e => {
            if (e.date < appliedFilters.start || e.date > appliedFilters.end) return false;
            if (!q) return true;
            return (
                e.title.toLowerCase().includes(q) ||
                e.description.toLowerCase().includes(q) ||
                categoryOf(e).toLowerCase().includes(q) ||
                e.addedBy.toLowerCase().includes(q) ||
                e.amount.toString().includes(q)
            );
        });
    }, [expenses, appliedFilters, searchQuery]);

    const totals = useMemo(() => {
        const total = rangeExpenses.reduce((s, e) => s + e.amount, 0);
        const byCategory = new Map<string, { amount: number; count: number }>();
        rangeExpenses.forEach(e => {
            const key = categoryOf(e);
            const cur = byCategory.get(key) ?? { amount: 0, count: 0 };
            byCategory.set(key, { amount: cur.amount + e.amount, count: cur.count + 1 });
        });
        const categories = [...byCategory.entries()]
            .map(([name, v]) => ({ name, ...v }))
            .sort((a, b) => b.amount - a.amount);
        const salesTotal = appliedFilters
            ? salesState.records
                .filter(s => s.createdAt >= appliedFilters.start && s.createdAt <= appliedFilters.end)
                .reduce((s, sale) => s + sale.totalAmount, 0)
            : 0;
        return {
            total,
            count: rangeExpenses.length,
            people: new Set(rangeExpenses.map(e => e.addedBy).filter(Boolean)).size,
            categories,
            biggest: categories[0] ?? null,
            salesTotal,
            share: salesTotal > 0 ? (total / salesTotal) * 100 : null,
        };
    }, [rangeExpenses, salesState.records, appliedFilters]);

    // Category filter + sort: drives the list and the downloads.
    const { filtered, summary } = useMemo(() => {
        const list = rangeExpenses.filter(e => categoryFilter === 'all' || categoryOf(e) === categoryFilter);
        list.sort((a, b) => {
            const dir = sortConfig.direction === 'asc' ? 1 : -1;
            const va = a[sortConfig.key] ?? '';
            const vb = b[sortConfig.key] ?? '';
            if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
            return String(va).localeCompare(String(vb)) * dir;
        });
        return { filtered: list, summary: { total: list.reduce((s, e) => s + e.amount, 0), count: list.length } };
    }, [rangeExpenses, categoryFilter, sortConfig]);

    const expensesByDay = useMemo(
        () => rangeExpenses.map(e => ({ createdAt: e.date, totalAmount: e.amount })),
        [rangeExpenses],
    );

    /* ---------- ADD / EDIT / DELETE ---------- */
    const refreshSource = (source: ExpenseSource) => (source === 'catalogue' ? catState : posState).refresh();

    const editingValues = useMemo(
        () =>
            editing
                ? {
                    title: editing.title,
                    description: editing.description,
                    amount: editing.amount,
                    date: editing.date,
                    addedBy: editing.addedBy,
                    category: editing.category,
                    paidFrom: editing.paidFrom,
                }
                : undefined,
        [editing],
    );

    const openAdd = () => {
        setEditing(null);
        setIsFormOpen(true);
    };
    const openEdit = (expense: ExpenseRow) => {
        setRowMenuId(null);
        setEditing(expense);
        setIsFormOpen(true);
    };

    const handleSaveExpense = async (data: Parameters<typeof addExpenseDoc>[2]) => {
        if (!companyId) return;
        if (editing) {
            await updateExpenseDoc(companyId, editing.source, editing.id, data);
            refreshSource(editing.source);
        } else {
            await addExpenseDoc(companyId, 'pos', data);
            refreshSource('pos');
        }
    };

    const confirmDelete = async () => {
        if (!companyId || !deleteConfirm) return;
        const { source, id } = deleteConfirm;
        setDeleteConfirm(null);
        try {
            await deleteExpenseDoc(companyId, source, id);
            refreshSource(source);
        } catch {
            setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to delete expense.' });
        }
    };

        // ---- PDF ----
    const downloadAsPdf = async () => {
        if (!appliedFilters) return;

        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const M = 14;
            const PAD = 4;
            const brandRight = pageWidth - M;
            const contentW = pageWidth - M * 2;
            const company = companyName || 'Your Business';
            const entryWord = (n: number) => (n === 1 ? 'entry' : 'entries');

            const generatedAtText = `Generated ${new Date().toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
            })}`;
            const periodText = `${fmtDay(appliedFilters.start)} – ${fmtDay(appliedFilters.end)}`;
            const periodDays = Math.max(
                1,
                Math.round((appliedFilters.end - appliedFilters.start) / 86400000),
            );

            // ---------- ASSETS ----------
            const base64Logo = await resolveCompanyLogoBase64(companyId).catch(() => null);
            const sellarImg = await toDataUrl(sellarLogo);

            const drawCompanyTile = (x: number, y: number, size: number, onDark: boolean) => {
                let drawn = false;
                if (base64Logo) {
                    try {
                        const props = doc.getImageProperties(base64Logo);
                        const maxSide = size - size * 0.22;
                        const scale = Math.min(maxSide / props.width, maxSide / props.height);
                        const w = props.width * scale;
                        const h = props.height * scale;
                        doc.setFillColor(255, 255, 255);
                        if (onDark) {
                            doc.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'F');
                        } else {
                            doc.setDrawColor(229, 231, 235);
                            doc.setLineWidth(0.3);
                            doc.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'FD');
                        }
                        doc.addImage(base64Logo, props.fileType, x + (size - w) / 2, y + (size - h) / 2, w, h);
                        drawn = true;
                    } catch {
                        // invalid logo -> initial fallback
                    }
                }
                if (!drawn) {
                    if (onDark) doc.setFillColor(52, 78, 168);
                    else doc.setFillColor(37, 99, 235);
                    doc.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'F');
                    doc.setTextColor(255, 255, 255);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(size * 0.9);
                    doc.text(
                        (companyName.trim().charAt(0) || 'S').toUpperCase(),
                        x + size / 2,
                        y + size / 2,
                        { align: 'center', baseline: 'middle' },
                    );
                }
            };

            // ---------- DATA (derived from the same `filtered` list) ----------
            const dayKey = (ts: number) => {
                const d = new Date(ts);
                return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            };
            const dayTotals = new Map<string, number>();
            filtered.forEach((e) => {
                const k = dayKey(e.date);
                dayTotals.set(k, (dayTotals.get(k) || 0) + e.amount);
            });
            const days: { ts: number; value: number }[] = [];
            const cursor = new Date(appliedFilters.start);
            cursor.setHours(0, 0, 0, 0);
            while (cursor.getTime() <= appliedFilters.end) {
                days.push({ ts: cursor.getTime(), value: dayTotals.get(dayKey(cursor.getTime())) || 0 });
                cursor.setDate(cursor.getDate() + 1);
            }
            const best = days.length ? days.reduce((a, b) => (b.value > a.value ? b : a), days[0]) : null;
            const hasBest = !!best && best.value > 0;

            const catTotals = new Map<string, number>();
            filtered.forEach((e) => {
                const c = categoryOf(e);
                catTotals.set(c, (catTotals.get(c) || 0) + e.amount);
            });
            const topCat = [...catTotals.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
            const peopleCount = new Set(filtered.map((e) => e.addedBy).filter(Boolean)).size;

            // ---------- 1. HEADER (gradient) ----------
            drawGradientRect(doc, 0, 0, pageWidth, 64, [11, 31, 120], [37, 99, 235]);

            drawCompanyTile(M, 11, 14, true);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(190, 205, 255);
            doc.text('Prepared for', 32, 15);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(255, 255, 255);
            doc.text(company, 32, 22);

            // SELLAR logo + text (top-right, white pill)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            const brandTextW = doc.getTextWidth('SELLAR') + 5 * 0.3;
            const sellarLh = 5;
            let sellarLw = 0;
            if (sellarImg) {
                try {
                    const lp = doc.getImageProperties(sellarImg);
                    sellarLw = (lp.width / lp.height) * sellarLh;
                } catch {
                    // continue without SELLAR logo
                }
            }
            const pillPadX = 3;
            const pillW = brandTextW + (sellarLw ? sellarLw + 2 : 0) + pillPadX * 2;
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(brandRight - pillW, 7.5, pillW, 8, PDF_RADIUS, PDF_RADIUS, 'F');
            if (sellarImg && sellarLw) {
                doc.addImage(
                    sellarImg,
                    'PNG',
                    brandRight - pillPadX - brandTextW - sellarLw - 2,
                    9,
                    sellarLw,
                    sellarLh,
                );
            }
            doc.setTextColor(0, 0, 0);
            doc.text('SELLAR', brandRight - pillPadX, 12.6, { align: 'right', charSpace: 0.3 });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(190, 205, 255);
            doc.text(generatedAtText, brandRight, 21, { align: 'right' });

            // Title block (left)
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(M, 31, 14, 14, PDF_RADIUS, PDF_RADIUS, 'F');

                        // Rupee icon (lucide IndianRupee, 24x24 grid -> 7mm)
            const ix = M + 3.5;
            const iy = 31 + 3.5;
            const k = 7 / 24;
            const seg = (pts: [number, number][]) => {
                for (let i = 0; i < pts.length - 1; i++) {
                    doc.line(
                        ix + pts[i][0] * k, iy + pts[i][1] * k,
                        ix + pts[i + 1][0] * k, iy + pts[i + 1][1] * k,
                    );
                }
            };
            // curve of the rupee: cubic bezier (9,13) -> (9,3), controls (15.667,13) (15.667,3)
            const rupeeCurve: [number, number][] = [];
            for (let i = 0; i <= 12; i++) {
                const t = i / 12;
                const u = 1 - t;
                rupeeCurve.push([
                    u * u * u * 9 + 3 * u * u * t * 15.667 + 3 * u * t * t * 15.667 + t * t * t * 9,
                    u * u * u * 13 + 3 * u * u * t * 13 + 3 * u * t * t * 3 + t * t * t * 3,
                ]);
            }
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(0.5);
            doc.setLineCap('round');
            doc.setLineJoin('round');
            seg([[6, 3], [18, 3]]);
            seg([[6, 8], [18, 8]]);
            seg([[6, 13], [14.5, 21]]);
            seg([[6, 13], [9, 13]]);
            seg(rupeeCurve);
            doc.setLineCap('butt');
            doc.setLineJoin('miter');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(26);
            doc.setTextColor(255, 255, 255);
            doc.text('Expense Report', 32, 38);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(190, 205, 255);
            doc.text("Every expense and each day's spending", 32, 44.5);

            // Report period (right)
            doc.setFontSize(9);
            doc.text('Report period', brandRight, 34, { align: 'right' });
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(255, 255, 255);
            doc.text(periodText, brandRight, 40.5, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(190, 205, 255);
            doc.text(`${periodDays} days`, brandRight, 45.5, { align: 'right' });

            // ---------- 2. SUMMARY CARDS ----------
            const cardY = 50;
            const cardH = 32;
            const kpiPad = 6;

            const cardsData = [
                {
                    label: 'Total expenses',
                    value: `Rs. ${Math.round(summary.total).toLocaleString('en-IN')}`,
                    hint: `${summary.count} ${entryWord(summary.count)}`,
                },
                {
                    label: 'Entries',
                    value: String(summary.count),
                    hint: `by ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`,
                },
                {
                    label: 'Biggest category',
                    value: topCat ? topCat[0] : '-',
                    hint: topCat
                        ? `Rs. ${Math.round(topCat[1]).toLocaleString('en-IN')} · ${Math.round((topCat[1] / (summary.total || 1)) * 100)}%`
                        : 'No expenses',
                },
                {
                    label: 'Biggest day',
                    value: hasBest ? `Rs. ${Math.round(best!.value).toLocaleString('en-IN')}` : '-',
                    hint: hasBest ? fmtDayMonth(best!.ts, true) : 'No expenses',
                },
            ];
            const valBase = [20, 15, 15, 15];
            const measureKpi = (scale: number) =>
                cardsData.map((c, i) => {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(valBase[i] * scale);
                    const vw = doc.getTextWidth(c.value);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9.5);
                    const lw = doc.getTextWidth(c.label);
                    doc.setFontSize(8.5);
                    const hw = doc.getTextWidth(c.hint);
                    return Math.max(vw, lw, hw) + kpiPad * 2;
                });
            const sumOf = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

            let vScale = 1;
            let need = measureKpi(vScale);
            while (sumOf(need) > contentW && vScale > 0.55) {
                vScale -= 0.03;
                need = measureKpi(vScale);
            }
            const needTotal = sumOf(need);
            const spare = needTotal < contentW ? (contentW - needTotal) / cardsData.length : 0;
            const colWs = need.map((w) => (needTotal > contentW ? (w * contentW) / needTotal : w + spare));
            const colXs: number[] = [];
            let accX = M;
            colWs.forEach((w) => {
                colXs.push(accX);
                accX += w;
            });

            doc.setFillColor(255, 255, 255);
            doc.roundedRect(M, cardY, contentW, cardH, PDF_RADIUS, PDF_RADIUS, 'F');
            doc.setFillColor(238, 243, 255);
            doc.roundedRect(M, cardY, colWs[0], cardH, PDF_RADIUS, PDF_RADIUS, 'F');
            doc.rect(M + colWs[0] - 2, cardY, 2, cardH, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.roundedRect(M, cardY, contentW, cardH, PDF_RADIUS, PDF_RADIUS, 'S');
            for (let i = 1; i < cardsData.length; i++) {
                doc.line(colXs[i], cardY, colXs[i], cardY + cardH);
            }

            cardsData.forEach((c, i) => {
                const cx = colXs[i] + kpiPad;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9.5);
                doc.setTextColor(100, 110, 135);
                doc.text(c.label, cx, cardY + 9);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(valBase[i] * vScale);
                if (i === 0) doc.setTextColor(29, 78, 216);
                else doc.setTextColor(17, 24, 39);
                doc.text(c.value, cx, cardY + 20);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(120, 128, 150);
                doc.text(c.hint, cx, cardY + 27);
            });

            // ---------- 3. EXPENSES BY DAY (LINE CHART) ----------
            const chartY = 90;
            const chartH = 66;
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.roundedRect(M, chartY, contentW, chartH, PDF_RADIUS, PDF_RADIUS, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(17, 24, 39);
            doc.text('Expenses by day', M + 6, chartY + 10);

            if (hasBest) {
                const bestLabel = fmtDayMonth(best!.ts, true);
                const t3 = ` with Rs. ${Math.round(best!.value).toLocaleString('en-IN')}`;
                const ty = chartY + 10;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                const w1 = doc.getTextWidth('Biggest day ');
                const w3 = doc.getTextWidth(t3);
                doc.setFont('helvetica', 'bold');
                const w2 = doc.getTextWidth(bestLabel);
                let bx = brandRight - 6 - w1 - w2 - w3;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(107, 114, 128);
                doc.text('Biggest day ', bx, ty);
                bx += w1;
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(17, 24, 39);
                doc.text(bestLabel, bx, ty);
                bx += w2;
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(107, 114, 128);
                doc.text(t3, bx, ty);
            } else {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(107, 114, 128);
                doc.text('No expenses in this period', brandRight - 6, chartY + 10, { align: 'right' });
            }

            const plotL = M + 20;
            const plotR = brandRight - 8;
            const plotT = chartY + 22;
            const plotB = chartY + chartH - 14;
            const plotW = plotR - plotL;
            const plotH = plotB - plotT;
            const nDays = days.length;
            const maxVal = Math.max(...days.map((d) => d.value), 1);
            const yMax = niceMax(maxVal);
            const px = (i: number) => (nDays > 1 ? plotL + (plotW * i) / (nDays - 1) : plotL + plotW / 2);
            const py = (v: number) => plotB - (Math.max(v, 0) / yMax) * plotH;

            // gridlines + Y labels
            for (let g = 0; g <= 4; g++) {
                const gy = plotB - (plotH * g) / 4;
                doc.setDrawColor(g === 0 ? 203 : 232, g === 0 ? 213 : 236, g === 0 ? 225 : 244);
                doc.setLineWidth(g === 0 ? 0.3 : 0.2);
                doc.line(plotL, gy, plotR, gy);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(130, 138, 155);
                doc.text(fmtCompact((yMax * g) / 4), plotL - 2.5, gy + 1, { align: 'right' });
            }

            const pts = days.map((d, i) => ({ x: px(i), y: py(d.value) }));

            if (pts.length > 1) {
                const rel: number[][] = [];
                for (let i = 1; i < pts.length; i++) {
                    rel.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]);
                }

                // area fill
                const areaRel = [
                    ...rel,
                    [0, plotB - pts[pts.length - 1].y],
                    [pts[0].x - pts[pts.length - 1].x, 0],
                ];
                doc.setFillColor(222, 233, 254);
                doc.lines(areaRel, pts[0].x, pts[0].y, [1, 1], 'F', true);

                // line
                doc.setDrawColor(37, 99, 235);
                doc.setLineWidth(0.5);
                doc.setLineJoin('round');
                doc.lines(rel, pts[0].x, pts[0].y, [1, 1], 'S', false);
                doc.setLineJoin('miter');
            }

            // dots
            const bestIdx = hasBest ? days.findIndex((d) => d.ts === best!.ts) : -1;
            days.forEach((d, i) => {
                if (d.value <= 0 || i === bestIdx) return;
                if (nDays <= 45) {
                    doc.setFillColor(37, 99, 235);
                    doc.circle(pts[i].x, pts[i].y, 0.8, 'F');
                }
            });
            if (bestIdx >= 0) {
                doc.setFillColor(255, 255, 255);
                doc.circle(pts[bestIdx].x, pts[bestIdx].y, 1.7, 'F');
                doc.setFillColor(37, 99, 235);
                doc.circle(pts[bestIdx].x, pts[bestIdx].y, 1.2, 'F');

                const bl = Math.round(best!.value).toLocaleString('en-IN');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(17, 24, 39);
                const blw = doc.getTextWidth(bl);
                const bpx = pts[bestIdx].x;
                let blAlign: 'left' | 'center' | 'right' = 'center';
                let blX = bpx;
                if (bpx + blw / 2 > plotR + 6) {
                    blAlign = 'right';
                    blX = bpx + 2;
                } else if (bpx - blw / 2 < plotL) {
                    blAlign = 'left';
                    blX = bpx - 2;
                }
                doc.text(bl, blX, pts[bestIdx].y - 3, { align: blAlign });
            }

            // X axis ticks (max 7, evenly spaced)
            const tickCount = Math.min(nDays, 7);
            const xLabel = (ts: number) => (nDays > 330 ? fmtDay(ts) : fmtDayMonth(ts));
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(107, 114, 128);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.3);
            for (let t = 0; t < tickCount; t++) {
                const idx = tickCount === 1 ? 0 : Math.round((t * (nDays - 1)) / (tickCount - 1));
                const x = px(idx);
                doc.line(x, plotB, x, plotB + 1.2);
                const tAlign: 'left' | 'center' | 'right' =
                    tickCount === 1 ? 'center' : t === 0 ? 'left' : t === tickCount - 1 ? 'right' : 'center';
                const tx = tAlign === 'left' ? plotL : tAlign === 'right' ? plotR : x;
                doc.text(xLabel(days[idx].ts), tx, plotB + 6, { align: tAlign });
            }

            // ---------- 4. EXPENSES TABLE (date-wise groups) ----------
            const listY = chartY + chartH + 14;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(17, 24, 39);
            doc.text('Expenses', M, listY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10.5);
            doc.setTextColor(107, 114, 128);
            doc.text(`${filtered.length} ${entryWord(filtered.length)}`, brandRight, listY, { align: 'right' });

            const groupMap = new Map<string, { ts: number; items: ExpenseRow[] }>();
            filtered.forEach((e) => {
                const key = dayKey(e.date);
                if (!groupMap.has(key)) groupMap.set(key, { ts: e.date, items: [] });
                groupMap.get(key)!.items.push(e);
            });
            const groups = Array.from(groupMap.values()).sort((a, b) => b.ts - a.ts);

            const groupFill: RGB = [243, 246, 254];
            const tableBody: any[] = [];

            groups.forEach((g) => {
                const gTotal = g.items.reduce((n, e) => n + e.amount, 0);

                tableBody.push([
                    { content: fmtDay(g.ts, true), styles: { fontStyle: 'bold', fillColor: groupFill } },
                    {
                        content: `${g.items.length} ${entryWord(g.items.length)}`,
                        styles: { fontStyle: 'normal', fontSize: 9.5, textColor: [107, 114, 128] as RGB, fillColor: groupFill },
                    },
                    { content: '', styles: { fillColor: groupFill } },
                    { content: fmt2(gTotal), styles: { halign: 'right', fontStyle: 'bold', fillColor: groupFill } },
                ]);

                g.items.forEach((e) => {
                    tableBody.push([
                        { content: e.title || 'N/A', styles: { fontStyle: 'bold' } },
                        { content: categoryOf(e) },
                        {
                            content: e.addedBy || '—',
                            styles: { textColor: e.addedBy ? ([17, 24, 39] as RGB) : ([156, 163, 175] as RGB) },
                        },
                        {
                            content: fmt2(e.amount),
                            styles: {
                                halign: 'right',
                                textColor: e.amount < 0 ? ([220, 38, 38] as RGB) : ([17, 24, 39] as RGB),
                            },
                        },
                    ]);
                });
            });

            // Title/Date | Category | Added by | Amount  (total = contentW = 182mm)
            const COLW = [62, 40, 38, 42];

            autoTable(doc, {
                startY: listY + 4,
                margin: { top: 26, bottom: 22, left: M, right: M },
                head: [['Title', 'Category', 'Added by', 'Amount (Rs.)']],
                body: tableBody,
                foot: [
                    [
                        { content: 'Total', styles: { fontStyle: 'bold' } },
                        {
                            content: `${summary.count} ${entryWord(summary.count)}`,
                            styles: { fontStyle: 'normal', fontSize: 9.5, textColor: [107, 114, 128] as RGB },
                        },
                        { content: '' },
                        { content: `Rs. ${fmt2(summary.total)}`, styles: { halign: 'right', fontStyle: 'bold' } },
                    ],
                ],
                showFoot: 'lastPage',
                theme: 'plain',
                styles: {
                    font: 'helvetica',
                    fontSize: 10.5,
                    cellPadding: { top: 3.4, bottom: 3.4, left: PAD, right: PAD },
                    textColor: [17, 24, 39],
                    lineWidth: 0,
                },
                headStyles: {
                    fillColor: [248, 250, 252],
                    textColor: [100, 110, 135],
                    fontStyle: 'bold',
                    fontSize: 9.5,
                },
                footStyles: {
                    fillColor: [248, 250, 252],
                    textColor: [17, 24, 39],
                    fontStyle: 'bold',
                    fontSize: 11,
                },
                columnStyles: {
                    0: { cellWidth: COLW[0] },
                    1: { cellWidth: COLW[1] },
                    2: { cellWidth: COLW[2] },
                    3: { cellWidth: COLW[3], halign: 'right' },
                },
                didParseCell: (data) => {
                    data.cell.styles.valign = 'middle';

                    // Header and Total row amount column right-aligned (matches body)
                    if (data.section !== 'body' && data.column.index === 3) {
                        data.cell.styles.halign = 'right';
                    }

                    // Very long total -> shrink font so it doesn't wrap
                    if (data.section === 'foot' && data.column.index === 3) {
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(11);
                        const w = doc.getTextWidth(data.cell.text.join(' '));
                        const avail = COLW[3] - PAD * 2;
                        if (w > avail) {
                            data.cell.styles.fontSize = (11 * avail) / w;
                        }
                    }
                },
                didDrawCell: (data) => {
                    const { x, y, width, height } = data.cell;

                    // Vertical column lines (grid)
                    doc.setDrawColor(226, 232, 240);
                    doc.setLineWidth(0.2);
                    doc.line(x + width, y, x + width, y + height);
                    if (data.column.index === 0) {
                        doc.line(x, y, x, y + height);
                    }

                    // Horizontal lines
                    if (data.section === 'head') {
                        doc.setDrawColor(37, 99, 235);
                        doc.setLineWidth(0.5);
                        doc.line(x, y + height, x + width, y + height);
                    }
                    if (data.section === 'body') {
                        doc.setDrawColor(226, 232, 240);
                        doc.setLineWidth(0.2);
                        doc.line(x, y + height, x + width, y + height);
                    }
                    if (data.section === 'foot') {
                        doc.setDrawColor(17, 24, 39);
                        doc.setLineWidth(0.5);
                        doc.line(x, y, x + width, y);
                        doc.line(x, y + height, x + width, y + height);
                    }
                },
            });

            // ---------- 5. PAGE 2+ MINI HEADER + FOOTER (every page) ----------
            const totalPages = doc.getNumberOfPages();

            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);

                if (i > 1) {
                    drawCompanyTile(M, 9, 9, false);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(10);
                    doc.setTextColor(17, 24, 39);
                    doc.text(company, M + 12, 15.4);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9);
                    doc.setTextColor(107, 114, 128);
                    doc.text(`Expense Report | ${periodText}`, brandRight, 15.4, { align: 'right' });
                }

                const fy = pageHeight - 12;
                let x = M;
                if (sellarImg) {
                    try {
                        const lp = doc.getImageProperties(sellarImg);
                        const lh = 5;
                        const lw = (lp.width / lp.height) * lh;
                        doc.addImage(sellarImg, 'PNG', x, fy - 3.8, lw, lh);
                        x += lw + 2;
                    } catch {
                        // continue without footer logo
                    }
                }

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(0, 0, 0);
                doc.text('SELLAR', x, fy, { charSpace: 0.3 });
                x += doc.getTextWidth('SELLAR') + 5 * 0.3 + 4;

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.5);
                doc.setTextColor(107, 114, 128);
                doc.text(generatedAtText, x, fy);

                doc.text(`${company} | Expense Report | Page ${i} of ${totalPages}`, brandRight, fy, {
                    align: 'right',
                });
            }

            doc.save(`Expense_Report_${startDate}_to_${endDate}.pdf`);
        } catch (err) {
            console.error(err);
            setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate PDF.' });
        }
    };

    // ---- Excel ----
    const downloadAsExcel = () => {
        if (!appliedFilters) return;
        try {
            const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
                font: { name: 'Arial', ...font }, fill: fill ?? {},
                alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true }, border: border ?? {},
            });
            const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
            const allBorders = { top: { style: 'thin', color: { rgb: 'CBD5E1' } }, bottom: { style: 'thin', color: { rgb: 'CBD5E1' } }, left: { style: 'thin', color: { rgb: 'CBD5E1' } }, right: { style: 'thin', color: { rgb: 'CBD5E1' } } };
            const bblr = { bottom: { style: 'thin', color: { rgb: 'CBD5E1' } }, left: { style: 'thin', color: { rgb: 'CBD5E1' } }, right: { style: 'thin', color: { rgb: 'CBD5E1' } } };

            const COLS = [
                { header: '#', width: 6 },
                { header: 'Date', width: 16 },
                { header: 'Title', width: 20 },
                { header: 'Category', width: 18 },
                { header: 'Description', width: 30 },
                { header: 'Paid From', width: 12 },
                { header: 'Amount (₹)', width: 16 },
                { header: 'Added By', width: 18 },
            ];
            const AMOUNT_COL = 6;
            const colCount = COLS.length;
            const dataStartRow = 7;
            const totalRows = dataStartRow + filtered.length + 1;
            const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

            aoa[0][0] = companyName
                ? `Expense Report  —  ${companyName}`
                : 'Expense Report';
            aoa[1][0] = `Generated: ${formatDate(Date.now())}   |   Period: ${formatDate(appliedFilters.start)} → ${formatDate(appliedFilters.end)}`;
            aoa[3][0] = 'SUMMARY';
            aoa[4][0] = `Total Expenses: ₹${summary.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}   |   Entries: ${summary.count}`;
            COLS.forEach((c, i) => { aoa[6][i] = c.header; });
            filtered.forEach((exp, idx) => {
                const r = dataStartRow + idx;
                aoa[r] = [idx + 1, formatDate(exp.date), exp.title, categoryOf(exp), exp.description, exp.paidFrom || '—', exp.amount, exp.addedBy || '—'];
            });
            const footerRow = dataStartRow + filtered.length;
            aoa[footerRow] = ['TOTAL', '', '', '', '', '', summary.total, ''];

            const ws: any = XLSX.utils.aoa_to_sheet(aoa);
            ws['!cols'] = COLS.map(c => ({ wch: c.width }));
            ws['!rows'] = [{ hpt: 36 }, { hpt: 20 }, { hpt: 8 }, { hpt: 18 }, { hpt: 22 }, { hpt: 8 }, { hpt: 28 }, ...filtered.map(() => ({ hpt: 20 })), { hpt: 24 }];
            ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } }, { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } }, { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } }];

            const styleCell = (addr: string, st: any) => { if (!ws[addr]) ws[addr] = { t: 's', v: '' }; ws[addr].s = st; };
            styleCell('A1', s({ sz: 16, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('2563EB'), { horizontal: 'center', vertical: 'center' }));
            styleCell('A2', s({ sz: 9, italic: true, color: { rgb: '475569' } }, solidFill('DBEAFE'), { horizontal: 'center', vertical: 'center' }));
            styleCell('A4', s({ sz: 10, bold: true, color: { rgb: '1D4ED8' } }, solidFill('EFF6FF'), { horizontal: 'left', vertical: 'center' }, allBorders));
            styleCell('A5', s({ sz: 10, bold: true, color: { rgb: '166534' } }, solidFill('DCFCE7'), { horizontal: 'center', vertical: 'center' }, bblr));
            COLS.forEach((_, i) => {
                const addr = XLSX.utils.encode_cell({ r: 6, c: i });
                styleCell(addr, s({ sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('1E40AF'), { horizontal: i === AMOUNT_COL ? 'center' : 'left', vertical: 'center' }, allBorders));
            });
            filtered.forEach((_, idx) => {
                const r = dataStartRow + idx;
                const isAlt = idx % 2 === 1;
                for (let ci = 0; ci < colCount; ci++) {
                    const addr = XLSX.utils.encode_cell({ r, c: ci });
                    styleCell(addr, s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(isAlt ? 'F8FAFC' : 'FFFFFF'), { horizontal: ci === AMOUNT_COL ? 'center' : 'left', vertical: 'center' }, bblr));
                    if (ci === AMOUNT_COL && ws[addr]) { ws[addr].t = 'n'; ws[addr].z = '₹#,##0.00'; }
                }
            });
            for (let ci = 0; ci < colCount; ci++) {
                const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
                styleCell(addr, s({ sz: 10, bold: true, color: { rgb: '1E293B' } }, solidFill('E2E8F0'), { horizontal: ci === AMOUNT_COL ? 'center' : 'left', vertical: 'center' }, { top: { style: 'medium', color: { rgb: '1E293B' } }, bottom: { style: 'medium', color: { rgb: '1E293B' } }, left: { style: 'thin', color: { rgb: 'CBD5E1' } }, right: { style: 'thin', color: { rgb: 'CBD5E1' } } }));
                if (ci === AMOUNT_COL && ws[addr]) { ws[addr].t = 'n'; ws[addr].z = '₹#,##0.00'; }
            }

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Expense Report');
            XLSX.writeFile(wb, `Expense_Report_${startDate}_to_${endDate}.xlsx`);
            setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'Excel downloaded successfully!' });
        } catch {
            setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate Excel.' });
        }
    };

    /* ---------- DOWNLOAD / SHARE ---------- */
    const runDownload = (action: () => void) => {
        if (filtered.length === 0) {
            setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No data available to download.' });
            return;
        }
        action();
    };

    /* ---------- RENDER HELPERS ---------- */
    const renderSortHeader = (label: string, sortKey: keyof ExpenseRow, align: 'left' | 'right' = 'left') => {
        const isActive = sortConfig.key === sortKey;
        const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
        return (
            <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
                <button
                    onClick={() => handleSort(sortKey)}
                    className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-blue-800 ${align === 'right' ? 'flex-row-reverse' : ''}`}
                >
                    {label}
                    <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
                </button>
            </th>
        );
    };

    const renderCategoryBadge = (e: ExpenseRow) => {
        const cat = categoryOf(e);
        return (
            <span className={`inline-block whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${categoryColor(cat).badge}`}>
                {cat}
            </span>
        );
    };

    const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

    if (isLoading || authLoading)
        return (
            <div className="flex min-h-[60vh] items-center justify-center bg-canvas text-sm text-slate-500">
                Loading expenses...
            </div>
        );
    if (loadError) return <div className="p-4 text-center text-red-500">{loadError}</div>;

    const rangeLabel = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : '';
    const rangeLabelShort = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end, false) : '';

    const statCards = [
        {
            label: 'Total expenses',
            shortLabel: 'Total expenses',
            value: `₹${Math.round(totals.total).toLocaleString('en-IN')}`,
            hint: plural(totals.count, 'entry', 'entries'),
            icon: Wallet,
            iconClass: 'bg-red-50 text-red-600',
            valueClass: 'text-blue-600',
        },
        {
            label: 'Entries',
            shortLabel: 'Entries',
            value: totals.count.toString(),
            hint: `by ${plural(totals.people, 'person', 'people')}`,
            icon: FileText,
            iconClass: 'bg-blue-50 text-blue-600',
            valueClass: 'text-slate-900',
        },
        {
            label: 'Biggest category',
            shortLabel: 'Biggest',
            value: totals.biggest?.name ?? '—',
            hint: totals.biggest
                ? `${formatCurrency(totals.biggest.amount)} · ${Math.round((totals.biggest.amount / (totals.total || 1)) * 100)}%`
                : 'No expenses',
            icon: Tag,
            iconClass: 'bg-orange-50 text-orange-600',
            valueClass: 'text-slate-900',
        },
        {
            label: 'Share of sales',
            shortLabel: 'Share of sales',
            value: totals.share === null ? '—' : `${totals.share.toFixed(1)}%`,
            hint: `of ${formatCurrency(Math.round(totals.salesTotal))} sales`,
            icon: PieChart,
            iconClass: 'bg-blue-50 text-blue-600',
            valueClass: 'text-slate-900',
        },
    ];

    // Old-range data stays on screen while a new range loads; dim it meanwhile.
    const fetchingClass = isFetching ? 'pointer-events-none opacity-50' : '';

    const chipClass = (active: boolean) =>
        `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${active
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
        }`;

    const categoryCard = (
        <div className="h-full rounded-sm border border-line bg-white shadow-card p-4">
            <h3 className="text-sm font-semibold text-slate-900">By category</h3>
            {totals.categories.length === 0 ? (
                <p className="mt-4 text-xs text-slate-500">No expenses in this period.</p>
            ) : (
                <ul className="mt-4 space-y-3">
                    {totals.categories.slice(0, 5).map(c => (
                        <li key={c.name}>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-700">
                                    {c.name}
                                    <span className="hidden md:inline"> · {c.count}</span>
                                </span>
                                <span className="font-semibold text-slate-900">{formatCurrency(c.amount)}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-sm bg-slate-100">
                                <div
                                    className={`h-full rounded-sm ${categoryColor(c.name).bar}`}
                                    style={{ width: `${(c.amount / (totals.total || 1)) * 100}%` }}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {totals.categories.length > 5 && (
                <p className="mt-3 text-xs text-slate-500">+ {totals.categories.length - 5} more categories</p>
            )}
            {totals.categories.length === 1 && (
                <p className="mt-3 hidden text-xs text-slate-500 md:block">
                    {totals.categories[0].name === UNCATEGORISED
                        ? 'Pick a category when adding an expense to see where the money goes.'
                        : 'Rent, salary and other categories appear here as you add them.'}
                </p>
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-canvas px-3 pb-4 pt-3 md:px-6 md:pb-8 md:pt-5">
            {feedbackModal.isOpen && (
                <Modal type={feedbackModal.type} message={feedbackModal.message}
                    onClose={() => setFeedbackModal(p => ({ ...p, isOpen: false }))} showConfirmButton={false} />
            )}
            <ExpenseModal
                isOpen={isFormOpen}
                onClose={() => { setIsFormOpen(false); setEditing(null); }}
                onSave={handleSaveExpense}
                currentUserName={currentUser?.name || 'Unknown'}
                initialValues={editingValues}
            />

            {/* Delete confirm */}
            {deleteConfirm && (
                <Modal type={State.WARNING} message={`Delete "${deleteConfirm.title}" (${formatCurrency(deleteConfirm.amount)})?`}
                    onClose={() => setDeleteConfirm(null)}
                    showConfirmButton={true}
                    onConfirm={confirmDelete}
                />
            )}

            {/* HEADER */}
            <header className="mb-4 flex items-center gap-2 md:gap-3">
                <div className="flex-shrink-0">
                    <BackButton />
                </div>

                <div className="min-w-0 flex-1">
                    <p className="hidden text-xs text-slate-500 md:block">Reports /</p>
                    <div className="flex items-baseline gap-3">
                        <h1 className="text-lg font-bold text-slate-900 md:text-xl">Expense report</h1>
                        <span className="hidden text-xs text-slate-500 md:inline">
                            {plural(totals.count, 'entry', 'entries')} · {rangeLabelShort}
                        </span>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                        <span className="truncate md:hidden">{rangeLabel} ·</span>
                        <button
                            onClick={refreshAll}
                            disabled={isFetching}
                            title="Fetch the latest expenses"
                            className="inline-flex shrink-0 items-center gap-1 rounded-sm transition hover:text-slate-800 disabled:cursor-default"
                        >
                            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
                            {isFetching ? 'Updating…' : updatedLabel}
                        </button>
                    </div>
                </div>

                {/* Desktop actions */}
                <button
                    onClick={openAdd}
                    className="hidden shrink-0 items-center gap-1.5 rounded-sm bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 md:inline-flex"
                >
                    <Plus size={15} />
                    Add expense
                </button>
                <div className="relative hidden w-72 md:block">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search title, category or person"
                        className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-600"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Mobile actions */}
                <div className="flex items-center md:hidden">
                    <button
                        onClick={() => setShowSearch((s) => !s)}
                        aria-label="Search"
                        className="rounded-sm p-2 text-slate-700 transition hover:bg-slate-200"
                    >
                        <Search size={20} />
                    </button>
                    <DownloadMenu
                        variant="icon"
                        onExcel={() => runDownload(downloadAsExcel)}
                        onPdf={() => runDownload(downloadAsPdf)}
                    />
                </div>
            </header>

            {showSearch && (
                <div className="relative mb-3 md:hidden">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search title, category or person"
                        autoFocus
                        className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <button
                        onClick={() => { setSearchQuery(''); setShowSearch(false); }}
                        aria-label="Close search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-slate-400 hover:text-slate-600"
                    >
                        <X size={15} />
                    </button>
                </div>
            )}

            {/* DATE FILTERS */}
            <div className="relative mb-4 flex items-center gap-3">
                <div className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {DATE_PRESETS.map((p) => (
                        <button key={p.value} onClick={() => handleDatePresetChange(p.value)} className={chipClass(datePreset === p.value)}>
                            <span className="md:hidden">{p.shortLabel}</span>
                            <span className="hidden md:inline">{p.label}</span>
                        </button>
                    ))}
                    <button onClick={() => setIsRangeOpen((o) => !o)} className={`md:hidden ${chipClass(datePreset === 'custom')}`}>
                        Custom
                    </button>
                </div>

                <button
                    onClick={() => setIsRangeOpen((o) => !o)}
                    className={`hidden shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 md:inline-flex ${datePreset === 'custom' ? 'border-slate-900' : 'border-slate-300'}`}
                >
                    <CalendarDays size={15} className="text-slate-500" />
                    {rangeLabel}
                    <ChevronDown size={15} className="text-slate-500" />
                </button>

                {isRangeOpen && (
                    <div className="absolute right-0 top-full z-30 mt-2 w-full md:w-80">
                        <CustomRangePanel
                            initialStart={startDate}
                            initialEnd={endDate}
                            onApply={handleApplyCustomRange}
                            onCancel={() => setIsRangeOpen(false)}
                        />
                    </div>
                )}
            </div>

            <div className={`transition-opacity ${fetchingClass}`}>
                {/* SUMMARY — 2 cols on mobile, 4 cols on md+ */}
                <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
                    {statCards.map(({ label, shortLabel, value, hint, icon: Icon, iconClass, valueClass }) => (
                        <div key={label} className="min-w-0 rounded-sm border border-line bg-white shadow-card p-3 md:p-4">
                            <div className="flex items-center gap-2">
                                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}>
                                    <Icon size={14} />
                                </span>
                                <span className="truncate text-xs font-medium text-slate-700 md:text-sm">
                                    <span className="md:hidden">{shortLabel}</span>
                                    <span className="hidden md:inline">{label}</span>
                                </span>
                            </div>
                            <p title={value} className={`mt-2 truncate text-xl font-bold md:text-2xl ${valueClass}`}>{value}</p>
                            <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
                        </div>
                    ))}
                </div>

                {/* CHARTS */}
                <div className="mb-4 grid gap-4 md:grid-cols-5">
                    <div className="hidden md:col-span-3 md:block">
                        {appliedFilters && (
                            <ReportByDayChart
                                records={expensesByDay}
                                start={appliedFilters.start}
                                end={appliedFilters.end}
                                noun="Expenses"
                                bestPrefix="Biggest"
                            />
                        )}
                    </div>
                    <div className="md:col-span-2">{categoryCard}</div>
                </div>

                {/* REPORT DETAILS */}
                {/* No overflow-hidden here: it would clip the Download menu when the list is short. */}
                <section className="rounded-sm border border-line bg-white shadow-card">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-slate-900">
                                <span className="md:hidden">Entries</span>
                                <span className="hidden md:inline">Report details</span>
                            </h2>
                            <span className="hidden rounded-sm bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 md:inline">
                                {plural(filtered.length, 'entry', 'entries')}
                            </span>
                        </div>

                        <div className="hidden items-center gap-2 md:flex">
                            <div className="relative">
                                <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    className="appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-blue-500"
                                >
                                    <option value="all">All categories</option>
                                    {totals.categories.map(c => (
                                        <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            </div>
                            <button
                                onClick={() => setIsListVisible(v => !v)}
                                className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                            >
                                {isListVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                                {isListVisible ? 'Hide list' : 'Show list'}
                            </button>
                            <DownloadMenu
                                onExcel={() => runDownload(downloadAsExcel)}
                                onPdf={() => runDownload(downloadAsPdf)}
                            />
                        </div>
                    </div>

                    {/* Desktop table */}
                    {isListVisible && (
                        <div className="hidden overflow-x-auto rounded-b-sm md:block">
                            <table className="w-full text-sm">
                                <thead className="bg-sunken text-[11px] text-blue-700/80">
                                    <tr>
                                        {renderSortHeader('Date', 'date')}
                                        {renderSortHeader('Title', 'title')}
                                        <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Category</th>
                                        <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Description</th>
                                        <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Paid from</th>
                                        {renderSortHeader('Added by', 'addedBy')}
                                        {renderSortHeader('Amount', 'amount', 'right')}
                                        <th className="w-20" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                                                No expenses in this period. Use Add expense to record rent, salary or other spending.
                                            </td>
                                        </tr>
                                    )}
                                    {filtered.map(exp => (
                                        <tr key={`${exp.source}-${exp.id}`} className="border-t border-line transition hover:bg-sunken">
                                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFullDate(exp.date)}</td>
                                            <td className="px-4 py-3 font-semibold text-slate-900">{exp.title}</td>
                                            <td className="px-4 py-3">{renderCategoryBadge(exp)}</td>
                                            <td className="max-w-[16rem] truncate px-4 py-3 text-slate-600" title={exp.description}>{exp.description}</td>
                                            <td className="px-4 py-3">
                                                {exp.paidFrom ? (
                                                    <span className="inline-block rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                                                        {exp.paidFrom}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {exp.addedBy ? (
                                                    <span className="inline-flex items-center gap-2 text-slate-700">
                                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-semibold text-blue-700">
                                                            {initials(exp.addedBy)}
                                                        </span>
                                                        {exp.addedBy}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(exp.amount)}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        onClick={() => openEdit(exp)}
                                                        aria-label="Edit expense"
                                                        className="rounded-sm p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleteConfirm(exp)}
                                                        aria-label="Delete expense"
                                                        className="rounded-sm p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-700"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {filtered.length > 0 && (
                                    <tfoot className="border-t border-line bg-sunken text-sm font-semibold text-slate-900">
                                        <tr>
                                            <td colSpan={6} className="px-4 py-3">Total · {plural(summary.count, 'entry', 'entries')}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(summary.total)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    )}

                    {/* Mobile list */}
                    <ul className="md:hidden">
                        {filtered.length === 0 && (
                            <li className="border-t border-line px-4 py-10 text-center text-sm text-slate-500">
                                No expenses in this period. Use Add expense to record rent, salary or other spending.
                            </li>
                        )}
                        {filtered.map(exp => {
                            const rowKey = `${exp.source}-${exp.id}`;
                            const color = categoryColor(categoryOf(exp));
                            return (
                                <li key={rowKey} className="flex items-center gap-3 border-t border-line px-4 py-3">
                                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm ${color.badge}`}>
                                        <Wallet size={18} />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm text-slate-900">
                                            <span className="font-semibold">{exp.title}</span>
                                            {exp.description && <span className="text-xs text-slate-500"> · {exp.description}</span>}
                                        </p>
                                        <p className="truncate text-xs text-slate-500">
                                            {[formatDayMonth(exp.date), exp.paidFrom, exp.addedBy].filter(Boolean).join(' · ')}
                                        </p>
                                    </div>
                                    <span className="shrink-0 text-sm font-semibold text-slate-900">{formatCurrency(exp.amount)}</span>
                                    <div className="relative shrink-0">
                                        <button
                                            onClick={() => setRowMenuId(id => (id === rowKey ? null : rowKey))}
                                            aria-label="More actions"
                                            className="rounded-sm p-1.5 text-slate-500 transition hover:bg-slate-100"
                                        >
                                            <MoreHorizontal size={18} />
                                        </button>
                                        {rowMenuId === rowKey && (
                                            <>
                                                <div className="fixed inset-0 z-20" onClick={() => setRowMenuId(null)} />
                                                <div className="absolute right-0 top-full z-30 mt-1 w-32 rounded-sm border border-line bg-white p-1 shadow-float">
                                                    <button
                                                        onClick={() => openEdit(exp)}
                                                        className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-sunken"
                                                    >
                                                        <Pencil size={14} /> Edit
                                                    </button>
                                                    <button
                                                        onClick={() => { setRowMenuId(null); setDeleteConfirm(exp); }}
                                                        className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                                    >
                                                        <Trash2 size={14} /> Delete
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                        {filtered.length > 0 && (
                            <li className="flex items-center justify-between rounded-b-sm border-t border-line bg-sunken px-4 py-3 text-sm font-semibold text-slate-900">
                                <span>Total · {plural(summary.count, 'entry', 'entries')}</span>
                                <span>{formatCurrency(summary.total)}</span>
                            </li>
                        )}
                    </ul>
                </section>
            </div>

            {/* Mobile: Add expense, pinned above the bottom navigation */}
            <div className="sticky bottom-3 z-10 mt-4 md:hidden">
                <button
                    onClick={openAdd}
                    className="flex w-full items-center justify-center gap-2 rounded-sm bg-blue-600 py-3.5 text-sm font-semibold text-white shadow-float transition active:bg-blue-700"
                >
                    <Plus size={18} />
                    Add expense
                </button>
            </div>
        </div>
    );
};

export default ExpenseReportPage;
