import React, { useMemo, useState, useEffect } from 'react';
import FilterSelect from './SalesReportComponents/FilterSelect';
import {
    formatDate,
    formatDateForInput,
} from './SalesReportComponents/salesReport.utils';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import useSalesReport from './SalesReportComponents/useSalesReport';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { type TableColumn } from '../../Components/CustomTable';
import { State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import ReportDetails from './SalesReportComponents/ReportDetails';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import BackButton from '../../Components/BackButton';

// 1. Define the strictly 4-column structure
export interface AggregatedItem {
    id: string;
    name: string;
    itemGroup: string;
    quantitySold: number;
    valueSold: number;
}

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
        error,
        datePreset,
        isListVisible,
        setIsListVisible,
        authLoading,
    } = useSalesReport();

    /* ---------- LOCAL STATES ---------- */
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState({
        isOpen: false,
        type: State.INFO,
        message: '',
    });

    const { currentUser } = useAuth();
    const [itemGroupMap, setItemGroupMap] = useState<Record<string, string>>({});

    useEffect(() => {
        const fetchItemGroups = async () => {
            if (!currentUser?.companyId) return;
            try {
                const groupsRef = collection(db, 'companies', currentUser.companyId, 'itemGroups');
                const groupsSnap = await getDocs(groupsRef);

                const map: Record<string, string> = {};
                groupsSnap.docs.forEach(doc => {
                    const data = doc.data();
                    map[doc.id] = data.name || data.groupName || 'Unknown Group';
                });

                setItemGroupMap(map);
            } catch (err) {
                console.error("Error fetching item groups:", err);
            }
        };

        fetchItemGroups();
    }, [currentUser?.companyId]);

    const [sortConfig, setSortConfig] = useState<{
        key: keyof AggregatedItem;
        direction: 'asc' | 'desc';
    }>({ key: 'valueSold', direction: 'desc' });

    /* ---------- DATE PRESET ---------- */
    const handleDatePresetChange = (preset: string) => {
        setDatePreset(preset);
        const start = new Date();
        const end = new Date();

        switch (preset) {
            case 'today':
                break;
            case 'yesterday':
                start.setDate(start.getDate() - 1);
                end.setDate(end.getDate() - 1);
                break;
            case 'last7':
                start.setDate(start.getDate() - 6);
                break;
            case 'last30':
                start.setDate(start.getDate() - 29);
                break;
            case 'custom':
                return;
        }

        setCustomStartDate(formatDateForInput(start));
        setCustomEndDate(formatDateForInput(end));
    };

    const handleApplyFilters = () => {
        const start = customStartDate ? new Date(customStartDate) : new Date(0);
        start.setHours(0, 0, 0, 0);

        const end = customEndDate ? new Date(customEndDate) : new Date();
        end.setHours(23, 59, 59, 999);

        setAppliedFilters({ start: start.getTime(), end: end.getTime() });
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
            sale.items.forEach((item: any) => {
                const id = item.productId || item.id || 'unknown';

                if (!itemMap.has(id)) {
                    itemMap.set(id, {
                        id,
                        name: item.name || 'Unknown Item',
                        itemGroup: itemGroupMap[item.itemGroupId] || item.category || 'Uncategorized',
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

                overallQty += qty;
                overallValue += lineValue;
            });
        });

        const itemsArray = Array.from(itemMap.values());
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
    }, [appliedFilters, sales, sortConfig, itemGroupMap]); // Added itemGroupMap dependency

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

            // ===== LOGO =====
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

            // ===== CLEAN GENERATION TAG =====
            const now = new Date();
            const generatedAt = now.toLocaleString('en-IN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const margin = 14;

            const tagText = `Generated by SELLAR • ${generatedAt}`;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);

            const textWidth = doc.getTextWidth(tagText);
            const paddingX = 2;

            const boxWidth = textWidth + paddingX * 2;
            const boxHeight = 5;

            const boxX = pageWidth - margin - boxWidth;
            const boxY = 10;

            doc.setFillColor(245, 245, 245);
            doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

            doc.setTextColor(80, 80, 80);
            doc.text(tagText, boxX + paddingX, boxY + 3.5);

            doc.setTextColor(0, 0, 0);


            doc.setFillColor(37, 99, 235);
            doc.rect(0, 0, pageWidth, 6, 'F');

            // ===== TITLE =====
            doc.setFontSize(22);
            doc.setTextColor(17, 24, 39);
            doc.setFont('helvetica', 'bold');
            doc.text('Items Sold Report', 14, 24);

            // ===== SUBTITLE =====
            doc.setFontSize(10);
            doc.setTextColor(107, 114, 128);
            doc.setFont('helvetica', 'normal');

            const generationDate = new Date().toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric',
            });

            const subtitleText = `Generated on: ${generationDate}   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`;
            doc.text(subtitleText, 14, 31);

            // --- 3. AUTOTABLE GENERATION ---
            autoTable(doc, {
                startY: 38,
                head: [['ITEM NAME', 'CATEGORY', 'QTY SOLD', 'TOTAL VALUE (Rs.)']],
                body: aggregatedItems.map((item) => {
                    const formattedName = item.name
                        ? item.name.charAt(0).toUpperCase() + item.name.slice(1).toLowerCase()
                        : 'N/A';

                    return [
                        formattedName,
                        item.itemGroup || 'N/A',
                        item.quantitySold.toString(),
                        item.valueSold.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    ];
                }),
                foot: [
                    [
                        'TOTAL',
                        '-',
                        summary.totalQuantitySold.toString(),
                        summary.totalValueSold.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    ]
                ],
                theme: 'plain',
                styles: {
                    font: 'helvetica',
                    cellPadding: 7,
                    fontSize: 10,
                    textColor: [55, 65, 81], // gray-700
                },
                headStyles: {
                    fillColor: [249, 250, 251], // gray-50
                    textColor: [17, 24, 39], // gray-900
                    fontStyle: 'bold',
                    halign: 'center',
                    lineWidth: { top: 1, bottom: 1 },
                    lineColor: [229, 231, 235], // gray-200
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
                    1: { halign: 'left', cellWidth: 45 },
                    2: { halign: 'right', cellWidth: 35 },
                    3: { halign: 'right', cellWidth: 50 },
                },
                // --- 4. CONDITIONAL FORMATTING ---
                didParseCell: function (data) {
                    if ((data.section === 'body' || data.section === 'foot') && data.column.index === 3) {
                        const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, ''));
                        if (rawVal < 0) {
                            data.cell.styles.textColor = [220, 38, 38]; // red-600
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                    if (data.section === 'foot' && data.column.index === 0) {
                        data.cell.styles.halign = 'left';
                    }
                },
                // --- 5. PAGINATION FOOTER ---
                didDrawPage: function () {
                    const pageCount = doc.getNumberOfPages();
                    doc.setFontSize(9);
                    doc.setTextColor(156, 163, 175); // gray-400
                    doc.text(
                        `Page ${pageCount}`,
                        pageWidth - 14,
                        pageHeight - 10,
                        { align: 'right' }
                    );
                },
            });

            doc.save(`items_sold_report_${formatDateForInput(new Date())}.pdf`);

            setIsDownloadModalOpen(false);

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
            aoa[0][0] = 'Items Sold Report';

            // Row 1 – Meta
            aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Unique Items: ${summary.uniqueItemCount}`;

            // Row 3 – Summary label
            aoa[3][0] = 'SUMMARY';

            // Row 4 – Summary values
            aoa[4][0] = 'Total Qty Sold';
            aoa[4][1] = summary.totalQuantitySold;
            aoa[4][2] = 'Total Value';
            aoa[4][3] = summary.totalValueSold;
            aoa[4][4] = `Unique Items: ${summary.uniqueItemCount}`;

            // Row 6 – Column headers
            COLS.forEach((c, i) => { aoa[6][i] = c.header; });

            // Rows 7+ – Data
            aggregatedItems.forEach((item, idx) => {
                const r = dataStartRow + idx;
                aoa[r][0] = idx + 1;
                aoa[r][1] = item.name || '-';
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
                ...aggregatedItems.map(() => ({ hpt: 20 })),
                { hpt: 24 }, // footer
            ];

            worksheet['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
                { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
                { s: { r: 4, c: 4 }, e: { r: 4, c: colCount - 1 } }, // summary spans remaining cols
                { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 2 } }, // footer label spans
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

            // Summary value cells (row 4)
            const summaryBg = solidFill('F0FDF4');
            const summaryLabelStyle = s({ sz: 9, bold: true, color: { rgb: '15803D' } }, summaryBg, { horizontal: 'left', vertical: 'center' }, bblr);
            const summaryValStyle = s({ sz: 11, bold: true, color: { rgb: '166534' } }, summaryBg, { horizontal: 'center', vertical: 'center' }, bblr);
            const summaryTotalStyle = s({ sz: 10, bold: true, color: { rgb: '166534' } }, solidFill('DCFCE7'), { horizontal: 'center', vertical: 'center' }, bblr);

            style('A5', summaryLabelStyle);
            style('B5', summaryValStyle);
            style('C5', summaryLabelStyle);
            style('D5', summaryValStyle);
            style('E5', summaryTotalStyle);

            // Format B5 and D5 as number/currency
            if (worksheet['B5']) { worksheet['B5'].t = 'n'; worksheet['B5'].z = '#,##0'; }
            if (worksheet['D5']) { worksheet['D5'].t = 'n'; worksheet['D5'].z = '₹#,##0.00'; }

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
                        { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
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
                <BackButton/>
                <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
                    Items Sold Report
                </h1>
            </div>

            {/* FILTERS */}
            <div className="bg-white p-2 rounded-lg shadow-md mb-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <FilterSelect
                        value={datePreset}
                        onChange={(e) => handleDatePresetChange(e.target.value)}
                    >
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last7">Last 7 Days</option>
                        <option value="last30">Last 30 Days</option>
                        <option value="custom">Custom</option>
                    </FilterSelect>

                    <div className="grid grid-cols-2 gap-4">
                        <input
                            type="date"
                            value={customStartDate}
                            onChange={(e) => {
                                setCustomStartDate(e.target.value);
                                setDatePreset('custom');
                            }}
                            className="w-full p-2 text-sm bg-gray-50 border rounded-md"
                        />
                        <input
                            type="date"
                            value={customEndDate}
                            onChange={(e) => {
                                setCustomEndDate(e.target.value);
                                setDatePreset('custom');
                            }}
                            className="w-full p-2 text-sm bg-gray-50 border rounded-md"
                        />
                    </div>
                </div>

                <button
                    onClick={handleApplyFilters}
                    className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700"
                >
                    Apply
                </button>
            </div>

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