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
import { IconClose } from '../../constants/Icons';
import { getItemColumns } from '../../constants/TableColoumns';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import FilterSelect from './ItemReportComponents/FilterSelect';

// Import your Modal and State
import { Modal } from '../../constants/Modal'; // Adjust path to where you saved the Modal code
import { State } from '../../enums';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
// --- Helper Component ---

const ItemReport: React.FC = () => {
  const navigate = useNavigate();
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

  const downloadAsPdf = () => {
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      doc.setFontSize(14);
      doc.text('Detailed Item Report', 14, 15);
      doc.setFontSize(10);
      doc.text(
        `Total Items: ${summary.totalItems} | Avg Margin: ${Math.round(summary.averageMarginPercentage)}%`,
        14,
        22,
      );

      const exportData = filteredItems.map(prepareExportData);
      const headers = Object.keys(exportData[0] || {});
      const body = exportData.map((obj) => Object.values(obj));

      autoTable(doc, {
        startY: 25,
        head: [headers],
        body: body,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [41, 128, 185] },
      });

      doc.save('detailed_item_report.pdf');

      // Close selection modal and show success modal
      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'PDF downloaded successfully!',
      });
    } catch (e) {
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate PDF.',
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
          className="rounded-full bg-gray-200 p-2 text-gray-900 hover:bg-gray-300"
        >
          <IconClose width={20} height={20} />
        </button>
      </div>

      <div className="bg-white p-2 rounded-lg mb-2">
        <h2 className="text-center font-semibold text-gray-700 mb-2">
          FILTERS
        </h2>
        <div className="flex space-x-3 items-end">
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
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 transition"
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

      <div className="bg-white p-4 rounded-lg flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-700">Report Details</h2>
        <div className="flex items-center space-x-3 w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition whitespace-nowrap"
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
            className="bg-blue-600 text-white font-semibold rounded-md py-2 px-4 shadow-sm hover:bg-blue-700 whitespace-nowrap"
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
