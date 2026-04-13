import React, { useMemo, useState } from 'react';
import FilterSelect from './SalesReportComponents/FilterSelect';
import { useNavigate } from 'react-router-dom';
import {
  formatDate,
  formatDateForInput,
} from './SalesReportComponents/salesReport.utils';
import useSalesReport from './SalesReportComponents/useSalesReport';
import { type SaleRecord } from './SalesReportComponents/salesReport.utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { CustomCard } from '../../Components/CustomCard';
import { CardVariant, State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';

import { IconClose } from '../../constants/Icons';
import { getSalesColumns } from '../../constants/TableColoumns';
import ReportDetails from './SalesReportComponents/ReportDetails';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';

const SalesReport: React.FC = () => {
  const navigate = useNavigate();

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

    const newFilteredSales = sales.filter(
      (sale) =>
        sale.createdAt >= appliedFilters.start &&
        sale.createdAt <= appliedFilters.end,
    );

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
  }, [appliedFilters, sales, sortConfig]);

  /* ---------- PDF DOWNLOAD (UNCHANGED) ---------- */
  const downloadAsPdf = () => {
    if (!appliedFilters) return;

    const doc = new jsPDF();

    // ===== CLEAN GENERATION TAG =====
    const now = new Date();
    const generatedAt = now.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
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

    // light gray background
    doc.setFillColor(245, 245, 245);
    doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

    // text
    doc.setTextColor(80, 80, 80);
    doc.text(tagText, boxX + paddingX, boxY + 3.5);

    // reset styles
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(18);
    doc.text('Sales Report', 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);

    doc.text(
      `Date Range: ${formatDate(appliedFilters.start)} to ${formatDate(
        appliedFilters.end,
      )}`,
      14,
      29,
    );

    autoTable(doc, {
      startY: 35,
      head: [['Date', 'Party Name', 'Items', 'Amount']],
      body: filteredSales.map((sale) => [
        formatDate(sale.createdAt),
        sale.partyName,
        sale.items.reduce((sum, i) => sum + i.quantity, 0),
        `Rs ${sale.totalAmount.toLocaleString('en-IN')}`,
      ]),
      foot: [
        [
          'Total',
          '',
          `${summary.totalItemsSold}`,
          `Rs ${summary.totalSales.toLocaleString('en-IN')}`,
        ],
      ],
      footStyles: { fontStyle: 'bold' },
    });

    doc.save(`sales_report_${formatDateForInput(new Date())}.pdf`);
  };

  /* ---------- EXCEL DOWNLOAD (NEW) ---------- */
  const downloadAsExcel = () => {
    try {
      const excelData = filteredSales.map((sale) => ({
        Date: formatDate(sale.createdAt),
        'Party Name': sale.partyName,
        Items: sale.items.reduce((sum, i) => sum + i.quantity, 0),
        Amount: sale.totalAmount,
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Report');

      XLSX.writeFile(
        workbook,
        `sales_report_${formatDateForInput(new Date())}.xlsx`,
      );

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
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800 md:text-2xl">
          Sales Report
        </h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

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