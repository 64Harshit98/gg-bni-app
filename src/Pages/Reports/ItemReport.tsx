import React, { useMemo, useState } from 'react';
import {
  Download,
  Eye,
  EyeOff,
  Package,
  Search,
  X,
} from 'lucide-react';
import useItemReport from './ItemReportComponents/useItemReport';
import type { Item } from '../../constants/models';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import BackButton from '../../Components/BackButton';
import { getItemColumns } from '../../constants/TableColoumns';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import FilterSelect from './ItemReportComponents/FilterSelect';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { useAuth } from '../../context/auth-context'
import { Button } from '../../Components/ui/button';
import { Input } from '../../Components/ui/input';
import { Spinner } from '../../Components/ui/spinner';
import { EmptyState } from '../../Components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../Components/ui/table';
import { Pagination } from '../../Components/ui/pagination';
import { usePagination } from '../../hooks/usePagination';

// Import your Modal and State
import { Modal } from '../../constants/Modal'; // Adjust path to where you saved the Modal code
import { State } from '../../enums';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
const ITEMS_PAGE_SIZE = 25;
// --- Helper Component ---

const ItemReport: React.FC = () => {
  const { currentUser } = useAuth();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
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
      const matchesSearch =
        !searchQuery ||
        (item.name && item.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;
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
  }, [appliedItemGroupId, sortConfig, items, searchQuery]);

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

  const prepareExportDataForPdf = (item: Item) => {
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
  // const prepareExportDataForExcel = (item: Item) => {
  //   const salePrice = item.salesPrice ||
  //     (item.mrp && item.discount ? parseFloat((item.mrp * (1 - item.discount / 100)).toFixed(2)) : item.mrp || 0);

  //   return {
  //     name: item.name || '-',
  //     barcode: item.barcode || '-',
  //     itemGroup: getGroupName(item.itemGroupId),
  //     mrp: item.mrp || 0,
  //     purchasePrice: item.purchasePrice || 0,
  //     purchaseDiscount: item.purchasediscount || 0,
  //     salesPrice: salePrice,
  //     discount: item.discount || 0,
  //     tax: item.tax || 0,
  //     taxRate: item.taxRate || 0,
  //     gst: item.gst || 0,
  //     hsnSac: item.hsnSac || '-',
  //     unit: item.unit || '-',
  //     packetSize: item.packetSize || 0,
  //     unitMultiplier: item.unitMultiplier || 0,
  //     moq: item.moq || 0,
  //     stock: item.stock || 0,
  //     restockQuantity: item.restockQuantity || 0,
  //     description: item.description || '-',
  //   };
  // };

  const downloadAsPdf = async () => {
    try {
      // Landscape A4 for wide data tables
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();

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

      const logoReservedWidth = 20; // space reserved for logo + gap, so tag never overlaps it
      const boxX = pageWidth - margin - logoReservedWidth - boxWidth;
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

      // --- Embed logo (drawn after, in its own reserved slot at top-right corner) ---
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

      const exportData = filteredItems.map(prepareExportDataForPdf);

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
          if (key === 'name') {
          columnStyles[index] = { cellWidth: 48 };
        } else if (key === 'purchasePrice') {
          columnStyles[index] = { cellWidth: 30, halign: 'right' };
        } else if (key === 'mrp') {
          columnStyles[index] = { cellWidth: 20, halign: 'right' };
        } else if (key === 'discount') {
          columnStyles[index] = { cellWidth: 29, halign: 'right' };
        } else if (key === 'tax') {
          columnStyles[index] = { cellWidth: 25, halign: 'right' };
        } else if (key === 'stock') {
          columnStyles[index] = { cellWidth: 25, halign: 'right' };
        } else if (key === 'barcode') {
          columnStyles[index] = { cellWidth: 28 };
        } else if (key === 'restockQuantity') {
          columnStyles[index] = { cellWidth: 30, halign: 'right' };
        } else if (numericColumns.includes(key)) {
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
          const pageCount = (doc.internal as any).getNumberOfPages();
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

      const groupLabel = appliedItemGroupId
        ? `Group: ${itemGroups.find(g => g.id === appliedItemGroupId)?.name ?? appliedItemGroupId}`
        : 'Group: All';

      // ── COLUMN DEFINITIONS ──────────────────────────────────────────────
      const COLS = [
        { header: '#', width: 6 },
        { header: 'Name', width: 28 },
        { header: 'Barcode', width: 18 },
        { header: 'Item Group', width: 20 },
        { header: 'MRP (₹)', width: 14 },
        { header: 'Cost Price (₹)', width: 16 },
        { header: 'Sale Price (₹)', width: 16 },
        { header: 'Discount (%)', width: 14 },
        { header: 'Tax (%)', width: 12 },
        { header: 'GST', width: 10 },
        { header: 'HSN/SAC', width: 14 },
        { header: 'Unit', width: 10 },
        { header: 'Stock', width: 10 },
        { header: 'Restock Qty', width: 13 },
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
      const totalRows = dataStartRow + filteredItems.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = 'Detailed Item Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   ${groupLabel}   |   Total Items: ${summary.totalItems}`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Avg MRP: ₹${summary.averageMrp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Cost: ₹${summary.averagePurchasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Sale: ₹${summary.averageSalePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Margin: ₹${summary.averageProfitMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Margin %: ${summary.averageMarginPercentage.toFixed(1)}%`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      filteredItems.forEach((item, idx) => {
        const r = dataStartRow + idx;
        const salePrice =
          (item as any).salesPrice ||
          (item.mrp && item.discount
            ? parseFloat((item.mrp * (1 - item.discount / 100)).toFixed(2))
            : item.mrp || 0);

        aoa[r][0] = idx + 1;
        aoa[r][1] = item.name || '-';
        aoa[r][2] = item.barcode || '-';
        aoa[r][3] = getGroupName(item.itemGroupId);
        aoa[r][4] = item.mrp || 0;
        aoa[r][5] = item.purchasePrice || 0;
        aoa[r][6] = salePrice;
        aoa[r][7] = item.discount || 0;
        aoa[r][8] = item.tax || 0;
        aoa[r][9] = (item as any).gst || 0;
        aoa[r][10] = (item as any).hsnSac || '-';
        aoa[r][11] = (item as any).unit || '-';
        aoa[r][12] = item.stock || 0;
        aoa[r][13] = item.restockQuantity || 0;
      });

      // Footer row
      const footerRow = dataStartRow + filteredItems.length;
      aoa[footerRow][0] = 'TOTAL';
      aoa[footerRow][1] = `${summary.totalItems} items`;
      aoa[footerRow][4] = summary.averageMrp;          // avg MRP
      aoa[footerRow][5] = summary.averagePurchasePrice; // avg cost
      aoa[footerRow][6] = summary.averageSalePrice;     // avg sale

      // ── BUILD WORKSHEET ──────────────────────────────────────────────────
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
        ...filteredItems.map(() => ({ hpt: 20 })),
        { hpt: 24 }, // footer
      ];

      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
        { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
        { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 3 } },
      ];

      const style = (addr: string, st: any) => {
        if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
        worksheet[addr].s = st;
      };

      // ── APPLY STYLES ──────────────────────────────────────────────────────

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
          { horizontal: i <= 3 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      // Numeric column indices (for right-align + number formatting)
      const numericCols = new Set([4, 5, 6, 7, 8, 9, 12, 13]);

      // Data rows
      filteredItems.forEach((item, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');
        const salePrice =
          (item as any).salesPrice ||
          (item.mrp && item.discount
            ? parseFloat((item.mrp * (1 - item.discount / 100)).toFixed(2))
            : item.mrp || 0);
        const isLowMargin = salePrice > 0 && item.purchasePrice
          ? (salePrice - item.purchasePrice) / salePrice < 0.05
          : false;

        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isNumeric = numericCols.has(ci);
          style(addr, s(
            {
              sz: 9,
              color: { rgb: isLowMargin && ci === 6 ? 'DC2626' : '1E293B' },
              bold: isLowMargin && ci === 6,
            },
            rowBg,
            { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
            bblr,
          ));
          // Apply number formatting for currency/numeric columns
          if (worksheet[addr] && isNumeric) {
            const isCurrency = [4, 5, 6].includes(ci);
            worksheet[addr].t = 'n';
            worksheet[addr].z = isCurrency ? '₹#,##0.00' : '#,##0.##';
          }
        }
      });

      // Footer row
      for (let ci = 0; ci < colCount; ci++) {
        const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
        style(addr, s(
          { sz: 10, bold: true, color: { rgb: '1E293B' } },
          solidFill('E2E8F0'),
          { horizontal: ci <= 3 ? 'left' : 'center', vertical: 'center' },
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
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Item Report');
      XLSX.writeFile(workbook, 'item_report.xlsx');

      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Excel file downloaded successfully!',
      });
    } catch (e) {
      console.error(e);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate Excel file.',
      });
    }
  };

  const tableColumns = useMemo(() => getItemColumns(itemGroups), [itemGroups]);

  const {
    currentPage,
    totalPages,
    pageItems,
    goToPage,
  } = usePagination<Item>({ totalItems: filteredItems.length, pageSize: ITEMS_PAGE_SIZE });

  const paginatedItems = useMemo(() => pageItems(filteredItems), [pageItems, filteredItems]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="aurora min-h-screen bg-background pb-16">
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

      <header className="glass sticky top-0 z-10 flex items-center gap-3 border-b border-border px-4 py-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Item <span className="text-gradient">Report</span>
          </h1>
          <p className="text-xs text-muted-foreground">Pricing, margins &amp; stock across your catalogue</p>
        </div>
        <button
          type="button"
          onClick={() => setShowSearch((prev) => !prev)}
          aria-label="Search items"
          className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs transition hover:text-foreground"
        >
          <Search className="size-4" />
        </button>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        {showSearch && (
          <div className="mb-4 flex justify-center">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="pl-9 pr-9"
              />
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setShowSearch(false);
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        )}

        <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Filters
          </h2>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
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
            <Button onClick={handleApplyFilters} className="sm:w-28">
              Apply
            </Button>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
          <CustomCard
            variant={CardVariant.Summary}
            title="Total Items"
            value={Math.round(summary.totalItems).toString()}
          />
          <CustomCard
            variant={CardVariant.Summary}
            title="Average MRP"
            value={`₹${Math.round(summary.averageMrp).toLocaleString('en-IN')}`}
          />
          <CustomCard
            variant={CardVariant.Summary}
            title="Avg. Cost Price"
            value={`₹${Math.round(summary.averagePurchasePrice).toLocaleString('en-IN')}`}
          />
          <CustomCard
            variant={CardVariant.Summary}
            title="Avg. Sale Price"
            value={`₹${Math.round(summary.averageSalePrice).toLocaleString('en-IN')}`}
          />
          <CustomCard
            variant={CardVariant.Summary}
            title="Avg. Margin"
            value={`₹${Math.round(summary.averageProfitMargin).toLocaleString('en-IN')}`}
          />
          <CustomCard
            variant={CardVariant.Summary}
            title="Avg. Margin %"
            value={`${Math.round(summary.averageMarginPercentage).toFixed(0)} %`}
          />
        </div>

        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs md:flex-row md:items-center md:justify-between">
          <h2 className="text-center text-lg font-semibold text-foreground md:text-left">Report Details</h2>
          <div className="flex items-stretch gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsListVisible(!isListVisible)}
              className="flex-1 md:flex-none"
            >
              {isListVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {isListVisible ? 'Hide List' : 'Show List'}
            </Button>

            {/* Single Download Button triggers the Choice Modal */}
            <Button
              type="button"
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
              className="flex-1 md:flex-none"
            >
              <Download className="size-4" />
              Download Report
            </Button>
          </div>
        </div>

        {isListVisible && (
          filteredItems.length === 0 ? (
            <EmptyState
              icon={<Package />}
              title="No items found"
              description="Try adjusting your search or item group filter."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    {tableColumns.map((col) => (
                      <TableHead key={col.header} className={col.className}>
                        {col.sortKey ? (
                          <button
                            type="button"
                            onClick={() => handleSort(col.sortKey as keyof Item)}
                            className="inline-flex items-center gap-1 transition hover:text-foreground"
                          >
                            {col.header}
                            {sortConfig.key === col.sortKey && (
                              <span className="text-primary">{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                            )}
                          </button>
                        ) : (
                          col.header
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((item) => (
                    <TableRow key={item.id ?? item.name}>
                      {tableColumns.map((col) => (
                        <TableCell key={col.header} className={col.className}>
                          {typeof col.accessor === 'function' ? col.accessor(item) : String(item[col.accessor as keyof Item] ?? '-')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                  totalItems={filteredItems.length}
                  pageSize={ITEMS_PAGE_SIZE}
                />
              )}
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default ItemReport;