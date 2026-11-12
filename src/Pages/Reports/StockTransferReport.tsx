import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  CalendarDays,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
  Info,
  MapPin,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Ruler,
  Search,
  SlidersHorizontal,
  Store,
  Tag,
  Trash2,
  Warehouse,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import BackButton from '../../Components/BackButton';
import {
  useGodowns, useStockTransfers, useGodownStock, SHOP_ID, SHOP_NAME,
  type GodownStockRow, type StockTransfer,
} from '../hooks/useStockTransfer';
import { GodownModal } from '../../Components/GodownModal';
import { TransferStockModal } from '../../Components/TransferStockModal';
import { DeleteGodownModal } from '../../Components/DeleteGodownModal';
import { State } from '../../enums';
import { ThemedModal as Modal } from '../../Components/ThemeModal';
import { Spinner } from '../../constants/Spinner';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import sellarLogo from '../../assets/sellar-logo.png';
import DownloadMenu from './SalesReportComponents/DownloadMenu';
import CustomRangePanel from './SalesReportComponents/CustomRangePanel';
import {
  DATE_PRESETS,
  formatDateForInput,
  formatDayMonth,
  formatFullDate,
  formatRangeLabel,
  getPresetRange,
  parseInputDate,
} from './SalesReportComponents/salesReport.utils';

type Tab = 'stock' | 'history';
type TypeFilter = 'all' | StockTransfer['type'];
type StockSortKey = 'itemName' | 'godownName' | 'quantity';
type HistorySortKey = 'date' | 'itemName' | 'quantity';

const PAGE_SIZE = 100;
const qty = (n: number) => n.toLocaleString('en-IN');

/* ---------- PDF HELPERS (same look as Sales Report PDF) ---------- */
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

const fmtDay = (ts: number) => {
  const d = new Date(ts);
  return `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })} ${d.getFullYear()}`;
};
const plural = (n: number, word: string, many = `${word}s`) => `${qty(n)} ${n === 1 ? word : many}`;

const TYPE_LABEL: Record<StockTransfer['type'], string> = {
  'purchase-in': 'Purchase',
  transfer: 'Transfer',
  adjustment: 'Adjustment',
};

interface StockTransferReportPageProps {
  theme?: 'blue' | 'orange';
}

