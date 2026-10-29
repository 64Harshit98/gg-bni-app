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
} from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import { useCachedRange } from '../../Pages/Reports/useCachedRange';
import { loadCatalogueSalesForRange } from './catalogueSalesCache';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { State } from '../../enums';
import { Modal } from '../../constants/Modal';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import DownloadMenu from '../../Pages/Reports/SalesReportComponents/DownloadMenu';
import CustomRangePanel from '../../Pages/Reports/SalesReportComponents/CustomRangePanel';
import { totalStock } from '../../Pages/Reports/ItemReportComponents/itemIssues';
import BackButton from '../../Components/BackButton';

export interface AggregatedItem {
    id: string; // productId__groupId (same product in two groups stays two rows)
    productId: string;
    name: string;
    itemGroup: string;
    quantitySold: number;
    valueSold: number;
}

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
const UNSOLD_PAGE_SIZE = 50;
const BORDER = 'border-[#f6e1d0]';

const inrRound = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

type Range = { start: number; end: number };

const ItemsSoldReport: React.FC = () => {
    const { currentUser, loading: authLoading } = useAuth();
    const companyId = currentUser?.companyId;
    const { items: catalogueItems, itemGroups: catalogueItemGroups } = useCatalogueData();

    /* ---------- DATE RANGE (fixed object -> stable cache key) ---------- */
    const [datePreset, setDatePreset] = useState<string>('last30');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    const [appliedFilters, setAppliedFilters] = useState<Range | null>(() => {
        const r = getPresetRange('last30');
        return r ? { start: r.start.getTime(), end: r.end.getTime() } : null;
    });

    // Cached read: the same per-range cache the Catalogue Reports hub uses.
    const salesQuery = useCachedRange(loadCatalogueSalesForRange, companyId, appliedFilters, authLoading);
    const sales = salesQuery.records;
    const isLoading = salesQuery.isLoading;
    // Optional extras — only used if useCachedRange returns them.
    const extra = salesQuery as unknown as {
        isFetching?: boolean;
        lastUpdated?: number | null;
        refresh?: () => void;
        error?: string | null;
    };
    const isFetching = !!extra.isFetching;
    const lastUpdated = extra.lastUpdated ?? null;
    const refresh = extra.refresh;
    const error = extra.error ?? null;

    /* ---------- LOCAL STATES ---------- */
    const [showSearch, setShowSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isListVisible, setIsListVisible] = useState(true);
    const [isRangeOpen, setIsRangeOpen] = useState(false);
    const [groupFilter, setGroupFilter] = useState('');
    const [showUnsold, setShowUnsold] = useState(false);
    const [unsoldVisible, setUnsoldVisible] = useState(UNSOLD_PAGE_SIZE);
    const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: State.INFO, message: '' });
    const [companyName, setCompanyName] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof AggregatedItem; direction: 'asc' | 'desc' }>({
        key: 'valueSold',
        direction: 'desc',
    });

    // Order lines and items carry their group by id or (after a rename) by name.
    const groupNameOf = useMemo(() => {
        const byKey: Record<string, string> = {};
        catalogueItemGroups.forEach((g) => {
            if (g.id) byKey[g.id] = g.name || 'Unknown Group';
            if (g.name) byKey[g.name] = g.name;
        });
        // Older orders can carry group fields as objects/numbers — only trust strings.
        const str = (v: unknown) =>
            typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '';
        return (groupKey?: unknown, groupName?: unknown, category?: unknown): string => {
            const key = str(groupKey);
            return (key && byKey[key]) || str(groupName) || key || str(category) || UNASSIGNED_GROUP_NAME;
        };
    }, [catalogueItemGroups]);

    useEffect(() => {
        const fetchCompanyName = async () => {
            if (!companyId) return;
            try {
                const snap = await getDoc(doc(db, 'companies', companyId, 'business_info', companyId));
                if (snap.exists()) setCompanyName(snap.data().businessName || '');
            } catch (e) {
                console.error('Failed to fetch company name', e);
            }
        };
        fetchCompanyName();
    }, [companyId]);

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
        if (sortConfig.key === key) direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
        setSortConfig({ key, direction });
    };

    /* ---------- AGGREGATE ITEMS & SUMMARY ---------- */
    const ordersInRange = useMemo(
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

        ordersInRange.forEach((sale) => {
            let billValue = 0;
            const saleItems: any[] = Array.isArray((sale as any).items) ? (sale as any).items : [];
            saleItems
                .filter((item) => item && item.quantity > 0)
                .forEach((item) => {
                    const productId = String(item.productId || item.id || 'unknown');
                    const groupKey = item.groupId || item.itemGroupId || item.groupid || item.group?.id || null;
                    const compositeKey = `${productId}__${typeof groupKey === 'string' || typeof groupKey === 'number' ? groupKey : 'uncategorized'}`;

                    const qty = item.quantity || 1;
                    const pricePerItem = item.effectiveUnitPrice || item.customPrice || item.salesPrice || item.mrp || 0;
                    if (!pricePerItem) return;
                    const lineValue = pricePerItem * qty;

                    if (!itemMap.has(compositeKey)) {
                        itemMap.set(compositeKey, {
                            id: compositeKey,
                            productId,
                            name: typeof item.name === 'string' && item.name ? item.name : 'Unknown Item',
                            itemGroup: groupNameOf(groupKey, item.groupName, item.category),
                            quantitySold: 0,
                            valueSold: 0,
                        });
                    }
                    const existing = itemMap.get(compositeKey)!;
                    existing.quantitySold += qty;
                    existing.valueSold += lineValue;
                    billValue += lineValue;
                    lines += 1;
                });
            // An order whose lines add up to nothing can't show here at all.
            if (billValue <= 0 && (sale as any).totalAmount > 0) {
                uncounted.push({ date: sale.createdAt, total: (sale as any).totalAmount });
            }
        });

        return { soldItems: Array.from(itemMap.values()), billLines: lines, uncountedBills: uncounted };
    }, [ordersInRange, groupNameOf]);

    const groupOptions = useMemo(() => {
        const names = new Set<string>();
        catalogueItemGroups.forEach((g) => { if (typeof g.name === 'string' && g.name) names.add(g.name); });
        soldItems.forEach((i) => { if (i.itemGroup) names.add(i.itemGroup); });
        return [...names].sort((a, b) => String(a).localeCompare(String(b)));
    }, [catalogueItemGroups, soldItems]);

    const { aggregatedItems, summary } = useMemo(() => {
        const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const filtered = soldItems.filter((item) => {
            if (groupFilter && item.itemGroup !== groupFilter) return false;
            if (!tokens.length) return true;
            const name = item.name.toLowerCase();
            return tokens.every((t) => name.includes(t));
        });
        filtered.sort((a, b) => {
            const key = sortConfig.key;
            const direction = sortConfig.direction === 'asc' ? 1 : -1;
            const valA = a[key];
            const valB = b[key];
            if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * direction;
            if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * direction;
            return 0;
        });
        return {
            aggregatedItems: filtered,
            summary: {
                totalValueSold: filtered.reduce((s, i) => s + i.valueSold, 0),
                totalQuantitySold: filtered.reduce((s, i) => s + i.quantitySold, 0),
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
            const pdf = new jsPDF();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();

            // Generation tag (drawn first, leaves room for the logo)
            const generatedAt = new Date().toLocaleString('en-IN', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            const margin = 14;
            const tagText = `Generated by SELLAR • ${generatedAt}`;
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(8);
            const paddingX = 2;
            const boxWidth = pdf.getTextWidth(tagText) + paddingX * 2;
            const logoReservedWidth = 18;
            const boxX = pageWidth - margin - logoReservedWidth - boxWidth;
            const boxY = 10;
            pdf.setFillColor(245, 245, 245);
            pdf.rect(boxX, boxY, boxWidth, 5, 'F');
            pdf.setTextColor(80, 80, 80);
            pdf.text(tagText, boxX + paddingX, boxY + 3.5);
            pdf.setTextColor(0, 0, 0);

            // Logo
            try {
                const base64Logo = await resolveCompanyLogoBase64(companyId);
                if (base64Logo) {
                    const img = new Image();
                    img.src = base64Logo;
                    await new Promise<void>((resolve) => {
                        img.onload = () => {
                            const logoWidth = 13;
                            const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
                            pdf.addImage(base64Logo, 'PNG', pageWidth - logoWidth - 14, 8, logoWidth, logoHeight);
                            resolve();
                        };
                        img.onerror = () => resolve();
                    });
                }
            } catch { /* logo is optional */ }

            // Orange header bar
            pdf.setFillColor(249, 115, 22);
            pdf.rect(0, 0, pageWidth, 6, 'F');

            pdf.setFontSize(22);
            pdf.setTextColor(17, 24, 39);
            pdf.setFont('helvetica', 'bold');
            pdf.text(companyName ? `Items Sold Report — ${companyName}` : 'Items Sold Report', 14, 24);

            pdf.setFontSize(10);
            pdf.setTextColor(107, 114, 128);
            pdf.setFont('helvetica', 'normal');
            const generationDate = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
            pdf.text(
                `Generated on: ${generationDate}   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`,
                14,
                31,
            );

            autoTable(pdf, {
                startY: 38,
                head: [['ITEM NAME', 'CATEGORY', 'QTY SOLD', 'TOTAL VALUE (Rs.)']],
                body: aggregatedItems.map((item) => [
                    item.name ? item.name.charAt(0).toUpperCase() + item.name.slice(1).toLowerCase() : 'N/A',
                    item.itemGroup || 'N/A',
                    item.quantitySold.toString(),
                    item.valueSold.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                ]),
                foot: [[
                    'TOTAL',
                    '-',
                    summary.totalQuantitySold.toString(),
                    summary.totalValueSold.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                ]],
                showFoot: 'lastPage',
                theme: 'plain',
                styles: { font: 'helvetica', cellPadding: 7, fontSize: 10, textColor: [55, 65, 81] },
                headStyles: {
                    fillColor: [255, 247, 237],
                    textColor: [17, 24, 39],
                    fontStyle: 'bold',
                    halign: 'center',
                    lineWidth: { top: 1, bottom: 1 },
                    lineColor: [254, 215, 170],
                },
                footStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [17, 24, 39],
                    fontStyle: 'bold',
                    halign: 'right',
                    lineWidth: { top: 1, bottom: 2 },
                    lineColor: [17, 24, 39],
                },
                alternateRowStyles: { fillColor: [255, 252, 249] },
                columnStyles: {
                    0: { halign: 'left', cellWidth: 'auto' },
                    1: { halign: 'left', cellWidth: 45 },
                    2: { halign: 'right', cellWidth: 35 },
                    3: { halign: 'right', cellWidth: 50 },
                },
                didParseCell: (data) => {
                    if (data.section === 'foot' && data.column.index === 0) data.cell.styles.halign = 'left';
                },
                didDrawPage: () => {
                    pdf.setFontSize(9);
                    pdf.setTextColor(156, 163, 175);
                    pdf.text(`Page ${pdf.getNumberOfPages()}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
                },
            });

            pdf.save(`items_sold_report_${formatDateForInput(new Date())}.pdf`);
        } catch (err) {
            console.error('Error generating PDF:', err);
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
            const line = { style: 'thin', color: { rgb: 'FED7AA' } };
            const allBorders = { top: line, bottom: line, left: line, right: line };
            const bblr = { bottom: line, left: line, right: line };

            const generationDate = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
            const periodLabel = appliedFilters
                ? `Period: ${formatDate(appliedFilters.start)} – ${formatDate(appliedFilters.end)}`
                : 'Period: All';

            const COLS = [
                { header: '#', width: 6 },
                { header: 'Item Name', width: 32 },
                { header: 'Category', width: 24 },
                { header: 'Qty Sold', width: 14 },
                { header: 'Value Sold (₹)', width: 20 },
            ];
            const colCount = COLS.length;

            // 0 title · 1 meta · 2 spacer · 3 summary label · 4 summary · 5 spacer · 6 headers · 7+ data · footer
            const dataStartRow = 7;
            const totalRows = dataStartRow + aggregatedItems.length + 1;
            const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

            aoa[0][0] = companyName ? `Items Sold Report  —  ${companyName}` : 'Items Sold Report';
            aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Unique Items: ${summary.uniqueItemCount}`;
            aoa[3][0] = 'SUMMARY';
            aoa[4][0] = `Total Qty Sold: ${summary.totalQuantitySold}   |   Total Value: ₹${Math.round(summary.totalValueSold).toLocaleString('en-IN')}   |   Unique Items: ${summary.uniqueItemCount}`;
            COLS.forEach((c, i) => { aoa[6][i] = c.header; });

            aggregatedItems.forEach((item, idx) => {
                const r = dataStartRow + idx;
                aoa[r][0] = idx + 1;
                aoa[r][1] = item.name || '-';
                aoa[r][2] = item.itemGroup || '-';
                aoa[r][3] = item.quantitySold;
                aoa[r][4] = Math.round(item.valueSold);
            });

            const footerRow = dataStartRow + aggregatedItems.length;
            aoa[footerRow][0] = 'TOTAL';
            aoa[footerRow][1] = `${summary.uniqueItemCount} items`;
            aoa[footerRow][3] = summary.totalQuantitySold;
            aoa[footerRow][4] = Math.round(summary.totalValueSold);

            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet['!cols'] = COLS.map((c) => ({ wch: c.width }));
            worksheet['!rows'] = [
                { hpt: 36 }, { hpt: 20 }, { hpt: 8 }, { hpt: 18 }, { hpt: 22 }, { hpt: 8 }, { hpt: 28 },
                ...aggregatedItems.map(() => ({ hpt: 20 })),
                { hpt: 24 },
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

            style('A1', s({ sz: 16, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('EA580C'), { horizontal: 'center', vertical: 'center' }));
            style('A2', s({ sz: 9, italic: true, color: { rgb: '7C2D12' } }, solidFill('FFEDD5'), { horizontal: 'center', vertical: 'center' }));
            style('A4', s({ sz: 10, bold: true, color: { rgb: 'C2410C' } }, solidFill('FFF7ED'), { horizontal: 'left', vertical: 'center' }, allBorders));
            style('A5', s({ sz: 10, bold: true, color: { rgb: '9A3412' } }, solidFill('FFF7ED'), { horizontal: 'center', vertical: 'center' }, bblr));

            COLS.forEach((_c, i) => {
                style(
                    XLSX.utils.encode_cell({ r: 6, c: i }),
                    s({ sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('C2410C'), { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' }, allBorders),
                );
            });

            const numericCols = new Set([3, 4]);
            aggregatedItems.forEach((_item, idx) => {
                const r = dataStartRow + idx;
                const rowBg = solidFill(idx % 2 === 1 ? 'FFF7ED' : 'FFFFFF');
                for (let ci = 0; ci < colCount; ci++) {
                    const addr = XLSX.utils.encode_cell({ r, c: ci });
                    const isNumeric = numericCols.has(ci);
                    style(addr, s({ sz: 9, color: { rgb: '1E293B' } }, rowBg, { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' }, bblr));
                    if (worksheet[addr] && isNumeric) {
                        worksheet[addr].t = 'n';
                        worksheet[addr].z = ci === 4 ? '₹#,##0' : '#,##0';
                    }
                }
            });

            for (let ci = 0; ci < colCount; ci++) {
                const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
                style(addr, s(
                    { sz: 10, bold: true, color: { rgb: '1E293B' } },
                    solidFill('FED7AA'),
                    { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
                    {
                        top: { style: 'medium', color: { rgb: '1E293B' } },
                        bottom: { style: 'medium', color: { rgb: '1E293B' } },
                        left: line,
                        right: line,
                    },
                ));
                if (numericCols.has(ci) && worksheet[addr]) {
                    worksheet[addr].t = 'n';
                    worksheet[addr].z = ci === 4 ? '₹#,##0' : '#,##0';
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Items Sold');
            XLSX.writeFile(workbook, `items_sold_report_${formatDateForInput(new Date())}.xlsx`);

            setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'Excel downloaded successfully!' });
        } catch {
            setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate Excel file.' });
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
                    className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-orange-800 ${align === 'right' ? 'flex-row-reverse' : ''} ${isActive ? 'text-orange-700' : ''}`}
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
            <div className="flex min-h-[60vh] items-center justify-center bg-[#fff5ec] text-sm text-slate-500">
                Loading items sold...
            </div>
        );
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    const rangeLabel = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : '';
    const rangeLabelShort = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end, false) : '';
    const periodWords = DATE_PRESETS.find((p) => p.value === datePreset)?.label.toLowerCase() ?? rangeLabelShort;
    const periodPhrase =
        ({ today: 'today', week: 'this week', month: 'this month', last30: 'in these 30 days', fy: 'this FY' } as Record<string, string>)[datePreset]
        ?? `in ${rangeLabelShort}`;

    const statCards = [
        {
            label: 'Value sold',
            value: inrRound(summary.totalValueSold),
            hint: periodWords,
            icon: IndianRupee,
            iconClass: 'bg-orange-50 text-orange-600',
            valueClass: 'text-orange-600',
        },
        {
            label: 'Quantity sold',
            shortLabel: 'Qty sold',
            value: `${summary.totalQuantitySold.toLocaleString('en-IN')} pcs`,
            hint: plural(billLines, 'order line'),
            icon: ShoppingCart,
            iconClass: 'bg-orange-50 text-orange-600',
            valueClass: 'text-slate-900',
        },
        {
            label: 'Items that sold',
            // Catalogue items only, so one-off / deleted items on orders can't give "40 of 38".
            value: `${Math.max(catalogueCount - unsoldItems.length, 0).toLocaleString('en-IN')} of ${catalogueCount.toLocaleString('en-IN')}`,
            hint: `${unsoldItems.length.toLocaleString('en-IN')} didn't sell`,
            icon: Tag,
            iconClass: 'bg-amber-50 text-amber-600',
            valueClass: 'text-slate-900',
        },
        {
            label: 'Top group',
            value: topGroup.name || '—',
            hint: topGroup.name ? `${Math.round(topGroup.share)}% of value` : 'No sales',
            icon: LayoutGrid,
            iconClass: 'bg-orange-50 text-orange-600',
            valueClass: 'text-slate-900',
        },
    ];

    // Old-range data stays on screen while a new range loads; dim it meanwhile.
    const fetchingClass = isFetching ? 'pointer-events-none opacity-50' : '';

    const chipClass = (active: boolean) =>
        `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${active
            ? 'border-[#F97316] bg-[#F97316] text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:border-orange-300'
        }`;

    const uncountedTotal = uncountedBills.reduce((s, b) => s + b.total, 0);
    const uncountedExamples = [...uncountedBills]
        .sort((a, b) => b.total - a.total)
        .slice(0, 3)
        .sort((a, b) => a.date - b.date)
        .map((b) => `${formatDayMonth(b.date, false)} (${inrRound(b.total)})`);

    const mobileSortValue = `${sortConfig.key}:${sortConfig.direction}`;

    return (
        <div className="flex min-h-full w-full flex-col bg-[#fff5ec] font-poppins">
            {feedbackModal.isOpen && (
                <Modal
                    type={feedbackModal.type}
                    message={feedbackModal.message}
                    onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
                    showConfirmButton={false}
                />
            )}

            {/* HEADER */}
            <div className={`relative flex flex-shrink-0 items-center gap-2 border-b bg-white p-4 shadow-sm md:gap-3 ${BORDER}`}>
                <BackButton />

                <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                        <h1 className="m-0 text-lg font-bold text-slate-900 md:text-xl">
                            <span className="md:hidden">Items sold</span>
                            <span className="hidden md:inline">Items sold report</span>
                        </h1>
                        <span className="hidden text-xs text-slate-500 md:inline">What sold, how many and for how much</span>
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
                        <span className="truncate md:hidden">{rangeLabelShort}{refresh ? ' ·' : ''}</span>
                        {refresh && (
                            <button
                                onClick={refresh}
                                disabled={isFetching}
                                title="Fetch the latest orders"
                                className="inline-flex shrink-0 items-center gap-1 rounded-sm transition hover:text-slate-800 disabled:cursor-default"
                            >
                                <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
                                {isFetching ? 'Updating…' : updatedLabel}
                            </button>
                        )}
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
                        onClick={() => setShowSearch((v) => !v)}
                        aria-label="Search"
                        className="rounded-sm p-2 text-slate-700 transition hover:bg-orange-50"
                    >
                        <Search size={20} />
                    </button>
                    <DownloadMenu
                        variant="icon"
                        onExcel={() => runDownload(downloadAsExcel)}
                        onPdf={() => runDownload(downloadAsPdf)}
                    />
                </div>
            </div>

            <div className="flex-1 px-3 pb-20 pt-4 md:px-6 md:pb-8 md:pt-5">
                {showSearch && (
                    <div className="relative mb-3 md:hidden">
                        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search item"
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
                                className="appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm font-medium text-slate-700 outline-none transition hover:border-slate-400 focus:border-orange-600"
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
                        className={`hidden shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-orange-300 md:inline-flex ${datePreset === 'custom' ? 'border-[#F97316]' : 'border-slate-300'}`}
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
                    {/* SUMMARY */}
                    <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
                        {statCards.map(({ label, shortLabel, value, hint, icon: Icon, iconClass, valueClass }) => (
                            <div key={label} className={`min-w-0 rounded-sm border bg-white p-3 shadow-sm md:p-4 ${BORDER}`}>
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
                                <p title={value} className={`m-0 mt-2 truncate text-xl font-bold md:text-2xl ${valueClass}`}>{value}</p>
                                <p title={hint} className="m-0 mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
                            </div>
                        ))}
                    </div>

                    {/* ITEMS SOLD — no overflow-hidden: it would clip the Download menu */}
                    <section className={`rounded-sm border bg-white shadow-sm ${BORDER}`}>
                        <div className="flex items-center justify-between gap-3 px-4 py-3">
                            <div className="flex items-center gap-2">
                                <h2 className="m-0 text-sm font-semibold text-slate-900">Items sold</h2>
                                <span className="hidden rounded-sm bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700 md:inline">
                                    {aggregatedItems.length.toLocaleString('en-IN')}
                                </span>
                            </div>

                            <div className="hidden items-center gap-2 md:flex">
                                <button
                                    onClick={() => setIsListVisible((v) => !v)}
                                    className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-orange-50"
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
                                    className="appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-orange-600"
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
                                    <thead className="bg-[#fff8f2] text-[11px] text-orange-700">
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
                                                    No items were sold during the selected period.
                                                </td>
                                            </tr>
                                        )}
                                        {aggregatedItems.map((item, idx) => {
                                            const share = shareOf(item.valueSold);
                                            return (
                                                <tr key={item.id} className={`border-t transition hover:bg-[#fff8f2] ${BORDER}`}>
                                                    <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                                                    <td className="px-4 py-3 font-semibold text-slate-900">{item.name}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-block whitespace-nowrap rounded-sm bg-orange-50 px-1.5 py-0.5 text-[11px] text-orange-800">
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
                                                            <div className="h-1.5 w-28 overflow-hidden rounded-sm bg-orange-100">
                                                                <div className="h-full rounded-sm bg-[#F97316]" style={{ width: `${share}%` }} />
                                                            </div>
                                                            <span className="text-xs text-slate-500">{Math.round(share)}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    {aggregatedItems.length > 0 && (
                                        <tfoot className={`border-t bg-[#fff8f2] text-sm font-semibold text-slate-900 ${BORDER}`}>
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
                        <ul className="m-0 list-none p-0 md:hidden">
                            {aggregatedItems.length === 0 && (
                                <li className={`border-t px-4 py-10 text-center text-sm text-slate-500 ${BORDER}`}>
                                    No items were sold during the selected period.
                                </li>
                            )}
                            {aggregatedItems.map((item, idx) => (
                                <li key={item.id} className={`border-t px-4 py-3 ${BORDER}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="m-0 min-w-0 text-sm font-semibold text-slate-900">{idx + 1}. {item.name}</p>
                                        <p className="m-0 shrink-0 text-sm font-semibold text-slate-900">{inrRound(item.valueSold)}</p>
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
                                <li className={`flex items-center justify-between rounded-b-sm border-t bg-[#fff8f2] px-4 py-3 text-sm font-semibold text-slate-900 ${BORDER}`}>
                                    <span>Total · {plural(summary.uniqueItemCount, 'item')}</span>
                                    <span>{inrRound(summary.totalValueSold)}</span>
                                </li>
                            )}
                        </ul>
                    </section>

                    {/* ITEMS THAT DIDN'T SELL */}
                    {unsoldItems.length > 0 && (
                        <section className={`mt-4 rounded-sm border bg-white shadow-sm ${BORDER}`}>
                            <div className="flex items-center gap-3 px-4 py-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-amber-50 text-amber-600">
                                    <Package size={17} />
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="m-0 text-sm text-slate-900">
                                        <span className="font-semibold">{plural(unsoldItems.length, 'item')}</span> didn't sell
                                        <span className="hidden md:inline"> {periodPhrase}</span>
                                    </p>
                                    <p className="m-0 hidden text-xs text-slate-500 md:block">
                                        {tiedUp > 0 ? `${inrRound(tiedUp)} tied up in stock` : 'Money tied up in stock'} · consider a discount or stop reordering them
                                    </p>
                                </div>
                                <button
                                    onClick={() => setShowUnsold((v) => !v)}
                                    className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-orange-600 md:rounded-sm md:border md:border-slate-300 md:bg-white md:px-3 md:py-1.5 md:text-slate-800 md:hover:border-orange-300"
                                >
                                    <span className="md:hidden">{showUnsold ? 'Hide' : 'See'}</span>
                                    <span className="hidden md:inline">{showUnsold ? 'Hide items' : 'See items'}</span>
                                    <ChevronRight size={15} className={`hidden transition md:block ${showUnsold ? 'rotate-90' : ''}`} />
                                </button>
                            </div>

                            {showUnsold && (
                                <>
                                    <ul className={`m-0 list-none border-t p-0 ${BORDER}`}>
                                        {unsoldItems.slice(0, unsoldVisible).map((item) => (
                                            <li key={item.id} className="flex items-center justify-between gap-3 border-t border-orange-50 px-4 py-2.5 text-sm first:border-t-0">
                                                <div className="min-w-0">
                                                    <p className="m-0 truncate text-slate-800">{item.name}</p>
                                                    <p className="m-0 text-xs text-slate-500">{item.group}</p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className={`m-0 text-xs ${item.stock < 0 ? 'font-semibold text-red-600' : 'text-slate-600'}`}>
                                                        {item.stock.toLocaleString('en-IN')} in stock
                                                    </p>
                                                    {item.value > 0 && <p className="m-0 text-xs font-semibold text-slate-900">{inrRound(item.value)}</p>}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                    {unsoldVisible < unsoldItems.length && (
                                        <div className={`border-t px-4 py-2.5 text-center ${BORDER}`}>
                                            <button
                                                onClick={() => setUnsoldVisible((n) => n + UNSOLD_PAGE_SIZE)}
                                                className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-orange-300"
                                            >
                                                Show {Math.min(UNSOLD_PAGE_SIZE, unsoldItems.length - unsoldVisible)} more
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </section>
                    )}

                    {/* ORDERS THAT CAN'T BE COUNTED HERE */}
                    {uncountedBills.length > 0 && (
                        <div className="mt-4 flex gap-2 rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                            <p className="m-0">
                                Check: {plural(uncountedBills.length, 'order')} in this period
                                {uncountedExamples.length > 0 && <> — on {uncountedExamples.join(', ')}{uncountedBills.length > 3 ? ' and more' : ''} —</>}{' '}
                                {uncountedBills.length === 1 ? 'has' : 'have'} no item lines that could be counted, so{' '}
                                <strong>{inrRound(uncountedTotal)}</strong> of sales doesn't appear here.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ItemsSoldReport;