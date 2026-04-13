import React, { useMemo } from 'react';
import type { TableColumn } from '../../Components/CustomTable';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { CustomCard } from '../../Components/CustomCard';
import { CustomTable } from '../../Components/CustomTable';
import { CardVariant } from '../../enums';
import { IconClose } from '../../constants/Icons';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { handleDatePresetChange } from './PNLReportComponents/pnlReport.utils';
import FilterSelect from './SalesReportComponents/FilterSelect';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { type CustomerRow } from './CustomerReportComponents/customerReport.utils';
import useCustomerReport from './CustomerReportComponents/useCustomerReport';

const CustomerReport: React.FC = () => {
  const {
    navigate,
    sales,
    loading,
    error,
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
    handleSort,
    isDownloadModalOpen,
    setIsDownloadModalOpen,
    feedbackModal,
    setFeedbackModal,
    currentUser,
    setStartDate,
    setEndDate,
  } = useCustomerReport();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2); // only last 2 digits

    return `${day}/${month}/${year}`;
  };

  const { customerRows, summary } = useMemo(() => {
    if (!appliedFilters) {
      return {
        filteredSales: [],
        customerRows: [],
        summary: {
          totalCustomers: 0,
          totalBills: 0,
          totalSales: 0,
          totalDue: 0,
          averageSalePerCustomer: 0,
        },
      };
    }

    const start = appliedFilters.start
      ? new Date(appliedFilters.start).getTime()
      : 0;
    const end = appliedFilters.end
      ? new Date(appliedFilters.end).getTime()
      : Infinity;

    const newFilteredSales = sales.filter(
      (s) => s.createdAt.getTime() >= start && s.createdAt.getTime() <= end,
    );

    /* ---------- CUSTOMER AGGREGATION ---------- */
    const map = new Map<string, CustomerRow>();

    newFilteredSales.forEach((sale) => {
      const key = sale.partyName;

      if (!map.has(key)) {
        map.set(key, {
          customerName: key,
          customerNumber: sale.partyNumber || 'N/A',
          totalBills: 0,
          totalSales: 0,
          totalDue: 0,
          sortKey: 'customerName', // FIX: Added required sortKey property
        });
      }

      const row = map.get(key)!;
      row.totalBills += 1;
      row.totalSales += sale.totalAmount;
      row.totalDue += sale.dueAmount || 0;
    });

    const customerRows = Array.from(map.values());

    /* ---------- SUMMARY METRICS ---------- */
    const totalCustomers = customerRows.length;
    const totalBills = newFilteredSales.length;
    const totalSales = newFilteredSales.reduce(
      (sum, s) => sum + s.totalAmount,
      0,
    );
    const totalDue = customerRows.reduce((sum, c) => sum + c.totalDue, 0);

    const averageSalePerCustomer =
      totalCustomers > 0 ? totalSales / totalCustomers : 0;

    return {
      filteredSales: newFilteredSales,
      customerRows,
      summary: {
        totalCustomers,
        totalBills,
        totalSales,
        totalDue,
        averageSalePerCustomer,
      },
    };
  }, [sales, appliedFilters]);

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

  /* ---------- EXPORT HELPERS ---------- */
  const downloadAsExcel = () => {
    try {
      const data = customerRows.map(row => ({
        Customer: row.customerName,
        Number: row.customerNumber,
        Bills: row.totalBills,
        Sales: row.totalSales,
        Due: row.totalDue,
      }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
      XLSX.writeFile(workbook, 'customer_report.xlsx');
      setIsDownloadModalOpen(false);
      setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'Excel file downloaded successfully!' });
    } catch {
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate Excel file.' });
    }
  };

  const downloadAsPdf = () => {
    try {
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
      doc.text('Customer Report', 14, 20);

      doc.setFontSize(11);
      doc.setTextColor(100);

      const start = appliedFilters?.start ? formatDate(appliedFilters.start) : 'All Time';
      const end = appliedFilters?.end ? formatDate(appliedFilters.end) : 'All Time';
      doc.text(`Date Range: ${start} to ${end}`, 14, 29);

      autoTable(doc, {
        startY: 35,
        head: [['Customer', 'Bills', 'Sales', 'Due']],
        body: customerRows.map((c) => [
          c.customerName,
          c.totalBills,
          `Rs. ${c.totalSales.toLocaleString('en-IN')}`,
          `Rs. ${c.totalDue.toLocaleString('en-IN')}`,
        ]),
        foot: [[
          'Total',
          '',
          `Rs. ${summary.totalSales.toLocaleString('en-IN')}`,
          `Rs. ${summary.totalDue.toLocaleString('en-IN')}`,
        ]],
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] },
        footStyles: { fontStyle: 'bold', fillColor: [41, 128, 185] },
      });
      doc.save('customer_report.pdf');
      setIsDownloadModalOpen(false);
      setFeedbackModal({ isOpen: true, type: State.SUCCESS, message: 'PDF downloaded successfully!' });
    } catch {
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate PDF.' });
    }
  };

  /* ---------- TABLE COLUMNS ---------- */
  // FIX: Updated sortKey to match keys found in CustomerRow for strict type safety
  const tableColumns: TableColumn<CustomerRow>[] = [
    {
      header: 'Customer',
      accessor: 'customerName',
      className: 'py-3 text-center w-1/4 ',
    },
    {
      header: 'Bills',
      accessor: 'totalBills',
      className: 'py-3 text-center w-1/5',
    },
    {
      header: 'Total Sales',
      accessor: (row) => `₹${row.totalSales.toLocaleString('en-IN')}`,
      sortKey: 'totalSales',
      className: 'py-3 text-center w-1/5',
    },
    {
      header: 'Total Due',
      accessor: (row) => `₹${row.totalDue.toLocaleString('en-IN')}`,
      sortKey: 'totalDue',
      className: 'py-3 text-center w-1/4',
    },
  ];

  if (authLoading || loading) return <div className="p-4 text-center">Loading Report...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  if (!currentUser) { navigate('/login'); return null; }

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

      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Customer Report</h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md mb-2">
        <div className="grid grid-cols-1 gap-3">
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

          <div className="grid grid-cols-2 gap-4">
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
                setDatePreset('custom');
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

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Total Customers"
          value={summary.totalCustomers.toString()}
        />
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Total Bills"
          value={summary.totalBills.toString()}
          valueClassName="text-indigo-600"
        />
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Total Due"
          value={`₹${summary.totalDue.toLocaleString('en-IN')}`}
          valueClassName="text-red-600"
        />
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Avg Sale / Customer"
          value={`₹${Math.round(summary.averageSalePerCustomer).toLocaleString(
            'en-IN',
          )}`}
          valueClassName="text-green-600"
        />
      </div>

      {/* REPORT DETAILS */}
      <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-700 text-center md:text-left w-full md:w-auto">Report Details</h2>
        <div className="flex justify-between w-full md:w-auto md:justify-end md:space-x-3">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button
            onClick={() => customerRows.length === 0 ? setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No data.' }) : setIsDownloadModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md font-semibold"
          >
            Download Report
          </button>
        </div>
      </div>

      {isListVisible && (
        <CustomTable<CustomerRow>
          data={customerRows}
          columns={tableColumns}
          keyExtractor={(row) => row.customerName}
          onSort={(key) => handleSort(key as any)}
          sortConfig={sortConfig as any}
          emptyMessage="No customers found for selected period."
        />
      )}
    </div>
  );
};

export default CustomerReport;