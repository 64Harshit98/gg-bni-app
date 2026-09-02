import React, { useMemo, useState, useEffect } from 'react';
import ReportDateFilter from '../../Components/ReportDateFilter';
import {
    formatDate,
    formatDateForInput,
} from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { type TableColumn } from '../../Components/CustomTable';
import { State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import { IconClose, IconSearch } from '../../constants/Icons';
import ReportDetails from '../../Pages/Reports/SalesReportComponents/ReportDetails';
import DownloadChoiceModal from '../../Pages/Reports/ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';
import { DatePreset } from '../../Catalogue/enum/datePreset.enum';
//import { Cata_Permissions } from '../enum/cata_permissions.enum';
//import CataShowWrapper from '../../context/CataShowWrapper';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import BackButton from '../../Components/BackButton';
// 1. Define the strictly 4-column structure
export interface AggregatedItem {
    id: string;
    name: string;
    itemGroup: string;
    groupId: string;
    quantitySold: number;
    valueSold: number;
}

const ItemsSoldReport: React.FC = () => {

    const [datePreset, setDatePreset] = useState<DatePreset>(DatePreset.LAST_30_DAYS);
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');

    useEffect(() => {
        if (datePreset === DatePreset.LAST_30_DAYS) {
            const start = new Date();
            const end = new Date();

            start.setDate(start.getDate() - 29);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);

            setCustomStartDate(formatDateForInput(start));
            setCustomEndDate(formatDateForInput(end));

            setAppliedFilters({
                start: start.getTime(),
                end: end.getTime(),
            });
        }
    }, []);
    const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(() => {
        const now = new Date();
        const start = new Date(now);
        const end = new Date(now);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return {
            start: start.getTime(),
            end: end.getTime(),
        };
    });
    const [isListVisible, setIsListVisible] = useState(false);

    const [sales, setSales] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const authLoading = false;

    /* ---------- LOCAL STATES ---------- */
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState({
        isOpen: false,
        type: State.INFO,
        message: '',
    });

    const { currentUser } = useAuth();
    const { itemGroups: catalogueItemGroups } = useCatalogueData();
    const itemGroupMap = useMemo(() => {
        const map: Record<string, string> = {};
        catalogueItemGroups.forEach((g) => { if (g.id) map[g.id] = g.name || 'Unknown Group'; });
        return map;
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

    //----fetching sales here-----
    const fetchSales = async () => {
        if (!currentUser?.companyId) return;

        setIsLoading(true);
        try {
            const ordersRef = collection(db, 'companies', currentUser.companyId, 'Orders');
            const snapshot = await getDocs(ordersRef);

            const fetchedSales = snapshot.docs
                .map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        createdAt: data.createdAt?.toMillis?.() || Date.now(),
                        status: data.status || "",
                        items: Array.isArray(data.items) ? data.items : [],
                    };
                })
                .filter(order => {
                    const status = (order.status || "").toLowerCase();
                    return status === 'completed' || status === 'paid';
                })

            setSales(fetchedSales);
        } catch (err) {
            console.error("Error fetching sales:", err);
            setError('Failed to fetch sales');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSales();
    }, [currentUser?.companyId]);

    // Auto-apply filters on load and when preset changes (except CUSTOM)
    useEffect(() => {
        if (datePreset !== DatePreset.CUSTOM) {
            handleApplyFilters();
        }
    }, [datePreset, sales, customStartDate, customEndDate]);

    const [sortConfig, setSortConfig] = useState<{
        key: keyof AggregatedItem;
        direction: 'asc' | 'desc';
    }>({ key: 'valueSold', direction: 'desc' });
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    /* ---------- DATE PRESET ---------- */
    const handleDatePresetChange = (preset: DatePreset) => {
        setDatePreset(preset);
        const start = new Date();
        const end = new Date();

        switch (preset) {
            case DatePreset.TODAY:
                break;
            case DatePreset.YESTERDAY:
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                break;
            case DatePreset.LAST_7_DAYS:
                start.setDate(start.getDate() - 6);
                break;
            case DatePreset.LAST_30_DAYS:
                start.setDate(start.getDate() - 29);
                break;
            case DatePreset.CUSTOM:
                return;
        }

        setCustomStartDate(formatDateForInput(start));
        setCustomEndDate(formatDateForInput(end));
    };

    const handleApplyFilters = () => {
        let start = new Date();
        let end = new Date();

        switch (datePreset) {
            case DatePreset.TODAY:
                break;

            case DatePreset.YESTERDAY:
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                break;

            case DatePreset.LAST_7_DAYS:
                start.setDate(start.getDate() - 6);
                break;

            case DatePreset.LAST_30_DAYS:
                start.setDate(start.getDate() - 29);
                break;

            case DatePreset.CUSTOM:
                start = customStartDate ? new Date(customStartDate) : new Date(0);
                end = customEndDate ? new Date(customEndDate) : new Date();
                break;
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        setAppliedFilters({
            start: start.getTime(),
            end: end.getTime()
        });
    };

    const onDatePresetChange = (preset: string) =>
        handleDatePresetChange(preset as DatePreset);

    const handleStartDateChange = (value: string) => {
        setCustomStartDate(value);
        setDatePreset(DatePreset.CUSTOM);
    };
    const handleEndDateChange = (value: string) => {
        setCustomEndDate(value);
        setDatePreset(DatePreset.CUSTOM);
    };

    /* ---------- SORT ---------- */
    const handleSort = (key: keyof AggregatedItem) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    /* ---------- AGGREGATE ITEMS & SUMMARY ---------- */
    const { aggregatedItems, summary } = useMemo(() => {
        if (!appliedFilters) {
            return {
                aggregatedItems: [],
                summary: {
                    totalValueSold: 0,
                    totalQuantitySold: 0,
                    uniqueItemCount: 0,
                },
            };
        }

        const billsInRange = sales.filter(
            (sale) =>
                sale.createdAt >= appliedFilters.start &&
                sale.createdAt <= appliedFilters.end
        );

        const itemMap = new Map<string, AggregatedItem>();
        let overallValue = 0;
        let overallQty = 0;

        billsInRange.forEach((sale) => {
            sale.items
                .filter((item: any) => item && item.quantity > 0)
                .forEach((item: any) => {
                    const id = item.productId || item.id || 'unknown';
                    console.log('Order item raw:', {
                        name: item.name,
                        groupId: item.groupId,
                        itemGroupId: item.itemGroupId,
                        groupid: item.groupid,
                        category: item.category,
                        allKeys: Object.keys(item)
                    });
                    console.log('itemGroupMap:', itemGroupMap);
                    const groupId =
                        item.groupId ||
                        item.itemGroupId ||
                        item.groupid ||
                        item.group?.id ||
                        null;
                    const resolvedGroupName =
                        (groupId && itemGroupMap[groupId]) ||   // ID → name (normal case)
                        item.groupName ||
                        (groupId) ||                             // groupId IS the name (your current data)
                        item.category ||
                        'Uncategorized';

                    const compositeKey = `${id}__${groupId || 'uncategorized'}`;

                    if (!itemMap.has(compositeKey)) {
                        itemMap.set(compositeKey, {
                            id: compositeKey,
                            name: item.name || 'Unknown Item',
                            groupId: groupId || '',
                            itemGroup: resolvedGroupName,
                            quantitySold: 0,
                            valueSold: 0,
                        });
                    }

                    const existingItem = itemMap.get(compositeKey)!;
                    const qty = item.quantity || 1;

                    const pricePerItem = item.effectiveUnitPrice || item.customPrice || item.salesPrice || item.mrp || 0;
                    if (!pricePerItem) return;
                    const lineValue = pricePerItem * qty;

                    existingItem.quantitySold += qty;
                    existingItem.valueSold += lineValue;

                    overallQty += qty;
                    overallValue += lineValue;
                });
        });

        let itemsArray = Array.from(itemMap.values());

        // SEARCH (ONLY ITEM NAME)
        const trimmedQuery = searchQuery.toLowerCase().trim();

        if (trimmedQuery) {
            const searchTokens = trimmedQuery.split(/\s+/);

            itemsArray = itemsArray.filter((item) => {
                const name = item.name.toLowerCase();

                const matchesName = searchTokens.every(token =>
                    name.includes(token)
                );

                return matchesName;
            });
        }

        // SORTING
        itemsArray.sort((a, b) => {
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
            aggregatedItems: itemsArray,
            summary: {
                totalValueSold: overallValue,
                totalQuantitySold: overallQty,
                uniqueItemCount: itemsArray.length,
            },
        };
    }, [appliedFilters, sales, sortConfig, itemGroupMap, searchQuery]);// Added itemGroupMap dependency

    /* ---------- DEFINE TABLE COLUMNS ---------- */
    const tableColumns = useMemo<TableColumn<AggregatedItem>[]>(() => [
        {
            header: 'Item Name',
            accessor: 'name',
            sortKey: 'name',
            className: 'font-medium'
        },
        {
            header: 'Category',
            accessor: 'itemGroup',
            sortKey: 'itemGroup',
            className: 'text-slate-600'
        },
        {
            header: 'Qty Sold',
            accessor: 'quantitySold',
            sortKey: 'quantitySold',
            className: 'text-slate-600 font-medium'
        },
        {
            header: 'Value Sold',
            accessor: (row) => `₹${Math.round(row.valueSold).toLocaleString('en-IN')}`,
            sortKey: 'valueSold',
            className: 'text-slate-800 font-medium'
        }
    ], []);

    /* ---------- PDF DOWNLOAD ---------- */
    const downloadAsPdf = async () => {
        if (!appliedFilters) return;

        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            // ===== GENERATION TAG (drawn first, reserves space for logo) =====
            const generatedAt = new Date().toLocaleString('en-IN');
            const margin = 14;

            const tagText = `Generated by SELLAR • ${generatedAt}`;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);

            const textWidth = doc.getTextWidth(tagText);
            const paddingX = 2;

            const boxWidth = textWidth + paddingX * 2;
            const boxHeight = 5;

            const logoReservedWidth = 18; // space reserved for logo + gap, so tag never overlaps it
            const boxX = pageWidth - margin - logoReservedWidth - boxWidth;
            const boxY = 10;

            doc.setFillColor(245, 245, 245);
            doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

            doc.setTextColor(80, 80, 80);
            doc.text(tagText, boxX + paddingX, boxY + 3.5);

            doc.setTextColor(0, 0, 0);

            // ===== LOGO (drawn after, in its own reserved slot at top-right corner) =====
            try {
                const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
                if (base64Logo) {
                    const img = new Image();
                    img.src = base64Logo;
                    await new Promise<void>((resolve) => {
                        img.onload = () => {
                            const logoWidth = 13;
                            const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
                            const logoX = pageWidth - logoWidth - 14;
                            doc.addImage(base64Logo, 'PNG', logoX, 8, logoWidth, logoHeight);
                            resolve();
                        };
                        img.onerror = () => resolve();
                    });
                }
            } catch { }

            // ===== ORANGE HEADER BAR =====
            doc.setFillColor(249, 115, 22);
            doc.rect(0, 0, pageWidth, 6, 'F');

            // ===== TITLE =====
            doc.setFontSize(22);
            doc.setTextColor(17, 24, 39);
            doc.setFont('helvetica', 'bold');
            const reportTitle = companyName
    ? `Items Sold Report — ${companyName}`
    : 'Items Sold Report';
doc.text(reportTitle, 14, 24);

            // ===== SUBTITLE =====
            doc.setFontSize(10);
            doc.setTextColor(107, 114, 128);
            doc.setFont('helvetica', 'normal');

            const generationDate = new Date().toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric',
            });

            const subtitleText = `Generated on: ${generationDate}   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`;
            doc.text(subtitleText, 14, 31);

            // ===== TABLE =====
            autoTable(doc, {
                startY: 38,
                head: [['ITEM NAME', 'CATEGORY', 'QTY SOLD', 'VALUE (Rs.)']],
                body: aggregatedItems.map((item) => [
                    item.name,
                    item.itemGroup,
                    item.quantitySold.toString(),
                    Math.round(item.valueSold).toLocaleString('en-IN')
                ]),
                foot: [[
                    'TOTAL',
                    '-',
                    summary.totalQuantitySold.toString(),
                    Math.round(summary.totalValueSold).toLocaleString('en-IN')
                ]],
                showFoot: 'lastPage',
                theme: 'plain',
                styles: {
                    font: 'helvetica',
                    cellPadding: 7,
                    fontSize: 10,
                    textColor: [55, 65, 81],
                },
                headStyles: {
                    fillColor: [249, 250, 251],
                    textColor: [17, 24, 39],
                    fontStyle: 'bold',
                    halign: 'center',
                    lineWidth: { top: 1, bottom: 1 },
                    lineColor: [229, 231, 235],
                },
                footStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [17, 24, 39],
                    fontStyle: 'bold',
                    halign: 'right',
                    lineWidth: { top: 1, bottom: 2 },
                    lineColor: [17, 24, 39],
                },
                alternateRowStyles: {
                    fillColor: [252, 252, 252],
                },
                columnStyles: {
                    0: { halign: 'left', cellWidth: 'auto' },
                    1: { halign: 'left', cellWidth: 40 },
                    2: { halign: 'right', cellWidth: 30 },
                    3: { halign: 'right', cellWidth: 40 },
                },
                didDrawPage: function () {
                    const pageCount = doc.getNumberOfPages();
                    doc.setFontSize(9);
                    doc.setTextColor(156, 163, 175);
                    doc.text(`Page ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
                },
            });

            doc.save(`items_sold_report_${formatDateForInput(new Date())}.pdf`);

        } catch (error) {
            console.error('Error generating PDF:', error);
        }

        setIsDownloadModalOpen(false);
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
                top: { style: 'thin', color: { rgb: 'FED7AA' } },
                bottom: { style: 'thin', color: { rgb: 'FED7AA' } },
                left: { style: 'thin', color: { rgb: 'FED7AA' } },
                right: { style: 'thin', color: { rgb: 'FED7AA' } },
            };
            const bblr = {
                bottom: { style: 'thin', color: { rgb: 'FED7AA' } },
                left: { style: 'thin', color: { rgb: 'FED7AA' } },
                right: { style: 'thin', color: { rgb: 'FED7AA' } },
            };

            const generationDate = new Date().toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric',
            });

            const COLS = [
                { header: '#', width: 6 },
                { header: 'Item Name', width: 30 },
                { header: 'Category', width: 24 },
                { header: 'Qty Sold', width: 14 },
                { header: 'Value Sold (₹)', width: 20 },
            ];
            const colCount = COLS.length;

            // Row layout:
            // 0 → Title (merged)
            // 1 → Meta  (merged)
            // 2 → blank spacer
            // 3 → Summary label (merged)
            // 4 → Summary values
            // 5 → blank spacer
            // 6 → Column headers
            // 7+ → Data rows
            // Last → Footer

            const dataStartRow = 7;
            const totalRows = dataStartRow + aggregatedItems.length + 1;
            const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

            // Row 0 – Title
            aoa[0][0] = companyName
                ? `Items Sold Report  —  ${companyName}`
                : 'Items Sold Report';

            // Row 1 – Meta
            aoa[1][0] = `Generated: ${generationDate}   |   Period: ${formatDate(appliedFilters!.start)} to ${formatDate(appliedFilters!.end)}   |   Unique Items: ${summary.uniqueItemCount}`;

            // Row 3 – Summary label
            aoa[3][0] = 'SUMMARY';

            // Row 4 – Summary values (single merged cell)
            aoa[4][0] = `Unique Items: ${summary.uniqueItemCount}   |   Total Qty Sold: ${summary.totalQuantitySold}   |   Total Value: ₹${Math.round(summary.totalValueSold).toLocaleString('en-IN')}`;

            // Row 6 – Column headers
            COLS.forEach((c, i) => { aoa[6][i] = c.header; });

            // Rows 7+ – Data
            aggregatedItems.forEach((item, idx) => {
                const r = dataStartRow + idx;
                aoa[r][0] = idx + 1;
                aoa[r][1] = item.name;
                aoa[r][2] = item.itemGroup;
                aoa[r][3] = item.quantitySold;
                aoa[r][4] = Math.round(item.valueSold);
            });

            // Footer row
            const footerRow = dataStartRow + aggregatedItems.length;
            aoa[footerRow][0] = 'TOTAL';
            aoa[footerRow][1] = `${aggregatedItems.length} items`;
            aoa[footerRow][3] = summary.totalQuantitySold;
            aoa[footerRow][4] = Math.round(summary.totalValueSold);

            // ── BUILD WORKSHEET ──────────────────────────────────────────────
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
                ...aggregatedItems.map(() => ({ hpt: 20 })),
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

            // Title (row 0) — deep orange
            style('A1', s(
                { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
                solidFill('EA580C'),
                { horizontal: 'center', vertical: 'center' },
            ));

            // Meta (row 1) — light orange tint
            style('A2', s(
                { sz: 9, italic: true, color: { rgb: '7C2D12' } },
                solidFill('FFEDD5'),
                { horizontal: 'center', vertical: 'center' },
            ));

            // Summary label (row 3)
            style('A4', s(
                { sz: 10, bold: true, color: { rgb: 'C2410C' } },
                solidFill('FFF7ED'),
                { horizontal: 'left', vertical: 'center' },
                allBorders,
            ));

            style('A5', s(
                { sz: 10, bold: true, color: { rgb: '9A3412' } },
                solidFill('FFF7ED'),
                { horizontal: 'center', vertical: 'center' },
                bblr,
            ));
            // Column headers (row 6) — dark orange header bar
            COLS.forEach((_c, i) => {
                const addr = XLSX.utils.encode_cell({ r: 6, c: i });
                style(addr, s(
                    { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
                    solidFill('C2410C'),
                    { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' },
                    allBorders,
                ));
            });

            // Data rows
            aggregatedItems.forEach((_item, idx) => {
                const r = dataStartRow + idx;
                const isAlt = idx % 2 === 1;
                const rowBg = solidFill(isAlt ? 'FFF7ED' : 'FFFFFF');

                for (let ci = 0; ci < colCount; ci++) {
                    const addr = XLSX.utils.encode_cell({ r, c: ci });
                    const isNumeric = ci >= 3;
                    style(addr, s(
                        { sz: 9, color: { rgb: '1E293B' } },
                        rowBg,
                        { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
                        bblr,
                    ));
                    // Format value column as currency
                    if (ci === 4 && worksheet[addr]) {
                        worksheet[addr].t = 'n';
                        worksheet[addr].z = '₹#,##0';
                    }
                }
            });

            // Footer row
            for (let ci = 0; ci < colCount; ci++) {
                const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
                style(addr, s(
                    { sz: 10, bold: true, color: { rgb: '1E293B' } },
                    solidFill('FED7AA'),
                    { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
                    {
                        top: { style: 'medium', color: { rgb: '1E293B' } },
                        bottom: { style: 'medium', color: { rgb: '1E293B' } },
                        left: { style: 'thin', color: { rgb: 'FED7AA' } },
                        right: { style: 'thin', color: { rgb: 'FED7AA' } },
                    },
                ));
                if (ci === 4 && worksheet[addr]) {
                    worksheet[addr].t = 'n';
                    worksheet[addr].z = '₹#,##0';
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Items Sold');
            XLSX.writeFile(workbook, `items_sold_report_${formatDateForInput(new Date())}.xlsx`);

            setIsDownloadModalOpen(false);
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

    /* ---------- LOAD STATES ---------- */
    if (isLoading || authLoading)
        return <div className="p-4 text-center">Loading...</div>;
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-2 pb-16">
            {feedbackModal.isOpen && (
                <Modal
                    type={feedbackModal.type}
                    message={feedbackModal.message}
                    onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
                    showConfirmButton={false}
                />
            )}

            <DownloadChoiceModal
                isOpen={isDownloadModalOpen}
                onClose={() => setIsDownloadModalOpen(false)}
                onDownloadPdf={downloadAsPdf}
                onDownloadExcel={downloadAsExcel}
            />

            {/* HEADER */}
            <div className="flex items-center justify-between pb-3 border-b mb-2">

                <BackButton />

                {/* TITLE */}
                <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
                    Items Sold Report
                </h1>

                <button onClick={() => setShowSearch(true)} className="p-2">
                    <IconSearch />
                </button>

            </div>

            {showSearch && (
                <div className="flex justify-center mb-2 px-2">
                    <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-[#F97316]">

                        <input
                            type="text"
                            placeholder="Search by Item Name..."
                            className="flex-1 text-base font-light p-2 outline-none bg-transparent text-center"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />

                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setShowSearch(false);
                            }}
                            className="p-1 text-gray-500 hover:text-black"
                        >
                            <IconClose />
                        </button>

                    </div>
                </div>
            )}

            {/* FILTERS */}
            <ReportDateFilter
                datePreset={datePreset}
                startDate={customStartDate}
                endDate={customEndDate}
                onPresetChange={onDatePresetChange}
                onStartDateChange={handleStartDateChange}
                onEndDateChange={handleEndDateChange}
                onApply={handleApplyFilters}
                theme="catalogue"
            />

            {/* REPORT DETAILS */}
            <ReportDetails
                downloadAsPdf={() => {
                    if (aggregatedItems.length === 0) {
                        setFeedbackModal({
                            isOpen: true,
                            type: State.INFO,
                            message: 'No data available to download.',
                        });
                    } else {
                        setIsDownloadModalOpen(true);
                    }
                }}
                filteredSales={aggregatedItems as any}
                isListVisible={isListVisible}
                setIsListVisible={setIsListVisible}
                isCatalogueMode={true}
            />
            {/* DATA TABLE */}
            {isListVisible && (
                <CustomTable<AggregatedItem>
                    data={aggregatedItems}
                    columns={tableColumns}
                    keyExtractor={(item) => item.id}
                    sortConfig={sortConfig as any}
                    onSort={handleSort as any}
                    emptyMessage="No items were sold during the selected period."
                />
            )}
        </div>
    );
};

export default ItemsSoldReport;