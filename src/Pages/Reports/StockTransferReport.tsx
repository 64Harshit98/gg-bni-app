import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ArrowUpDown,
  Boxes,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Eye,
  EyeOff,
  FileText,
  Info,
  MapPin,
  Package,
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
import {
  useGodowns, useStockTransfers, useGodownStock, SHOP_ID, SHOP_NAME,
  type GodownStockRow, type StockTransfer,
} from '../hooks/useStockTransfer';
import { GodownModal } from '../../Components/GodownModal';
import { TransferStockModal } from '../../Components/TransferStockModal';
import { State } from '../../enums';
import { Modal } from '../../constants/Modal';
import { Spinner } from '../../constants/Spinner';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
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
  const navigate = useNavigate();
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
  const { godowns, loading: godownsLoading, addGodown } = useGodowns(companyId);
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
      pdf.setFillColor(...((theme === 'orange' ? [234, 88, 12] : [21, 93, 252]) as [number, number, number]));
      pdf.rect(0, 0, pw, 6, 'F');

      const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      const boxWidth = pdf.getTextWidth(tagText) + 4;
      const boxX = pw - 14 - 18 - boxWidth;
      pdf.setFillColor(245, 245, 245);
      pdf.rect(boxX, 10, boxWidth, 5, 'F');
      pdf.setTextColor(80, 80, 80);
      pdf.text(tagText, boxX + 2, 13.5);

      try {
        const logo = await resolveCompanyLogoBase64(companyId);
        if (logo) {
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const w = 13;
              pdf.addImage(logo, 'PNG', pw - w - 14, 8, w, (img.naturalHeight / img.naturalWidth) * w);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = logo;
          });
        }
      } catch {
        // Continue without logo
      }

      const baseTitle = isStock ? 'Godown Stock Report' : 'Stock Transfer History';
      pdf.setFontSize(22);
      pdf.setTextColor(17, 24, 39);
      pdf.text(companyName ? `${baseTitle} — ${companyName}` : baseTitle, 14, 24);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(107, 114, 128);
      pdf.text(
        isStock
          ? `Generated: ${formatFullDate(Date.now())}   |   ${locationFilter ? locationName(locationFilter) : 'All locations'}`
          : `Generated: ${formatFullDate(Date.now())}   |   Period: ${appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : ''}`,
        14,
        31,
      );

      const tableStyles = {
        theme: 'plain' as const,
        styles: { font: 'helvetica', cellPadding: 5, fontSize: 9.5, textColor: [55, 65, 81] as [number, number, number] },
        headStyles: { fillColor: [245, 247, 255] as [number, number, number], textColor: [17, 24, 39] as [number, number, number], fontStyle: 'bold' as const, lineWidth: { top: 1, bottom: 1 }, lineColor: [223, 230, 251] as [number, number, number] },
        footStyles: { fillColor: [255, 255, 255] as [number, number, number], textColor: [17, 24, 39] as [number, number, number], fontStyle: 'bold' as const, lineWidth: { top: 1, bottom: 2 }, lineColor: [17, 24, 39] as [number, number, number] },
        showFoot: 'lastPage' as const,
        didDrawPage: () => {
          pdf.setFontSize(9);
          pdf.setTextColor(156, 163, 175);
          pdf.text(`Page ${pdf.getNumberOfPages()}`, pw - 14, ph - 10, { align: 'right' });
        },
      };

      if (isStock) {
        autoTable(pdf, {
          ...tableStyles,
          startY: 38,
          head: [['ITEM', 'GODOWN', 'QUANTITY', 'UNIT', 'LOCATION']],
          body: filteredStock.map((r) => [r.itemName, r.godownName, qty(r.quantity), r.unit || 'Not set', locations.find((l) => l.id === r.godownId)?.location || '-']),
          foot: [[`Total · ${plural(filteredStockTotals.items, 'item')}`, plural(filteredStockTotals.locations, 'location'), qty(filteredStockTotals.qty), '', '']],
          columnStyles: { 2: { halign: 'right' } },
        });
        pdf.save(`Godown_Stock_Report_${formatDateForInput(new Date())}.pdf`);
      } else {
        autoTable(pdf, {
          ...tableStyles,
          startY: 38,
          head: [['DATE', 'ITEM', 'FROM', 'TO', 'QTY', 'TYPE', 'REMARKS']],
          body: filteredHistory.map((t) => [
            formatFullDate(t.date), t.itemName, fromLabel(t), t.toGodownName,
            `${t.type === 'purchase-in' ? '+' : ''}${qty(t.quantity)}`, TYPE_LABEL[t.type], t.remarks || '-',
          ]),
          foot: [[`Total · ${plural(filteredHistory.length, 'entry', 'entries')}`, '', '', '', qty(filteredHistoryQty), '', '']],
          columnStyles: { 4: { halign: 'right' } },
        });
        pdf.save(`Stock_Transfer_History_${startDate}_to_${endDate}.pdf`);
      }
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
        fill: opts.fill ? { patternType: 'solid', fgColor: { rgb: opts.fill } } : {},
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
        <Modal type={feedbackModal.type} message={feedbackModal.message}
          onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))} showConfirmButton={false} />
      )}
      <GodownModal
        isOpen={isGodownModalOpen}
        onClose={() => setIsGodownModalOpen(false)}
        onSave={(data) => addGodown(companyId!, data)}
        theme={theme}
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
      {deleteConfirm && (
        <Modal
          type={State.WARNING}
          message={`Delete this transfer of ${qty(deleteConfirm.quantity)} × ${deleteConfirm.itemName}? The stock goes back to ${deleteConfirm.fromGodownName || 'where it came from'}.`}
          onClose={() => setDeleteConfirm(null)}
          showConfirmButton={true}
          onConfirm={confirmDelete}
        />
      )}

      {/* HEADER */}
      <header className="mb-4">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-slate-700 transition hover:bg-slate-200 md:border md:border-slate-300 md:bg-white"
          >
            <ChevronLeft size={20} />
          </button>
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
            <DownloadMenu variant="icon" onExcel={() => runDownload(downloadAsExcel)} onPdf={() => runDownload(downloadAsPdf)} />
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
                <button
                  key={l.id}
                  onClick={() => setLocationFilter(selected ? '' : l.id)}
                  className={`flex items-center gap-3 rounded-sm border bg-white p-4 text-left shadow-card transition ${selected ? T.selected : `${T.line} hover:border-slate-300`}`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-blue-50">
                    <LocIcon id={l.id} size={18} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{l.name}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {qty(t.qty)} pcs · {plural(t.items, 'item')} · {l.kind === 'shop' ? 'default location' : l.location || (l.kind === 'branch' ? 'shop / branch' : 'godown')}
                    </span>
                  </span>
                </button>
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
              <DownloadMenu onExcel={() => runDownload(downloadAsExcel)} onPdf={() => runDownload(downloadAsPdf)} />
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
                        <div className="flex items-center gap-2">
                          <span className="w-10 font-semibold text-slate-900">{qty(r.quantity)}</span>
                          <div className="h-1.5 w-24 overflow-hidden rounded-sm bg-slate-100">
                            <div className={`h-full rounded-sm ${T.bar}`} style={{ width: `${(r.quantity / filteredStockTotals.max) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
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
