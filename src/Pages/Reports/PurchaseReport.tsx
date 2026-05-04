import React, { useMemo, useState } from 'react';
import usePurchaseReports from './PurchaseReportComponents/usePurchaseReports';
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
import BackButton from '../../Components/BackButton';

const PurchaseReport: React.FC = () => {
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

      try {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // --- 1. BRAND ACCENT BAR ---
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, pageWidth, 6, 'F');

        // --- 2. COMPANY LOGO (top-right) ---
        try {
          const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
          if (base64Logo) {
            const img = new Image();
            img.src = base64Logo;
            await new Promise<void>((resolve) => {
              img.onload = () => {
                const logoWidth = 20;
                const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
                doc.addImage(base64Logo, 'PNG', pageWidth - logoWidth - 14, 10, logoWidth, logoHeight);
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

        // background
        doc.setFillColor(245, 245, 245);
        doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

        // text
        doc.setTextColor(80, 80, 80);
        doc.text(tagText, boxX + paddingX, boxY + 3.5);

        // reset
        doc.setTextColor(0, 0, 0);

        // --- 3. HEADER SECTION ---
        doc.setFontSize(22);
        doc.setTextColor(17, 24, 39); // gray-900
        doc.setFont('helvetica', 'bold');
        doc.text('Purchase Report', 14, 24);

        doc.setFontSize(10);
        doc.setTextColor(107, 114, 128); // gray-500
        doc.setFont('helvetica', 'normal');

        const generationDate = new Date().toLocaleDateString('en-IN', {
          year: 'numeric', month: 'short', day: 'numeric',
        });

        const subtitleText = `Generated: ${generationDate}   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`;
        doc.text(subtitleText, 14, 31);

        // --- 4. TABLE ---
        autoTable(doc, {
          startY: 38,
          head: [['DATE', 'SUPPLIER', 'ITEMS', 'AMOUNT (Rs.)', 'PAYMENT']],
          body: filteredPurchases.map((purchase) => {
            const formattedSupplier = purchase.partyName
              ? purchase.partyName.charAt(0).toUpperCase() + purchase.partyName.slice(1).toLowerCase()
              : 'N/A';

            const totalItems = purchase.items.reduce((sum, i) => sum + i.quantity, 0);

            const paymentMethod =
              Object.entries(purchase.paymentMethods || {})
                .filter(([_, value]) => value > 0)
                .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1))
                .join(', ') || 'N/A';

            return [
              formatDate(purchase.createdAt),
              formattedSupplier,
              totalItems.toString(),
              purchase.totalAmount.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
              paymentMethod,
            ];
          }),
          foot: [
            [
              'TOTAL',
              '-',
              summary.totalItemsPurchased.toString(),
              summary.totalPurchases.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
              '',
            ],
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
            textColor: [17, 24, 39],   // gray-900
            fontStyle: 'bold',
            halign: 'left',
            lineWidth: { top: 1, bottom: 1 },
            lineColor: [229, 231, 235], // gray-200
          },
          footStyles: {
            fillColor: [255, 255, 255],
            textColor: [17, 24, 39],
            fontStyle: 'bold',
            halign: 'left',
            lineWidth: { top: 1, bottom: 2 },
            lineColor: [17, 24, 39],
          },
          alternateRowStyles: {
            fillColor: [252, 252, 252],
          },
          columnStyles: {
            0: { halign: 'left', cellWidth: 35 },  // DATE
            1: { halign: 'left', cellWidth: 50 },  // SUPPLIER
            2: { halign: 'left', cellWidth: 20 },  // ITEMS
            3: { halign: 'left', cellWidth: 45 },  // AMOUNT
            4: { halign: 'left', cellWidth: 35 },  // PAYMENT
          },
          didParseCell: function (data) {
            // Highlight negative amounts in red
            if ((data.section === 'body' || data.section === 'foot') && data.column.index === 3) {
              const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, ''));
              if (rawVal < 0) {
                data.cell.styles.textColor = [220, 38, 38]; // red-600
                data.cell.styles.fontStyle = 'bold';
              }
            }
            // Align footer cells
            if (data.section === 'foot') {
              data.cell.styles.halign = 'left';
            }
          },
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

        doc.save(`purchase_report_${formatDateForInput(new Date())}.pdf`);
        setIsDownloadModalOpen(false);

      } catch (err) {
        console.error('PDF Generation Error:', err);
        setFeedbackModal({
          isOpen: true,
          type: State.ERROR,
          message: 'Failed to generate PDF.',
        });
      }
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
        <BackButton/>
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Purchase Report
        </h1>
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

