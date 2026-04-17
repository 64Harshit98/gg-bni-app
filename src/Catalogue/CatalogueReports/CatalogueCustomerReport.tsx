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
import { handleDatePresetChange } from '../../Pages/Reports/PNLReportComponents/pnlReport.utils';
import FilterSelect from '../../Pages/Reports/SalesReportComponents/FilterSelect';
import DownloadChoiceModal from '../../Pages/Reports/ItemReportComponents/DownloadChoiceModal';
import { type CustomerRow } from '../../Pages/Reports/CustomerReportComponents/customerReport.utils';
import useCustomerReport from '../hooks/useCustomerReport';
//import CataShowWrapper from '../../context/CataShowWrapper';
//import { Cata_Permissions } from '../enum/cata_permissions.enum';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';

const CatalogueCustomerReport: React.FC = () => {
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
      const key = `${sale.partyName}-${sale.partyNumber}`;

      if (!map.has(key)) {
        map.set(key, {
          id: key,
          customerName: sale.partyName,
          customerNumber: sale.partyNumber || 'N/A',
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
      totalSales,
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

  const downloadAsPdf = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();

      // Embed company logo
      try {
        const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
        if (base64Logo) {
          const img = new Image();
          img.src = base64Logo;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const logoWidth = 13;
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

      doc.setFontSize(16);
      
      const pageHeight = doc.internal.pageSize.getHeight();

      // ===== CLEAN GENERATION TAG =====
      const generatedAt = new Date().toLocaleString();
      const margin = 14;
      const y = 10;

      const tagText = `Genrated by SELLAR • ${generatedAt}`;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);

      const textWidth = doc.getTextWidth(tagText);
      const paddingX = 2;

      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = 5;

      const boxX = pageWidth - margin - boxWidth;
      const boxY = y + 1;

      // light gray background
      doc.setFillColor(245, 245, 245);
      doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

      // text
      doc.setTextColor(80, 80, 80);
      doc.text(
        tagText,
        boxX + paddingX,
        boxY + 3.5
      );

      // reset styles
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");

      // --- 1. BRAND ACCENT BAR ---
      // Uses the #F97316 orange from your UI
      doc.setFillColor(249, 115, 22); 
      doc.rect(0, 0, pageWidth, 6, 'F');

      // --- 2. HEADER SECTION ---
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39); // gray-900
      doc.setFont('helvetica', 'bold');
      doc.text('Customer Report', 14, 24);

      // Dynamic Subtitle with Date Range
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128); // gray-500
      doc.setFont('helvetica', 'normal');
      
      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });
      
      let subtitleText = `Generated on: ${generationDate}`;
      if (startDate && endDate) {
        subtitleText += `   |   Period: ${startDate} to ${endDate}`;
      }
      doc.text(subtitleText, 14, 31);

      // --- 3. AUTOTABLE GENERATION ---
      autoTable(doc, {
        startY: 38,
        head: [['CUSTOMER', 'PHONE', 'BILLS', 'SALES (Rs.)', 'DUE (Rs.)']],
        body: customerRows.map((c) => {
          const formattedName = c.customerName
            ? c.customerName.charAt(0).toUpperCase() + c.customerName.slice(1).toLowerCase()
            : 'N/A';

          return [
            formattedName,
            c.customerNumber || 'N/A',
            c.totalBills.toString(),
            c.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            c.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ];
        }),
        foot: [
          [
            'TOTAL',
            '-',
            metrics.totalBills.toString(),
            metrics.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            metrics.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
          halign: 'center',
          lineWidth: { top: 1, bottom: 1 },
          lineColor: [229, 231, 235], // gray-200
        },
        footStyles: {
          fillColor: [255, 255, 255],
          textColor: [17, 24, 39],
          fontStyle: 'bold',
          halign: 'right',
          lineWidth: { top: 1, bottom: 2 }, // Thicker bottom line for totals
          lineColor: [17, 24, 39],
        },
        alternateRowStyles: {
          fillColor: [252, 252, 252], // Extremely subtle zebra striping
        },
        columnStyles: {
          0: { halign: 'left', cellWidth: 'auto' },
          1: { halign: 'center', cellWidth: 35 },
          2: { halign: 'right', cellWidth: 25 },
          3: { halign: 'right', cellWidth: 40 },
          4: { halign: 'right', cellWidth: 40 },
        },
        // --- 4. CONDITIONAL FORMATTING ---
        didParseCell: function (data) {
          // Check body and foot rows for negative values in the 'Due' column
          if ((data.section === 'body' || data.section === 'foot') && data.column.index === 4) {
            const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, ''));
            if (rawVal < 0) {
              data.cell.styles.textColor = [220, 38, 38]; // red-600
              data.cell.styles.fontStyle = 'bold';
            }
          }
        },
        // --- 5. PAGINATION FOOTER ---
        didDrawPage: function () {
          const pageCount = doc.internal.getNumberOfPages();
          doc.setFontSize(9);
          doc.setTextColor(156, 163, 175); // gray-400
          // Draw page number at the bottom right
          doc.text(
            `Page ${pageCount}`,
            pageWidth - 14,
            pageHeight - 10,
            { align: 'right' }
          );
        },
      });

      doc.save(`Customer_Report_${new Date().toISOString().split('T')[0]}.pdf`);

      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'PDF downloaded successfully!',
      });
    } catch (err) {
      console.error('PDF Generation Error:', err);
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
      header: 'Contact No',
      accessor: 'customerNumber'
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
          className="w-full mt-2 px-3 py-1 bg-[#F97316] text-white text-lg font-semibold rounded-lg hover:bg-[#F97316]"
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
          valueClassName="text-[#F97316] text-3xl"
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
            className="px-4 py-2 bg-[#F97316] text-white rounded-md font-semibold"
          >
            Download Report
          </button>

        </div>
      </div>

      {isListVisible && (
        <CustomTable<CustomerRow>
          data={customerRows}
          columns={tableColumns}
          keyExtractor={(row) => row.id}
          emptyMessage="No customers found for selected period."
        />
      )}
    </div>
  );
};

export default CatalogueCustomerReport;