const StockTransferReportPage: React.FC<StockTransferReportPageProps> = ({ theme = 'blue' }) => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    const fetchCompanyName = async () => {
      if (!currentUser?.companyId) return;
      try {
        const snap = await getDoc(doc(db, 'companies', currentUser.companyId, 'business_info', currentUser.companyId));
        if (snap.exists()) setCompanyName(snap.data().businessName || '');
      } catch (e) {
        console.error('Failed to fetch company name', e);
      }
    };
    fetchCompanyName();
  }, [currentUser?.companyId]);

  // Catalogue reuses this page in orange (SELLAR Catalogue theme). Every class is a
  // full literal so Tailwind can see it. 'blue' = POS, unchanged.
  const cat = theme === 'orange';
  const T = cat
    ? {
      canvas: 'bg-[#fff5ec]',
      line: 'border-[#f6e1d0]',
      sunken: 'bg-[#fff8f2]',
      sunkenHover: 'hover:bg-[#fff8f2]',
      sunkenActive: 'active:bg-[#fff8f2]',
      btn: 'bg-orange-700 hover:bg-orange-800',
      tab: 'border-orange-700 text-orange-800',
      text: 'text-orange-700',
      ink: 'text-orange-800',
      head: 'text-orange-800/80',
      headHover: 'hover:text-orange-800',
      soft: 'bg-orange-100',
      softPill: 'bg-orange-100 text-orange-800',
      softHover: 'hover:bg-orange-100',
      bar: 'bg-orange-500',
      focusBorder: 'focus:border-orange-600',
      focusRing: 'focus:ring-orange-100',
      selected: 'border-orange-700 ring-2 ring-orange-100',
      note: 'bg-orange-100 text-orange-900',
      noteBtn: 'border-orange-200 hover:border-orange-300',
    }
    : {
      canvas: 'bg-canvas',
      line: 'border-line',
      sunken: 'bg-sunken',
      sunkenHover: 'hover:bg-sunken',
      sunkenActive: 'active:bg-sunken',
      btn: 'bg-blue-600 hover:bg-blue-700',
      tab: 'border-blue-600 text-blue-700',
      text: 'text-blue-600',
      ink: 'text-blue-700',
      head: 'text-blue-700/80',
      headHover: 'hover:text-blue-800',
      soft: 'bg-blue-50',
      softPill: 'bg-blue-50 text-blue-700',
      softHover: 'hover:bg-blue-50',
      bar: 'bg-blue-600',
      focusBorder: 'focus:border-blue-500',
      focusRing: 'focus:ring-blue-100',
      selected: 'border-blue-600 ring-2 ring-blue-100',
      note: 'bg-blue-50 text-blue-900',
      noteBtn: 'border-blue-200 hover:border-blue-300',
    };
  const accentBtn = T.btn;
  const accentTab = T.tab;

  /* ---------- DATE RANGE (history) ---------- */
  const [datePreset, setDatePreset] = useState('last30');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return formatDateForInput(d);
  });
  const [endDate, setEndDate] = useState(() => formatDateForInput(new Date()));
  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(() => {
    const s = new Date(); s.setDate(s.getDate() - 29); s.setHours(0, 0, 0, 0);
    const e = new Date(); e.setHours(23, 59, 59, 999);
    return { start: s.getTime(), end: e.getTime() };
  });
  const [isRangeOpen, setIsRangeOpen] = useState(false);

  /* ---------- DATA ---------- */
  const { godowns, loading: godownsLoading, addGodown, updateGodown, deleteGodown } = useGodowns(companyId);
  const { stockRows, items, loading: stockLoading } = useGodownStock(companyId, godowns);
  const {
    transfers,
    loading: historyLoading,
    isFetching: historyFetching,
    lastUpdated,
    refresh,
    transferStock,
    deleteTransferRecord,
  } = useStockTransfers(companyId, appliedFilters);

  /* ---------- UI STATE ---------- */
  const [activeTab, setActiveTab] = useState<Tab>('stock');
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState(''); // '' = all locations
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [isListVisible, setIsListVisible] = useState(true);
  const [isGodownModalOpen, setIsGodownModalOpen] = useState(false);
  const [editingGodown, setEditingGodown] = useState<{ id: string; name: string; location?: string; type?: 'godown' | 'branch' } | null>(null);
  const [godownToDelete, setGodownToDelete] = useState<{ id: string; name: string } | null>(null);
  // Godown that still has stock. Totals are captured when the dialog opens so
  // the numbers don't change while the stock is being moved out.
  const [godownToMove, setGodownToMove] = useState<{ id: string; name: string; qty: number; items: number } | null>(null);
  const [transferModal, setTransferModal] = useState<{ open: boolean; fromId?: string; toId?: string; itemId?: string }>({ open: false });
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: State.INFO, message: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<StockTransfer | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [stockSort, setStockSort] = useState<{ key: StockSortKey; direction: 'asc' | 'desc' }>({ key: 'quantity', direction: 'desc' });
  const [historySort, setHistorySort] = useState<{ key: HistorySortKey; direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeTab, locationFilter, typeFilter, searchQuery, stockSort, historySort, appliedFilters]);

  /* ---------- LOCATIONS ---------- */
  const locations = useMemo(
    () => [
      { id: SHOP_ID, name: SHOP_NAME, location: '', kind: 'shop' as const },
      ...godowns.map((g) => ({ id: g.id, name: g.name, location: g.location || '', kind: g.type === 'branch' ? ('branch' as const) : ('godown' as const) })),
    ],
    [godowns],
  );
  const hasSecondLocation = godowns.length > 0;
  const locationTotals = useMemo(() => {
    const map = new Map<string, { qty: number; items: number }>();
    stockRows.forEach((r) => {
      const t = map.get(r.godownId) ?? { qty: 0, items: 0 };
      map.set(r.godownId, { qty: t.qty + r.quantity, items: t.items + 1 });
    });
    return (id: string) => map.get(id) ?? { qty: 0, items: 0 };
  }, [stockRows]);
  const locationName = (id?: string) => locations.find((l) => l.id === id)?.name || '';

  /* ---------- CURRENT STOCK ---------- */
  const stockSummary = useMemo(() => {
    const byItem = new Map<string, { name: string; qty: number; unit?: string }>();
    stockRows.forEach((r) => {
      const cur = byItem.get(r.itemId) ?? { name: r.itemName, qty: 0, unit: r.unit };
      byItem.set(r.itemId, { ...cur, qty: cur.qty + r.quantity });
    });
    const top = [...byItem.values()].sort((a, b) => b.qty - a.qty)[0];
    return {
      totalQty: stockRows.reduce((s, r) => s + r.quantity, 0),
      itemsInStock: byItem.size,
      top,
      unitNotSet: [...byItem.values()].filter((i) => !i.unit?.trim()).length,
    };
  }, [stockRows]);

  const filteredStock = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = stockRows.filter(
      (r) => (!locationFilter || r.godownId === locationFilter) && (!q || r.itemName.toLowerCase().includes(q)),
    );
    const dir = stockSort.direction === 'asc' ? 1 : -1;
    list.sort((a, b) =>
      stockSort.key === 'quantity'
        ? (a.quantity - b.quantity) * dir
        : String(a[stockSort.key]).localeCompare(String(b[stockSort.key]), undefined, { numeric: true }) * dir,
    );
    return list;
  }, [stockRows, locationFilter, searchQuery, stockSort]);

  const filteredStockTotals = useMemo(
    () => ({
      qty: filteredStock.reduce((s, r) => s + r.quantity, 0),
      items: new Set(filteredStock.map((r) => r.itemId)).size,
      locations: new Set(filteredStock.map((r) => r.godownId)).size,
      max: Math.max(1, ...filteredStock.map((r) => r.quantity)),
    }),
    [filteredStock],
  );

  /* ---------- HISTORY ---------- */
  // Date range + search: drives the history cards and type counts.
  const rangeHistory = useMemo(() => {
    if (!appliedFilters) return [];
    const q = searchQuery.trim().toLowerCase();
    return transfers.filter(
      (t) =>
        t.date >= appliedFilters.start &&
        t.date <= appliedFilters.end &&
        (!q ||
          t.itemName.toLowerCase().includes(q) ||
          t.toGodownName.toLowerCase().includes(q) ||
          (t.fromGodownName || '').toLowerCase().includes(q) ||
          (t.refInvoice || '').toLowerCase().includes(q)),
    );
  }, [transfers, appliedFilters, searchQuery]);

  const historySummary = useMemo(() => {
    const ofType = (type: StockTransfer['type']) => rangeHistory.filter((t) => t.type === type);
    const purchases = ofType('purchase-in');
    const moves = ofType('transfer');
    const adjustments = ofType('adjustment');
    const sum = (list: StockTransfer[]) => list.reduce((s, t) => s + t.quantity, 0);
    return {
      totalQty: sum(rangeHistory),
      count: rangeHistory.length,
      purchaseQty: sum(purchases),
      purchaseCount: purchases.length,
      purchaseBills: new Set(purchases.map((t) => t.refInvoice).filter(Boolean)).size,
      transferQty: sum(moves),
      transferCount: moves.length,
      adjustmentQty: sum(adjustments),
      adjustmentCount: adjustments.length,
    };
  }, [rangeHistory]);

  const filteredHistory = useMemo(() => {
    const list = rangeHistory.filter((t) => typeFilter === 'all' || t.type === typeFilter);
    const dir = historySort.direction === 'asc' ? 1 : -1;
    list.sort((a, b) =>
      historySort.key === 'itemName' ? a.itemName.localeCompare(b.itemName) * dir : (a[historySort.key] - b[historySort.key]) * dir,
    );
    return list;
  }, [rangeHistory, typeFilter, historySort]);

  const filteredHistoryQty = filteredHistory.reduce((s, t) => s + t.quantity, 0);

  /* ---------- ACTIONS ---------- */
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
    const s = parseInputDate(startValue); s.setHours(0, 0, 0, 0);
    const e = parseInputDate(endValue); e.setHours(23, 59, 59, 999);
    setDatePreset('custom');
    setStartDate(startValue);
    setEndDate(endValue);
    setAppliedFilters({ start: s.getTime(), end: e.getTime() });
    setIsRangeOpen(false);
  };

  const closeGodownModal = () => {
    setIsGodownModalOpen(false);
    setEditingGodown(null);
  };

  const openEditGodown = (id: string) => {
    const g = godowns.find((x) => x.id === id);
    if (!g) return;
    setEditingGodown({ id: g.id, name: g.name, location: g.location, type: g.type });
    setIsGodownModalOpen(true);
  };

  const handleSaveGodown = async (data: { name: string; location?: string; type: 'godown' | 'branch' }) => {
    const name = data.name.trim();
    const clash = locations.some((l) => l.id !== editingGodown?.id && l.name.trim().toLowerCase() === name.toLowerCase());
    if (clash) throw new Error('A location with this name already exists.');
    if (editingGodown) {
      await updateGodown(companyId!, editingGodown.id, { name, location: data.location?.trim() || '', type: data.type });
      return editingGodown.id;
    }
    return addGodown(companyId!, { ...data, name });
  };

  const requestDeleteGodown = (id: string) => {
    const g = godowns.find((x) => x.id === id);
    if (!g) return;
    const t = locationTotals(id);
    if (t.qty > 0) {
      setGodownToMove({ id: g.id, name: g.name, qty: t.qty, items: t.items });
      return;
    }
    setGodownToDelete({ id: g.id, name: g.name });
  };

  const confirmDeleteGodown = async () => {
    if (!companyId || !godownToDelete) return;
    const { id } = godownToDelete;
    setGodownToDelete(null);
    try {
      await deleteGodown(companyId, id);
      if (locationFilter === id) setLocationFilter('');
    } catch (err) {
      console.error('Failed to delete godown:', err);
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to delete godown.' });
    }
  };

  // Moves every item out of the godown (in chunks, since a Firestore transaction
  // has a write limit), then deletes it. Throws on failure so the dialog can show
  // the error; the godown is only deleted if every transfer succeeded.
  const moveAllAndDeleteGodown = async (toId: string, toName: string) => {
    if (!companyId || !godownToMove) return;
    const from = godownToMove;
    const rows = stockRows.filter((r) => r.godownId === from.id && r.quantity > 0);
    const CHUNK = 200; // 2 writes per item, Firestore allows 500 per transaction

    for (let i = 0; i < rows.length; i += CHUNK) {
      await transferStock(companyId, {
        items: rows.slice(i, i + CHUNK).map((r) => ({
          itemId: r.itemId,
          itemName: r.itemName,
          unit: r.unit,
          quantity: r.quantity,
        })),
        fromGodownId: from.id,
        fromGodownName: from.name,
        toGodownId: toId,
        toGodownName: toName,
        date: Date.now(),
        remarks: `Moved before deleting ${from.name}`,
      });
    }

    await deleteGodown(companyId, from.id);
    if (locationFilter === from.id) setLocationFilter('');
    setGodownToMove(null);
  };

  const openTransfer = (opts: { fromId?: string; toId?: string; itemId?: string } = {}) => {
    if (!hasSecondLocation) return;
    setTransferModal({ open: true, ...opts });
  };

  const confirmDelete = async () => {
    if (!companyId || !deleteConfirm) return;
    const id = deleteConfirm.id;
    setDeleteConfirm(null);
    try {
      await deleteTransferRecord(companyId, id);
    } catch (err) {
      console.error('Failed to delete transfer record:', err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: err instanceof Error ? err.message : 'Failed to delete transfer record.',
      });
    }
  };

  /* ---------- DOWNLOADS ---------- */
  const isStock = activeTab === 'stock';
  const fromLabel = (t: StockTransfer) =>
    t.type === 'purchase-in' ? `Purchase${t.refInvoice ? ` ${t.refInvoice}` : ''}` : t.fromGodownName || '—';

  const downloadAsPdf = async () => {
    try {
      const pdf = new jsPDF();
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const M = 14;
      const PAD = 3;
      const brandRight = pw - M;
      const contentW = pw - M * 2;
      const company = companyName || 'Your Business';
      const reportTitle = isStock ? 'Godown Stock Report' : 'Stock Transfer History';

      // Theme colours: blue = POS, orange = Catalogue
      const P: { from: RGB; to: RGB; light: RGB; accent: RGB; soft: RGB; tile: RGB; tileDark: RGB } =
        theme === 'orange'
          ? { from: [154, 52, 18], to: [234, 88, 12], light: [255, 226, 205], accent: [194, 65, 12], soft: [255, 237, 213], tile: [234, 88, 12], tileDark: [194, 65, 12] }
          : { from: [11, 31, 120], to: [37, 99, 235], light: [190, 205, 255], accent: [29, 78, 216], soft: [238, 243, 255], tile: [37, 99, 235], tileDark: [52, 78, 168] };

      const generatedAtText = `Generated ${new Date().toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
      })}`;
      const periodText = appliedFilters ? `${fmtDay(appliedFilters.start)} – ${fmtDay(appliedFilters.end)}` : '';
      const periodDays = appliedFilters
        ? Math.max(1, Math.round((appliedFilters.end - appliedFilters.start) / 86400000))
        : 0;
      const subtitle = isStock
        ? (locationFilter ? locationName(locationFilter) : 'All locations')
        : 'Every purchase and transfer';

      // ---------- ASSETS ----------
      const base64Logo = await resolveCompanyLogoBase64(companyId).catch(() => null);
      const sellarImg = await toDataUrl(sellarLogo);

      const drawCompanyTile = (x: number, y: number, size: number, onDark: boolean) => {
        let drawn = false;
        if (base64Logo) {
          try {
            const props = pdf.getImageProperties(base64Logo);
            const maxSide = size - size * 0.22;
            const scale = Math.min(maxSide / props.width, maxSide / props.height);
            const w = props.width * scale;
            const h = props.height * scale;
            pdf.setFillColor(255, 255, 255);
            if (onDark) {
              pdf.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'F');
            } else {
              pdf.setDrawColor(229, 231, 235);
              pdf.setLineWidth(0.3);
              pdf.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'FD');
            }
            pdf.addImage(base64Logo, props.fileType, x + (size - w) / 2, y + (size - h) / 2, w, h);
            drawn = true;
          } catch {
            // invalid logo -> initial fallback
          }
        }
        if (!drawn) {
          const c = onDark ? P.tileDark : P.tile;
          pdf.setFillColor(c[0], c[1], c[2]);
          pdf.roundedRect(x, y, size, size, PDF_RADIUS, PDF_RADIUS, 'F');
          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(size * 0.9);
          pdf.text((companyName.trim().charAt(0) || 'S').toUpperCase(), x + size / 2, y + size / 2, { align: 'center', baseline: 'middle' });
        }
      };

      // ---------- 1. HEADER (gradient) ----------
      drawGradientRect(pdf, 0, 0, pw, 64, P.from, P.to);
      drawCompanyTile(M, 11, 14, true);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(P.light[0], P.light[1], P.light[2]);
      pdf.text('Prepared for', 32, 15);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(255, 255, 255);
      pdf.text(company, 32, 22);

      // SELLAR logo + text (top-right, white pill)
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      const brandTextW = pdf.getTextWidth('SELLAR') + 5 * 0.3;
      const sellarLh = 5;
      let sellarLw = 0;
      if (sellarImg) {
        try {
          const lp = pdf.getImageProperties(sellarImg);
          sellarLw = (lp.width / lp.height) * sellarLh;
        } catch {
          // continue without SELLAR logo
        }
      }
      const pillPadX = 3;
      const pillW = brandTextW + (sellarLw ? sellarLw + 2 : 0) + pillPadX * 2;
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(brandRight - pillW, 7.5, pillW, 8, PDF_RADIUS, PDF_RADIUS, 'F');
      if (sellarImg && sellarLw) {
        pdf.addImage(sellarImg, 'PNG', brandRight - pillPadX - brandTextW - sellarLw - 2, 9, sellarLw, sellarLh);
      }
      pdf.setTextColor(0, 0, 0);
      pdf.text('SELLAR', brandRight - pillPadX, 12.6, { align: 'right', charSpace: 0.3 });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(P.light[0], P.light[1], P.light[2]);
      pdf.text(generatedAtText, brandRight, 21, { align: 'right' });

      // Title block (left): icon tile + title + subtitle
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(M, 31, 14, 14, PDF_RADIUS, PDF_RADIUS, 'F');
      const ix = M + 3.5;
      const iy = 31 + 3.5;
      const k = 7 / 24;
      const seg = (pts: [number, number][]) => {
        for (let i = 0; i < pts.length - 1; i++) {
          pdf.line(ix + pts[i][0] * k, iy + pts[i][1] * k, ix + pts[i + 1][0] * k, iy + pts[i + 1][1] * k);
        }
      };
      pdf.setDrawColor(P.tile[0], P.tile[1], P.tile[2]);
      pdf.setLineWidth(0.5);
      pdf.setLineCap('round');
      pdf.setLineJoin('round');
      seg([[15, 2], [6, 2], [4, 4], [4, 20], [6, 22], [18, 22], [20, 20], [20, 7], [15, 2]]);
      seg([[14, 2], [14, 6], [16, 8], [20, 8]]);
      seg([[10, 9], [8, 9]]);
      seg([[16, 13], [8, 13]]);
      seg([[16, 17], [8, 17]]);
      pdf.setLineCap('butt');
      pdf.setLineJoin('miter');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(22);
      pdf.setTextColor(255, 255, 255);
      pdf.text(reportTitle, 32, 38);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(P.light[0], P.light[1], P.light[2]);
      pdf.text(pdf.splitTextToSize(subtitle, 90)[0] as string, 32, 44.5);

      // Right side: period (history) / "stock as on" date (stock)
      pdf.setFontSize(9);
      pdf.text(isStock ? 'Stock as on' : 'Report period', brandRight, 34, { align: 'right' });
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(255, 255, 255);
      pdf.text(isStock ? fmtDay(Date.now()) : periodText, brandRight, 40.5, { align: 'right' });
      if (!isStock) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9);
        pdf.setTextColor(P.light[0], P.light[1], P.light[2]);
        pdf.text(`${periodDays} days`, brandRight, 45.5, { align: 'right' });
      }
      // ---------- 2. SUMMARY CARDS ----------
      const cardY = 50;
      const cardH = 32;
      const kpiPad = 6;
      const sumType = (type: StockTransfer['type']) =>
        filteredHistory.filter((t) => t.type === type).reduce((s, t) => s + t.quantity, 0);
      const cardsData = isStock
        ? [
          { label: 'Total stock', value: `${qty(filteredStockTotals.qty)} pcs`, hint: 'in this view' },
          { label: 'Items in stock', value: qty(filteredStockTotals.items), hint: 'different items' },
          { label: 'Locations', value: qty(filteredStockTotals.locations), hint: locationFilter ? 'selected location' : 'all locations' },
          { label: 'Stock entries', value: qty(filteredStock.length), hint: 'item x location' },
        ]
        : [
          { label: 'Quantity moved', value: `${qty(filteredHistoryQty)} pcs`, hint: plural(filteredHistory.length, 'entry', 'entries') },
          { label: 'From purchases', value: qty(sumType('purchase-in')), hint: 'stock in' },
          { label: 'Between godowns', value: qty(sumType('transfer')), hint: 'transfers' },
          { label: 'Adjustments', value: qty(sumType('adjustment')), hint: 'corrections' },
        ];
      const cardW = contentW / cardsData.length;

      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(M, cardY, contentW, cardH, PDF_RADIUS, PDF_RADIUS, 'F');
      pdf.setFillColor(P.soft[0], P.soft[1], P.soft[2]);
      pdf.roundedRect(M, cardY, cardW, cardH, PDF_RADIUS, PDF_RADIUS, 'F');
      pdf.rect(M + cardW - 2, cardY, 2, cardH, 'F');
      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.3);
      pdf.roundedRect(M, cardY, contentW, cardH, PDF_RADIUS, PDF_RADIUS, 'S');
      for (let i = 1; i < cardsData.length; i++) {
        pdf.line(M + cardW * i, cardY, M + cardW * i, cardY + cardH);
      }

      cardsData.forEach((c, i) => {
        const cx = M + cardW * i + kpiPad;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(9.5);
        pdf.setTextColor(100, 110, 135);
        pdf.text(c.label, cx, cardY + 9);

        // value card me fit ho, isliye font chhota karo agar zaroorat ho
        pdf.setFont('helvetica', 'bold');
        let vSize = 15;
        pdf.setFontSize(vSize);
        const maxW = cardW - kpiPad * 2;
        const vw = pdf.getTextWidth(c.value);
        if (vw > maxW) {
          vSize = (vSize * maxW) / vw;
          pdf.setFontSize(vSize);
        }
        if (i === 0) pdf.setTextColor(P.accent[0], P.accent[1], P.accent[2]);
        else pdf.setTextColor(17, 24, 39);
        pdf.text(c.value, cx, cardY + 20);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(120, 128, 150);
        pdf.text(c.hint, cx, cardY + 27);
      });
      // ---------- 3. TABLE ----------
      const tableTitleY = cardY + cardH + 14;
      const rowCount = isStock ? filteredStock.length : filteredHistory.length;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(17, 24, 39);
      pdf.text(isStock ? 'Stock by godown' : 'Transfer entries', M, tableTitleY);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10.5);
      pdf.setTextColor(107, 114, 128);
      pdf.text(plural(rowCount, 'entry', 'entries'), brandRight, tableTitleY, { align: 'right' });

      // Column widths (total = contentW = 182mm) aur quantity column ka index
      const COLW = isStock ? [58, 34, 26, 24, 40] : [26, 36, 28, 26, 18, 20, 28];
      const qtyCol = isStock ? 2 : 4;

      autoTable(pdf, {
        startY: tableTitleY + 4,
        margin: { top: 26, bottom: 22, left: M, right: M },
        head: [isStock
          ? ['ITEM', 'GODOWN', 'QUANTITY', 'UNIT', 'LOCATION']
          : ['DATE', 'ITEM', 'FROM', 'TO', 'QTY', 'TYPE', 'REMARKS']],
        body: isStock
          ? filteredStock.map((r) => [r.itemName, r.godownName, qty(r.quantity), r.unit || 'Not set', locations.find((l) => l.id === r.godownId)?.location || '-'])
          : filteredHistory.map((t) => [
            formatFullDate(t.date), t.itemName, fromLabel(t), t.toGodownName,
            `${t.type === 'purchase-in' ? '+' : ''}${qty(t.quantity)}`, TYPE_LABEL[t.type], t.remarks || '-',
          ]),
        foot: [isStock
          ? [`Total · ${plural(filteredStockTotals.items, 'item')}`, plural(filteredStockTotals.locations, 'location'), qty(filteredStockTotals.qty), '', '']
          : [
            { content: `Total · ${plural(filteredHistory.length, 'entry', 'entries')}`, colSpan: 4 },
            qty(filteredHistoryQty),
            { content: '', colSpan: 2 },
          ]],
        showFoot: 'lastPage',
        theme: 'plain',
        styles: {
          font: 'helvetica',
          fontSize: 9,
          cellPadding: { top: 3.4, bottom: 3.4, left: PAD, right: PAD },
          textColor: [17, 24, 39],
          lineWidth: 0,
        },
        headStyles: { fillColor: [248, 250, 252], textColor: [100, 110, 135], fontStyle: 'bold', fontSize: 9 },
        footStyles: { fillColor: [248, 250, 252], textColor: [17, 24, 39], fontStyle: 'bold', fontSize: 10 },
        columnStyles: Object.fromEntries(
          COLW.map((w, i) => [i, i === qtyCol ? { cellWidth: w, halign: 'right' } : { cellWidth: w }]),
        ),
        didParseCell: (data) => {
          data.cell.styles.valign = 'middle';
          // Header aur Total row me quantity bhi right-aligned (body ke saath match)
          if (data.section !== 'body' && data.column.index === qtyCol) {
            data.cell.styles.halign = 'right';
          }
        },
        didDrawCell: (data) => {
          const { x, y, width, height } = data.cell;
          // Vertical column lines (grid)
          pdf.setDrawColor(226, 232, 240);
          pdf.setLineWidth(0.2);
          pdf.line(x + width, y, x + width, y + height);
          if (data.column.index === 0) pdf.line(x, y, x, y + height);

          // Horizontal lines
          if (data.section === 'head') {
            pdf.setDrawColor(P.tile[0], P.tile[1], P.tile[2]);
            pdf.setLineWidth(0.5);
            pdf.line(x, y + height, x + width, y + height);
          }
          if (data.section === 'body') {
            pdf.setDrawColor(226, 232, 240);
            pdf.setLineWidth(0.2);
            pdf.line(x, y + height, x + width, y + height);
          }
          if (data.section === 'foot') {
            pdf.setDrawColor(17, 24, 39);
            pdf.setLineWidth(0.5);
            pdf.line(x, y, x + width, y);
            pdf.line(x, y + height, x + width, y + height);
          }
        },
      });
      // ---------- 4. PAGE 2+ MINI HEADER + FOOTER (har page par) ----------
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);

        if (i > 1) {
          drawCompanyTile(M, 9, 9, false);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.setTextColor(17, 24, 39);
          pdf.text(company, M + 12, 15.4);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(107, 114, 128);
          pdf.text(reportTitle, brandRight, 15.4, { align: 'right' });
        }

        // FOOTER: SELLAR logo + SELLAR text + generated time + page number
        const fy = ph - 12;
        let fx = M;
        if (sellarImg) {
          try {
            const lp = pdf.getImageProperties(sellarImg);
            const lh = 5;
            const lw = (lp.width / lp.height) * lh;
            pdf.addImage(sellarImg, 'PNG', fx, fy - 3.8, lw, lh);
            fx += lw + 2;
          } catch {
            // continue without footer logo
          }
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(0, 0, 0);
        pdf.text('SELLAR', fx, fy, { charSpace: 0.3 });
        fx += pdf.getTextWidth('SELLAR') + 5 * 0.3 + 4;

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(107, 114, 128);
        pdf.text(generatedAtText, fx, fy);
        pdf.text(`${company} | ${reportTitle} | Page ${i} of ${totalPages}`, brandRight, fy, { align: 'right' });
      }

      pdf.save(
        isStock
          ? `Godown_Stock_Report_${formatDateForInput(new Date())}.pdf`
          : `Stock_Transfer_History_${startDate}_to_${endDate}.pdf`,
      );
    } catch (err) {
      console.error(err);
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate PDF.' });
    }
  };

  const downloadAsExcel = () => {
    try {
      const head = theme === 'orange' ? 'C2410C' : '1447E6';
      const title = theme === 'orange' ? 'EA580C' : '155DFC';
      const border = { style: 'thin', color: { rgb: 'DFE6FB' } };
      const cellStyle = (opts: { bold?: boolean; color?: string; fill?: string; align?: string; size?: number }) => ({
        font: { name: 'Arial', sz: opts.size ?? 9, bold: !!opts.bold, color: { rgb: opts.color ?? '0F172B' } },
        fill: { patternType: 'solid', fgColor: { rgb: opts.fill ?? 'FFFFFF' } },
        alignment: { horizontal: opts.align ?? 'left', vertical: 'center', wrapText: true },
        border: { top: border, bottom: border, left: border, right: border },
      });

      const baseTitle = isStock ? 'Godown Stock Report' : 'Stock Transfer History';
      const headers = isStock
        ? ['#', 'Item', 'Godown', 'Quantity', 'Unit', 'Location']
        : ['#', 'Date', 'Item', 'From', 'To', 'Qty', 'Type', 'Remarks'];
      const widths = isStock ? [6, 30, 20, 12, 10, 22] : [6, 14, 28, 20, 18, 10, 12, 26];
      const qtyCol = isStock ? 3 : 5;
      const body: (string | number)[][] = isStock
        ? filteredStock.map((r, i) => [i + 1, r.itemName, r.godownName, r.quantity, r.unit || 'Not set', locations.find((l) => l.id === r.godownId)?.location || ''])
        : filteredHistory.map((t, i) => [i + 1, formatFullDate(t.date), t.itemName, fromLabel(t), t.toGodownName, t.quantity, TYPE_LABEL[t.type], t.remarks || '']);
      const foot: (string | number)[] = headers.map(() => '');
      foot[0] = 'TOTAL';
      foot[1] = isStock ? plural(filteredStockTotals.items, 'item') : plural(filteredHistory.length, 'entry', 'entries');
      foot[qtyCol] = isStock ? filteredStockTotals.qty : filteredHistoryQty;

      const aoa: (string | number)[][] = [
        [companyName ? `${baseTitle} — ${companyName}` : baseTitle],
        [isStock
          ? `Generated: ${formatFullDate(Date.now())}   |   ${locationFilter ? locationName(locationFilter) : 'All locations'}   |   Total: ${qty(filteredStockTotals.qty)} pcs`
          : `Generated: ${formatFullDate(Date.now())}   |   Period: ${appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : ''}   |   Moved: ${qty(filteredHistoryQty)} pcs`],
        [],
        headers,
        ...body,
        foot,
      ];

      const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = widths.map((wch) => ({ wch }));
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: headers.length - 1 } },
      ];
      const put = (r: number, c: number, st: ReturnType<typeof cellStyle>) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].s = st;
      };
      put(0, 0, cellStyle({ bold: true, size: 16, color: 'FFFFFF', fill: title, align: 'center' }));
      put(1, 0, cellStyle({ color: '45556C', fill: theme === 'orange' ? 'FFEDD5' : 'E6EEFF', align: 'center' }));
      headers.forEach((_, c) => put(3, c, cellStyle({ bold: true, size: 10, color: 'FFFFFF', fill: head })));
      body.forEach((_, i) => headers.forEach((__, c) => put(4 + i, c, cellStyle({ align: c === qtyCol ? 'right' : 'left' }))));
      headers.forEach((_, c) => put(4 + body.length, c, cellStyle({ bold: true, size: 10, fill: 'F5F7FF', align: c === qtyCol ? 'right' : 'left' })));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, isStock ? 'Godown Stock' : 'Transfer History');
      XLSX.writeFile(wb, isStock ? `Godown_Stock_Report_${formatDateForInput(new Date())}.xlsx` : `Stock_Transfer_History_${startDate}_to_${endDate}.xlsx`);
      setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'Excel downloaded successfully!' });
    } catch {
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate Excel.' });
    }
  };

  const runDownload = (action: () => void) => {
    if ((isStock ? filteredStock.length : filteredHistory.length) === 0) {
      setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No data available to download.' });
      return;
    }
    action();
  };

  /* ---------- RENDER HELPERS ---------- */
  const sortHeader = <K extends string>(
    label: string,
    key: K,
    current: { key: K; direction: 'asc' | 'desc' },
    onSort: (key: K) => void,
    align: 'left' | 'right' = 'left',
  ) => {
    const isActive = current.key === key;
    const Icon = !isActive ? ArrowUpDown : current.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => onSort(key)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide ${T.headHover} ${align === 'right' ? 'flex-row-reverse' : ''} ${isActive ? T.ink : ''}`}
        >
          {label}
          <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
        </button>
      </th>
    );
  };
  const toggleSort = <K extends string>(setter: React.Dispatch<React.SetStateAction<{ key: K; direction: 'asc' | 'desc' }>>, textKeys: K[]) =>
    (key: K) => setter((prev) => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : textKeys.includes(key) ? 'asc' : 'desc',
    }));
  const onStockSort = toggleSort<StockSortKey>(setStockSort, ['itemName', 'godownName']);
  const onHistorySort = toggleSort<HistorySortKey>(setHistorySort, ['itemName']);

  const LocIcon = ({ id, size = 14 }: { id: string; size?: number }) => {
    const kind = locations.find((l) => l.id === id)?.kind;
    const Icon = kind === 'shop' || kind === 'branch' ? Store : Warehouse;
    return <Icon size={size} className={`shrink-0 ${T.text}`} />;
  };

  const typeBadge = (t: StockTransfer) => {
    const cls = t.type === 'purchase-in' ? 'bg-green-50 text-green-700' : t.type === 'transfer' ? T.softPill : 'bg-slate-100 text-slate-600';
    return <span className={`inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{TYPE_LABEL[t.type]}</span>;
  };

  if (godownsLoading || stockLoading) return <Spinner />;

  const rangeLabel = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : '';
  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${active
      ? 'border-slate-900 bg-slate-900 text-white'
      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
    }`;
  const segClass = (active: boolean) =>
    `whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'}`;

  const stockCards = [
    { label: 'Total stock', value: `${qty(stockSummary.totalQty)} pcs`, hint: 'across all locations', icon: Boxes, iconClass: 'bg-green-50 text-green-600', valueClass: T.text },
    { label: 'Locations', value: qty(locations.length), hint: locations.map((l) => l.name).join(', '), icon: MapPin, iconClass: 'bg-blue-50 text-blue-600', valueClass: 'text-slate-900' },
    { label: 'Items in stock', value: qty(stockSummary.itemsInStock), hint: stockSummary.top ? `top: ${stockSummary.top.name} · ${qty(stockSummary.top.qty)}` : 'nothing in stock', icon: Tag, iconClass: 'bg-amber-50 text-amber-600', valueClass: 'text-slate-900' },
    { label: 'Unit not set', value: qty(stockSummary.unitNotSet), hint: stockSummary.unitNotSet ? 'items show "—" as unit' : 'every item has a unit', icon: Ruler, iconClass: 'bg-amber-50 text-amber-600', valueClass: stockSummary.unitNotSet ? 'text-amber-700' : 'text-slate-900' },
  ];
  const historyCards = [
    { label: 'Quantity moved', value: `${qty(historySummary.totalQty)} pcs`, hint: `in ${plural(historySummary.count, 'entry', 'entries')}`, icon: Package, iconClass: 'bg-blue-50 text-blue-600', valueClass: T.text },
    { label: 'Stock in from purchases', shortLabel: 'From purchases', value: qty(historySummary.purchaseQty), hint: historySummary.purchaseBills ? plural(historySummary.purchaseBills, 'purchase bill') : 'no purchases', icon: FileText, iconClass: 'bg-green-50 text-green-600', valueClass: 'text-slate-900' },
    { label: 'Between godowns', value: qty(historySummary.transferQty), hint: historySummary.transferCount ? plural(historySummary.transferCount, 'transfer') : 'no transfers yet', icon: ArrowLeftRight, iconClass: 'bg-blue-50 text-blue-600', valueClass: 'text-slate-900' },
    { label: 'Adjustments', value: qty(historySummary.adjustmentQty), hint: historySummary.adjustmentCount ? plural(historySummary.adjustmentCount, 'entry', 'entries') : 'none', icon: SlidersHorizontal, iconClass: 'bg-slate-100 text-slate-600', valueClass: 'text-slate-900' },
  ];
  const statCards = isStock ? stockCards : historyCards;

  const typeSegments: { value: TypeFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: historySummary.count },
    { value: 'purchase-in', label: 'Purchases', count: historySummary.purchaseCount },
    { value: 'transfer', label: 'Transfers', count: historySummary.transferCount },
    ...(historySummary.adjustmentCount ? [{ value: 'adjustment' as const, label: 'Adjustments', count: historySummary.adjustmentCount }] : []),
  ];

  const visibleStock = filteredStock.slice(0, visibleCount);
  const visibleHistory = filteredHistory.slice(0, visibleCount);
  const hiddenCount = (isStock ? filteredStock.length : filteredHistory.length) - (isStock ? visibleStock.length : visibleHistory.length);
  const historyBusy = !isStock && historyFetching;

  return (
    <div className={`${cat ? 'min-h-full' : 'min-h-screen'} ${T.canvas} px-3 pb-28 pt-3 md:px-6 md:pb-8 md:pt-5`}>
      {feedbackModal.isOpen && (
        <Modal type={feedbackModal.type} message={feedbackModal.message} theme={theme}
          onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))} showConfirmButton={false} />
      )}
      <GodownModal
        isOpen={isGodownModalOpen}
        onClose={closeGodownModal}
        onSave={handleSaveGodown}
        theme={theme}
        editing={editingGodown}
        existingLocations={locations.map((l) => l.name)}
        onSaveAndTransfer={(godownId) => setTransferModal({ open: true, fromId: SHOP_ID, toId: godownId })}
      />
      <TransferStockModal
        isOpen={transferModal.open}
        onClose={() => setTransferModal({ open: false })}
        items={items.map((i) => ({ id: i.id, name: i.name, unit: i.unit, barcode: (i as { barcode?: string }).barcode }))}
        godowns={godowns}
        stockRows={stockRows}
        onSave={(data) => transferStock(companyId!, data)}
        theme={theme}
        initialFromId={transferModal.fromId}
        initialToId={transferModal.toId}
        initialItemId={transferModal.itemId}
      />
      <DeleteGodownModal
        isOpen={!!godownToMove}
        onClose={() => setGodownToMove(null)}
        godownName={godownToMove?.name || ''}
        totalQty={godownToMove?.qty || 0}
        itemCount={godownToMove?.items || 0}
        destinations={locations.filter((l) => l.id !== godownToMove?.id).map((l) => ({ id: l.id, name: l.name }))}
        onMoveAndDelete={moveAllAndDeleteGodown}
        theme={theme}
      />
      {godownToDelete && (
        <Modal
          type={State.WARNING}
          theme={theme}
          message={`Delete godown "${godownToDelete.name}"? This cannot be undone.`}
          onClose={() => setGodownToDelete(null)}
          showConfirmButton={true}
          onConfirm={confirmDeleteGodown}
        />
      )}
      {deleteConfirm && (
        <Modal
          type={State.WARNING}
          theme={theme}
          message={`Delete this transfer of ${qty(deleteConfirm.quantity)} × ${deleteConfirm.itemName}? The stock goes back to ${deleteConfirm.fromGodownName || 'where it came from'}.`}
          onClose={() => setDeleteConfirm(null)}
          showConfirmButton={true}
          onConfirm={confirmDelete}
        />
      )}

      {/* HEADER */}
      <header className="mb-4">
        <div className="flex items-center gap-2 md:gap-3">
          <div className="flex-shrink-0">
            <BackButton />
          </div>
          <div className="min-w-0 flex-1">
            <p className="hidden text-xs text-slate-500 md:block">Reports /</p>
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Stock transfer</h1>
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-500 md:hidden">
              <span className="truncate">
                {isStock ? `${plural(locations.length, 'location')} · ${qty(stockSummary.totalQty)} pcs` : rangeLabel}
              </span>
            </div>
          </div>

          {/* Desktop actions */}
          <div className="relative hidden w-64 md:block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search item"
              className={`w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:ring-2 ${T.focusBorder} ${T.focusRing}`}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setIsGodownModalOpen(true)}
            className="hidden shrink-0 items-center gap-1.5 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 md:inline-flex"
          >
            <Warehouse size={15} />
            Add godown
          </button>
          <button
            onClick={() => openTransfer()}
            disabled={!hasSecondLocation}
            title={hasSecondLocation ? undefined : 'Add a godown first'}
            className={`hidden shrink-0 items-center gap-1.5 rounded-sm px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 md:inline-flex ${accentBtn}`}
          >
            <ArrowLeftRight size={15} />
            Transfer stock
          </button>

          {/* Mobile actions */}
          <div className="flex items-center md:hidden">
            <button onClick={() => setShowSearch((s) => !s)} aria-label="Search" className="rounded-sm p-2 text-slate-700 transition hover:bg-slate-200">
              <Search size={20} />
            </button>
            <DownloadMenu variant="icon" onExcel={() => runDownload(downloadAsExcel)} onPdf={() => runDownload(downloadAsPdf)} theme={cat ? 'catalogue' : 'pos'} />
          </div>
        </div>

        {/* Desktop tabs */}
        <div className={`mt-3 hidden items-center gap-6 border-b ${T.line} md:flex`} role="tablist">
          {([
            { value: 'stock' as const, label: 'Current stock', count: `${qty(stockSummary.totalQty)} pcs` },
            { value: 'history' as const, label: 'Transfer history', count: historyLoading ? '…' : qty(historySummary.count) },
          ]).map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={activeTab === t.value}
              onClick={() => setActiveTab(t.value)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-1 pb-2.5 text-sm font-medium transition ${activeTab === t.value ? accentTab : 'border-transparent text-slate-600 hover:text-slate-900'}`}
            >
              {t.label}
              <span className={`rounded-sm ${T.sunken} px-1.5 py-0.5 text-[11px] font-semibold text-slate-600`}>{t.count}</span>
            </button>
          ))}
          {!isStock && (
            <button
              onClick={refresh}
              disabled={historyFetching}
              className="mb-2.5 ml-auto inline-flex items-center gap-1 rounded-sm text-xs text-slate-500 transition hover:text-slate-800 disabled:cursor-default"
            >
              <RefreshCw size={11} className={historyFetching ? 'animate-spin' : ''} />
              {historyFetching ? 'Updating…' : updatedLabel}
            </button>
          )}
        </div>
      </header>

      {showSearch && (
        <div className="relative mb-3 md:hidden">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search item"
            autoFocus
            className={`w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:ring-2 ${T.focusBorder} ${T.focusRing}`}
          />
          <button onClick={() => { setSearchQuery(''); setShowSearch(false); }} aria-label="Close search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-slate-400 hover:text-slate-600">
            <X size={15} />
          </button>
        </div>
      )}

      {/* MOBILE: Current / History switch */}
      <div className={`mb-3 grid grid-cols-2 gap-1 rounded-sm ${T.sunken} p-1 md:hidden`}>
        <button onClick={() => setActiveTab('stock')} className={segClass(isStock)}>Current stock</button>
        <button onClick={() => setActiveTab('history')} className={segClass(!isStock)}>History</button>
      </div>

      {isStock ? (
        <>
          {/* LOCATION CARDS (desktop) */}
          <div className="mb-4 hidden grid-cols-3 gap-4 md:grid">
            {locations.map((l) => {
              const t = locationTotals(l.id);
              const selected = locationFilter === l.id;
              return (
                <div key={l.id} className="group relative">
                  <button
                    onClick={() => setLocationFilter(selected ? '' : l.id)}
                    className={`flex w-full items-center gap-3 rounded-sm border bg-white p-4 text-left shadow-card transition ${selected ? T.selected : `${T.line} hover:border-slate-300`}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-blue-50">
                      <LocIcon id={l.id} size={18} />
                    </span>
                    <span className={`min-w-0 ${l.kind !== 'shop' ? 'pr-24' : ''}`}>
                      <span className="block truncate text-sm font-semibold text-slate-900">{l.name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {qty(t.qty)} pcs · {plural(t.items, 'item')} · {l.kind === 'shop' ? 'default location' : l.location || (l.kind === 'branch' ? 'shop / branch' : 'godown')}
                      </span>
                    </span>
                  </button>
                  {l.kind !== 'shop' && (
  <div className="absolute right-3 top-1/2 flex -translate-y-1/2 gap-1">
                      <button
                        onClick={() => openEditGodown(l.id)}
                        aria-label={`Edit ${l.name}`}
                        title="Edit"
                        className="flex h-9 w-9 items-center justify-center rounded-sm border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800"
                      >
                        <Pencil size={17} />
                      </button>
                      <button
                        onClick={() => requestDeleteGodown(l.id)}
                        aria-label={`Delete ${l.name}`}
                        title="Delete"
                        className="flex h-9 w-9 items-center justify-center rounded-sm border border-slate-200 bg-white text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <button
              onClick={() => setIsGodownModalOpen(true)}
              className="flex items-center gap-3 rounded-sm border-2 border-dashed border-slate-300 p-4 text-left text-slate-600 transition hover:border-slate-400 hover:bg-white/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-white">
                <Plus size={18} />
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-800">Add a godown</span>
                <span className="block text-xs text-slate-500">Backroom, warehouse or a second shop</span>
              </span>
            </button>
          </div>

          {/* LOCATION CHIPS (mobile) */}
          <div className="mb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
            <button onClick={() => setLocationFilter('')} className={chipClass(!locationFilter)}>All locations</button>
            {locations.map((l) => (
              <button key={l.id} onClick={() => setLocationFilter(l.id)} className={chipClass(locationFilter === l.id)}>
                {l.name} {qty(locationTotals(l.id).qty)}
              </button>
            ))}
            <button onClick={() => setIsGodownModalOpen(true)} className={`${chipClass(false)} inline-flex items-center gap-1`}>
              <Plus size={14} /> Godown
            </button>
          </div>

          {/* MOBILE: edit / delete the selected godown */}
          {locationFilter && locationFilter !== SHOP_ID && (
            <div className={`mb-3 flex items-center justify-between gap-2 rounded-sm border ${T.line} bg-white px-3 py-2 md:hidden`}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${T.soft}`}>
                  <LocIcon id={locationFilter} size={16} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{locationName(locationFilter)}</p>
                  <p className="truncate text-xs text-slate-500">
                    {qty(locationTotals(locationFilter).qty)} pcs · {plural(locationTotals(locationFilter).items, 'item')}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => openEditGodown(locationFilter)}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700"
                >
                  <Pencil size={15} /> Edit
                </button>
                <button
                  onClick={() => requestDeleteGodown(locationFilter)}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-red-200 px-3.5 py-2 text-sm font-medium text-red-600"
                >
                  <Trash2 size={15} /> Delete
                </button>
              </div>
            </div>
          )}

          {/* ONE LOCATION NOTE */}
          {!hasSecondLocation && (
            <div className={`mb-4 flex items-center gap-3 rounded-sm ${T.note} px-3 py-2.5 text-sm`}>
              <Info size={16} className={`shrink-0 ${T.text}`} />
              <p className="flex-1">
                <span className="hidden md:inline">You have <strong>one location</strong>. Add a godown to move stock between places — until then Transfer and Move stay disabled.</span>
                <span className="md:hidden">Add a second location to start moving stock.</span>
              </p>
              <button
                onClick={() => setIsGodownModalOpen(true)}
                className={`hidden shrink-0 rounded-sm border bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 md:block ${T.noteBtn}`}
              >
                Add godown
              </button>
            </div>
          )}
        </>
      ) : (
        /* DATE FILTERS (history) */
        <div className="relative mb-4 flex items-center gap-3">
          <div className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {DATE_PRESETS.map((p) => (
              <button key={p.value} onClick={() => handleDatePresetChange(p.value)} className={chipClass(datePreset === p.value)}>
                <span className="md:hidden">{p.shortLabel}</span>
                <span className="hidden md:inline">{p.label}</span>
              </button>
            ))}
            <button onClick={() => setIsRangeOpen((o) => !o)} className={`md:hidden ${chipClass(datePreset === 'custom')}`}>Custom</button>
          </div>
          <button
            onClick={() => setIsRangeOpen((o) => !o)}
            className={`hidden shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 md:inline-flex ${datePreset === 'custom' ? 'border-slate-900' : 'border-slate-300'}`}
          >
            <CalendarDays size={15} className="text-slate-500" />
            {rangeLabel}
            <ChevronDown size={15} className="text-slate-500" />
          </button>
          {isRangeOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-full md:w-80">
              <CustomRangePanel initialStart={startDate} initialEnd={endDate} onApply={handleApplyCustomRange} onCancel={() => setIsRangeOpen(false)} />
            </div>
          )}
        </div>
      )}

      <div className={`transition-opacity ${historyBusy ? 'pointer-events-none opacity-50' : ''}`}>
        {/* SUMMARY — 2 cols on mobile, 4 cols on md+ */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
          {statCards.map(({ label, value, hint, icon: Icon, iconClass, valueClass, ...rest }) => {
            const shortLabel = (rest as { shortLabel?: string }).shortLabel;
            return (
              <div key={label} className={`min-w-0 rounded-sm border ${T.line} bg-white p-3 shadow-card md:p-4`}>
                <div className="flex items-center gap-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}>
                    <Icon size={14} />
                  </span>
                  <span className="truncate text-xs font-medium text-slate-700 md:text-sm">
                    {shortLabel ? (
                      <>
                        <span className="md:hidden">{shortLabel}</span>
                        <span className="hidden md:inline">{label}</span>
                      </>
                    ) : label}
                  </span>
                </div>
                <p className={`mt-2 truncate text-xl font-bold md:text-2xl ${valueClass}`}>{!isStock && historyLoading ? '…' : value}</p>
                <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
              </div>
            );
          })}
        </div>

        {/* MOBILE: type chips (history) */}
        {!isStock && (
          <div className="mb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
            {typeSegments.map((s) => (
              <button key={s.value} onClick={() => setTypeFilter(s.value)} className={chipClass(typeFilter === s.value)}>
                {s.label} {qty(s.count)}
              </button>
            ))}
          </div>
        )}

        {/* LIST CARD */}
        <section className={`rounded-sm border ${T.line} bg-white shadow-card`}>
          <div className={`flex flex-wrap items-center gap-3 border-b ${T.line} px-4 py-3`}>
            <h2 className="text-sm font-semibold text-slate-900">
              {isStock ? (
                <>
                  <span className="hidden md:inline">Stock by godown</span>
                  <span className="md:hidden">Stock · {plural(filteredStockTotals.items, 'item')}</span>
                </>
              ) : (
                <>
                  <span className="hidden md:inline">Transfer entries</span>
                  <span className="md:hidden">Entries</span>
                </>
              )}
            </h2>
            {!isStock && (
              <span className={`hidden rounded-sm px-2 py-0.5 text-xs font-medium md:inline ${T.softPill}`}>
                {plural(filteredHistory.length, 'entry', 'entries')}
              </span>
            )}

            {/* Desktop filter segments */}
            <div className={`hidden gap-1 overflow-x-auto rounded-sm ${T.sunken} p-1 md:flex`}>
              {isStock ? (
                <>
                  <button onClick={() => setLocationFilter('')} className={segClass(!locationFilter)}>All locations</button>
                  {locations.map((l) => (
                    <button key={l.id} onClick={() => setLocationFilter(l.id)} className={segClass(locationFilter === l.id)}>{l.name}</button>
                  ))}
                </>
              ) : (
                typeSegments.map((s) => (
                  <button key={s.value} onClick={() => setTypeFilter(s.value)} className={segClass(typeFilter === s.value)}>
                    {s.label}{s.value !== 'all' && ` ${qty(s.count)}`}
                  </button>
                ))
              )}
            </div>

            <div className="ml-auto hidden items-center gap-2 md:flex">
              <button
                onClick={() => setIsListVisible((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                {isListVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                {isListVisible ? 'Hide list' : 'Show list'}
              </button>
              <DownloadMenu onExcel={() => runDownload(downloadAsExcel)} onPdf={() => runDownload(downloadAsPdf)} theme={cat ? 'catalogue' : 'pos'} />
            </div>

            {/* Mobile sort (stock) */}
            {isStock && (
              <div className="relative ml-auto md:hidden">
                <select
                  value={`${stockSort.key}:${stockSort.direction}`}
                  onChange={(e) => {
                    const [key, direction] = e.target.value.split(':') as [StockSortKey, 'asc' | 'desc'];
                    setStockSort({ key, direction });
                  }}
                  className={`appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-xs text-slate-700 outline-none ${T.focusBorder}`}
                >
                  <option value="quantity:desc">Most qty</option>
                  <option value="quantity:asc">Least qty</option>
                  <option value="itemName:asc">Name A–Z</option>
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            )}
          </div>

          {/* EMPTY STATES */}
          {isStock && filteredStock.length === 0 && (
            <p className="px-6 py-12 text-center text-sm text-slate-500">
              {stockRows.length === 0
                ? 'No stock yet. Record a purchase to bring stock in, then move it between locations here.'
                : 'No items match — clear the search or pick another location.'}
            </p>
          )}
          {!isStock && !historyLoading && filteredHistory.length === 0 && (
            <p className="px-6 py-12 text-center text-sm text-slate-500">
              Nothing moved in this period. Purchases and transfers between locations show up here.
            </p>
          )}
          {!isStock && historyLoading && <p className="px-6 py-12 text-center text-sm text-slate-500">Loading entries…</p>}

          {/* DESKTOP: current stock table */}
          {isStock && isListVisible && filteredStock.length > 0 && (
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className={`${T.sunken} text-[11px] ${T.head}`}>
                  <tr>
                    {sortHeader('Item', 'itemName', stockSort, onStockSort)}
                    {sortHeader('Godown', 'godownName', stockSort, onStockSort)}
                    {sortHeader('Quantity', 'quantity', stockSort, onStockSort)}
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Unit</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {visibleStock.map((r: GodownStockRow) => (
                    <tr key={`${r.godownId}-${r.itemId}`} className={`border-t ${T.line} transition ${T.sunkenHover}`}>
                      <td className="px-4 py-3 font-semibold text-slate-900">{r.itemName}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                          <LocIcon id={r.godownId} />
                          {r.godownName}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="min-w-[5.5rem] shrink-0 text-right font-semibold tabular-nums text-slate-900">{qty(r.quantity)}</span>
                          <div className="h-1.5 w-24 shrink-0 overflow-hidden rounded-sm bg-slate-100">
                            <div className={`h-full rounded-sm ${T.bar}`} style={{ width: `${(r.quantity / filteredStockTotals.max) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.unit?.trim() ? <span className="text-slate-700">{r.unit}</span> : <span className="text-xs font-medium text-amber-700">Not set</span>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => openTransfer({ fromId: r.godownId, itemId: r.itemId })}
                          disabled={!hasSecondLocation}
                          title={hasSecondLocation ? `Move ${r.itemName}` : 'Add a godown first'}
                          className={`rounded-sm px-2.5 py-1 text-xs font-semibold ${T.text} ${T.softHover} disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent`}
                        >
                          Move
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-line bg-sunken text-sm font-semibold text-slate-900">
                  <tr>
                    <td className="px-4 py-3">Total · {plural(filteredStockTotals.items, 'item')}</td>
                    <td className="px-4 py-3">{plural(filteredStockTotals.locations, 'location')}</td>
                    <td className="px-4 py-3">{qty(filteredStockTotals.qty)} pcs</td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* DESKTOP: history table */}
          {!isStock && isListVisible && filteredHistory.length > 0 && (
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-sunken text-[11px] text-blue-700/80">
                  <tr>
                    {sortHeader('Date', 'date', historySort, onHistorySort)}
                    {sortHeader('Item', 'itemName', historySort, onHistorySort)}
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">From</th>
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">To</th>
                    {sortHeader('Qty', 'quantity', historySort, onHistorySort, 'right')}
                    <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Type</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {visibleHistory.map((t) => (
                    <tr key={t.id} className={`border-t ${T.line} transition ${T.sunkenHover}`}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatFullDate(t.date)}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{t.itemName}</p>
                        {t.remarks && <p className="text-xs text-slate-500">{t.remarks}</p>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {t.type === 'purchase-in' ? (
                          <span>Purchase {t.refInvoice && <span className={`font-semibold ${T.text}`}>{t.refInvoice}</span>}</span>
                        ) : t.fromGodownName ? (
                          <span className="inline-flex items-center gap-1.5"><LocIcon id={t.fromGodownId || ''} />{t.fromGodownName}</span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className="inline-flex items-center gap-1.5"><LocIcon id={t.toGodownId} />{t.toGodownName}</span>
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${t.type === 'purchase-in' ? 'text-green-700' : 'text-slate-900'}`}>
                        {t.type === 'purchase-in' ? '+' : ''}{qty(t.quantity)}
                      </td>
                      <td className="px-4 py-3">{typeBadge(t)}</td>
                      <td className="px-3 py-3 text-right">
                        {t.type === 'transfer' && (
                          <button onClick={() => setDeleteConfirm(t)} aria-label="Delete transfer" className="rounded-sm p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-700">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className={`border-t ${T.line} ${T.sunken} text-sm font-semibold text-slate-900`}>
                  <tr>
                    <td colSpan={4} className="px-4 py-3">Total · {plural(filteredHistory.length, 'entry', 'entries')}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{qty(filteredHistoryQty)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* MOBILE: current stock rows */}
          {isStock && filteredStock.length > 0 && (
            <ul className="md:hidden">
              {visibleStock.map((r, idx) => (
                <li
                  key={`${r.godownId}-${r.itemId}`}
                  onClick={() => openTransfer({ fromId: r.godownId, itemId: r.itemId })}
                  className={`flex items-center gap-3 px-4 py-3 ${idx > 0 ? `border-t ${T.line}` : ''} ${hasSecondLocation ? `cursor-pointer ${T.sunkenActive}` : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{r.itemName}</p>
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <LocIcon id={r.godownId} size={12} />
                      {r.godownName} ·{' '}
                      {r.unit?.trim() ? r.unit : <span className="font-medium text-amber-700">unit not set</span>}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-slate-900">{qty(r.quantity)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* MOBILE: history rows */}
          {!isStock && filteredHistory.length > 0 && (
            <ul className="md:hidden">
              {visibleHistory.map((t, idx) => {
                const isPurchase = t.type === 'purchase-in';
                return (
                  <li key={t.id} className={`flex items-center gap-3 px-4 py-3 ${idx > 0 ? `border-t ${T.line}` : ''}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${isPurchase ? 'bg-green-50 text-green-600' : `${T.soft} ${T.text}`}`}>
                      {isPurchase ? <FileText size={16} /> : <ArrowLeftRight size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{t.itemName}</p>
                      <p className="truncate text-xs text-slate-500">
                        {formatDayMonth(t.date)} · {fromLabel(t)} → {t.toGodownName}
                      </p>
                    </div>
                    <span className={`shrink-0 text-sm font-semibold ${isPurchase ? 'text-green-700' : 'text-slate-900'}`}>
                      {isPurchase ? '+' : ''}{qty(t.quantity)}
                    </span>
                    {t.type === 'transfer' && (
                      <button onClick={() => setDeleteConfirm(t)} aria-label="Delete transfer" className="shrink-0 rounded-sm p-1.5 text-slate-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* MOBILE totals */}
          {(isStock ? filteredStock.length : filteredHistory.length) > 0 && (
            <div className={`flex items-center justify-between rounded-b-sm border-t ${T.line} ${T.sunken} px-4 py-3 text-sm font-semibold text-slate-900 md:hidden`}>
              <span>Total · {isStock ? plural(filteredStockTotals.items, 'item') : plural(filteredHistory.length, 'entry', 'entries')}</span>
              <span className={!isStock ? 'text-green-700' : ''}>{isStock ? `${qty(filteredStockTotals.qty)} pcs` : `+${qty(filteredHistoryQty)} pcs`}</span>
            </div>
          )}

          {/* Paging */}
          {hiddenCount > 0 && (
            // The mobile list is always shown; the desktop table can be hidden.
            <div className={`border-t ${T.line} px-4 py-2.5 text-center ${isListVisible ? '' : 'md:hidden'}`}>
              <button
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-400"
              >
                Show {Math.min(PAGE_SIZE, hiddenCount)} more
              </button>
            </div>
          )}
        </section>

        {!isStock && (
          <p className="mt-3 hidden text-xs text-slate-500 md:block">
            Purchases show where stock came from ("Purchase PUR-6"); transfers between godowns show both locations and a TRANSFER badge.
          </p>
        )}
      </div>

      {/* MOBILE: Godown + Transfer pinned above the bottom navigation */}
      <div className="sticky bottom-3 z-10 mt-4 grid grid-cols-[1fr_1.4fr] gap-2.5 md:hidden">
        <button
          onClick={() => setIsGodownModalOpen(true)}
          className={`flex items-center justify-center gap-2 rounded-sm border border-slate-300 bg-white py-3.5 text-sm font-semibold text-slate-700 shadow-float ${T.sunkenActive}`}
        >
          <Warehouse size={16} />
          Godown
        </button>
        <button
          onClick={() => openTransfer()}
          disabled={!hasSecondLocation}
          className={`flex items-center justify-center gap-2 rounded-sm py-3.5 text-sm font-semibold text-white shadow-float transition disabled:opacity-50 ${accentBtn}`}
        >
          <ArrowLeftRight size={16} />
          Transfer
        </button>
      </div>
    </div>
  );
};

export default StockTransferReportPage;
