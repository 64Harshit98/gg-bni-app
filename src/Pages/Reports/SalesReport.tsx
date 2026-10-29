import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  FileText,
  Filter,
  IndianRupee,
  Search,
  ShoppingBag,
  Tag,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  DATE_PRESETS,
  PAY_MODE_META,
  formatCurrency,
  formatDate,
  formatDateForInput,
  formatDayMonth,
  formatFullDate,
  formatPhone,
  formatRangeLabel,
  getPaymentBreakdown,
  getPresetRange,
  getSaleItemCount,
  getSalePayModes,
  isWalkIn,
  parseInputDate,
  type PayMode,
} from './SalesReportComponents/salesReport.utils';
import useSalesReport from './SalesReportComponents/useSalesReport';
import { type SaleRecord } from './SalesReportComponents/salesReport.utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';

import { State } from '../../enums';
import ReportByDayChart from './SalesReportComponents/ReportByDayChart';
import PaymentModeCard from './SalesReportComponents/PaymentModeCard';
import DownloadMenu from './SalesReportComponents/DownloadMenu';
import CustomRangePanel from './SalesReportComponents/CustomRangePanel';
import SaleBillPanel from './SalesReportComponents/SaleBillPanel';
import { Modal } from '../../constants/Modal';
import { useAuth } from '../../context/auth-context';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

