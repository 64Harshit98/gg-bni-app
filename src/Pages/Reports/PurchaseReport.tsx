import React, { useMemo, useState, useEffect } from 'react';
import usePurchaseReports from './PurchaseReportComponents/usePurchaseReports';
import {
  formatDate,
  formatDateForInput,
  type PurchaseRecord,
} from './PurchaseReportComponents/purchaseReports.utils';
import { jsPDF } from 'jspdf';
import ReportDateFilter from '../../Components/ReportDateFilter';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';

import { CustomCard } from '../../Components/CustomCard';
import { CardVariant, State } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import BackButton from '../../Components/BackButton';
import { IconClose, IconSearch } from '../../constants/Icons';
import { getPurchaseColumns } from '../../constants/TableColoumns';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';
import { useAuth } from '../../context/auth-context';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

const PurchaseReport: React.FC = () => {
  const { currentUser } = useAuth();
  const [companyName, setCompanyName] = useState<string>('');

  useEffect(() => {
    const fetchCompanyName = async () => {
      if (!currentUser?.companyId) return;
      try {
        const businessInfoRef = doc(
          db,
          'companies',
          currentUser.companyId,
          'business_info',
          currentUser.companyId,
        );
        const snap = await getDoc(businessInfoRef);
        if (snap.exists()) {
          setCompanyName(snap.data().businessName || '');
        }
      } catch (e) {
        console.error('Failed to fetch company name', e);
      }
    };
    fetchCompanyName();
  }, [currentUser?.companyId]);

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
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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

  const handleStartDateChange = (value: string) => {
    setCustomStartDate(value);
    setDatePreset('custom');
  };
  const handleEndDateChange = (value: string) => {
    setCustomEndDate(value);
    setDatePreset('custom');
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


    const newFilteredPurchases = purchases.filter((purchase) => {
      const matchesDate =
        purchase.createdAt >= appliedFilters.start &&
        purchase.createdAt <= appliedFilters.end;
      const matchesSearch =
        !searchQuery ||
        (purchase.partyName &&
          purchase.partyName
            .toLowerCase()
            .includes(searchQuery.toLowerCase()));
      return matchesDate && matchesSearch;
    });

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
  }, [appliedFilters, purchases, sortConfig, searchQuery]);

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

      // ===== CLEAN GENERATION TAG (drawn first, reserves space for logo) =====
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

      const logoReservedWidth = 25; // space reserved for logo + gap, so tag never overlaps it
      const boxX = pageWidth - margin - logoReservedWidth - boxWidth;
      const boxY = 10;

      // background
      doc.setFillColor(245, 245, 245);
      doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

      // text
      doc.setTextColor(80, 80, 80);
      doc.text(tagText, boxX + paddingX, boxY + 3.5);

      // reset
      doc.setTextColor(0, 0, 0);

      // --- 2. COMPANY LOGO (top-right, drawn after, in its own reserved slot) ---
      try {
        const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
        if (base64Logo) {
          const img = new Image();
          img.src = base64Logo;
          await new Promise<void>((resolve) => {
            img.onload = () => {
              const logoWidth = 15;
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

      // --- 3. HEADER SECTION ---
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39); // gray-900
      doc.setFont('helvetica', 'bold');
      const reportTitle = companyName
        ? `Purchase Report — ${companyName}`
        : 'Purchase Report';
      doc.text(reportTitle, 14, 24);

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
        showFoot: 'lastPage',
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
    if (!appliedFilters) return;
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
      const periodText = `Period: ${formatDate(appliedFilters.start)} → ${formatDate(appliedFilters.end)}`;

      // ── COLUMN DEFINITIONS ──────────────────────────────────────────────
      const COLS = [
        { header: '#', width: 6 },
        { header: 'Date', width: 16 },
        { header: 'Supplier Name', width: 28 },
        { header: 'Items', width: 13 },
        { header: 'Amount (₹)', width: 18 },
        { header: 'Payment Method', width: 22 },
      ];
      const colCount = COLS.length;

      // Row layout:
      // 0  → Title (merged)
      // 1  → Meta (merged)
      // 2  → blank spacer
      // 3  → Summary label (merged)
      // 4  → Summary values
      // 5  → blank spacer
      // 6  → Column headers
      // 7+ → Data rows
      // Last → Totals footer

      const dataStartRow = 7;
      const totalRows = dataStartRow + filteredPurchases.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = companyName
        ? `Purchase Report  —  ${companyName}`
        : 'Purchase Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodText}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Total Orders: ${summary.totalOrders}   |   Items Purchased: ${summary.totalItemsPurchased}   |   Total Cost: ₹${summary.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      filteredPurchases.forEach((purchase, idx) => {
        const r = dataStartRow + idx;
        const totalItems = purchase.items.reduce((sum, i) => sum + i.quantity, 0);
        const paymentMethod =
          Object.entries(purchase.paymentMethods || {})
            .filter(([_, value]) => value > 0)
            .map(([key]) => key.charAt(0).toUpperCase() + key.slice(1))
            .join(', ') || 'N/A';

        aoa[r][0] = idx + 1;
        aoa[r][1] = formatDate(purchase.createdAt);
        aoa[r][2] = purchase.partyName
          ? purchase.partyName.charAt(0).toUpperCase() + purchase.partyName.slice(1).toLowerCase()
          : 'N/A';
        aoa[r][3] = totalItems;
        aoa[r][4] = purchase.totalAmount;
        aoa[r][5] = paymentMethod;
      });

      // Footer row
      const footerRow = dataStartRow + filteredPurchases.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = '';
      aoa[footerRow][2] = '';
      aoa[footerRow][3] = summary.totalItemsPurchased;
      aoa[footerRow][4] = summary.totalPurchases;
      aoa[footerRow][5] = '';

      // ── BUILD WORKSHEET ──────────────────────────────────────────────────
      const ws: any = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = COLS.map(c => ({ wch: c.width }));
      ws['!rows'] = [
        { hpt: 36 }, // 0 title
        { hpt: 20 }, // 1 meta
        { hpt: 8 }, // 2 spacer
        { hpt: 18 }, // 3 summary label
        { hpt: 22 }, // 4 summary values
        { hpt: 8 }, // 5 spacer
        { hpt: 28 }, // 6 headers
        ...filteredPurchases.map(() => ({ hpt: 20 })),
        { hpt: 24 }, // footer
      ];

      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
      ];

      const style = (addr: string, st: any) => {
        if (!ws[addr]) ws[addr] = { t: 's', v: '' };
        ws[addr].s = st;
      };

      // Title
      style('A1', s(
        { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
        solidFill('2563EB'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Meta
      style('A2', s(
        { sz: 9, italic: true, color: { rgb: '475569' } },
        solidFill('DBEAFE'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Summary label
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

      // Column headers (row index 6)
      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: 6, c: i });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
          solidFill('1E40AF'),
          { horizontal: i <= 1 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      // Data rows
      filteredPurchases.forEach((purchase, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');
        const isNegative = purchase.totalAmount < 0;

        [0, 1, 2, 3, 4, 5].forEach(ci => {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isAmount = ci === 4;
          style(addr, s(
            {
              sz: 9,
              color: { rgb: isAmount && isNegative ? 'DC2626' : '1E293B' },
              bold: isAmount && isNegative,
            },
            rowBg,
            { horizontal: ci <= 2 ? 'left' : 'center', vertical: 'center' },
            bblr,
          ));
          if (isAmount && ws[addr]) {
            ws[addr].t = 'n';
            ws[addr].z = '₹#,##0.00';
          }
        });
      });

      // Footer row
      [0, 1, 2, 3, 4, 5].forEach(ci => {
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
        if (ci === 4 && ws[addr]) {
          ws[addr].t = 'n';
          ws[addr].z = '₹#,##0.00';
        }
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Purchase Report');
      XLSX.writeFile(wb, `purchase_report_${formatDateForInput(new Date())}.xlsx`);

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
        <BackButton />
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Purchase Report
        </h1>
        <button onClick={() => setShowSearch(true)} className="p-2">
          <IconSearch />
        </button>
      </div>

      {showSearch && (
        <div className="flex justify-center mb-2 px-2">
          <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-blue-700">
            <input
              type="text"
              placeholder="Search by Name..."
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

      {/* FILTERS */}
      <ReportDateFilter
        datePreset={datePreset}
        startDate={customStartDate}
        endDate={customEndDate}
        onPresetChange={handleDatePresetChange}
        onStartDateChange={handleStartDateChange}
        onEndDateChange={handleEndDateChange}
        onApply={handleApplyFilters}
      />

      {/* SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
        <CustomCard
          className="py-10"
          variant={CardVariant.Summary}
          title="Total Cost"
          value={`₹${Math.round(summary.totalPurchases || 0).toLocaleString('en-IN')}`}
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
          value={`₹${Math.round(summary.averagePurchaseValue || 0).toLocaleString('en-IN')}`}
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

