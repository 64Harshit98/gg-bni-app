import React, { useMemo, useState } from 'react';

import {
  Search,
  AlertTriangle,
  ShoppingCart,
  ArrowUpDown,
  PackageX,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { IconClose } from '../../constants/Icons';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';

import useRestockReport from './RestockReportComponents/useRestockReport';
import {
  filterBySearch,
  calculateSummary,
  type ItemDoc,
} from './RestockReportComponents/restockReport.utils';

const RestockReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { items: inventoryItems, loading, error } = useRestockReport();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // --- Report Details state (same pattern as PurchaseReport) ---
  const [isListVisible, setIsListVisible] = useState(true);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
  });

  const displayedItems = useMemo(() => {
    const filtered = filterBySearch(inventoryItems, searchTerm);

    return [...filtered].sort((a, b) => {
      const stockA = a.stock ?? 0;
      const stockB = b.stock ?? 0;

      // Out of stock always first
      if (stockA <= 0 && stockB > 0) return -1;
      if (stockB <= 0 && stockA > 0) return 1;

      // Then sort by stock value
      return sortOrder === 'asc' ? stockA - stockB : stockB - stockA;
    });
  }, [inventoryItems, searchTerm, sortOrder]);

  const { totalItemsToRestock, outOfStockCount, estimatedCostToRestock } =
    useMemo(() => calculateSummary(displayedItems), [displayedItems]);

  const getStatusBadge = (stock: number) => {
    if (stock <= 0) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
          <AlertTriangle size={12} className="mr-1" /> Critical
        </span>
      );
    }

    if (stock <= 5) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
          <PackageX size={12} className="mr-1" /> Low Stock
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
        <AlertTriangle size={12} className="mr-1" /> In Stock
      </span>
    );
  };

  /* ---------- PDF DOWNLOAD ---------- */
  const downloadAsPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Restock Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 29);

    autoTable(doc, {
      startY: 35,
      head: [['Product Name', 'Stock Level', 'Restock Threshold', 'Deficit', 'Status']],
      body: displayedItems.map((item) => {
        const currentStock = item.stock ?? 0;
        const deficit = Math.max((item.restockQuantity ?? 0) - currentStock, 0);
        const status =
          currentStock <= 0 ? 'Critical' : currentStock <= 5 ? 'Low Stock' : 'In Stock';
        return [
          item.name,
          currentStock,
          item.restockQuantity ?? 0,
          deficit > 0 ? `-${deficit}` : '-',
          status,
        ];
      }),
      foot: [
        [
          `Total Items: ${totalItemsToRestock}`,
          '',
          '',
          '',
          `Out of Stock: ${outOfStockCount}`,
        ],
      ],
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
      footStyles: { fontStyle: 'bold', fillColor: [41, 128, 185] },
    });

    doc.save(`restock_report_${new Date().toISOString().split('T')[0]}.pdf`);
    setIsDownloadModalOpen(false);
  };

  /* ---------- EXCEL DOWNLOAD ---------- */
  const downloadAsExcel = () => {
    try {
      const excelData = displayedItems.map((item) => {
        const currentStock = item.stock ?? 0;
        const deficit = Math.max((item.restockQuantity ?? 0) - currentStock, 0);
        return {
          'Product Name': item.name,
          'Product ID': item.id,
          'Stock Level': currentStock,
          'Restock Threshold': item.restockQuantity ?? 0,
          Deficit: deficit > 0 ? -deficit : 0,
          Status:
            currentStock <= 0 ? 'Critical' : currentStock <= 5 ? 'Low Stock' : 'In Stock',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Restock Report');

      XLSX.writeFile(
        workbook,
        `restock_report_${new Date().toISOString().split('T')[0]}.xlsx`,
      );

      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Excel downloaded successfully!',
      });
    } catch (err) {
      console.error(err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate Excel file.',
      });
    }
  };

  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen font-sans text-gray-800">
      {/* Feedback modal */}
      {feedbackModal.isOpen && (
        <Modal
          type={feedbackModal.type}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
          showConfirmButton={false}
        />
      )}

      {/* Download choice modal */}
      <DownloadChoiceModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        onDownloadPdf={downloadAsPdf}
        onDownloadExcel={downloadAsExcel}
      />

      {/* HEADER */}
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Restock Report
        </h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

      {/*
        SUMMARY CARDS
        ─ Mobile  : 2-col grid; Est. Cost spans full width (col-span-2) below the first two
        ─ Desktop : 3-col grid; all three cards sit in one row
      */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        {/* Items to Restock */}
        <div className="bg-white p-5 rounded-sm border border-gray-200 shadow-sm relative">
          <p className="text-sm font-medium text-gray-500">Items to Restock</p>
          <h3 className="absolute bottom-2 left-4 p-3 text-2xl font-bold text-gray-900">
            {loading ? '-' : totalItemsToRestock}
          </h3>
          <div className="absolute bottom-4 right-4 p-3 bg-blue-50 rounded-full text-blue-600">
            <ShoppingCart size={22} />
          </div>
        </div>

        {/* Critical (Out of Stock) */}
        <div className="bg-white p-5 rounded-sm border border-gray-200 shadow-sm relative">
          <p className="text-sm font-medium text-gray-500">Critical</p>
          <p className="text-sm font-medium text-gray-500">(Out of Stock)</p>
          <h3 className="text-2xl font-bold text-red-600 mt-5">
            {loading ? '-' : outOfStockCount}
          </h3>
          <div className="absolute bottom-4 right-4 p-3 bg-red-50 rounded-full text-red-600">
            <AlertTriangle size={22} />
          </div>
        </div>

        {/*
          Est. Restock Cost
          col-span-2 on mobile  → full-width row below the two cards above
          col-span-1 on md+     → sits as the 3rd card in the same row
        */}
        <div className="col-span-2 md:col-span-1 bg-white p-5 rounded-sm border border-gray-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">Est. Restock Cost</p>
            <h3 className="text-2xl font-bold text-gray-900 mt-1">
              {loading ? '-' : `₹ ${estimatedCostToRestock.toLocaleString()}`}
            </h3>
          </div>
          <div className="p-3 bg-green-50 rounded-full text-green-600">
            <span className="text-xl font-bold">₹</span>
          </div>
        </div>
      </div>

      {/* SEARCH */}
      <div className="bg-white p-4 rounded-t-xl border-b border-gray-200 shadow-sm">
        <div className="relative w-full">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search products..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white p-2 rounded-sm shadow-md mb-2 flex flex-col md:flex-row md:justify-between md:items-center gap-1">
        <h2 className="text-lg font-semibold text-gray-700 text-center md:text-left">
          Report Details
        </h2>
        <div className="flex items-stretch gap-3">
          <button
            onClick={() => setIsListVisible((prev) => !prev)}
            className="flex-1 md:flex-none px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-sm hover:bg-slate-300 transition"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button
            onClick={() => {
              if (displayedItems.length === 0) {
                setFeedbackModal({
                  isOpen: true,
                  type: State.INFO,
                  message: 'No data available to download.',
                });
              } else {
                setIsDownloadModalOpen(true);
              }
            }}
            disabled={displayedItems.length === 0}
            className="flex-1 md:flex-none px-4 py-0.5 bg-blue-600 text-white font-semibold rounded-sm shadow-sm hover:bg-blue-700 transition"
          >
            Download Report
          </button>
        </div>
      </div>

      {/* TABLE — shown / hidden by isListVisible */}
      {isListVisible && (
        <div className="bg-white rounded-b-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-semibold">Product Name</th>
                  <th className="p-4 font-semibold text-center">
                    <div
                      onClick={() =>
                        setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
                      }
                      className="flex items-center justify-center gap-1 cursor-pointer hover:text-gray-700"
                    >
                      Stock Level
                      <ArrowUpDown
                        size={14}
                        className={sortOrder === 'asc' ? 'rotate-180' : ''}
                      />
                    </div>
                  </th>
                  <th className="p-4 font-semibold text-center">Restock Threshold</th>
                  <th className="p-4 font-semibold text-center">Deficit</th>
                  <th className="p-4 font-semibold text-center">Status</th>
                  <th className="p-4 font-semibold text-right">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-12 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Loader2 className="animate-spin text-blue-600" size={32} />
                        <p>Loading inventory...</p>
                      </div>
                    </td>
                  </tr>
                ) : displayedItems.length > 0 ? (
                  displayedItems.map((item: ItemDoc) => {
                    const currentStock = item.stock ?? 0;
                    const deficit = Math.max(
                      (item.restockQuantity ?? 0) - currentStock,
                      0,
                    );

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="p-4">
                          <div className="font-medium text-gray-900">{item.name}</div>
                          <div className="text-xs text-gray-500">
                            ID: {item.id.slice(0, 8)}...
                          </div>
                        </td>

                        <td className="p-4 text-center font-medium">
                          <span className={currentStock <= 0 ? 'text-red-600' : 'text-gray-900'}>
                            {currentStock}
                          </span>
                        </td>

                        <td className="p-4 text-center text-sm text-gray-500">
                          {item.restockQuantity}
                        </td>

                        <td className="p-4 text-center text-sm font-medium text-red-600">
                          {deficit > 0 ? `-${deficit}` : '-'}
                        </td>

                        <td className="p-4 text-center">{getStatusBadge(currentStock)}</td>

                        <td className="p-4 text-right">
                          <button className="text-blue-600 hover:text-blue-800 text-sm font-medium hover:underline">
                            Order
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      No items currently need restocking. Good job! 👍
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-4 border-t border-gray-200 flex items-center justify-between text-sm text-gray-600">
            <div>Showing {displayedItems.length} items</div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                disabled
              >
                Prev
              </button>
              <button
                className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-50"
                disabled
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RestockReportPage;