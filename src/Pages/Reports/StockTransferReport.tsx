import React, { useMemo, useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import {
  useGodowns, useStockTransfers, useGodownStock, SHOP_ID,
  type GodownStockRow, type StockTransfer,
} from '../hooks/useStockTransfer';
import { GodownModal } from '../../Components/GodownModal';
import { TransferStockModal } from '../../Components/TransferStockModal';
import BackButton from '../../Components/BackButton';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant, State } from '../../enums';
import { IconClose, IconSearch } from '../../constants/Icons';
import { Modal } from '../../constants/Modal';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import ReportDateFilter from '../../Components/ReportDateFilter';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

type Tab = 'stock' | 'history';

const formatDate = (ms: number) =>
  new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const formatDateForInput = (d: Date) => d.toISOString().split('T')[0];

interface StockTransferReportPageProps {
  theme?: 'blue' | 'orange';
}

const StockTransferReportPage: React.FC<StockTransferReportPageProps> = ({ theme = 'blue' }) => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
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

  const accentBg = theme === 'orange' ? 'bg-[#F97316]' : 'bg-blue-600';
  const accentBgHover = theme === 'orange' ? 'hover:bg-orange-600' : 'hover:bg-blue-700';
  const accentRing = theme === 'orange' ? 'focus:ring-[#F97316]' : 'focus:ring-blue-500';
  const accentText = theme === 'orange' ? 'text-[#F97316]' : 'text-blue-600';

  // Excel export colors — mirrors the orange/blue theme used in the UI
  const xlsxColors = theme === 'orange'
    ? {
        titleBg: 'EA580C', metaBg: 'FFEDD5', metaText: '7C2D12',
        summaryLabelText: 'C2410C', summaryLabelBg: 'FFF7ED',
        summaryValueText: '9A3412', summaryValueBg: 'FFF7ED',
        headerBg: 'C2410C', footerBg: 'FED7AA',
        border: 'FED7AA', altRow: 'FFF7ED',
      }
    : {
        titleBg: '2563EB', metaBg: 'DBEAFE', metaText: '475569',
        summaryLabelText: '1D4ED8', summaryLabelBg: 'EFF6FF',
        summaryValueText: '166534', summaryValueBg: 'DCFCE7',
        headerBg: '1E40AF', footerBg: 'E2E8F0',
        border: 'CBD5E1', altRow: 'F8FAFC',
      };

  const { godowns, loading: godownsLoading, addGodown } = useGodowns(companyId);
  const { stockRows, items, loading: stockLoading } = useGodownStock(companyId, godowns);
  const { transfers, loading: transfersLoading, transferStock, deleteTransferRecord } = useStockTransfers(companyId);
  const loading = godownsLoading || stockLoading || transfersLoading;

  const [activeTab, setActiveTab] = useState<Tab>('stock');

  // --- filters (only used for History tab) ---
  const today = formatDateForInput(new Date());
  const last30Start = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return formatDateForInput(d);
  })();
  const [startDate, setStartDate] = useState(last30Start);
  const [endDate, setEndDate] = useState(today);
  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(() => {
    const s = new Date(); s.setDate(s.getDate() - 29); s.setHours(0, 0, 0, 0);
    const e = new Date(); e.setHours(23, 59, 59, 999);
    return { start: s.getTime(), end: e.getTime() };
  });
  const [datePreset, setDatePreset] = useState('last30');

  // --- ui state ---
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState<string>(''); // '' = All Locations
  const [isListVisible, setIsListVisible] = useState(true);
  const [isGodownModalOpen, setIsGodownModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({ isOpen: false, type: State.INFO, message: '' });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [stockSort, setStockSort] = useState<{ key: keyof GodownStockRow; direction: 'asc' | 'desc' }>({
    key: 'godownName', direction: 'asc',
  });
  const [historySort, setHistorySort] = useState<{ key: keyof StockTransfer; direction: 'asc' | 'desc' }>({
    key: 'date', direction: 'desc',
  });

  const handleDatePreset = (preset: string) => {
    setDatePreset(preset);
    const start = new Date();
    const end = new Date();
    switch (preset) {
      case 'yesterday': start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); break;
      case 'last7': start.setDate(start.getDate() - 6); break;
      case 'last30': start.setDate(start.getDate() - 29); break;
      case 'custom': return;
    }
    setStartDate(formatDateForInput(start));
    setEndDate(formatDateForInput(end));
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: s.getTime(), end: e.getTime() });
  };
  const handleApply = () => {
    const s = new Date(startDate); s.setHours(0, 0, 0, 0);
    const e = new Date(endDate); e.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: s.getTime(), end: e.getTime() });
  };
  const handleStartDateChange = (value: string) => { setStartDate(value); setDatePreset('custom'); };
  const handleEndDateChange = (value: string) => { setEndDate(value); setDatePreset('custom'); };

  const handleStockSort = (key: keyof GodownStockRow) => {
    setStockSort(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };
  const handleHistorySort = (key: keyof StockTransfer) => {
    setHistorySort(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  // Grand total across ALL locations — always shows the full picture,
  // regardless of the location filter or search applied to the table below.
  const totalStockAllLocations = useMemo(
    () => stockRows.reduce((s, r) => s + r.quantity, 0),
    [stockRows]
  );

  // ---- filtered + sorted STOCK rows ----
  const { filteredStock, stockSummary } = useMemo(() => {
    let list = [...stockRows];
    if (locationFilter) {
      list = list.filter(r => r.godownId === locationFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => r.itemName.toLowerCase().includes(q) || r.godownName.toLowerCase().includes(q));
    }
    list.sort((a, b) => {
      const dir = stockSort.direction === 'asc' ? 1 : -1;
      const va = a[stockSort.key] ?? '';
      const vb = b[stockSort.key] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    const totalQty = list.reduce((s, r) => s + r.quantity, 0);
    const godownCount = new Set(
      list.filter(r => r.godownId !== SHOP_ID).map(r => r.godownId)
    ).size;
    return { filteredStock: list, stockSummary: { totalQty, godownCount, count: list.length } };
  }, [stockRows, searchQuery, stockSort, locationFilter]);

  // ---- filtered + sorted HISTORY rows ----
  const { filteredHistory, historySummary } = useMemo(() => {
    if (!appliedFilters) return { filteredHistory: [], historySummary: { totalQty: 0, count: 0 } };
    let list = transfers.filter(t => t.date >= appliedFilters.start && t.date <= appliedFilters.end);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t =>
        t.itemName.toLowerCase().includes(q) ||
        t.toGodownName.toLowerCase().includes(q) ||
        (t.fromGodownName || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      const dir = historySort.direction === 'asc' ? 1 : -1;
      const va = a[historySort.key] ?? '';
      const vb = b[historySort.key] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    const totalQty = list.reduce((s, t) => s + t.quantity, 0);
    return { filteredHistory: list, historySummary: { totalQty, count: list.length } };
  }, [transfers, appliedFilters, searchQuery, historySort]);

  // ---- PDF ----
  const downloadAsPdf = async () => {
    try {
      const doc = new jsPDF();
      const pw = doc.internal.pageSize.getWidth();
      const ph = doc.internal.pageSize.getHeight();
      doc.setFillColor(37, 99, 235); doc.rect(0, 0, pw, 6, 'F');
      doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(17, 24, 39);
      const baseTitle = activeTab === 'stock' ? 'Godown Stock Report' : 'Stock Transfer History';
      const reportTitle = companyName ? `${baseTitle} — ${companyName}` : baseTitle;
      doc.text(reportTitle, 14, 24);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
      const subtitle = activeTab === 'stock'
        ? `Generated: ${formatDate(Date.now())}`
        : `Generated: ${formatDate(Date.now())}   |   Period: ${appliedFilters ? formatDate(appliedFilters.start) : ''} to ${appliedFilters ? formatDate(appliedFilters.end) : ''}`;
      doc.text(subtitle, 14, 31);

      const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
      const textWidth = doc.getTextWidth(tagText);
      const paddingX = 2;
      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = 5;
      const logoReservedWidth = 18;
      const boxX = pw - 14 - logoReservedWidth - boxWidth;
      const boxY = 10;
      doc.setFillColor(245, 245, 245);
      doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');
      doc.setTextColor(80, 80, 80);
      doc.text(tagText, boxX + paddingX, boxY + 3.5);
      doc.setTextColor(0, 0, 0);

      try {
        const base64Logo = await resolveCompanyLogoBase64(companyId);
        if (base64Logo) {
          const img = new Image();
          img.src = base64Logo;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const logoWidth = 13;
              const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
              const logoX = pw - logoWidth - 14;
              doc.addImage(base64Logo, 'PNG', logoX, 8, logoWidth, logoHeight);
              resolve();
            };
            img.onerror = () => resolve();
          });
        }
      } catch { }

      if (activeTab === 'stock') {
        autoTable(doc, {
          startY: 38,
          head: [['GODOWN', 'ITEM', 'QUANTITY', 'UNIT']],
          body: filteredStock.map(r => [r.godownName, r.itemName, r.quantity.toLocaleString('en-IN'), r.unit || '-']),
          foot: [['TOTAL', '', stockSummary.totalQty.toLocaleString('en-IN'), '']],
          theme: 'plain',
          styles: { font: 'helvetica', cellPadding: 7, fontSize: 10, textColor: [55, 65, 81] },
          headStyles: { fillColor: [249, 250, 251], textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1, bottom: 1 }, lineColor: [229, 231, 235] },
          footStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1, bottom: 2 }, lineColor: [17, 24, 39] },
          alternateRowStyles: { fillColor: [252, 252, 252] },
          columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 'auto' }, 2: { halign: 'right', cellWidth: 35 }, 3: { halign: 'center', cellWidth: 25 } },
          didDrawPage: () => {
            doc.setFontSize(9); doc.setTextColor(156, 163, 175);
            doc.text(`Page ${doc.getNumberOfPages()}`, pw - 14, ph - 10, { align: 'right' });
          },
        });
        doc.save(`Godown_Stock_Report_${formatDateForInput(new Date())}.pdf`);
      } else {
        autoTable(doc, {
          startY: 38,
          head: [['DATE', 'ITEM', 'FROM', 'TO', 'TYPE', 'QTY']],
          body: filteredHistory.map(t => [
            formatDate(t.date), t.itemName, t.fromGodownName || '-', t.toGodownName,
            t.type === 'purchase-in' ? 'Purchase' : t.type === 'transfer' ? 'Transfer' : 'Adjustment',
            t.quantity.toLocaleString('en-IN'),
          ]),
          foot: [['TOTAL', '', '', '', '', historySummary.totalQty.toLocaleString('en-IN')]],
          theme: 'plain',
          styles: { font: 'helvetica', cellPadding: 6, fontSize: 9.5, textColor: [55, 65, 81] },
          headStyles: { fillColor: [249, 250, 251], textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1, bottom: 1 }, lineColor: [229, 231, 235] },
          footStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: 'bold', lineWidth: { top: 1, bottom: 2 }, lineColor: [17, 24, 39] },
          alternateRowStyles: { fillColor: [252, 252, 252] },
          columnStyles: { 5: { halign: 'right' } },
          didDrawPage: () => {
            doc.setFontSize(9); doc.setTextColor(156, 163, 175);
            doc.text(`Page ${doc.getNumberOfPages()}`, pw - 14, ph - 10, { align: 'right' });
          },
        });
        doc.save(`Stock_Transfer_History_${startDate}_to_${endDate}.pdf`);
      }
      setIsDownloadModalOpen(false);
    } catch (err) { console.error(err); }
  };

  // ---- Excel ----
  const downloadAsExcel = () => {
    try {
      const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
        font: { name: 'Arial', ...font }, fill: fill ?? {},
        alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true }, border: border ?? {},
      });
      const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
      const allBorders = { top: { style: 'thin', color: { rgb: xlsxColors.border } }, bottom: { style: 'thin', color: { rgb: xlsxColors.border } }, left: { style: 'thin', color: { rgb: xlsxColors.border } }, right: { style: 'thin', color: { rgb: xlsxColors.border } } };
      const bblr = { bottom: { style: 'thin', color: { rgb: xlsxColors.border } }, left: { style: 'thin', color: { rgb: xlsxColors.border } }, right: { style: 'thin', color: { rgb: xlsxColors.border } } };

      const isStock = activeTab === 'stock';
      const COLS = isStock
        ? [{ header: '#', width: 6 }, { header: 'Godown', width: 22 }, { header: 'Item', width: 26 }, { header: 'Quantity', width: 14 }, { header: 'Unit', width: 10 }]
        : [{ header: '#', width: 6 }, { header: 'Date', width: 14 }, { header: 'Item', width: 22 }, { header: 'From', width: 18 }, { header: 'To', width: 18 }, { header: 'Type', width: 14 }, { header: 'Qty', width: 10 }];
      const colCount = COLS.length;
      const dataStartRow = 7;
      const rowsData = isStock ? filteredStock : filteredHistory;
      const totalRows = dataStartRow + rowsData.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      aoa[0][0] = companyName
        ? `${isStock ? 'Godown Stock Report' : 'Stock Transfer History'}  —  ${companyName}`
        : (isStock ? 'Godown Stock Report' : 'Stock Transfer History');
      aoa[1][0] = isStock ? `Generated: ${formatDate(Date.now())}` :
        `Generated: ${formatDate(Date.now())}   |   Period: ${appliedFilters ? formatDate(appliedFilters.start) : ''} → ${appliedFilters ? formatDate(appliedFilters.end) : ''}`;
      aoa[3][0] = 'SUMMARY';
      aoa[4][0] = isStock
        ? `Total Quantity: ${stockSummary.totalQty.toLocaleString('en-IN')}   |   Godowns: ${stockSummary.godownCount}   |   Rows: ${stockSummary.count}`
        : `Total Quantity Moved: ${historySummary.totalQty.toLocaleString('en-IN')}   |   Entries: ${historySummary.count}`;
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      if (isStock) {
        filteredStock.forEach((r, idx) => {
          aoa[dataStartRow + idx] = [idx + 1, r.godownName, r.itemName, r.quantity, r.unit || ''];
        });
      } else {
        filteredHistory.forEach((t, idx) => {
          aoa[dataStartRow + idx] = [
            idx + 1, formatDate(t.date), t.itemName, t.fromGodownName || '-', t.toGodownName,
            t.type === 'purchase-in' ? 'Purchase' : t.type === 'transfer' ? 'Transfer' : 'Adjustment', t.quantity,
          ];
        });
      }
      const footerRow = dataStartRow + rowsData.length;
      const qtyColIdx = isStock ? 3 : 6;
      aoa[footerRow] = Array(colCount).fill('');
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][qtyColIdx] = isStock ? stockSummary.totalQty : historySummary.totalQty;

      const ws: any = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = COLS.map(c => ({ wch: c.width }));
      ws['!rows'] = [{ hpt: 36 }, { hpt: 20 }, { hpt: 8 }, { hpt: 18 }, { hpt: 22 }, { hpt: 8 }, { hpt: 28 }, ...rowsData.map(() => ({ hpt: 20 })), { hpt: 24 }];
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } }, { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } }, { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } }];

      const styleCell = (addr: string, st: any) => { if (!ws[addr]) ws[addr] = { t: 's', v: '' }; ws[addr].s = st; };
      styleCell('A1', s({ sz: 16, bold: true, color: { rgb: 'FFFFFF' } }, solidFill(xlsxColors.titleBg), { horizontal: 'center', vertical: 'center' }));
      styleCell('A2', s({ sz: 9, italic: true, color: { rgb: xlsxColors.metaText } }, solidFill(xlsxColors.metaBg), { horizontal: 'center', vertical: 'center' }));
      styleCell('A4', s({ sz: 10, bold: true, color: { rgb: xlsxColors.summaryLabelText } }, solidFill(xlsxColors.summaryLabelBg), { horizontal: 'left', vertical: 'center' }, allBorders));
      styleCell('A5', s({ sz: 10, bold: true, color: { rgb: xlsxColors.summaryValueText } }, solidFill(xlsxColors.summaryValueBg), { horizontal: 'center', vertical: 'center' }, bblr));
      COLS.forEach((_, i) => {
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        styleCell(addr, s({ sz: 10, bold: true, color: { rgb: 'FFFFFF' } }, solidFill(xlsxColors.headerBg), { horizontal: i <= 1 ? 'left' : 'center', vertical: 'center' }, allBorders));
      });
      rowsData.forEach((_, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          styleCell(addr, s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(isAlt ? xlsxColors.altRow : 'FFFFFF'), { horizontal: ci === qtyColIdx ? 'center' : 'left', vertical: 'center' }, bblr));
          if (ci === qtyColIdx && ws[addr]) { ws[addr].t = 'n'; }
        }
      });
      for (let ci = 0; ci < colCount; ci++) {
        const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
        styleCell(addr, s({ sz: 10, bold: true, color: { rgb: '1E293B' } }, solidFill(xlsxColors.footerBg), { horizontal: ci <= 1 ? 'left' : 'center', vertical: 'center' }, { top: { style: 'medium', color: { rgb: '1E293B' } }, bottom: { style: 'medium', color: { rgb: '1E293B' } }, left: { style: 'thin', color: { rgb: xlsxColors.border } }, right: { style: 'thin', color: { rgb: xlsxColors.border } } }));
        if (ci === qtyColIdx && ws[addr]) { ws[addr].t = 'n'; }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, isStock ? 'Godown Stock' : 'Transfer History');
      XLSX.writeFile(wb, isStock ? `Godown_Stock_Report_${formatDateForInput(new Date())}.xlsx` : `Stock_Transfer_History_${startDate}_to_${endDate}.xlsx`);
      setIsDownloadModalOpen(false);
      setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'Excel downloaded successfully!' });
    } catch {
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate Excel.' });
    }
  };

  if (loading) return <div className="p-4 text-center">Loading...</div>;

  const hasRowsToDownload = activeTab === 'stock' ? filteredStock.length > 0 : filteredHistory.length > 0;

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16 md:p-6">
      {feedbackModal.isOpen && (
        <Modal type={feedbackModal.type} message={feedbackModal.message}
          onClose={() => setFeedbackModal(p => ({ ...p, isOpen: false }))} showConfirmButton={false} />
      )}
      <DownloadChoiceModal isOpen={isDownloadModalOpen} onClose={() => setIsDownloadModalOpen(false)}
        onDownloadPdf={downloadAsPdf} onDownloadExcel={downloadAsExcel} />
      <GodownModal
        isOpen={isGodownModalOpen}
        onClose={() => setIsGodownModalOpen(false)}
        onSave={data => addGodown(companyId!, data)}
      />
      <TransferStockModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        items={items.map(i => ({ id: i.id, name: i.name, unit: (i as any).unit }))}
        godowns={godowns}
        stockRows={stockRows}
        onSave={data => transferStock(companyId!, data)}
        theme={theme}
      />

      {deleteConfirm && (
        <Modal type={State.WARNING} message="Delete this transfer record? The quantity will be reversed back to its original location."
          onClose={() => setDeleteConfirm(null)}
          showConfirmButton={true}
          onConfirm={async () => {
            try {
              await deleteTransferRecord(companyId!, deleteConfirm);
              setDeleteConfirm(null);
            } catch (err: any) {
              console.error('Failed to delete transfer record:', err);
              setDeleteConfirm(null);
              setFeedbackModal({
                isOpen: true,
                type: State.ERROR,
                message: err?.message || 'Failed to delete transfer record.',
              });
            }
          }}
        />
      )}

      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b mb-2 md:mb-4">
        <BackButton />
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800 md:text-2xl">Stock Transfer</h1>
        <button onClick={() => setShowSearch(true)} className="p-2"><IconSearch /></button>
      </div>

      {showSearch && (
        <div className="flex justify-center mb-2 px-2">
          <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-[#F97316]">
            <input type="text" placeholder="Search by item or godown..." autoFocus
              className="flex-1 text-base font-light p-2 outline-none bg-transparent text-center"
              value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            <button onClick={() => { setSearchQuery(''); setShowSearch(false); }} className="p-1 text-gray-500 hover:text-black">
              <IconClose />
            </button>
          </div>
        </div>
      )}

      {/* TABS + LOCATION FILTER */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 mb-2 md:mb-4">
        <div className="flex flex-1 bg-white rounded-lg shadow-md p-1">
          <button
            onClick={() => setActiveTab('stock')}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${activeTab === 'stock' ? `${accentBg} text-white` : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Current Stock
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition ${activeTab === 'history' ? `${accentBg} text-white` : 'text-gray-600 hover:bg-gray-50'}`}
          >
            Transfer History
          </button>
        </div>
        {activeTab === 'stock' && (
          <select
            value={locationFilter}
            onChange={e => setLocationFilter(e.target.value)}
            className={`w-full md:w-auto border rounded-md p-3 text-sm bg-white shadow-md focus:outline-none focus:ring-2 ${accentRing}`}
          >
            <option value="">All Locations</option>
            <option value={SHOP_ID}>🏪 Shop</option>
            {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </div>

      {/* FILTERS - only relevant for history */}
      {activeTab === 'history' && (
        <ReportDateFilter
          datePreset={datePreset}
          startDate={startDate}
          endDate={endDate}
          onPresetChange={handleDatePreset}
          onStartDateChange={handleStartDateChange}
          onEndDateChange={handleEndDateChange}
          onApply={handleApply}
          theme={theme === 'orange' ? 'catalogue' : undefined}
        />
      )}

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 gap-2 mb-2 md:mb-4 md:gap-4">
        {activeTab === 'stock' ? (
          <>
            <CustomCard variant={CardVariant.Summary} title="Total Stock (all locations)" value={totalStockAllLocations.toLocaleString('en-IN')} />
            <CustomCard variant={CardVariant.Summary} title="Total Locations" value={(godowns.length + 1).toString()} />
          </>
        ) : (
          <>
            <CustomCard variant={CardVariant.Summary} title="Quantity Moved" value={historySummary.totalQty.toLocaleString('en-IN')} />
            <CustomCard variant={CardVariant.Summary} title="Total Entries" value={historySummary.count.toString()} />
          </>
        )}
      </div>

      {/* REPORT DETAILS BAR */}
      <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-2">
        <h2 className="text-lg font-semibold text-gray-700 text-center md:text-left w-full md:w-auto">
          {activeTab === 'stock' ? 'Stock by Godown' : 'Transfer Entries'}
        </h2>
        <div className="flex flex-wrap justify-between w-full md:w-auto md:justify-end gap-2">
          <button onClick={() => setIsGodownModalOpen(true)}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition text-sm">
            + Godown
          </button>
          <button onClick={() => setIsTransferModalOpen(true)}
            className="px-4 py-2 bg-orange-500 text-white font-semibold rounded-md hover:bg-orange-600 transition text-sm">
            + Transfer Stock
          </button>
          <button onClick={() => setIsListVisible(v => !v)}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition text-sm">
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button onClick={() => { !hasRowsToDownload ? setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No data to download.' }) : setIsDownloadModalOpen(true); }}
            className={`px-4 py-2 ${accentBg} ${accentBgHover} text-white font-semibold rounded-md text-sm`}>
            Download Report
          </button>
        </div>
      </div>

      {/* TABLE */}
      {isListVisible && activeTab === 'stock' && (
        <div className="bg-white rounded-lg shadow-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                {([
                  { key: 'godownName' as const, label: 'godown' },
                  { key: 'itemName' as const, label: 'item' },
                  { key: 'quantity' as const, label: 'quantity' },
                ]).map(col => {
                  const isSorted = stockSort.key === col.key;
                  const directionIcon = stockSort.direction === 'asc' ? '∧' : '∨';
                  return (
                    <th key={col.key} onClick={() => handleStockSort(col.key)}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-800 select-none">
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <span className="w-4 inline-block">
                          {isSorted ? (
                            <span className="text-blue-600 text-xs font-bold">{directionIcon}</span>
                          ) : (
                            <span className="text-gray-400 hover:text-gray-600 text-xs inline-flex flex-col leading-3 opacity-50">
                              <span>∧</span><span className="-mt-1">∨</span>
                            </span>
                          )}
                        </span>
                      </span>
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Unit</th>
              </tr>
            </thead>
            <tbody>
              {filteredStock.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-10 text-gray-400">No stock found. Add a godown and record a purchase or transfer.</td></tr>
              ) : filteredStock.map((r, i) => (
                <tr key={`${r.godownId}-${r.itemId}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-gray-700">
                    {r.godownId === SHOP_ID
                      ? <span className={`font-medium ${accentText}`}>🏪 {r.godownName}</span>
                      : r.godownName}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.itemName}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{r.quantity.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3 text-gray-500">{r.unit || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isListVisible && activeTab === 'history' && (
        <div className="bg-white rounded-lg shadow-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                {([
                  { key: 'date' as const, label: 'date' },
                  { key: 'itemName' as const, label: 'item' },
                  { key: 'fromGodownName' as const, label: 'from' },
                  { key: 'toGodownName' as const, label: 'to' },
                  { key: 'quantity' as const, label: 'qty' },
                ]).map(col => {
                  const isSorted = historySort.key === col.key;
                  const directionIcon = historySort.direction === 'asc' ? '∧' : '∨';
                  return (
                    <th key={col.key} onClick={() => handleHistorySort(col.key)}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-800 select-none">
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        <span className="w-4 inline-block">
                          {isSorted ? (
                            <span className="text-blue-600 text-xs font-bold">{directionIcon}</span>
                          ) : (
                            <span className="text-gray-400 hover:text-gray-600 text-xs inline-flex flex-col leading-3 opacity-50">
                              <span>∧</span><span className="-mt-1">∨</span>
                            </span>
                          )}
                        </span>
                      </span>
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">No transfers found for selected period.</td></tr>
              ) : filteredHistory.map((t, i) => (
                <tr key={t.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-4 py-3 text-gray-700">{formatDate(t.date)}</td>
                  <td className="px-4 py-3 text-gray-700">{t.itemName}</td>
                  <td className="px-4 py-3 text-gray-700">{t.fromGodownName || '-'}</td>
                  <td className="px-4 py-3 text-gray-700">{t.toGodownName}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{t.quantity.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${t.type === 'purchase-in' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                      {t.type === 'purchase-in' ? 'Purchase' : t.type === 'transfer' ? 'Transfer' : 'Adjustment'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {t.type !== 'purchase-in' && (
                      <button onClick={() => setDeleteConfirm(t.id)} className="text-red-400 hover:text-red-600 text-xs font-medium">Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default StockTransferReportPage;