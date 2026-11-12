import React, { useMemo, useState, useEffect } from 'react';
import {
    AlertTriangle,
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    CalendarDays,
    ChevronDown,
    ChevronRight,
    Eye,
    EyeOff,
    IndianRupee,
    LayoutGrid,
    Package,
    RefreshCw,
    Search,
    ShoppingCart,
    Tag,
    X,
} from 'lucide-react';
import {
    DATE_PRESETS,
    formatDate,
    formatDateForInput,
    formatDayMonth,
    formatRangeLabel,
    getPresetRange,
    parseInputDate,
} from './SalesReportComponents/salesReport.utils';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import BackButton from '../../Components/BackButton';
import useSalesReport from './SalesReportComponents/useSalesReport';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { State } from '../../enums';
import { Modal } from '../../constants/Modal';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import sellarLogo from '../../assets/sellar-logo.png';
import DownloadMenu from './SalesReportComponents/DownloadMenu';
import CustomRangePanel from './SalesReportComponents/CustomRangePanel';
import { totalStock } from './ItemReportComponents/itemIssues';
import { splitAddOns } from '../../UseComponents/addOnText';

export interface AggregatedItem {
    id: string;          // productId + add-on text (same item with different add-ons = separate rows)
    productId: string;
    name: string;        // base name (without add-ons)
    addOnText: string;   // '' when the line has no add-ons
    itemGroup: string;
    quantitySold: number;
    valueSold: number;
}

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
const UNSOLD_PAGE_SIZE = 50;

const inrRound = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

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

const drawGradientRect = (pdf: jsPDF, x: number, y: number, w: number, h: number, from: RGB, to: RGB) => {
    const steps = 120;
    const sw = w / steps;
    for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        pdf.setFillColor(
            Math.round(from[0] + (to[0] - from[0]) * t),
            Math.round(from[1] + (to[1] - from[1]) * t),
            Math.round(from[2] + (to[2] - from[2]) * t),
        );
        pdf.rect(x + i * sw, y, sw + 0.3, h, 'F');
    }
};

const fmtDay = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
};

const fmtDayMonth = (ts: number) => {
    const d = new Date(ts);
    return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
};

const fmt2 = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Helvetica can only draw Latin-1 text. Anything else (Hindi, Arabic, emoji, ₹) prints
// garbled with wrong widths, so overlaps the next column. Keep only what it can draw.
const PDF_OK = /[\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u2122]/;
const pdfSafe = (value: unknown): string =>
  Array.from(
    String(value ?? '')
      .replace(/₹/g, 'Rs.')
      .replace(/[\u2010\u2011\u2212]/g, '-')
      .replace(/[\r\t]/g, ' '),
  )
    .filter((ch) => ch === '\n' || PDF_OK.test(ch))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();

