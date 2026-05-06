import React, { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant, State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import { IconClose, IconSearch } from '../../constants/Icons';
import { getPnlColumns } from '../../constants/TableColoumns';
import FilterSelect from './SalesReportComponents/FilterSelect';
import { usePnlReport, usePnlStates } from './PNLReportComponents/usePnlReport';
import { type TransactionDetail } from './PNLReportComponents/pnlReport.utils';
import { formatDate } from './PNLReportComponents/pnlReport.utils';
import { handleDatePresetChange } from './PNLReportComponents/pnlReport.utils';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';

const PnlReportPage: React.FC = () => {
  const {
    navigate,
    currentUser,
    authLoading,
    datePreset,
    setDatePreset,
    startDate,
    endDate,
    appliedFilters,
    setAppliedFilters,
    isListVisible,
    setIsListVisible,
    sortConfig,
    setSortConfig,
    setStartDate,
    setEndDate,
  } = usePnlStates();

  const {
    sales,
    loading: dataLoading,
    error,
  } = usePnlReport(currentUser?.companyId);

  /* ---------- LOCAL STATES (ADDED) ---------- */
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
  });

  /* ---------- FILTER + SUMMARY ---------- */
  const { pnlSummary, filteredTransactions } = useMemo(() => {
    const startTimestamp = appliedFilters?.start
      ? new Date(appliedFilters.start).getTime()
      : 0;
    const endTimestamp = appliedFilters?.end
      ? new Date(appliedFilters.end).getTime()
      : Infinity;

    const filteredSales = sales.filter(
      (s) =>
        s.createdAt.getTime() >= startTimestamp &&
        s.createdAt.getTime() <= endTimestamp,
    );

    // const totalRevenue = filteredSales.reduce(
    //   (sum, sale) => sum + sale.totalAmount,
    //   0,
    // );
    // const totalCostOfGoodsSold = filteredSales.reduce(
    //   (sum, sale) => sum + (sale.costOfGoodsSold || 0),
    //   0,
    // );


    const salesTransactions: TransactionDetail[] = filteredSales.map((s) => {
      const cogs = s.costOfGoodsSold ?? 0;
      // If cogs is 0 but totalAmount > 0, we know there's a data entry error
      const isMissingCost = cogs === 0 && s.totalAmount > 0;

      return {
        ...s,
        type: 'Revenue' as const,
        costOfGoodsSold: cogs,
        profit: s.totalAmount - cogs,
        isWarning: isMissingCost // Use this to style your table row later
      };
    });

    const searchTerm = searchQuery.trim().toLowerCase();
    const invoiceFilteredTransactions = searchTerm
      ? salesTransactions.filter((t) =>
          (t.invoiceNumber || '').toLowerCase().includes(searchTerm),
        )
      : salesTransactions;

    invoiceFilteredTransactions.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = (a[key] as any) ?? (typeof a[key] === 'number' ? 0 : '');
      const valB = (b[key] as any) ?? (typeof b[key] === 'number' ? 0 : '');

      if (valA instanceof Date && valB instanceof Date) {
        return (valA.getTime() - valB.getTime()) * direction;
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * direction;
      }
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * direction;
      }
      return 0;
    });

    return {
      pnlSummary: {
        totalRevenue: invoiceFilteredTransactions.reduce(
          (sum, t) => sum + t.totalAmount,
          0,
        ),
        totalCost: invoiceFilteredTransactions.reduce(
          (sum, t) => sum + (t.costOfGoodsSold || 0),
          0,
        ),
        grossProfit: invoiceFilteredTransactions.reduce(
          (sum, t) => sum + (t.profit || 0),
          0,
        ),
        grossProfitPercentage:
          invoiceFilteredTransactions.reduce((sum, t) => sum + t.totalAmount, 0) > 0
            ? (invoiceFilteredTransactions.reduce(
                (sum, t) => sum + (t.profit || 0),
                0,
              ) /
                invoiceFilteredTransactions.reduce(
                  (sum, t) => sum + t.totalAmount,
                  0,
                )) *
              100
            : 0,
      },
      filteredTransactions: invoiceFilteredTransactions,
    };
  }, [sales, appliedFilters, sortConfig, searchQuery]);

  /* ---------- SORT ---------- */
  const handleSort = (key: keyof TransactionDetail) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  /* ---------- APPLY FILTER ---------- */
  const handleApplyFilters = () => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    setAppliedFilters({
      start: start.toISOString(),
      end: end.toISOString(),
    });
  };

  /* ---------- PDF DOWNLOAD (UNCHANGED) ---------- */
  const downloadAsPdf = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const { totalRevenue, totalCost, grossProfit, grossProfitPercentage } = pnlSummary;
      try {
        const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
        if (base64Logo) {
          const img = new Image();
          img.src = base64Logo;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const logoWidth = 20;
              const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
              const logoX = pageWidth - logoWidth - 14;
              doc.addImage(base64Logo, 'PNG', logoX, 8, logoWidth, logoHeight);
              resolve();
            };
            img.onerror = () => resolve();
          });
        }
      } catch {
        // Continue without logo
      }

      // --- 1. BRAND ACCENT BAR ---
      doc.setFillColor(37, 99, 235); // blue-600
      doc.rect(0, 0, pageWidth, 6, 'F');

      // --- 2. HEADER SECTION ---
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39); // gray-900
      doc.setFont('helvetica', 'bold');
      doc.text('Profit & Loss Report', 14, 24);

      // Dynamic Subtitle with Date Range
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128); // gray-500
      doc.setFont('helvetica', 'normal');

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

      const start = appliedFilters?.start ? formatDate(new Date(appliedFilters.start)) : 'All Time';
      const end = appliedFilters?.end ? formatDate(new Date(appliedFilters.end)) : 'All Time';

      const subtitleText = `Generated: ${generationDate}   |   Period: ${start} to ${end}`;
      doc.text(subtitleText, 14, 31);

      // --- 3. SUMMARY METRICS BLOCK ---
      autoTable(doc, {
        startY: 38,
        body: [
          [
            'TOTAL SALES (Rs.)',
            totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            'GROSS PROFIT / LOSS (Rs.)',
            grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ],
          [
            'TOTAL COST (Rs.)',
            totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            'GROSS MARGIN',
            `${grossProfitPercentage.toFixed(2)}%`,
          ],
        ],
        theme: 'plain',
        styles: {
          font: 'helvetica',
          cellPadding: 4,
          fontSize: 11,
          textColor: [17, 24, 39], // gray-900
        },
        columnStyles: {
          0: { fontStyle: 'bold', textColor: [107, 114, 128], cellWidth: 40 }, // Labels
          1: { fontStyle: 'bold', halign: 'right', cellWidth: 40 },            // Values
          2: { fontStyle: 'bold', textColor: [107, 114, 128], cellWidth: 55 }, // Labels
          3: { fontStyle: 'bold', halign: 'right', cellWidth: 40 },            // Values
        },
        didParseCell: function (data) {
          // Highlight negative Gross Profit or Margin in red
          if ((data.row.index === 0 && data.column.index === 3) ||
            (data.row.index === 1 && data.column.index === 3)) {
            const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, '').replace('%', ''));
            if (rawVal < 0) {
              data.cell.styles.textColor = [220, 38, 38]; // red-600
            }
          }
        }
      });

      // --- 4. DETAILED TRANSACTIONS TABLE ---
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 12,
        head: [['DATE', 'INVOICE', 'SALES (Rs.)', 'COST (Rs.)', 'PROFIT (Rs.)']],
        body: filteredTransactions.map((t) => [
          formatDate(t.createdAt),
          t.invoiceNumber || 'N/A',
          t.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          (t.costOfGoodsSold || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          (t.profit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ]),
        foot: [[
          'TOTAL',
          '-',
          totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        ]],
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
          halign: 'center',
          lineWidth: { top: 1, bottom: 1 },
          lineColor: [229, 231, 235], // gray-200
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [17, 24, 39],
          fontStyle: 'bold',
          halign: 'right', // Right aligns the totals to match the data columns
          lineWidth: { top: 1, bottom: 2 }, // Thicker bottom line for totals
          lineColor: [17, 24, 39],
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252], // Subtle zebra striping
        },
        columnStyles: {
          0: { halign: 'left', cellWidth: 35 },
          1: { halign: 'left', cellWidth: 'auto' },
          2: { halign: 'right', cellWidth: 35 },
          3: { halign: 'right', cellWidth: 35 },
          4: { halign: 'right', cellWidth: 35 },
        },
        // --- 5. CONDITIONAL FORMATTING ---
        didParseCell: function (data) {
          // Highlight negative values in the 'Profit' column for body and foot
          if ((data.section === 'body' || data.section === 'foot') && data.column.index === 4) {
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
        },
        // --- 6. PAGINATION FOOTER ---
        didDrawPage: function () {
          const pageCount = (doc.internal as any).getNumberOfPages();
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

      // Safely naming the file based on the parsed dates
      const safeStart = appliedFilters?.start ? startDate : 'All_Time';
      const safeEnd = appliedFilters?.end ? endDate : 'All_Time';
      doc.save(`PNL_Report_${safeStart}_to_${safeEnd}.pdf`);

    } catch (err) {
      console.error('PDF Generation Error:', err);
    }
  };

  /* ---------- EXCEL DOWNLOAD (NEW) ---------- */
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
      { header: 'Date', width: 16 },
      { header: 'Invoice', width: 18 },
      { header: 'Sales (₹)', width: 18 },
      { header: 'Cost (₹)', width: 18 },
      { header: 'Profit (₹)', width: 18 },
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
    aoa[0][0] = 'Profit & Loss Report';

    // Row 1 – Meta
    aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Transactions: ${filteredTransactions.length}`;

    // Row 3 – Summary label
    aoa[3][0] = 'SUMMARY';

    // Row 4 – Summary values
    aoa[4][0] = 'Total Sales';
    aoa[4][1] = pnlSummary.totalRevenue;
    aoa[4][2] = 'Total Cost';
    aoa[4][3] = pnlSummary.totalCost;
    aoa[4][4] = 'Gross Profit';
    aoa[4][5] = pnlSummary.grossProfit;

    // Row 6 – Column headers
    COLS.forEach((c, i) => { aoa[6][i] = c.header; });

    // Rows 7+ – Data
    filteredTransactions.forEach((txn, idx) => {
      const r = dataStartRow + idx;
      aoa[r][0] = idx + 1;
      aoa[r][1] = formatDate(txn.createdAt);
      aoa[r][2] = txn.invoiceNumber || 'N/A';
      aoa[r][3] = Math.round(txn.totalAmount);
      aoa[r][4] = Math.round(txn.costOfGoodsSold || 0);
      aoa[r][5] = Math.round(txn.profit || 0);
    });

    // Footer row
    const footerRow = dataStartRow + filteredTransactions.length;
    aoa[footerRow][0] = 'TOTAL';
    aoa[footerRow][1] = `${filteredTransactions.length} transactions`;
    aoa[footerRow][3] = Math.round(pnlSummary.totalRevenue);
    aoa[footerRow][4] = Math.round(pnlSummary.totalCost);
    aoa[footerRow][5] = Math.round(pnlSummary.grossProfit);

    // ── BUILD WORKSHEET ──────────────────────────────────────────────────
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);
    worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
    worksheet['!rows'] = [
      { hpt: 36 }, // 0 title
      { hpt: 20 }, // 1 meta
      { hpt: 8 },  // 2 spacer
      { hpt: 18 }, // 3 summary label
      { hpt: 22 }, // 4 summary values
      { hpt: 8 },  // 5 spacer
      { hpt: 28 }, // 6 headers
      ...filteredTransactions.map(() => ({ hpt: 20 })),
      { hpt: 24 }, // footer
    ];

    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
      { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 2 } }, // footer label spans
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

    // Summary value cells (row 4)
    const summaryBg = solidFill('F0FDF4');
    const summaryLabelStyle = s({ sz: 9, bold: true, color: { rgb: '15803D' } }, summaryBg, { horizontal: 'left', vertical: 'center' }, bblr);
    const summaryValStyle = s({ sz: 11, bold: true, color: { rgb: '166534' } }, summaryBg, { horizontal: 'center', vertical: 'center' }, bblr);

    style('A5', summaryLabelStyle);
    style('B5', summaryValStyle);
    style('C5', summaryLabelStyle);
    style('D5', summaryValStyle);
    style('E5', summaryLabelStyle);
    style('F5', summaryValStyle);

    // Format summary values as currency
    if (worksheet['B5']) { worksheet['B5'].t = 'n'; worksheet['B5'].z = '₹#,##0.00'; }
    if (worksheet['D5']) { worksheet['D5'].t = 'n'; worksheet['D5'].z = '₹#,##0.00'; }
    if (worksheet['F5']) { worksheet['F5'].t = 'n'; worksheet['F5'].z = '₹#,##0.00'; }

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
    filteredTransactions.forEach((_txn, idx) => {
      const r = dataStartRow + idx;
      const isAlt = idx % 2 === 1;
      const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');

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

  const tableColumns = useMemo(() => getPnlColumns(), []);

  if (authLoading || dataLoading)
    return <div className="p-4 text-center">Loading Report...</div>;
  if (error)
    return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  if (!currentUser) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16">
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
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <button onClick={() => setShowSearch(true)} className="p-2">
          <IconSearch />
        </button>
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Profit & Loss Report
        </h1>
        <button onClick={() => navigate(-1)} className="rounded-full bg-gray-200 p-2 text-gray-900 hover:bg-gray-300">
            <IconClose />
        </button>
      </div>

      {showSearch && (
        <div className="flex justify-center mb-2 px-2">
          <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-blue-700">
            <input
              type="text"
              placeholder="Search by INV Number..."
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
      <div className="bg-white p-4 rounded-lg shadow-md mb-2">
        <div className="grid grid-cols-1 gap-1">
          <FilterSelect
            value={datePreset}
            onChange={(e) =>
              handleDatePresetChange(
                e.target.value,
                setDatePreset,
                setStartDate,
                setEndDate,
              )
            }
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom</option>
          </FilterSelect>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-md"
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setDatePreset('');
              }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-md"
            />
          </div>
        </div>

        <div className="flex justify-center mt-2">
          <button onClick={handleApplyFilters}
            className="w-full md:w-fit mt-2 px-10 py-2 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700" >
            Apply
          </button>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Total Sales"
          value={`₹${pnlSummary.totalRevenue.toLocaleString('en-IN')}`}
          valueClassName="text-blue-600"
        />
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Total Cost"
          value={`₹${pnlSummary.totalCost.toLocaleString('en-IN')}`}
          valueClassName="text-red-600"
        />
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Profit / Loss"
          value={`₹${pnlSummary.grossProfit.toLocaleString('en-IN')}`}
          valueClassName={
            pnlSummary.grossProfit >= 0
              ? 'text-green-600'
              : 'text-red-600'
          }
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Gross Profit %"
          value={`${Math.round(pnlSummary.grossProfitPercentage)}%`}
          valueClassName={
            pnlSummary.grossProfit >= 0
              ? 'text-green-600'
              : 'text-red-600'
          }
        />
      </div>

      {/* DETAILS */}
      <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-700 text-center md:text-left w-full md:w-auto">Report Details</h2>
        <div className="flex justify-between w-full md:w-auto md:justify-end md:space-x-3 ">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button
            onClick={() => {
              if (filteredTransactions.length === 0) {
                setFeedbackModal({
                  isOpen: true,
                  type: State.INFO,
                  message: 'No data available to download.',
                });
              } else {
                setIsDownloadModalOpen(true);
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md"
          >
            Download Report
          </button>
        </div>
      </div>

      {isListVisible && (
        <CustomTable<TransactionDetail>
          data={filteredTransactions}
          columns={tableColumns}
          keyExtractor={(item) => item.id}
          sortConfig={sortConfig}
          onSort={handleSort}
          emptyMessage="No transactions found for this period."
        />
      )}
    </div>
  );
};

export default PnlReportPage;
