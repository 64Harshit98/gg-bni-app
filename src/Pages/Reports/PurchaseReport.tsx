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

import { getPurchaseColumns } from '../../constants/TableColoumns';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';
import { useAuth } from '../../context/auth-context';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';

const PurchaseReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();

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
  const downloadAsPdf = async () => {
    if (!appliedFilters) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

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

    // light gray background
    doc.setFillColor(245, 245, 245);
    doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

    // text
    doc.setTextColor(80, 80, 80);
    doc.text(tagText, boxX + paddingX, boxY + 3.5);

    // reset styles
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(18);
    doc.text('Purchase Report', 14, 20);
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
        `Rs. ${purchase.totalAmount.toLocaleString('en-IN')}`,
        Object.entries(purchase.paymentMethods || {})
          .filter(([_, value]) => value > 0)
          .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1))
          .join(', ') || 'N/A',
      ]),
      foot: [
        [
          'Total',
          '',
          `${summary.totalItemsPurchased}`,
          `Rs. ${summary.totalPurchases.toLocaleString('en-IN')}`,
          '',
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      footStyles: { fontStyle: 'bold', fillColor: [41, 128, 185] },
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
        'Payment Method': Object.entries(purchase.paymentMethods || {})
          .filter(([_, value]) => value > 0)
          .map(([key]) => key)
          .join(', ') || 'N/A',
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
    } catch (error) {
      console.error(error);
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
        <button
          onClick={() => navigate(-1)}
          className="absolute mt-1 flex items-center justify-center p-4 rounded-full bg-gray-200 text-gray-500 hover:bg-gray-200 hover:text-gray-900 transition-all"
          title="Go Back"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
      </div>

      {/* FILTERS */}
      <div className="bg-white p-4 rounded-lg shadow-md mb-2">
        <div className="grid grid-cols-1 gap-3">
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

        <div className="flex justify-center mt-2">
          <button onClick={handleApplyFilters}
            className="w-full md:w-fit mt-2 px-10 py-2 bg-blue-600 text-white text-lg font-semibold rounded-sm hover:bg-blue-700" >
            Apply
          </button>
        </div>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Total Cost"
          value={`₹${Math.round(summary.totalPurchases || 0)}`}
        />
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Total Orders"
          value={summary.totalOrders.toString()}
        />
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Total Items"
          value={summary.totalItemsPurchased.toString()}
        />
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Avg Purchase"
          value={`₹${Math.round(summary.averagePurchaseValue || 0)}`}
        />
      </div>

      {/* REPORT DETAILS */}
      <div className="bg-white p-3 rounded-sm shadow-md mb-2 flex flex-col md:flex-row md:justify-between md:items-center gap-1">
        <h2 className="text-lg font-semibold text-gray-700 text-center md:text-left w-full md:w-auto">Report Details</h2>
        <div className="flex items-stretch gap-3 ">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="flex-1 md:flex-none px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition"
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
            className="flex-1 md:flex-none px-4 py-0.5 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 transition"
          >
            Download Report
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

