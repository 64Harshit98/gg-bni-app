import React, { useMemo, useState, useEffect } from 'react';
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
import BackButton from '../../Components/BackButton';
import { State } from '../../enums';
import { Modal } from '../../constants/Modal';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import sellarLogo from '../../assets/sellar-logo.png';
import { OrderActionSheet, PrintSubMenuModal, QrCodeModal } from '../Orders/components';
import { useOrderCommunication } from '../Orders/hooks';
import type { Order } from '../Orders/orders.types';
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
import DetailPanel, { DetailItems, DetailRows, DetailSection } from '../../Pages/Reports/SalesReportComponents/DetailPanel';
import useCatalogueSalesReport from './useCatalogueSalesReport';

/* ---------- PDF HELPERS (same look as Sales Report PDF, catalogue orange) ---------- */
type RGB = [number, number, number];
const PDF_RADIUS = 0.5; // ≈ Tailwind rounded-sm

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

const fmtDayMonth = (ts: number, withWeekday = false) => {
  const d = new Date(ts);
  const mon = d.toLocaleString('en-US', { month: 'short' });
  const wd = d.toLocaleString('en-US', { weekday: 'short' });
  const base = `${d.getDate()} ${mon}`;
  return withWeekday ? `${wd}, ${base}` : base;
};

const fmt2 = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const niceMax = (v: number) => {
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / exp;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  return (steps.find((s) => f <= s + 1e-9) ?? 10) * exp;
};

const fmtCompact = (n: number) => {
  const trim = (x: number) => String(Math.round(x * 10) / 10);
  if (n >= 1e7) return `${trim(n / 1e7)}Cr`;
  if (n >= 1e5) return `${trim(n / 1e5)}L`;
  if (n >= 1e3) return `${trim(n / 1e3)}K`;
  return String(Math.round(n));
};

