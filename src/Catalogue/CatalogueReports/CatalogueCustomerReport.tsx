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
import { handleDatePresetChange } from '../../Pages/Reports/PNLReportComponents/pnlReport.utils';
import ReportDateFilter from '../../Components/ReportDateFilter';
import DownloadChoiceModal from '../../Pages/Reports/ItemReportComponents/DownloadChoiceModal';
import { type CustomerRow } from '../../Pages/Reports/CustomerReportComponents/customerReport.utils';
type CustomerRowWithCredit = CustomerRow & { creditNote: number };
import useCustomerReport from '../hooks/useCustomerReport';
//import CataShowWrapper from '../../context/CataShowWrapper';
//import { Cata_Permissions } from '../enum/cata_permissions.enum';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import BackButton from '../../Components/BackButton';
import { Spinner } from '../../Components/ui/spinner';


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
      (s) => (s.createdAt.getTime() >= start && s.createdAt.getTime() <= end),
    );
  }, [sales, appliedFilters]);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [customerCreditMap, setCustomerCreditMap] = useState<Record<string, number>>({});
  // const [obAdvanceMap, setObAdvanceMap] = useState<Record<string, number>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: keyof CustomerRowWithCredit;
    direction: 'asc' | 'desc';
  }>({
    key: 'totalSales',
    direction: 'desc',
  });

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
  // useEffect(() => {
  //   if (!currentUser?.companyId) {
  //     setObAdvanceMap({});
  //     return;
  //   }

  //   const obRef = collection(db, 'companies', currentUser.companyId, 'openingBalances');
  //   const unsubscribe = onSnapshot(
  //     query(obRef),
  //     (snapshot) => {
  //       const nextMap: Record<string, number> = {};
  //       snapshot.forEach((docSnap) => {
  //         const data = docSnap.data() as Record<string, unknown>;
  //         if ((data.balanceType ?? 'advance') !== 'advance') return;
  //         if (data.source !== 'catalogue') return;  // ← ADD THIS

  //         const amount = Number(data.amount ?? 0);
  //         const numberKey = String(data.partyNumber || '').trim();
  //         const nameKey = String(data.partyName || '').trim().toLowerCase();

  //         if (numberKey) {
  //           nextMap[`num:${numberKey}`] = (nextMap[`num:${numberKey}`] || 0) + amount;
  //         }
  //         if (nameKey) {
  //           nextMap[`name:${nameKey}`] = (nextMap[`name:${nameKey}`] || 0) + amount;
  //         }
  //       });
  //       setObAdvanceMap(nextMap);
  //     },
  //     () => setObAdvanceMap({}),
  //   );

  //   return unsubscribe;
  // }, [currentUser?.companyId]);

  /* ---------- CUSTOMER AGGREGATION ---------- */
  const customerRows: CustomerRowWithCredit[] = useMemo(() => {
    const map = new Map<string, CustomerRowWithCredit>();

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
          creditNote: 0,
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

    let result = Array.from(map.values());
    result = result.map((row) => {
      const byNumber = customerCreditMap[`num:${row.customerNumber}`];
      const byName = customerCreditMap[`name:${row.customerName.toLowerCase()}`];
      // ✅ Sirf customers collection se lo — advance ab wahan store hota hai
      const creditNote = byNumber ?? byName ?? 0;
      return { ...row, creditNote: Math.max(0, Number(creditNote || 0)) };
    });

    // 🔍 SEARCH FILTER
    const trimmedQuery = searchQuery.toLowerCase().trim();

    if (trimmedQuery) {
      result = result.filter((c) =>
        c.customerName.toLowerCase().includes(trimmedQuery) ||
        c.customerNumber.toLowerCase().includes(trimmedQuery)
      );
    }

    result.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;

      const valA = a[key];
      const valB = b[key];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * direction;
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * direction;
      }

      return 0;
    });

    return result;
  }, [filteredSales, searchQuery, customerCreditMap, sortConfig]);

  /* ---------- SUMMARY METRICS ---------- */
  const metrics = useMemo(() => {
    const totalCustomers = customerRows.length;

    const totalBills = filteredSales.filter(
      (s) => !(s as any).isOpeningBalance
    ).length;

    const totalDue = customerRows.reduce(
      (sum, c) => sum + Math.max(0, c.totalDue),
      0
    );

    const totalSales = filteredSales.reduce(
      (sum, s) => (s as any).isOpeningBalance ? sum : sum + s.totalAmount,
      0,
    );

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

  const onDatePresetChange = (preset: string) =>
    handleDatePresetChange(preset, setDatePreset, setStartDate, setEndDate);

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    setDatePreset('custom');
  };
  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    setDatePreset('custom');
  };
  // /* ---------- EXPORT HELPERS ---------- */
  // const prepareExportData = (row: CustomerRowWithCredit) => ({
  //   customerName: row.customerName,
  //   totalBills: row.totalBills,
  //   totalSales: row.totalSales,
  //   totalDue: row.totalDue,
  //   creditNote: row.creditNote || 0,
  // });

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
        top: { style: 'thin', color: { rgb: 'FED7AA' } },
        bottom: { style: 'thin', color: { rgb: 'FED7AA' } },
        left: { style: 'thin', color: { rgb: 'FED7AA' } },
        right: { style: 'thin', color: { rgb: 'FED7AA' } },
      };
      const bblr = {
        bottom: { style: 'thin', color: { rgb: 'FED7AA' } },
        left: { style: 'thin', color: { rgb: 'FED7AA' } },
        right: { style: 'thin', color: { rgb: 'FED7AA' } },
      };

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

      const COLS = [
        { header: '#', width: 6 },
        { header: 'Customer Name', width: 28 },
        { header: 'Contact No', width: 20 },
        { header: 'Total Bills', width: 16 },
        { header: 'Total Sales (₹)', width: 22 },
        { header: 'Total Due (₹)', width: 20 },
        { header: 'Credit Note (₹)', width: 20 },
      ];
      const colCount = COLS.length;

      // Row layout:
      // 0 → Title (merged)
      // 1 → Meta (merged)
      // 2 → blank spacer
      // 3 → Summary label (merged)
      // 4 → Summary values
      // 5 → blank spacer
      // 6 → Column headers
      // 7+ → Data rows
      // Last → Totals footer

      const dataStartRow = 7;
      const totalCreditNote = customerRows.reduce((sum, c) => sum + (c.creditNote || 0), 0);
      const totalRows = dataStartRow + customerRows.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = 'Customer Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   Total Customers: ${metrics.totalCustomers}   |   Total Bills: ${metrics.totalBills}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Total Customers: ${metrics.totalCustomers}   |   Total Bills: ${metrics.totalBills}   |   Total Due: ₹${metrics.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Sale: ₹${Math.round(metrics.averageSalePerCustomer).toLocaleString('en-IN')}`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      customerRows.forEach((row, idx) => {
        const r = dataStartRow + idx;
        aoa[r][0] = idx + 1;
        aoa[r][1] = row.customerName || '-';
        aoa[r][2] = row.customerNumber || 'N/A';
        aoa[r][3] = row.totalBills;
        aoa[r][4] = row.totalSales;
        aoa[r][5] = Math.max(0, row.totalDue);
        aoa[r][6] = row.creditNote || 0;
      });

      // Footer row
      const footerRow = dataStartRow + customerRows.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = `${customerRows.length} customers`;
      aoa[footerRow][3] = metrics.totalBills;
      aoa[footerRow][4] = metrics.totalSales;
      aoa[footerRow][5] = metrics.totalDue;
      aoa[footerRow][6] = totalCreditNote;

      // ── BUILD WORKSHEET ──────────────────────────────────────────────
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

      // Title (row 0) — deep orange
      style('A1', s(
        { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
        solidFill('EA580C'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Meta (row 1) — light orange tint
      style('A2', s(
        { sz: 9, italic: true, color: { rgb: '7C2D12' } },
        solidFill('FFEDD5'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Summary label (row 3)
      style('A4', s(
        { sz: 10, bold: true, color: { rgb: 'C2410C' } },
        solidFill('FFF7ED'),
        { horizontal: 'left', vertical: 'center' },
        allBorders,
      ));

      style('A5', s(
        { sz: 10, bold: true, color: { rgb: '9A3412' } },
        solidFill('FFF7ED'),
        { horizontal: 'center', vertical: 'center' },
        bblr,
      ));

      // Column headers (row 6) — dark orange header bar
      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          solidFill('C2410C'),
          { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      // Data rows
      customerRows.forEach((_row, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'FFF7ED' : 'FFFFFF');

        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isNumeric = ci >= 3;
          style(addr, s(
            { sz: 9, color: { rgb: '1E293B' } },
            rowBg,
            { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
            bblr,
          ));
          // Format currency columns (Sales, Due, Credit Note)
          if ((ci === 4 || ci === 5 || ci === 6) && worksheet[addr]) {
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
          solidFill('FED7AA'),
          { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
          {
            top: { style: 'medium', color: { rgb: '1E293B' } },
            bottom: { style: 'medium', color: { rgb: '1E293B' } },
            left: { style: 'thin', color: { rgb: 'FED7AA' } },
            right: { style: 'thin', color: { rgb: 'FED7AA' } },
          },
        ));
        if ((ci === 4 || ci === 5 || ci === 6) && worksheet[addr]) {
          worksheet[addr].t = 'n';
          worksheet[addr].z = '₹#,##0.00';
        }
      }

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Customer Report');
      XLSX.writeFile(workbook, `Customer-Report-${new Date().toISOString().split('T')[0]}.xlsx`);

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

      doc.setFontSize(16);

      const pageHeight = doc.internal.pageSize.getHeight();

      // ===== CLEAN GENERATION TAG (drawn first, reserves space for logo) =====
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

      const logoReservedWidth = 18; // space reserved for logo + gap, so tag never overlaps it
      const boxX = pageWidth - margin - logoReservedWidth - boxWidth;
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

      // Embed company logo (drawn after, in its own reserved slot at top-right corner)
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
            metrics.totalBills.toString(),
            metrics.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            metrics.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            customerRows.reduce((sum, c) => sum + (c.creditNote || 0), 0)
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
          1: { halign: 'center', cellWidth: 30 },
          2: { halign: 'right', cellWidth: 20 },
          3: { halign: 'right', cellWidth: 30 },
          4: { halign: 'right', cellWidth: 30 },
          5: { halign: 'right', cellWidth: 30 },
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
          const pageCount = (doc as any).getNumberOfPages() || 0;
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
  const tableColumns: TableColumn<CustomerRowWithCredit>[] = [
    {
      header: 'Customer',
      accessor: 'customerName',
      sortKey: 'customerName',
    },
    {
      header: 'Contact No',
      accessor: 'customerNumber',
      sortKey: 'customerNumber',
    },
    {
      header: 'Bills',
      accessor: 'totalBills',
      sortKey: 'totalBills',
      className: 'text-right',
    },
    {
      header: 'Total Sales',
      accessor: (row) => `₹${row.totalSales.toLocaleString('en-IN')}`,
      sortKey: 'totalSales',
      className: 'text-center',
    },
    {
      header: 'Total Due',
      accessor: (row) => `₹${Math.max(0, row.totalDue).toLocaleString('en-IN')}`,
      sortKey: 'totalDue',
      className: 'text-center',
    },
    {
      header: 'Credit Note',
      accessor: (row) => `₹${(row.creditNote || 0).toLocaleString('en-IN')}`,
      sortKey: 'creditNote',
      className: 'text-center',
    },
  ];

  const handleSort = (key: keyof CustomerRowWithCredit) => {
    let direction: 'asc' | 'desc' = 'asc';

    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }

    setSortConfig({ key, direction });
  };

  /* ---------- STATES ---------- */
  if (authLoading || loading)
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <Spinner size="xl" />
        <p className="text-sm font-medium">Loading Report...</p>
      </div>
    );
  if (error)
    return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  if (!currentUser) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-muted p-2">
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

        <BackButton />

        {/* TITLE */}
        <h1 className="flex-1 text-xl text-center font-bold text-foreground">
          Customer Report
        </h1>

        <button onClick={() => setShowSearch(true)} className="p-2">
          <IconSearch />
        </button>

      </div>

      {showSearch && (
        <div className="flex justify-center mb-2 px-2">
          <div className="flex items-center w-full max-w-md border-b-2 border-border focus-within:border-[#F97316]">

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
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <IconClose />
            </button>

          </div>
        </div>
      )}

      {/* FILTERS */}
      <ReportDateFilter
        datePreset={datePreset}
        startDate={startDate}
        endDate={endDate}
        onPresetChange={onDatePresetChange}
        onStartDateChange={handleStartDateChange}
        onEndDateChange={handleEndDateChange}
        onApply={handleApplyFilters}
        theme="catalogue"
      />

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
      <div className="bg-card p-4 rounded-sm flex justify-between items-center mt-2">
        <h2 className="text-lg font-semibold text-foreground">Report Details</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-2 bg-muted rounded-sm font-semibold"
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
            className="px-4 py-2 bg-[#F97316] text-white rounded-sm font-semibold"
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
          sortConfig={sortConfig}
          onSort={handleSort}
          emptyMessage="No customers found for selected period."
        />
      )}
    </div>
  );
};

export default CatalogueCustomerReport;
