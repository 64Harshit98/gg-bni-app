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
import * as XLSX from 'xlsx';

import { CustomCard } from '../../Components/CustomCard';
import { CardVariant, State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';

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
        <BackButton/>
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800 md:text-2xl">
          Sales Report
        </h1>
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