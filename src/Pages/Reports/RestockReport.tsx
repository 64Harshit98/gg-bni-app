import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronLeft,
  Eye,
  EyeOff,
  IndianRupee,
  LayoutGrid,
  PackageMinus,
  PackagePlus,
  PackageX,
  Search,
  TrendingDown,
  X,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { doc, getDoc } from 'firebase/firestore';

import { db } from '../../lib/Firebase';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { useAuth } from '../../context/auth-context';
import { Modal } from '../../constants/Modal';
import { Spinner } from '../../constants/Spinner';
import { Permissions, State } from '../../enums';
import { ROUTES } from '../../constants/routes.constants';
import { ItemEditDrawer } from '../../Components/ItemDrawer';
import type { Item } from '../../constants/models';
import DownloadMenu from './SalesReportComponents/DownloadMenu';
import { formatDateForInput } from './SalesReportComponents/salesReport.utils';
import useRestockReport from './RestockReportComponents/useRestockReport';
import {
  summarizeRestock,
  type RestockFilter,
  type RestockRow,
} from './RestockReportComponents/restockReport.utils';

type SortKey = 'stock' | 'orderQty' | 'estCost' | 'name';

const PAGE_SIZE = 100;
const inrRound = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const qty = (n: number) => n.toLocaleString('en-IN');

const RestockReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const canPurchase = hasPermission(Permissions.CreatePurchase);
  const canEditItems = hasPermission(Permissions.ManageItems);
  const { rows, loading } = useRestockReport();

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

  /* ---------- STATE ---------- */
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RestockFilter>('all');
  const [groupFilter, setGroupFilter] = useState('');
  const [isListVisible, setIsListVisible] = useState(true);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'stock',
    direction: 'asc',
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [countingItem, setCountingItem] = useState<Item | null>(null);
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: State.INFO, message: '' });

  /* ---------- FILTER + SORT ---------- */
  // Search + group: drives the summary cards and the segment counts.
  const baseRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!groupFilter || r.group === groupFilter) &&
        (!q || r.name.toLowerCase().includes(q) || r.barcode.toLowerCase().includes(q)),
    );
  }, [rows, searchQuery, groupFilter]);

  const summary = useMemo(() => summarizeRestock(baseRows), [baseRows]);

  const listRows = useMemo(() => {
    const list = baseRows.filter((r) => statusFilter === 'all' || r.status === statusFilter);
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortConfig.key === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true }) * dir;
      if (sortConfig.key === 'estCost') return ((a.estCost ?? -1) - (b.estCost ?? -1)) * dir;
      return (a[sortConfig.key] - b[sortConfig.key]) * dir;
    });
    return list;
  }, [baseRows, statusFilter, sortConfig]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [baseRows, statusFilter, sortConfig]);

  const groupOptions = useMemo(
    () => [...new Set(rows.map((r) => r.group))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );

  /* ---------- SELECTION ---------- */
  const selectableRows = listRows.filter((r) => !r.looksWrong);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedQty = selectedRows.reduce((s, r) => s + r.orderQty, 0);
  const selectedCost = selectedRows.reduce((s, r) => s + (r.estCost ?? 0), 0);
  const allVisibleSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));

  // Drop selections that are no longer in the list (e.g. stock came in).
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(rows.filter((r) => !r.looksWrong).map((r) => r.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const toggleRow = (row: RestockRow) => {
    if (row.looksWrong) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) selectableRows.forEach((r) => next.delete(r.id));
      else selectableRows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const createPurchase = (forRows: RestockRow[]) => {
    if (forRows.length === 0) return;
    navigate(ROUTES.PURCHASE, {
      state: { restockItems: forRows.map((r) => ({ id: r.item.id, quantity: r.orderQty })) },
    });
  };

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key ? (prev.direction === 'asc' ? 'desc' : 'asc') : key === 'name' || key === 'stock' ? 'asc' : 'desc',
    }));
  };

  /* ---------- DOWNLOADS ---------- */
  const filterLabel =
    statusFilter === 'out' ? 'Out of stock only' : statusFilter === 'low' ? 'Low stock only' : 'All items to reorder';
  const statusText = (r: RestockRow) => (r.status === 'out' ? 'Out of stock' : 'Low stock');

  const downloadAsPdf = async () => {
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.setFillColor(21, 93, 252);
      pdf.rect(0, 0, pageWidth, 6, 'F');

      // Generation tag, leaving room for the logo at the top right
      const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      const boxWidth = pdf.getTextWidth(tagText) + 4;
      const boxX = pageWidth - 14 - 25 - boxWidth;
      pdf.setFillColor(245, 245, 245);
      pdf.rect(boxX, 10, boxWidth, 5, 'F');
      pdf.setTextColor(80, 80, 80);
      pdf.text(tagText, boxX + 2, 13.5);

      try {
        const logo = await resolveCompanyLogoBase64(currentUser?.companyId);
        if (logo) {
          await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const w = 15;
              pdf.addImage(logo, 'PNG', pageWidth - w - 14, 8, w, (img.naturalHeight / img.naturalWidth) * w);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = logo;
          });
        }
      } catch {
        // Continue without logo
      }

      pdf.setFontSize(22);
      pdf.setTextColor(17, 24, 39);
      pdf.text(companyName ? `Restock Report — ${companyName}` : 'Restock Report', 14, 24);
      pdf.setFontSize(10);
      pdf.setTextColor(107, 114, 128);
      pdf.setFont('helvetica', 'normal');
      pdf.text(
        `Generated: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}   |   ${filterLabel}   |   Items: ${listRows.length}`,
        14,
        31,
      );

      autoTable(pdf, {
        startY: 38,
        head: [['ITEM', 'ID', 'STOCK', 'RESTOCK LEVEL', 'ORDER QTY', 'EST. COST (Rs.)', 'STATUS']],
        body: listRows.map((r) => [
          r.looksWrong ? `${r.name} *` : r.name,
          r.barcode || '-',
          qty(r.stock),
          qty(r.level),
          `${qty(r.orderQty)} ${r.unit}`,
          r.estCost === null ? '-' : r.estCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          statusText(r),
        ]),
        foot: [[
          `Total: ${listRows.length} items`,
          '',
          '',
          '',
          `${qty(listRows.reduce((s, r) => s + r.orderQty, 0))}`,
          listRows.reduce((s, r) => s + (r.estCost ?? 0), 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          '',
        ]],
        showFoot: 'lastPage',
        theme: 'plain',
        styles: { font: 'helvetica', cellPadding: 5, fontSize: 9, textColor: [55, 65, 81] },
        headStyles: { fillColor: [245, 247, 255], textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1, bottom: 1 }, lineColor: [223, 230, 251] },
        footStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1, bottom: 2 }, lineColor: [17, 24, 39] },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 2 && String(data.cell.raw).startsWith('-')) {
            data.cell.styles.textColor = [213, 0, 12];
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.section === 'body' && data.column.index === 6) {
            data.cell.styles.textColor = data.cell.raw === 'Out of stock' ? [213, 0, 12] : [187, 77, 0];
          }
        },
        didDrawPage: () => {
          pdf.setFontSize(9);
          pdf.setTextColor(156, 163, 175);
          pdf.text(`Page ${pdf.getNumberOfPages()}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
        },
      });

      if (listRows.some((r) => r.looksWrong)) {
        pdf.setFontSize(8);
        pdf.setTextColor(187, 77, 0);
        pdf.text('* Stock looks wrong (far below zero) — count it before ordering.', 14, (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6);
      }

      pdf.save(`Restock_Report_${formatDateForInput(new Date())}.pdf`);
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate PDF.' });
    }
  };

  const downloadAsExcel = () => {
    try {
      const border = { style: 'thin', color: { rgb: 'DFE6FB' } };
      const cellStyle = (opts: { bold?: boolean; color?: string; fill?: string; align?: string; size?: number }) => ({
        font: { name: 'Arial', sz: opts.size ?? 9, bold: !!opts.bold, color: { rgb: opts.color ?? '0F172B' } },
        fill: opts.fill ? { patternType: 'solid', fgColor: { rgb: opts.fill } } : {},
        alignment: { horizontal: opts.align ?? 'left', vertical: 'center', wrapText: true },
        border: { top: border, bottom: border, left: border, right: border },
      });

      const COLS = [
        { header: '#', width: 6 },
        { header: 'Item', width: 30 },
        { header: 'ID', width: 14 },
        { header: 'Group', width: 16 },
        { header: 'Stock', width: 10 },
        { header: 'Restock Level', width: 14 },
        { header: 'Order Qty', width: 12 },
        { header: 'Unit', width: 8 },
        { header: 'Unit Cost (₹)', width: 14 },
        { header: 'Est. Cost (₹)', width: 16 },
        { header: 'Status', width: 14 },
        { header: 'Note', width: 30 },
      ];
      const colCount = COLS.length;
      const dataStart = 4;
      const aoa: (string | number)[][] = [
        [companyName ? `Restock Report — ${companyName}` : 'Restock Report'],
        [`Generated: ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}   |   ${filterLabel}   |   Need restock: ${summary.total}   |   Out of stock: ${summary.outOfStock}   |   Est. cost: ₹${Math.round(summary.estCost).toLocaleString('en-IN')}`],
        [],
        COLS.map((c) => c.header),
        ...listRows.map((r, i) => [
          i + 1,
          r.name,
          r.barcode || '-',
          r.group,
          r.stock,
          r.level,
          r.orderQty,
          r.unit,
          r.unitCost ?? '',
          r.estCost ?? '',
          statusText(r),
          r.looksWrong ? 'Stock looks wrong — count it first' : '',
        ]),
        ['TOTAL', `${listRows.length} items`, '', '', '', '', listRows.reduce((s, r) => s + r.orderQty, 0), '', '', listRows.reduce((s, r) => s + (r.estCost ?? 0), 0), '', ''],
      ];

      const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = COLS.map((c) => ({ wch: c.width }));
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
      ];
      const put = (r: number, c: number, st: ReturnType<typeof cellStyle>, numFmt?: string) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].s = st;
        if (numFmt && typeof ws[addr].v === 'number') ws[addr].z = numFmt;
      };

      put(0, 0, cellStyle({ bold: true, size: 16, color: 'FFFFFF', fill: '155DFC', align: 'center' }));
      put(1, 0, cellStyle({ color: '45556C', fill: 'E6EEFF', align: 'center' }));
      COLS.forEach((_, c) => put(3, c, cellStyle({ bold: true, size: 10, color: 'FFFFFF', fill: '1447E6' })));
      const numericCols = new Set([4, 5, 6, 8, 9]);
      listRows.forEach((r, i) => {
        const row = dataStart + i;
        for (let c = 0; c < colCount; c++) {
          const color = c === 4 && r.stock < 0 ? 'D5000C' : c === 10 ? (r.status === 'out' ? 'D5000C' : 'BB4D00') : c === 11 ? 'BB4D00' : undefined;
          put(row, c, cellStyle({ color, fill: r.looksWrong ? 'FFF3DD' : undefined, align: numericCols.has(c) ? 'right' : 'left' }), c === 8 || c === 9 ? '₹#,##0.00' : '#,##0');
        }
      });
      const footRow = dataStart + listRows.length;
      for (let c = 0; c < colCount; c++) {
        put(footRow, c, cellStyle({ bold: true, size: 10, fill: 'F5F7FF', align: numericCols.has(c) ? 'right' : 'left' }), c === 9 ? '₹#,##0.00' : '#,##0');
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Restock Report');
      XLSX.writeFile(wb, `Restock_Report_${formatDateForInput(new Date())}.xlsx`);
      setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'Excel downloaded successfully!' });
    } catch {
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate Excel file.' });
    }
  };

  // A list a supplier can read: the selected items, or everything that's safe to order.
  const shareOnWhatsApp = () => {
    const toShare = selectedRows.length ? selectedRows : listRows.filter((r) => !r.looksWrong);
    const text = [
      `*Order list${companyName ? ` — ${companyName}` : ''}*`,
      new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      '',
      ...toShare.map((r, i) => `${i + 1}. ${r.name} — ${qty(r.orderQty)} ${r.unit}`),
      '',
      `${toShare.length} items · ${qty(toShare.reduce((s, r) => s + r.orderQty, 0))} pcs`,
    ].join('\n');
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const runDownload = (action: () => void) => {
    if (listRows.length === 0) {
      setFeedbackModal({ isOpen: true, type: State.INFO, message: 'Nothing to download — no items need restocking.' });
      return;
    }
    action();
  };

  /* ---------- RENDER HELPERS ---------- */
  const renderSortHeader = (label: string, key: SortKey, align: 'left' | 'right' = 'left') => {
    const isActive = sortConfig.key === key;
    const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => handleSort(key)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-blue-800 ${align === 'right' ? 'flex-row-reverse' : ''} ${isActive ? 'text-blue-700' : ''}`}
        >
          {label}
          <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
        </button>
      </th>
    );
  };

  const renderCheckbox = (checked: boolean, onToggle: () => void, label: string, disabled = false) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border transition ${
        checked ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-400 bg-white'
      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  );

  const renderStatus = (r: RestockRow) => (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-semibold ${
        r.status === 'out' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${r.status === 'out' ? 'bg-red-600' : 'bg-amber-500'}`} />
      {statusText(r)}
    </span>
  );

  const countStockButton = (r: RestockRow) =>
    canEditItems ? (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setCountingItem(r.item);
        }}
        className="whitespace-nowrap rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-400"
      >
        Count stock
      </button>
    ) : null;

  /* ---------- LOAD STATE ---------- */
  if (loading) return <Spinner />;

  const segments: { value: RestockFilter; label: string; short: string; count: number }[] = [
    { value: 'all', label: 'All', short: 'All', count: summary.total },
    { value: 'out', label: 'Out of stock', short: 'Out of stock', count: summary.outOfStock },
    { value: 'low', label: 'Low stock', short: 'Low', count: summary.lowStock },
  ];

  const statCards = [
    {
      label: 'Need restock',
      value: qty(summary.total),
      hint: 'below their restock level',
      icon: PackageMinus,
      iconClass: 'bg-blue-50 text-blue-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Out of stock',
      value: qty(summary.outOfStock),
      hint: 'order these first',
      icon: PackageX,
      iconClass: 'bg-red-50 text-red-600',
      valueClass: summary.outOfStock > 0 ? 'text-red-600' : 'text-slate-900',
    },
    {
      label: 'Low stock',
      value: qty(summary.lowStock),
      hint: 'still some left',
      icon: TrendingDown,
      iconClass: 'bg-amber-50 text-amber-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Est. restock cost',
      shortLabel: 'Est. cost',
      value: inrRound(summary.estCost),
      hint: summary.withoutCost
        ? `${qty(summary.withoutCost)} ${summary.withoutCost === 1 ? 'item has' : 'items have'} no cost price`
        : `to bring all ${qty(summary.total)} back to level`,
      icon: IndianRupee,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-slate-900',
    },
  ];

  const visibleRows = listRows.slice(0, visibleCount);
  const segmentButtonClass = (active: boolean) =>
    `whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition ${
      active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'
    }`;

  return (
    <div className="min-h-screen bg-canvas px-3 pb-28 pt-3 md:px-6 md:pb-8 md:pt-5">
      {feedbackModal.isOpen && (
        <Modal
          type={feedbackModal.type}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
          showConfirmButton={false}
        />
      )}

      {canEditItems && (
        <ItemEditDrawer
          item={countingItem}
          isOpen={!!countingItem}
          onClose={() => setCountingItem(null)}
          // The shared items listener brings the corrected stock back into the list.
          onSaveSuccess={() => { }}
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
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Restock report</h1>
            <span className="hidden text-xs text-slate-500 md:inline">What to reorder and how much</span>
          </div>
          <p className="text-xs text-slate-500 md:hidden">
            {qty(summary.total)} {summary.total === 1 ? 'item' : 'items'} to reorder
          </p>
        </div>

        {/* Desktop search */}
        <div className="relative hidden w-72 md:block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search item or ID"
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
            onWhatsApp={() => runDownload(shareOnWhatsApp)}
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
            placeholder="Search item or ID"
            autoFocus
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            onClick={() => { setSearchQuery(''); setShowSearch(false); }}
            aria-label="Close search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-slate-400 hover:text-slate-600"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* SUMMARY — 2 cols on mobile, 4 cols on md+ */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
        {statCards.map(({ label, shortLabel, value, hint, icon: Icon, iconClass, valueClass }) => (
          <div key={label} className="min-w-0 rounded-sm border border-line bg-white p-3 shadow-card md:p-4">
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
            <p className={`mt-2 truncate text-xl font-bold md:text-2xl ${valueClass}`}>{value}</p>
            <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
          </div>
        ))}
      </div>

      {/* MOBILE: status switch */}
      <div className="mb-3 grid grid-cols-[1fr_1.4fr_1fr] gap-1 rounded-sm bg-sunken p-1 md:hidden">
        {segments.map((s) => (
          <button key={s.value} onClick={() => setStatusFilter(s.value)} className={segmentButtonClass(statusFilter === s.value)}>
            {s.short} {s.count}
          </button>
        ))}
      </div>

      {/* ITEMS */}
      <section className="rounded-sm border border-line bg-white shadow-card">
        <div className="hidden flex-wrap items-center gap-3 border-b border-line px-4 py-3 md:flex">
          <div className="flex gap-1 rounded-sm bg-sunken p-1" role="group" aria-label="Filter by stock status">
            {segments.map((s) => (
              <button key={s.value} onClick={() => setStatusFilter(s.value)} className={segmentButtonClass(statusFilter === s.value)}>
                {s.label} {qty(s.count)}
              </button>
            ))}
          </div>
          <div className="relative">
            <LayoutGrid size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-blue-500"
            >
              <option value="">All groups</option>
              {groupOptions.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
          <div className="ml-auto flex items-center gap-2">
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
              onWhatsApp={() => runDownload(shareOnWhatsApp)}
            />
          </div>
        </div>

        {/* Empty state */}
        {listRows.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-sm bg-green-50 text-green-600">
              <PackagePlus size={24} />
            </span>
            <p className="text-sm font-semibold text-slate-900">
              {rows.length === 0 ? 'Nothing to reorder' : 'No items match these filters'}
            </p>
            <p className="max-w-sm text-xs text-slate-500">
              {rows.length === 0
                ? 'Every item is above its restock level. Set a restock level on items (Add or Edit item) to get reminders here.'
                : 'Clear the search or pick another group or status.'}
            </p>
          </div>
        )}

        {/* Desktop table */}
        {isListVisible && listRows.length > 0 && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-sunken text-[11px] text-blue-700/80">
                <tr>
                  <th className="w-10 px-4 py-3">
                    {renderCheckbox(allVisibleSelected, toggleAllVisible, 'Select all items you can order', selectableRows.length === 0)}
                  </th>
                  {renderSortHeader('Item', 'name')}
                  {renderSortHeader('Stock', 'stock', 'right')}
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Restock level</th>
                  {renderSortHeader('Order qty', 'orderQty', 'right')}
                  {renderSortHeader('Est. cost', 'estCost', 'right')}
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Status</th>
                  <th className="w-28" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const isSelected = selected.has(r.id);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => toggleRow(r)}
                      className={`border-t border-line transition ${
                        r.looksWrong ? 'bg-amber-50/80' : isSelected ? 'cursor-pointer bg-blue-50/60' : 'cursor-pointer hover:bg-sunken'
                      }`}
                    >
                      <td className="px-4 py-3">
                        {renderCheckbox(isSelected, () => toggleRow(r), `Select ${r.name}`, r.looksWrong)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{r.name}</p>
                        <p className="text-xs text-slate-500">{[r.barcode && `ID ${r.barcode}`, r.group].filter(Boolean).join(' · ')}</p>
                        {r.looksWrong && <p className="text-xs font-medium text-amber-700">Stock looks wrong — count it first</p>}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right ${r.stock < 0 ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                        {qty(r.stock)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">{qty(r.level)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <span className="font-semibold text-slate-900">{qty(r.orderQty)}</span>{' '}
                        <span className="text-xs text-slate-500">{r.unit}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {r.estCost === null ? <span className="text-slate-400">—</span> : inrRound(r.estCost)}
                      </td>
                      <td className="px-4 py-3">{renderStatus(r)}</td>
                      <td className="px-4 py-3 text-right">
                        {r.looksWrong
                          ? countStockButton(r)
                          : canPurchase && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                createPurchase([r]);
                              }}
                              className="rounded-sm px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                            >
                              Order →
                            </button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile list */}
        {listRows.length > 0 && (
          <ul className="md:hidden">
            {visibleRows.map((r, idx) => {
              const isSelected = selected.has(r.id);
              return (
                <li
                  key={r.id}
                  onClick={() => toggleRow(r)}
                  className={`flex gap-3 px-4 py-3 ${idx > 0 ? 'border-t border-line' : ''} ${
                    r.looksWrong ? 'bg-amber-50/80' : isSelected ? 'bg-blue-50/60' : 'active:bg-sunken'
                  }`}
                >
                  <div className="pt-0.5">{renderCheckbox(isSelected, () => toggleRow(r), `Select ${r.name}`, r.looksWrong)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 text-sm font-semibold text-slate-900">{r.name}</p>
                      <p className="shrink-0 text-sm font-semibold text-slate-900">
                        Order {qty(r.orderQty)} <span className="text-xs font-normal text-slate-500">{r.unit}</span>
                      </p>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span className="truncate">
                        {r.barcode && <>ID {r.barcode} · </>}stock{' '}
                        <span className={r.stock < 0 ? 'font-semibold text-red-600' : ''}>{qty(r.stock)}</span> · level {qty(r.level)}
                      </span>
                      <span className="shrink-0">{r.estCost === null ? '—' : inrRound(r.estCost)}</span>
                    </div>
                    {r.looksWrong && (
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-amber-700">Stock looks wrong — count it first</span>
                        {countStockButton(r)}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Paging */}
        {visibleRows.length < listRows.length && (
          // The mobile list is always shown; the desktop table can be hidden.
          <div className={`border-t border-line px-4 py-2.5 text-center ${isListVisible ? '' : 'md:hidden'}`}>
            <button
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-400"
            >
              Show {Math.min(PAGE_SIZE, listRows.length - visibleRows.length)} more of {qty(listRows.length)}
            </button>
          </div>
        )}

        {/* Desktop selection bar */}
        {canPurchase && isListVisible && listRows.length > 0 && (
          <div
            className={`hidden items-center gap-3 rounded-b-sm border-t border-line px-4 py-3 md:flex ${
              selectedRows.length ? 'bg-blue-50' : 'bg-sunken'
            }`}
          >
            {selectedRows.length ? (
              <>
                <p className="text-sm text-slate-800">
                  <strong>{selectedRows.length} {selectedRows.length === 1 ? 'item' : 'items'}</strong> · {qty(selectedQty)} pcs
                  {selectedCost > 0 && <> · {inrRound(selectedCost)} est.</>}
                </p>
                <button onClick={() => setSelected(new Set())} className="text-xs font-medium text-slate-600 hover:underline">
                  Clear
                </button>
                <button
                  onClick={() => createPurchase(selectedRows)}
                  className="ml-auto inline-flex items-center gap-2 rounded-sm bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  <PackagePlus size={15} />
                  Create purchase for {selectedRows.length} {selectedRows.length === 1 ? 'item' : 'items'}
                </button>
              </>
            ) : (
              <p className="text-sm text-slate-500">Tick items to create one purchase with these order quantities.</p>
            )}
          </div>
        )}
      </section>

      {/* ODD STOCK NOTE */}
      {summary.looksWrong.length > 0 && (
        <div className="mt-4 flex gap-2 rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
          <p>
            <strong>
              {summary.looksWrong.slice(0, 3).map((r) => `${r.name} (${qty(r.stock)})`).join(', ')}
              {summary.looksWrong.length > 3 && ` and ${summary.looksWrong.length - 3} more`}
            </strong>{' '}
            {summary.looksWrong.length === 1 ? 'was' : 'were'} sold far more than you have — probably sold without recording
            purchases. Count {summary.looksWrong.length === 1 ? 'it' : 'them'} before ordering, or you may buy stock you don't
            need. {summary.looksWrong.length === 1 ? "It's" : "They're"} left out of the selection.
          </p>
        </div>
      )}

      {/* MOBILE: pinned selection bar */}
      {canPurchase && listRows.length > 0 && (
        <div className="sticky bottom-3 z-10 mt-4 flex items-center gap-3 rounded-sm border border-line bg-white p-3 shadow-float md:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">Selected</p>
            <p className="truncate text-sm font-semibold text-slate-900">
              {selectedRows.length ? `${selectedRows.length} ${selectedRows.length === 1 ? 'item' : 'items'} · ${qty(selectedQty)} pcs` : 'Tick items to order'}
            </p>
          </div>
          <button
            onClick={() => createPurchase(selectedRows)}
            disabled={selectedRows.length === 0}
            className="inline-flex shrink-0 items-center gap-2 rounded-sm bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition active:bg-blue-700 disabled:opacity-50"
          >
            <PackagePlus size={16} />
            Create purchase
          </button>
        </div>
      )}
    </div>
  );
};

export default RestockReportPage;
