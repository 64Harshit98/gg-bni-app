import React, { useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
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

    const grossProfitPercentage =
      totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

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

    return {
      pnlSummary: {
        totalRevenue,
        totalCost: totalCostOfGoodsSold,
        grossProfit,
        grossProfitPercentage,
      },
      filteredTransactions: salesTransactions,
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

      const boxX = pageWidth - 14 - boxWidth;
      const boxY = 10;

      doc.setFillColor(245, 245, 245);
      doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');

      doc.setTextColor(80, 80, 80);
      doc.text(tagText, boxX + paddingX, boxY + 3.5);

      doc.setTextColor(0, 0, 0);

      const { totalRevenue, totalCost, grossProfit, grossProfitPercentage } = pnlSummary;

      // Embed company logo (same as Item Report)
      try {
        const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
        if (base64Logo) {
          const img = new Image();
          img.src = base64Logo;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const logoWidth = 15;
              const logoHeight =
                (img.naturalHeight / img.naturalWidth) * logoWidth;
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

      doc.setFontSize(18);
      doc.text('Profit & Loss Report', 14, 20);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(selectedPeriodText, 14, 30);

      autoTable(doc, {
        startY: 45,
        body: [
          [
            'Total Sales:',
            `₹${totalRevenue.toLocaleString('en-IN')}`,
            'Gross Profit / Loss:',
            `₹${grossProfit.toLocaleString('en-IN')}`,
          ],
          [
            'Total Cost:',
            `₹${totalCost.toLocaleString('en-IN')}`,
            'Gross Profit %:',
            `${grossProfitPercentage.toFixed(2)}%`,
          ],
        ],
        theme: 'plain',
        styles: { fontSize: 10 },
        columnStyles: {
          0: { fontStyle: 'bold' },
          2: { fontStyle: 'bold' },
        },
      });

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [['Date', 'Invoice', 'Sales', 'Cost', 'Profit']],
        body: filteredTransactions.map((t) => [
          formatDate(t.createdAt),
          t.invoiceNumber,
          `₹${t.totalAmount.toLocaleString('en-IN')}`,
          `₹${(t.costOfGoodsSold || 0).toLocaleString('en-IN')}`,
          `₹${(t.profit || 0).toLocaleString('en-IN')}`,
        ]),
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] },
      });

      doc.save(`PNL-Report-${startDate}-to-${endDate}.pdf`);
      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'PDF downloaded successfully!',
      });
    } catch (error) {
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate PDF file.',
      });
    }
  };

  /* ---------- EXCEL DOWNLOAD (NEW) ---------- */
  const downloadAsExcel = () => {
    try {
      const excelData = filteredTransactions.map((t) => ({
        Date: formatDate(t.createdAt),
        Invoice: t.invoiceNumber,
        Sales: t.totalAmount,
        Cost: t.costOfGoodsSold || 0,
        Profit: t.profit || 0,
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
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

        {/* LEFT (Search Icon) */}
        <button onClick={() => setShowSearch(true)} className="p-2">
          <IconSearch />
        </button>

        {/* TITLE */}
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Profit & Loss Report
        </h1>

        {/* RIGHT */}
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
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
      <div className="grid grid-cols-2 gap-2">
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Sales"
          value={`₹${pnlSummary.totalRevenue.toLocaleString('en-IN')}`}
          valueClassName="text-[#F97316] text-3xl"
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Cost"
          value={`₹${pnlSummary.totalCost.toLocaleString('en-IN')}`}
          valueClassName="text-red-600 text-3xl"
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Profit / Loss"
          value={`₹${pnlSummary.grossProfit.toLocaleString('en-IN')}`}
          valueClassName={
            pnlSummary.grossProfit >= 0
              ? 'text-green-600 text-3xl'
              : 'text-red-600 text-3xl'
          }
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Gross Profit %"
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
