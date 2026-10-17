import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    CalendarDays,
    ChevronDown,
    ChevronLeft,
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
import {
    addExpenseDoc,
    deleteExpenseDoc,
    updateExpenseDoc,
    type ExpenseSource,
} from '../../Pages/Reports/ExpenseReport/useExpense';
import {
    UNCATEGORISED,
    categoryColor,
    categoryOf,
    loadCatalogueExpensesForRange,
    loadPosExpensesForRange,
    type ExpenseRecord,
} from '../../Pages/Reports/ExpenseReport/expenseRangeCache';
import { loadCatalogueSalesForRange } from './catalogueSalesCache';
import { useCachedRange } from '../../Pages/Reports/useCachedRange';
import {
    DATE_PRESETS,
    formatCurrency,
    formatDateForInput,
    formatDayMonth,
    formatFullDate,
    formatRangeLabel,
    getPresetRange,
    parseInputDate,
} from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import ReportByDayChart from '../../Pages/Reports/SalesReportComponents/ReportByDayChart';
import DownloadMenu from '../../Pages/Reports/SalesReportComponents/DownloadMenu';
import CustomRangePanel from '../../Pages/Reports/SalesReportComponents/CustomRangePanel';
import { ExpenseModal } from '../../Components/ExpenseModal';
import { State } from '../../enums';
import { Modal } from '../../constants/Modal';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
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

