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
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';

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

  const downloadAsPdf = async () => {
    try {
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
      const pageHeight = doc.internal.pageSize.getHeight();

      // --- 1. BRAND ACCENT BAR ---
      // Uses the #F97316 orange from your UI
      doc.setFillColor(37, 99, 235); // blue-600 
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
            summary.totalBills.toString(),
            summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            summary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
          const pageCount = (doc.internal as any).getNumberOfPages();
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
  // FIX: Updated sortKey to match keys found in CustomerRow for strict type safety
  const tableColumns: TableColumn<CustomerRow>[] = [
    {
      header: 'Customer',
      accessor: 'customerName',
      className: 'py-3 text-center w-1/5',
    },
    {
      header: 'Phone Number',
      accessor: 'customerNumber',
      className: 'py-3 text-center w-1/4',
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
      className: 'py-3 text-center w-1/5',
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