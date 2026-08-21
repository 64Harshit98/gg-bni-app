import React, { useMemo, useState } from 'react';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { useAuth } from '../../context/auth-context';
import {
  Search,
  AlertTriangle,
  ShoppingCart,
  ArrowUpDown,
  Loader2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';

import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';

import useRestockReport from './RestockReportComponents/useRestockReport';
import {
  filterBySearch,
  calculateSummary,
  type ItemDoc,
} from './RestockReportComponents/restockReport.utils';
import BackButton from '../../Components/BackButton';

const RestockReportPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { items: inventoryItems, loading, error } = useRestockReport();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [activeFilter, setActiveFilter] = useState<'all' | 'urgent' | 'low'>('all');
  // --- Report Details state (same pattern as PurchaseReport) ---
  const [isListVisible, setIsListVisible] = useState(true);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
  });

  const displayedItems = useMemo(() => {
    const filtered = filterBySearch(inventoryItems, searchTerm).filter((item) => {
      const stock = item.stock ?? 0;
      if (activeFilter === 'urgent') return stock <= 0;
      if (activeFilter === 'low') return stock > 0 && stock < item.restockQuantity;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const stockA = a.stock ?? 0;
      const stockB = b.stock ?? 0;
      if (stockA <= 0 && stockB > 0) return -1;
      if (stockB <= 0 && stockA > 0) return 1;
      return sortOrder === 'asc' ? stockA - stockB : stockB - stockA;
    });
  }, [inventoryItems, searchTerm, sortOrder, activeFilter]);

  const { totalItemsToRestock, outOfStockCount, estimatedCostToRestock } =
    useMemo(() => calculateSummary(displayedItems), [displayedItems]);

  const getStatusBadge = (stock: number) => {
    if (stock <= 0) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          Out of stock
        </span>
      );
    }
    if (stock <= 5) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
          Low stock
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium bg-green-100 text-green-800 border border-green-200">
        In stock
      </span>
    );
  };
  /* ---------- PDF DOWNLOAD ---------- */
  const downloadAsPdf = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    let base64Logo: string | null = null;
    try {
      base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
    } catch {
      // Continue without logo
    }

    // --- 1. BRAND ACCENT BAR ---
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageWidth, 6, 'F');

    // --- 2. COMPANY LOGO (top-right) ---
    if (base64Logo) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const logoWidth = 20;
          const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
          doc.addImage(base64Logo!, 'PNG', pageWidth - logoWidth - 14, 10, logoWidth, logoHeight);
          resolve();
        };
        img.onerror = () => resolve();
        img.src = base64Logo!;
      });
    }

    // ===== CLEAN GENERATION TAG =====

    const now = new Date();

    const generatedAt = now.toLocaleString('en-IN', {

      day: '2-digit',

      month: '2-digit',

      year: 'numeric',

      hour: '2-digit',

      minute: '2-digit'

    });

    const margin = 14;

    const tagText = `Generated using SELLAR • ${generatedAt}`;

    doc.setFont("helvetica", "bold");

    doc.setFontSize(8);

    const textWidth = doc.getTextWidth(tagText);

    const paddingX = 2;

    const boxWidth = textWidth + paddingX * 2;

    const boxHeight = 5;

    const boxX = pageWidth - margin - boxWidth;

    const boxY = 10;

    // background

    doc.setFillColor(245, 245, 245);

    doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

    // text

    doc.setTextColor(80, 80, 80);

    doc.text(tagText, boxX + paddingX, boxY + 3.5);

    // reset

    doc.setTextColor(0, 0, 0);

    // --- 3. HEADER SECTION ---
    doc.setFontSize(22);
    doc.setTextColor(17, 24, 39); // gray-900
    doc.setFont('helvetica', 'bold');
    doc.text('Restock Report', 14, 24);

    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128); // gray-500
    doc.setFont('helvetica', 'normal');

    const generationDate = new Date().toLocaleDateString('en-IN', {
      year: 'numeric', month: 'short', day: 'numeric',
    });

    const activeFilterLabel =
      activeFilter === 'urgent' ? 'Urgent items only' :
        activeFilter === 'low' ? 'Low stock items only' :
          'All items';

    const subtitleText = `Generated: ${generationDate}   |   Filter: ${activeFilterLabel}   |   Items: ${displayedItems.length}`;
    doc.text(subtitleText, 14, 31);

    // --- 4. TABLE ---
    autoTable(doc, {
      startY: 38,
      head: [['PRODUCT', 'STOCK', 'MIN. NEEDED', 'UNITS SHORT', 'STATUS']],
      body: displayedItems.map((item) => {
        const currentStock = item.stock ?? 0;
        const deficit = Math.max((item.restockQuantity ?? 0) - currentStock, 0);
        const status =
          currentStock <= 0 ? 'Urgent' :
            currentStock <= 5 ? 'Low Stock' :
              'In Stock';
        return [
          item.name,
          currentStock.toString(),
          (item.restockQuantity ?? 0).toString(),
          deficit > 0 ? `-${deficit}` : '-',
          status,
        ];
      }),
      foot: [
        [
          `Total: ${displayedItems.length} items`,
          '',
          '',
          '',
          `Out of stock: ${outOfStockCount}`,
        ],
      ],
      showFoot: 'lastPage',
      theme: 'plain',
      styles: {
        font: 'helvetica',
        cellPadding: 7,
        fontSize: 10,
        textColor: [55, 65, 81], // gray-700
      },
      headStyles: {
        fillColor: [249, 250, 251], // gray-50
        textColor: [17, 24, 39],   // gray-900
        fontStyle: 'bold',
        halign: 'left',
        lineWidth: { top: 1, bottom: 1 },
        lineColor: [229, 231, 235], // gray-200
      },
      footStyles: {
        fillColor: [255, 255, 255],
        textColor: [17, 24, 39],
        fontStyle: 'bold',
        halign: 'left',
        lineWidth: { top: 1, bottom: 2 },
        lineColor: [17, 24, 39],
      },
      alternateRowStyles: {
        fillColor: [252, 252, 252],
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 70 },  // PRODUCT
        1: { halign: 'left', cellWidth: 25 },  // STOCK
        2: { halign: 'left', cellWidth: 35 },  // MIN. NEEDED
        3: { halign: 'left', cellWidth: 30 },  // UNITS SHORT
        4: { halign: 'left', cellWidth: 30 },  // STATUS
      },
      didParseCell: function (data) {
        // Color-code the STATUS column
        if (data.section === 'body' && data.column.index === 4) {
          const val = String(data.cell.raw);
          if (val === 'Urgent') {
            data.cell.styles.textColor = [220, 38, 38];   // red-600
            data.cell.styles.fontStyle = 'bold';
          } else if (val === 'Low Stock') {
            data.cell.styles.textColor = [234, 88, 12];   // orange-600
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [22, 163, 74];   // green-600
          }
        }
        // Color-code UNITS SHORT column (negatives in red)
        if (data.section === 'body' && data.column.index === 3) {
          const val = String(data.cell.raw);
          if (val.startsWith('-')) {
            data.cell.styles.textColor = [220, 38, 38];   // red-600
            data.cell.styles.fontStyle = 'bold';
          }
        }
        // Align footer cells left
        if (data.section === 'foot') {
          data.cell.styles.halign = 'left';
        }
      },
      didDrawPage: function () {
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(9);
        doc.setTextColor(156, 163, 175); // gray-400
        doc.text(
          `Page ${pageCount}`,
          pageWidth - 14,
          pageHeight - 10,
          { align: 'right' }
        );
      },
    });

    doc.save(`restock_report_${new Date().toISOString().split('T')[0]}.pdf`);
    setIsDownloadModalOpen(false);
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

      const activeFilterLabel =
        activeFilter === 'urgent' ? 'Urgent items only' :
          activeFilter === 'low' ? 'Low stock items only' :
            'All items';

      // ── COLUMN DEFINITIONS ─────────────────────────────────────────
      const COLS = [
        { header: '#', width: 6 },
        { header: 'Product', width: 30 },
        { header: 'Stock', width: 12 },
        { header: 'Min. Needed', width: 16 },
        { header: 'Units Short', width: 16 },
        { header: 'Status', width: 16 },
      ];
      const colCount = COLS.length;

      // Row layout:
      // 0  → Title  (merged)
      // 1  → Meta   (merged)
      // 2  → blank spacer
      // 3  → Summary label (merged)
      // 4  → Summary values
      // 5  → blank spacer
      // 6  → Column headers
      // 7+ → Data rows
      // Last → Totals footer

      const dataStartRow = 7;
      const totalRows = dataStartRow + displayedItems.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = 'Restock Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   Filter: ${activeFilterLabel}   |   Items: ${displayedItems.length}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Need to Restock: ${totalItemsToRestock}   |   Urgent: ${outOfStockCount}   |   Est. Cost: ₹${estimatedCostToRestock.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      displayedItems.forEach((item, idx) => {
        const r = dataStartRow + idx;
        const currentStock = item.stock ?? 0;
        const deficit = Math.max((item.restockQuantity ?? 0) - currentStock, 0);
        const status =
          currentStock <= 0 ? 'Urgent' :
            currentStock <= 5 ? 'Low Stock' :
              'In Stock';

        aoa[r][0] = idx + 1;
        aoa[r][1] = item.name;
        aoa[r][2] = currentStock;
        aoa[r][3] = item.restockQuantity ?? 0;
        aoa[r][4] = deficit > 0 ? -deficit : 0;
        aoa[r][5] = status;
      });

      // Footer row
      const footerRow = dataStartRow + displayedItems.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = `${displayedItems.length} items`;
      aoa[footerRow][2] = '';
      aoa[footerRow][3] = '';
      aoa[footerRow][4] = '';
      aoa[footerRow][5] = `Out of stock: ${outOfStockCount}`;

      // ── BUILD WORKSHEET ────────────────────────────────────────────
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 36 }, // 0 title
        { hpt: 20 }, // 1 meta
        { hpt: 8 }, // 2 spacer
        { hpt: 18 }, // 3 summary label
        { hpt: 22 }, // 4 summary values
        { hpt: 8 }, // 5 spacer
        { hpt: 28 }, // 6 headers
        ...displayedItems.map(() => ({ hpt: 20 })),
        { hpt: 24 }, // footer
      ];

      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
        { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 4 } },
      ];

      const style = (addr: string, st: any) => {
        if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
        worksheet[addr].s = st;
      };

      // ── APPLY STYLES ───────────────────────────────────────────────

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
        { horizontal: 'center', vertical: 'center' },
        bblr,
      ));

      // Column headers (row 6)
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
      displayedItems.forEach((item, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');
        const currentStock = item.stock ?? 0;

        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isNumeric = ci >= 2 && ci <= 4;

          // Status column color coding
          let fontColor = '1E293B';
          if (ci === 5) {
            const status = aoa[r][5];
            if (status === 'Urgent') fontColor = 'DC2626';
            else if (status === 'Low Stock') fontColor = 'EA580C';
            else fontColor = '16A34A';
          }
          // Units Short negative → red
          if (ci === 4 && typeof aoa[r][4] === 'number' && aoa[r][4] < 0) {
            fontColor = 'DC2626';
          }

          style(addr, s(
            { sz: 9, color: { rgb: fontColor }, bold: (ci === 5 && currentStock <= 5) },
            rowBg,
            { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
            bblr,
          ));
        }
      });

      // Footer row
      for (let ci = 0; ci < colCount; ci++) {
        const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: '1E293B' } },
          solidFill('E2E8F0'),
          { horizontal: ci <= 1 ? 'left' : 'center', vertical: 'center' },
          {
            top: { style: 'medium', color: { rgb: '1E293B' } },
            bottom: { style: 'medium', color: { rgb: '1E293B' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
        ));
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Restock Report');
      XLSX.writeFile(workbook, `Restock-Report-${new Date().toISOString().split('T')[0]}.xlsx`);

      setIsDownloadModalOpen(false);
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

  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans text-gray-800">
      {/* Feedback modal */}
      {feedbackModal.isOpen && (
        <Modal
          type={feedbackModal.type}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
          showConfirmButton={false}
        />
      )}

      {/* Download choice modal */}
      <DownloadChoiceModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        onDownloadPdf={downloadAsPdf}
        onDownloadExcel={downloadAsExcel}
      />

      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <BackButton />
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Restock Report
        </h1>
      </div>

      {/*SUMMARY CARDS*/}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        {/* Items to Restock */}
        <div className="bg-white p-5 rounded-sm border border-gray-200 shadow-sm relative">
          <p className="text-sm font-medium text-gray-500">Need to Restock</p>
          <p className="text-xs text-gray-400">(Below restock quantity)</p>
          <h3 className="absolute bottom-2 left-4 p-3 text-2xl font-bold text-gray-900">
            {loading ? '-' : totalItemsToRestock}
          </h3>
          <div className="absolute bottom-4 right-4 p-3 bg-blue-50 rounded-full text-blue-600">
            <ShoppingCart size={22} />
          </div>
        </div>

        {/* (Out of Stock) */}
        <div className="bg-white p-5 rounded-sm border border-gray-200 shadow-sm relative">
          <p className="text-sm font-medium text-gray-500">Urgent – Order Now</p>
          <p className="text-xs text-gray-400">(Zero or negative inventory)</p>
          <h3 className="text-2xl font-bold text-red-600 mt-5">
            {loading ? '-' : outOfStockCount}
          </h3>
          <div className="absolute bottom-4 right-4 p-3 bg-red-50 rounded-full text-red-600">
            <AlertTriangle size={22} />
          </div>
        </div>

        {/*Est. Restock Cost*/}
        <div className="col-span-2 md:col-span-1 bg-white p-5 rounded-sm border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Est. Restock Cost</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">
              {loading ? '-' : `₹ ${estimatedCostToRestock.toLocaleString()}`}
            </h3>
          </div>
          <div className="p-3 bg-green-50 rounded-full text-green-600">
            <span className="text-xl font-bold">₹</span>
          </div>
        </div>
      </div>

      {/* SEARCH */}
      <div className="bg-white p-4 rounded-t-xl border-b border-gray-200 shadow-sm flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'urgent', 'low'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-2 rounded-sm text-sm font-medium border transition ${activeFilter === f
                ? 'bg-blue-600 text-white border-gray-800'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
            >
              {f === 'all' ? 'All' : f === 'urgent' ? 'Urgent' : 'Low stock'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white p-2 rounded-sm shadow-md mb-2 flex flex-col md:flex-row md:justify-between md:items-center gap-1">
        <h2 className="text-lg font-semibold text-gray-700 text-center md:text-left">
          Report Details
        </h2>
        <div className="flex items-stretch gap-3">
          <button
            onClick={() => setIsListVisible((prev) => !prev)}
            className="flex-1 md:flex-none px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-sm hover:bg-slate-300 transition"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button
            onClick={() => {
              if (displayedItems.length === 0) {
                setFeedbackModal({
                  isOpen: true,
                  type: State.INFO,
                  message: 'No data available to download.',
                });
              } else {
                setIsDownloadModalOpen(true);
              }
            }}
            disabled={displayedItems.length === 0}
            className="flex-1 md:flex-none px-4 py-0.5 bg-blue-600 text-white font-semibold rounded-sm shadow-sm hover:bg-blue-700 transition"
          >
            Download Report
          </button>
        </div>
      </div>

      {/* TABLE — shown / hidden by isListVisible */}
      {isListVisible && (
        <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">Product Name</th>
                  <th className="p-4 font-semibold text-center">
                    <div
                      onClick={() =>
                        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                      }
                      className="flex items-center justify-center gap-1 cursor-pointer hover:text-gray-700"
                    >
                      Current Stock
                      <ArrowUpDown
                        size={14}
                        className={sortOrder === 'asc' ? 'rotate-180' : ''}
                      />
                    </div>
                  </th>
                  <th className="p-4 font-semibold text-center">Min. Stock Needed</th>
                  <th className="p-4 font-semibold text-center">Units Short</th>
                  <th className="p-4 font-semibold text-center">Status</th>
                  <th className="p-4 font-semibold text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="animate-spin text-blue-600" size={32} />
                        <p>Loading inventory...</p>
                      </div>
                    </td>
                  </tr>
                ) : displayedItems.length > 0 ? (
                  displayedItems.map((item: ItemDoc) => {
                    const currentStock = item.stock ?? 0;
                    const deficit = Math.max(
                      (item.restockQuantity ?? 0) - currentStock,
                      0,
                    );

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="p-4">
                          <div className="font-medium text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-500">
                            ID: {item.id.slice(0, 8)}
                          </div>
                        </td>

                        <td className="p-4 text-center font-medium">
                          <span className={currentStock <= 0 ? 'text-red-600' : 'text-gray-900'}>
                            {currentStock}
                          </span>
                        </td>

                        <td className="p-4 text-center text-sm text-gray-500">
                          {item.restockQuantity}
                        </td>

                        <td className="p-4 text-center text-sm font-medium text-red-600">
                          {deficit > 0 ? `-${deficit}` : '-'}
                        </td>

                        <td className="p-4 text-center">{getStatusBadge(currentStock)}</td>

                        <td className="p-4 text-right">
                          <span
                            className="text-sm font-medium text-gray-400 cursor-not-allowed select-none"
                            title="Coming soon"
                          >
                            Order
                          </span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      No items currently need restocking. Good job! 👍
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
            <div>Showing {displayedItems.length} items</div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                disabled
              >
                Prev
              </button>
              <button
                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                disabled
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RestockReportPage;