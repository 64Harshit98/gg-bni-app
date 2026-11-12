import React, { useMemo, useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
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
import { State, PLANS } from '../../enums';
import { useSalesSettings } from '../../context/SettingsContext';
import { normalizePlan } from '../../context/Plan';
import { useInvoiceCommunication } from '../Journal/hooks';
import { InvoiceActionSheet, PrintSubMenuModal, QrCodeModal } from '../Journal/components';
import type { Invoice } from '../Journal/journal.types';
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
import sellarLogo from '../../assets/sellar-logo.png';
import { useAuth } from '../../context/auth-context';
import BackButton from '../../Components/BackButton';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

type BillFilter = 'all' | 'missing' | 'loss';

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

const fmtDay = (ts: number, withWeekday = false) => {
  const d = new Date(ts);
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const wd = d.toLocaleString('en-US', { weekday: 'short' });
  const base = `${d.getDate()} ${mon} ${d.getFullYear()}`;
  return withWeekday ? `${wd}, ${base}` : base;
};

const fmtDayMonth = (ts: number) => {
  const d = new Date(ts);
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
};

const fmt2 = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

  /* ---------- BILL ACTION SHEET (WhatsApp / Download / Print / QR) ---------- */
  const { salesSettings } = useSalesSettings();
  const [actionModal, setActionModal] = useState<{ message: string; type: State } | null>(null);
  const [isPosBasicPlan, setIsPosBasicPlan] = useState(false);

  useEffect(() => {
    const fetchPlan = async () => {
      if (!currentUser?.companyId) return;
      try {
        const snap = await getDoc(doc(db, 'companies', currentUser.companyId));
        if (snap.exists()) {
          const plan = normalizePlan(snap.data().pack);
          setIsPosBasicPlan(plan === PLANS.POS_BASIC || plan === PLANS.CALC_CATALOG);
        }
      } catch (e) {
        console.error('Failed to fetch plan', e);
      }
    };
    fetchPlan();
  }, [currentUser?.companyId]);

  const {
    invoiceToPrint, setInvoiceToPrint,
    showQrModal, setShowQrModal,
    sendingPdf,
    showPrintSubMenu, setShowPrintSubMenu,
    enableTriplicate,
    billType, setBillType,
    handlePdfAction,
    handleSendWhatsapp,
    handleSendWhatsappSnapto,
    handleShowQr,
  } = useInvoiceCommunication({ currentUser, salesSettings, isPosBasicPlan, setModal: setActionModal });

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
      const M = 14;
      const PAD = 4;
      const brandRight = pageWidth - M;
      const contentW = pageWidth - M * 2;
      const company = companyName || 'Your Business';
      const billWord = (n: number) => (n === 1 ? 'bill' : 'bills');
      const entryWord = (n: number) => (n === 1 ? 'entry' : 'entries');

      const { totalRevenue, totalCost, billProfit, grossProfit, grossProfitPercentage } = pnlSummary;
      const expenseTotal = pnlSummary.totalExpenses ?? 0;
      const billCount = filteredTransactions.length;
      const missingCount = filteredTransactions.filter((t) => t.costMissing).length;
      const anyMissing = missingCount > 0;
      const signedRs = (v: number) =>
        `${v < 0 ? '-' : ''}Rs. ${Math.round(Math.abs(v)).toLocaleString('en-IN')}`;
      const pctOfSales = (v: number) => (totalRevenue > 0 ? (v / totalRevenue) * 100 : 0);

      const rangeStart =
        appliedFilters?.start ??
        (billCount ? Math.min(...filteredTransactions.map((t) => t.createdAt)) : Date.now());
      const rangeEnd =
        appliedFilters?.end ??
        (billCount ? Math.max(...filteredTransactions.map((t) => t.createdAt)) : Date.now());

      const generatedAtText = `Generated ${new Date().toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })}`;
      const sameYear = new Date(rangeStart).getFullYear() === new Date(rangeEnd).getFullYear();
      const periodText = sameYear
        ? `${fmtDayMonth(rangeStart)} – ${fmtDay(rangeEnd)}`
        : `${fmtDay(rangeStart)} – ${fmtDay(rangeEnd)}`;
      const periodDays = Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000));

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

      const INK: RGB = [17, 24, 39];
      const GRAY: RGB = [107, 114, 128];
      const RED: RGB = [220, 38, 38];
      const AMBER: RGB = [180, 83, 9];
      const GREEN: RGB = [4, 120, 87];
      const netColor: RGB = grossProfit < 0 ? RED : GREEN;

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

      // TrendingUp icon (lucide, 24x24 grid -> 7mm), green
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
      doc.setDrawColor(5, 150, 105);
      doc.setLineWidth(0.5);
      doc.setLineCap('round');
      doc.setLineJoin('round');
      seg([[22, 7], [13.5, 15.5], [8.5, 10.5], [2, 17]]);
      seg([[16, 7], [22, 7], [22, 13]]);
      doc.setLineCap('butt');
      doc.setLineJoin('miter');

      // Report period (right) - measured first so the title can shrink to fit
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      const periodW = doc.getTextWidth(periodText);

      doc.setFont('helvetica', 'bold');
      let titleSize = 26;
      doc.setFontSize(titleSize);
      const titleAvail = brandRight - periodW - 8 - 32;
      while (doc.getTextWidth('Profit & Loss Report') > titleAvail && titleSize > 16) {
        titleSize -= 0.5;
        doc.setFontSize(titleSize);
      }
      doc.setTextColor(255, 255, 255);
      doc.text('Profit & Loss Report', 32, 38);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(190, 205, 255);
      doc.text('Profit after cost and expenses', 32, 44.5);

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

      // ---------- 2. SUMMARY CARDS (content-based widths) ----------
      const cardY = 50;
      const cardH = 32;
      const kpiPad = 6;

      const cardsData = [
        {
          label: 'Net profit',
          value: signedRs(grossProfit),
          hint: `${grossProfitPercentage.toFixed(2)}% margin`,
        },
        {
          label: 'Total sales',
          value: `Rs. ${Math.round(totalRevenue).toLocaleString('en-IN')}`,
          hint: `${billCount} ${billWord(billCount)}`,
        },
        {
          label: 'Total cost',
          value: `Rs. ${Math.round(totalCost).toLocaleString('en-IN')}`,
          hint: `${pctOfSales(totalCost).toFixed(2)}% of sales`,
        },
        {
          label: 'Total expenses',
          value: `Rs. ${Math.round(expenseTotal).toLocaleString('en-IN')}`,
          hint: `${rangeExpenses.length} ${entryWord(rangeExpenses.length)}`,
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
      // first card tinted (green for profit, red for loss)
      if (grossProfit < 0) doc.setFillColor(254, 242, 242);
      else doc.setFillColor(236, 253, 245);
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
        if (i === 0) doc.setTextColor(netColor[0], netColor[1], netColor[2]);
        else doc.setTextColor(17, 24, 39);
        doc.text(c.value, cx, cardY + 20);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(120, 128, 150);
        doc.text(c.hint, cx, cardY + 27);
      });

      // ---------- 3. WHERE YOUR SALES WENT (STACKED BAR) ----------
      const barCardY = cardY + cardH + 8;
      const barCardH = 38;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(M, barCardY, contentW, barCardH, PDF_RADIUS, PDF_RADIUS, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.text('Where your sales went', M + 6, barCardY + 10);

      {
        const t1 = 'Net profit is ';
        const t2 = `${grossProfitPercentage.toFixed(2)}%`;
        const t3 = ' of sales';
        const ty = barCardY + 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const w1 = doc.getTextWidth(t1);
        const w3 = doc.getTextWidth(t3);
        doc.setFont('helvetica', 'bold');
        const w2 = doc.getTextWidth(t2);
        let bx = brandRight - 6 - w1 - w2 - w3;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text(t1, bx, ty);
        bx += w1;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 24, 39);
        doc.text(t2, bx, ty);
        bx += w2;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text(t3, bx, ty);
      }

      const barX = M + 6;
      const barY = barCardY + 15;
      const barW = contentW - 12;
      const barH = 4.5;
      const COST_C: RGB = [100, 116, 139];
      const EXP_C: RGB = [203, 213, 225];
      const NET_C: RGB = [5, 150, 105];

      doc.setFillColor(226, 232, 240);
      doc.roundedRect(barX, barY, barW, barH, PDF_RADIUS, PDF_RADIUS, 'F');

      const parts: { v: number; c: RGB }[] = [
        { v: Math.max(totalCost, 0), c: COST_C },
        { v: Math.max(expenseTotal, 0), c: EXP_C },
        { v: Math.max(grossProfit, 0), c: NET_C },
      ].filter((p) => p.v > 0);
      const partsTotal = parts.reduce((s, p) => s + p.v, 0);
      if (partsTotal > 0) {
        const gap = 0.6;
        let sx = barX;
        parts.forEach((p, i) => {
          const rawW = (p.v / partsTotal) * barW;
          const w = Math.max(rawW - (i < parts.length - 1 ? gap : 0), 0.8);
          doc.setFillColor(p.c[0], p.c[1], p.c[2]);
          doc.roundedRect(sx, barY, w, barH, PDF_RADIUS, PDF_RADIUS, 'F');
          sx += rawW;
        });
      }

      const legend = [
        { label: 'Cost', v: totalCost, pct: pctOfSales(totalCost), c: COST_C },
        { label: 'Expenses', v: expenseTotal, pct: pctOfSales(expenseTotal), c: EXP_C },
        { label: 'Net profit', v: grossProfit, pct: grossProfitPercentage, c: NET_C },
      ];
      const legW = barW / 3;
      const legY = barY + barH + 8;
      legend.forEach((l, i) => {
        const lx = barX + i * legW;
        doc.setFillColor(l.c[0], l.c[1], l.c[2]);
        doc.roundedRect(lx, legY - 2.4, 2.6, 2.6, PDF_RADIUS, PDF_RADIUS, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(17, 24, 39);
        doc.text(l.label, lx + 4.6, legY);
        doc.setFontSize(8.5);
        doc.setTextColor(120, 128, 150);
        doc.text(`${signedRs(l.v)}  ${l.pct.toFixed(2)}% of sales`, lx + 4.6, legY + 5);
      });

      // ---------- 3b. PROFIT IS OVERSTATED (only when cost is missing) ----------
      let afterBlocksY = barCardY + barCardH;
      if (anyMissing) {
        const warnY = afterBlocksY + 8;
        const lineH = 4.6;
        const textX = M + 13;
        const availW = contentW - 13 - 6;
        const lead = 'Profit is overstated.';
        const body = `${missingCount} of ${billCount} ${billWord(billCount)} include items with no purchase price, so their cost is counted as Rs. 0. Add purchase prices to your items to see your true profit.`;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        const leadW = doc.getTextWidth(lead + ' ');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);

        const wrapWords = (text: string, firstW: number, nextW: number) => {
          const lines: string[] = [];
          let cur = '';
          let limit = firstW;
          text.split(' ').forEach((w) => {
            const t = cur ? `${cur} ${w}` : w;
            if (!cur || doc.getTextWidth(t) <= limit) {
              cur = t;
            } else {
              lines.push(cur);
              cur = w;
              limit = nextW;
            }
          });
          if (cur) lines.push(cur);
          return lines;
        };
        const lines = wrapWords(body, availW - leadW, availW);
        const warnH = 7.2 + (lines.length - 1) * lineH + 5.5;

        doc.setFillColor(255, 248, 225);
        doc.setDrawColor(252, 227, 160);
        doc.setLineWidth(0.3);
        doc.roundedRect(M, warnY, contentW, warnH, PDF_RADIUS, PDF_RADIUS, 'FD');

        // warning triangle
        const tcx = M + 7;
        const tcy = warnY + warnH / 2;
        doc.setDrawColor(AMBER[0], AMBER[1], AMBER[2]);
        doc.setLineWidth(0.4);
        doc.setLineJoin('round');
        doc.line(tcx, tcy - 2.8, tcx + 2.9, tcy + 2.2);
        doc.line(tcx + 2.9, tcy + 2.2, tcx - 2.9, tcy + 2.2);
        doc.line(tcx - 2.9, tcy + 2.2, tcx, tcy - 2.8);
        doc.line(tcx, tcy - 0.8, tcx, tcy + 0.7);
        doc.setFillColor(AMBER[0], AMBER[1], AMBER[2]);
        doc.circle(tcx, tcy + 1.5, 0.25, 'F');
        doc.setLineJoin('miter');

        const y0 = warnY + 7.2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(113, 63, 18);
        doc.text(lead, textX, y0);
        doc.setFont('helvetica', 'normal');
        doc.text(lines[0] || '', textX + leadW, y0);
        for (let i = 1; i < lines.length; i++) {
          doc.text(lines[i], textX, y0 + i * lineH);
        }

        afterBlocksY = warnY + warnH;
      }

      // ---------- 4. PROFIT BY BILL (date-wise groups) ----------
      const listY = afterBlocksY + 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(17, 24, 39);
      doc.text('Profit by bill', M, listY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(107, 114, 128);
      doc.text(`${billCount} ${billWord(billCount)}`, brandRight, listY, { align: 'right' });

      const dayKey = (ts: number) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      };
      const groupMap = new Map<string, { ts: number; bills: PnlBill[] }>();
      filteredTransactions.forEach((t) => {
        const key = dayKey(t.createdAt);
        if (!groupMap.has(key)) groupMap.set(key, { ts: t.createdAt, bills: [] });
        groupMap.get(key)!.bills.push(t);
      });
      const groups = Array.from(groupMap.values()).sort((a, b) => b.ts - a.ts);

      const groupFill: RGB = [243, 246, 254];
      const tableBody: any[] = [];
      const groupMeta = new Map<number, { date: string; count: string }>();

      groups.forEach((g) => {
        g.bills.sort((a, b) => b.createdAt - a.createdAt);
        const gSales = g.bills.reduce((n, b) => n + b.sales, 0);
        const gCost = g.bills.reduce((n, b) => n + b.cost, 0);
        const gProfit = gSales - gCost;
        const gMissing = g.bills.some((b) => b.costMissing);
        const dateText = fmtDay(g.ts, true);

        groupMeta.set(tableBody.length, {
          date: dateText,
          count: `${g.bills.length} ${billWord(g.bills.length)}`,
        });
        tableBody.push([
          { content: dateText, styles: { fontStyle: 'bold', fillColor: groupFill } },
          { content: fmt2(gSales), styles: { halign: 'right', fontStyle: 'bold', fillColor: groupFill } },
          {
            content: gMissing ? `${fmt2(gCost)}*` : fmt2(gCost),
            styles: { halign: 'right', fontStyle: 'bold', fillColor: groupFill, textColor: gMissing ? AMBER : INK },
          },
          {
            content: fmt2(gProfit),
            styles: { halign: 'right', fontStyle: 'bold', fillColor: groupFill, textColor: gProfit < 0 ? RED : INK },
          },
        ]);

        g.bills.forEach((t) => {
          const costText = t.costMissing ? (t.cost === 0 ? '—*' : `${fmt2(t.cost)}*`) : fmt2(t.cost);
          tableBody.push([
            { content: t.invoiceNumber || 'N/A', styles: { fontStyle: 'bold' } },
            { content: fmt2(t.sales), styles: { halign: 'right' } },
            {
              content: costText,
              styles: { halign: 'right', textColor: t.costMissing ? AMBER : GRAY },
            },
            {
              content: fmt2(t.profit),
              styles: { halign: 'right', textColor: t.profit < 0 ? RED : INK },
            },
          ]);
        });
      });

      const footCountText = `${billCount} ${billWord(billCount)}`;

      // Invoice/Date | Sales | Cost | Profit  (total = contentW = 182mm)
      const COLW = [62, 40, 40, 40];

      autoTable(doc, {
        startY: listY + 4,
        margin: { top: 26, bottom: 22, left: M, right: M },
        head: [['Invoice', 'Sales (Rs.)', 'Cost (Rs.)', 'Profit (Rs.)']],
        body: tableBody,
        foot: [
          [
            { content: 'Total', styles: { fontStyle: 'bold' } },
            { content: `Rs. ${fmt2(totalRevenue)}`, styles: { halign: 'right', fontStyle: 'bold' } },
            {
              content: `Rs. ${fmt2(totalCost)}${anyMissing ? '*' : ''}`,
              styles: { halign: 'right', fontStyle: 'bold', textColor: anyMissing ? AMBER : INK },
            },
            {
              content: `Rs. ${fmt2(billProfit)}`,
              styles: { halign: 'right', fontStyle: 'bold', textColor: billProfit < 0 ? RED : INK },
            },
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
          1: { cellWidth: COLW[1], halign: 'right' },
          2: { cellWidth: COLW[2], halign: 'right' },
          3: { cellWidth: COLW[3], halign: 'right' },
        },
        didParseCell: (data) => {
          data.cell.styles.valign = 'middle';

          // Header and Total row numeric columns right-aligned (matches body)
          if (data.section !== 'body' && data.column.index >= 1) {
            data.cell.styles.halign = 'right';
          }

          // Very long totals -> shrink font so they don't wrap
          if (data.section === 'foot' && data.column.index >= 1) {
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

          // Day group: "4 bills" in gray right after the date
          if (data.section === 'body' && data.column.index === 0) {
            const meta = groupMeta.get(data.row.index);
            if (meta) {
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(10.5);
              const dw = doc.getTextWidth(meta.date);
              doc.setFont('helvetica', 'normal');
              doc.setFontSize(9.5);
              doc.setTextColor(107, 114, 128);
              doc.text(meta.count, x + PAD + dw + 3, y + height / 2 + 1.2);
            }
          }

          // Total row: "12 bills" in gray right after "Total"
          if (data.section === 'foot' && data.column.index === 0) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            const tw = doc.getTextWidth('Total');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9.5);
            doc.setTextColor(107, 114, 128);
            doc.text(footCountText, x + PAD + tw + 3, y + height / 2 + 1.2);
          }

          // Horizontal lines only (no column grid)
          if (data.section === 'head') {
            doc.setDrawColor(5, 150, 105);
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

      // Cost-missing note (same message as before)
      if (anyMissing) {
        let noteY = (doc as any).lastAutoTable.finalY + 6;
        if (noteY > pageHeight - 24) {
          doc.addPage();
          noteY = 34;
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(180, 83, 9);
        doc.text('* Some items on this bill have no purchase price, so its profit is overstated.', M, noteY);
      }

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
          doc.text(`Profit & Loss Report | ${periodText}`, brandRight, 15.4, { align: 'right' });
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

        doc.text(`${company} | Profit & Loss Report | Page ${i} of ${totalPages}`, brandRight, fy, {
          align: 'right',
        });
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

  /* ---------- VIEW BILL → ACTION SHEET ---------- */
  const openBillActions = async (billId: string) => {
    if (!currentUser?.companyId) return;
    const sale = sales.find((s) => s.id === billId);
    if (!sale) return;
    setSelectedId(null); // close the detail panel
    try {
      // Full sale document so the PDF gets tax, discount, GST etc.
      const snap = await getDoc(doc(db, 'companies', currentUser.companyId, 'sales', billId));
      const data: any = snap.exists() ? snap.data() : {};
      const dueAmount = Math.max(Number(sale.paymentMethods?.due ?? sale.dueAmount) || 0, 0);
      setInvoiceToPrint({
        ...data,
        id: billId,
        type: 'Credit', // Journal uses 'Credit' for sale bills
        invoiceNumber: data.invoiceNumber ?? sale.invoiceNumber,
        partyName: data.partyName || sale.partyName,
        partyNumber: data.partyNumber || sale.partyNumber,
        amount: data.totalAmount ?? sale.totalAmount,
        dueAmount,
        status: dueAmount > 0 ? 'Unpaid' : 'Paid',
        items: data.items || sale.items || [],
        paymentMethods: data.paymentMethods || sale.paymentMethods || {},
        paymentHistory: data.paymentHistory || [],
        time: new Date(sale.createdAt).toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
        }),
      } as unknown as Invoice);
    } catch (err) {
      console.error('Open bill failed:', err);
      setActionModal({ message: 'Could not load the bill. Please try again.', type: State.ERROR });
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
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-blue-800 ${align === 'right' ? 'flex-row-reverse' : ''
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
            <button
              type="button"
              onClick={() => openBillActions(bill.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-sm bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <ExternalLink size={15} /> View bill
            </button>
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
      hint: `${plural(rangeExpenses.length, 'entry', 'entries')}${expenseTitles.length ? ` · ${expenseTitles.slice(0, 2).join(', ')}${expenseTitles.length > 2 ? '…' : ''}` : ''
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
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${active
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
        <div className="flex-shrink-0">
          <BackButton />
        </div>

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
          className={`hidden shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 md:inline-flex ${datePreset === 'custom' ? 'border-slate-900' : 'border-slate-300'
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
                        className={`cursor-pointer border-t border-line transition ${selectedId === bill.id ? 'bg-blue-50' : bill.costMissing ? 'bg-amber-50/70 hover:bg-amber-50' : 'hover:bg-sunken'
                          }`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFullDate(bill.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-600">{bill.invoiceNumber}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{formatCurrency(bill.sales)}</td>
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right ${bill.costMissing ? 'font-medium text-amber-700' : 'text-slate-700'
                            }`}
                        >
                          {formatCurrency(bill.cost)}
                          {bill.costMissing && ' · cost missing'}
                        </td>
                        <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${profitClass(bill.profit)}`}>
                          {signedCurrency(bill.profit)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-4 py-3 text-right text-xs font-semibold ${bill.margin === null ? 'text-slate-400' : profitClass(bill.margin)
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
                className={`cursor-pointer border-t border-line px-4 py-3 ${bill.costMissing ? 'bg-amber-50/70' : 'active:bg-sunken'
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

      {actionModal && (
        <Modal
          message={actionModal.message}
          type={actionModal.type}
          onClose={() => setActionModal(null)}
          onConfirm={() => setActionModal(null)}
          showConfirmButton={false}
        />
      )}
      {invoiceToPrint && (
        <InvoiceActionSheet
          invoiceToPrint={invoiceToPrint}
          setInvoiceToPrint={setInvoiceToPrint}
          setShowPrintSubMenu={setShowPrintSubMenu}
          isPosBasicPlan={isPosBasicPlan}
          billType={billType}
          setBillType={setBillType}
          sendingPdf={sendingPdf}
          companyId={currentUser?.companyId}
          handleSendWhatsapp={handleSendWhatsapp}
          handleSendWhatsappSnapto={handleSendWhatsappSnapto}
          handlePdfAction={handlePdfAction}
          handleShowQr={handleShowQr}
        />
      )}
      {!isPosBasicPlan && showPrintSubMenu && invoiceToPrint && (
        <PrintSubMenuModal
          invoiceToPrint={invoiceToPrint}
          setInvoiceToPrint={setInvoiceToPrint}
          setShowPrintSubMenu={setShowPrintSubMenu}
          billType={billType}
          enableTriplicate={enableTriplicate}
          handlePdfAction={handlePdfAction}
        />
      )}
      {showQrModal && (
        <QrCodeModal
          showQrModal={showQrModal}
          setShowQrModal={setShowQrModal}
          companyId={currentUser?.companyId}
        />
      )}
    </div>
  );
};

export default PnlReportPage;
