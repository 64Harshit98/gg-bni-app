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
    isDownloadModalOpen,
    setIsDownloadModalOpen,
    feedbackModal,
    setFeedbackModal,
    currentUser,
    setStartDate,
    setEndDate,
  } = useCustomerReport();

  const filteredSales = useMemo(() => {
    const start = appliedFilters.start
      ? new Date(appliedFilters.start).getTime()
      : 0;
    const end = appliedFilters.end
      ? new Date(appliedFilters.end).getTime()
      : Infinity;

    return sales.filter(
      (s) => s.createdAt.getTime() >= start && s.createdAt.getTime() <= end,
    );
  }, [sales, appliedFilters]);

  /* ---------- CUSTOMER AGGREGATION ---------- */
  const customerRows: CustomerRow[] = useMemo(() => {
    const map = new Map<string, CustomerRow>();

    filteredSales.forEach((sale) => {
      const key = sale.partyName;
      if (!map.has(key)) {
        map.set(key, {
          customerName: key,
          totalBills: 0,
          totalSales: 0,
          totalDue: 0,
        });
      }
      const row = map.get(key)!;
      row.totalBills += 1;
      row.totalSales += sale.totalAmount;
      row.totalDue += sale.dueAmount || 0;
    });

    return Array.from(map.values());
  }, [filteredSales]);

  /* ---------- SUMMARY METRICS ---------- */
  const metrics = useMemo(() => {
    const totalCustomers = customerRows.length;
    const totalBills = filteredSales.length;
    const totalDue = customerRows.reduce((sum, c) => sum + c.totalDue, 0);
    const totalSales = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0);
    const averageSalePerCustomer =
      totalCustomers > 0 ? totalSales / totalCustomers : 0;

    return {
      totalCustomers,
      totalBills,
      totalDue,
      averageSalePerCustomer,
    };
  }, [customerRows, filteredSales]);

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
  const prepareExportData = (row: CustomerRow) => ({
    customerName: row.customerName,
    totalBills: row.totalBills,
    totalSales: row.totalSales,
    totalDue: row.totalDue,
  });

  const downloadAsExcel = () => {
    try {
      const worksheet = XLSX.utils.json_to_sheet(
        customerRows.map(prepareExportData),
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Customers');
      XLSX.writeFile(workbook, 'customer_report.xlsx');

      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Excel file downloaded successfully!',
      });
    } catch {
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate Excel file.',
      });
    }
  };

  const downloadAsPdf = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Customer Report', 14, 15);

      autoTable(doc, {
        startY: 22,
        head: [['Customer', 'Bills', 'Sales', 'Due']],
        body: customerRows.map((c) => [
          c.customerName,
          c.totalBills,
          `${c.totalSales.toLocaleString('en-IN')}`,
          `${c.totalDue.toLocaleString('en-IN')}`,
        ]),
        theme: 'grid',
        headStyles: { fillColor: [41, 128, 185] },
      });

      doc.save('customer_report.pdf');

      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'PDF downloaded successfully!',
      });
    } catch {
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate PDF.',
      });
    }
  };

  /* ---------- TABLE COLUMNS ---------- */
  const tableColumns: TableColumn<CustomerRow>[] = [
    {
      header: 'Customer',
      accessor: 'customerName',
    },
    {
      header: 'Bills',
      accessor: 'totalBills',
      className: 'text-right',
    },
    {
      header: 'Total Sales',
      accessor: (row) => `₹${row.totalSales.toLocaleString('en-IN')}`,
      sortKey: 'totalSales',
      className: 'text-right',
    },
    {
      header: 'Total Due',
      accessor: (row) => `₹${row.totalDue.toLocaleString('en-IN')}`,
      sortKey: 'totalDue',
      className: 'text-right',
    },
  ];

  /* ---------- STATES ---------- */
  if (authLoading || loading)
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
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Customer Report
        </h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

      {/* FILTERS */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-2">
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

        <div className="grid grid-cols-2 gap-2 mt-2">
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

        <button
          onClick={handleApplyFilters}
          className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700"
        >
          Apply
        </button>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 gap-2">
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Customers"
          value={metrics.totalCustomers.toString()}
          valueClassName="text-blue-600 text-3xl"
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Bills"
          value={metrics.totalBills.toString()}
          valueClassName="text-indigo-600 text-3xl"
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Due"
          value={`₹${metrics.totalDue.toLocaleString('en-IN')}`}
          valueClassName="text-red-600 text-3xl"
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Avg Sale / Customer"
          value={`₹${Math.round(metrics.averageSalePerCustomer).toLocaleString(
            'en-IN',
          )}`}
          valueClassName="text-green-600 text-3xl"
        />
      </div>

      {/* REPORT DETAILS */}
      <div className="bg-white p-4 rounded-lg flex justify-between items-center mt-2">
        <h2 className="text-lg font-semibold text-gray-700">Report Details</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-2 bg-slate-200 rounded-md font-semibold"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button
            onClick={() => {
              if (customerRows.length === 0) {
                setFeedbackModal({
                  isOpen: true,
                  type: State.INFO,
                  message: 'No data available to download.',
                });
              } else {
                setIsDownloadModalOpen(true);
              }
            }}
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
          emptyMessage="No customers found for selected period."
        />
      )}
    </div>
  );
};

export default CustomerReport;