const ItemsSoldReport: React.FC = () => {

    const {
        setDatePreset,
        setCustomStartDate,
        setCustomEndDate,
        customStartDate,
        customEndDate,
        setAppliedFilters,
        appliedFilters,
        sales,
        isLoading,
        isFetching,
        lastUpdated,
        refresh,
        error,
        datePreset,
        authLoading,
    } = useSalesReport();

    /* ---------- LOCAL STATES ---------- */
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isListVisible, setIsListVisible] = useState(true);
    const [isRangeOpen, setIsRangeOpen] = useState(false);
    const [groupFilter, setGroupFilter] = useState('');
    const [showUnsold, setShowUnsold] = useState(false);
    const [unsoldVisible, setUnsoldVisible] = useState(UNSOLD_PAGE_SIZE);
    const [feedbackModal, setFeedbackModal] = useState({
        isOpen: false,
        type: State.INFO,
        message: '',
    });

    const { currentUser } = useAuth();
    const { items: catalogueItems, itemGroups: catalogueItemGroups } = useCatalogueData();
    // Bill lines and items carry their group by id or (after a rename) by name.
    const groupNameOf = useMemo(() => {
        const byKey: Record<string, string> = {};
        catalogueItemGroups.forEach((g) => {
            if (g.id) byKey[g.id] = g.name || 'Unknown Group';
            if (g.name) byKey[g.name] = g.name;
        });
        return (groupKey?: string, fallback?: string) =>
            (groupKey && byKey[groupKey]) || fallback || groupKey || UNASSIGNED_GROUP_NAME;
    }, [catalogueItemGroups]);
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

    const [sortConfig, setSortConfig] = useState<{
        key: keyof AggregatedItem;
        direction: 'asc' | 'desc';
    }>({ key: 'valueSold', direction: 'desc' });

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

    /* ---------- DATE PRESET ---------- */
    const handleDatePresetChange = (preset: string) => {
        const range = getPresetRange(preset);
        if (!range) return;
        setDatePreset(preset);
        setIsRangeOpen(false);
        setCustomStartDate(formatDateForInput(range.start));
        setCustomEndDate(formatDateForInput(range.end));
        setAppliedFilters({ start: range.start.getTime(), end: range.end.getTime() });
    };

    const handleApplyCustomRange = (startValue: string, endValue: string) => {
        const start = parseInputDate(startValue);
        start.setHours(0, 0, 0, 0);
        const end = parseInputDate(endValue);
        end.setHours(23, 59, 59, 999);
        setDatePreset('custom');
        setCustomStartDate(startValue);
        setCustomEndDate(endValue);
        setAppliedFilters({ start: start.getTime(), end: end.getTime() });
        setIsRangeOpen(false);
    };

    /* ---------- SORT ---------- */
    const handleSort = (key: keyof AggregatedItem) => {
        let direction: 'asc' | 'desc' = key === 'name' || key === 'itemGroup' ? 'asc' : 'desc';
        if (sortConfig.key === key) {
            direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        }
        setSortConfig({ key, direction });
    };

    /* ---------- AGGREGATE ITEMS & SUMMARY ---------- */
    const billsInRange = useMemo(
        () =>
            appliedFilters
                ? sales.filter((s) => s.createdAt >= appliedFilters.start && s.createdAt <= appliedFilters.end)
                : [],
        [appliedFilters, sales],
    );

    // Every item sold in the range (before group / search filters).
    const { soldItems, billLines, uncountedBills } = useMemo(() => {
        const itemMap = new Map<string, AggregatedItem>();
        let lines = 0;
        const uncounted: { date: number; total: number }[] = [];

        billsInRange.forEach((sale) => {
            let billValue = 0;
            sale.items.forEach((item: any) => {
                const productId = item.productId || item.id || 'unknown';
                const { baseName, addOnText } = splitAddOns(item);
                const id = `${productId}__${addOnText || ''}`;

                if (!itemMap.has(id)) {
                    itemMap.set(id, {
                        id,
                        productId,
                        name: baseName || item.name || 'Unknown Item',
                        addOnText: addOnText || '',
                        itemGroup: groupNameOf(item.itemGroupId, item.category),
                        quantitySold: 0,
                        valueSold: 0,
                    });
                }

                const existingItem = itemMap.get(id)!;
                const qty = item.quantity || 1;

                const pricePerItem = item.effectiveUnitPrice || item.customPrice || item.salesPrice || item.mrp || 0;
                const lineValue = pricePerItem * qty;

                existingItem.quantitySold += qty;
                existingItem.valueSold += lineValue;
                billValue += lineValue;
                lines += 1;
            });
            // A bill whose lines add up to nothing can't show here at all.
            if (billValue <= 0 && sale.totalAmount > 0) uncounted.push({ date: sale.createdAt, total: sale.totalAmount });
        });

        return { soldItems: Array.from(itemMap.values()), billLines: lines, uncountedBills: uncounted };
    }, [billsInRange, groupNameOf]);

    const groupOptions = useMemo(() => {
        const names = new Set<string>(catalogueItemGroups.map((g) => g.name).filter(Boolean));
        soldItems.forEach((i) => names.add(i.itemGroup));
        return [...names].sort((a, b) => a.localeCompare(b));
    }, [catalogueItemGroups, soldItems]);

    const { aggregatedItems, summary } = useMemo(() => {
        const searchTerm = searchQuery.trim().toLowerCase();
        const filtered = soldItems.filter(
            (item) =>
                (!groupFilter || item.itemGroup === groupFilter) &&
                (!searchTerm || `${item.name} ${item.addOnText}`.toLowerCase().includes(searchTerm)),
        );
        filtered.sort((a, b) => {
            const key = sortConfig.key;
            const direction = sortConfig.direction === 'asc' ? 1 : -1;

            const valA = a[key];
            const valB = b[key];

            if (typeof valA === 'string' && typeof valB === 'string') {
                return valA.localeCompare(valB) * direction;
            }
            if (typeof valA === 'number' && typeof valB === 'number') {
                return (valA - valB) * direction;
            }
            return 0;
        });

        return {
            aggregatedItems: filtered,
            summary: {
                totalValueSold: filtered.reduce((sum, item) => sum + item.valueSold, 0),
                totalQuantitySold: filtered.reduce((sum, item) => sum + item.quantitySold, 0),
                uniqueItemCount: filtered.length,
            },
        };
    }, [soldItems, groupFilter, searchQuery, sortConfig]);

    // Catalogue items (in the selected group) that sold nothing in the range.
    const { catalogueCount, unsoldItems, tiedUp } = useMemo(() => {
        const soldIds = new Set(soldItems.map((i) => i.productId));
        const inGroup = catalogueItems.filter(
            (item) => !groupFilter || groupNameOf(item.itemGroupId) === groupFilter,
        );
        const unsold = inGroup
            .filter((item) => !soldIds.has(item.id || ''))
            .map((item) => {
                const stock = totalStock(item);
                return {
                    id: item.id || item.name,
                    name: item.name,
                    group: groupNameOf(item.itemGroupId),
                    stock,
                    value: stock > 0 ? stock * (Number(item.purchasePrice) || 0) : 0,
                };
            })
            .sort((a, b) => b.value - a.value);
        return {
            catalogueCount: inGroup.length,
            unsoldItems: unsold,
            tiedUp: unsold.reduce((s, i) => s + i.value, 0),
        };
    }, [catalogueItems, soldItems, groupFilter, groupNameOf]);

    const topGroup = useMemo(() => {
        const byGroup = new Map<string, number>();
        aggregatedItems.forEach((i) => byGroup.set(i.itemGroup, (byGroup.get(i.itemGroup) || 0) + i.valueSold));
        const [name, value] = [...byGroup.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
        return { name, share: summary.totalValueSold > 0 ? (value / summary.totalValueSold) * 100 : 0 };
    }, [aggregatedItems, summary.totalValueSold]);

    /* ---------- PDF DOWNLOAD ---------- */
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
                        const company = pdfSafe(companyName) || 'Your Business';
            const itemWord = (n: number) => (n === 1 ? 'item' : 'items');

            const generatedAtText = `Generated ${new Date().toLocaleString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
            })}`;
            const sameYear =
                new Date(appliedFilters.start).getFullYear() === new Date(appliedFilters.end).getFullYear();
            const periodText = sameYear
                ? `${fmtDayMonth(appliedFilters.start)} – ${fmtDay(appliedFilters.end)}`
                : `${fmtDay(appliedFilters.start)} – ${fmtDay(appliedFilters.end)}`;
            const periodDays = Math.max(
                1,
                Math.round((appliedFilters.end - appliedFilters.start) / 86400000),
            );

            // ---------- ASSETS ----------
            const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId).catch(() => null);
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

            //const INK: RGB = [17, 24, 39];
            const GRAY: RGB = [107, 114, 128];

            // ---------- DATA (same aggregatedItems / summary as before) ----------
            const topList = [...aggregatedItems]
                .filter((i) => i.valueSold > 0)
                .sort((a, b) => b.valueSold - a.valueSold)
                .slice(0, 5);
            const topShare =
                summary.totalValueSold > 0
                    ? Math.round((topList.reduce((s, i) => s + i.valueSold, 0) / summary.totalValueSold) * 100)
                    : 0;
            const soldCount = catalogueCount - unsoldItems.length;
                        const topGroupSafe = pdfSafe(topGroup.name);
            const topGroupText = topGroupSafe
                ? topGroupSafe.length > 16
                    ? `${topGroupSafe.slice(0, 15)}...`
                    : topGroupSafe
                : '-';

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

            // ShoppingCart icon (lucide, 24x24 grid -> 7mm)
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
            doc.setDrawColor(37, 99, 235);
            doc.setLineWidth(0.5);
            doc.setLineCap('round');
            doc.setLineJoin('round');
            seg([[2, 2], [4, 2], [6.7, 14.4], [8, 16], [18.8, 16], [20.5, 14.4], [22.2, 7], [5.1, 7]]);
            doc.setFillColor(37, 99, 235);
            doc.circle(ix + 9 * k, iy + 20.5 * k, 0.6, 'F');
            doc.circle(ix + 19 * k, iy + 20.5 * k, 0.6, 'F');
            doc.setLineCap('butt');
            doc.setLineJoin('miter');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(26);
            doc.setTextColor(255, 255, 255);
            doc.text('Items Sold Report', 32, 38);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(190, 205, 255);
            doc.text('What sold, how many and for how much', 32, 44.5);

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
            doc.text(`${periodDays} ${periodDays === 1 ? 'day' : 'days'}`, brandRight, 45.5, { align: 'right' });

            // ---------- 2. SUMMARY CARDS (content-based widths) ----------
            const cardY = 50;
            const cardH = 32;
            const kpiPad = 6;

            const cardsData = [
                {
                    label: 'Value sold',
                    value: `Rs. ${Math.round(summary.totalValueSold).toLocaleString('en-IN')}`,
                    hint: `${summary.uniqueItemCount.toLocaleString('en-IN')} ${itemWord(summary.uniqueItemCount)}`,
                },
                {
                    label: 'Quantity sold',
                    value: `${summary.totalQuantitySold.toLocaleString('en-IN')} pcs`,
                    hint: `${billLines.toLocaleString('en-IN')} bill ${billLines === 1 ? 'line' : 'lines'}`,
                },
                {
                    label: 'Items that sold',
                    value: `${soldCount.toLocaleString('en-IN')} of ${catalogueCount.toLocaleString('en-IN')}`,
                    hint: `${unsoldItems.length.toLocaleString('en-IN')} didn't sell`,
                },
                {
                    label: 'Top group',
                    value: topGroupText,
                    hint: topGroup.name ? `${Math.round(topGroup.share)}% of value` : 'No sales',
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

            // ---------- 3. TOP ITEMS BY VALUE (BAR PANEL) ----------
            const chartY = 90;
            const chartH = 66;
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(226, 232, 240);
            doc.setLineWidth(0.3);
            doc.roundedRect(M, chartY, contentW, chartH, PDF_RADIUS, PDF_RADIUS, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(17, 24, 39);
            doc.text('Top items by value', M + 6, chartY + 10);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(107, 114, 128);
            doc.text(
                topList.length ? `Top ${topList.length} = ${topShare}% of value` : 'Nothing sold in this period',
                brandRight - 6,
                chartY + 10,
                { align: 'right' },
            );

            const barLabelW = 50;
            const barL = M + 6 + barLabelW + 2;
            const valueW = 40;
            const barR = brandRight - 6 - valueW;
            const barMaxW = barR - barL;
            const rowH = 8;
            const rowsTop = chartY + 18;
            const maxVal = topList.length ? topList[0].valueSold : 1;

            topList.forEach((it, i) => {
                const cy = rowsTop + i * rowH;

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(55, 65, 81);
                                const label = (doc.splitTextToSize(pdfSafe(it.name) || 'N/A', barLabelW) as string[])[0] || '';
                doc.text(label, M + 6, cy + 3.2);

                doc.setFillColor(238, 243, 255);
                doc.roundedRect(barL, cy + 0.8, barMaxW, 3, PDF_RADIUS, PDF_RADIUS, 'F');
                const fillW = Math.max((it.valueSold / maxVal) * barMaxW, 0.8);
                doc.setFillColor(37, 99, 235);
                doc.roundedRect(barL, cy + 0.8, fillW, 3, PDF_RADIUS, PDF_RADIUS, 'F');

                const pct =
                    summary.totalValueSold > 0 ? Math.round((it.valueSold / summary.totalValueSold) * 100) : 0;
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.5);
                doc.setTextColor(17, 24, 39);
                doc.text(
                    `Rs. ${Math.round(it.valueSold).toLocaleString('en-IN')} · ${pct}%`,
                    brandRight - 6,
                    cy + 3.2,
                    { align: 'right' },
                );
            });

            // ---------- 4. ITEMS SOLD TABLE ----------
            const listY = chartY + chartH + 14;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(14);
            doc.setTextColor(17, 24, 39);
            doc.text('Items sold', M, listY);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10.5);
            doc.setTextColor(107, 114, 128);
            doc.text(
                `${aggregatedItems.length.toLocaleString('en-IN')} ${itemWord(aggregatedItems.length)}`,
                brandRight,
                listY,
                { align: 'right' },
            );

            const tableBody: any[] = aggregatedItems.map((item) => {
                const share =
                    summary.totalValueSold > 0 ? Math.round((item.valueSold / summary.totalValueSold) * 100) : 0;
                                const safeName = pdfSafe(item.name) || 'N/A';
                const safeAddOn = pdfSafe(item.addOnText);
                return [
                    {
                        content: safeAddOn ? `${safeName}\n+ ${safeAddOn}` : safeName,
                        styles: { fontStyle: 'bold' },
                    },
                    { content: pdfSafe(item.itemGroup) || 'N/A', styles: { textColor: GRAY } },
                    { content: item.quantitySold.toLocaleString('en-IN'), styles: { halign: 'right' } },
                    { content: fmt2(item.valueSold), styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: `${share}%`, styles: { halign: 'right', fontSize: 9.5, textColor: GRAY } },
                ];
            });

            // Item | Group | Qty | Value | Share  (total = contentW = 182mm)
            const COLW = [68, 38, 22, 32, 22];

            autoTable(doc, {
                startY: listY + 4,
                margin: { top: 26, bottom: 22, left: M, right: M },
                head: [['Item', 'Group', 'Qty sold', 'Value sold (Rs.)', 'Share']],
                body: tableBody,
                foot: [
                    [
                        { content: 'Total', styles: { fontStyle: 'bold' } },
                        {
                            content: `${summary.uniqueItemCount.toLocaleString('en-IN')} ${itemWord(summary.uniqueItemCount)}`,
                            styles: { fontStyle: 'normal', fontSize: 9.5, textColor: GRAY },
                        },
                        { content: summary.totalQuantitySold.toLocaleString('en-IN'), styles: { halign: 'right', fontStyle: 'bold' } },
                        { content: `Rs. ${fmt2(summary.totalValueSold)}`, styles: { halign: 'right', fontStyle: 'bold' } },
                        { content: '' },
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
                    2: { cellWidth: COLW[2], halign: 'right' },
                    3: { cellWidth: COLW[3], halign: 'right' },
                    4: { cellWidth: COLW[4], halign: 'right' },
                },
                                didParseCell: (data) => {
                    data.cell.styles.valign = 'middle';

                    // Value sold: very long numbers shrink instead of wrapping
                    if (data.section === 'body' && data.column.index === 3) {
                        const base = Number(data.cell.styles.fontSize) || 10.5;
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(base);
                        const w = doc.getTextWidth(data.cell.text.join(' '));
                        const avail = COLW[3] - PAD * 2;
                        if (w > avail) data.cell.styles.fontSize = Math.max((base * avail) / w, 6);
                    }

                    // Header and Total row numeric columns right-aligned (matches body)
                    if (data.section !== 'body' && data.column.index >= 2) {
                        data.cell.styles.halign = 'right';
                    }

                    // Very long totals -> shrink font so they don't wrap
                    if (data.section === 'foot' && data.column.index >= 2) {
                        doc.setFont('helvetica', 'bold');
                        doc.setFontSize(11);
                        const w = doc.getTextWidth(data.cell.text.join(' '));
                        const avail = COLW[data.column.index] - PAD * 2;
                        if (w > avail) {
                            data.cell.styles.fontSize = (11 * avail) / w;
                        }
                    }
                },
                didDrawCell: (data) => {
                    const { x, y, width, height } = data.cell;

                    // Horizontal lines only (no column grid)
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
                    doc.text(`Items Sold Report | ${periodText}`, brandRight, 15.4, { align: 'right' });
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

                doc.text(`${company} | Items Sold Report | Page ${i} of ${totalPages}`, brandRight, fy, {
                    align: 'right',
                });
            }

            doc.save(`items_sold_report_${formatDateForInput(new Date())}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
        }
    };

    /* ---------- EXCEL DOWNLOAD ---------- */
    const downloadAsExcel = () => {
        try {
            const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
                font: { name: 'Arial', ...font },
                fill: fill ?? {},
                alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true },
                border: border ?? {},
            });
            const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
            const allBorders = {
                top: { style: 'thin', color: { rgb: 'CBD5E1' } },
                bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
                left: { style: 'thin', color: { rgb: 'CBD5E1' } },
                right: { style: 'thin', color: { rgb: 'CBD5E1' } },
            };
            const bblr = {
                bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
                left: { style: 'thin', color: { rgb: 'CBD5E1' } },
                right: { style: 'thin', color: { rgb: 'CBD5E1' } },
            };

            const generationDate = new Date().toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric',
            });

            const periodLabel = appliedFilters
                ? `Period: ${formatDate(appliedFilters.start)} – ${formatDate(appliedFilters.end)}`
                : 'Period: All';

            // ── COLUMN DEFINITIONS ──────────────────────────────────────────────
            const COLS = [
                { header: '#', width: 6 },
                { header: 'Item Name', width: 32 },
                { header: 'Category', width: 24 },
                { header: 'Qty Sold', width: 14 },
                { header: 'Value Sold (₹)', width: 20 },
            ];
            const colCount = COLS.length;

            // Row layout:
            // 0  → Title (merged)
            // 1  → Meta (merged)
            // 2  → blank spacer
            // 3  → Summary label (merged)
            // 4  → Summary values
            // 5  → blank spacer
            // 6  → Column headers
            // 7+ → Data rows
            // Last → Totals footer

            const dataStartRow = 7;
            const totalRows = dataStartRow + aggregatedItems.length + 1;
            const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

            // Row 0 – Title
            aoa[0][0] = companyName
                ? `Items Sold Report  —  ${companyName}`
                : 'Items Sold Report';

            // Row 1 – Meta
            aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Unique Items: ${summary.uniqueItemCount}`;

            // Row 3 – Summary label
            aoa[3][0] = 'SUMMARY';

            // Row 4 – Summary values (single merged cell)
            aoa[4][0] = `Total Qty Sold: ${summary.totalQuantitySold}   |   Total Value: ₹${summary.totalValueSold.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Unique Items: ${summary.uniqueItemCount}`;

            // Row 6 – Column headers
            COLS.forEach((c, i) => { aoa[6][i] = c.header; });

            // Rows 7+ – Data
            aggregatedItems.forEach((item, idx) => {
                const r = dataStartRow + idx;
                aoa[r][0] = idx + 1;
                aoa[r][1] = item.addOnText ? `${item.name || '-'}\n+ ${item.addOnText}` : (item.name || '-');
                aoa[r][2] = item.itemGroup || '-';
                aoa[r][3] = item.quantitySold;
                aoa[r][4] = Math.round(item.valueSold);
            });

            // Footer row
            const footerRow = dataStartRow + aggregatedItems.length;
            aoa[footerRow][0] = 'TOTAL';
            aoa[footerRow][1] = `${summary.uniqueItemCount} items`;
            aoa[footerRow][3] = summary.totalQuantitySold;
            aoa[footerRow][4] = Math.round(summary.totalValueSold);

            // ── BUILD WORKSHEET ──────────────────────────────────────────────────
            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
            worksheet['!rows'] = [
                { hpt: 36 }, // 0 title
                { hpt: 20 }, // 1 meta
                { hpt: 8 }, // 2 spacer
                { hpt: 18 }, // 3 summary label
                { hpt: 22 }, // 4 summary values
                { hpt: 8 }, // 5 spacer
                { hpt: 28 }, // 6 headers
                ...aggregatedItems.map((i) => ({ hpt: i.addOnText ? 32 : 20 })),
                { hpt: 24 }, // footer
            ];

            worksheet['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
                { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
                { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
                { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 2 } },
            ];

            const style = (addr: string, st: any) => {
                if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
                worksheet[addr].s = st;
            };

            // ── APPLY STYLES ─────────────────────────────────────────────────────

            // Title (row 0)
            style('A1', s(
                { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
                solidFill('2563EB'),
                { horizontal: 'center', vertical: 'center' },
            ));

            // Meta (row 1)
            style('A2', s(
                { sz: 9, italic: true, color: { rgb: '475569' } },
                solidFill('DBEAFE'),
                { horizontal: 'center', vertical: 'center' },
            ));

            // Summary label (row 3)
            style('A4', s(
                { sz: 10, bold: true, color: { rgb: '1D4ED8' } },
                solidFill('EFF6FF'),
                { horizontal: 'left', vertical: 'center' },
                allBorders,
            ));

            style('A5', s(
                { sz: 10, bold: true, color: { rgb: '166534' } },
                solidFill('DCFCE7'),
                { horizontal: 'center', vertical: 'center' },
                bblr,
            ));

            // Column headers (row 6)
            COLS.forEach((_c, i) => {
                const addr = XLSX.utils.encode_cell({ r: 6, c: i });
                style(addr, s(
                    { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
                    solidFill('1E40AF'),
                    { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' },
                    allBorders,
                ));
            });

            // Numeric column indices: 3 = Qty, 4 = Value
            const numericCols = new Set([3, 4]);

            // Data rows
            aggregatedItems.forEach((_item, idx) => {
                const r = dataStartRow + idx;
                const isAlt = idx % 2 === 1;
                const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');

                for (let ci = 0; ci < colCount; ci++) {
                    const addr = XLSX.utils.encode_cell({ r, c: ci });
                    const isNumeric = numericCols.has(ci);
                    style(addr, s(
                        { sz: 9, color: { rgb: '1E293B' } },
                        rowBg,
                        { horizontal: isNumeric ? 'center' : 'left', vertical: 'center', wrapText: true },
                        bblr,
                    ));
                    if (worksheet[addr] && isNumeric) {
                        worksheet[addr].t = 'n';
                        worksheet[addr].z = ci === 4 ? '₹#,##0.00' : '#,##0';
                    }
                }
            });

            // Footer row
            for (let ci = 0; ci < colCount; ci++) {
                const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
                style(addr, s(
                    { sz: 10, bold: true, color: { rgb: '1E293B' } },
                    solidFill('E2E8F0'),
                    { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
                    {
                        top: { style: 'medium', color: { rgb: '1E293B' } },
                        bottom: { style: 'medium', color: { rgb: '1E293B' } },
                        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
                        right: { style: 'thin', color: { rgb: 'CBD5E1' } },
                    },
                ));
                if ([3, 4].includes(ci) && worksheet[addr]) {
                    worksheet[addr].t = 'n';
                    worksheet[addr].z = ci === 4 ? '₹#,##0.00' : '#,##0';
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Items Sold');
            XLSX.writeFile(workbook, `items_sold_report_${formatDateForInput(new Date())}.xlsx`);

            setFeedbackModal({
                isOpen: true,
                type: State.SUCCESS,
                message: 'Excel downloaded successfully!',
            });
        } catch {
            setFeedbackModal({
                isOpen: true,
                type: State.ERROR,
                message: 'Failed to generate Excel file.',
            });
        }
    };

    /* ---------- DOWNLOAD / SHARE ---------- */
    const runDownload = (action: () => void) => {
        if (aggregatedItems.length === 0) {
            setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No data available to download.' });
            return;
        }
        action();
    };

    /* ---------- RENDER HELPERS ---------- */
    const renderSortHeader = (label: string, key: keyof AggregatedItem, align: 'left' | 'right' = 'left') => {
        const isActive = sortConfig.key === key;
        const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
        return (
            <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
                <button
                    onClick={() => handleSort(key)}
                    className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-blue-800 ${align === 'right' ? 'flex-row-reverse' : ''} ${isActive ? 'text-blue-700' : ''}`}
                >
                    {label}
                    <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
                </button>
            </th>
        );
    };

    const shareOf = (value: number) => (summary.totalValueSold > 0 ? (value / summary.totalValueSold) * 100 : 0);
    const plural = (n: number, word: string, many = `${word}s`) => `${n.toLocaleString('en-IN')} ${n === 1 ? word : many}`;

    /* ---------- LOAD STATES ---------- */
    if (isLoading || authLoading)
        return (
            <div className="flex min-h-[60vh] items-center justify-center bg-canvas text-sm text-slate-500">
                Loading items sold...
            </div>
        );
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    const rangeLabel = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : '';
    const rangeLabelShort = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end, false) : '';
    const periodWords =
        DATE_PRESETS.find((p) => p.value === datePreset)?.label.toLowerCase() ?? rangeLabelShort;
    const periodPhrase =
        ({ today: 'today', week: 'this week', month: 'this month', last30: 'in these 30 days', fy: 'this FY' } as Record<string, string>)[datePreset]
        ?? `in ${rangeLabelShort}`;

    const statCards = [
        {
            label: 'Value sold',
            value: inrRound(summary.totalValueSold),
            hint: periodWords,
            icon: IndianRupee,
            iconClass: 'bg-blue-50 text-blue-600',
            valueClass: 'text-blue-600',
        },
        {
            label: 'Quantity sold',
            shortLabel: 'Qty sold',
            value: `${summary.totalQuantitySold.toLocaleString('en-IN')} pcs`,
            hint: plural(billLines, 'bill line'),
            icon: ShoppingCart,
            iconClass: 'bg-blue-50 text-blue-600',
            valueClass: 'text-slate-900',
        },
        {
            label: 'Items that sold',
            // Catalogue items only, so one-off / deleted items on bills can't give "40 of 38".
            value: `${(catalogueCount - unsoldItems.length).toLocaleString('en-IN')} of ${catalogueCount.toLocaleString('en-IN')}`,
            hint: `${unsoldItems.length.toLocaleString('en-IN')} didn't sell`,
            icon: Tag,
            iconClass: 'bg-orange-50 text-orange-600',
            valueClass: 'text-slate-900',
        },
        {
            label: 'Top group',
            value: topGroup.name || '—',
            hint: topGroup.name ? `${Math.round(topGroup.share)}% of value` : 'No sales',
            icon: LayoutGrid,
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

    const uncountedTotal = uncountedBills.reduce((s, b) => s + b.total, 0);
    const uncountedExamples = [...uncountedBills]
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)
        .sort((a, b) => a.date - b.date)
        .map((b) => `${formatDayMonth(b.date, false)} (${inrRound(b.total)})`);

    const mobileSortValue = `${sortConfig.key}:${sortConfig.direction}`;

    return (
        <div className="min-h-screen bg-canvas px-3 pb-20 pt-3 md:px-6 md:pb-8 md:pt-5">
            {feedbackModal.isOpen && (
                <Modal
                    type={feedbackModal.type}
                    message={feedbackModal.message}
                    onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
                    showConfirmButton={false}
                />
            )}

            {/* HEADER */}
            <header className="mb-4 flex items-center gap-2 md:gap-3">
                <div className="flex-shrink-0">
                    <BackButton />
                </div>

                <div className="min-w-0 flex-1">
                    <p className="hidden text-xs text-slate-500 md:block">Reports / Item reports /</p>
                    <div className="flex items-baseline gap-3">
                        <h1 className="text-lg font-bold text-slate-900 md:text-xl">
                            <span className="md:hidden">Items sold</span>
                            <span className="hidden md:inline">Items sold report</span>
                        </h1>
                        <span className="hidden text-xs text-slate-500 md:inline">What sold, how many and for how much</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                        <span className="truncate md:hidden">{rangeLabelShort} ·</span>
                        <button
                            onClick={refresh}
                            disabled={isFetching}
                            title="Fetch the latest sales"
                            className="inline-flex shrink-0 items-center gap-1 rounded-sm transition hover:text-slate-800 disabled:cursor-default"
                        >
                            <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
                            {isFetching ? 'Updating…' : updatedLabel}
                        </button>
                    </div>
                </div>

                {/* Desktop search */}
                <div className="relative hidden w-72 md:block">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search item"
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
                        placeholder="Search item"
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

            {/* DATE + GROUP FILTERS */}
            <div className="relative mb-4 flex items-center gap-3">
                <div className="flex flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {DATE_PRESETS.filter((p) => p.value !== 'lastMonth').map((p) => (
                        <button key={p.value} onClick={() => handleDatePresetChange(p.value)} className={chipClass(datePreset === p.value)}>
                            <span className="md:hidden">{p.shortLabel}</span>
                            <span className="hidden md:inline">{p.label}</span>
                        </button>
                    ))}
                    <button onClick={() => setIsRangeOpen((o) => !o)} className={`md:hidden ${chipClass(datePreset === 'custom')}`}>
                        Custom
                    </button>
                    <div className="relative hidden shrink-0 md:block">
                        <LayoutGrid size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <select
                            value={groupFilter}
                            onChange={(e) => setGroupFilter(e.target.value)}
                            className="appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-400 focus:border-blue-500"
                        >
                            <option value="">All groups</option>
                            {groupOptions.map((g) => (
                                <option key={g} value={g}>{g}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    </div>
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
                            initialStart={customStartDate}
                            initialEnd={customEndDate}
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
                                    {shortLabel ? (
                                        <>
                                            <span className="md:hidden">{shortLabel}</span>
                                            <span className="hidden md:inline">{label}</span>
                                        </>
                                    ) : label}
                                </span>
                            </div>
                            <p title={value} className={`mt-2 truncate text-xl font-bold md:text-2xl ${valueClass}`}>{value}</p>
                            <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
                        </div>
                    ))}
                </div>

                {/* ITEMS SOLD */}
                {/* No overflow-hidden here: it would clip the Download menu when the list is short. */}
                <section className="rounded-sm border border-line bg-white shadow-card">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-slate-900">Items sold</h2>
                            <span className="hidden rounded-sm bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 md:inline">
                                {aggregatedItems.length.toLocaleString('en-IN')}
                            </span>
                        </div>

                        <div className="hidden items-center gap-2 md:flex">
                            <button
                                onClick={() => setIsListVisible((v) => !v)}
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

                        {/* Mobile sort */}
                        <div className="relative md:hidden">
                            <select
                                value={mobileSortValue}
                                onChange={(e) => {
                                    const [key, direction] = e.target.value.split(':') as [keyof AggregatedItem, 'asc' | 'desc'];
                                    setSortConfig({ key, direction });
                                }}
                                className="appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-blue-500"
                            >
                                <option value="valueSold:desc">Value ↓</option>
                                <option value="quantitySold:desc">Qty ↓</option>
                                <option value="name:asc">Name A–Z</option>
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                        </div>
                    </div>

                    {/* Desktop table */}
                    {isListVisible && (
                        <div className="hidden overflow-x-auto rounded-b-sm md:block">
                            <table className="w-full text-sm">
                                <thead className="bg-sunken text-[11px] text-blue-700/80">
                                    <tr>
                                        <th className="w-12 px-4 py-3 text-left font-semibold">#</th>
                                        {renderSortHeader('Item', 'name')}
                                        {renderSortHeader('Group', 'itemGroup')}
                                        {renderSortHeader('Qty sold', 'quantitySold', 'right')}
                                        {renderSortHeader('Value sold', 'valueSold', 'right')}
                                        <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Share of sales</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {aggregatedItems.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                                                Nothing sold in this period. Pick another period, or bill items by picking them from your item list.
                                            </td>
                                        </tr>
                                    )}
                                    {aggregatedItems.map((item, idx) => {
                                        const share = shareOf(item.valueSold);
                                        return (
                                            <tr key={item.id} className="border-t border-line transition hover:bg-sunken">
                                                <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                                                <td className="px-4 py-3">
                                                    <p className="font-semibold text-slate-900 break-words">{item.name}</p>
                                                    {item.addOnText && (
                                                        <p className="text-xs font-normal text-slate-500 break-words">+ {item.addOnText}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-block whitespace-nowrap rounded-sm bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                                                        {item.itemGroup}
                                                    </span>
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                                                    {item.quantitySold.toLocaleString('en-IN')}
                                                </td>
                                                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                                                    {inrRound(item.valueSold)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-1.5 w-28 overflow-hidden rounded-sm bg-slate-100">
                                                            <div className="h-full rounded-sm bg-blue-600" style={{ width: `${share}%` }} />
                                                        </div>
                                                        <span className="text-xs text-slate-500">{Math.round(share)}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {aggregatedItems.length > 0 && (
                                    <tfoot className="border-t border-line bg-sunken text-sm font-semibold text-slate-900">
                                        <tr>
                                            <td colSpan={3} className="px-4 py-3">Total · {plural(summary.uniqueItemCount, 'item')}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right">{summary.totalQuantitySold.toLocaleString('en-IN')}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right">{inrRound(summary.totalValueSold)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    )}

                    {/* Mobile list */}
                    <ul className="md:hidden">
                        {aggregatedItems.length === 0 && (
                            <li className="border-t border-line px-4 py-10 text-center text-sm text-slate-500">
                                Nothing sold in this period. Pick another period, or bill items by picking them from your item list.
                            </li>
                        )}
                        {aggregatedItems.map((item, idx) => (
                            <li key={item.id} className="border-t border-line px-4 py-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-900">
                                            {idx + 1}. {item.name}
                                        </p>
                                        {item.addOnText && (
                                            <p className="text-xs text-slate-500 break-words">+ {item.addOnText}</p>
                                        )}
                                    </div>
                                    <p className="shrink-0 text-sm font-semibold text-slate-900">{inrRound(item.valueSold)}</p>
                                </div>
                                <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                                    <span className="truncate">{item.itemGroup}</span>
                                    <span className="shrink-0">
                                        {item.quantitySold.toLocaleString('en-IN')} sold · {Math.round(shareOf(item.valueSold))}%
                                    </span>
                                </div>
                            </li>
                        ))}
                        {aggregatedItems.length > 0 && (
                            <li className="flex items-center justify-between rounded-b-sm border-t border-line bg-sunken px-4 py-3 text-sm font-semibold text-slate-900">
                                <span>Total · {plural(summary.uniqueItemCount, 'item')}</span>
                                <span>{inrRound(summary.totalValueSold)}</span>
                            </li>
                        )}
                    </ul>
                </section>

                {/* ITEMS THAT DIDN'T SELL */}
                {unsoldItems.length > 0 && (
                    <section className="mt-4 rounded-sm border border-line bg-white shadow-card">
                        <div className="flex items-center gap-3 px-4 py-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-green-50 text-green-600">
                                <Package size={17} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm text-slate-900">
                                    <span className="font-semibold">{plural(unsoldItems.length, 'item')}</span> didn't sell
                                    <span className="hidden md:inline"> {periodPhrase}</span>
                                </p>
                                <p className="hidden text-xs text-slate-500 md:block">
                                    {tiedUp > 0 ? `${inrRound(tiedUp)} tied up in stock` : 'Money tied up in stock'} · consider a discount or stop reordering them
                                </p>
                            </div>
                            <button
                                onClick={() => setShowUnsold((v) => !v)}
                                className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-blue-600 md:rounded-sm md:border md:border-slate-300 md:bg-white md:px-3 md:py-1.5 md:text-slate-800 md:hover:border-slate-400"
                            >
                                <span className="md:hidden">{showUnsold ? 'Hide' : 'See'}</span>
                                <span className="hidden md:inline">{showUnsold ? 'Hide items' : 'See items'}</span>
                                <ChevronRight size={15} className={`hidden transition md:block ${showUnsold ? 'rotate-90' : ''}`} />
                            </button>
                        </div>

                        {showUnsold && (
                            <>
                                <ul className="border-t border-line">
                                    {unsoldItems.slice(0, unsoldVisible).map((item) => (
                                        <li key={item.id} className="flex items-center justify-between gap-3 border-t border-slate-50 px-4 py-2.5 text-sm first:border-t-0">
                                            <div className="min-w-0">
                                                <p className="truncate text-slate-800">{item.name}</p>
                                                <p className="text-xs text-slate-500">{item.group}</p>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className={`text-xs ${item.stock < 0 ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                                                    {item.stock.toLocaleString('en-IN')} in stock
                                                </p>
                                                {item.value > 0 && <p className="text-xs font-semibold text-slate-900">{inrRound(item.value)}</p>}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                {unsoldVisible < unsoldItems.length && (
                                    <div className="border-t border-line px-4 py-2.5 text-center">
                                        <button
                                            onClick={() => setUnsoldVisible((n) => n + UNSOLD_PAGE_SIZE)}
                                            className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-400"
                                        >
                                            Show {Math.min(UNSOLD_PAGE_SIZE, unsoldItems.length - unsoldVisible)} more
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                )}

                {/* BILLS THAT CAN'T BE COUNTED HERE */}
                {uncountedBills.length > 0 && (
                    <div className="mt-4 flex gap-2 rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                        <p>
                            Check: {plural(uncountedBills.length, 'bill')} in this period
                            {uncountedExamples.length > 0 && <> — on {uncountedExamples.join(', ')}{uncountedBills.length > 3 ? ' and more' : ''} —</>}{' '}
                            {uncountedBills.length === 1 ? 'has' : 'have'} no item lines that could be counted, so{' '}
                            <strong>{inrRound(uncountedTotal)}</strong> of sales doesn't appear here. Items sold without being picked from the item
                            list may not be counted.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ItemsSoldReport;
