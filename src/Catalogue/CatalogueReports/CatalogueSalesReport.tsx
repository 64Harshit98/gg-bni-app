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
  IndianRupee,
  RefreshCw,
  Search,
  ShoppingBag,
  Tag,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { State } from '../../enums';
import { Modal } from '../../constants/Modal';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import {
  DATE_PRESETS,
  formatCurrency,
  formatDate,
  formatDateForInput,
  formatDayMonth,
  formatFullDate,
  formatRangeLabel,
  getPresetRange,
  getSaleItemCount,
  parseInputDate,
  type SaleRecord,
} from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
import ReportByDayChart from '../../Pages/Reports/SalesReportComponents/ReportByDayChart';
import DownloadMenu from '../../Pages/Reports/SalesReportComponents/DownloadMenu';
import CustomRangePanel from '../../Pages/Reports/SalesReportComponents/CustomRangePanel';
import useCatalogueSalesReport from './useCatalogueSalesReport';

const OrdersReport: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    const fetchCompanyName = async () => {
      if (!currentUser?.companyId) return;
      try {
        const ref = doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId);
        const snap = await getDoc(ref);
        if (snap.exists()) setCompanyName(snap.data().businessName || '');
      } catch (e) {
        console.error('Failed to fetch company name', e);
      }
    };
    fetchCompanyName();
  }, [currentUser?.companyId]);

  const {
    sales,
    isLoading,
    isFetching,
    lastUpdated,
    refresh,
    error,
    authLoading,
    datePreset,
    setDatePreset,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    appliedFilters,
    setAppliedFilters,
    sortConfig,
    setSortConfig,
  } = useCatalogueSalesReport();

  // Re-render every minute so the "Updated x min ago" label stays accurate.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const updatedLabel = useMemo(() => {
    if (!lastUpdated) return 'Refresh';
    const mins = Math.floor((now - lastUpdated) / 60_000);
    if (mins < 1) return 'Updated just now';
    if (mins < 60) return `Updated ${mins} min ago`;
    return `Updated at ${new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
  }, [lastUpdated, now]);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isListVisible, setIsListVisible] = useState(true);
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.SUCCESS,
    message: '',
  });

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

  const handleSort = (key: keyof SaleRecord) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  // The cache can hold a wider window than the applied range, so filter by date here too.
  const { filteredSales, summary, topCustomers } = useMemo(() => {
    if (!appliedFilters) {
      return {
        filteredSales: [] as SaleRecord[],
        summary: { totalSales: 0, totalTransactions: 0, totalItemsSold: 0, averageSaleValue: 0 },
        topCustomers: [] as [string, number][],
      };
    }
    const tokens = searchQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);

    const list = sales.filter((sale) => {
      if (sale.createdAt < appliedFilters.start || sale.createdAt > appliedFilters.end) return false;
      return tokens.every(
        (t) =>
          sale.invoiceNumber?.toLowerCase().includes(t) ||
          sale.partyName?.toLowerCase().includes(t) ||
          sale.items?.some((i) => i.name?.toLowerCase().includes(t)),
      );
    });

    list.sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'items') return (getSaleItemCount(a) - getSaleItemCount(b)) * dir;
      const valA = a[sortConfig.key] ?? '';
      const valB = b[sortConfig.key] ?? '';
      if (typeof valA === 'string' && typeof valB === 'string')
        return valA.localeCompare(valB, undefined, { numeric: true }) * dir;
      if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * dir;
      return 0;
    });

    const totalSales = list.reduce((s, x) => s + x.totalAmount, 0);
    const totalItemsSold = list.reduce((s, x) => s + getSaleItemCount(x), 0);
    const totals: Record<string, number> = {};
    list.forEach((x) => {
      totals[x.partyName] = (totals[x.partyName] || 0) + x.totalAmount;
    });

    return {
      filteredSales: list,
      summary: {
        totalSales,
        totalTransactions: list.length,
        totalItemsSold,
        averageSaleValue: list.length ? totalSales / list.length : 0,
      },
      topCustomers: Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
    };
  }, [sales, appliedFilters, searchQuery, sortConfig]);

  /* ---------- PDF DOWNLOAD ---------- */
  const downloadAsPdf = async () => {
    if (!appliedFilters) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // ===== GENERATION TAG (drawn first, reserves space on the right) =====
      const generatedAt = new Date().toLocaleString();
      const tagText = `Generated by SELLAR • ${generatedAt}`;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);

      const textWidth = doc.getTextWidth(tagText);
      const paddingX = 2;

      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = 5;

      const logoReservedWidth = 18; // space reserved for logo + gap, so tag never overlaps it
      const boxX = pageWidth - 14 - logoReservedWidth - boxWidth;
      const boxY = 11;

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

      // ===== ORANGE BAR =====
      doc.setFillColor(249, 115, 22);
      doc.rect(0, 0, pageWidth, 6, 'F');

      // ===== HEADER =====
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      const reportTitle = companyName ? `Orders Report — ${companyName}` : 'Orders Report';
      doc.text(reportTitle, 14, 24);

      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      let subtitleText = `Generated on: ${generationDate}`;
      subtitleText += `   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`;

      doc.text(subtitleText, 14, 31);

      // ===== TABLE =====
      autoTable(doc, {
        startY: 38,
        head: [['DATE', 'ORDER ID', 'CUSTOMER', 'ITEMS', 'AMOUNT (Rs.)']],
        body: filteredSales.map((sale) => [
          formatDate(sale.createdAt),
          sale.invoiceNumber,
          sale.partyName,
          getSaleItemCount(sale).toString(),
          sale.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ]),
        foot: [
          [
            'TOTAL',
            '-',
            '-',
            summary.totalItemsSold.toString(),
            summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ],
        ],
        showFoot: 'lastPage',
        theme: 'plain',
        styles: {
          font: 'helvetica',
          cellPadding: 5,
          fontSize: 10,
          textColor: [55, 65, 81],
          overflow: 'linebreak',
          valign: 'middle',
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
          0: { halign: 'center', cellWidth: 25 },
          1: { halign: 'center', cellWidth: 30 },
          2: { halign: 'left', cellWidth: 50 },
          3: { halign: 'right', cellWidth: 25 },
          4: { halign: 'right', cellWidth: 30 },
        },
        // Ensure CUSTOMER column header and body align identically
        didParseCell: function (data) {
          if (data.column.index === 2) {
            data.cell.styles.halign = 'left';
            data.cell.styles.cellPadding = 5;
          }
        },
        didDrawPage: function () {
          const pageCount = doc.getNumberOfPages();
          doc.setFontSize(9);
          doc.setTextColor(156, 163, 175);
          doc.text(`Page ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
        },
      });

      doc.save(`Orders_Report_${formatDateForInput(new Date())}.pdf`);

      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'PDF downloaded successfully!',
      });
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate PDF.',
      });
    }
  };

  /* ---------- EXCEL DOWNLOAD ---------- */
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
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      const periodLabel = `Period: ${formatDate(appliedFilters.start)} – ${formatDate(appliedFilters.end)}`;

      const COLS = [
        { header: '#', width: 6 },
        { header: 'Date', width: 16 },
        { header: 'Order ID', width: 28 },
        { header: 'Customer', width: 28 },
        { header: 'Items', width: 14 },
        { header: 'Amount (₹)', width: 26 },
      ];
      const colCount = COLS.length;

      // Row layout:
      // 0 Title (merged) | 1 Meta (merged) | 2 spacer | 3 Summary label (merged)
      // 4 Summary values | 5 spacer | 6 Column headers | 7+ Data rows | Last: Totals
      const dataStartRow = 7;
      const totalRows = dataStartRow + filteredSales.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      aoa[0][0] = companyName ? `Orders Report  —  ${companyName}` : 'Orders Report';
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Orders: ${summary.totalTransactions}`;
      aoa[3][0] = 'SUMMARY';
      aoa[4][0] = `Total Orders: ${summary.totalTransactions}   |   Total Sales: ₹${summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Items Sold: ${summary.totalItemsSold}`;

      COLS.forEach((c, i) => {
        aoa[6][i] = c.header;
      });

      filteredSales.forEach((sale, idx) => {
        const r = dataStartRow + idx;
        aoa[r][0] = idx + 1;
        aoa[r][1] = formatDate(sale.createdAt);
        aoa[r][2] = sale.invoiceNumber;
        aoa[r][3] = sale.partyName;
        aoa[r][4] = getSaleItemCount(sale);
        aoa[r][5] = Math.round(sale.totalAmount);
      });

      const footerRow = dataStartRow + filteredSales.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = `${filteredSales.length} orders`;
      aoa[footerRow][4] = summary.totalItemsSold;
      aoa[footerRow][5] = Math.round(summary.totalSales);

      // ── BUILD WORKSHEET ─────────────────────────────────────────────
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map((c) => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 36 },
        { hpt: 20 },
        { hpt: 8 },
        { hpt: 18 },
        { hpt: 22 },
        { hpt: 8 },
        { hpt: 28 },
        ...filteredSales.map(() => ({ hpt: 20 })),
        { hpt: 24 },
      ];

      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
        { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 3 } },
      ];

      const style = (addr: string, st: any) => {
        if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
        worksheet[addr].s = st;
      };

      style('A1', s(
        { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
        solidFill('EA580C'),
        { horizontal: 'center', vertical: 'center' },
      ));

      style('A2', s(
        { sz: 9, italic: true, color: { rgb: '7C2D12' } },
        solidFill('FFEDD5'),
        { horizontal: 'center', vertical: 'center' },
      ));

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

      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          solidFill('C2410C'),
          { horizontal: i <= 3 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      filteredSales.forEach((_sale, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'FFF7ED' : 'FFFFFF');

        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isNumeric = ci === 4 || ci === 5;
          style(addr, s(
            { sz: 9, color: { rgb: '1E293B' } },
            rowBg,
            { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
            bblr,
          ));
          if (ci === 5 && worksheet[addr]) {
            worksheet[addr].t = 'n';
            worksheet[addr].z = '₹#,##0.00';
          }
        }
      });

      for (let ci = 0; ci < colCount; ci++) {
        const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: '1E293B' } },
          solidFill('FED7AA'),
          { horizontal: ci <= 3 ? 'left' : 'center', vertical: 'center' },
          {
            top: { style: 'medium', color: { rgb: '1E293B' } },
            bottom: { style: 'medium', color: { rgb: '1E293B' } },
            left: { style: 'thin', color: { rgb: 'FED7AA' } },
            right: { style: 'thin', color: { rgb: 'FED7AA' } },
          },
        ));
        if (ci === 5 && worksheet[addr]) {
          worksheet[addr].t = 'n';
          worksheet[addr].z = '₹#,##0.00';
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders Report');
      XLSX.writeFile(
        workbook,
        `Orders-Report-${formatDate(appliedFilters.start)}-to-${formatDate(appliedFilters.end)}.xlsx`,
      );

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
      setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No data available to download.' });
      return;
    }
    action();
  };

  const shareOnWhatsApp = () => {
    if (!appliedFilters) return;
    const text = [
      `*Orders Report${companyName ? ` — ${companyName}` : ''}*`,
      formatRangeLabel(appliedFilters.start, appliedFilters.end),
      '',
      `Total sales: ${formatCurrency(Math.round(summary.totalSales))}`,
      `Orders: ${summary.totalTransactions} · Items sold: ${summary.totalItemsSold}`,
      `Avg order: ${formatCurrency(Math.round(summary.averageSaleValue))}`,
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  /* ---------- SORT HELPERS ---------- */
  const mobileSortValue =
    sortConfig.key === 'totalAmount'
      ? sortConfig.direction === 'desc' ? 'highest' : 'lowest'
      : sortConfig.key === 'createdAt' && sortConfig.direction === 'asc' ? 'oldest' : 'newest';

  const handleMobileSort = (value: string) => {
    const map: Record<string, { key: keyof SaleRecord; direction: 'asc' | 'desc' }> = {
      newest: { key: 'createdAt', direction: 'desc' },
      oldest: { key: 'createdAt', direction: 'asc' },
      highest: { key: 'totalAmount', direction: 'desc' },
      lowest: { key: 'totalAmount', direction: 'asc' },
    };
    setSortConfig(map[value] ?? map.newest);
  };

  const renderSortHeader = (label: string, sortKey: keyof SaleRecord, align: 'left' | 'right' = 'left') => {
    const isActive = sortConfig.key === sortKey;
    const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => handleSort(sortKey)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-orange-800 ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          {label}
          <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
        </button>
      </th>
    );
  };

  /* ---------- LOAD STATES ---------- */
  if (isLoading || authLoading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#fff5ec] text-sm text-slate-500">
        Loading orders report...
      </div>
    );
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  const rangeLabel = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : '';
  const rangeLabelShort = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end, false) : '';
  const itemsLabel = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
  const fetchingClass = isFetching ? 'pointer-events-none opacity-50' : '';

  const statCards = [
    {
      label: 'Total sales',
      shortLabel: 'Total sales',
      value: `₹${Math.round(summary.totalSales).toLocaleString('en-IN')}`,
      hint: `${summary.totalTransactions} completed orders`,
      icon: FileText,
      iconClass: 'bg-orange-100 text-orange-700',
      valueClass: 'text-orange-700',
    },
    {
      label: 'Total orders',
      shortLabel: 'Orders',
      value: summary.totalTransactions.toString(),
      hint: 'Completed / Paid',
      icon: ShoppingBag,
      iconClass: 'bg-pink-50 text-pink-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Items sold',
      shortLabel: 'Items sold',
      value: summary.totalItemsSold.toLocaleString('en-IN'),
      hint: `${
        summary.totalTransactions > 0 ? (summary.totalItemsSold / summary.totalTransactions).toFixed(1) : '0'
      } items per order`,
      icon: Tag,
      iconClass: 'bg-blue-50 text-blue-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Avg order value',
      shortLabel: 'Avg order',
      value: `₹${Math.round(summary.averageSaleValue).toLocaleString('en-IN')}`,
      hint: 'per order',
      icon: IndianRupee,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-slate-900',
    },
  ];

  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
    }`;

  return (
    <div className="min-h-screen bg-[#fff5ec] px-3 pb-20 pt-3 md:px-6 md:pb-8 md:pt-5">
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
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Orders report</h1>
            <span className="hidden text-xs text-slate-500 md:inline">
              {summary.totalTransactions} orders · {rangeLabelShort}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            <span className="truncate md:hidden">{rangeLabel} ·</span>
            <button
              onClick={refresh}
              disabled={isFetching}
              title="Fetch the latest orders"
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
            placeholder="Search order ID, customer or item"
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
            placeholder="Search order ID, customer or item"
            autoFocus
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
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

      {/* SUMMARY */}
      <div className={`mb-4 grid grid-cols-2 gap-2.5 transition-opacity md:grid-cols-4 md:gap-4 ${fetchingClass}`}>
        {statCards.map(({ label, shortLabel, value, hint, icon: Icon, iconClass, valueClass }) => (
          <div key={label} className="rounded-sm border border-[#f6e1d0] bg-white shadow-card p-3 md:p-4">
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

      {/* CHART + TOP CUSTOMERS */}
      <div className={`mb-4 grid gap-4 transition-opacity md:grid-cols-5 ${fetchingClass}`}>
        <div className="md:col-span-3">
          {appliedFilters && (
            <ReportByDayChart
              records={filteredSales}
              start={appliedFilters.start}
              end={appliedFilters.end}
              noun="Sales"
              barClass="bg-orange-500 group-hover:bg-orange-600"
            />
          )}
        </div>
        <div className="md:col-span-2">
          <div className="h-full rounded-sm border border-[#f6e1d0] bg-white shadow-card p-4">
            <h3 className="text-sm font-semibold text-slate-900">Top 5 customers</h3>
            <div className="mt-3 space-y-3">
              {topCustomers.length === 0 && (
                <p className="py-4 text-center text-sm text-slate-500">No customer data for this period.</p>
              )}
              {topCustomers.map(([name, total], i) => (
                <div key={name} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-orange-100 text-xs font-bold text-orange-700">
                      {i + 1}
                    </span>
                    <span className="truncate text-sm text-slate-800">{name}</span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-900">{formatCurrency(total)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* REPORT DETAILS */}
      <section className={`rounded-sm border border-[#f6e1d0] bg-white shadow-card transition-opacity ${fetchingClass}`}>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              <span className="md:hidden">Details</span>
              <span className="hidden md:inline">Report details</span>
            </h2>
            <span className="hidden rounded-sm bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 md:inline">
              {filteredSales.length} {filteredSales.length === 1 ? 'order' : 'orders'}
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
              onWhatsApp={shareOnWhatsApp}
            />
          </div>

          <div className="relative md:hidden">
            <select
              value={mobileSortValue}
              onChange={(e) => handleMobileSort(e.target.value)}
              className="appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-orange-600"
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
              <thead className="bg-[#fff8f2] text-[11px] text-orange-800/80">
                <tr>
                  {renderSortHeader('Date', 'createdAt')}
                  {renderSortHeader('Order ID', 'invoiceNumber')}
                  {renderSortHeader('Customer', 'partyName')}
                  {renderSortHeader('Items', 'items')}
                  {renderSortHeader('Amount', 'totalAmount', 'right')}
                </tr>
              </thead>
              <tbody>
                {filteredSales.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                      No completed orders in this period. Pick another period to see more.
                    </td>
                  </tr>
                )}
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="border-t border-[#f6e1d0] transition hover:bg-[#fff8f2]">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFullDate(sale.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-orange-700">{sale.invoiceNumber}</td>
                    <td className="px-4 py-3 text-slate-800">{sale.partyName}</td>
                    <td className="px-4 py-3 text-slate-700">{getSaleItemCount(sale)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                      {formatCurrency(sale.totalAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filteredSales.length > 0 && (
                <tfoot className="border-t border-[#f6e1d0] bg-[#fff8f2] text-sm font-semibold text-slate-900">
                  <tr>
                    <td colSpan={3} className="px-4 py-3">
                      Total · {summary.totalTransactions} {summary.totalTransactions === 1 ? 'order' : 'orders'}
                    </td>
                    <td className="px-4 py-3">{summary.totalItemsSold}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(summary.totalSales)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Mobile list */}
        <ul className="md:hidden">
          {filteredSales.length === 0 && (
            <li className="border-t border-[#f6e1d0] px-4 py-10 text-center text-sm text-slate-500">
              No completed orders in this period. Pick another period to see more.
            </li>
          )}
          {filteredSales.map((sale) => (
            <li key={sale.id} className="border-t border-[#f6e1d0] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-semibold text-slate-900">{sale.invoiceNumber}</span>
                <span className="shrink-0 font-semibold text-slate-900">{formatCurrency(sale.totalAmount)}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span className="truncate">
                  {sale.partyName} · {itemsLabel(getSaleItemCount(sale))}
                </span>
                <span className="shrink-0">{formatDayMonth(sale.createdAt)}</span>
              </div>
            </li>
          ))}
          {filteredSales.length > 0 && (
            <li className="flex items-center justify-between rounded-b-sm border-t border-[#f6e1d0] bg-[#fff8f2] px-4 py-3 text-sm font-semibold text-slate-900">
              <span>
                Total · {summary.totalTransactions} {summary.totalTransactions === 1 ? 'order' : 'orders'}
              </span>
              <span>{formatCurrency(summary.totalSales)}</span>
            </li>
          )}
        </ul>
      </section>
    </div>
  );
};

export default OrdersReport;