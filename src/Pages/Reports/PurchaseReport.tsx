import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
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
  FileText,
  Filter,
  IndianRupee,
  Package,
  Pencil,
  RefreshCw,
  Scale,
  Search,
  Tag,
  X,
} from 'lucide-react';
import usePurchaseReports from './PurchaseReportComponents/usePurchaseReports';
import {
  NO_SUPPLIER,
  formatDate,
  formatDateForInput,
  getPurchaseDue,
  getPurchaseItemCount,
  hasSupplier,
  supplierKey,
  type PurchaseRecord,
} from './PurchaseReportComponents/purchaseReports.utils';
import {
  DATE_PRESETS,
  formatCurrency,
  formatDayMonth,
  formatFullDate,
  formatPhone,
  formatRangeLabel,
  getPresetRange,
  parseInputDate,
} from './SalesReportComponents/salesReport.utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';

import { State } from '../../enums';
import { ROUTES } from '../../constants/routes.constants';
import ReportByDayChart from './SalesReportComponents/ReportByDayChart';
import DownloadMenu from './SalesReportComponents/DownloadMenu';
import CustomRangePanel from './SalesReportComponents/CustomRangePanel';
import DetailPanel, { DetailItems, DetailRows, DetailSection } from './SalesReportComponents/DetailPanel';
import { Modal } from '../../constants/Modal';
import { useAuth } from '../../context/auth-context';
import BackButton from '../../Components/BackButton';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import sellarLogo from '../../assets/sellar-logo.png';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

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

const PDF_RADIUS = 0.5; // ≈ Tailwind rounded-sm

