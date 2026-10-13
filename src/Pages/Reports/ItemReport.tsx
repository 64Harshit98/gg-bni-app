import React, { useMemo, useState, useEffect } from 'react';
import useItemReport from './ItemReportComponents/useItemReport';
import type { Item } from '../../constants/models';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { Spinner } from '../../constants/Spinner';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import BackButton from '../../Components/BackButton';
import { IconClose, IconSearch } from '../../constants/Icons';
import { getItemColumns } from '../../constants/TableColoumns';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import FilterSelect from './ItemReportComponents/FilterSelect';
import ReportDateFilter from '../../Components/ReportDateFilter';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { useAuth } from '../../context/auth-context'
import { useGodowns, useGodownStock, SHOP_ID, SHOP_NAME } from '../hooks/useStockTransfer';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
// Import your Modal and State
import { Modal } from '../../constants/Modal'; // Adjust path to where you saved the Modal code
import { State } from '../../enums';
import { useStockLedger } from '../hooks/useStockLedger';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
// --- Helper Component ---

const ItemReport: React.FC = () => {
  const { currentUser } = useAuth();
  const [showSearch, setShowSearch] = useState(false);
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
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const todayStr = new Date().toISOString().slice(0, 10);
  const last30StartStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return d.toISOString().slice(0, 10);
  })();
  const [fromDate, setFromDate] = useState<string>(last30StartStr);
  const [toDate, setToDate] = useState<string>(todayStr);
  const [datePreset, setDatePreset] = useState<string>('last30');
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

  const { godowns } = useGodowns(currentUser?.companyId);
  const { stockRows } = useGodownStock(currentUser?.companyId, godowns);
  const { ledgerMap } = useStockLedger(currentUser?.companyId, fromDate, toDate, locationFilter);

  // Per-item, per-location quantity map (Shop + every godown).
  const stockByItemLocation = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    stockRows.forEach(r => {
      if (!map.has(r.itemId)) map.set(r.itemId, new Map());
      const inner = map.get(r.itemId)!;
      inner.set(r.godownId, (inner.get(r.godownId) || 0) + r.quantity);
    });
    return map;
  }, [stockRows]);

  // Items with `stock` overridden to reflect the selected location
  // (or the sum across all locations when no location is selected).
  const itemsWithLocationStock = useMemo(() => {
    return items.map(item => {
      const locMap = stockByItemLocation.get(item.id || '');
      let stock: number;
      if (locationFilter) {
        stock = locMap?.get(locationFilter) || 0;
      } else {
        stock = locMap ? Array.from(locMap.values()).reduce((s, q) => s + q, 0) : (item.stock || 0);
      }

      const agg = ledgerMap.get(item.id || '') || { in: 0, out: 0 };
      const stockIn = agg.in;
      const stockOut = agg.out;
      const closingBalance = stock;
      const openingBalance = closingBalance - stockIn + stockOut;
      const valueOfItem = stock * (item.purchasePrice || 0);

      return { ...item, stock, stockIn, stockOut, openingBalance, closingBalance, valueOfItem };
    });
  }, [items, stockByItemLocation, locationFilter, ledgerMap]);

  const { filteredItems, summary } = useMemo(() => {
    const newFilteredItems = itemsWithLocationStock.filter((item) => {
      const matchesSearch =
        !searchQuery ||
        (item.name && item.name.toLowerCase().includes(searchQuery.toLowerCase()));
      if (!matchesSearch) return false;

      // When a specific location is selected, only show items that actually
      // have stock there — an item with 0 stock at this location shouldn't appear.
      if (locationFilter && (item.stock || 0) <= 0) return false;

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
  }, [appliedItemGroupId, sortConfig, itemsWithLocationStock, searchQuery, locationFilter]);

  const handleApplyFilters = () => setAppliedItemGroupId(itemGroupId);

  const getPresetRange = (preset: string): { from: string; to: string } => {
    const today = new Date().toISOString().slice(0, 10);
    switch (preset) {
      case 'today':
        return { from: today, to: today };
      case 'yesterday': {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const ds = d.toISOString().slice(0, 10);
        return { from: ds, to: ds };
      }
      case 'last7': {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        return { from: d.toISOString().slice(0, 10), to: today };
      }
      case 'last30': {
        const d = new Date();
        d.setDate(d.getDate() - 29);
        return { from: d.toISOString().slice(0, 10), to: today };
      }
      default:
        // 'custom' — leave whatever the user typed in the date inputs
        return { from: fromDate, to: toDate };
    }
  };

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      const { from, to } = getPresetRange(preset);
      setFromDate(from);
      setToDate(to);
    }
  };

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
      const reportTitle = companyName
        ? `Detailed Item Report — ${companyName}`
        : 'Detailed Item Report';
      doc.text(reportTitle, 14, 24);

      // Dynamic Subtitle
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128); // gray-500
      doc.setFont('helvetica', 'normal');

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric', month: 'short', day: 'numeric',
      });

      const periodText = fromDate === toDate
        ? `Period: ${new Date(fromDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`
        : `Period: ${new Date(fromDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })} to ${new Date(toDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`;

      const subtitleText = `Generated: ${generationDate}   |   ${periodText}   |   Total Items: ${summary.totalItems}   |   Avg Margin: ${Math.round(summary.averageMarginPercentage)}%`;
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
      // Columns 1-16 (header text, marker, notes, width) are copied verbatim
      // from the Bulk Import template (ItemAdd.tsx → handleDownloadSample)
      // so this export looks — and re-imports — exactly like that template.
      // Columns 17-21 are report-only ledger figures with no import-template
      // counterpart, marked with a distinct '■' marker.
      const TYPE_STYLE: Record<string, { bg: string; txt: string }> = {
        R: { bg: 'FEE2E2', txt: 'DC2626' },
        O: { bg: 'DCFCE7', txt: '15803D' },
        L: { bg: 'E0F2FE', txt: '0369A1' },
        X: { bg: 'F1F5F9', txt: '475569' },
      };

      // Same LEGEND block as the Bulk Import template (marker + description
      // per row, colored by type) — plus a 4th row for the report-only columns.
      const legendRows = [
        { type: 'R', marker: '★  Required', desc: 'Must be filled in for a clean re-import — item will be skipped if missing' },
        { type: 'O', marker: '●  Optional', desc: 'Improves data quality; blank is fine on re-import' },
        { type: 'L', marker: '▲  Lookup', desc: 'Matched by name on re-import (category/location)' },
        { type: 'X', marker: '■  Report Only', desc: 'Ledger figures for this report — ignored if this file is re-uploaded' },
      ];

      const COLS = [
        { header: '★ Item Name', note: 'Full product name  e.g. Amul Butter 500g', type: 'R', width: 28 },
        { header: '● Barcode', note: 'Optional (Leave blank to auto-generate)', type: 'O', width: 18 },
        { header: '● MRP', note: 'Max Retail Price (₹)  Required if Sale Price blank', type: 'O', width: 14 },
        { header: '★ Sales Price', note: 'Selling price (₹)  Required if MRP blank', type: 'R', width: 16 },
        { header: '● Purchase Price', note: 'Your cost price (₹)', type: 'O', width: 16 },
        { header: '● Sale Disc (%)', note: 'Default customer discount  e.g. 5', type: 'O', width: 14 },
        { header: '● Purchase Disc (%)', note: 'Supplier discount  e.g. 3', type: 'O', width: 15 },
        { header: '● Tax (%)', note: 'GST/VAT rate  e.g. 18', type: 'O', width: 12 },
        { header: '● HSN Code', note: '6-digit HSN / SAC code', type: 'O', width: 14 },
        { header: '▲ Category', note: 'Group name – new category auto-created', type: 'L', width: 20 },
        { header: '● Stock', note: 'Opening stock quantity', type: 'O', width: 10 },
        { header: '▲ Location', note: `"${SHOP_NAME}" or exact godown name  Leave blank for ${SHOP_NAME}`, type: 'L', width: 18 },
        { header: '● Restock Level', note: 'Alert when stock falls below this', type: 'O', width: 15 },
        { header: '● MOQ', note: 'Minimum Order Quantity', type: 'O', width: 10 },
        { header: '● Image URL', note: 'Web link to image (Optional)', type: 'O', width: 25 },
        { header: '● Description', note: 'Product details shown on Catalogue page', type: 'O', width: 35 },
        { header: '■ Opening Bal.', note: 'Stock at period start (report only)', type: 'X', width: 14 },
        { header: '■ Stock In', note: 'Received during period (report only)', type: 'X', width: 12 },
        { header: '■ Stock Out', note: 'Sold/consumed during period (report only)', type: 'X', width: 12 },
        { header: '■ Closing Bal.', note: 'Stock at period end (report only)', type: 'X', width: 14 },
        { header: '■ Value (₹)', note: 'Closing stock value (report only)', type: 'X', width: 15 },
      ];
      const colCount = COLS.length;
      // Same label the Location column shows for this row's Stock figure.
      // With a specific location filter applied, that's the filtered godown/Shop name;
      // with no filter, Stock is a sum across all locations, so it's labelled Shop by default
      // (matches Bulk Import's own "blank = Shop" convention on re-upload).
      const exportLocationLabel = locationFilter
        ? (locationFilter === SHOP_ID ? SHOP_NAME : (godowns.find(g => g.id === locationFilter)?.name || SHOP_NAME))
        : SHOP_NAME;
      // Row layout (mirrors the Bulk Import template's layout exactly):
      // 0    → Title (merged)
      // 1    → Meta (merged)
      // 2    → "LEGEND" label (merged)
      // 3-6  → Legend rows (marker + description, same as the Import template)
      // 7    → blank spacer
      // 8    → Summary label (merged)
      // 9    → Summary values
      // 10   → blank spacer
      // 11   → Column headers
      // 12   → Notes row (REQUIRED: Bulk Import always reads data starting
      //         2 rows after the header row it detects, so this row must exist)
      // 13+  → Data rows

      const legendStartRow = 3;
      const summaryLabelRow = legendStartRow + legendRows.length + 1; // 8
      const headerRow = summaryLabelRow + 3; // 11
      const notesRow = headerRow + 1; // 12
      const dataStartRow = headerRow + 2; // 13
      const totalRows = dataStartRow + filteredItems.length; // no footer row — see Change 5
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title (Company Name alongside)
      aoa[0][0] = companyName
        ? `SELLAR  ·  Item Report  —  ${companyName}`
        : 'SELLAR  ·  Item Report';

      const periodText = fromDate === toDate
        ? `Period: ${new Date(fromDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`
        : `Period: ${new Date(fromDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })} to ${new Date(toDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' })}`;

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   ${periodText}   |   ${groupLabel}   |   Total Items: ${summary.totalItems}`;

      // Row 2 – "LEGEND" label
      aoa[2][0] = 'LEGEND';

      // Rows 3-6 – Legend rows (marker in col A, description in col B)
      legendRows.forEach((l, i) => {
        aoa[legendStartRow + i][0] = l.marker;
        aoa[legendStartRow + i][1] = l.desc;
      });

      // Row 8 – Summary label
      aoa[summaryLabelRow][0] = 'SUMMARY';

      // Row 9 – Summary values (single merged cell)
      aoa[summaryLabelRow + 1][0] = `Avg MRP: ₹${summary.averageMrp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Cost: ₹${summary.averagePurchasePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Sale: ₹${summary.averageSalePrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Margin: ₹${summary.averageProfitMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Margin %: ${summary.averageMarginPercentage.toFixed(1)}%`;

      // Row 11 – Column headers
      COLS.forEach((c, i) => { aoa[headerRow][i] = c.header; });

      // Row 12 – Notes (same per-column descriptions as the Import template)
      COLS.forEach((c, i) => { aoa[notesRow][i] = c.note; });

      // Rows 13+ – Data (column order matches Bulk Import parser exactly)
      filteredItems.forEach((item, idx) => {
        const r = dataStartRow + idx;
        const salePrice =
          (item as any).salesPrice ||
          (item.mrp && item.discount
            ? parseFloat((item.mrp * (1 - item.discount / 100)).toFixed(2))
            : item.mrp || 0);

        aoa[r][0] = item.name || '-';                        // Name
        aoa[r][1] = item.barcode || '-';                      // Barcode
        aoa[r][2] = item.mrp || 0;                             // MRP
        aoa[r][3] = salePrice;                                 // Sale Price
        aoa[r][4] = item.purchasePrice || 0;                   // Cost Price
        aoa[r][5] = item.discount || 0;                        // Discount %
        aoa[r][6] = (item as any).purchasediscount || 0;       // Purchase Disc %
        aoa[r][7] = item.tax || 0;                              // Tax %
        aoa[r][8] = (item as any).hsnSac || '-';                 // HSN/SAC
        aoa[r][9] = getGroupName(item.itemGroupId);              // Item Group
        aoa[r][10] = item.stock || 0;                            // Stock
        aoa[r][11] = exportLocationLabel;                        // Location
        aoa[r][12] = item.restockQuantity || 0;                  // Restock Qty
        aoa[r][13] = (item as any).moq || 1;                     // MOQ
        aoa[r][14] = (item as any).imageUrl || '';                // Image URL
        aoa[r][15] = (item as any).description || '';
        aoa[r][16] = (item as any).openingBalance ?? 0;             // Opening Balance
        aoa[r][17] = (item as any).stockIn ?? 0;                    // Stock In
        aoa[r][18] = (item as any).stockOut ?? 0;                   // Stock Out
        aoa[r][19] = (item as any).closingBalance ?? item.stock ?? 0; // Closing Balance
        aoa[r][20] = (item as any).valueOfItem ?? 0;                // Value
      });

      // No footer/TOTAL row — a text row at the end would get misread as
      // an extra invalid item if this file is re-uploaded into Bulk Import.

      // ── BUILD WORKSHEET ──────────────────────────────────────────────────
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 34 }, // 0 title
        { hpt: 20 }, // 1 meta
        { hpt: 18 }, // 2 "LEGEND" label
        ...legendRows.map(() => ({ hpt: 18 })), // 3-6 legend rows
        { hpt: 8 },  // 7 spacer
        { hpt: 18 }, // 8 summary label
        { hpt: 22 }, // 9 summary values
        { hpt: 8 },  // 10 spacer
        { hpt: 28 }, // 11 headers
        { hpt: 24 }, // 12 notes (required offset row for Bulk Import)
        ...filteredItems.map(() => ({ hpt: 20 })),
      ];

      worksheet['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
        ...legendRows.map((_, i) => ({ s: { r: legendStartRow + i, c: 2 }, e: { r: legendStartRow + i, c: 3 } })),
        { s: { r: summaryLabelRow, c: 0 }, e: { r: summaryLabelRow, c: colCount - 1 } },
        { s: { r: summaryLabelRow + 1, c: 0 }, e: { r: summaryLabelRow + 1, c: colCount - 1 } },
      ];

      const style = (addr: string, st: any) => {
        if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
        worksheet[addr].s = st;
      };

      // ── APPLY STYLES ──────────────────────────────────────────────────────

      // Title (row 0) — same palette as the Bulk Import template
      style('A1', s(
        { sz: 15, bold: true, color: { rgb: 'FFFFFF' } },
        solidFill('0369A1'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // Meta (row 1)
      style('A2', s(
        { sz: 9, italic: true, color: { rgb: '475569' } },
        solidFill('DBEAFE'),
        { horizontal: 'center', vertical: 'center' },
      ));

      // "LEGEND" label (row 2)
      style('A3', s(
        { sz: 10, bold: true, color: { rgb: '0369A1' } },
        solidFill('E0F2FE'),
        { horizontal: 'left', vertical: 'center' },
        allBorders,
      ));

      // Legend rows (rows 3-6) — marker cell + description cell, same
      // 2-column layout and colors as the Bulk Import template
      legendRows.forEach((l, i) => {
        const { bg, txt } = TYPE_STYLE[l.type];
        const row = legendStartRow + i;
        style(XLSX.utils.encode_cell({ r: row, c: 0 }), s(
          { sz: 9, bold: true, color: { rgb: txt } },
          solidFill(bg),
          { horizontal: 'left', vertical: 'center' },
          bblr,
        ));
        style(XLSX.utils.encode_cell({ r: row, c: 1 }), s(
          { sz: 9, color: { rgb: '334155' } },
          solidFill(bg),
          { horizontal: 'left', vertical: 'center' },
          bblr,
        ));
        [2, 3].forEach(ci => {
          style(XLSX.utils.encode_cell({ r: row, c: ci }), s(
            { sz: 9 },
            solidFill(bg),
            {},
            bblr,
          ));
        });
      });

      // Summary label (row 8)
      style(XLSX.utils.encode_cell({ r: summaryLabelRow, c: 0 }), s(
        { sz: 10, bold: true, color: { rgb: '1D4ED8' } },
        solidFill('EFF6FF'),
        { horizontal: 'left', vertical: 'center' },
        allBorders,
      ));

      style(XLSX.utils.encode_cell({ r: summaryLabelRow + 1, c: 0 }), s(
        { sz: 10, bold: true, color: { rgb: '166534' } },
        solidFill('DCFCE7'),
        { horizontal: 'center', vertical: 'center' },
        bblr,
      ));

      // Column headers — colored per marker type, same as the
      // Bulk Import template (TYPE_STYLE)
      COLS.forEach((c, i) => {
        const { bg, txt } = TYPE_STYLE[c.type];
        const addr = XLSX.utils.encode_cell({ r: headerRow, c: i });
        style(addr, s(
          { sz: 9, bold: true, color: { rgb: txt } },
          solidFill(bg),
          { horizontal: 'center', vertical: 'center', wrapText: true },
          allBorders,
        ));
      });

      // Notes row — same style as the Bulk Import template's notes row
      COLS.forEach((_c, i) => {
        const addr = XLSX.utils.encode_cell({ r: notesRow, c: i });
        style(addr, s(
          { sz: 7, italic: true, color: { rgb: '64748B' } },
          solidFill('F8FAFC'),
          { horizontal: 'center', vertical: 'center', wrapText: true },
          bblr,
        ));
      });

      // Numeric column indices (for right-align + number formatting)
      const numericCols = new Set([2, 3, 4, 5, 6, 7, 10, 12, 13, 16, 17, 18, 19, 20]);

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
              color: { rgb: isLowMargin && ci === 3 ? 'DC2626' : '1E293B' },
              bold: isLowMargin && ci === 3,
            },
            rowBg,
            { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
            bblr,
          ));
          // Apply number formatting for currency/numeric columns.
          // Plain "0.00" — no thousands separator, no ₹ symbol — so the
          // cell holds a clean re-importable number.
          if (worksheet[addr] && isNumeric) {
            const isCurrency = [2, 3, 4, 20].includes(ci); // MRP, Sale Price, Cost Price, Value
            worksheet[addr].t = 'n';
            worksheet[addr].z = isCurrency ? '0.00' : '0.##';
          }
        }
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Item Report');
      XLSX.writeFile(workbook, 'item_report.xlsx'); // same file — now also import-ready

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
        <BackButton />
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Item Report
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

      <div className="bg-white p-2 rounded-lg mb-2">
        <h2 className="text-center text-sm font-semibold text-gray-700 uppercase tracking-wider mb-2">
          FILTERS
        </h2>
        <div className="flex flex-col sm:flex-row w-full gap-2 sm:items-center">
          <div className="flex w-full gap-2">
            <div className="flex-1 min-w-0">
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
            </div>
            <div className="flex-1 min-w-0">
              <FilterSelect
                label="Locations"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
              >
                <option value="">All Locations</option>
                <option value={SHOP_ID}>🏪 Shop</option>
                {godowns.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </FilterSelect>
            </div>
          </div>
          <button
            onClick={handleApplyFilters}
            className="w-full sm:w-[28%] py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 transition"
          >
            Apply
          </button>
        </div>
      </div>

      <ReportDateFilter
        datePreset={datePreset}
        startDate={fromDate}
        endDate={toDate}
        onPresetChange={handleDatePresetChange}
        onStartDateChange={(value) => { setDatePreset('custom'); setFromDate(value); }}
        onEndDateChange={(value) => { setDatePreset('custom'); setToDate(value); }}
        onApply={handleApplyFilters}
        theme="pos"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
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
            className="flex-1 md:flex-none px-4 py-2 min-h-[44px] bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50"
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