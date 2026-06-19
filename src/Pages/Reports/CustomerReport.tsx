import React, { useEffect, useMemo, useState } from 'react';
import type { TableColumn } from '../../Components/CustomTable';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { CustomCard } from '../../Components/CustomCard';
import { CustomTable } from '../../Components/CustomTable';
import { CardVariant } from '../../enums';
import { IconClose, IconSearch } from '../../constants/Icons';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { handleDatePresetChange } from './PNLReportComponents/pnlReport.utils';
import FilterSelect from './SalesReportComponents/FilterSelect';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { type CustomerRow } from './CustomerReportComponents/customerReport.utils';
import useCustomerReport from './CustomerReportComponents/useCustomerReport';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import BackButton from '../../Components/BackButton';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

type CustomerRowWithCredit = CustomerRow & {
  id: string;
  creditNote: number;
};

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

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [customerCreditMap, setCustomerCreditMap] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!currentUser?.companyId) {
      setCustomerCreditMap({});
      return;
    }

    const customersRef = collection(db, 'companies', currentUser.companyId, 'customers');
    const unsubscribe = onSnapshot(
      query(customersRef),
      (snapshot) => {
        const nextMap: Record<string, number> = {};
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, unknown>;
          const credit = Number(data.creditBalance || 0);
          const numberKey = String(data.number || '').trim();
          const nameKey = String(data.name || '').trim().toLowerCase();

          if (numberKey) nextMap[`num:${numberKey}`] = Number.isFinite(credit) ? credit : 0;
          if (nameKey) nextMap[`name:${nameKey}`] = Number.isFinite(credit) ? credit : 0;
        });
        setCustomerCreditMap(nextMap);
      },
      () => setCustomerCreditMap({}),
    );

    return unsubscribe;
  }, [currentUser?.companyId]);

  const { customerRows, summary } = useMemo(() => {
    if (!appliedFilters) {
      return {
        filteredSales: [],
        customerRows: [] as CustomerRowWithCredit[],
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
    const map = new Map<string, CustomerRowWithCredit>();

    newFilteredSales.forEach((sale) => {
      const key = sale.partyName;

      if (!map.has(key)) {
        map.set(key, {
          id: `${sale.partyName}-${sale.partyNumber || 'N/A'}`,
          customerName: sale.partyName,
          customerNumber: sale.partyNumber || 'N/A',
          totalBills: 0,
          totalSales: 0,
          totalDue: 0,
          creditNote: 0,
          sortKey: 'customerName', // FIX: Added required sortKey property
        });
      }

      const row = map.get(key)!;

      if (!(sale as any).isOpeningBalance) {
        row.totalBills += 1;
        row.totalSales += sale.totalAmount;
      }


      const due = sale.dueAmount || 0;
      if (due > 0) {
        row.totalDue += due;
      }
    });

    let customerRows = Array.from(map.values());
    customerRows = customerRows.map((row) => {
      const byNumber = customerCreditMap[`num:${row.customerNumber}`];
      const byName = customerCreditMap[`name:${row.customerName.toLowerCase()}`];
      const creditNote = byNumber ?? byName ?? 0;
      return { ...row, creditNote: Math.max(0, Number(creditNote || 0)) };
    });

    const trimmedQuery = searchQuery.toLowerCase().trim();
    if (trimmedQuery) {
      customerRows = customerRows.filter((c) =>
        c.customerName.toLowerCase().includes(trimmedQuery) ||
        c.customerNumber.toLowerCase().includes(trimmedQuery),
      );
    }

    if (sortConfig?.key) {
      customerRows.sort((a, b) => {
        const key = sortConfig.key as keyof CustomerRowWithCredit;

        const aValue = a[key];
        const bValue = b[key];

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.localeCompare(bValue);
          return sortConfig.direction === 'asc' ? comparison : -comparison;
        }

        const numA = Number(aValue || 0);
        const numB = Number(bValue || 0);

        const comparison = numA - numB;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    /* ---------- SUMMARY METRICS ---------- */
    const totalCustomers = customerRows.length;
    const totalBills = newFilteredSales.filter(
      (s) => !(s as any).isOpeningBalance
    ).length;
    const totalSales = newFilteredSales.reduce(
      (sum, s) => (s as any).isOpeningBalance ? sum : sum + s.totalAmount,
      0,
    );
    const totalDue = customerRows.reduce((sum, c) => sum + Math.max(0, c.totalDue), 0);

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
  }, [sales, appliedFilters, searchQuery, customerCreditMap, sortConfig]);

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
      const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
        font: { name: 'Arial', ...font },
        fill: fill ?? {},
        alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true },
        border: border ?? {},
      });
      const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
      const allBorders = {
        top: { style: 'thin', color: { rgb: 'CBD5E1' } },
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } },
      };
      const bblr = {
        bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } },
      };

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

      const periodLabel = appliedFilters
        ? `Period: ${startDate} – ${endDate}`
        : 'Period: All';

      // ── COLUMN DEFINITIONS ───────────────────────────────────────────
      const COLS = [
        { header: '#', width: 6 },
        { header: 'Customer', width: 24 },
        { header: 'Phone', width: 20 },
        { header: 'Bills', width: 16 },
        { header: 'Sales (₹)', width: 28 },
        { header: 'Due (₹)', width: 26 },
        { header: 'Credit Note (₹)', width: 26 },
      ];
      const colCount = COLS.length;

      // Row layout:
      // 0  → Title  (merged)
      // 1  → Meta   (merged)
      // 2  → blank spacer
      // 3  → Summary label (merged)
      // 4  → Summary values
      // 5  → blank spacer
      // 6  → Column headers
      // 7+ → Data rows
      // Last → Totals footer

      const dataStartRow = 7;
      const totalRows = dataStartRow + customerRows.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = 'Customer Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Customers: ${summary.totalCustomers}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Total Customers: ${summary.totalCustomers}   |   Total Sales: ₹${summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Total Due: ₹${summary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Sale: ₹${Math.round(summary.averageSalePerCustomer).toLocaleString('en-IN')}`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      customerRows.forEach((row, idx) => {
        const r = dataStartRow + idx;
        const formattedName = row.customerName
          ? row.customerName.charAt(0).toUpperCase() + row.customerName.slice(1).toLowerCase()
          : 'N/A';
        aoa[r][0] = idx + 1;
        aoa[r][1] = formattedName;
        aoa[r][2] = row.customerNumber || 'N/A';
        aoa[r][3] = row.totalBills;
        aoa[r][4] = Math.round(row.totalSales);
        aoa[r][5] = Math.round(Math.max(0, row.totalDue));
        aoa[r][6] = Math.round(row.creditNote || 0);
      });

      // Footer row
      const footerRow = dataStartRow + customerRows.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = `${customerRows.length} customers`;
      aoa[footerRow][3] = summary.totalBills;
      aoa[footerRow][4] = Math.round(summary.totalSales);
      aoa[footerRow][5] = Math.round(summary.totalDue);
      aoa[footerRow][6] = Math.round(customerRows.reduce((sum, c) => sum + (c.creditNote || 0), 0));

      // ── BUILD WORKSHEET ─────────────────────────────────────────────
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 36 }, // 0 title
        { hpt: 20 }, // 1 meta
        { hpt: 8 }, // 2 spacer
        { hpt: 18 }, // 3 summary label
        { hpt: 22 }, // 4 summary values
        { hpt: 8 }, // 5 spacer
        { hpt: 28 }, // 6 headers
        ...customerRows.map(() => ({ hpt: 20 })),
        { hpt: 24 }, // footer
      ];

      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
        { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 2 } },
      ];

      const style = (addr: string, st: any) => {
        if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
        worksheet[addr].s = st;
      };

      // ── APPLY STYLES ────────────────────────────────────────────────

      // Title (row 0)
      style('A1', s(
        { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
        solidFill('2563EB'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Meta (row 1)
      style('A2', s(
        { sz: 9, italic: true, color: { rgb: '475569' } },
        solidFill('DBEAFE'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Summary label (row 3)
      style('A4', s(
        { sz: 10, bold: true, color: { rgb: '1D4ED8' } },
        solidFill('EFF6FF'),
        { horizontal: 'left', vertical: 'center' },
        allBorders,
      ));

      style('A5', s(
        { sz: 10, bold: true, color: { rgb: '166534' } },
        solidFill('DCFCE7'),
        { horizontal: 'center', vertical: 'center' },
        bblr,
      ));

      // Column headers (row 6)
      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          solidFill('1E40AF'),
          { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      // Currency column indices: 4 = Sales, 5 = Due, 6 = Credit Note
      const currencyCols = new Set([4, 5, 6]);

      // Data rows
      customerRows.forEach((_row, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');

        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isCurrency = currencyCols.has(ci);
          const isNumeric = ci === 3 || isCurrency; // Bills col too
          style(addr, s(
            { sz: 9, color: { rgb: '1E293B' } },
            rowBg,
            { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
            bblr,
          ));
          if (worksheet[addr] && isCurrency) {
            worksheet[addr].t = 'n';
            worksheet[addr].z = '₹#,##0.00';
          }
        }
      });

      // Footer row
      for (let ci = 0; ci < colCount; ci++) {
        const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: '1E293B' } },
          solidFill('E2E8F0'),
          { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
          {
            top: { style: 'medium', color: { rgb: '1E293B' } },
            bottom: { style: 'medium', color: { rgb: '1E293B' } },
            left: { style: 'thin', color: { rgb: 'CBD5E1' } },
            right: { style: 'thin', color: { rgb: 'CBD5E1' } },
          },
        ));
        if ([4, 5, 6].includes(ci) && worksheet[addr]) {
          worksheet[addr].t = 'n';
          worksheet[addr].z = '₹#,##0.00';
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Report');
      XLSX.writeFile(workbook, `Customer-Report-${startDate}-to-${endDate}.xlsx`);

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
  const downloadAsPdf = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
       // ===== GENERATION TAG (drawn first, reserves space for logo) =====
      const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);

      const textWidth = doc.getTextWidth(tagText);
      const paddingX = 2;
      const boxWidth = textWidth + paddingX * 2;
      const boxHeight = 5;

      const logoReservedWidth = 25; // space reserved for logo + gap, so tag never overlaps it
      const boxX = pageWidth - 14 - logoReservedWidth - boxWidth;
      const boxY = 10;

      doc.setFillColor(245, 245, 245);
      doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');

      doc.setTextColor(80, 80, 80);
      doc.text(tagText, boxX + paddingX, boxY + 3.5);

      doc.setTextColor(0, 0, 0);

      // ===== LOGO (drawn after, in its own reserved slot at top-right corner) =====
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
        head: [['CUSTOMER', 'PHONE', 'BILLS', 'SALES (Rs.)', 'DUE (Rs.)', 'CREDIT NOTE (Rs.)']],
        body: customerRows.map((c) => {
          const formattedName = c.customerName
            ? c.customerName.charAt(0).toUpperCase() + c.customerName.slice(1).toLowerCase()
            : 'N/A';

          return [
            formattedName,
            c.customerNumber || 'N/A',
            c.totalBills.toString(),
            c.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            Math.max(0, c.totalDue).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            (c.creditNote || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
          ];
        }),
        foot: [
          [
            'TOTAL',
            '-',
            summary.totalBills.toString(),
            summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            summary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            customerRows
              .reduce((sum, c) => sum + (c.creditNote || 0), 0)
              .toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
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
          3: { halign: 'right', cellWidth: 34 },
          4: { halign: 'right', cellWidth: 30 },
          5: { halign: 'right', cellWidth: 36 },
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
  const tableColumns: TableColumn<CustomerRowWithCredit>[] = [
    {
      header: 'Customer',
      accessor: 'customerName',
      sortKey: 'customerName',
      className: 'py-3 text-center w-1/5',
    },
    {
      header: 'Phone Number',
      accessor: 'customerNumber',
      sortKey: 'customerNumber',
      className: 'py-3 text-center w-1/4',
    },
    {
      header: 'Bills',
      accessor: 'totalBills',
      sortKey: 'totalBills',
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
      accessor: (row) => `₹${Math.max(0, row.totalDue).toLocaleString('en-IN')}`,
      sortKey: 'totalDue',
      className: 'py-3 text-center w-1/5',
    },
    {
      header: 'Credit Note',
      accessor: (row) => `₹${(row.creditNote || 0).toLocaleString('en-IN')}`,
      sortKey: 'creditNote' as any,
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
        <BackButton />
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Customer Report</h1>
        <button onClick={() => setShowSearch(true)} className="p-2">
          <IconSearch />
        </button>
      </div>

      {showSearch && (
        <div className="flex justify-center mb-2 px-2">
          <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-blue-700">
            <input
              type="text"
              placeholder="Search by Customer..."
              className="flex-1 text-base font-light p-2 outline-none bg-transparent text-center"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            <button
              onClick={() => {
                setSearchQuery('');
                setShowSearch(false);
              }}
              className="p-1 text-gray-500 hover:text-black"
            >
              <IconClose />
            </button>
          </div>
        </div>
      )}

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
        <CustomTable<CustomerRowWithCredit>
          data={customerRows}
          columns={tableColumns}
          keyExtractor={(row) => row.id}
          onSort={(key) => handleSort(key as any)}
          sortConfig={sortConfig as any}
          emptyMessage="No customers found for selected period."
        />
      )}
    </div>
  );
};

export default CustomerReport;