import React, { useMemo, useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Info,
  Package,
  Percent,
  Search,
  Tag,
  X,
} from 'lucide-react';
import useItemReport from './ItemReportComponents/useItemReport';
import type { Item } from '../../constants/models';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { Spinner } from '../../constants/Spinner';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import sellarLogo from '../../assets/sellar-logo.png';
import { useAuth } from '../../context/auth-context';
import BackButton from '../../Components/BackButton';
import { useGodowns, useGodownStock, SHOP_ID, SHOP_NAME } from '../hooks/useStockTransfer';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { Modal } from '../../constants/Modal';
import { Permissions, State } from '../../enums';
import { useStockLedger } from '../hooks/useStockLedger';
import { ITEM_ISSUES, hasItemIssue, isItemIssue, type ItemIssue } from './ItemReportComponents/itemIssues';
import {
  formatDateForInput,
  formatRangeLabel,
  getPresetRange,
  parseInputDate,
} from './SalesReportComponents/salesReport.utils';
import DownloadMenu from './SalesReportComponents/DownloadMenu';
import CustomRangePanel from './SalesReportComponents/CustomRangePanel';
import { ItemEditDrawer } from '../../Components/ItemDrawer';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
const PAGE_SIZE = 100;

// The date range only drives the stock in/out columns of the downloads.
const ITEM_DATE_PRESETS = [
  { value: 'month', label: 'This month' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'fy', label: 'This FY' },
];

type ItemRow = Item & {
  stock: number;
  stockIn: number;
  stockOut: number;
  openingBalance: number;
  closingBalance: number;
  valueOfItem: number;
};

