import React, { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant, State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import { IconClose, IconSearch } from '../../constants/Icons';
import { getPnlColumns } from '../../constants/TableColoumns';
import FilterSelect from '../../Pages/Reports/ItemReportComponents/FilterSelect';
import { usePnlReport, usePnlStates } from '../hooks/usePnlReport';
import { type TransactionDetail } from '../../Pages/Reports/PNLReportComponents/pnlReport.utils';
import { formatDate } from '../../Pages/Reports/PNLReportComponents/pnlReport.utils';
import { handleDatePresetChange } from '../../Pages/Reports/PNLReportComponents/pnlReport.utils';
import DownloadChoiceModal from '../../Pages/Reports/ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';
import BackButton from '../../Components/BackButton';
import { useExpenses } from '../../Pages/Reports/ExpenseReport/useExpense';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
//import CataShowWrapper from '../../context/CataShowWrapper';
//import { Cata_Permissions } from '../enum/cata_permissions.enum';

const CatalogueProfitLossReport: React.FC = () => {
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
  const { expenses: posExpenses } = useExpenses(currentUser?.companyId, 'pos');
  const { expenses: catExpenses } = useExpenses(currentUser?.companyId, 'catalogue');
  const expenses = [...posExpenses, ...catExpenses];

  /* ---------- LOCAL STATES (ADDED) ---------- */
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  /* ---------- FILTER + SUMMARY ---------- */
  const { pnlSummary, filteredTransactions } = useMemo(() => {
    const startTimestamp = appliedFilters.start
      ? new Date(appliedFilters.start).getTime()
      : 0;
    const endTimestamp = appliedFilters.end
      ? new Date(appliedFilters.end).getTime()
      : Infinity;

    const filteredSales = sales.filter(
      (s) =>
        s.createdAt.getTime() >= startTimestamp &&
        s.createdAt.getTime() <= endTimestamp,
    );

    // SEARCH FILTER
    const trimmedQuery = searchQuery.toLowerCase().trim();

    let searchedSales = filteredSales;

    if (trimmedQuery) {
      const tokens = trimmedQuery.split(/\s+/);

      searchedSales = filteredSales.filter((s) =>
        tokens.every((token) =>
          s.invoiceNumber?.toLowerCase().includes(token)
        )
      );
    }

    const totalRevenue = searchedSales.reduce(
      (sum, sale) => sum + sale.totalAmount,
      0,
    );

    const totalCostOfGoodsSold = searchedSales.reduce(
      (sum, sale) => sum + (sale.costOfGoodsSold || 0),
      0,
    );

    const grossProfit = totalRevenue - totalCostOfGoodsSold;

    // const grossProfitPercentage =
    //   totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    const salesTransactions: TransactionDetail[] = searchedSales.map((s) => ({
      ...s,
      type: 'Revenue' as const,
      profit: s.totalAmount - (s.costOfGoodsSold || 0),
    }));

    salesTransactions.sort((a, b) => {
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

    const totalExpenses = expenses
      .filter(e => e.date >= startTimestamp && e.date <= endTimestamp)
      .reduce((sum, e) => sum + e.amount, 0);

    const netProfit = grossProfit - totalExpenses;
    const netProfitPercentage = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      pnlSummary: {
        totalRevenue,
        totalCost: totalCostOfGoodsSold,
        totalExpenses,
        grossProfit: netProfit,
        grossProfitPercentage: netProfitPercentage,
      },
      filteredTransactions: salesTransactions,
    };
  }, [sales, expenses, appliedFilters, sortConfig, searchQuery]);
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


  const downloadAsPdf = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // ===== BRAND ACCENT BAR =====
      doc.setFillColor(249, 115, 22);
      doc.rect(0, 0, pageWidth, 6, 'F');

      // ===== HEADER =====
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39);
      doc.setFont('helvetica', 'bold');
      doc.text('Profit & Loss Report', 14, 20);

      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128);
      doc.setFont('helvetica', 'normal');

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric'
      });

      let subtitleText = `Generated on: ${generationDate}`;
      if (startDate && endDate) {
        subtitleText += `   |   Period: ${startDate} to ${endDate}`;
      }

      doc.text(subtitleText, 14, 27);

      // ===== GENERATION TAG =====
      const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);

      const textWidth = doc.getTextWidth(tagText);
      const paddingX = 2;

      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = 5;

      const logoReservedWidth = 18; // space reserved for logo + gap, so tag never overlaps it
      const boxX = pageWidth - 14 - logoReservedWidth - boxWidth;
      const boxY = 10;

      doc.setFillColor(245, 245, 245);
      doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');

      doc.setTextColor(80, 80, 80);
      doc.text(tagText, boxX + paddingX, boxY + 3.5);

      doc.setTextColor(0, 0, 0);

      // ===== LOGO (drawn after, in its own reserved slot at top-right corner) =====
      try {
        const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
        if (base64Logo) {
          const img = new Image();
          img.src = base64Logo;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const logoWidth = 13;
              const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
              const logoX = pageWidth - logoWidth - 14;
              doc.addImage(base64Logo, 'PNG', logoX, 8, logoWidth, logoHeight);
              resolve();
            };
            img.onerror = () => resolve();
          });
        }
      } catch { }

      const { totalRevenue, totalCost, grossProfit, grossProfitPercentage } = pnlSummary;

      // ===== SUMMARY TABLE =====
      autoTable(doc, {
        startY: 34,
        body: [
          [
            'TOTAL SALES',
            totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
            'GROSS PROFIT / LOSS',
            grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
          ],
          [
            'TOTAL COST',
            totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
            'GROSS MARGIN',
            `${grossProfitPercentage.toFixed(2)}%`,
          ],
          [
            'TOTAL EXPENSES',
            (pnlSummary.totalExpenses ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
            '',
            '',
          ],
        ],
        theme: 'plain',
        styles: {
          font: 'helvetica',
          cellPadding: 4,
          fontSize: 11,
          textColor: [17, 24, 39],
        },
        columnStyles: {
          0: { fontStyle: 'bold', textColor: [107, 114, 128], cellWidth: 35 },
          1: { fontStyle: 'bold', halign: 'right', cellWidth: 45 },
          2: { fontStyle: 'bold', textColor: [107, 114, 128], cellWidth: 50 },
          3: { fontStyle: 'bold', halign: 'right', cellWidth: 45 },
        },
      });

      // ===== TRANSACTIONS TABLE =====
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['DATE', 'INVOICE', 'SALES (Rs.)', 'COST (Rs.)', 'PROFIT (Rs.)']],
        body: filteredTransactions.map((t) => [
          formatDate(t.createdAt),
          t.invoiceNumber || 'N/A',
          t.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
          (t.costOfGoodsSold || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
          (t.profit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }),
        ]),
        theme: 'plain',
        styles: {
          font: 'helvetica',
          cellPadding: 6,
          fontSize: 10,
          textColor: [55, 65, 81],
        },
        headStyles: {
          fillColor: [249, 250, 251],
          textColor: [17, 24, 39],
          fontStyle: 'bold',
          halign: 'center',
        },
        columnStyles: {
          1: { halign: 'left', cellWidth: 50 },
        },
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 4) {
            const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, ''));
            if (rawVal < 0) {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        didDrawPage: function () {
          const pageCount = (doc.internal as any).getNumberOfPages();
          const pageHeight = doc.internal.pageSize.getHeight();

          doc.setFontSize(9);
          doc.setTextColor(156, 163, 175);
          doc.text(
            `Page ${pageCount}`,
            pageWidth - 14,
            pageHeight - 10,
            { align: 'right' }
          );
        },
      });

      doc.save(`PNL_Report_${startDate}_to_${endDate}.pdf`);

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
        year: 'numeric', month: 'short', day: 'numeric',
      });

      const COLS = [
        { header: '#', width: 6 },
        { header: 'Date', width: 18 },
        { header: 'Invoice', width: 28 },
        { header: 'Sales (₹)', width: 24 },
        { header: 'Cost (₹)', width: 24 },
        { header: 'Profit (₹)', width: 24 },
      ];
      const colCount = COLS.length;

      const dataStartRow = 7;
      const totalRows = dataStartRow + filteredTransactions.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = 'Profit & Loss Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   Period: ${startDate} to ${endDate}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Total Sales: ₹${pnlSummary.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Total Cost: ₹${pnlSummary.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Expenses: ₹${(pnlSummary.totalExpenses ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Net Profit: ₹${pnlSummary.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Net Margin: ${pnlSummary.grossProfitPercentage.toFixed(2)}%`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      filteredTransactions.forEach((t, idx) => {
        const r = dataStartRow + idx;
        aoa[r][0] = idx + 1;
        aoa[r][1] = formatDate(t.createdAt);
        aoa[r][2] = t.invoiceNumber || 'N/A';
        aoa[r][3] = t.totalAmount;
        aoa[r][4] = t.costOfGoodsSold || 0;
        aoa[r][5] = t.profit || 0;
      });

      // Footer row
      const footerRow = dataStartRow + filteredTransactions.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = `${filteredTransactions.length} transactions`;
      aoa[footerRow][3] = pnlSummary.totalRevenue;
      aoa[footerRow][4] = pnlSummary.totalCost;
      aoa[footerRow][5] = pnlSummary.grossProfit;

      // ── BUILD WORKSHEET ──────────────────────────────────────────────
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 36 }, // 0 title
        { hpt: 20 }, // 1 meta
        { hpt: 8 }, // 2 spacer
        { hpt: 18 }, // 3 summary label
        { hpt: 48 }, // 4 summary values
        { hpt: 8 }, // 5 spacer
        { hpt: 28 }, // 6 headers
        ...filteredTransactions.map(() => ({ hpt: 20 })),
        { hpt: 24 }, // footer
      ];

      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
        { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 2 } },
      ];

      const style = (addr: string, st: any) => {
        if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
        worksheet[addr].s = st;
      };

      // Title (row 0) — deep orange
      style('A1', s(
        { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
        solidFill('EA580C'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Meta (row 1) — light orange tint
      style('A2', s(
        { sz: 9, italic: true, color: { rgb: '7C2D12' } },
        solidFill('FFEDD5'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Summary label (row 3)
      style('A4', s(
        { sz: 10, bold: true, color: { rgb: 'C2410C' } },
        solidFill('FFF7ED'),
        { horizontal: 'left', vertical: 'center' },
        allBorders,
      ));
      style('A5', s(
        { sz: 10, bold: true, color: { rgb: '9A3412' } },
        solidFill('FFF7ED'),
        { horizontal: 'center', vertical: 'center', wrapText: true },
        bblr,
      ));

      // Column headers (row 6)
      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          solidFill('C2410C'),
          { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      // Data rows
      filteredTransactions.forEach((_t, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'FFF7ED' : 'FFFFFF');

        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isNumeric = ci >= 3;
          style(addr, s(
            { sz: 9, color: { rgb: '1E293B' } },
            rowBg,
            { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
            bblr,
          ));
          if ((ci === 3 || ci === 4 || ci === 5) && worksheet[addr]) {
            worksheet[addr].t = 'n';
            worksheet[addr].z = '₹#,##0.00';
          }
        }

        // Red color for negative profit
        const profitAddr = XLSX.utils.encode_cell({ r, c: 5 });
        const profitVal = filteredTransactions[idx].profit || 0;
        if (profitVal < 0 && worksheet[profitAddr]) {
          worksheet[profitAddr].s = s(
            { sz: 9, bold: true, color: { rgb: 'DC2626' } },
            rowBg,
            { horizontal: 'center', vertical: 'center' },
            bblr,
          );
        }
      });

      // Footer row
      for (let ci = 0; ci < colCount; ci++) {
        const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: '1E293B' } },
          solidFill('FED7AA'),
          { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
          {
            top: { style: 'medium', color: { rgb: '1E293B' } },
            bottom: { style: 'medium', color: { rgb: '1E293B' } },
            left: { style: 'thin', color: { rgb: 'FED7AA' } },
            right: { style: 'thin', color: { rgb: 'FED7AA' } },
          },
        ));
        if ((ci === 3 || ci === 4 || ci === 5) && worksheet[addr]) {
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
    <div className="min-h-screen bg-gray-100 p-2">
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

        <BackButton />
        {/* TITLE */}
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Profit & Loss Report
        </h1>

        <button onClick={() => setShowSearch(true)} className="p-2">
          <IconSearch />
        </button>

      </div>

      {showSearch && (
        <div className="flex justify-center mb-2 px-2">
          <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-[#F97316]">

            <input
              type="text"
              placeholder="Search by Invoice..."
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
      <div className="bg-white p-4 rounded-sm shadow-md mb-2">
        <FilterSelect
          label="Select Period"
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
        <div className="grid grid-cols-2 gap-2 mt-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setDatePreset('custom');
            }}
            className="w-full p-2 text-sm bg-gray-50 border rounded-sm"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setDatePreset('custom');
            }}
            className="w-full p-2 text-sm bg-gray-50 border rounded-sm"
          />
        </div>

        <button
          onClick={handleApplyFilters}
          className="w-full mt-2 px-3 py-1 bg-[#F97316] text-white text-lg font-semibold rounded-sm hover:bg-[#F97316]"
        >
          Apply
        </button>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 md:grid-cols-6 xl:grid-cols-5 gap-2 mb-2">
        <CustomCard
          className="py-10 md:col-span-2 xl:col-span-1"
          variant={CardVariant.Summary}
          title="Total Sales"
          value={`₹${pnlSummary.totalRevenue.toLocaleString('en-IN')}`}
          valueClassName="text-[#F97316] text-3xl"
        />
        <CustomCard
          className="py-10 md:col-span-2 xl:col-span-1"
          variant={CardVariant.Summary}
          title="Total Cost"
          value={`₹${pnlSummary.totalCost.toLocaleString('en-IN')}`}
          valueClassName="text-red-600 text-3xl"
        />
        <CustomCard
          className="py-10 md:col-span-2 xl:col-span-1"
          variant={CardVariant.Summary}
          title="Expenses"
          value={`₹${(pnlSummary.totalExpenses ?? 0).toLocaleString('en-IN')}`}
          valueClassName="text-orange-500 text-3xl"
        />
        <CustomCard
          className="py-10 md:col-span-3 xl:col-span-1"
          variant={CardVariant.Summary}
          title="Net Profit / Loss"
          value={`₹${pnlSummary.grossProfit.toLocaleString('en-IN')}`}
          valueClassName={
            pnlSummary.grossProfit >= 0
              ? 'text-green-600 text-3xl'
              : 'text-red-600 text-3xl'
          }
        />
        <CustomCard
          className="col-span-2 md:col-span-3 xl:col-span-1"
          variant={CardVariant.Summary}
          title="Net Profit %"
          value={`${Math.round(pnlSummary.grossProfitPercentage)}%`}
          valueClassName={
            pnlSummary.grossProfit >= 0
              ? 'text-green-600 text-3xl'
              : 'text-red-600 text-3xl'
          }
        />
      </div>

      {/* DETAILS */}
      <div className="bg-white p-4 rounded-sm shadow-md flex justify-between items-center mt-2">
        <h2 className="text-lg font-semibold text-gray-700">P&L Details</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-2 bg-slate-200 font-semibold rounded-sm"
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

export default CatalogueProfitLossReport;