const CatalogueExpenseReportPage: React.FC = () => {
    const { currentUser, loading: authLoading } = useAuth();
    const companyId = currentUser?.companyId;
    const navigate = useNavigate();

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
    // Orders only feed "Share of sales"; shares the Orders report's cache.
    const salesState = useCachedRange(loadCatalogueSalesForRange, companyId, appliedFilters, authLoading);
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
            // New expenses from the Catalogue side are saved as 'catalogue'.
            await addExpenseDoc(companyId, 'catalogue', data);
            refreshSource('catalogue');
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
            const pw = doc.internal.pageSize.getWidth();
            const ph = doc.internal.pageSize.getHeight();
            doc.setFillColor(249, 115, 22); doc.rect(0, 0, pw, 6, 'F');
            doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(17, 24, 39);
            const reportTitle = companyName
                ? `Expense Report — ${companyName}`
                : 'Expense Report';
            doc.text(reportTitle, 14, 24);
            doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
            doc.text(`Generated: ${formatDate(Date.now())}   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`, 14, 31);
            // ===== GENERATION TAG (drawn first, reserves space for logo) =====
            const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);

            const textWidth = doc.getTextWidth(tagText);
            const paddingX = 2;
            const boxWidth = textWidth + paddingX * 2;
            const boxHeight = 5;

            const logoReservedWidth = 18; // space reserved for logo + gap, so tag never overlaps it
            const boxX = pw - 14 - logoReservedWidth - boxWidth;
            const boxY = 10;

            doc.setFillColor(245, 245, 245);
            doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');

            doc.setTextColor(80, 80, 80);
            doc.text(tagText, boxX + paddingX, boxY + 3.5);

            doc.setTextColor(0, 0, 0);

            // ===== LOGO (drawn after, in its own reserved slot at top-right corner) =====
            try {
                const base64Logo = await resolveCompanyLogoBase64(companyId);
                if (base64Logo) {
                    const img = new Image();
                    img.src = base64Logo;
                    await new Promise<void>((resolve) => {
                        img.onload = () => {
                            const logoWidth = 13;
                            const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
                            const logoX = pw - logoWidth - 14;
                            doc.addImage(base64Logo, 'PNG', logoX, 8, logoWidth, logoHeight);
                            resolve();
                        };
                        img.onerror = () => resolve();
                    });
                }
            } catch { /* continue without logo */ }

            autoTable(doc, {
                startY: 38,
                head: [['DATE', 'TITLE', 'CATEGORY', 'AMOUNT(Rs)', 'ADDED BY']],
                body: filtered.map(e => [formatDate(e.date), e.title, categoryOf(e), e.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), e.addedBy || '—']),
                foot: [['TOTAL', '', '', summary.total.toLocaleString('en-IN', { minimumFractionDigits: 2 }), '']],
                showFoot: 'lastPage',
                theme: 'plain',
                styles: { font: 'helvetica', cellPadding: 7, fontSize: 10, textColor: [55, 65, 81] },
                headStyles: { fillColor: [249, 250, 251], textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1, bottom: 1 }, lineColor: [229, 231, 235] },
                footStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1, bottom: 2 }, lineColor: [17, 24, 39] },
                alternateRowStyles: { fillColor: [252, 252, 252] },
                columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 34 }, 3: { halign: 'right', cellWidth: 32 }, 4: { cellWidth: 30 } },
                didDrawPage: () => {
                    doc.setFontSize(9); doc.setTextColor(156, 163, 175);
                    doc.text(`Page ${doc.getNumberOfPages()}`, pw - 14, ph - 10, { align: 'right' });
                },
            });
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
            const allBorders = { top: { style: 'thin', color: { rgb: 'FED7AA' } }, bottom: { style: 'thin', color: { rgb: 'FED7AA' } }, left: { style: 'thin', color: { rgb: 'FED7AA' } }, right: { style: 'thin', color: { rgb: 'FED7AA' } } };
            const bblr = { bottom: { style: 'thin', color: { rgb: 'FED7AA' } }, left: { style: 'thin', color: { rgb: 'FED7AA' } }, right: { style: 'thin', color: { rgb: 'FED7AA' } } };

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
            styleCell('A1', s({ sz: 16, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('EA580C'), { horizontal: 'center', vertical: 'center' }));
            styleCell('A2', s({ sz: 9, italic: true, color: { rgb: '7C2D12' } }, solidFill('FFEDD5'), { horizontal: 'center', vertical: 'center' }));
            styleCell('A4', s({ sz: 10, bold: true, color: { rgb: 'C2410C' } }, solidFill('FFF7ED'), { horizontal: 'left', vertical: 'center' }, allBorders));
            styleCell('A5', s({ sz: 10, bold: true, color: { rgb: '9A3412' } }, solidFill('FFF7ED'), { horizontal: 'center', vertical: 'center' }, bblr));
            COLS.forEach((_, i) => {
                const addr = XLSX.utils.encode_cell({ r: 6, c: i });
                styleCell(addr, s({ sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('C2410C'), { horizontal: i === AMOUNT_COL ? 'center' : 'left', vertical: 'center' }, allBorders));
            });
            filtered.forEach((_, idx) => {
                const r = dataStartRow + idx;
                const isAlt = idx % 2 === 1;
                for (let ci = 0; ci < colCount; ci++) {
                    const addr = XLSX.utils.encode_cell({ r, c: ci });
                    styleCell(addr, s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(isAlt ? 'FFF7ED' : 'FFFFFF'), { horizontal: ci === AMOUNT_COL ? 'center' : 'left', vertical: 'center' }, bblr));
                    if (ci === AMOUNT_COL && ws[addr]) { ws[addr].t = 'n'; ws[addr].z = '₹#,##0.00'; }
                }
            });
            for (let ci = 0; ci < colCount; ci++) {
                const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
                styleCell(addr, s({ sz: 10, bold: true, color: { rgb: '1E293B' } }, solidFill('FED7AA'), { horizontal: ci === AMOUNT_COL ? 'center' : 'left', vertical: 'center' }, { top: { style: 'medium', color: { rgb: '1E293B' } }, bottom: { style: 'medium', color: { rgb: '1E293B' } }, left: { style: 'thin', color: { rgb: 'FED7AA' } }, right: { style: 'thin', color: { rgb: 'FED7AA' } } }));
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

    const shareOnWhatsApp = () => {
        if (!appliedFilters) return;
        const text = [
            `*Expense Report${companyName ? ` — ${companyName}` : ''}*`,
            formatRangeLabel(appliedFilters.start, appliedFilters.end),
            '',
            `Total expenses: ${formatCurrency(Math.round(totals.total))}`,
            `Entries: ${totals.count}`,
            ...(totals.share !== null ? [`Share of sales: ${totals.share.toFixed(1)}%`] : []),
            ...(totals.categories.length
                ? ['', ...totals.categories.map(c => `${c.name}: ${formatCurrency(c.amount)}`)]
                : []),
        ].join('\n');
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    };

    /* ---------- RENDER HELPERS ---------- */
    const renderSortHeader = (label: string, sortKey: keyof ExpenseRow, align: 'left' | 'right' = 'left') => {
        const isActive = sortConfig.key === sortKey;
        const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
        return (
            <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
                <button
                    onClick={() => handleSort(sortKey)}
                    className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-orange-800 ${align === 'right' ? 'flex-row-reverse' : ''}`}
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
            <div className="flex min-h-[60vh] items-center justify-center bg-[#fff5ec] text-sm text-slate-500">
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
            valueClass: 'text-orange-800',
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
            iconClass: 'bg-orange-100 text-orange-800',
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
        <div className="h-full rounded-sm border border-[#f6e1d0] bg-white shadow-card p-4">
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
        <div className="min-h-screen bg-[#fff5ec] px-3 pb-20 pt-3 md:px-6 md:pb-8 md:pt-5">
            {feedbackModal.isOpen && (
                <Modal type={feedbackModal.type} message={feedbackModal.message}
                    onClose={() => setFeedbackModal(p => ({ ...p, isOpen: false }))} showConfirmButton={false} />
            )}
            <ExpenseModal
                isOpen={isFormOpen}
                onClose={() => { setIsFormOpen(false); setEditing(null); }}
                onSave={handleSaveExpense}
                theme="orange"
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
                <button
                    onClick={() => navigate(-1)}
                    aria-label="Back"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-slate-700 transition hover:bg-slate-200 md:border md:border-slate-300 md:bg-white"
                >
                    <ChevronLeft size={20} />
                </button>

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
                    className="hidden shrink-0 items-center gap-1.5 rounded-sm bg-orange-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-800 md:inline-flex"
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
                        className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
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
                        onWhatsApp={shareOnWhatsApp}
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
                        className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
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
                        <div key={label} className="min-w-0 rounded-sm border border-[#f6e1d0] bg-white shadow-card p-3 md:p-4">
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
                                barClass="bg-orange-500 group-hover:bg-orange-600"
                            />
                        )}
                    </div>
                    <div className="md:col-span-2">{categoryCard}</div>
                </div>

                {/* REPORT DETAILS */}
                {/* No overflow-hidden here: it would clip the Download menu when the list is short. */}
                <section className="rounded-sm border border-[#f6e1d0] bg-white shadow-card">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-slate-900">
                                <span className="md:hidden">Entries</span>
                                <span className="hidden md:inline">Report details</span>
                            </h2>
                            <span className="hidden rounded-sm bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 md:inline">
                                {plural(filtered.length, 'entry', 'entries')}
                            </span>
                        </div>

                        <div className="hidden items-center gap-2 md:flex">
                            <div className="relative">
                                <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    className="appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-orange-600"
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
                                onWhatsApp={shareOnWhatsApp}
                            />
                        </div>
                    </div>

                    {/* Desktop table */}
                    {isListVisible && (
                        <div className="hidden overflow-x-auto rounded-b-sm md:block">
                            <table className="w-full text-sm">
                                <thead className="bg-[#fff8f2] text-[11px] text-orange-800/80">
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
                                        <tr key={`${exp.source}-${exp.id}`} className="border-t border-[#f6e1d0] transition hover:bg-[#fff8f2]">
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
                                                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-semibold text-orange-800">
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
                                    <tfoot className="border-t border-[#f6e1d0] bg-[#fff8f2] text-sm font-semibold text-slate-900">
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
                            <li className="border-t border-[#f6e1d0] px-4 py-10 text-center text-sm text-slate-500">
                                No expenses in this period. Use Add expense to record rent, salary or other spending.
                            </li>
                        )}
                        {filtered.map(exp => {
                            const rowKey = `${exp.source}-${exp.id}`;
                            const color = categoryColor(categoryOf(exp));
                            return (
                                <li key={rowKey} className="flex items-center gap-3 border-t border-[#f6e1d0] px-4 py-3">
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
                                                <div className="absolute right-0 top-full z-30 mt-1 w-32 rounded-sm border border-[#f6e1d0] bg-white p-1 shadow-float">
                                                    <button
                                                        onClick={() => openEdit(exp)}
                                                        className="flex w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm text-slate-700 hover:bg-[#fff8f2]"
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
                            <li className="flex items-center justify-between rounded-b-sm border-t border-[#f6e1d0] bg-[#fff8f2] px-4 py-3 text-sm font-semibold text-slate-900">
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
                    className="flex w-full items-center justify-center gap-2 rounded-sm bg-orange-700 py-3.5 text-sm font-semibold text-white shadow-float transition active:bg-orange-800"
                >
                    <Plus size={18} />
                    Add expense
                </button>
            </div>
        </div>
    );
};

export default CatalogueExpenseReportPage;