// Sign goes before the ₹ ("-₹5,411", not "₹-5,411")
const inr = (n: number) =>
  `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inrRound = (n: number) => {
  const r = Math.round(n);
  return `${r < 0 ? '-' : ''}₹${Math.abs(r).toLocaleString('en-IN')}`;
};

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

const fmtDay = (ts: number) => {
  const d = new Date(ts);
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
};

const fmtDayMonth = (ts: number) => {
  const d = new Date(ts);
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
};

const fmt2 = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Helvetica can only draw Latin-1 text. Anything else (Hindi, Arabic, emoji, ₹) prints
// garbled with wrong widths, so overlaps the next column. Keep only what it can draw.
const PDF_OK = /[\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u2122]/;
const pdfSafe = (value: unknown): string =>
  Array.from(
    String(value ?? '')
      .replace(/₹/g, 'Rs.')
      .replace(/[\u2010\u2011\u2212]/g, '-')
      .replace(/[\r\t]/g, ' '),
  )
    .filter((ch) => ch === '\n' || PDF_OK.test(ch))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();

const ItemReport: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const canEditItems = hasPermission(Permissions.ManageItems);
  const [showSearch, setShowSearch] = useState(false);
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
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return formatDateForInput(d);
  });
  const [toDate, setToDate] = useState<string>(() => formatDateForInput(new Date()));
  const [datePreset, setDatePreset] = useState<string>('last30');
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const {
    items,
    appliedItemGroupId,
    sortConfig,
    setAppliedItemGroupId,
    setSortConfig,
    itemGroups,
    setItemGroupId,
    setIsListVisible,
    isListVisible,
    setIsDownloadModalOpen,
    setFeedbackModal,
    isLoading,
    feedbackModal,
  } = useItemReport();

  // The list is the point of this page — show it by default.
  useEffect(() => {
    setIsListVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opened from an "Items that need a look" chip on the Item reports hub.
  const location = useLocation();
  const [issueFilter, setIssueFilter] = useState<ItemIssue | null>(() => {
    const issue = (location.state as { issue?: unknown } | null)?.issue;
    return isItemIssue(issue) ? issue : null;
  });

  const { godowns } = useGodowns(currentUser?.companyId);
  const { stockRows } = useGodownStock(currentUser?.companyId, godowns);
  const { ledgerMap } = useStockLedger(currentUser?.companyId, fromDate, toDate, locationFilter);

  // Per-item, per-location quantity map (Shop + every godown).
  const stockByItemLocation = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    stockRows.forEach(r => {
      if (!map.has(r.itemId)) map.set(r.itemId, new Map());
      const inner = map.get(r.itemId)!;
      inner.set(r.godownId, (inner.get(r.godownId) || 0) + r.quantity);
    });
    return map;
  }, [stockRows]);

  // Items with `stock` overridden to reflect the selected location
  // (or the sum across all locations when no location is selected).
  const itemsWithLocationStock: ItemRow[] = useMemo(() => {
    return items.map(item => {
      const locMap = stockByItemLocation.get(item.id || '');
      let stock: number;
      if (locationFilter) {
        stock = locMap?.get(locationFilter) || 0;
      } else {
        stock = locMap ? Array.from(locMap.values()).reduce((s, q) => s + q, 0) : (item.stock || 0);
      }

      const agg = ledgerMap.get(item.id || '') || { in: 0, out: 0 };
      const stockIn = agg.in;
      const stockOut = agg.out;
      const closingBalance = stock;
      const openingBalance = closingBalance - stockIn + stockOut;
      const valueOfItem = stock * (item.purchasePrice || 0);

      return { ...item, stock, stockIn, stockOut, openingBalance, closingBalance, valueOfItem };
    });
  }, [items, stockByItemLocation, locationFilter, ledgerMap]);

  // Items store their group by id or (after a rename) by name.
  const groupOf = (item: Pick<Item, 'itemGroupId'>) =>
    itemGroups.find((g) => g.id === item.itemGroupId || g.name === item.itemGroupId);
  const getGroupName = (id?: string) => {
    if (!id) return UNASSIGNED_GROUP_NAME;
    return groupOf({ itemGroupId: id })?.name || id;
  };

  // Group + location + search: drives the summary cards and issue counts.
  const baseItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const selectedGroup = itemGroups.find((g) => g.id === appliedItemGroupId);
    return itemsWithLocationStock.filter((item) => {
      if (q && !(item.name || '').toLowerCase().includes(q) && !String(item.barcode || '').toLowerCase().includes(q)) {
        return false;
      }
      // When a specific location is selected, only show items that actually
      // have stock there — an item with 0 stock at this location shouldn't appear.
      if (locationFilter && (item.stock || 0) <= 0) return false;

      if (!appliedItemGroupId) return true;
      if (appliedItemGroupId === UNASSIGNED_GROUP_NAME) return !item.itemGroupId || !groupOf(item);
      return item.itemGroupId === appliedItemGroupId || (!!selectedGroup && item.itemGroupId === selectedGroup.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsWithLocationStock, searchQuery, locationFilter, appliedItemGroupId, itemGroups]);

  const issueCounts = useMemo(
    () =>
      Object.fromEntries(
        ITEM_ISSUES.map(({ value }) => [value, baseItems.filter((i) => hasItemIssue(i, value, i.stock || 0)).length]),
      ) as Record<ItemIssue, number>,
    [baseItems],
  );

  const { filteredItems, summary } = useMemo(() => {
    const newFilteredItems = baseItems.filter(
      (item) => !issueFilter || hasItemIssue(item, issueFilter, item.stock || 0),
    );

    newFilteredItems.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = a[key] ?? '';
      const valB = b[key] ?? '';

      if (typeof valA === 'string' && typeof valB === 'string')
        return valA.localeCompare(valB, undefined, { numeric: true }) * direction;
      if (typeof valA === 'number' && typeof valB === 'number')
        return (valA - valB) * direction;
      return 0;
    });

    // Averages are over the group/location/search set, not the issue filter,
    // so the cards don't jump when the user peeks at "No MRP" items.
    const totalItems = baseItems.length;
    const avgOf = (pick: (i: ItemRow) => number) =>
      totalItems > 0 ? baseItems.reduce((sum, item) => sum + (pick(item) || 0), 0) / totalItems : 0;
    const averageMrp = avgOf((i) => i.mrp);
    const averagePurchasePrice = avgOf((i) => i.purchasePrice);
    const averageDiscount = avgOf((i) => i.discount ?? 0);
    const averageSalePrice = averageMrp * (1 - averageDiscount / 100);
    const averageProfitMargin = averageSalePrice - averagePurchasePrice;
    const averageMarginPercentage =
      averageSalePrice > 0 ? (averageProfitMargin / averageSalePrice) * 100 : 0;

    return {
      filteredItems: newFilteredItems,
      summary: {
        totalItems,
        averageMrp,
        averagePurchasePrice,
        averageSalePrice,
        averageProfitMargin,
        averageMarginPercentage,
      },
    };
  }, [baseItems, issueFilter, sortConfig]);

  // Start from the top of the list whenever what's listed changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [baseItems, issueFilter, sortConfig]);

  const handleGroupChange = (value: string) => {
    setItemGroupId(value);
    setAppliedItemGroupId(value);
  };

  const handleDatePresetChange = (preset: string) => {
    const range = getPresetRange(preset);
    if (!range) return;
    setDatePreset(preset);
    setIsRangeOpen(false);
    setFromDate(formatDateForInput(range.start));
    setToDate(formatDateForInput(range.end));
  };

  const handleApplyCustomRange = (startValue: string, endValue: string) => {
    setDatePreset('custom');
    setFromDate(startValue);
    setToDate(endValue);
    setIsRangeOpen(false);
  };

  const handleSort = (key: keyof Item) => {
    const direction =
      sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const prepareExportDataForPdf = (item: Item) => {
    return {
      name: item.name,
      mrp: item.mrp || 0,
      purchasePrice: item.purchasePrice || 0,
      discount: item.discount || 0,
      tax: item.tax || 0,
      itemGroupId: getGroupName(item.itemGroupId),
      stock: item.stock || 0,
      barcode: item.barcode || '-',
      restockQuantity: item.restockQuantity || 0,
    };
  };

    const downloadAsPdf = async () => {
    try {
      // Guard clause in case filteredItems is empty
      if (!filteredItems || filteredItems.length === 0) {
        throw new Error('No data available to export');
      }

      // Landscape A4 for wide data tables
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const M = 14;
      const PAD = 4;
      const brandRight = pageWidth - M;
      const contentW = pageWidth - M * 2;
            const company = pdfSafe(companyName) || 'Your Business';

      const generatedAtText = `Generated ${new Date().toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })}`;
      const rangeStart = parseInputDate(fromDate).getTime();
      const rangeEnd = parseInputDate(toDate).getTime();
      const sameYear = new Date(rangeStart).getFullYear() === new Date(rangeEnd).getFullYear();
      const periodText = fromDate === toDate
        ? fmtDay(rangeStart)
        : sameYear
          ? `${fmtDayMonth(rangeStart)} – ${fmtDay(rangeEnd)}`
          : `${fmtDay(rangeStart)} – ${fmtDay(rangeEnd)}`;
      const periodDays = Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000) + 1);

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
      const LIGHT: RGB = [156, 163, 175];
      const RED: RGB = [220, 38, 38];

      // ---------- DATA (same filteredItems + prepareExportDataForPdf as before) ----------
      const exportData = filteredItems.map(prepareExportDataForPdf);

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

      // Tag icon (lucide, 24x24 grid -> 7mm)
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
      seg([
        [12.6, 2.6], [11.2, 2], [4, 2], [2, 4], [2, 11.2], [2.6, 12.6],
        [11.3, 21.3], [14.7, 21.3], [21.3, 14.7], [21.3, 11.3], [12.6, 2.6],
      ]);
      doc.setFillColor(37, 99, 235);
      doc.circle(ix + 7.5 * k, iy + 7.5 * k, 0.5, 'F');
      doc.setLineCap('butt');
      doc.setLineJoin('miter');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(255, 255, 255);
      doc.text('Detailed Item Report', 32, 38);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(190, 205, 255);
      doc.text('Prices, stock and restock levels for every item', 32, 44.5);

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
      doc.text(`${periodDays} ${periodDays === 1 ? 'day' : 'days'}`, brandRight, 45.5, { align: 'right' });

      // ---------- 2. SUMMARY STRIP ----------
      const cardY = 50;
      const cardH = 32;
      const kpiPad = 6;
      const colWs = [62, 62, contentW - 124];
      const colXs = [M, M + colWs[0], M + colWs[0] + colWs[1]];

      doc.setFillColor(255, 255, 255);
      doc.roundedRect(M, cardY, contentW, cardH, PDF_RADIUS, PDF_RADIUS, 'F');
      doc.setFillColor(238, 243, 255);
      doc.roundedRect(M, cardY, colWs[0], cardH, PDF_RADIUS, PDF_RADIUS, 'F');
      doc.rect(M + colWs[0] - 2, cardY, 2, cardH, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.roundedRect(M, cardY, contentW, cardH, PDF_RADIUS, PDF_RADIUS, 'S');
      doc.line(colXs[1], cardY, colXs[1], cardY + cardH);
      doc.line(colXs[2], cardY, colXs[2], cardY + cardH);

      // Total items
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(100, 110, 135);
      doc.text('Total items', colXs[0] + kpiPad, cardY + 9);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.setTextColor(29, 78, 216);
      doc.text(summary.totalItems.toLocaleString('en-IN'), colXs[0] + kpiPad, cardY + 20);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(120, 128, 150);
      doc.text('in your catalogue', colXs[0] + kpiPad, cardY + 27);

      // Average margin
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(100, 110, 135);
      doc.text('Average margin', colXs[1] + kpiPad, cardY + 9);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text(`${Math.round(summary.averageMarginPercentage)}%`, colXs[1] + kpiPad, cardY + 20);

      // How to read this report
      const lx = colXs[2] + kpiPad;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(100, 110, 135);
      doc.text('How to read this report', lx, cardY + 9);

      // legend row 1: red pill + text
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      const pillTxt = '-2';
      const pillTxtW = doc.getTextWidth(pillTxt);
      doc.setFillColor(254, 226, 226);
      doc.roundedRect(lx, cardY + 13.2, pillTxtW + 5, 5.4, PDF_RADIUS, PDF_RADIUS, 'F');
      doc.setTextColor(RED[0], RED[1], RED[2]);
      doc.text(pillTxt, lx + 2.5, cardY + 17);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text('Negative stock: more sold than recorded', lx + pillTxtW + 8, cardY + 17);

      // legend row 2: dash + text
      doc.setTextColor(LIGHT[0], LIGHT[1], LIGHT[2]);
      doc.text('—', lx + 1, cardY + 25);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text('Price not set for this item', lx + pillTxtW + 8, cardY + 25);

      // ---------- 3. ITEM DETAILS TABLE ----------
      const listY = cardY + cardH + 14;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(17, 24, 39);
      doc.text('Item details', M, listY);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10.5);
      doc.setTextColor(107, 114, 128);
      doc.text(
        `${exportData.length.toLocaleString('en-IN')} ${exportData.length === 1 ? 'item' : 'items'}`,
        brandRight,
        listY,
        { align: 'right' },
      );

      const priceCell = (v: number) => ({
        content: v > 0 ? fmt2(v) : '—',
        styles: { halign: 'right' as const, textColor: v > 0 ? INK : LIGHT },
      });
      const numCell = (v: number) => ({
        content: String(v),
        styles: { halign: 'right' as const, textColor: v ? INK : LIGHT },
      });

            const tableBody: any[] = exportData.map((e) => [
        { content: pdfSafe(e.name) || 'N/A', styles: { fontStyle: 'bold' } },
        { content: pdfSafe(e.itemGroupId) || '-', styles: { textColor: GRAY } },
        { content: pdfSafe(e.barcode) || '-', styles: { textColor: GRAY } },
        priceCell(e.mrp),
        priceCell(e.purchasePrice),
        numCell(e.discount),
        numCell(e.tax),
        {
          content: e.stock < 0 ? '' : e.stock.toLocaleString('en-IN'),
          styles: { halign: 'right' as const, textColor: e.stock ? INK : LIGHT },
        },
        numCell(e.restockQuantity),
      ]);

      // Item | Group | Barcode | MRP | Purchase | Discount | Tax | Stock | Restock  (total = 269mm)
const COLW = [52, 32, 34, 28, 34, 25, 14, 22, 28];

      autoTable(doc, {
        startY: listY + 4,
        margin: { top: 26, bottom: 22, left: M, right: M },
        head: [['Item', 'Group', 'Barcode', 'MRP (Rs.)', 'Purchase price (Rs.)', 'Discount', 'Tax', 'Stock', 'Restock qty']],
        body: tableBody,
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
        columnStyles: COLW.reduce((acc: any, w, i) => {
          acc[i] = { cellWidth: w, ...(i >= 3 ? { halign: 'right' } : {}) };
          return acc;
        }, {}),
                didParseCell: (data) => {
          data.cell.styles.valign = 'middle';

          // Header numeric columns right-aligned (matches body)
          if (data.section === 'head' && data.column.index >= 3) {
            data.cell.styles.halign = 'right';
          }

          // MRP / Purchase price: very long numbers shrink instead of wrapping
          if (data.section === 'body' && (data.column.index === 3 || data.column.index === 4)) {
            const base = Number(data.cell.styles.fontSize) || 10.5;
            doc.setFont('helvetica', data.cell.styles.fontStyle === 'bold' ? 'bold' : 'normal');
            doc.setFontSize(base);
            const w = doc.getTextWidth(data.cell.text.join(' '));
            const avail = COLW[data.column.index] - PAD * 2;
            if (w > avail) data.cell.styles.fontSize = Math.max((base * avail) / w, 6);
          }
        },
        didDrawCell: (data) => {
          const { x, y, width, height } = data.cell;

          // Negative stock -> red pill
          if (data.section === 'body' && data.column.index === 7) {
            const stockVal = exportData[data.row.index]?.stock ?? 0;
            if (stockVal < 0) {
              const label = `-${Math.abs(stockVal).toLocaleString('en-IN')}`;
              doc.setFont('helvetica', 'bold');
              doc.setFontSize(9.5);
              const tw = doc.getTextWidth(label);
              const pw = tw + 5;
              const px = x + width - PAD - pw;
              doc.setFillColor(254, 226, 226);
              doc.roundedRect(px, y + height / 2 - 3, pw, 6, PDF_RADIUS, PDF_RADIUS, 'F');
              doc.setTextColor(RED[0], RED[1], RED[2]);
              doc.text(label, px + 2.5, y + height / 2 + 1.2);
            }
          }

          // Horizontal lines only (no column grid)
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
        },
      });

      // ---------- 4. PAGE 2+ MINI HEADER + FOOTER (every page) ----------
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
          doc.text(`Detailed Item Report | ${periodText}`, brandRight, 15.4, { align: 'right' });
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

        doc.text(`${company} | Detailed Item Report | Page ${i} of ${totalPages}`, brandRight, fy, {
          align: 'right',
        });
      }

      doc.save('detailed_item_report.pdf');

      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'PDF downloaded successfully!',
      });
    } catch (e: any) {
      console.error('PDF Generation Error:', e);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: e?.message === 'No data available to export'
          ? 'No data available to export.'
          : 'Failed to generate PDF.',
      });
    }
  };

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

      const groupLabel = appliedItemGroupId
        ? `Group: ${itemGroups.find(g => g.id === appliedItemGroupId)?.name ?? appliedItemGroupId}`
        : 'Group: All';

      // ── COLUMN DEFINITIONS ──────────────────────────────────────────────
      // Columns 1-16 (header text, marker, notes, width) are copied verbatim
      // from the Bulk Import template (ItemAdd.tsx → handleDownloadSample)
      // so this export looks — and re-imports — exactly like that template.
      // Columns 17-21 are report-only ledger figures with no import-template
      // counterpart, marked with a distinct '■' marker.
      const TYPE_STYLE: Record<string, { bg: string; txt: string }> = {
        R: { bg: 'FEE2E2', txt: 'DC2626' },
        O: { bg: 'DCFCE7', txt: '15803D' },
        L: { bg: 'E0F2FE', txt: '0369A1' },
        X: { bg: 'F1F5F9', txt: '475569' },
      };

      // Same LEGEND block as the Bulk Import template (marker + description
      // per row, colored by type) — plus a 4th row for the report-only columns.
      const legendRows = [
        { type: 'R', marker: '★  Required', desc: 'Must be filled in for a clean re-import — item will be skipped if missing' },
        { type: 'O', marker: '●  Optional', desc: 'Improves data quality; blank is fine on re-import' },
        { type: 'L', marker: '▲  Lookup', desc: 'Matched by name on re-import (category/location)' },
        { type: 'X', marker: '■  Report Only', desc: 'Ledger figures for this report — ignored if this file is re-uploaded' },
      ];

      const COLS = [
        { header: '★ Item Name', note: 'Full product name  e.g. Amul Butter 500g', type: 'R', width: 28 },
        { header: '● Barcode', note: 'Optional (Leave blank to auto-generate)', type: 'O', width: 18 },
        { header: '● MRP', note: 'Max Retail Price (₹)  Required if Sale Price blank', type: 'O', width: 14 },
        { header: '★ Sales Price', note: 'Selling price (₹)  Required if MRP blank', type: 'R', width: 16 },
        { header: '● Purchase Price', note: 'Your cost price (₹)', type: 'O', width: 16 },
        { header: '● Sale Disc (%)', note: 'Default customer discount  e.g. 5', type: 'O', width: 14 },
        { header: '● Purchase Disc (%)', note: 'Supplier discount  e.g. 3', type: 'O', width: 15 },
        { header: '● Tax (%)', note: 'GST/VAT rate  e.g. 18', type: 'O', width: 12 },
        { header: '● HSN Code', note: '6-digit HSN / SAC code', type: 'O', width: 14 },
        { header: '▲ Category', note: 'Group name – new category auto-created', type: 'L', width: 20 },
        { header: '● Stock', note: 'Opening stock quantity', type: 'O', width: 10 },
        { header: '▲ Location', note: `"${SHOP_NAME}" or exact godown name  Leave blank for ${SHOP_NAME}`, type: 'L', width: 18 },
        { header: '● Restock Level', note: 'Alert when stock falls below this', type: 'O', width: 15 },
        { header: '● MOQ', note: 'Minimum Order Quantity', type: 'O', width: 10 },
        { header: '● Image URL', note: 'Web link to image (Optional)', type: 'O', width: 25 },
        { header: '● Description', note: 'Product details shown on Catalogue page', type: 'O', width: 35 },
        { header: '■ Opening Bal.', note: 'Stock at period start (report only)', type: 'X', width: 14 },
        { header: '■ Stock In', note: 'Received during period (report only)', type: 'X', width: 12 },
        { header: '■ Stock Out', note: 'Sold/consumed during period (report only)', type: 'X', width: 12 },
        { header: '■ Closing Bal.', note: 'Stock at period end (report only)', type: 'X', width: 14 },
        { header: '■ Value (₹)', note: 'Closing stock value (report only)', type: 'X', width: 15 },
      ];
      const colCount = COLS.length;
      // Same label the Location column shows for this row's Stock figure.
      // With a specific location filter applied, that's the filtered godown/Shop name;
      // with no filter, Stock is a sum across all locations, so it's labelled Shop by default
      // (matches Bulk Import's own "blank = Shop" convention on re-upload).
      const exportLocationLabel = locationFilter
        ? (locationFilter === SHOP_ID ? SHOP_NAME : (godowns.find(g => g.id === locationFilter)?.name || SHOP_NAME))
        : SHOP_NAME;
      // Row layout (mirrors the Bulk Import template's layout exactly):
      // 0    → Title (merged)
      // 1    → Meta (merged)
      // 2    → "LEGEND" label (merged)
      // 3-6  → Legend rows (marker + description, same as the Import template)
      // 7    → blank spacer
      // 8    → Summary label (merged)
      // 9    → Summary values
      // 10   → blank spacer
      // 11   → Column headers
      // 12   → Notes row (REQUIRED: Bulk Import always reads data starting
      //         2 rows after the header row it detects, so this row must exist)
      // 13+  → Data rows

      const legendStartRow = 3;
      const summaryLabelRow = legendStartRow + legendRows.length + 1; // 8
      const headerRow = summaryLabelRow + 3; // 11
      const notesRow = headerRow + 1; // 12
      const dataStartRow = headerRow + 2; // 13
      const totalRows = dataStartRow + filteredItems.length; // no footer row — see Change 5
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title (Company Name alongside)
      aoa[0][0] = companyName
        ? `SELLAR  ·  Item Report  —  ${companyName}`
        : 'SELLAR  ·  Item Report';

      const periodText = fromDate === toDate
        ? `Period: ${new Date(fromDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`
        : `Period: ${new Date(fromDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })} to ${new Date(toDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`;

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodText}   |   ${groupLabel}   |   Total Items: ${summary.totalItems}`;

      // Row 2 – "LEGEND" label
      aoa[2][0] = 'LEGEND';

      // Rows 3-6 – Legend rows (marker in col A, description in col B)
      legendRows.forEach((l, i) => {
        aoa[legendStartRow + i][0] = l.marker;
        aoa[legendStartRow + i][1] = l.desc;
      });

      // Row 8 – Summary label
      aoa[summaryLabelRow][0] = 'SUMMARY';

      // Row 9 – Summary values (single merged cell)
      aoa[summaryLabelRow + 1][0] = `Avg MRP: ₹${summary.averageMrp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Cost: ₹${summary.averagePurchasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Sale: ₹${summary.averageSalePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Margin: ₹${summary.averageProfitMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Margin %: ${summary.averageMarginPercentage.toFixed(1)}%`;

      // Row 11 – Column headers
      COLS.forEach((c, i) => { aoa[headerRow][i] = c.header; });

      // Row 12 – Notes (same per-column descriptions as the Import template)
      COLS.forEach((c, i) => { aoa[notesRow][i] = c.note; });

      // Rows 13+ – Data (column order matches Bulk Import parser exactly)
      filteredItems.forEach((item, idx) => {
        const r = dataStartRow + idx;
        const salePrice =
          (item as any).salesPrice ||
          (item.mrp && item.discount
            ? parseFloat((item.mrp * (1 - item.discount / 100)).toFixed(2))
            : item.mrp || 0);

        aoa[r][0] = item.name || '-';                        // Name
        aoa[r][1] = item.barcode || '-';                      // Barcode
        aoa[r][2] = item.mrp || 0;                             // MRP
        aoa[r][3] = salePrice;                                 // Sale Price
        aoa[r][4] = item.purchasePrice || 0;                   // Cost Price
        aoa[r][5] = item.discount || 0;                        // Discount %
        aoa[r][6] = (item as any).purchasediscount || 0;       // Purchase Disc %
        aoa[r][7] = item.tax || 0;                              // Tax %
        aoa[r][8] = (item as any).hsnSac || '-';                 // HSN/SAC
        aoa[r][9] = getGroupName(item.itemGroupId);              // Item Group
        aoa[r][10] = item.stock || 0;                            // Stock
        aoa[r][11] = exportLocationLabel;                        // Location
        aoa[r][12] = item.restockQuantity || 0;                  // Restock Qty
        aoa[r][13] = (item as any).moq || 1;                     // MOQ
        aoa[r][14] = (item as any).imageUrl || '';                // Image URL
        aoa[r][15] = (item as any).description || '';
        aoa[r][16] = (item as any).openingBalance ?? 0;             // Opening Balance
        aoa[r][17] = (item as any).stockIn ?? 0;                    // Stock In
        aoa[r][18] = (item as any).stockOut ?? 0;                   // Stock Out
        aoa[r][19] = (item as any).closingBalance ?? item.stock ?? 0; // Closing Balance
        aoa[r][20] = (item as any).valueOfItem ?? 0;                // Value
      });

      // No footer/TOTAL row — a text row at the end would get misread as
      // an extra invalid item if this file is re-uploaded into Bulk Import.

      // ── BUILD WORKSHEET ──────────────────────────────────────────────────
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 34 }, // 0 title
        { hpt: 20 }, // 1 meta
        { hpt: 18 }, // 2 "LEGEND" label
        ...legendRows.map(() => ({ hpt: 18 })), // 3-6 legend rows
        { hpt: 8 },  // 7 spacer
        { hpt: 18 }, // 8 summary label
        { hpt: 22 }, // 9 summary values
        { hpt: 8 },  // 10 spacer
        { hpt: 28 }, // 11 headers
        { hpt: 24 }, // 12 notes (required offset row for Bulk Import)
        ...filteredItems.map(() => ({ hpt: 20 })),
      ];

      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
        ...legendRows.map((_, i) => ({ s: { r: legendStartRow + i, c: 2 }, e: { r: legendStartRow + i, c: 3 } })),
        { s: { r: summaryLabelRow, c: 0 }, e: { r: summaryLabelRow, c: colCount - 1 } },
        { s: { r: summaryLabelRow + 1, c: 0 }, e: { r: summaryLabelRow + 1, c: colCount - 1 } },
      ];

      const style = (addr: string, st: any) => {
        if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
        worksheet[addr].s = st;
      };

      // ── APPLY STYLES ──────────────────────────────────────────────────────

      // Title (row 0) — same palette as the Bulk Import template
      style('A1', s(
        { sz: 15, bold: true, color: { rgb: 'FFFFFF' } },
        solidFill('0369A1'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Meta (row 1)
      style('A2', s(
        { sz: 9, italic: true, color: { rgb: '475569' } },
        solidFill('DBEAFE'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // "LEGEND" label (row 2)
      style('A3', s(
        { sz: 10, bold: true, color: { rgb: '0369A1' } },
        solidFill('E0F2FE'),
        { horizontal: 'left', vertical: 'center' },
        allBorders,
      ));

      // Legend rows (rows 3-6) — marker cell + description cell, same
      // 2-column layout and colors as the Bulk Import template
      legendRows.forEach((l, i) => {
        const { bg, txt } = TYPE_STYLE[l.type];
        const row = legendStartRow + i;
        style(XLSX.utils.encode_cell({ r: row, c: 0 }), s(
          { sz: 9, bold: true, color: { rgb: txt } },
          solidFill(bg),
          { horizontal: 'left', vertical: 'center' },
          bblr,
        ));
        style(XLSX.utils.encode_cell({ r: row, c: 1 }), s(
          { sz: 9, color: { rgb: '334155' } },
          solidFill(bg),
          { horizontal: 'left', vertical: 'center' },
          bblr,
        ));
        [2, 3].forEach(ci => {
          style(XLSX.utils.encode_cell({ r: row, c: ci }), s(
            { sz: 9 },
            solidFill(bg),
            {},
            bblr,
          ));
        });
      });

      // Summary label (row 8)
      style(XLSX.utils.encode_cell({ r: summaryLabelRow, c: 0 }), s(
        { sz: 10, bold: true, color: { rgb: '1D4ED8' } },
        solidFill('EFF6FF'),
        { horizontal: 'left', vertical: 'center' },
        allBorders,
      ));

      style(XLSX.utils.encode_cell({ r: summaryLabelRow + 1, c: 0 }), s(
        { sz: 10, bold: true, color: { rgb: '166534' } },
        solidFill('DCFCE7'),
        { horizontal: 'center', vertical: 'center' },
        bblr,
      ));

      // Column headers — colored per marker type, same as the
      // Bulk Import template (TYPE_STYLE)
      COLS.forEach((c, i) => {
        const { bg, txt } = TYPE_STYLE[c.type];
        const addr = XLSX.utils.encode_cell({ r: headerRow, c: i });
        style(addr, s(
          { sz: 9, bold: true, color: { rgb: txt } },
          solidFill(bg),
          { horizontal: 'center', vertical: 'center', wrapText: true },
          allBorders,
        ));
      });

      // Notes row — same style as the Bulk Import template's notes row
      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: notesRow, c: i });
        style(addr, s(
          { sz: 7, italic: true, color: { rgb: '64748B' } },
          solidFill('F8FAFC'),
          { horizontal: 'center', vertical: 'center', wrapText: true },
          bblr,
        ));
      });

      // Numeric column indices (for right-align + number formatting)
      const numericCols = new Set([2, 3, 4, 5, 6, 7, 10, 12, 13, 16, 17, 18, 19, 20]);

      // Data rows
      filteredItems.forEach((item, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');
        const salePrice =
          (item as any).salesPrice ||
          (item.mrp && item.discount
            ? parseFloat((item.mrp * (1 - item.discount / 100)).toFixed(2))
            : item.mrp || 0);
        const isLowMargin = salePrice > 0 && item.purchasePrice
          ? (salePrice - item.purchasePrice) / salePrice < 0.05
          : false;

        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isNumeric = numericCols.has(ci);
          style(addr, s(
            {
              sz: 9,
              color: { rgb: isLowMargin && ci === 3 ? 'DC2626' : '1E293B' },
              bold: isLowMargin && ci === 3,
            },
            rowBg,
            { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
            bblr,
          ));
          // Apply number formatting for currency/numeric columns.
          // Plain "0.00" — no thousands separator, no ₹ symbol — so the
          // cell holds a clean re-importable number.
          if (worksheet[addr] && isNumeric) {
            const isCurrency = [2, 3, 4, 20].includes(ci); // MRP, Sale Price, Cost Price, Value
            worksheet[addr].t = 'n';
            worksheet[addr].z = isCurrency ? '0.00' : '0.##';
          }
        }
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Item Report');
      XLSX.writeFile(workbook, 'item_report.xlsx'); // same file — now also import-ready

      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Excel file downloaded successfully!',
      });
    } catch (e) {
      console.error(e);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate Excel file.',
      });
    }
  };

  /* ---------- DOWNLOAD / SHARE ---------- */
  const runDownload = (action: () => void) => {
    if (filteredItems.length === 0) {
      setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No items available to download.' });
      return;
    }
    action();
  };

  /* ---------- RENDER HELPERS ---------- */
  const renderSortHeader = (label: string, key: keyof Item, align: 'left' | 'right' = 'left') => {
    const isActive = sortConfig.key === key;
    const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => handleSort(key)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-blue-800 ${align === 'right' ? 'flex-row-reverse' : ''
            }`}
        >
          {label}
          <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
        </button>
      </th>
    );
  };

  const issueChips = (compact: boolean) =>
    ITEM_ISSUES.map(({ value, label }) => {
      const active = issueFilter === value;
      const count = issueCounts[value];
      return (
        <button
          key={value}
          onClick={() => setIssueFilter(active ? null : value)}
          title={`${count} ${count === 1 ? 'item' : 'items'}`}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-2.5 py-1 text-xs font-medium transition ${active
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
            }`}
        >
          {!compact && <AlertTriangle size={12} className={active ? 'text-amber-300' : 'text-amber-500'} />}
          {compact && value === 'noCost' ? 'No cost' : label}
          {count > 0 && <span className={active ? 'text-white/80' : 'text-slate-400'}>{count}</span>}
        </button>
      );
    });

  const openItem = (item: Item) => {
    if (canEditItems) setEditingItem(item);
  };

  if (isLoading) return <Spinner />;

  const selectedGroupName = appliedItemGroupId
    ? appliedItemGroupId === UNASSIGNED_GROUP_NAME
      ? UNASSIGNED_GROUP_NAME
      : getGroupName(appliedItemGroupId)
    : '';
  const selectedLocationName = locationFilter
    ? locationFilter === SHOP_ID
      ? SHOP_NAME
      : godowns.find((g) => g.id === locationFilter)?.name || 'location'
    : '';
  const scopeLabel = `${selectedGroupName ? `in ${selectedGroupName}` : 'in all groups'} · ${selectedLocationName ? `at ${selectedLocationName}` : 'all locations'
    }`;
  const rangeLabel = formatRangeLabel(parseInputDate(fromDate).getTime(), parseInputDate(toDate).getTime());

  const statCards = [
    {
      label: 'Avg margin',
      value: `${Math.round(summary.averageMarginPercentage)}%`,
      hint: `${inrRound(summary.averageProfitMargin)} per item on average`,
      icon: Percent,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-blue-600',
    },
    {
      label: 'Items',
      value: summary.totalItems.toLocaleString('en-IN'),
      hint: scopeLabel,
      icon: Tag,
      iconClass: 'bg-orange-50 text-orange-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Avg sale price',
      value: inrRound(summary.averageSalePrice),
      hint: `MRP ${inrRound(summary.averageMrp)} on average`,
      icon: FileText,
      iconClass: 'bg-blue-50 text-blue-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Avg cost price',
      value: inrRound(summary.averagePurchasePrice),
      hint: 'what you pay suppliers',
      icon: Package,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-slate-900',
    },
  ];

  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${active
      ? 'border-slate-900 bg-slate-900 text-white'
      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
    }`;

  const selectClass =
    'w-full appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-blue-500';

  const visibleItems = filteredItems.slice(0, visibleCount);
  const mobileSortValue = `${String(sortConfig.key)}:${sortConfig.direction}`;

  return (
    <div className="min-h-screen bg-canvas px-3 pb-20 pt-3 md:px-6 md:pb-8 md:pt-5">
      {feedbackModal.isOpen && (
        <Modal
          type={feedbackModal.type}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal((prev) => ({ ...prev, isOpen: false }))}
          showConfirmButton={false}
        />
      )}

      {canEditItems && (
        <ItemEditDrawer
          item={editingItem}
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          // The shared items listener brings the saved item back into the list.
          onSaveSuccess={() => { }}
        />
      )}

      {/* HEADER */}
      <header className="mb-4 flex items-center gap-2 md:gap-3">
        <div className="flex-shrink-0">
          <BackButton />
        </div>

        <div className="min-w-0 flex-1">
          <p className="hidden text-xs text-slate-500 md:block">Reports / Item reports /</p>
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Item report</h1>
            <span className="hidden text-xs text-slate-500 md:inline">Stock, prices and margin for every item</span>
          </div>
          <p className="truncate text-xs text-slate-500 md:hidden">
            {summary.totalItems.toLocaleString('en-IN')} items · {selectedGroupName || 'all groups'}
          </p>
        </div>

        {/* Desktop search */}
        <div className="relative hidden w-72 md:block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search item name or barcode"
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
            placeholder="Search item name or barcode"
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

      {/* FILTERS */}
      <div className="relative mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="grid grid-cols-2 gap-2.5 md:flex md:gap-2">
          <div className="relative md:w-44">
            <select value={appliedItemGroupId} onChange={(e) => handleGroupChange(e.target.value)} className={selectClass}>
              <option value="">All groups</option>
              {itemGroups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
              <option value={UNASSIGNED_GROUP_NAME}>Uncategorized</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
          <div className="relative md:w-44">
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={selectClass}>
              <option value="">All locations</option>
              <option value={SHOP_ID}>{SHOP_NAME}</option>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
        </div>

        {/* Date range — only affects stock in/out in the downloads, so desktop only */}
        <div className="hidden items-center gap-2 md:ml-auto md:flex">
          {ITEM_DATE_PRESETS.map((p) => (
            <button key={p.value} onClick={() => handleDatePresetChange(p.value)} className={chipClass(datePreset === p.value)}>
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setIsRangeOpen((o) => !o)}
            title="Period for stock in / out in the downloads"
            className={`inline-flex shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 ${datePreset === 'custom' ? 'border-slate-900' : 'border-slate-300'
              }`}
          >
            <CalendarDays size={15} className="text-slate-500" />
            {rangeLabel}
          </button>
        </div>

        {isRangeOpen && (
          <div className="absolute right-0 top-full z-30 mt-2 w-80">
            <CustomRangePanel
              initialStart={fromDate}
              initialEnd={toDate}
              onApply={handleApplyCustomRange}
              onCancel={() => setIsRangeOpen(false)}
            />
          </div>
        )}
      </div>

      {/* SUMMARY — 2 cols up to laptop width (sidebar eats tablet width), 4 cols on xl+ */}
      <div className="mb-3 grid grid-cols-2 gap-2.5 md:mb-3 md:gap-4 xl:grid-cols-4">
        {statCards.map(({ label, value, hint, icon: Icon, iconClass, valueClass }) => (
          <div key={label} className="min-w-0 rounded-sm border border-line bg-white shadow-card p-3 md:p-4">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}>
                <Icon size={14} />
              </span>
              <span className="truncate text-xs font-medium text-slate-700 md:text-sm">{label}</span>
            </div>
            <p title={value} className={`mt-2 truncate text-lg font-bold sm:text-xl md:text-2xl ${valueClass}`}>{value}</p>
            <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
          </div>
        ))}
      </div>

      {/* HOW TO READ THE AVERAGES */}
      <div className="mb-4 hidden items-center gap-2 rounded-sm bg-blue-50/70 px-3 py-2 text-xs text-blue-800 md:flex">
        <Info size={14} className="shrink-0 text-blue-600" />
        <p>
          Averages are per item, so a few costly items pull them up — sort by MRP to see which. Margin = sale price − cost price.
        </p>
      </div>

      {/* MOBILE: issue chips */}
      <div className="mb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        {issueChips(true)}
      </div>

      {/* ITEMS */}
      {/* No overflow-hidden here: it would clip the Download menu when the list is short. */}
      <section className="rounded-sm border border-line bg-white shadow-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Items</h2>
              <span className="hidden rounded-sm bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 md:inline">
                {filteredItems.length.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-xs text-slate-500">Show:</span>
              {issueChips(false)}
            </div>
          </div>

          {/* Desktop controls */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
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
              onChange={(e) => {
                const [key, direction] = e.target.value.split(':') as [keyof Item, 'asc' | 'desc'];
                setSortConfig({ key, direction });
              }}
              className="appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="stock:asc">Lowest stock</option>
              <option value="stock:desc">Highest stock</option>
              <option value="mrp:desc">Highest MRP</option>
              <option value="purchasePrice:desc">Highest cost</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
        </div>

        {/* Desktop table */}
        {isListVisible && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-sunken text-[11px] text-blue-700/80">
                <tr>
                  {renderSortHeader('Barcode', 'barcode')}
                  {renderSortHeader('Item name', 'name')}
                  {renderSortHeader('Stock', 'stock', 'right')}
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Group</th>
                  {renderSortHeader('MRP', 'mrp', 'right')}
                  {renderSortHeader('Cost price', 'purchasePrice', 'right')}
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Stock value</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      No items match these filters. Clear a filter or try a different search.
                    </td>
                  </tr>
                )}
                {visibleItems.map((item) => {
                  const stock = item.stock || 0;
                  const hasCost = Number(item.purchasePrice) > 0;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => openItem(item)}
                      className={`border-t border-line transition hover:bg-sunken ${canEditItems ? 'cursor-pointer' : ''}`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.barcode || '—'}</td>
                      <td className="max-w-[320px] px-4 py-3 font-semibold text-slate-900">
                        <span title={item.name} className="block truncate">{item.name}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <p className={stock < 0 ? 'font-semibold text-red-600' : 'text-slate-700'}>{stock.toLocaleString('en-IN')}</p>
                        {stock < 0 && <p className="text-[11px] text-red-600">Sold more than stock</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          title={getGroupName(item.itemGroupId)}
                          className="inline-block max-w-[160px] truncate rounded-sm bg-slate-100 px-1.5 py-0.5 align-middle text-[11px] text-slate-600"
                        >
                          {getGroupName(item.itemGroupId)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {Number(item.mrp) > 0 ? (
                          <span className="text-slate-700">{inr(item.mrp)}</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">No MRP</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {hasCost ? (
                          <span className="text-slate-700">{inr(item.purchasePrice)}</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">No cost</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {hasCost && stock > 0 ? inrRound(item.valueOfItem) : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile list */}
        <ul className="md:hidden">
          {filteredItems.length === 0 && (
            <li className="border-t border-line px-4 py-10 text-center text-sm text-slate-500">
              No items match these filters. Clear a filter or try a different search.
            </li>
          )}
          {visibleItems.map((item) => {
            const stock = item.stock || 0;
            const hasMrp = Number(item.mrp) > 0;
            const hasCost = Number(item.purchasePrice) > 0;
            return (
              <li
                key={item.id}
                onClick={() => openItem(item)}
                className={`border-t border-line px-4 py-3 ${canEditItems ? 'cursor-pointer active:bg-sunken' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-semibold text-slate-900">{item.name}</p>
                  <p className={`shrink-0 text-sm ${stock < 0 ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                    {stock.toLocaleString('en-IN')} in stock
                  </p>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="truncate">
                    {[item.barcode, getGroupName(item.itemGroupId)].filter(Boolean).join(' · ')}
                  </span>
                  <span className="shrink-0">
                    {hasMrp ? `MRP ${inr(item.mrp)}` : <span className="font-medium text-amber-600">No MRP</span>}
                    {' · '}
                    {hasCost ? `Cost ${inr(item.purchasePrice)}` : <span className="font-medium text-amber-600">No cost</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Footer: paging + how stock value is worked out */}
        {filteredItems.length > 0 && (
          // The mobile list is always shown; the desktop table can be hidden.
          <div className={`flex flex-wrap items-center justify-between gap-2 rounded-b-sm border-t border-line bg-sunken px-4 py-2.5 text-xs text-slate-500 ${isListVisible ? '' : 'md:hidden'}`}>
            <span>
              Showing {visibleItems.length.toLocaleString('en-IN')} of {summary.totalItems.toLocaleString('en-IN')}
              <span className="hidden md:inline"> · stock value = stock × cost price</span>
            </span>
            <div className="flex items-center gap-3">
              {visibleItems.length < filteredItems.length && (
                <button
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-slate-400"
                >
                  Show {Math.min(PAGE_SIZE, filteredItems.length - visibleItems.length)} more
                </button>
              )}
              {canEditItems && <span className="hidden md:inline">Open an item to edit it</span>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default ItemReport;
