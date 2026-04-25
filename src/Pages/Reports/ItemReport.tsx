import React, { useMemo } from 'react';
import useItemReport from './ItemReportComponents/useItemReport';
import type { Item } from '../../constants/models';
import { useNavigate } from 'react-router-dom';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Spinner } from '../../constants/Spinner';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import { getItemColumns } from '../../constants/TableColoumns';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import FilterSelect from './ItemReportComponents/FilterSelect';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { useAuth } from '../../context/auth-context'

// Import your Modal and State
import { Modal } from '../../constants/Modal'; // Adjust path to where you saved the Modal code
import { State } from '../../enums';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
// --- Helper Component ---

const ItemReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const {
    items,
    appliedItemGroupId,
    sortConfig,
    setAppliedItemGroupId,
    setSortConfig,
    itemGroups,
    itemGroupId,
    setItemGroupId,
    setIsListVisible,
    isListVisible,
    setIsDownloadModalOpen,
    setFeedbackModal,
    isLoading,
    feedbackModal,
    isDownloadModalOpen,
  } = useItemReport();

  const { filteredItems, summary } = useMemo(() => {
    const newFilteredItems = items.filter((item) => {
      if (!appliedItemGroupId) return true;
      const itemGroupName = item.itemGroupId || UNASSIGNED_GROUP_NAME;
      return itemGroupName === appliedItemGroupId;
    });

    newFilteredItems.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = a[key] ?? '';
      const valB = b[key] ?? '';

      if (typeof valA === 'string' && typeof valB === 'string')
        return valA.localeCompare(valB) * direction;
      if (typeof valA === 'number' && typeof valB === 'number')
        return (valA - valB) * direction;
      return 0;
    });

    const totalItems = newFilteredItems.length;
    const totalMrp = newFilteredItems.reduce(
      (sum, item) => sum + (item.mrp || 0),
      0,
    );
    const totalPurchasePrice = newFilteredItems.reduce(
      (sum, item) => sum + (item.purchasePrice || 0),
      0,
    );
    const totalDiscount = newFilteredItems.reduce(
      (sum, item) => sum + (item.discount || 0),
      0,
    );
    const averageMrp = totalItems > 0 ? totalMrp / totalItems : 0;
    const averagePurchasePrice =
      totalItems > 0 ? totalPurchasePrice / totalItems : 0;
    const averageDiscount = totalItems > 0 ? totalDiscount / totalItems : 0;
    const averageSalePrice = averageMrp * (1 - averageDiscount / 100);
    const averageProfitMargin = averageSalePrice - averagePurchasePrice;
    const averageMarginPercentage =
      averageSalePrice > 0 ? (averageProfitMargin / averageSalePrice) * 100 : 0;

    return {
      filteredItems: newFilteredItems,
      summary: {
        totalItems,
        averageMrp,
        averagePurchasePrice,
        averageSalePrice,
        averageProfitMargin,
        averageMarginPercentage,
      },
    };
  }, [appliedItemGroupId, sortConfig, items]);

  const handleApplyFilters = () => setAppliedItemGroupId(itemGroupId);

  const handleSort = (key: keyof Item) => {
    const direction =
      sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const getGroupName = (id?: string) => {
    if (!id) return UNASSIGNED_GROUP_NAME;
    const group = itemGroups.find((g) => g.id === id);
    return group ? group.name : UNASSIGNED_GROUP_NAME;
  };

  const prepareExportData = (item: Item) => {
    return {
      name: item.name,
      mrp: item.mrp || 0,
      purchasePrice: item.purchasePrice || 0,
      discount: item.discount || 0,
      tax: item.tax || 0,
      itemGroupId: getGroupName(item.itemGroupId),
      stock: item.stock || 0,
      barcode: item.barcode || '-',
      restockQuantity: item.restockQuantity || 0,
    };
  };

  const downloadAsPdf = async () => {
    try {
      // Landscape A4 for wide data tables
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();

      // --- Embed logo ---
      try {
        const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
        if (base64Logo) {
          const img = new Image();
          img.src = base64Logo;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const logoWidth = 15;
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

      doc.setFontSize(14);

      //const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // --- 1. BRAND ACCENT BAR ---
      doc.setFillColor(37, 99, 235); // blue-600
      doc.rect(0, 0, pageWidth, 6, 'F');

      // --- 2. HEADER SECTION ---
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39); // gray-900
      doc.setFont('helvetica', 'bold');
      doc.text('Detailed Item Report', 14, 24);

      // Dynamic Subtitle
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128); // gray-500
      doc.setFont('helvetica', 'normal');

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

      const subtitleText = `Generated: ${generationDate}   |   Total Items: ${summary.totalItems}   |   Avg Margin: ${Math.round(summary.averageMarginPercentage)}%`;
      doc.text(subtitleText, 14, 31);

      // --- 3. DYNAMIC DATA PREPARATION ---
      // Guard clause in case filteredItems is empty
      if (!filteredItems || filteredItems.length === 0) {
        throw new Error("No data available to export");
      }

      const exportData = filteredItems.map(prepareExportData);

      // Helper to convert camelCase/snake_case keys to clean uppercase headers
      // e.g. "totalSalesAmount" -> "TOTAL SALES AMOUNT"
      const formatHeader = (str: string) => {
        return str
          .replace(/([A-Z])/g, ' $1')
          .replace(/_/g, ' ')
          .trim()
          .toUpperCase();
      };

      const rawHeaders = Object.keys(exportData[0] || {});
      const cleanHeaders = rawHeaders.map(formatHeader);
      const body = exportData.map((obj) => Object.values(obj));

      const numericColumns = ['mrp', 'purchasePrice', 'discount', 'tax', 'stock', 'restockQuantity'];
      const columnStyles: any = {};

      rawHeaders.forEach((key, index) => {
        if (numericColumns.includes(key)) {
          columnStyles[index] = { halign: 'right' };
        }
      });

      // --- 4. AUTOTABLE GENERATION ---
      autoTable(doc, {
        startY: 38,
        head: [cleanHeaders],
        body: body,
        columnStyles: columnStyles,
        theme: 'plain',
        styles: {
          font: 'helvetica',
          cellPadding: 6,
          fontSize: 9, // Slightly smaller to fit dynamic columns in landscape
          textColor: [55, 65, 81], // gray-700
        },
        headStyles: {
          fillColor: [249, 250, 251], // gray-50
          textColor: [17, 24, 39], // gray-900
          fontStyle: 'bold',
          lineWidth: { top: 1, bottom: 1 },
          lineColor: [229, 231, 235], // gray-200
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252], // Subtle zebra striping
        },
        // --- 5. SMART CONDITIONAL FORMATTING ---
        didParseCell: function (data) {
          if (data.section === 'body') {
            if (numericColumns.includes(rawHeaders[data.column.index])) {
              data.cell.styles.halign = 'right';

              const value = parseFloat(String(data.cell.raw ?? '0'));
              if (!isNaN(value) && value < 0) {
                data.cell.styles.textColor = [220, 38, 38];
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }

          if (data.section === 'head') {
            if (numericColumns.includes(rawHeaders[data.column.index])) {
              data.cell.styles.halign = 'right';
            } else {
              data.cell.styles.halign = 'left';
            }
          }
        },
        // --- 6. PAGINATION FOOTER ---
        didDrawPage: function () {
          const pageCount = doc.internal.getNumberOfPages();
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

      doc.save('detailed_item_report.pdf');

      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'PDF downloaded successfully!',
      });
    } catch (e: any) {
      console.error('PDF Generation Error:', e);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: e?.message === "No data available to export"
          ? 'No data available to export.'
          : 'Failed to generate PDF.',
      });
    }
  };

  const downloadAsExcel = () => {
    try {
      const dataToExport = filteredItems.map(prepareExportData);
      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Items');
      XLSX.writeFile(workbook, 'item_report.xlsx');

      // Close selection modal and show success modal
      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Excel file downloaded successfully!',
      });
    } catch (e) {
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate Excel file.',
      });
    }
  };

  const tableColumns = useMemo(() => getItemColumns(itemGroups), [itemGroups]);

  if (isLoading) return <Spinner />;

  return (
    <div className="min-h-screen bg-gray-50 p-2 mb-12">
      {/* 1. Generic Modal for Success/Error/Info */}
      {feedbackModal.isOpen && (
        <Modal
          type={feedbackModal.type}
          message={feedbackModal.message}
          onClose={() =>
            setFeedbackModal((prev) => ({ ...prev, isOpen: false }))
          }
          showConfirmButton={false}
        />
      )}

      {/* 2. Download Choice Modal */}
      <DownloadChoiceModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        onDownloadPdf={downloadAsPdf}
        onDownloadExcel={downloadAsExcel}
      />

      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Item Report
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

      <div className="bg-white p-2 rounded-lg mb-2">
        <h2 className="text-center text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
          FILTERS
        </h2>
        <div className="flex w-full gap-2 items-end sm:items-center">
          <FilterSelect
            label="Item Group"
            value={itemGroupId}
            onChange={(e) => setItemGroupId(e.target.value)}
          >
            <option value="">All Groups</option>
            {itemGroups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
            <option value={UNASSIGNED_GROUP_NAME}>Uncategorized</option>
          </FilterSelect>
          <button
            onClick={handleApplyFilters}
            className="w-[28%] py-2 bg-sky-500 text-white font-semibold rounded-md shadow-sm hover:bg-sky-700 transition self-end sm:self-auto"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Items"
          value={Math.round(summary.totalItems).toString()}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Average MRP"
          value={`₹${Math.round(summary.averageMrp).toFixed(0)}`}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Avg. Cost Price"
          value={`₹${Math.round(summary.averagePurchasePrice).toFixed(0)}`}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Avg. Sale Price"
          value={`₹${Math.round(summary.averageSalePrice).toFixed(0)}`}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Avg. Margin"
          value={`₹${Math.round(summary.averageProfitMargin).toFixed(0)}`}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Avg. Margin %"
          value={`${Math.round(summary.averageMarginPercentage).toFixed(0)} %`}
        />
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row md:justify-between md:items-center gap-3">
        <h2 className="text-lg font-semibold text-gray-700 text-center md:text-left">Report Details</h2>
        <div className="flex items-stretch gap-3">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="flex-1 md:flex-none px-4 py-2 min-h-[44px] bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>

          {/* Single Download Button triggers the Choice Modal */}
          <button
            onClick={() => {
              if (filteredItems.length === 0) {
                setFeedbackModal({
                  isOpen: true,
                  type: State.INFO,
                  message: 'No items available to download.',
                });
              } else {
                setIsDownloadModalOpen(true);
              }
            }}
            className="flex-1 md:flex-none px-4 py-2 min-h-[44px] bg-sky-500 text-white font-semibold rounded-md shadow-sm hover:bg-sky-700 disabled:opacity-50"
          >
            Download Report
          </button>
        </div>
      </div>

      {isListVisible && (
        <CustomTable<Item>
          data={filteredItems}
          columns={tableColumns}
          keyExtractor={(item) => item.id || Math.random()}
          sortConfig={sortConfig}
          onSort={handleSort}
        />
      )}
    </div>
  );
};

export default ItemReport;