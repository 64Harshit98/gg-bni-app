import React, { useMemo, useState } from 'react';
import FilterSelect from './SalesReportComponents/FilterSelect';
import {
  formatDate,
  formatDateForInput,
} from './SalesReportComponents/salesReport.utils';
import useSalesReport from './SalesReportComponents/useSalesReport';
import { type SaleRecord } from './SalesReportComponents/salesReport.utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';

import { CustomCard } from '../../Components/CustomCard';
import { CardVariant, State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';

import { IconClose, IconSearch } from '../../constants/Icons';
import { getSalesColumns } from '../../constants/TableColoumns';
import ReportDetails from './SalesReportComponents/ReportDetails';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';
import { useAuth } from '../../context/auth-context';
import BackButton from '../../Components/BackButton';


const SalesReport: React.FC = () => {
  useAuth();

  const {
    setDatePreset,
    setCustomStartDate,
    setCustomEndDate,
    customStartDate,
    customEndDate,
    setAppliedFilters,
    sortConfig,
    setSortConfig,
    appliedFilters,
    sales,
    isLoading,
    error,
    datePreset,
    isListVisible,
    setIsListVisible,
    authLoading,
  } = useSalesReport();

  /* ---------- LOCAL STATES (ADDED) ---------- */
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
  });

  /* ---------- DATE PRESET ---------- */
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const start = new Date();
    const end = new Date();

    switch (preset) {
      case 'today':
        break;
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        break;
      case 'last7':
        start.setDate(start.getDate() - 6);
        break;
      case 'last30':
        start.setDate(start.getDate() - 29);
        break;
      case 'custom':
        return;
    }

    setCustomStartDate(formatDateForInput(start));
    setCustomEndDate(formatDateForInput(end));
  };

  const handleApplyFilters = () => {
    const start = customStartDate ? new Date(customStartDate) : new Date(0);
    start.setHours(0, 0, 0, 0);

    const end = customEndDate ? new Date(customEndDate) : new Date();
    end.setHours(23, 59, 59, 999);

    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  };

  /* ---------- SORT ---------- */
  const handleSort = (key: keyof SaleRecord) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  /* ---------- FILTER + SUMMARY ---------- */
  const { filteredSales, summary } = useMemo(() => {
    if (!appliedFilters) {
      return {
        filteredSales: [],
        summary: {
          totalSales: 0,
          totalTransactions: 0,
          totalItemsSold: 0,
          averageSaleValue: 0,
        },
      };
    }

    const newFilteredSales = sales.filter((sale) => {
      const matchesDate =
        sale.createdAt >= appliedFilters.start &&
        sale.createdAt <= appliedFilters.end;

      const matchesSearch =
        !searchQuery ||
        (sale.partyName &&
          sale.partyName.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesDate && matchesSearch;
    });

    newFilteredSales.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;

      if (key === 'items') {
        const totalItemsA = a.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        const totalItemsB = b.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        return (totalItemsA - totalItemsB) * direction;
      }

      const valA = a[key] ?? '';
      const valB = b[key] ?? '';

      if (typeof valA === 'string' && typeof valB === 'string')
        return valA.localeCompare(valB) * direction;
      if (typeof valA === 'number' && typeof valB === 'number')
        return (valA - valB) * direction;

      return 0;
    });

    const totalSales = newFilteredSales.reduce(
      (acc, sale) => acc + sale.totalAmount,
      0,
    );

    const totalItemsSold = newFilteredSales.reduce(
      (acc, sale) => acc + sale.items.reduce((iAcc, i) => iAcc + i.quantity, 0),
      0,
    );

    const totalTransactions = newFilteredSales.length;
    const averageSaleValue =
      totalTransactions > 0 ? totalSales / totalTransactions : 0;

    return {
      filteredSales: newFilteredSales,
      summary: {
        totalSales,
        totalTransactions,
        totalItemsSold,
        averageSaleValue,
      },
    };
  }, [appliedFilters, sales, sortConfig, searchQuery]);

  const downloadAsPdf = () => {
    if (!appliedFilters) return;

    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // --- 1. BRAND ACCENT BAR ---
      // Uses the #F97316 orange from your UI
      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageWidth, 6, 'F');

      // --- 2. HEADER SECTION ---
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39); // gray-900
      doc.setFont('helvetica', 'bold');
      doc.text('Completed Orders Report', 14, 24);

      // Dynamic Subtitle with Date Range
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128); // gray-500
      doc.setFont('helvetica', 'normal');

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

      const subtitleText = `Generated: ${generationDate}   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`;
      doc.text(subtitleText, 14, 31);

      // --- 3. AUTOTABLE GENERATION ---
      autoTable(doc, {
        startY: 38,
        head: [['DATE', 'CUSTOMER', 'ITEMS', 'AMOUNT (Rs.)']],
        body: filteredSales.map((sale) => {
          // Clean up customer name casing
          const formattedCustomer = sale.partyName
            ? sale.partyName.charAt(0).toUpperCase() + sale.partyName.slice(1).toLowerCase()
            : 'N/A';

          // Calculate total items
          const totalItems = sale.items.reduce((sum, i) => sum + i.quantity, 0);

          return [
            formatDate(sale.createdAt),
            formattedCustomer,
            totalItems.toString(),
            // Strict 2-decimal financial formatting
            sale.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ];
        }),
        foot: [
          [
            'TOTAL',
            '-',
            summary.totalItemsSold.toString(),
            summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ]
        ],
        theme: 'plain',
        styles: {
          font: 'helvetica',
          cellPadding: 7,
          fontSize: 10,
          textColor: [55, 65, 81], // gray-700
        },
        headStyles: {
          fillColor: [249, 250, 251], // gray-50
          textColor: [17, 24, 39], // gray-900
          fontStyle: 'bold',
          halign: 'left',
          lineWidth: { top: 1, bottom: 1 },
          lineColor: [229, 231, 235], // gray-200
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [17, 24, 39], // gray-900
          fontStyle: 'bold',
          halign: 'left',
          lineWidth: { top: 1, bottom: 2 }, // Thicker bottom line for totals
          lineColor: [17, 24, 39],
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252], // Subtle zebra striping
        },
        columnStyles: {
          0: { halign: 'left', cellWidth: 40 },   // DATE
          1: { halign: 'left', cellWidth: 60 },   // CUSTOMER
          2: { halign: 'left', cellWidth: 40 },   // ITEMS (aligned with header)
          3: { halign: 'left', cellWidth: 50 },   // AMOUNT (shifted left)
        },
        // --- 4. CONDITIONAL FORMATTING & HEADER ALIGNMENT ---
        didParseCell: function (data) {
          // If the header row and CUSTOMER column, align left
          if (data.section === 'head' && data.column.index === 1) {
            data.cell.styles.halign = 'left';
          }
          // If the header row and ITEMS column, align left
          if (data.section === 'head' && data.column.index === 2) {
            data.cell.styles.halign = 'left';
          }
          // If the header row and AMOUNT column, align left
          if (data.section === 'head' && data.column.index === 3) {
            data.cell.styles.halign = 'left';
          }
          // Highlight negative amounts (e.g., refunds) in red
          if ((data.section === 'body' || data.section === 'foot') && data.column.index === 3) {
            const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, ''));
            if (rawVal < 0) {
              data.cell.styles.textColor = [220, 38, 38]; // red-600
              data.cell.styles.fontStyle = 'bold';
            }
          }
          // Fix alignment for the "TOTAL" label in the footer
          if (data.section === 'foot' && data.column.index === 0) {
            data.cell.styles.halign = 'left';
          }
          // Ensure ITEMS and AMOUNT in TOTAL row align exactly like columns
          if (data.section === 'foot' && data.column.index === 2) {
            data.cell.styles.halign = 'left';
          }
          if (data.section === 'foot' && data.column.index === 3) {
            data.cell.styles.halign = 'left';
          }
        },
        // --- 5. PAGINATION FOOTER ---
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

      doc.save(`Orders_Report_${formatDateForInput(new Date())}.pdf`);
      setIsDownloadModalOpen(false);

    } catch (err) {
      console.error('PDF Generation Error:', err);
    }
  };

  /* ---------- EXCEL DOWNLOAD (NEW) ---------- */
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
        { header: 'Party Name', width: 28 },
        { header: 'Items Sold', width: 13 },
        { header: 'Amount (₹)', width: 18 },
        { header: '', width: 18 },
      ];
      const colCount = COLS.length;

      // ── SUMMARY ROWS ─────────────────────────────────────────────────────
      // Row 0  → Title (merged)
      // Row 1  → Sub-title / meta (merged)
      // Row 2  → blank spacer
      // Row 3  → Summary label row  (merged)
      // Row 4  → Summary values     (merged)
      // Row 5  → blank spacer
      // Row 6  → Column headers
      // Row 7+ → Data rows
      // Last   → Totals footer

      const dataStartRow = 7;
      const totalRows = dataStartRow + filteredSales.length + 1; // +1 for footer
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = 'Sales Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodText}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (spread across columns)
      aoa[4][0] = `Total Bills`;
      aoa[4][1] = summary.totalTransactions;
      aoa[4][2] = `Items Sold`;
      aoa[4][3] = summary.totalItemsSold;
      aoa[4][4] = `Total Sales`;
      aoa[4][5] = summary.totalSales; // raw number so Excel formats it

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      filteredSales.forEach((sale, idx) => {
        const r = dataStartRow + idx;
        aoa[r][0] = idx + 1;
        aoa[r][1] = formatDate(sale.createdAt);
        aoa[r][2] = sale.partyName
          ? sale.partyName.charAt(0).toUpperCase() + sale.partyName.slice(1).toLowerCase()
          : 'N/A';
        aoa[r][3] = sale.items.reduce((sum, i) => sum + i.quantity, 0);
        aoa[r][4] = sale.totalAmount;
      });

      // Footer row
      const footerRow = dataStartRow + filteredSales.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = '';
      aoa[footerRow][2] = '';
      aoa[footerRow][3] = summary.totalItemsSold;
      aoa[footerRow][4] = summary.totalSales;

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
        ...filteredSales.map(() => ({ hpt: 20 })),
        { hpt: 24 }, // footer
      ];

      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
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

      // Summary value cells
      const summaryBg = solidFill('F0FDF4');
      const summaryLabelStyle = s({ sz: 9, bold: true, color: { rgb: '15803D' } }, summaryBg, { horizontal: 'left', vertical: 'center' }, bblr);
      const summaryValStyle = s({ sz: 11, bold: true, color: { rgb: '166534' } }, summaryBg, { horizontal: 'center', vertical: 'center' }, bblr);
      const summaryTotalStyle = s({ sz: 10, bold: true, color: { rgb: '166534' } }, solidFill('DCFCE7'), { horizontal: 'center', vertical: 'center' }, bblr);

      style('A5', summaryLabelStyle);
      style('B5', summaryValStyle);
      style('C5', summaryLabelStyle);
      style('D5', summaryValStyle);
      style('E5', summaryLabelStyle);  // "Total Sales" label
      style('F5', summaryTotalStyle);  // actual number value

      // Also format F5 as a number with ₹ format
      const f5Addr = 'F5';
      if (!ws[f5Addr]) ws[f5Addr] = { t: 'n', v: summary.totalSales };
      ws[f5Addr].t = 'n';
      ws[f5Addr].z = '₹#,##0.00';

      // Column headers (row index 6)
      const headerColors = ['1E40AF', '1E40AF', '1E40AF', '1E40AF', '1E40AF'];
      COLS.forEach((_c, i) => {
        if (i >= 5) return; // skip the extra helper column
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          solidFill(headerColors[i]),
          { horizontal: i <= 1 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      // Data rows
      filteredSales.forEach((sale, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');
        const isNegative = sale.totalAmount < 0;

        [0, 1, 2, 3, 4].forEach(ci => {
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
          // Format amount cell as number
          if (isAmount && ws[addr]) {
            ws[addr].t = 'n';
            ws[addr].z = '₹#,##0.00';
          }
        });
      });

      // Footer row
      [0, 1, 2, 3, 4].forEach(ci => {
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
      XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
      XLSX.writeFile(wb, `Sales_Report_${formatDateForInput(new Date())}.xlsx`);

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

  const tableColumns = useMemo(() => getSalesColumns(), []);

  /* ---------- LOAD STATES ---------- */
  if (isLoading || authLoading)
    return <div className="p-4 text-center">Loading...</div>;
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16 md:p-6 md:pb-16">
      {feedbackModal.isOpen && (
        <Modal
          type={feedbackModal.type}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
          showConfirmButton={false}
        />
      )}

      <DownloadChoiceModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        onDownloadPdf={downloadAsPdf}
        onDownloadExcel={downloadAsExcel}
      />

      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b mb-2 md:mb-4">
        <button onClick={() => setShowSearch(true)} className="p-2">
          <IconSearch />
        </button>
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800 md:text-2xl">
          Sales Report
        </h1>
      </div>

      {showSearch && (
        <div className="flex justify-center mb-2 px-2">
          <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-[#F97316]">
            <input
              type="text"
              placeholder="Search by Customer..."
              className="flex-1 text-base font-light p-2 outline-none bg-transparent text-center"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <button
              onClick={() => {
                setSearchQuery('');
                setShowSearch(false);
              }}
              className="p-1 text-gray-500 hover:text-black"
            >
              <IconClose />
            </button>
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div className="bg-white p-2 rounded-lg shadow-md mb-2 md:p-5 md:mb-4 md:rounded-xl">

        {/* Row 1 (md+): preset selector alone */}
        {/* Row 2 (md+): date inputs */}
        {/* Mobile: all stacked as before via grid-cols-1 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:grid-cols-1 md:gap-3">

          {/* Preset selector — full width on md+ */}
          <div className="sm:col-span-1 md:col-span-1">
            <FilterSelect
              value={datePreset}
              onChange={(e) => handleDatePresetChange(e.target.value)}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="custom">Custom</option>
            </FilterSelect>
          </div>

          {/* Date inputs */}
          <div className="grid grid-cols-2 gap-4 sm:col-span-2 md:col-span-1 md:grid-cols-2 md:gap-4">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => {
                setCustomStartDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-md md:p-2.5"
            />
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => {
                setCustomEndDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-md md:p-2.5"
            />
          </div>
        </div>

        {/* Apply button — edge-to-edge on mobile, constrained on md+ */}
        <div className="mt-2 md:mt-3 md:flex md:justify-center">
          <button
            onClick={handleApplyFilters}
            className="w-full mt-0 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 md:w-auto md:px-10 md:py-2"
          >
            Apply
          </button>
        </div>
      </div>

      {/* SUMMARY — 2 cols on mobile, 4 cols on md+ */}
      <div className="grid grid-cols-2 gap-2 mb-2 md:grid-cols-4 md:gap-4 md:mb-4">
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Sales"
          value={`₹${Math.round(summary.totalSales).toLocaleString('en-IN')}`}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Bills"
          value={summary.totalTransactions.toString()}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Items Sold"
          value={summary.totalItemsSold.toString()}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Avg Sale Value"
          value={`₹${Math.round(summary.averageSaleValue).toLocaleString(
            'en-IN',
          )}`}
        />
      </div>

      {/* REPORT DETAILS */}
      <ReportDetails
        downloadAsPdf={() => {
          if (filteredSales.length === 0) {
            setFeedbackModal({
              isOpen: true,
              type: State.INFO,
              message: 'No data available to download.',
            });
          } else {
            setIsDownloadModalOpen(true);
          }
        }}
        filteredSales={filteredSales}
        isListVisible={isListVisible}
        setIsListVisible={setIsListVisible}
      />

      {isListVisible && (
        <CustomTable<SaleRecord>
          data={filteredSales}
          columns={tableColumns}
          keyExtractor={(sale) => sale.id}
          sortConfig={sortConfig}
          onSort={handleSort}
          emptyMessage="No sales found for the selected period."
        />
      )}
    </div>
  );
};

export default SalesReport;