const SalesReport: React.FC = () => {
  const { currentUser } = useAuth();
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

  const {
    setDatePreset,
    setCustomStartDate,
    setCustomEndDate,
    customStartDate,
    customEndDate,
    setAppliedFilters,
    sortConfig,
    setSortConfig,
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

  const navigate = useNavigate();

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

  /* ---------- LOCAL STATES ---------- */
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isListVisible, setIsListVisible] = useState(true);
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [payModeFilter, setPayModeFilter] = useState<PayMode | 'all'>('all');
  // The bill open in the detail panel (side panel on desktop, bottom sheet on mobile).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
  });

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
  const handleSort = (key: keyof SaleRecord) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  /* ---------- FILTER + SUMMARY ---------- */
  const summarize = (list: SaleRecord[]) => {
    const totalSales = list.reduce((acc, sale) => acc + sale.totalAmount, 0);
    const totalItemsSold = list.reduce((acc, sale) => acc + getSaleItemCount(sale), 0);
    const totalTransactions = list.length;
    return {
      totalSales,
      totalTransactions,
      totalItemsSold,
      averageSaleValue: totalTransactions > 0 ? totalSales / totalTransactions : 0,
    };
  };

  // Date range + search: drives the summary cards and charts.
  const rangeSales = useMemo(() => {
    if (!appliedFilters) return [];
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    return sales.filter((sale) => {
      const matchesDate =
        sale.createdAt >= appliedFilters.start &&
        sale.createdAt <= appliedFilters.end;
      if (!matchesDate) return false;
      if (!q) return true;

      return (
        (sale.partyName || '').toLowerCase().includes(q) ||
        (sale.invoiceNumber || '').toLowerCase().includes(q) ||
        (!!qDigits && (sale.partyNumber || '').replace(/\D/g, '').includes(qDigits))
      );
    });
  }, [appliedFilters, sales, searchQuery]);

  // Payment mode filter + sort: drives the bill list and the downloads.
  const { filteredSales, summary } = useMemo(() => {
    const newFilteredSales = rangeSales.filter(
      (sale) => payModeFilter === 'all' || !!getSalePayModes(sale)[payModeFilter],
    );

    newFilteredSales.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;

      if (key === 'items') {
        return (getSaleItemCount(a) - getSaleItemCount(b)) * direction;
      }

      const valA = a[key] ?? '';
      const valB = b[key] ?? '';

      if (typeof valA === 'string' && typeof valB === 'string')
        return valA.localeCompare(valB, undefined, { numeric: true }) * direction;
      if (typeof valA === 'number' && typeof valB === 'number')
        return (valA - valB) * direction;

      return 0;
    });

    return { filteredSales: newFilteredSales, summary: summarize(newFilteredSales) };
  }, [rangeSales, payModeFilter, sortConfig]);

  const rangeSummary = useMemo(() => summarize(rangeSales), [rangeSales]);
  const paymentBreakdown = useMemo(() => getPaymentBreakdown(rangeSales), [rangeSales]);

  const partyStats = useMemo(() => {
    const walkIns = rangeSales.filter(isWalkIn).length;
    const customers = new Set(
      rangeSales
        .filter((s) => !isWalkIn(s))
        .map((s) => `${s.partyName.trim().toLowerCase()}|${(s.partyNumber || '').replace(/\D/g, '')}`),
    ).size;
    return { walkIns, customers };
  }, [rangeSales]);

  const downloadAsPdf = async () => {
    if (!appliedFilters) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // --- 1. BRAND ACCENT BAR ---
      // Uses the #F97316 orange from your UI
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageWidth, 6, 'F');

      // ===== GENERATION TAG (drawn first, reserves space for logo) =====
      const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);

      const textWidth = doc.getTextWidth(tagText);
      const paddingX = 2;
      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = 5;

      const logoReservedWidth = 18; // space reserved for logo + gap, so tag never overlaps it
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
              const logoWidth = 13;
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

      // --- 2. HEADER SECTION ---
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39); // gray-900
      doc.setFont('helvetica', 'bold');
      const reportTitle = companyName
        ? `Sales Report — ${companyName}`
        : 'Sales Report';
      doc.text(reportTitle, 14, 24);

      // Dynamic Subtitle with Date Range
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128); // gray-500
      doc.setFont('helvetica', 'normal');

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

      const subtitleText = `Generated: ${generationDate}   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`;
      doc.text(subtitleText, 14, 31);

      // --- 3. AUTOTABLE GENERATION ---
      autoTable(doc, {
        startY: 38,
        head: [['DATE', 'INVOICE NO.', 'CUSTOMER', 'ITEMS', 'AMOUNT (Rs.)']],
        body: filteredSales.map((sale) => {
          // Clean up customer name casing
          const formattedCustomer = sale.partyName
            ? sale.partyName.charAt(0).toUpperCase() + sale.partyName.slice(1).toLowerCase()
            : 'N/A';

          // Calculate total items
          const totalItems = sale.items.reduce((sum, i) => sum + i.quantity, 0);

          return [
            formatDate(sale.createdAt),
            sale.invoiceNumber || 'N/A',
            formattedCustomer,
            totalItems.toString(),
            // Strict 2-decimal financial formatting
            sale.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ];
        }),
        foot: [
          [
            'TOTAL',
            '',
            '',
            summary.totalItemsSold.toString(),
            summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ]
        ],
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
          halign: 'left',
          lineWidth: { top: 1, bottom: 1 },
          lineColor: [229, 231, 235], // gray-200
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [17, 24, 39], // gray-900
          fontStyle: 'bold',
          halign: 'left',
          lineWidth: { top: 1, bottom: 2 }, // Thicker bottom line for totals
          lineColor: [17, 24, 39],
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252], // Subtle zebra striping
        },
        columnStyles: {
          0: { halign: 'left', cellWidth: 32 },   // DATE
          1: { halign: 'left', cellWidth: 35 },   // INVOICE
          2: { halign: 'left', cellWidth: 48 },   // CUSTOMER
          3: { halign: 'left', cellWidth: 30 },   // ITEMS (aligned with header)
          4: { halign: 'left', cellWidth: 45 },   // AMOUNT (shifted left)  // AMOUNT (shifted left)
        },
        // --- 4. CONDITIONAL FORMATTING & HEADER ALIGNMENT ---
        didParseCell: function (data) {
          // If the header row and INVOICE column, align left
          if (data.section === 'head' && data.column.index === 1) {
            data.cell.styles.halign = 'left';
          }
          // If the header row and CUSTOMER column, align left
          if (data.section === 'head' && data.column.index === 2) {
            data.cell.styles.halign = 'left';
          }
          // If the header row and ITEMS column, align left
          if (data.section === 'head' && data.column.index === 3) {
            data.cell.styles.halign = 'left';
          }
          // If the header row and AMOUNT column, align left
          if (data.section === 'head' && data.column.index === 4) {
            data.cell.styles.halign = 'left';
          }
          // Highlight negative amounts (e.g., refunds) in red
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
          // Ensure ITEMS and AMOUNT in TOTAL row align exactly like columns
          if (data.section === 'foot' && data.column.index === 3) {
            data.cell.styles.halign = 'left';
          }
          if (data.section === 'foot' && data.column.index === 4) {
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

      doc.save(`Sales_Report_${formatDateForInput(new Date())}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate PDF file.',
      });
    }
  };

  /* ---------- EXCEL DOWNLOAD (NEW) ---------- */
  const downloadAsExcel = () => {
    if (!appliedFilters) return;
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
      const periodText = `Period: ${formatDate(appliedFilters.start)} → ${formatDate(appliedFilters.end)}`;

      // ── COLUMN DEFINITIONS ──────────────────────────────────────────────
      const COLS = [
        { header: '#', width: 6 },
        { header: 'Date', width: 16 },
        { header: 'Invoice No.', width: 18 },
        { header: 'Party Name', width: 28 },
        { header: 'Items Sold', width: 13 },
        { header: 'Amount (₹)', width: 18 },
        { header: '', width: 18 },
      ];
      const colCount = COLS.length;

      // ── SUMMARY ROWS ─────────────────────────────────────────────────────
      // Row 0  → Title (merged)
      // Row 1  → Sub-title / meta (merged)
      // Row 2  → blank spacer
      // Row 3  → Summary label row  (merged)
      // Row 4  → Summary values     (merged)
      // Row 5  → blank spacer
      // Row 6  → Column headers
      // Row 7+ → Data rows
      // Last   → Totals footer

      const dataStartRow = 7;
      const totalRows = dataStartRow + filteredSales.length + 1; // +1 for footer
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = companyName
        ? `Sales Report  —  ${companyName}`
        : 'Sales Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodText}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Total Bills: ${summary.totalTransactions}   |   Items Sold: ${summary.totalItemsSold}   |   Total Sales: ₹${summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      filteredSales.forEach((sale, idx) => {
        const r = dataStartRow + idx;
        aoa[r][0] = idx + 1;
        aoa[r][1] = formatDate(sale.createdAt);
        aoa[r][2] = sale.invoiceNumber || 'N/A';
        aoa[r][3] = sale.partyName
          ? sale.partyName.charAt(0).toUpperCase() + sale.partyName.slice(1).toLowerCase()
          : 'N/A';
        aoa[r][4] = sale.items.reduce((sum, i) => sum + i.quantity, 0);
        aoa[r][5] = sale.totalAmount;
      });

      // Footer row
      const footerRow = dataStartRow + filteredSales.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = '';
      aoa[footerRow][2] = '';
      aoa[footerRow][3] = '';
      aoa[footerRow][4] = summary.totalItemsSold;
      aoa[footerRow][5] = summary.totalSales;

      // ── BUILD WORKSHEET ──────────────────────────────────────────────────
      const ws: any = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = COLS.map(c => ({ wch: c.width }));
      ws['!rows'] = [
        { hpt: 36 }, // 0 title
        { hpt: 20 }, // 1 meta
        { hpt: 8 }, // 2 spacer
        { hpt: 18 }, // 3 summary label
        { hpt: 22 }, // 4 summary values
        { hpt: 8 }, // 5 spacer
        { hpt: 28 }, // 6 headers
        ...filteredSales.map(() => ({ hpt: 20 })),
        { hpt: 24 }, // footer
      ];

      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
      ];

      const style = (addr: string, st: any) => {
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].s = st;
      };

      // Title
      style('A1', s(
        { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
        solidFill('2563EB'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Meta
      style('A2', s(
        { sz: 9, italic: true, color: { rgb: '475569' } },
        solidFill('DBEAFE'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Summary label
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

      // Column headers (row index 6)
      const headerColors = ['1E40AF', '1E40AF', '1E40AF', '1E40AF', '1E40AF', '1E40AF'];
      COLS.forEach((_c, i) => {
        if (i >= 6) return; // skip the extra helper column
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          solidFill(headerColors[i]),
          { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      // Data rows
      filteredSales.forEach((sale, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');
        const isNegative = sale.totalAmount < 0;

        [0, 1, 2, 3, 4, 5].forEach(ci => {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isAmount = ci === 5;
          style(addr, s(
            {
              sz: 9,
              color: { rgb: isAmount && isNegative ? 'DC2626' : '1E293B' },
              bold: isAmount && isNegative,
            },
            rowBg,
            { horizontal: ci <= 3 ? 'left' : 'center', vertical: 'center' },
            bblr,
          ));
          // Format amount cell as number
          if (isAmount && ws[addr]) {
            ws[addr].t = 'n';
            ws[addr].z = '₹#,##0.00';
          }
        });
      });

      // Footer row
      [0, 1, 2, 3, 4, 5].forEach(ci => {
        const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: '1E293B' } },
          solidFill('E2E8F0'),
          { horizontal: ci <= 3 ? 'left' : 'center', vertical: 'center' },
          {
            top: { style: 'medium', color: { rgb: '1E293B' } },
            bottom: { style: 'medium', color: { rgb: '1E293B' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
        ));
        if (ci === 5 && ws[addr]) {
          ws[addr].t = 'n';
          ws[addr].z = '₹#,##0.00';
        }
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
      XLSX.writeFile(wb, `Sales_Report_${formatDateForInput(new Date())}.xlsx`);

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
    if (filteredSales.length === 0) {
      setFeedbackModal({
        isOpen: true,
        type: State.INFO,
        message: 'No data available to download.',
      });
      return;
    }
    action();
  };

  /* ---------- SORT HELPERS ---------- */
  const mobileSortValue =
    sortConfig.key === 'totalAmount'
      ? sortConfig.direction === 'desc' ? 'highest' : 'lowest'
      : sortConfig.key === 'createdAt' && sortConfig.direction === 'asc'
        ? 'oldest'
        : 'newest';

  const handleMobileSort = (value: string) => {
    const map: Record<string, { key: keyof SaleRecord; direction: 'asc' | 'desc' }> = {
      newest: { key: 'createdAt', direction: 'desc' },
      oldest: { key: 'createdAt', direction: 'asc' },
      highest: { key: 'totalAmount', direction: 'desc' },
      lowest: { key: 'totalAmount', direction: 'asc' },
    };
    setSortConfig(map[value] ?? map.newest);
  };

  const renderSortHeader = (
    label: string,
    sortKey: keyof SaleRecord,
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

  /* ---------- ROW HELPERS ---------- */
  const renderPayBadge = (sale: SaleRecord) => {
    const modes = Object.keys(getSalePayModes(sale)) as PayMode[];
    if (modes.length === 0) return null;
    const isSplit = modes.length > 1;
    const meta = isSplit ? null : PAY_MODE_META[modes[0]];
    return (
      <span
        title={isSplit ? modes.map((m) => PAY_MODE_META[m].label).join(' + ') : undefined}
        className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          meta ? meta.badge : 'bg-indigo-50 text-indigo-700'
        }`}
      >
        {meta ? meta.label : 'Split'}
      </span>
    );
  };

  const partyLabel = (sale: SaleRecord) => (isWalkIn(sale) ? 'Walk-in' : sale.partyName);
  const itemsLabel = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;

  /* ---------- LOAD STATES ---------- */
  if (isLoading || authLoading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-canvas text-sm text-slate-500">
        Loading sales report...
      </div>
    );
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  const rangeLabel = appliedFilters
    ? formatRangeLabel(appliedFilters.start, appliedFilters.end)
    : '';
  const rangeLabelShort = appliedFilters
    ? formatRangeLabel(appliedFilters.start, appliedFilters.end, false)
    : '';

  const billModeSummary = (Object.keys(paymentBreakdown) as PayMode[])
    .filter((m) => paymentBreakdown[m].bills > 0)
    .sort((a, b) => paymentBreakdown[b].bills - paymentBreakdown[a].bills)
    .slice(0, 3)
    .map((m) => `${paymentBreakdown[m].bills} ${m === 'upi' ? 'UPI' : PAY_MODE_META[m].label.toLowerCase()}`)
    .join(' · ');

  const statCards = [
    {
      label: 'Total sales',
      shortLabel: 'Total sales',
      value: `₹${Math.round(rangeSummary.totalSales).toLocaleString('en-IN')}`,
      hint: `${rangeSummary.totalTransactions} bills · ${partyStats.customers} ${
        partyStats.customers === 1 ? 'customer' : 'customers'
      } + ${partyStats.walkIns} walk-in`,
      icon: FileText,
      iconClass: 'bg-blue-50 text-blue-600',
      valueClass: 'text-blue-600',
    },
    {
      label: 'Total bills',
      shortLabel: 'Bills',
      value: rangeSummary.totalTransactions.toString(),
      hint: billModeSummary || 'No payments recorded',
      icon: ShoppingBag,
      iconClass: 'bg-pink-50 text-pink-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Items sold',
      shortLabel: 'Items sold',
      value: rangeSummary.totalItemsSold.toLocaleString('en-IN'),
      hint: `${
        rangeSummary.totalTransactions > 0
          ? (rangeSummary.totalItemsSold / rangeSummary.totalTransactions).toFixed(1)
          : '0'
      } items per bill`,
      icon: Tag,
      iconClass: 'bg-orange-50 text-orange-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Avg sale value',
      shortLabel: 'Avg sale',
      value: `₹${Math.round(rangeSummary.averageSaleValue).toLocaleString('en-IN')}`,
      hint: 'per bill',
      icon: IndianRupee,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-slate-900',
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
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Sales report</h1>
            <span className="hidden text-xs text-slate-500 md:inline">
              {rangeSummary.totalTransactions} bills · {rangeLabelShort}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            <span className="truncate md:hidden">{rangeLabel} ·</span>
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
              initialStart={customStartDate}
              initialEnd={customEndDate}
              onApply={handleApplyCustomRange}
              onCancel={() => setIsRangeOpen(false)}
            />
          </div>
        )}
      </div>

      {/* SUMMARY — 2 cols on mobile, 4 cols on md+ */}
      <div className={`mb-4 grid grid-cols-2 gap-2.5 transition-opacity md:grid-cols-4 md:gap-4 ${fetchingClass}`}>
        {statCards.map(({ label, shortLabel, value, hint, icon: Icon, iconClass, valueClass }) => (
          <div key={label} className="rounded-sm border border-line bg-white shadow-card p-3 md:p-4">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}>
                <Icon size={14} />
              </span>
              <span className="truncate text-xs font-medium text-slate-700 md:text-sm">
                <span className="md:hidden">{shortLabel}</span>
                <span className="hidden md:inline">{label}</span>
              </span>
            </div>
            <p className={`mt-2 text-xl font-bold md:text-2xl ${valueClass}`}>{value}</p>
            <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
          </div>
        ))}
      </div>

      {/* CHARTS */}
      <div className={`mb-4 grid gap-4 transition-opacity md:grid-cols-5 ${fetchingClass}`}>
        <div className="md:col-span-3">
          {appliedFilters && (
            <ReportByDayChart records={rangeSales} start={appliedFilters.start} end={appliedFilters.end} />
          )}
        </div>
        <div className="hidden md:col-span-2 md:block">
          <PaymentModeCard breakdown={paymentBreakdown} />
        </div>
      </div>

      {/* REPORT DETAILS */}
      {/* No overflow-hidden here: it would clip the Download menu when the list is short. */}
      <section className={`rounded-sm border border-line bg-white shadow-card transition-opacity ${fetchingClass}`}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              <span className="md:hidden">Details</span>
              <span className="hidden md:inline">Report details</span>
            </h2>
            <span className="hidden rounded-sm bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 md:inline">
              {filteredSales.length} {filteredSales.length === 1 ? 'bill' : 'bills'}
            </span>
          </div>

          {/* Desktop controls */}
          <div className="hidden items-center gap-2 md:flex">
            <div className="relative">
              <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={payModeFilter}
                onChange={(e) => setPayModeFilter(e.target.value as PayMode | 'all')}
                className="appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-blue-500"
              >
                <option value="all">All payment modes</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="due">Udhaar</option>
                <option value="other">Other</option>
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            </div>
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
              onChange={(e) => handleMobileSort(e.target.value)}
              className="appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="highest">Highest amount</option>
              <option value="lowest">Lowest amount</option>
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
                  {renderSortHeader('Date', 'createdAt')}
                  {renderSortHeader('Bill no.', 'invoiceNumber')}
                  {renderSortHeader('Party', 'partyName')}
                  {renderSortHeader('Items', 'items')}
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Paid by</th>
                  {renderSortHeader('Amount', 'totalAmount', 'right')}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      No bills in this period. Pick another period, or make a sale to see it here.
                    </td>
                  </tr>
                )}
                {filteredSales.map((sale) => {
                  const isOpen = selectedId === sale.id;
                  return (
                    <React.Fragment key={sale.id}>
                      <tr
                        onClick={() => setSelectedId(sale.id)}
                        className={`cursor-pointer border-t border-line transition ${isOpen ? 'bg-blue-50' : 'hover:bg-sunken'}`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFullDate(sale.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-600">{sale.invoiceNumber}</td>
                        <td className="px-4 py-3">
                          <p className="text-slate-800">{partyLabel(sale)}</p>
                          {!isWalkIn(sale) && sale.partyNumber && (
                            <p className="text-xs text-slate-500">{formatPhone(sale.partyNumber)}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{getSaleItemCount(sale)}</td>
                        <td className="px-4 py-3">{renderPayBadge(sale)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                          {formatCurrency(sale.totalAmount)}
                        </td>
                        <td className="px-2 py-3 text-slate-400">
                          <ChevronRight size={16} />
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
              {filteredSales.length > 0 && (
                <tfoot className="border-t border-line bg-sunken text-sm font-semibold text-slate-900">
                  <tr>
                    <td colSpan={3} className="px-4 py-3">
                      Total · {summary.totalTransactions} {summary.totalTransactions === 1 ? 'bill' : 'bills'}
                    </td>
                    <td className="px-4 py-3">{summary.totalItemsSold}</td>
                    <td />
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(summary.totalSales)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Mobile list */}
        <ul className="md:hidden">
          {filteredSales.length === 0 && (
            <li className="border-t border-line px-4 py-10 text-center text-sm text-slate-500">
              No bills in this period. Pick another period, or make a sale to see it here.
            </li>
          )}
          {filteredSales.map((sale) => (
            <li
              key={sale.id}
              onClick={() => setSelectedId(sale.id)}
              className="cursor-pointer border-t border-line px-4 py-3 active:bg-sunken"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold text-slate-900">{sale.invoiceNumber}</span>
                  {renderPayBadge(sale)}
                </div>
                <span className="shrink-0 font-semibold text-slate-900">{formatCurrency(sale.totalAmount)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span className="truncate">
                  {partyLabel(sale)} · {itemsLabel(getSaleItemCount(sale))}
                </span>
                <span className="shrink-0">{formatDayMonth(sale.createdAt)}</span>
              </div>
            </li>
          ))}
          {filteredSales.length > 0 && (
            <li className="flex items-center justify-between rounded-b-sm border-t border-line bg-sunken px-4 py-3 text-sm font-semibold text-slate-900">
              <span>
                Total · {summary.totalTransactions} {summary.totalTransactions === 1 ? 'bill' : 'bills'}
              </span>
              <span>{formatCurrency(summary.totalSales)}</span>
            </li>
          )}
        </ul>
      </section>

      <SaleBillPanel
        sale={selectedId ? filteredSales.find((s) => s.id === selectedId) ?? null : null}
        companyId={currentUser?.companyId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
};

export default SalesReport;