const OrdersReport: React.FC = () => {
  const { currentUser } = useAuth();
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
  // The order open in the detail panel (side panel on desktop, bottom sheet on mobile).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /* ---------- BILL ACTION SHEET (WhatsApp / Download / Print / QR), same as Orders page ---------- */
  const { items: catalogueItems } = useCatalogueData();
  const [actionModal, setActionModal] = useState<{ message: string; type: State } | null>(null);
  const [companyInfo, setCompanyInfo] = useState<any>(null);
  const [billSettings, setBillSettings] = useState<any>(null);
  const [catalogueWhatsappExtra, setCatalogueWhatsappExtra] = useState<string>('');

  useEffect(() => {
    const cid = currentUser?.companyId;
    if (!cid) return;
    (async () => {
      try {
        const companySnap = await getDoc(doc(db, 'companies', cid));
        if (companySnap.exists()) setCompanyInfo(companySnap.data());
        const billSnap = await getDoc(doc(db, 'companies', cid, 'settings', 'bill'));
        const data = billSnap.exists() ? billSnap.data() : {};
        setBillSettings(data);
        setCatalogueWhatsappExtra(data.catalogueWhatsappExtraMessage || '');
      } catch (err) {
        console.error('Bill settings fetch error:', err);
        setBillSettings({});
      }
    })();
  }, [currentUser?.companyId]);

  const {
    selectedOrderForAction, setSelectedOrderForAction,
    pdfLoadingOrderId, setPdfLoadingOrderId,
    showQrModal, setShowQrModal,
    sendingPdf,
    showPrintSubMenu, setShowPrintSubMenu,
    billType, setBillType,
    handlePdfAction,
    handleSendWhatsapp,
    handleSendWhatsappSnapto,
  } = useOrderCommunication({
    currentUser,
    companyInfo,
    availableItems: catalogueItems,
    catalogueWhatsappExtra,
    setModal: setActionModal,
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
      const M = 14;
      const PAD = 4;
      const brandRight = pageWidth - M;
      const contentW = pageWidth - M * 2;
      const company = companyName || 'Your Business';
      const orderWord = (n: number) => (n === 1 ? 'order' : 'orders');

      const generatedAtText = `Generated ${new Date().toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })}`;
      const periodText = `${fmtDay(appliedFilters.start)} – ${fmtDay(appliedFilters.end)}`;
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
          if (onDark) doc.setFillColor(154, 52, 18);
          else doc.setFillColor(194, 65, 12);
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

      // ---------- DATA: day-wise totals (chart) ----------
      const dayKey = (ts: number) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      };
      const dayTotals = new Map<string, number>();
      filteredSales.forEach((s) => {
        const k = dayKey(s.createdAt);
        dayTotals.set(k, (dayTotals.get(k) || 0) + s.totalAmount);
      });
      const days: { ts: number; value: number }[] = [];
      const cursor = new Date(appliedFilters.start);
      cursor.setHours(0, 0, 0, 0);
      while (cursor.getTime() <= appliedFilters.end) {
        days.push({ ts: cursor.getTime(), value: dayTotals.get(dayKey(cursor.getTime())) || 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      const best = days.length ? days.reduce((a, b) => (b.value > a.value ? b : a), days[0]) : null;
      const hasBest = !!best && best.value > 0;

      // ---------- 1. HEADER (gradient) ----------
      drawGradientRect(doc, 0, 0, pageWidth, 64, [194, 65, 12], [249, 115, 22]);
      drawCompanyTile(M, 11, 14, true);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(255, 237, 213);
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
      doc.setTextColor(255, 237, 213);
      doc.text(generatedAtText, brandRight, 21, { align: 'right' });

      // Title block (left)
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(M, 31, 14, 14, PDF_RADIUS, PDF_RADIUS, 'F');

      // FileText icon (lucide, 24x24 grid -> 7mm)
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
      doc.setDrawColor(194, 65, 12);
      doc.setLineWidth(0.5);
      doc.setLineCap('round');
      doc.setLineJoin('round');
      seg([[15, 2], [6, 2], [4, 4], [4, 20], [6, 22], [18, 22], [20, 20], [20, 7], [15, 2]]);
      seg([[14, 2], [14, 6], [16, 8], [20, 8]]);
      seg([[10, 9], [8, 9]]);
      seg([[16, 13], [8, 13]]);
      seg([[16, 17], [8, 17]]);
      doc.setLineCap('butt');
      doc.setLineJoin('miter');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(255, 255, 255);
      doc.text('Orders Report', 32, 38);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(255, 237, 213);
      doc.text("Every order and each day's sales", 32, 44.5);

      // Report period (right)
      doc.setFontSize(9);
      doc.text('Report period', brandRight, 34, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(periodText, brandRight, 40.5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(255, 237, 213);
      doc.text(`${periodDays} days`, brandRight, 45.5, { align: 'right' });

      // ---------- 2. SUMMARY CARDS (content-based widths) ----------
      const cardY = 50;
      const cardH = 32;
      const kpiPad = 6;

      const avgOrder = summary.totalTransactions > 0 ? summary.totalSales / summary.totalTransactions : 0;
      const cardsData = [
        {
          label: 'Total sales',
          value: `Rs. ${Math.round(summary.totalSales).toLocaleString('en-IN')}`,
          hint: `${summary.totalTransactions} ${orderWord(summary.totalTransactions)}`,
        },
        {
          label: 'Items sold',
          value: String(summary.totalItemsSold),
          hint: `${summary.totalTransactions > 0 ? (summary.totalItemsSold / summary.totalTransactions).toFixed(1) : '0'} per order`,
        },
        {
          label: 'Average order',
          value: `Rs. ${fmt2(avgOrder)}`,
          hint: `across ${summary.totalTransactions} ${orderWord(summary.totalTransactions)}`,
        },
        {
          label: 'Best day',
          value: hasBest ? `Rs. ${Math.round(best!.value).toLocaleString('en-IN')}` : '-',
          hint: hasBest ? fmtDayMonth(best!.ts, true) : 'No sales',
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
      doc.setFillColor(255, 237, 213);
      doc.roundedRect(M, cardY, colWs[0], cardH, PDF_RADIUS, PDF_RADIUS, 'F');
      doc.rect(M + colWs[0] - 2, cardY, 2, cardH, 'F');
      doc.setDrawColor(254, 215, 170);
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
        if (i === 0) doc.setTextColor(194, 65, 12);
        else doc.setTextColor(17, 24, 39);
        doc.text(c.value, cx, cardY + 20);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(120, 128, 150);
        doc.text(c.hint, cx, cardY + 27);
      });

      // ---------- 3. SALES BY DAY (LINE CHART) ----------
      const chartY = 90;
      const chartH = 66;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(254, 215, 170);
      doc.setLineWidth(0.3);
      doc.roundedRect(M, chartY, contentW, chartH, PDF_RADIUS, PDF_RADIUS, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.text('Sales by day', M + 6, chartY + 10);

      if (hasBest) {
        const bestLabel = fmtDayMonth(best!.ts, true);
        const t3 = ` with Rs. ${Math.round(best!.value).toLocaleString('en-IN')}`;
        const ty = chartY + 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const w1 = doc.getTextWidth('Best day ');
        const w3 = doc.getTextWidth(t3);
        doc.setFont('helvetica', 'bold');
        const w2 = doc.getTextWidth(bestLabel);
        let bx = brandRight - 6 - w1 - w2 - w3;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text('Best day ', bx, ty);
        bx += w1;
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(17, 24, 39);
        doc.text(bestLabel, bx, ty);
        bx += w2;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text(t3, bx, ty);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(107, 114, 128);
        doc.text('No sales in this period', brandRight - 6, chartY + 10, { align: 'right' });
      }

      const plotL = M + 20;
      const plotR = brandRight - 8;
      const plotT = chartY + 22;
      const plotB = chartY + chartH - 14;
      const plotW = plotR - plotL;
      const plotH = plotB - plotT;
      const nDays = days.length;
      const maxVal = Math.max(...days.map((d) => d.value), 1);
      const yMax = niceMax(maxVal);
      const px = (i: number) => (nDays > 1 ? plotL + (plotW * i) / (nDays - 1) : plotL + plotW / 2);
      const py = (v: number) => plotB - (Math.max(v, 0) / yMax) * plotH;

      // gridlines + Y labels
      for (let g = 0; g <= 4; g++) {
        const gy = plotB - (plotH * g) / 4;
        doc.setDrawColor(g === 0 ? 253 : 254, g === 0 ? 186 : 235, g === 0 ? 116 : 215);
        doc.setLineWidth(g === 0 ? 0.3 : 0.2);
        doc.line(plotL, gy, plotR, gy);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(130, 138, 155);
        doc.text(fmtCompact((yMax * g) / 4), plotL - 2.5, gy + 1, { align: 'right' });
      }

      const pts = days.map((d, i) => ({ x: px(i), y: py(d.value) }));

      if (pts.length > 1) {
        const rel: number[][] = [];
        for (let i = 1; i < pts.length; i++) {
          rel.push([pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]);
        }

        // area fill
        const areaRel = [
          ...rel,
          [0, plotB - pts[pts.length - 1].y],
          [pts[0].x - pts[pts.length - 1].x, 0],
        ];
        doc.setFillColor(255, 237, 213);
        doc.lines(areaRel, pts[0].x, pts[0].y, [1, 1], 'F', true);

        // line
        doc.setDrawColor(234, 88, 12);
        doc.setLineWidth(0.5);
        doc.setLineJoin('round');
        doc.lines(rel, pts[0].x, pts[0].y, [1, 1], 'S', false);
        doc.setLineJoin('miter');
      }

      // dots: few days -> every sales day, otherwise only the best day
      const bestIdx = hasBest ? days.findIndex((d) => d.ts === best!.ts) : -1;
      days.forEach((d, i) => {
        if (d.value <= 0 || i === bestIdx) return;
        if (nDays <= 45) {
          doc.setFillColor(234, 88, 12);
          doc.circle(pts[i].x, pts[i].y, 0.8, 'F');
        }
      });
      if (bestIdx >= 0) {
        doc.setFillColor(255, 255, 255);
        doc.circle(pts[bestIdx].x, pts[bestIdx].y, 1.7, 'F');
        doc.setFillColor(234, 88, 12);
        doc.circle(pts[bestIdx].x, pts[bestIdx].y, 1.2, 'F');

        const bl = Math.round(best!.value).toLocaleString('en-IN');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(17, 24, 39);
        const blw = doc.getTextWidth(bl);
        const bpx = pts[bestIdx].x;
        let blAlign: 'left' | 'center' | 'right' = 'center';
        let blX = bpx;
        if (bpx + blw / 2 > plotR + 6) {
          blAlign = 'right';
          blX = bpx + 2;
        } else if (bpx - blw / 2 < plotL) {
          blAlign = 'left';
          blX = bpx - 2;
        }
        doc.text(bl, blX, pts[bestIdx].y - 3, { align: blAlign });
      }

      // X axis ticks (max 7, evenly spaced)
      const tickCount = Math.min(nDays, 7);
      const xLabel = (ts: number) => (nDays > 330 ? fmtDay(ts) : fmtDayMonth(ts));
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(107, 114, 128);
      doc.setDrawColor(253, 186, 116);
      doc.setLineWidth(0.3);
      for (let t = 0; t < tickCount; t++) {
        const idx = tickCount === 1 ? 0 : Math.round((t * (nDays - 1)) / (tickCount - 1));
        const x = px(idx);
        doc.line(x, plotB, x, plotB + 1.2);
        const tAlign: 'left' | 'center' | 'right' =
          tickCount === 1 ? 'center' : t === 0 ? 'left' : t === tickCount - 1 ? 'right' : 'center';
        const tx = tAlign === 'left' ? plotL : tAlign === 'right' ? plotR : x;
        doc.text(xLabel(days[idx].ts), tx, plotB + 6, { align: tAlign });
      }

      // ---------- 4. ORDERS TABLE (date-wise groups) ----------
      const ordersY = chartY + chartH + 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(17, 24, 39);
      doc.text('Orders', M, ordersY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(107, 114, 128);
      doc.text(`${filteredSales.length} ${orderWord(filteredSales.length)}`, brandRight, ordersY, {
        align: 'right',
      });

      const groupMap = new Map<string, { ts: number; sales: SaleRecord[] }>();
      filteredSales.forEach((s) => {
        const key = dayKey(s.createdAt);
        if (!groupMap.has(key)) groupMap.set(key, { ts: s.createdAt, sales: [] });
        groupMap.get(key)!.sales.push(s);
      });
      const groups = Array.from(groupMap.values()).sort((a, b) => b.ts - a.ts);

      const groupFill: RGB = [255, 247, 237];
      const tableBody: any[] = [];

      groups.forEach((g) => {
        g.sales.sort((a, b) => b.createdAt - a.createdAt);
        const gItems = g.sales.reduce((n, s) => n + getSaleItemCount(s), 0);
        const gTotal = g.sales.reduce((n, s) => n + s.totalAmount, 0);

        tableBody.push([
          { content: fmtDay(g.ts, true), styles: { fontStyle: 'bold', fillColor: groupFill } },
          {
            content: `${g.sales.length} ${orderWord(g.sales.length)}`,
            styles: { fontStyle: 'normal', fontSize: 9.5, textColor: [107, 114, 128] as RGB, fillColor: groupFill },
          },
          { content: String(gItems), styles: { halign: 'right', fontStyle: 'bold', fillColor: groupFill } },
          { content: fmt2(gTotal), styles: { halign: 'right', fontStyle: 'bold', fillColor: groupFill } },
        ]);

        g.sales.forEach((s) => {
          tableBody.push([
            { content: s.invoiceNumber || 'N/A', styles: { fontStyle: 'bold' } },
            { content: s.partyName || '-', styles: { textColor: [17, 24, 39] as RGB } },
            { content: String(getSaleItemCount(s)), styles: { halign: 'right' } },
            {
              content: fmt2(s.totalAmount),
              styles: {
                halign: 'right',
                textColor: s.totalAmount < 0 ? ([220, 38, 38] as RGB) : ([17, 24, 39] as RGB),
              },
            },
          ]);
        });
      });

      // Order ID/Date | Customer | Items | Amount  (total = contentW = 182mm)
      const COLW = [48, 56, 28, 50];
      const itemsCol = 2;
      const amountCol = 3;

      autoTable(doc, {
        startY: ordersY + 4,
        margin: { top: 26, bottom: 22, left: M, right: M },
        head: [['Order ID', 'Customer', 'Items', 'Amount (Rs.)']],
        body: tableBody,
        foot: [
          [
            { content: 'Total', styles: { fontStyle: 'bold' } },
            {
              content: `${summary.totalTransactions} ${orderWord(summary.totalTransactions)}`,
              styles: { fontStyle: 'normal', fontSize: 9.5, textColor: [107, 114, 128] as RGB },
            },
            { content: String(summary.totalItemsSold), styles: { halign: 'right', fontStyle: 'bold' } },
            { content: `Rs. ${fmt2(summary.totalSales)}`, styles: { halign: 'right', fontStyle: 'bold' } },
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
          fillColor: [255, 247, 237],
          textColor: [154, 52, 18],
          fontStyle: 'bold',
          fontSize: 9.5,
        },
        footStyles: {
          fillColor: [255, 247, 237],
          textColor: [17, 24, 39],
          fontStyle: 'bold',
          fontSize: 11,
        },
        columnStyles: Object.fromEntries(
          COLW.map((w, i) => [
            i,
            i >= itemsCol ? { cellWidth: w, halign: 'right' } : { cellWidth: w },
          ]),
        ),
        didParseCell: (data) => {
          data.cell.styles.valign = 'middle';

          // Header and Total row: Items/Amount right-aligned, same as body
          if (data.section !== 'body' && data.column.index >= itemsCol) {
            data.cell.styles.halign = 'right';
          }

          // Very long total amount -> shrink the font so it doesn't wrap
          if (data.section === 'foot' && data.column.index === amountCol) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            const w = doc.getTextWidth(data.cell.text.join(' '));
            const avail = COLW[amountCol] - PAD * 2;
            if (w > avail) {
              data.cell.styles.fontSize = (11 * avail) / w;
            }
          }
        },
        didDrawCell: (data) => {
          const { x, y, width, height } = data.cell;

          // Vertical column lines (grid)
          doc.setDrawColor(254, 215, 170);
          doc.setLineWidth(0.2);
          doc.line(x + width, y, x + width, y + height);
          if (data.column.index === 0) {
            doc.line(x, y, x, y + height);
          }

          // Horizontal lines
          if (data.section === 'head') {
            doc.setDrawColor(194, 65, 12);
            doc.setLineWidth(0.5);
            doc.line(x, y + height, x + width, y + height);
          }
          if (data.section === 'body') {
            doc.setDrawColor(254, 215, 170);
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
          doc.text(`Orders Report | ${periodText}`, brandRight, 15.4, { align: 'right' });
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

        doc.text(`${company} | Orders Report | Page ${i} of ${totalPages}`, brandRight, fy, {
          align: 'right',
        });
      }

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

  /* ---------- VIEW BILL → ORDER ACTION SHEET ---------- */
  const openBillActions = async (orderId: string) => {
    if (!currentUser?.companyId) return;
    setSelectedId(null); // close the detail panel
    try {
      // Full order document, so the PDF gets the same fields as on the Orders page
      const snap = await getDoc(doc(db, 'companies', currentUser.companyId, 'Orders', orderId));
      if (!snap.exists()) throw new Error('Order not found.');
      setSelectedOrderForAction({ ...snap.data(), id: orderId } as unknown as Order);
    } catch (err) {
      console.error('Open bill failed:', err);
      setActionModal({ message: 'Could not load the bill. Please try again.', type: State.ERROR });
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
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-orange-800 ${align === 'right' ? 'flex-row-reverse' : ''
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

  // One order in the detail panel. Orange "View bill" opens the Orders action sheet.
  const openSale = selectedId ? filteredSales.find((s) => s.id === selectedId) : undefined;
  const orderPanel = openSale && (() => {
    const t = openSale;
    const time = new Date(t.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    const due = Math.max(Number(t.paymentMethods?.due ?? t.dueAmount) || 0, 0);
    const paid = Math.max(t.totalAmount - due, 0);
    return (
      <DetailPanel
        open
        onClose={() => setSelectedId(null)}
        title={t.invoiceNumber}
        badge={due > 0
          ? <span className="rounded-sm bg-yellow-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-yellow-700">Unpaid</span>
          : undefined}
        subtitle={`${formatFullDate(t.createdAt)}, ${time} · Order`}
        footer={currentUser?.companyId ? (
          <button
            type="button"
            onClick={() => openBillActions(t.id)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm bg-orange-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-800"
          >
            <ExternalLink size={15} /> View bill
          </button>
        ) : undefined}
      >
        <DetailSection title="Customer">
          <p className="text-sm font-medium text-slate-900">{t.partyName}</p>
          {t.partyNumber && <p className="text-xs text-slate-500">{t.partyNumber}</p>}
        </DetailSection>

        <DetailSection title={`Items · ${getSaleItemCount(t)}`}>
          <DetailItems
            items={(t.items || []).map((item: any) => {
              const qty = Number(item.quantity) || 0;
              // Net unit price, same rule as Catalogue Party Ledger.
              const net = item.taxableAmount && qty > 0
                ? item.taxableAmount / qty
                : item.effectiveUnitPrice
                  ? item.effectiveUnitPrice
                  : qty > 0 ? (item.finalPrice || 0) / qty : 0;
              return { name: String(item.name ?? ''), quantity: qty, unitPrice: Number(net) || Number(item.mrp) || 0 };
            })}
          />
        </DetailSection>

        <DetailSection title="Total">
          <DetailRows
            rows={[
              { label: 'Order total', value: formatCurrency(t.totalAmount) },
              { label: 'Received', value: formatCurrency(paid), tone: 'text-green-700' },
              { label: 'Pending', value: due > 0 ? formatCurrency(due) : 'Settled ✓', tone: due > 0 ? 'text-yellow-700' : 'text-green-700', strong: true },
            ]}
          />
        </DetailSection>
      </DetailPanel>
    );
  })();

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
      hint: `${summary.totalTransactions > 0 ? (summary.totalItemsSold / summary.totalTransactions).toFixed(1) : '0'
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
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${active
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
          theme="catalogue"
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
            theme="catalogue"
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
              theme="catalogue"
              onExcel={() => runDownload(downloadAsExcel)}
              onPdf={() => runDownload(downloadAsPdf)}
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
                  <tr
                    key={sale.id}
                    onClick={() => setSelectedId(sale.id)}
                    className={`cursor-pointer border-t border-[#f6e1d0] transition ${selectedId === sale.id ? 'bg-orange-100' : 'hover:bg-[#fff8f2]'
                      }`}
                  >
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
            <li
              key={sale.id}
              onClick={() => setSelectedId(sale.id)}
              className="cursor-pointer border-t border-[#f6e1d0] px-4 py-3 active:bg-[#fff8f2]"
            >
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

      {orderPanel}

      {selectedOrderForAction && (
        <OrderActionSheet
          selectedOrderForAction={selectedOrderForAction}
          setSelectedOrderForAction={setSelectedOrderForAction}
          setShowPrintSubMenu={setShowPrintSubMenu}
          billType={billType}
          setBillType={setBillType}
          handleSendWhatsapp={handleSendWhatsapp}
          handleSendWhatsappSnapto={handleSendWhatsappSnapto}
          companyId={currentUser?.companyId}
          sendingPdf={sendingPdf}
          pdfLoadingOrderId={pdfLoadingOrderId}
          setPdfLoadingOrderId={setPdfLoadingOrderId}
          handlePdfAction={handlePdfAction}
          setShowQrModal={setShowQrModal}
        />
      )}
      {showPrintSubMenu && selectedOrderForAction && (
        <PrintSubMenuModal
          selectedOrderForAction={selectedOrderForAction}
          setSelectedOrderForAction={setSelectedOrderForAction}
          setShowPrintSubMenu={setShowPrintSubMenu}
          setPdfLoadingOrderId={setPdfLoadingOrderId}
          handlePdfAction={handlePdfAction}
          _billSettings={billSettings}
        />
      )}
      {showQrModal && (
        <QrCodeModal
          showQrModal={showQrModal}
          setShowQrModal={setShowQrModal}
          companyId={currentUser?.companyId}
        />
      )}
      {actionModal && (
        <Modal message={actionModal.message} type={actionModal.type} onClose={() => setActionModal(null)} theme="catalogue" />
      )}
    </div>
  );
};

export default OrdersReport;