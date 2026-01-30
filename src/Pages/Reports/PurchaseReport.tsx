import React, { useMemo, useState } from 'react';
import usePurchaseReports from './PurchaseReportComponents/usePurchaseReports';
import { useNavigate } from 'react-router-dom';
import {
  formatDate,
  formatDateForInput,
  type PurchaseRecord,
} from './PurchaseReportComponents/purchaseReports.utils';
import { jsPDF } from 'jspdf';
import FilterSelect from './PurchaseReportComponents/FilterSelect';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { CustomCard } from '../../Components/CustomCard';
import { CardVariant, State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';

import { IconClose } from '../../constants/Icons';
import { getPurchaseColumns } from '../../constants/TableColoumns';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';

const PurchaseReport: React.FC = () => {
  const navigate = useNavigate();

  const {
    isListVisible,
    setIsListVisible,
    sortConfig,
    setSortConfig,
    setCustomStartDate,
    setCustomEndDate,
    customStartDate,
    customEndDate,
    setAppliedFilters,
    appliedFilters,
    purchases,
    isLoading,
    authLoading,
    error,
    datePreset,
    setDatePreset,
  } = usePurchaseReports();

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
  const handleSort = (key: keyof PurchaseRecord) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  /* ---------- FILTER + SUMMARY ---------- */
  const { filteredPurchases, summary } = useMemo(() => {
    if (!appliedFilters) {
      return {
        filteredPurchases: [],
        summary: {
          totalPurchases: 0,
          totalOrders: 0,
          totalItemsPurchased: 0,
          averagePurchaseValue: 0,
        },
      };
    }

    const newFilteredPurchases = [...purchases];

    newFilteredPurchases.sort((a, b) => {
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

    const totalPurchases = newFilteredPurchases.reduce(
      (acc, p) => acc + p.totalAmount,
      0,
    );

    const totalItemsPurchased = newFilteredPurchases.reduce(
      (acc, p) => acc + p.items.reduce((iAcc, i) => iAcc + i.quantity, 0),
      0,
    );

    const totalOrders = newFilteredPurchases.length;
    const averagePurchaseValue =
      totalOrders > 0 ? totalPurchases / totalOrders : 0;

    return {
      filteredPurchases: newFilteredPurchases,
      summary: {
        totalPurchases,
        totalOrders,
        totalItemsPurchased,
        averagePurchaseValue,
      },
    };
  }, [appliedFilters, purchases, sortConfig]);

  /* ---------- PDF DOWNLOAD ---------- */
  const downloadAsPdf = () => {
    if (!appliedFilters) return;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Purchase Report', 14, 22);
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
      head: [['Date', 'Supplier Name', 'Items', 'Amount', 'Payment Method']],
      body: filteredPurchases.map((purchase) => [
        formatDate(purchase.createdAt),
        purchase.partyName,
        purchase.items.reduce((sum, i) => sum + i.quantity, 0),
        `₹ ${purchase.totalAmount.toLocaleString('en-IN')}`,
        Object.keys(purchase.paymentMethods).join(', ') || 'N/A',
      ]),
      foot: [
        [
          'Total',
          '',
          `${summary.totalItemsPurchased}`,
          `₹ ${summary.totalPurchases.toLocaleString('en-IN')}`,
          '',
        ],
      ],
      footStyles: { fontStyle: 'bold' },
    });

    doc.save(`purchase_report_${formatDateForInput(new Date())}.pdf`);
  };

  /* ---------- EXCEL DOWNLOAD ---------- */
  const downloadAsExcel = () => {
    try {
      const excelData = filteredPurchases.map((purchase) => ({
        Date: formatDate(purchase.createdAt),
        'Supplier Name': purchase.partyName,
        Items: purchase.items.reduce((sum, i) => sum + i.quantity, 0),
        Amount: purchase.totalAmount,
        'Payment Method':
          Object.keys(purchase.paymentMethods).join(', ') || 'N/A',
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Report');

      XLSX.writeFile(
        workbook,
        `purchase_report_${formatDateForInput(new Date())}.xlsx`,
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

  const tableColumns = useMemo(() => getPurchaseColumns(), []);

  /* ---------- LOAD STATES ---------- */
  if (isLoading || authLoading)
    return <div className="p-4 text-center">Loading...</div>;
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

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
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Purchase Report
        </h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

      {/* FILTERS */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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

          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => {
                setCustomStartDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-md"
            />
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => {
                setCustomEndDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-md"
            />
          </div>
        </div>

        <button
          onClick={handleApplyFilters}
          className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700"
        >
          Apply
        </button>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Cost"
          value={`₹${Math.round(summary.totalPurchases || 0)}`}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Orders"
          value={summary.totalOrders.toString()}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Items"
          value={summary.totalItemsPurchased.toString()}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Avg Purchase"
          value={`₹${Math.round(summary.averagePurchaseValue || 0)}`}
        />
      </div>

      {/* REPORT DETAILS */}
      <div className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-700">Report Details</h2>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button
            onClick={() => {
              if (filteredPurchases.length === 0) {
                setFeedbackModal({
                  isOpen: true,
                  type: State.INFO,
                  message: 'No data available to download.',
                });
              } else {
                setIsDownloadModalOpen(true);
              }
            }}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 transition"
          >
            Download
          </button>
        </div>
      </div>

      {isListVisible && (
        <CustomTable<PurchaseRecord>
          data={filteredPurchases}
          columns={tableColumns}
          keyExtractor={(purchase) => purchase.id}
          sortConfig={sortConfig}
          onSort={handleSort}
          emptyMessage="No purchases found for the selected period."
        />
      )}
    </div>
  );
};

export default PurchaseReport;