const drawGradientRect = (doc: jsPDF, x: number, y: number, w: number, h: number, from: RGB, to: RGB) => {
  const steps = 120;
  const sw = w / steps;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    doc.setFillColor(
      Math.round(from[0] + (to[0] - from[0]) * t),
      Math.round(from[1] + (to[1] - from[1]) * t),
      Math.round(from[2] + (to[2] - from[2]) * t),
    );
    doc.rect(x + i * sw, y, sw + 0.3, h, 'F');
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

const PurchaseReport: React.FC = () => {
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
    isListVisible,
    setIsListVisible,
    sortConfig,
    setSortConfig,
    setCustomStartDate,
    setCustomEndDate,
    customStartDate,
    customEndDate,
    setAppliedFilters,
    appliedFilters,
    purchases,
    isLoading,
    isFetching,
    lastUpdated,
    refresh,
    authLoading,
    error,
    datePreset,
    setDatePreset,
  } = usePurchaseReports();

  const navigate = useNavigate();

  /* ---------- LOCAL STATES ---------- */
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  // The purchase open in the detail panel (side panel on desktop, bottom sheet on mobile).
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const handleSort = (key: keyof PurchaseRecord) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  /* ---------- FILTER + SUMMARY ---------- */
  const summarize = (list: PurchaseRecord[]) => {
    const totalPurchases = list.reduce((acc, p) => acc + p.totalAmount, 0);
    const totalItemsPurchased = list.reduce((acc, p) => acc + getPurchaseItemCount(p), 0);
    const totalOrders = list.length;
    return {
      totalPurchases,
      totalOrders,
      totalItemsPurchased,
      averagePurchaseValue: totalOrders > 0 ? totalPurchases / totalOrders : 0,
    };
  };

  // Date range + search: drives the summary cards and charts.
  const rangePurchases = useMemo(() => {
    if (!appliedFilters) return [];
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    return purchases.filter((p) => {
      const matchesDate =
        p.createdAt >= appliedFilters.start && p.createdAt <= appliedFilters.end;
      if (!matchesDate) return false;
      if (!q) return true;

      return (
        (p.partyName || '').toLowerCase().includes(q) ||
        (p.invoiceNumber || '').toLowerCase().includes(q) ||
        (p.supplierBillNumber || '').toLowerCase().includes(q) ||
        (!!qDigits && (p.partyNumber || '').replace(/\D/g, '').includes(qDigits))
      );
    });
  }, [appliedFilters, purchases, searchQuery]);

  // Supplier filter + sort: drives the list and the downloads.
  const { filteredPurchases, summary } = useMemo(() => {
    const newFilteredPurchases = rangePurchases.filter(
      (p) => supplierFilter === 'all' || supplierKey(p) === supplierFilter,
    );

    newFilteredPurchases.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;

      if (key === 'items') {
        return (getPurchaseItemCount(a) - getPurchaseItemCount(b)) * direction;
      }

      const valA = a[key] ?? '';
      const valB = b[key] ?? '';

      if (typeof valA === 'string' && typeof valB === 'string')
        return valA.localeCompare(valB, undefined, { numeric: true }) * direction;
      if (typeof valA === 'number' && typeof valB === 'number')
        return (valA - valB) * direction;

      return 0;
    });

    return { filteredPurchases: newFilteredPurchases, summary: summarize(newFilteredPurchases) };
  }, [rangePurchases, supplierFilter, sortConfig]);

  const rangeSummary = useMemo(() => summarize(rangePurchases), [rangePurchases]);

  const paymentStatus = useMemo(() => {
    let paid = 0;
    let due = 0;
    let gst = 0;
    let dueOrders = 0;
    let noSupplier = 0;
    rangePurchases.forEach((p) => {
      const pDue = getPurchaseDue(p);
      due += pDue;
      paid += p.totalAmount - pDue;
      gst += p.taxAmount || 0;
      if (pDue > 0) dueOrders += 1;
      if (!hasSupplier(p)) noSupplier += 1;
    });
    return { paid, due, gst, dueOrders, paidOrders: rangePurchases.length - dueOrders, noSupplier };
  }, [rangePurchases]);

  const supplierOptions = useMemo(() => {
    const map = new Map<string, string>();
    rangePurchases.forEach((p) => {
      if (hasSupplier(p)) map.set(supplierKey(p), p.partyName.trim());
    });
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rangePurchases]);

  /* ---------- PDF DOWNLOAD ---------- */
    const downloadAsPdf = async () => {
    if (!appliedFilters) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const M = 14;
      const PAD = 4; // table cell padding
      const brandRight = pageWidth - M;
      const contentW = pageWidth - M * 2;
      const company = companyName || 'Your Business';
      const purchaseWord = (n: number) => (n === 1 ? 'purchase' : 'purchases');

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

      // ---------- DATA: day-wise totals (chart) ----------
      const dayKey = (ts: number) => {
        const d = new Date(ts);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      };
      const dayTotals = new Map<string, number>();
      filteredPurchases.forEach((p) => {
        const k = dayKey(p.createdAt);
        dayTotals.set(k, (dayTotals.get(k) || 0) + p.totalAmount);
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
      doc.setDrawColor(37, 99, 235);
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
      doc.text('Purchase Report', 32, 38);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(190, 205, 255);
      doc.text("Every purchase and each day's cost", 32, 44.5);

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
      doc.text(`${periodDays} days`, brandRight, 45.5, { align: 'right' });

      // ---------- 2. SUMMARY CARDS (content-based widths) ----------
      const cardY = 50;
      const cardH = 32;
      const kpiPad = 6;

      const avgPurchase = summary.totalOrders > 0 ? summary.totalPurchases / summary.totalOrders : 0;
      const cardsData = [
        {
          label: 'Total cost',
          value: `Rs. ${Math.round(summary.totalPurchases).toLocaleString('en-IN')}`,
          hint: `${summary.totalOrders} ${purchaseWord(summary.totalOrders)}`,
        },
        {
          label: 'Items purchased',
          value: String(summary.totalItemsPurchased),
          hint: `${summary.totalOrders > 0 ? (summary.totalItemsPurchased / summary.totalOrders).toFixed(1) : '0'} per purchase`,
        },
        {
          label: 'Average purchase',
          value: `Rs. ${fmt2(avgPurchase)}`,
          hint: `across ${summary.totalOrders} ${purchaseWord(summary.totalOrders)}`,
        },
        {
          label: 'Biggest day',
          value: hasBest ? `Rs. ${Math.round(best!.value).toLocaleString('en-IN')}` : '-',
          hint: hasBest ? fmtDayMonth(best!.ts, true) : 'No purchases',
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

      // ---------- 3. PURCHASES BY DAY (LINE CHART) ----------
      const chartY = 90;
      const chartH = 66;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(M, chartY, contentW, chartH, PDF_RADIUS, PDF_RADIUS, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(17, 24, 39);
      doc.text('Purchases by day', M + 6, chartY + 10);

      if (hasBest) {
        const bestLabel = fmtDayMonth(best!.ts, true);
        const t3 = ` with Rs. ${Math.round(best!.value).toLocaleString('en-IN')}`;
        const ty = chartY + 10;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const w1 = doc.getTextWidth('Biggest day ');
        const w3 = doc.getTextWidth(t3);
        doc.setFont('helvetica', 'bold');
        const w2 = doc.getTextWidth(bestLabel);
        let bx = brandRight - 6 - w1 - w2 - w3;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(107, 114, 128);
        doc.text('Biggest day ', bx, ty);
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
        doc.text('No purchases in this period', brandRight - 6, chartY + 10, { align: 'right' });
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
        doc.setDrawColor(g === 0 ? 203 : 232, g === 0 ? 213 : 236, g === 0 ? 225 : 244);
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
        doc.setFillColor(222, 233, 254);
        doc.lines(areaRel, pts[0].x, pts[0].y, [1, 1], 'F', true);

        // line
        doc.setDrawColor(37, 99, 235);
        doc.setLineWidth(0.5);
        doc.setLineJoin('round');
        doc.lines(rel, pts[0].x, pts[0].y, [1, 1], 'S', false);
        doc.setLineJoin('miter');
      }

      // dots: kam din ho to sab purchase wale din, warna sirf biggest day
      const bestIdx = hasBest ? days.findIndex((d) => d.ts === best!.ts) : -1;
      days.forEach((d, i) => {
        if (d.value <= 0 || i === bestIdx) return;
        if (nDays <= 45) {
          doc.setFillColor(37, 99, 235);
          doc.circle(pts[i].x, pts[i].y, 0.8, 'F');
        }
      });
      if (bestIdx >= 0) {
        doc.setFillColor(255, 255, 255);
        doc.circle(pts[bestIdx].x, pts[bestIdx].y, 1.7, 'F');
        doc.setFillColor(37, 99, 235);
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
      doc.setDrawColor(203, 213, 225);
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

      // ---------- 4. PURCHASES TABLE (date-wise groups) ----------
      const purchasesY = chartY + chartH + 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(17, 24, 39);
      doc.text('Purchases', M, purchasesY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(107, 114, 128);
      doc.text(
        `${filteredPurchases.length} ${purchaseWord(filteredPurchases.length)}`,
        brandRight,
        purchasesY,
        { align: 'right' },
      );

      const groupMap = new Map<string, { ts: number; purchases: PurchaseRecord[] }>();
      filteredPurchases.forEach((p) => {
        const key = dayKey(p.createdAt);
        if (!groupMap.has(key)) groupMap.set(key, { ts: p.createdAt, purchases: [] });
        groupMap.get(key)!.purchases.push(p);
      });
      const groups = Array.from(groupMap.values()).sort((a, b) => b.ts - a.ts);

      const groupFill: RGB = [243, 246, 254];
      const tableBody: any[] = [];

      groups.forEach((g) => {
        g.purchases.sort((a, b) => b.createdAt - a.createdAt);
        const gItems = g.purchases.reduce((n, p) => n + getPurchaseItemCount(p), 0);
        const gTotal = g.purchases.reduce((n, p) => n + p.totalAmount, 0);

        tableBody.push([
          { content: fmtDay(g.ts, true), styles: { fontStyle: 'bold', fillColor: groupFill } },
          {
            content: `${g.purchases.length} ${purchaseWord(g.purchases.length)}`,
            styles: { fontStyle: 'normal', fontSize: 9.5, textColor: [107, 114, 128] as RGB, fillColor: groupFill },
          },
          { content: String(gItems), styles: { halign: 'right', fontStyle: 'bold', fillColor: groupFill } },
          { content: fmt2(gTotal), styles: { halign: 'right', fontStyle: 'bold', fillColor: groupFill } },
        ]);

        g.purchases.forEach((p) => {
          const supplierOk = hasSupplier(p);
          tableBody.push([
            { content: p.invoiceNumber || 'N/A', styles: { fontStyle: 'bold' } },
            {
              content: supplierOk ? p.partyName : 'No supplier',
              styles: { textColor: supplierOk ? ([17, 24, 39] as RGB) : ([156, 163, 175] as RGB) },
            },
            { content: String(getPurchaseItemCount(p)), styles: { halign: 'right' } },
            {
              content: fmt2(p.totalAmount),
              styles: {
                halign: 'right',
                textColor: p.totalAmount < 0 ? ([220, 38, 38] as RGB) : ([17, 24, 39] as RGB),
              },
            },
          ]);
        });
      });

      // Ref/Date | Supplier | Items | Amount  (total = contentW = 182mm)
      const COLW = [48, 56, 28, 50];

      autoTable(doc, {
        startY: purchasesY + 4,
        margin: { top: 26, bottom: 22, left: M, right: M },
        head: [['Ref', 'Supplier', 'Items', 'Amount (Rs.)']],
        body: tableBody,
        foot: [
          [
            { content: 'Total', styles: { fontStyle: 'bold' } },
            {
              content: `${summary.totalOrders} ${purchaseWord(summary.totalOrders)}`,
              styles: { fontStyle: 'normal', fontSize: 9.5, textColor: [107, 114, 128] as RGB },
            },
            { content: String(summary.totalItemsPurchased), styles: { halign: 'right', fontStyle: 'bold' } },
            { content: `Rs. ${fmt2(summary.totalPurchases)}`, styles: { halign: 'right', fontStyle: 'bold' } },
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
        },
        didParseCell: (data) => {
          // Har cell vertically center (ek row = ek baseline)
          data.cell.styles.valign = 'middle';

          // Header aur Total row ke Items/Amount bhi right-aligned (body ke saath match)
          if (data.section !== 'body' && data.column.index >= 2) {
            data.cell.styles.halign = 'right';
          }

          // Total amount bahut lamba ho to font chhota karo, taaki wrap na ho
          if (data.section === 'foot' && data.column.index === 3) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            const w = doc.getTextWidth(data.cell.text.join(' '));
            const avail = COLW[3] - PAD * 2;
            if (w > avail) {
              data.cell.styles.fontSize = (11 * avail) / w;
            }
          }
        },
        didDrawCell: (data) => {
          const { x, y, width, height } = data.cell;

          // Vertical column lines (grid)
          doc.setDrawColor(226, 232, 240);
          doc.setLineWidth(0.2);
          doc.line(x + width, y, x + width, y + height);
          if (data.column.index === 0) {
            doc.line(x, y, x, y + height);
          }

          // Horizontal lines
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

      // ---------- 5. PAGE 2+ MINI HEADER + FOOTER (har page par) ----------
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
          doc.text(`Purchase Report | ${periodText}`, brandRight, 15.4, { align: 'right' });
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

        doc.text(`${company} | Purchase Report | Page ${i} of ${totalPages}`, brandRight, fy, {
          align: 'right',
        });
      }

      doc.save(`purchase_report_${formatDateForInput(new Date())}.pdf`);
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
        { header: 'Supplier Name', width: 28 },
        { header: 'Items', width: 13 },
        { header: 'Amount (₹)', width: 18 },
        { header: 'Payment Method', width: 22 },
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
      const totalRows = dataStartRow + filteredPurchases.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = companyName
        ? `Purchase Report  —  ${companyName}`
        : 'Purchase Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodText}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Total Orders: ${summary.totalOrders}   |   Items Purchased: ${summary.totalItemsPurchased}   |   Total Cost: ₹${summary.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      filteredPurchases.forEach((purchase, idx) => {
        const r = dataStartRow + idx;
        const totalItems = purchase.items.reduce((sum, i) => sum + i.quantity, 0);
        const paymentMethod =
          Object.entries(purchase.paymentMethods || {})
            .filter(([_, value]) => value > 0)
            .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1))
            .join(', ') || 'N/A';

        aoa[r][0] = idx + 1;
        aoa[r][1] = formatDate(purchase.createdAt);
        aoa[r][2] = purchase.partyName
          ? purchase.partyName.charAt(0).toUpperCase() + purchase.partyName.slice(1).toLowerCase()
          : 'N/A';
        aoa[r][3] = totalItems;
        aoa[r][4] = purchase.totalAmount;
        aoa[r][5] = paymentMethod;
      });

      // Footer row
      const footerRow = dataStartRow + filteredPurchases.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = '';
      aoa[footerRow][2] = '';
      aoa[footerRow][3] = summary.totalItemsPurchased;
      aoa[footerRow][4] = summary.totalPurchases;
      aoa[footerRow][5] = '';

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
        ...filteredPurchases.map(() => ({ hpt: 20 })),
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
      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          solidFill('1E40AF'),
          { horizontal: i <= 1 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      // Data rows
      filteredPurchases.forEach((purchase, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');
        const isNegative = purchase.totalAmount < 0;

        [0, 1, 2, 3, 4, 5].forEach(ci => {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isAmount = ci === 4;
          style(addr, s(
            {
              sz: 9,
              color: { rgb: isAmount && isNegative ? 'DC2626' : '1E293B' },
              bold: isAmount && isNegative,
            },
            rowBg,
            { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
            bblr,
          ));
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
          { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
          {
            top: { style: 'medium', color: { rgb: '1E293B' } },
            bottom: { style: 'medium', color: { rgb: '1E293B' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
        ));
        if (ci === 4 && ws[addr]) {
          ws[addr].t = 'n';
          ws[addr].z = '₹#,##0.00';
        }
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Purchase Report');
      XLSX.writeFile(wb, `purchase_report_${formatDateForInput(new Date())}.xlsx`);

      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Excel downloaded successfully!',
      });
    } catch (error) {
      console.error(error);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate Excel file.',
      });
    }
  };

  // A supplier picked for one period may not exist in the next one.
  useEffect(() => {
    setSupplierFilter('all');
  }, [appliedFilters]);

  /* ---------- DOWNLOAD / SHARE ---------- */
  const runDownload = (action: () => void) => {
    if (filteredPurchases.length === 0) {
      setFeedbackModal({
        isOpen: true,
        type: State.INFO,
        message: 'No data available to download.',
      });
      return;
    }
    action();
  };

  const openPurchaseForEdit = (purchase: PurchaseRecord) =>
    navigate(ROUTES.PURCHASE, { state: { purchaseId: purchase.id, isEditMode: true } });

  /* ---------- SORT HELPERS ---------- */
  const mobileSortValue =
    sortConfig.key === 'totalAmount'
      ? sortConfig.direction === 'desc' ? 'highest' : 'lowest'
      : sortConfig.key === 'createdAt' && sortConfig.direction === 'asc'
        ? 'oldest'
        : 'newest';

  const handleMobileSort = (value: string) => {
    const map: Record<string, { key: keyof PurchaseRecord; direction: 'asc' | 'desc' }> = {
      newest: { key: 'createdAt', direction: 'desc' },
      oldest: { key: 'createdAt', direction: 'asc' },
      highest: { key: 'totalAmount', direction: 'desc' },
      lowest: { key: 'totalAmount', direction: 'asc' },
    };
    setSortConfig(map[value] ?? map.newest);
  };

  const renderSortHeader = (
    label: string,
    sortKey: keyof PurchaseRecord,
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

  /* ---------- ROW HELPERS ---------- */
  const renderStatusBadge = (purchase: PurchaseRecord, withAmount: boolean) => {
    const due = getPurchaseDue(purchase);
    const isDue = due > 0;
    return (
      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${isDue ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'
          }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${isDue ? 'bg-amber-500' : 'bg-green-600'}`} />
        {isDue ? `Due${withAmount ? ` ${formatCurrency(due)}` : ''}` : 'Paid'}
      </span>
    );
  };

  const refLabel = (p: PurchaseRecord) => p.invoiceNumber || '—';
  const itemsLabel = (count: number) => `${count} ${count === 1 ? 'item' : 'items'}`;
  const renderPurchasePanel = (purchase: PurchaseRecord) => {
    const due = getPurchaseDue(purchase);
    const supplierOk = hasSupplier(purchase);
    const phone = (purchase.partyNumber || '').replace(/\D/g, '').slice(-10);
    const time = new Date(purchase.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    return (
      <DetailPanel
        open
        onClose={() => setSelectedId(null)}
        title={refLabel(purchase)}
        badge={renderStatusBadge(purchase, false)}
        subtitle={`${formatFullDate(purchase.createdAt)}, ${time}`}
        footer={
          <div className="flex gap-2">
            <button
              onClick={() => openPurchaseForEdit(purchase)}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <Pencil size={15} /> {supplierOk ? 'Edit purchase' : 'Add supplier'}
            </button>
            {supplierOk && phone.length === 10 && (
              <button
                onClick={() => navigate(ROUTES.PARTY_LEDGER, { state: { openParty: phone } })}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-slate-400"
              >
                <Scale size={15} /> Party ledger
              </button>
            )}
          </div>
        }
      >
        <DetailSection title="Supplier">
          {supplierOk ? (
            <>
              <p className="text-sm font-medium text-slate-900">{purchase.partyName}</p>
              {purchase.partyNumber && <p className="text-xs text-slate-500">{formatPhone(purchase.partyNumber)}</p>}
            </>
          ) : (
            <p className="text-sm text-amber-700">No supplier on this purchase — add one so it shows in the party ledger.</p>
          )}
          {purchase.supplierBillNumber && (
            <p className="mt-1 text-xs text-slate-500">Supplier bill no. {purchase.supplierBillNumber}</p>
          )}
        </DetailSection>

        <DetailSection title={`Items · ${getPurchaseItemCount(purchase)}`}>
          <DetailItems
            items={(purchase.items || []).map((item) => ({
              name: item.name,
              quantity: Number(item.quantity) || 0,
              unitPrice: Number(item.purchasePrice) || 0,
            }))}
          />
        </DetailSection>

        <DetailSection title="Payment">
          <DetailRows
            rows={[
              ...(purchase.taxAmount ? [{ label: 'Tax', value: formatCurrency(purchase.taxAmount) }] : []),
              { label: 'Paid', value: formatCurrency(Math.max(purchase.totalAmount - due, 0)), tone: 'text-green-700' },
              ...(due > 0 ? [{ label: 'You owe', value: formatCurrency(due), tone: 'text-amber-700' }] : []),
              { label: 'Bill total', value: formatCurrency(purchase.totalAmount), strong: true },
            ]}
          />
        </DetailSection>
      </DetailPanel>
    );
  };

  /* ---------- LOAD STATES ---------- */
  if (isLoading || authLoading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-canvas text-sm text-slate-500">
        Loading purchase report...
      </div>
    );
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  const rangeLabel = appliedFilters
    ? formatRangeLabel(appliedFilters.start, appliedFilters.end)
    : '';
  const rangeLabelShort = appliedFilters
    ? formatRangeLabel(appliedFilters.start, appliedFilters.end, false)
    : '';

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const itemsPerOrder =
    rangeSummary.totalOrders > 0
      ? Number((rangeSummary.totalItemsPurchased / rangeSummary.totalOrders).toFixed(1))
      : 0;

  const statCards = [
    {
      label: 'Total cost',
      shortLabel: 'Total cost',
      value: `₹${Math.round(rangeSummary.totalPurchases).toLocaleString('en-IN')}`,
      hint: `${plural(rangeSummary.totalOrders, 'purchase')} incl. GST`,
      icon: Package,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-blue-600',
    },
    {
      label: 'Total orders',
      shortLabel: 'Orders',
      value: rangeSummary.totalOrders.toString(),
      hint: `${paymentStatus.paidOrders} paid · ${paymentStatus.dueOrders} due`,
      icon: FileText,
      iconClass: 'bg-blue-50 text-blue-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Total items',
      shortLabel: 'Items',
      value: rangeSummary.totalItemsPurchased.toLocaleString('en-IN'),
      hint: `${itemsPerOrder} per order`,
      icon: Tag,
      iconClass: 'bg-orange-50 text-orange-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Avg purchase',
      shortLabel: 'Avg purchase',
      value: `₹${Math.round(rangeSummary.averagePurchaseValue).toLocaleString('en-IN')}`,
      hint: 'per order',
      icon: IndianRupee,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-slate-900',
    },
  ];

  const noSupplierWarning = (() => {
    const n = paymentStatus.noSupplier;
    const total = rangeSummary.totalOrders;
    if (n === 0) return null;
    const who =
      n === total
        ? total === 1 ? 'This purchase has' : total === 2 ? 'Both purchases have' : `All ${total} purchases have`
        : `${plural(n, 'purchase')} ${n === 1 ? 'has' : 'have'}`;
    return who;
  })();

  // Old-range data stays on screen while a new range loads; dim it meanwhile.
  const fetchingClass = isFetching ? 'pointer-events-none opacity-50' : '';

  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${active
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
        <div className="flex-shrink-0">
          <BackButton />
        </div>

        <div className="min-w-0 flex-1">
          <p className="hidden text-xs text-slate-500 md:block">Reports /</p>
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Purchase report</h1>
            <span className="hidden text-xs text-slate-500 md:inline">
              {plural(rangeSummary.totalOrders, 'purchase')} · {rangeLabelShort}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500">
            <span className="truncate md:hidden">{rangeLabel} ·</span>
            <button
              onClick={refresh}
              disabled={isFetching}
              title="Fetch the latest purchases"
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
            <ReportByDayChart
              records={rangePurchases}
              start={appliedFilters.start}
              end={appliedFilters.end}
              noun="Purchases"
              bestPrefix="Biggest"
            />
          )}
        </div>
        <div className="hidden md:col-span-2 md:block">
          <div className="h-full rounded-sm border border-line bg-white shadow-card p-4">
            <h3 className="text-sm font-semibold text-slate-900">Payment status</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-600">Paid to suppliers</dt>
                <dd className="font-semibold text-green-700">{formatCurrency(paymentStatus.paid)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-600">Still due</dt>
                <dd className="font-semibold text-amber-600">{formatCurrency(paymentStatus.due)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-600">GST input credit</dt>
                <dd className="font-semibold text-slate-900">{formatCurrency(paymentStatus.gst)}</dd>
              </div>
            </dl>
            {noSupplierWarning && (
              <div className="mt-4 flex gap-2 rounded-sm border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
                <p>
                  {noSupplierWarning} <strong>no supplier</strong> — add one to track dues and claim GST.
                </p>
              </div>
            )}
          </div>
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
              {plural(filteredPurchases.length, 'purchase')}
            </span>
          </div>

          {/* Desktop controls */}
          <div className="hidden items-center gap-2 md:flex">
            <div className="relative">
              <Filter size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="max-w-56 appearance-none truncate rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-blue-500"
              >
                <option value="all">All suppliers</option>
                {supplierOptions.map(([key, name]) => (
                  <option key={key} value={key}>{name}</option>
                ))}
                {paymentStatus.noSupplier > 0 && <option value={NO_SUPPLIER}>No supplier</option>}
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
                  {renderSortHeader('Ref', 'invoiceNumber')}
                  {renderSortHeader('Supplier', 'partyName')}
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Supplier bill</th>
                  {renderSortHeader('Items', 'items')}
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Status</th>
                  {renderSortHeader('Amount', 'totalAmount', 'right')}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredPurchases.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                      No purchases in this period. Pick another period, or add a purchase to see it here.
                    </td>
                  </tr>
                )}
                {filteredPurchases.map((purchase) => {
                  const isOpen = selectedId === purchase.id;
                  return (
                    <React.Fragment key={purchase.id}>
                      <tr
                        onClick={() => setSelectedId(purchase.id)}
                        className={`cursor-pointer border-t border-line transition ${isOpen ? 'bg-blue-50' : 'hover:bg-sunken'}`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFullDate(purchase.createdAt)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-blue-600">{refLabel(purchase)}</td>
                        <td className="px-4 py-3">
                          {hasSupplier(purchase) ? (
                            <>
                              <p className="text-slate-800">{purchase.partyName}</p>
                              {purchase.partyNumber && (
                                <p className="text-xs text-slate-500">{formatPhone(purchase.partyNumber)}</p>
                              )}
                            </>
                          ) : (
                            <>
                              <p className="text-amber-600">No supplier</p>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPurchaseForEdit(purchase);
                                }}
                                className="text-xs font-medium text-blue-600 hover:underline"
                              >
                                Add supplier
                              </button>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{purchase.supplierBillNumber || '—'}</td>
                        <td className="px-4 py-3 text-slate-700">{getPurchaseItemCount(purchase)}</td>
                        <td className="px-4 py-3">{renderStatusBadge(purchase, true)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                          {formatCurrency(purchase.totalAmount)}
                        </td>
                        <td className="px-2 py-3 text-slate-400">
                          <ChevronRight size={16} />
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
              {filteredPurchases.length > 0 && (
                <tfoot className="border-t border-line bg-sunken text-sm font-semibold text-slate-900">
                  <tr>
                    <td colSpan={4} className="px-4 py-3">
                      Total · {plural(summary.totalOrders, 'purchase')}
                    </td>
                    <td className="px-4 py-3">{summary.totalItemsPurchased}</td>
                    <td />
                    <td className="whitespace-nowrap px-4 py-3 text-right">{formatCurrency(summary.totalPurchases)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* Mobile list */}
        <ul className="md:hidden">
          {filteredPurchases.length === 0 && (
            <li className="border-t border-line px-4 py-10 text-center text-sm text-slate-500">
              No purchases in this period. Pick another period, or add a purchase to see it here.
            </li>
          )}
          {filteredPurchases.map((purchase) => {
            const supplierOk = hasSupplier(purchase);
            return (
              <li
                key={purchase.id}
                onClick={() => setSelectedId(purchase.id)}
                className="cursor-pointer border-t border-line px-4 py-3 active:bg-sunken"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold text-slate-900">{refLabel(purchase)}</span>
                    {renderStatusBadge(purchase, false)}
                  </div>
                  <span className="shrink-0 font-semibold text-slate-900">{formatCurrency(purchase.totalAmount)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-3 text-xs">
                  <span className={`truncate ${supplierOk ? 'text-slate-500' : 'text-amber-600'}`}>
                    {supplierOk ? purchase.partyName : 'No supplier'} · {itemsLabel(getPurchaseItemCount(purchase))}
                  </span>
                  <span className="shrink-0 text-slate-500">{formatDayMonth(purchase.createdAt)}</span>
                </div>
              </li>
            );
          })}
          {filteredPurchases.length > 0 && (
            <li className="flex items-center justify-between rounded-b-sm border-t border-line bg-sunken px-4 py-3 text-sm font-semibold text-slate-900">
              <span>Total · {plural(summary.totalOrders, 'purchase')}</span>
              <span>{formatCurrency(summary.totalPurchases)}</span>
            </li>
          )}
        </ul>
      </section>

      {(() => {
        const selected = selectedId ? filteredPurchases.find((p) => p.id === selectedId) : undefined;
        return selected ? renderPurchasePanel(selected) : null;
      })()}
    </div>
  );
};

export default PurchaseReport;
