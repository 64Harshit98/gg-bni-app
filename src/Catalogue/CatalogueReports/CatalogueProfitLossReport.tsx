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
// TODO: same return shape as POS usePnlReport (local cache + refresh), catalogue sales + pos/catalogue expenses
import { useCataloguePnlReport } from './useCataloguepnlreport';
import {
  formatDate,
  formatPercent,
  toPnlBill,
  type PnlBill,
} from '../../Pages/Reports/PNLReportComponents/pnlReport.utils';
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
import DetailPanel, {
  DetailItems,
  DetailRows,
  DetailSection,
} from '../../Pages/Reports/SalesReportComponents/DetailPanel';
import { Modal } from '../../constants/Modal';
import { resolveCompanyLogoBase64 } from '../hooks/useCompanyLogo';
import { useAuth } from '../../context/auth-context';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

type BillFilter = 'all' | 'missing' | 'loss';

/*
  Catalogue palette (from SELLAR artifact `.cat` wrapper):
  primary #c2410c = orange-700 | accent #f97316 = orange-500 | primary-soft #ffedd5 = orange-100
  canvas #fff5ec | warning #a16207 = yellow-700 (so warning never reads as brand)
*/

const CatalogueProfitLossReport: React.FC = () => {
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
  } = useCataloguePnlReport();

  const navigate = useNavigate();

  // Company name is cached locally so we don't pay a Firestore read on every visit.
  const [companyName, setCompanyName] = useState<string>('');
  useEffect(() => {
    const companyId = currentUser?.companyId;
    if (!companyId) return;
    const cacheKey = `cat_pnl_company_name_${companyId}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setCompanyName(cached);
        return;
      }
    } catch {
      /* ignore storage errors */
    }
    const fetchCompanyName = async () => {
      try {
        const snap = await getDoc(doc(db, 'companies', companyId, 'business_info', companyId));
        if (snap.exists()) {
          const name = snap.data().businessName || '';
          setCompanyName(name);
          try {
            if (name) localStorage.setItem(cacheKey, name);
          } catch {
            /* ignore storage errors */
          }
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

  // Shape the export code below uses.
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

  const money = (n: number) =>
    n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* ---------- PDF DOWNLOAD ---------- */
  const downloadAsPdf = async () => {
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const { totalRevenue, totalCost, grossProfit, grossProfitPercentage } = pnlSummary;

      // Generation tag (reserves space for logo)
      const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      const textWidth = pdf.getTextWidth(tagText);
      const paddingX = 2;
      const boxWidth = textWidth + paddingX * 2;
      const logoReservedWidth = 25;
      const boxX = pageWidth - 14 - logoReservedWidth - boxWidth;
      const boxY = 10;
      pdf.setFillColor(245, 245, 245);
      pdf.rect(boxX, boxY, boxWidth, 5, 'F');
      pdf.setTextColor(80, 80, 80);
      pdf.text(tagText, boxX + paddingX, boxY + 3.5);
      pdf.setTextColor(0, 0, 0);

      // Logo
      try {
        const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
        if (base64Logo) {
          const img = new Image();
          img.src = base64Logo;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const logoWidth = 15;
              const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
              pdf.addImage(base64Logo, 'PNG', pageWidth - logoWidth - 14, 8, logoWidth, logoHeight);
              resolve();
            };
            img.onerror = () => resolve();
          });
        }
      } catch {
        // Continue without logo
      }

      // Brand accent bar (catalogue orange)
      pdf.setFillColor(249, 115, 22);
      pdf.rect(0, 0, pageWidth, 6, 'F');

      // Header
      pdf.setFontSize(22);
      pdf.setTextColor(17, 24, 39);
      pdf.setFont('helvetica', 'bold');
      pdf.text(
        companyName ? `Profit & Loss Report — ${companyName}` : 'Profit & Loss Report',
        14,
        24,
      );

      pdf.setFontSize(10);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont('helvetica', 'normal');
      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      const start = appliedFilters ? formatDate(new Date(appliedFilters.start)) : 'All Time';
      const end = appliedFilters ? formatDate(new Date(appliedFilters.end)) : 'All Time';
      pdf.text(`Generated: ${generationDate}   |   Period: ${start} to ${end}`, 14, 31);

      // Summary block
      autoTable(pdf, {
        startY: 38,
        body: [
          ['TOTAL SALES (Rs.)', money(totalRevenue), 'NET PROFIT / LOSS (Rs.)', money(grossProfit)],
          ['TOTAL COST (Rs.)', money(totalCost), 'NET MARGIN', `${grossProfitPercentage.toFixed(2)}%`],
          ['TOTAL EXPENSES (Rs.)', money(pnlSummary.totalExpenses ?? 0), '', ''],
        ],
        theme: 'plain',
        styles: { font: 'helvetica', cellPadding: 4, fontSize: 11, textColor: [17, 24, 39] },
        columnStyles: {
          0: { fontStyle: 'bold', textColor: [107, 114, 128], cellWidth: 40 },
          1: { fontStyle: 'bold', halign: 'right', cellWidth: 40 },
          2: { fontStyle: 'bold', textColor: [107, 114, 128], cellWidth: 55 },
          3: { fontStyle: 'bold', halign: 'right', cellWidth: 40 },
        },
        didParseCell: function (data) {
          if (data.row.index <= 1 && data.column.index === 3) {
            const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, '').replace('%', ''));
            if (rawVal < 0) data.cell.styles.textColor = [220, 38, 38];
          }
        },
      });

      // Transactions table
      autoTable(pdf, {
        startY: (pdf as any).lastAutoTable.finalY + 12,
        head: [['DATE', 'INVOICE', 'SALES (Rs.)', 'COST (Rs.)', 'PROFIT (Rs.)']],
        body: filteredTransactions.map((t) => [
          formatDate(new Date(t.createdAt)),
          t.invoiceNumber || 'N/A',
          money(t.sales),
          t.costMissing ? `${money(t.cost)}*` : money(t.cost),
          money(t.profit),
        ]),
        foot: [['TOTAL', '-', money(totalRevenue), money(totalCost), money(pnlSummary.billProfit)]],
        showFoot: 'lastPage',
        theme: 'plain',
        styles: { font: 'helvetica', cellPadding: 7, fontSize: 10, textColor: [55, 65, 81] },
        headStyles: {
          fillColor: [255, 247, 237], // orange-50
          textColor: [17, 24, 39],
          fontStyle: 'bold',
          halign: 'center',
          lineWidth: { top: 1, bottom: 1 },
          lineColor: [254, 215, 170], // orange-200
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [17, 24, 39],
          fontStyle: 'bold',
          halign: 'right',
          lineWidth: { top: 1, bottom: 2 },
          lineColor: [17, 24, 39],
        },
        alternateRowStyles: { fillColor: [255, 251, 247] },
        columnStyles: {
          0: { halign: 'left', cellWidth: 35 },
          1: { halign: 'left', cellWidth: 'auto' },
          2: { halign: 'right', cellWidth: 35 },
          3: { halign: 'right', cellWidth: 35 },
          4: { halign: 'right', cellWidth: 35 },
        },
        didParseCell: function (data) {
          if ((data.section === 'body' || data.section === 'foot') && data.column.index === 4) {
            const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, ''));
            if (rawVal < 0) {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = 'bold';
            }
          }
          if (data.section === 'foot' && data.column.index === 0) {
            data.cell.styles.halign = 'left';
          }
        },
        didDrawPage: function () {
          const pageCount = (pdf.internal as any).getNumberOfPages();
          pdf.setFontSize(9);
          pdf.setTextColor(156, 163, 175);
          pdf.text(`Page ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
        },
      });

      if (filteredTransactions.some((t) => t.costMissing)) {
        const finalY = (pdf as any).lastAutoTable.finalY + 6;
        pdf.setFontSize(8);
        pdf.setTextColor(161, 98, 7); // yellow-700
        pdf.text('* Some items on this bill have no purchase price, so its profit is overstated.', 14, finalY);
      }

      pdf.save(`PNL_Report_${startDate}_to_${endDate}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate PDF file.' });
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
      const periodLabel = appliedFilters
        ? `Period: ${formatDate(new Date(appliedFilters.start))} – ${formatDate(new Date(appliedFilters.end))}`
        : 'Period: All';

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

      const dataStartRow = 7;
      const totalRows = dataStartRow + filteredTransactions.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      aoa[0][0] = companyName ? `Profit & Loss Report  —  ${companyName}` : 'Profit & Loss Report';
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Transactions: ${filteredTransactions.length}`;
      aoa[3][0] = 'SUMMARY';
      aoa[4][0] = `Total Sales: ₹${money(pnlSummary.totalRevenue)}   |   Total Cost: ₹${money(pnlSummary.totalCost)}   |   Expenses: ₹${money(pnlSummary.totalExpenses ?? 0)}   |   Net Profit: ₹${money(pnlSummary.grossProfit)}   |   Net Margin: ${pnlSummary.grossProfitPercentage.toFixed(2)}%`;
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

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

      const footerRow = dataStartRow + filteredTransactions.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = `${filteredTransactions.length} transactions`;
      aoa[footerRow][3] = Math.round(pnlSummary.totalRevenue);
      aoa[footerRow][4] = Math.round(pnlSummary.totalCost);
      aoa[footerRow][5] = Math.round(pnlSummary.billProfit);

      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map((c) => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 36 }, { hpt: 20 }, { hpt: 8 }, { hpt: 18 }, { hpt: 48 }, { hpt: 8 }, { hpt: 28 },
        ...filteredTransactions.map(() => ({ hpt: 20 })),
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
      style('A5', s({ sz: 10, bold: true, color: { rgb: '9A3412' } }, solidFill('FFF7ED'), { horizontal: 'center', vertical: 'center', wrapText: true }, bblr));

      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          solidFill('C2410C'),
          { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      const numericCols = new Set([3, 4, 5]);
      filteredTransactions.forEach((txn, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(txn.costMissing ? 'FEF9C3' : isAlt ? 'FFF7ED' : 'FFFFFF');
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
        if (txn.profit < 0) {
          const profitAddr = XLSX.utils.encode_cell({ r, c: 5 });
          if (worksheet[profitAddr]) {
            worksheet[profitAddr].s = s(
              { sz: 9, bold: true, color: { rgb: 'DC2626' } },
              rowBg,
              { horizontal: 'center', vertical: 'center' },
              bblr,
            );
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
            left: { style: 'thin', color: { rgb: 'FED7AA' } },
            right: { style: 'thin', color: { rgb: 'FED7AA' } },
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

      setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'Excel downloaded successfully!' });
    } catch {
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate Excel file.' });
    }
  };

  /* ---------- DOWNLOAD / SHARE ---------- */
  const runDownload = (action: () => void) => {
    if (filteredBills.length === 0) {
      setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No data available to download.' });
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
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-orange-900 ${
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
    const walkIn =
      !bill.partyName || ['n/a', 'walk-in', 'walk in', 'cash'].includes(bill.partyName.trim().toLowerCase());
    return (
      <DetailPanel
        open
        onClose={() => setSelectedId(null)}
        title={bill.invoiceNumber}
        badge={
          bill.costMissing ? (
            <span className="rounded-sm bg-yellow-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-yellow-700">No cost</span>
          ) : undefined
        }
        subtitle={`${formatFullDate(bill.createdAt)}, ${time} · ${walkIn ? 'Walk-in' : bill.partyName}`}
      >
        <DetailSection title="Profit on this bill">
          <DetailRows
            rows={[
              { label: 'Sale', value: formatCurrency(bill.sales) },
              { label: 'Cost', value: formatCurrency(bill.cost), tone: bill.costMissing ? 'text-yellow-700' : undefined },
              { label: 'Profit', value: signedCurrency(bill.profit), tone: profitClass(bill.profit), strong: true },
              { label: 'Margin', value: bill.margin === null ? '—' : formatPercent(bill.margin) },
            ]}
          />
          {bill.costMissing && (
            <p className="mt-2 rounded-sm bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
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
      bar: { left: 0, width: totals.sales > 0 ? 100 : 0, color: 'bg-orange-500' },
    },
    {
      label: '− Cost of goods',
      hint: 'Purchase price of items sold',
      value: -totals.cost,
      display: `− ${formatCurrency(Math.round(totals.cost))}`,
      bar: { left: pctOfSales(totals.gross), width: pctOfSales(totals.cost), color: 'bg-slate-400' },
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
          <div className="relative h-4 rounded-sm bg-orange-50">
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
      <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 border-t border-orange-100 pt-3 md:grid-cols-[9rem_1fr_5.5rem]">
        <div>
          <p className="text-xs font-semibold text-slate-900 md:text-sm">Net profit</p>
          <p className="hidden text-[11px] text-slate-500 md:block">{formatPercent(totals.netMargin)} of sales</p>
        </div>
        <div className="relative h-4 rounded-sm bg-orange-50">
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
      <div className="flex min-h-[60vh] items-center justify-center bg-[#fff5ec] text-sm text-slate-500">
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
      iconClass: 'bg-orange-100 text-orange-700',
      valueClass: 'text-orange-700',
    },
    {
      label: 'Total cost',
      value: formatCurrency(Math.round(totals.cost)),
      hint: 'of items sold',
      icon: Package,
      iconClass: 'bg-slate-100 text-slate-600',
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
      iconClass: 'bg-green-50 text-green-700',
      valueClass: profitClass(totals.net),
    },
    {
      label: 'Net margin',
      value: formatPercent(totals.netMargin),
      hint: `gross ${formatPercent(totals.grossMargin)}`,
      icon: Percent,
      iconClass: 'bg-orange-100 text-orange-700',
      valueClass: profitClass(totals.net),
    },
  ];

  // Old-range data stays on screen while a new range loads; dim it meanwhile.
  const fetchingClass = isFetching ? 'pointer-events-none opacity-50' : '';

  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? 'border-orange-700 bg-orange-700 text-white'
        : 'border-slate-300 bg-white text-slate-700 hover:border-orange-300'
    }`;

  const showNetRows = billFilter === 'all';

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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-slate-700 transition hover:bg-orange-100 md:border md:border-slate-300 md:bg-white"
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
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
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
            className="rounded-sm p-2 text-slate-700 transition hover:bg-orange-100"
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
          className={`hidden shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-orange-300 md:inline-flex ${
            datePreset === 'custom' ? 'border-orange-700' : 'border-slate-300'
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
        <div className="mb-3 rounded-sm border border-orange-100 bg-white p-4 shadow-card md:hidden">
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
            <div key={label} className="rounded-sm border border-orange-100 bg-white p-4 shadow-card">
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
          <div className="mb-4 hidden items-center gap-3 rounded-sm border border-yellow-200 bg-yellow-50 px-4 py-2.5 text-sm text-yellow-900 md:flex">
            <Tag size={16} className="shrink-0 text-yellow-600" />
            <p className="flex-1">
              <strong className="text-yellow-700">
                {totals.missingCount} of {plural(rangeBills.length, 'bill')} {totals.missingCount === 1 ? 'has' : 'have'} no
                purchase cost
              </strong>{' '}
              ({formatCurrency(Math.round(totals.missingSales))} of sales), so profit is shown higher than it really is.
              Add purchase prices to those items to fix it.
            </p>
            <button
              onClick={reviewMissingCost}
              className="shrink-0 rounded-sm border border-yellow-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition hover:border-yellow-400"
            >
              Review {plural(totals.missingItems, 'item')}
            </button>
          </div>
        )}

        {/* BREAKDOWN + CHART */}
        <div className="mb-3 grid gap-4 md:mb-4 md:grid-cols-5">
          <div className="rounded-sm border border-orange-100 bg-white p-4 shadow-card md:col-span-3">
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
            className="mb-3 flex w-full gap-2 rounded-sm border border-yellow-200 bg-yellow-50 p-3 text-left text-sm text-yellow-800 md:hidden"
          >
            <Tag size={15} className="mt-0.5 shrink-0 text-yellow-600" />
            <span>
              <strong>{plural(totals.missingCount, 'bill')} {totals.missingCount === 1 ? 'has' : 'have'} no cost</strong> —
              profit looks higher than it is.
            </span>
          </button>
        )}

        {/* BILL-WISE PROFIT */}
        {/* No overflow-hidden here: it would clip the Download menu when the list is short. */}
        <section ref={listRef} className="scroll-mt-4 rounded-sm border border-orange-100 bg-white shadow-card">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Bill-wise profit</h2>
              <span className="hidden rounded-sm bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800 md:inline">
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
                  className="appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition hover:border-orange-300 focus:border-orange-500"
                >
                  <option value="all">All bills</option>
                  <option value="missing">Cost missing</option>
                  <option value="loss">Loss-making</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
              <button
                onClick={() => setIsListVisible(!isListVisible)}
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
                <thead className="bg-orange-50 text-[11px] text-orange-800">
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
                    <tr
                      key={bill.id}
                      onClick={() => setSelectedId(bill.id)}
                      className={`cursor-pointer border-t border-orange-100 transition ${
                        selectedId === bill.id
                          ? 'bg-orange-100'
                          : bill.costMissing
                            ? 'bg-yellow-50/70 hover:bg-yellow-50'
                            : 'hover:bg-orange-50'
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFullDate(bill.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-orange-700">{bill.invoiceNumber}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatCurrency(bill.sales)}</td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right ${
                          bill.costMissing ? 'font-medium text-yellow-700' : 'text-slate-700'
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
                  ))}
                </tbody>
                {filteredBills.length > 0 && (
                  <tfoot className="border-t border-orange-100 bg-orange-50 text-sm">
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
                        <tr className="border-t border-orange-100 font-bold text-slate-900">
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
              <li className="border-t border-orange-100 px-4 py-10 text-center text-sm text-slate-500">
                No bills in this period. Pick another period to see your profit.
              </li>
            )}
            {filteredBills.map((bill) => (
              <li
                key={bill.id}
                onClick={() => setSelectedId(bill.id)}
                className={`cursor-pointer border-t border-orange-100 px-4 py-3 ${
                  bill.costMissing ? 'bg-yellow-50/70' : 'active:bg-orange-50'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-slate-900">{bill.invoiceNumber}</span>
                    {bill.costMissing && (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-yellow-700">No cost</span>
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
              <li className="space-y-1.5 rounded-b-sm border-t border-orange-100 bg-orange-50 px-4 py-3 text-sm">
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
                    <div className="flex justify-between border-t border-orange-100 pt-1.5 font-bold text-slate-900">
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

export default CatalogueProfitLossReport;