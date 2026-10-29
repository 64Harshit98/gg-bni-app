import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Package,
  Percent,
  RefreshCw,
  Search,
  Tag,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react';
import { State } from '../../enums';
import { usePnlReport } from './PNLReportComponents/usePnlReport';
import {
  formatDate,
  formatPercent,
  toPnlBill,
  type PnlBill,
} from './PNLReportComponents/pnlReport.utils';
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
import DetailPanel, { DetailItems, DetailRows, DetailSection } from './SalesReportComponents/DetailPanel';
import { Modal } from '../../constants/Modal';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { useAuth } from '../../context/auth-context';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

type BillFilter = 'all' | 'missing' | 'loss';

const PnlReportPage: React.FC = () => {
  const { currentUser } = useAuth();
  const {
    authLoading,
    datePreset,
    setDatePreset,
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    appliedFilters,
    setAppliedFilters,
    isListVisible,
    setIsListVisible,
    sortConfig,
    setSortConfig,
    sales,
    expenses,
    isLoading,
    isFetching,
    lastUpdated,
    error,
    refresh,
  } = usePnlReport();

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

  /* ---------- LOCAL STATES ---------- */
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [billFilter, setBillFilter] = useState<BillFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLElement>(null);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
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

  /* ---------- DATE PRESET ---------- */
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
    const start = parseInputDate(startValue);
    start.setHours(0, 0, 0, 0);
    const end = parseInputDate(endValue);
    end.setHours(23, 59, 59, 999);

    setDatePreset('custom');
    setStartDate(startValue);
    setEndDate(endValue);
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
    setIsRangeOpen(false);
  };

  /* ---------- SORT ---------- */
  const handleSort = (key: keyof PnlBill) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  /* ---------- FILTER + SUMMARY ---------- */
  // Date range + search: drives the summary cards, breakdown and chart.
  const rangeBills = useMemo(() => {
    if (!appliedFilters) return [];
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    return sales
      .filter((sale) => {
        const matchesDate =
          sale.createdAt >= appliedFilters.start && sale.createdAt <= appliedFilters.end;
        if (!matchesDate) return false;
        if (!q) return true;
        return (
          (sale.invoiceNumber || '').toLowerCase().includes(q) ||
          (sale.partyName || '').toLowerCase().includes(q) ||
          (!!qDigits && (sale.partyNumber || '').replace(/\D/g, '').includes(qDigits))
        );
      })
      .map(toPnlBill);
  }, [appliedFilters, sales, searchQuery]);

  const rangeExpenses = useMemo(() => {
    if (!appliedFilters) return [];
    return expenses.filter((e) => e.date >= appliedFilters.start && e.date <= appliedFilters.end);
  }, [appliedFilters, expenses]);

  const totals = useMemo(() => {
    const salesTotal = rangeBills.reduce((s, b) => s + b.sales, 0);
    const cost = rangeBills.reduce((s, b) => s + b.cost, 0);
    const gross = salesTotal - cost;
    const expenseTotal = rangeExpenses.reduce((s, e) => s + e.amount, 0);
    const net = gross - expenseTotal;
    const missingBills = rangeBills.filter((b) => b.costMissing);
    return {
      sales: salesTotal,
      cost,
      gross,
      expenses: expenseTotal,
      net,
      grossMargin: salesTotal > 0 ? (gross / salesTotal) * 100 : 0,
      netMargin: salesTotal > 0 ? (net / salesTotal) * 100 : 0,
      missingCount: missingBills.length,
      missingSales: missingBills.reduce((s, b) => s + b.sales, 0),
      missingItems: new Set(missingBills.flatMap((b) => b.missingItemKeys)).size,
    };
  }, [rangeBills, rangeExpenses]);

  // Bill filter + sort: drives the list and the downloads.
  const filteredBills = useMemo(() => {
    const list = rangeBills.filter((b) =>
      billFilter === 'missing' ? b.costMissing : billFilter === 'loss' ? b.profit < 0 : true,
    );
    list.sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = a[sortConfig.key] ?? -Infinity;
      const valB = b[sortConfig.key] ?? -Infinity;
      if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * direction;
      if (typeof valA === 'string' && typeof valB === 'string')
        return valA.localeCompare(valB, undefined, { numeric: true }) * direction;
      return 0;
    });
    return list;
  }, [rangeBills, billFilter, sortConfig]);

  const listTotals = useMemo(() => {
    const salesTotal = filteredBills.reduce((s, b) => s + b.sales, 0);
    const cost = filteredBills.reduce((s, b) => s + b.cost, 0);
    const profit = salesTotal - cost;
    return { sales: salesTotal, cost, profit, margin: salesTotal > 0 ? (profit / salesTotal) * 100 : 0 };
  }, [filteredBills]);

  // Shape the export code below has always used.
  const pnlSummary = {
    totalRevenue: listTotals.sales,
    totalCost: listTotals.cost,
    totalExpenses: totals.expenses,
    billProfit: listTotals.profit,
    grossProfit: listTotals.profit - totals.expenses,
    grossProfitPercentage:
      listTotals.sales > 0 ? ((listTotals.profit - totals.expenses) / listTotals.sales) * 100 : 0,
  };
  const filteredTransactions = filteredBills;

  const profitByDay = useMemo(
    () => rangeBills.map((b) => ({ createdAt: b.createdAt, totalAmount: b.profit })),
    [rangeBills],
  );

  /* ---------- PDF DOWNLOAD ---------- */
  const downloadAsPdf = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const { totalRevenue, totalCost, grossProfit, grossProfitPercentage } = pnlSummary;
      // ===== GENERATION TAG (drawn first, reserves space for logo) =====
      const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);

      const textWidth = doc.getTextWidth(tagText);
      const paddingX = 2;
      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = 5;

      const logoReservedWidth = 25; // space reserved for logo + gap, so tag never overlaps it
      const boxX = pageWidth - 14 - logoReservedWidth - boxWidth;
      const boxY = 10;

      doc.setFillColor(245, 245, 245);
      doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');

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
              const logoWidth = 15;
              const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
              const logoX = pageWidth - logoWidth - 14;
              doc.addImage(base64Logo, 'PNG', logoX, 8, logoWidth, logoHeight);
              resolve();
            };
            img.onerror = () => resolve();
          });
        }
      } catch {
        // Continue without logo
      }

      // --- 1. BRAND ACCENT BAR ---
      doc.setFillColor(37, 99, 235); // blue-600
      doc.rect(0, 0, pageWidth, 6, 'F');

      // --- 2. HEADER SECTION ---
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39); // gray-900
      doc.setFont('helvetica', 'bold');
      const reportTitle = companyName
        ? `Profit & Loss Report — ${companyName}`
        : 'Profit & Loss Report';
      doc.text(reportTitle, 14, 24);

      // Dynamic Subtitle with Date Range
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128); // gray-500
      doc.setFont('helvetica', 'normal');

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

      const start = appliedFilters ? formatDate(new Date(appliedFilters.start)) : 'All Time';
      const end = appliedFilters ? formatDate(new Date(appliedFilters.end)) : 'All Time';

      const subtitleText = `Generated: ${generationDate}   |   Period: ${start} to ${end}`;
      doc.text(subtitleText, 14, 31);

      // --- 3. SUMMARY METRICS BLOCK ---
      autoTable(doc, {
        startY: 38,
        body: [
          [
            'TOTAL SALES (Rs.)',
            totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            'NET PROFIT / LOSS (Rs.)',
            grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ],
          [
            'TOTAL COST (Rs.)',
            totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            'NET MARGIN',
            `${grossProfitPercentage.toFixed(2)}%`,
          ],
          [
            'TOTAL EXPENSES (Rs.)',
            (pnlSummary.totalExpenses ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            '',
            '',
          ],
        ],
        theme: 'plain',
        styles: {
          font: 'helvetica',
          cellPadding: 4,
          fontSize: 11,
          textColor: [17, 24, 39], // gray-900
        },
        columnStyles: {
          0: { fontStyle: 'bold', textColor: [107, 114, 128], cellWidth: 40 }, // Labels
          1: { fontStyle: 'bold', halign: 'right', cellWidth: 40 },            // Values
          2: { fontStyle: 'bold', textColor: [107, 114, 128], cellWidth: 55 }, // Labels
          3: { fontStyle: 'bold', halign: 'right', cellWidth: 40 },            // Values
        },
        didParseCell: function (data) {
          // Highlight negative Net Profit or Margin in red
          if ((data.row.index === 0 && data.column.index === 3) ||
            (data.row.index === 1 && data.column.index === 3)) {
            const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, '').replace('%', ''));
            if (rawVal < 0) {
              data.cell.styles.textColor = [220, 38, 38]; // red-600
            }
          }
        }
      });

      // --- 4. DETAILED TRANSACTIONS TABLE ---
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 12,
        head: [['DATE', 'INVOICE', 'SALES (Rs.)', 'COST (Rs.)', 'PROFIT (Rs.)']],
        body: filteredTransactions.map((t) => [
          formatDate(new Date(t.createdAt)),
          t.invoiceNumber || 'N/A',
          t.sales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          t.costMissing
            ? `${t.cost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`
            : t.cost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          t.profit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ]),
        foot: [[
          'TOTAL',
          '-',
          totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          pnlSummary.billProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ]],
        showFoot: 'lastPage',
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
          halign: 'right', // Right aligns the totals to match the data columns
          lineWidth: { top: 1, bottom: 2 }, // Thicker bottom line for totals
          lineColor: [17, 24, 39],
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252], // Subtle zebra striping
        },
        columnStyles: {
          0: { halign: 'left', cellWidth: 35 },
          1: { halign: 'left', cellWidth: 'auto' },
          2: { halign: 'right', cellWidth: 35 },
          3: { halign: 'right', cellWidth: 35 },
          4: { halign: 'right', cellWidth: 35 },
        },
        // --- 5. CONDITIONAL FORMATTING ---
        didParseCell: function (data) {
          // Highlight negative values in the 'Profit' column for body and foot
          if ((data.section === 'body' || data.section === 'foot') && data.column.index === 4) {
            const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, ''));
            if (rawVal < 0) {
              data.cell.styles.textColor = [220, 38, 38]; // red-600
              data.cell.styles.fontStyle = 'bold';
            }
          }
          // Fix alignment for the "TOTAL" label in the footer
          if (data.section === 'foot' && data.column.index === 0) {
            data.cell.styles.halign = 'left';
          }
        },
        // --- 6. PAGINATION FOOTER ---
        didDrawPage: function () {
          const pageCount = (doc.internal as any).getNumberOfPages();
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

      if (filteredTransactions.some((t) => t.costMissing)) {
        const finalY = (doc as any).lastAutoTable.finalY + 6;
        doc.setFontSize(8);
        doc.setTextColor(180, 83, 9); // amber-700
        doc.text('* Some items on this bill have no purchase price, so its profit is overstated.', 14, finalY);
      }

      doc.save(`PNL_Report_${startDate}_to_${endDate}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate PDF file.',
      });
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
        ? `Period: ${formatDate(new Date(appliedFilters.start))} – ${formatDate(new Date(appliedFilters.end))}`
        : 'Period: All';

      // ── COLUMN DEFINITIONS ──────────────────────────────────────────────
      const COLS = [
        { header: '#', width: 6 },
        { header: 'Date', width: 18 },
        { header: 'Invoice', width: 22 },
        { header: 'Sales (₹)', width: 22 },
        { header: 'Cost (₹)', width: 22 },
        { header: 'Profit (₹)', width: 22 },
        { header: 'Cost missing', width: 16 },
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
      const totalRows = dataStartRow + filteredTransactions.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = companyName
        ? `Profit & Loss Report  —  ${companyName}`
        : 'Profit & Loss Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Transactions: ${filteredTransactions.length}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Total Sales: ₹${pnlSummary.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Total Cost: ₹${pnlSummary.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Expenses: ₹${(pnlSummary.totalExpenses ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Net Profit: ₹${pnlSummary.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Net Margin: ${pnlSummary.grossProfitPercentage.toFixed(2)}%`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      filteredTransactions.forEach((txn, idx) => {
        const r = dataStartRow + idx;
        aoa[r][0] = idx + 1;
        aoa[r][1] = formatDate(new Date(txn.createdAt));
        aoa[r][2] = txn.invoiceNumber || 'N/A';
        aoa[r][3] = Math.round(txn.sales);
        aoa[r][4] = Math.round(txn.cost);
        aoa[r][5] = Math.round(txn.profit);
        aoa[r][6] = txn.costMissing ? 'Yes' : '';
      });

      // Footer row
      const footerRow = dataStartRow + filteredTransactions.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = `${filteredTransactions.length} transactions`;
      aoa[footerRow][3] = Math.round(pnlSummary.totalRevenue);
      aoa[footerRow][4] = Math.round(pnlSummary.totalCost);
      aoa[footerRow][5] = Math.round(pnlSummary.billProfit);

      // ── BUILD WORKSHEET ──────────────────────────────────────────────────
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 36 }, // 0 title
        { hpt: 20 }, // 1 meta
        { hpt: 8 },  // 2 spacer
        { hpt: 18 }, // 3 summary label
        { hpt: 48 }, // 4 summary values
        { hpt: 8 },  // 5 spacer
        { hpt: 28 }, // 6 headers
        ...filteredTransactions.map(() => ({ hpt: 20 })),
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
        { horizontal: 'center', vertical: 'center', wrapText: true },
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

      // Numeric column indices: 3 = Sales, 4 = Cost, 5 = Profit
      const numericCols = new Set([3, 4, 5]);

      // Data rows
      filteredTransactions.forEach((txn, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(txn.costMissing ? 'FFFBEB' : isAlt ? 'F8FAFC' : 'FFFFFF');

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
            worksheet[addr].z = '₹#,##0.00';
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
        if ([3, 4, 5].includes(ci) && worksheet[addr]) {
          worksheet[addr].t = 'n';
          worksheet[addr].z = '₹#,##0.00';
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'PNL Report');
      XLSX.writeFile(workbook, `PNL-Report-${startDate}-to-${endDate}.xlsx`);

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
    if (filteredBills.length === 0) {
      setFeedbackModal({
        isOpen: true,
        type: State.INFO,
        message: 'No data available to download.',
      });
      return;
    }
    action();
  };

  const reviewMissingCost = () => {
    setBillFilter('missing');
    setIsListVisible(true);
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /* ---------- RENDER HELPERS ---------- */
  const renderSortHeader = (
    label: string,
    sortKey: keyof PnlBill,
    align: 'left' | 'right' = 'left',
  ) => {
    const isActive = sortConfig.key === sortKey;
    const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => handleSort(sortKey)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-blue-800 ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          {label}
          <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
        </button>
      </th>
    );
  };

  const signedCurrency = (value: number) =>
    `${value < 0 ? '−' : ''}${formatCurrency(Math.abs(Math.round(value)))}`;
  const profitClass = (value: number) => (value < 0 ? 'text-red-600' : 'text-green-700');
  const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
  // One bill's profit, opened in the detail panel (side panel on desktop, bottom sheet on mobile).
  const renderBillPanel = (bill: PnlBill) => {
    const time = new Date(bill.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const walkIn = !bill.partyName || ['n/a', 'walk-in', 'walk in', 'cash'].includes(bill.partyName.trim().toLowerCase());
    return (
      <DetailPanel
        open
        onClose={() => setSelectedId(null)}
        title={bill.invoiceNumber}
        badge={
          bill.costMissing ? (
            <span className="rounded-sm bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">No cost</span>
          ) : undefined
        }
        subtitle={`${formatFullDate(bill.createdAt)}, ${time} · ${walkIn ? 'Walk-in' : bill.partyName}`}
        footer={
          currentUser?.companyId ? (
            <a
              href={`/download-bill/${currentUser.companyId}/${bill.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <ExternalLink size={15} /> View bill
            </a>
          ) : undefined
        }
      >
        <DetailSection title="Profit on this bill">
          <DetailRows
            rows={[
              { label: 'Sale', value: formatCurrency(bill.sales) },
              { label: 'Cost', value: formatCurrency(bill.cost), tone: bill.costMissing ? 'text-amber-700' : undefined },
              { label: 'Profit', value: signedCurrency(bill.profit), tone: profitClass(bill.profit), strong: true },
              { label: 'Margin', value: bill.margin === null ? '—' : formatPercent(bill.margin) },
            ]}
          />
          {bill.costMissing && (
            <p className="mt-2 rounded-sm bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Some items have no purchase price, so profit looks higher than it is. Add the purchase price on the item to fix it.
            </p>
          )}
        </DetailSection>

        <DetailSection title={`Items · ${(bill.items || []).length}`}>
          <DetailItems
            items={(bill.items || []).map((raw) => {
              const item = raw as unknown as Record<string, unknown>;
              const unitCost = Number(item.purchasePrice) || 0;
              return {
                name: String(item.name ?? ''),
                quantity: Number(item.quantity) || 0,
                unitPrice: Number(item.mrp) || 0,
                note: unitCost > 0 ? `cost ${formatCurrency(unitCost)} each` : 'no purchase price',
              };
            })}
          />
        </DetailSection>
      </DetailPanel>
    );
  };

  // Bars are drawn on a track whose full width is total sales.
  const pctOfSales = (value: number) =>
    totals.sales > 0 ? Math.min(100, Math.max(0, (value / totals.sales) * 100)) : 0;

  const expenseTitles = [...new Set(rangeExpenses.map((e) => e.title).filter(Boolean))];
  const breakdownRows = [
    {
      label: 'Sales',
      hint: '',
      value: totals.sales,
      display: formatCurrency(Math.round(totals.sales)),
      bar: { left: 0, width: totals.sales > 0 ? 100 : 0, color: 'bg-blue-600' },
    },
    {
      label: '− Cost of goods',
      hint: 'Purchase price of items sold',
      value: -totals.cost,
      display: `− ${formatCurrency(Math.round(totals.cost))}`,
      bar: { left: pctOfSales(totals.gross), width: pctOfSales(totals.cost), color: 'bg-orange-700' },
    },
    {
      label: 'Gross profit',
      hint: `${formatPercent(totals.grossMargin)} of sales`,
      value: totals.gross,
      display: signedCurrency(totals.gross),
      bar: { left: 0, width: pctOfSales(totals.gross), color: 'bg-green-700' },
    },
    {
      label: '− Expenses',
      hint: `${plural(rangeExpenses.length, 'entry', 'entries')}${
        expenseTitles.length ? ` · ${expenseTitles.slice(0, 2).join(', ')}${expenseTitles.length > 2 ? '…' : ''}` : ''
      }`,
      value: -totals.expenses,
      display: `− ${formatCurrency(Math.round(totals.expenses))}`,
      bar: {
        left: pctOfSales(totals.gross - totals.expenses),
        // Keep a visible tick for small expenses.
        width: totals.expenses > 0 ? Math.max(1, pctOfSales(totals.expenses)) : 0,
        color: 'bg-red-600',
      },
    },
  ];

  const renderBreakdown = () => (
    <div className="space-y-3">
      {breakdownRows.map((row) => (
        <div key={row.label} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 md:grid-cols-[9rem_1fr_5.5rem]">
          <div className="min-w-0">
            <p className="text-xs text-slate-800 md:text-sm">{row.label}</p>
            {row.hint && <p className="hidden text-[11px] leading-tight text-slate-500 md:block">{row.hint}</p>}
          </div>
          <div className="relative h-4 rounded-sm bg-slate-100">
            <div
              className={`absolute inset-y-0 rounded-sm ${row.bar.color}`}
              style={{ left: `${row.bar.left}%`, width: `${row.bar.width}%` }}
            />
          </div>
          <p className={`text-right text-xs font-semibold md:text-sm ${row.value < 0 ? 'text-slate-700' : 'text-slate-900'}`}>
            {row.display}
          </p>
        </div>
      ))}
      <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 border-t border-line pt-3 md:grid-cols-[9rem_1fr_5.5rem]">
        <div>
          <p className="text-xs font-semibold text-slate-900 md:text-sm">Net profit</p>
          <p className="hidden text-[11px] text-slate-500 md:block">{formatPercent(totals.netMargin)} of sales</p>
        </div>
        <div className="relative h-4 rounded-sm bg-slate-100">
          <div
            className={`absolute inset-y-0 left-0 rounded-sm ${totals.net < 0 ? 'bg-red-600' : 'bg-green-700'}`}
            style={{ width: `${pctOfSales(Math.abs(totals.net))}%` }}
          />
        </div>
        <p className={`text-right text-xs font-bold md:text-sm ${profitClass(totals.net)}`}>
          {signedCurrency(totals.net)}
        </p>
      </div>
    </div>
  );

  /* ---------- LOAD STATES ---------- */
  if (isLoading || authLoading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-canvas text-sm text-slate-500">
        Loading profit & loss...
      </div>
    );
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;

  const rangeLabel = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : '';
  const rangeLabelShort = appliedFilters
    ? formatRangeLabel(appliedFilters.start, appliedFilters.end, false)
    : '';

  const statCards = [
    {
      label: 'Total sales',
      value: formatCurrency(Math.round(totals.sales)),
      hint: plural(rangeBills.length, 'bill'),
      icon: FileText,
      iconClass: 'bg-blue-50 text-blue-600',
      valueClass: 'text-blue-600',
    },
    {
      label: 'Total cost',
      value: formatCurrency(Math.round(totals.cost)),
      hint: 'of items sold',
      icon: Package,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Expenses',
      value: formatCurrency(Math.round(totals.expenses)),
      hint: plural(rangeExpenses.length, 'entry', 'entries'),
      icon: Wallet,
      iconClass: 'bg-red-50 text-red-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Net profit',
      value: signedCurrency(totals.net),
      hint: 'sales − cost − expenses',
      icon: TrendingUp,
      iconClass: 'bg-indigo-50 text-indigo-600',
      valueClass: profitClass(totals.net),
    },
    {
      label: 'Net margin',
      value: formatPercent(totals.netMargin),
      hint: `gross ${formatPercent(totals.grossMargin)}`,
      icon: Percent,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: profitClass(totals.net),
    },
  ];

  // Old-range data stays on screen while a new range loads; dim it meanwhile.
  const fetchingClass = isFetching ? 'pointer-events-none opacity-50' : '';

  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
    }`;

  const showNetRows = billFilter === 'all';

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
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Profit & loss</h1>
            <span className="hidden text-xs text-slate-500 md:inline">
              {plural(rangeBills.length, 'bill')} · {rangeLabelShort}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            <span className="truncate md:hidden">{rangeLabel} ·</span>
            <button
              onClick={refresh}
              disabled={isFetching}
              title="Fetch the latest sales and expenses"
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
            placeholder="Search bill no., party or phone"
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
            placeholder="Search bill no., party or phone"
            autoFocus
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            onClick={() => {
              setSearchQuery('');
              setShowSearch(false);
            }}
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
            <button
              key={p.value}
              onClick={() => handleDatePresetChange(p.value)}
              className={chipClass(datePreset === p.value)}
            >
              <span className="md:hidden">{p.shortLabel}</span>
              <span className="hidden md:inline">{p.label}</span>
            </button>
          ))}
          <button
            onClick={() => setIsRangeOpen((o) => !o)}
            className={`md:hidden ${chipClass(datePreset === 'custom')}`}
          >
            Custom
          </button>
        </div>

        <button
          onClick={() => setIsRangeOpen((o) => !o)}
          className={`hidden shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 md:inline-flex ${
            datePreset === 'custom' ? 'border-slate-900' : 'border-slate-300'
          }`}
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
        {/* MOBILE: net profit first */}
        <div className="mb-3 rounded-sm border border-line bg-white shadow-card p-4 md:hidden">
          <p className="text-xs text-slate-600">Net profit</p>
          <p className={`mt-1 text-3xl font-bold ${profitClass(totals.net)}`}>{signedCurrency(totals.net)}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {formatPercent(totals.netMargin)} of {formatCurrency(Math.round(totals.sales))} sales · gross{' '}
            {formatPercent(totals.grossMargin)}
          </p>
        </div>

        {/* DESKTOP: summary cards */}
        <div className="mb-4 hidden grid-cols-5 gap-4 md:grid">
          {statCards.map(({ label, value, hint, icon: Icon, iconClass, valueClass }) => (
            <div key={label} className="rounded-sm border border-line bg-white shadow-card p-4">
              <div className="flex items-center gap-2">
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm ${iconClass}`}>
                  <Icon size={14} />
                </span>
                <span className="truncate text-sm font-medium text-slate-700">{label}</span>
              </div>
              <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>
              <p title={hint} className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>
            </div>
          ))}
        </div>

        {/* DESKTOP: missing cost warning */}
        {totals.missingCount > 0 && (
          <div className="mb-4 hidden items-center gap-3 rounded-sm border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 md:flex">
            <Tag size={16} className="shrink-0 text-amber-600" />
            <p className="flex-1">
              <strong className="text-amber-700">
                {totals.missingCount} of {plural(rangeBills.length, 'bill')} {totals.missingCount === 1 ? 'has' : 'have'} no
                purchase cost
              </strong>{' '}
              ({formatCurrency(Math.round(totals.missingSales))} of sales), so profit is shown higher than it really is.
              Add purchase prices to those items to fix it.
            </p>
            <button
              onClick={reviewMissingCost}
              className="shrink-0 rounded-sm border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:border-amber-400"
            >
              Review {plural(totals.missingItems, 'item')}
            </button>
          </div>
        )}

        {/* BREAKDOWN + CHART */}
        <div className="mb-3 grid gap-4 md:mb-4 md:grid-cols-5">
          <div className="rounded-sm border border-line bg-white shadow-card p-4 md:col-span-3">
            <h3 className="mb-4 hidden text-sm font-semibold text-slate-900 md:block">How profit is made</h3>
            {renderBreakdown()}
          </div>
          <div className="hidden md:col-span-2 md:block">
            {appliedFilters && (
              <ReportByDayChart
                records={profitByDay}
                start={appliedFilters.start}
                end={appliedFilters.end}
                noun="Profit"
                bestPrefix="Best"
              />
            )}
          </div>
        </div>

        {/* MOBILE: missing cost warning */}
        {totals.missingCount > 0 && (
          <button
            onClick={reviewMissingCost}
            className="mb-3 flex w-full gap-2 rounded-sm border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-800 md:hidden"
          >
            <Tag size={15} className="mt-0.5 shrink-0 text-amber-600" />
            <span>
              <strong>{plural(totals.missingCount, 'bill')} {totals.missingCount === 1 ? 'has' : 'have'} no cost</strong> —
              profit looks higher than it is.
            </span>
          </button>
        )}

        {/* BILL-WISE PROFIT */}
        {/* No overflow-hidden here: it would clip the Download menu when the list is short. */}
        <section ref={listRef} className="scroll-mt-4 rounded-sm border border-line bg-white shadow-card">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Bill-wise profit</h2>
              <span className="hidden rounded-sm bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 md:inline">
                {plural(filteredBills.length, 'bill')}
              </span>
            </div>

            {/* Desktop controls */}
            <div className="hidden items-center gap-2 md:flex">
              <div className="relative">
                <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <select
                  value={billFilter}
                  onChange={(e) => setBillFilter(e.target.value as BillFilter)}
                  className="appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-blue-500"
                >
                  <option value="all">All bills</option>
                  <option value="missing">Cost missing</option>
                  <option value="loss">Loss-making</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
              <button
                onClick={() => setIsListVisible(!isListVisible)}
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

            {/* Mobile: only shown while reviewing, so the filter can be cleared */}
            {billFilter !== 'all' && (
              <button
                onClick={() => setBillFilter('all')}
                className="inline-flex items-center gap-1 rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 md:hidden"
              >
                {billFilter === 'missing' ? 'Cost missing' : 'Loss-making'}
                <X size={12} />
              </button>
            )}
          </div>

          {/* Desktop table */}
          {isListVisible && (
            <div className="hidden overflow-x-auto rounded-b-sm md:block">
              <table className="w-full text-sm">
                <thead className="bg-sunken text-[11px] text-blue-700/80">
                  <tr>
                    {renderSortHeader('Date', 'createdAt')}
                    {renderSortHeader('Bill no.', 'invoiceNumber')}
                    {renderSortHeader('Sales', 'sales', 'right')}
                    {renderSortHeader('Cost', 'cost', 'right')}
                    {renderSortHeader('Profit', 'profit', 'right')}
                    {renderSortHeader('Margin', 'margin', 'right')}
                  </tr>
                </thead>
                <tbody>
                  {filteredBills.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                        No bills in this period. Pick another period to see your profit.
                      </td>
                    </tr>
                  )}
                  {filteredBills.map((bill) => (
                    <React.Fragment key={bill.id}>
                      <tr
                        onClick={() => setSelectedId(bill.id)}
                        className={`cursor-pointer border-t border-line transition ${
                          selectedId === bill.id ? 'bg-blue-50' : bill.costMissing ? 'bg-amber-50/70 hover:bg-amber-50' : 'hover:bg-sunken'
                        }`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFullDate(bill.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-600">{bill.invoiceNumber}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatCurrency(bill.sales)}</td>
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right ${
                            bill.costMissing ? 'font-medium text-amber-700' : 'text-slate-700'
                          }`}
                        >
                          {formatCurrency(bill.cost)}
                          {bill.costMissing && ' · cost missing'}
                        </td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${profitClass(bill.profit)}`}>
                          {signedCurrency(bill.profit)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right text-xs font-semibold ${
                            bill.margin === null ? 'text-slate-400' : profitClass(bill.margin)
                          }`}
                        >
                          {bill.margin === null ? '—' : formatPercent(bill.margin)}
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
                {filteredBills.length > 0 && (
                  <tfoot className="border-t border-line bg-sunken text-sm">
                    <tr className="font-semibold text-slate-900">
                      <td colSpan={2} className="px-4 py-3">Total · {plural(filteredBills.length, 'bill')}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(listTotals.sales)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(listTotals.cost)}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right ${profitClass(listTotals.profit)}`}>
                        {signedCurrency(listTotals.profit)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-xs">{formatPercent(listTotals.margin)}</td>
                    </tr>
                    {showNetRows && (
                      <>
                        <tr className="text-slate-600">
                          <td colSpan={4} className="px-4 py-2 text-xs">
                            Less expenses ({plural(rangeExpenses.length, 'entry', 'entries')})
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-semibold text-red-600">
                            − {formatCurrency(Math.round(totals.expenses))}
                          </td>
                          <td />
                        </tr>
                        <tr className="border-t border-line font-bold text-slate-900">
                          <td colSpan={4} className="px-4 py-3">Net profit</td>
                          <td className={`whitespace-nowrap px-4 py-3 text-right ${profitClass(totals.net)}`}>
                            {signedCurrency(totals.net)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-xs">{formatPercent(totals.netMargin)}</td>
                        </tr>
                      </>
                    )}
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Mobile list */}
          <ul className="md:hidden">
            {filteredBills.length === 0 && (
              <li className="border-t border-line px-4 py-10 text-center text-sm text-slate-500">
                No bills in this period. Pick another period to see your profit.
              </li>
            )}
            {filteredBills.map((bill) => (
              <li
                key={bill.id}
                onClick={() => setSelectedId(bill.id)}
                className={`cursor-pointer border-t border-line px-4 py-3 ${
                  bill.costMissing ? 'bg-amber-50/70' : 'active:bg-sunken'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-slate-900">{bill.invoiceNumber}</span>
                    {bill.costMissing && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">No cost</span>
                    )}
                  </div>
                  <span className={`shrink-0 font-semibold ${profitClass(bill.profit)}`}>{signedCurrency(bill.profit)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="truncate">
                    Sale {formatCurrency(bill.sales)} · cost {formatCurrency(bill.cost)}
                  </span>
                  <span className="shrink-0">{formatDayMonth(bill.createdAt)}</span>
                </div>
              </li>
            ))}
            {filteredBills.length > 0 && (
              <li className="space-y-1.5 rounded-b-sm border-t border-line bg-sunken px-4 py-3 text-sm">
                <div className="flex justify-between font-semibold text-slate-900">
                  <span>Total · {plural(filteredBills.length, 'bill')}</span>
                  <span className={profitClass(listTotals.profit)}>{signedCurrency(listTotals.profit)}</span>
                </div>
                {showNetRows && (
                  <>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Less expenses ({plural(rangeExpenses.length, 'entry', 'entries')})</span>
                      <span className="font-semibold text-red-600">− {formatCurrency(Math.round(totals.expenses))}</span>
                    </div>
                    <div className="flex justify-between border-t border-line pt-1.5 font-bold text-slate-900">
                      <span>Net profit</span>
                      <span className={profitClass(totals.net)}>{signedCurrency(totals.net)}</span>
                    </div>
                  </>
                )}
              </li>
            )}
          </ul>
        </section>
      </div>

      {(() => {
        const selected = selectedId ? filteredBills.find((b) => b.id === selectedId) : undefined;
        return selected ? renderBillPanel(selected) : null;
      })()}
    </div>
  );
};

export default PnlReportPage;
