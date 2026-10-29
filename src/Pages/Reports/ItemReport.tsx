import React, { useMemo, useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  Eye,
  EyeOff,
  FileText,
  Info,
  Package,
  Percent,
  Search,
  Tag,
  X,
} from 'lucide-react';
import useItemReport from './ItemReportComponents/useItemReport';
import type { Item } from '../../constants/models';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { Spinner } from '../../constants/Spinner';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { useAuth } from '../../context/auth-context';
import { useGodowns, useGodownStock, SHOP_ID, SHOP_NAME } from '../hooks/useStockTransfer';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { Modal } from '../../constants/Modal';
import { Permissions, State } from '../../enums';
import { useStockLedger } from '../hooks/useStockLedger';
import { ITEM_ISSUES, hasItemIssue, isItemIssue, type ItemIssue } from './ItemReportComponents/itemIssues';
import {
  formatDateForInput,
  formatRangeLabel,
  getPresetRange,
  parseInputDate,
} from './SalesReportComponents/salesReport.utils';
import DownloadMenu from './SalesReportComponents/DownloadMenu';
import CustomRangePanel from './SalesReportComponents/CustomRangePanel';
import { ItemEditDrawer } from '../../Components/ItemDrawer';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
const PAGE_SIZE = 100;

// The date range only drives the stock in/out columns of the downloads.
const ITEM_DATE_PRESETS = [
  { value: 'month', label: 'This month' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'fy', label: 'This FY' },
];

type ItemRow = Item & {
  stock: number;
  stockIn: number;
  stockOut: number;
  openingBalance: number;
  closingBalance: number;
  valueOfItem: number;
};

// Sign goes before the ₹ ("-₹5,411", not "₹-5,411")
const inr = (n: number) =>
  `${n < 0 ? '-' : ''}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inrRound = (n: number) => {
  const r = Math.round(n);
  return `${r < 0 ? '-' : ''}₹${Math.abs(r).toLocaleString('en-IN')}`;
};

const ItemReport: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const navigate = useNavigate();
  const canEditItems = hasPermission(Permissions.ManageItems);
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
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return formatDateForInput(d);
  });
  const [toDate, setToDate] = useState<string>(() => formatDateForInput(new Date()));
  const [datePreset, setDatePreset] = useState<string>('last30');
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const {
    items,
    appliedItemGroupId,
    sortConfig,
    setAppliedItemGroupId,
    setSortConfig,
    itemGroups,
    setItemGroupId,
    setIsListVisible,
    isListVisible,
    setIsDownloadModalOpen,
    setFeedbackModal,
    isLoading,
    feedbackModal,
  } = useItemReport();

  // The list is the point of this page — show it by default.
  useEffect(() => {
    setIsListVisible(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opened from an "Items that need a look" chip on the Item reports hub.
  const location = useLocation();
  const [issueFilter, setIssueFilter] = useState<ItemIssue | null>(() => {
    const issue = (location.state as { issue?: unknown } | null)?.issue;
    return isItemIssue(issue) ? issue : null;
  });

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
  const itemsWithLocationStock: ItemRow[] = useMemo(() => {
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

  // Items store their group by id or (after a rename) by name.
  const groupOf = (item: Pick<Item, 'itemGroupId'>) =>
    itemGroups.find((g) => g.id === item.itemGroupId || g.name === item.itemGroupId);
  const getGroupName = (id?: string) => {
    if (!id) return UNASSIGNED_GROUP_NAME;
    return groupOf({ itemGroupId: id })?.name || id;
  };

  // Group + location + search: drives the summary cards and issue counts.
  const baseItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const selectedGroup = itemGroups.find((g) => g.id === appliedItemGroupId);
    return itemsWithLocationStock.filter((item) => {
      if (q && !(item.name || '').toLowerCase().includes(q) && !String(item.barcode || '').toLowerCase().includes(q)) {
        return false;
      }
      // When a specific location is selected, only show items that actually
      // have stock there — an item with 0 stock at this location shouldn't appear.
      if (locationFilter && (item.stock || 0) <= 0) return false;

      if (!appliedItemGroupId) return true;
      if (appliedItemGroupId === UNASSIGNED_GROUP_NAME) return !item.itemGroupId || !groupOf(item);
      return item.itemGroupId === appliedItemGroupId || (!!selectedGroup && item.itemGroupId === selectedGroup.name);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsWithLocationStock, searchQuery, locationFilter, appliedItemGroupId, itemGroups]);

  const issueCounts = useMemo(
    () =>
      Object.fromEntries(
        ITEM_ISSUES.map(({ value }) => [value, baseItems.filter((i) => hasItemIssue(i, value, i.stock || 0)).length]),
      ) as Record<ItemIssue, number>,
    [baseItems],
  );

  const { filteredItems, summary } = useMemo(() => {
    const newFilteredItems = baseItems.filter(
      (item) => !issueFilter || hasItemIssue(item, issueFilter, item.stock || 0),
    );

    newFilteredItems.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = a[key] ?? '';
      const valB = b[key] ?? '';

      if (typeof valA === 'string' && typeof valB === 'string')
        return valA.localeCompare(valB, undefined, { numeric: true }) * direction;
      if (typeof valA === 'number' && typeof valB === 'number')
        return (valA - valB) * direction;
      return 0;
    });

    // Averages are over the group/location/search set, not the issue filter,
    // so the cards don't jump when the user peeks at "No MRP" items.
    const totalItems = baseItems.length;
    const avgOf = (pick: (i: ItemRow) => number) =>
      totalItems > 0 ? baseItems.reduce((sum, item) => sum + (pick(item) || 0), 0) / totalItems : 0;
    const averageMrp = avgOf((i) => i.mrp);
    const averagePurchasePrice = avgOf((i) => i.purchasePrice);
    const averageDiscount = avgOf((i) => i.discount ?? 0);
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
  }, [baseItems, issueFilter, sortConfig]);

  // Start from the top of the list whenever what's listed changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [baseItems, issueFilter, sortConfig]);

  const handleGroupChange = (value: string) => {
    setItemGroupId(value);
    setAppliedItemGroupId(value);
  };

  const handleDatePresetChange = (preset: string) => {
    const range = getPresetRange(preset);
    if (!range) return;
    setDatePreset(preset);
    setIsRangeOpen(false);
    setFromDate(formatDateForInput(range.start));
    setToDate(formatDateForInput(range.end));
  };

  const handleApplyCustomRange = (startValue: string, endValue: string) => {
    setDatePreset('custom');
    setFromDate(startValue);
    setToDate(endValue);
    setIsRangeOpen(false);
  };

  const handleSort = (key: keyof Item) => {
    const direction =
      sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
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

  /* ---------- DOWNLOAD / SHARE ---------- */
  const runDownload = (action: () => void) => {
    if (filteredItems.length === 0) {
      setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No items available to download.' });
      return;
    }
    action();
  };

  /* ---------- RENDER HELPERS ---------- */
  const renderSortHeader = (label: string, key: keyof Item, align: 'left' | 'right' = 'left') => {
    const isActive = sortConfig.key === key;
    const Icon = !isActive ? ArrowUpDown : sortConfig.direction === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th className={`px-4 py-3 font-semibold ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <button
          onClick={() => handleSort(key)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-blue-800 ${
            align === 'right' ? 'flex-row-reverse' : ''
          }`}
        >
          {label}
          <Icon size={11} className={isActive ? 'opacity-100' : 'opacity-40'} />
        </button>
      </th>
    );
  };

  const issueChips = (compact: boolean) =>
    ITEM_ISSUES.map(({ value, label }) => {
      const active = issueFilter === value;
      const count = issueCounts[value];
      return (
        <button
          key={value}
          onClick={() => setIssueFilter(active ? null : value)}
          title={`${count} ${count === 1 ? 'item' : 'items'}`}
          className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-2.5 py-1 text-xs font-medium transition ${
            active
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
          }`}
        >
          {!compact && <AlertTriangle size={12} className={active ? 'text-amber-300' : 'text-amber-500'} />}
          {compact && value === 'noCost' ? 'No cost' : label}
          {count > 0 && <span className={active ? 'text-white/80' : 'text-slate-400'}>{count}</span>}
        </button>
      );
    });

  const openItem = (item: Item) => {
    if (canEditItems) setEditingItem(item);
  };

  if (isLoading) return <Spinner />;

  const selectedGroupName = appliedItemGroupId
    ? appliedItemGroupId === UNASSIGNED_GROUP_NAME
      ? UNASSIGNED_GROUP_NAME
      : getGroupName(appliedItemGroupId)
    : '';
  const selectedLocationName = locationFilter
    ? locationFilter === SHOP_ID
      ? SHOP_NAME
      : godowns.find((g) => g.id === locationFilter)?.name || 'location'
    : '';
  const scopeLabel = `${selectedGroupName ? `in ${selectedGroupName}` : 'in all groups'} · ${
    selectedLocationName ? `at ${selectedLocationName}` : 'all locations'
  }`;
  const rangeLabel = formatRangeLabel(parseInputDate(fromDate).getTime(), parseInputDate(toDate).getTime());

  const statCards = [
    {
      label: 'Avg margin',
      value: `${Math.round(summary.averageMarginPercentage)}%`,
      hint: `${inrRound(summary.averageProfitMargin)} per item on average`,
      icon: Percent,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-blue-600',
    },
    {
      label: 'Items',
      value: summary.totalItems.toLocaleString('en-IN'),
      hint: scopeLabel,
      icon: Tag,
      iconClass: 'bg-orange-50 text-orange-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Avg sale price',
      value: inrRound(summary.averageSalePrice),
      hint: `MRP ${inrRound(summary.averageMrp)} on average`,
      icon: FileText,
      iconClass: 'bg-blue-50 text-blue-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Avg cost price',
      value: inrRound(summary.averagePurchasePrice),
      hint: 'what you pay suppliers',
      icon: Package,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: 'text-slate-900',
    },
  ];

  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${
      active
        ? 'border-slate-900 bg-slate-900 text-white'
        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
    }`;

  const selectClass =
    'w-full appearance-none rounded-sm border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 outline-none transition hover:border-slate-400 focus:border-blue-500';

  const visibleItems = filteredItems.slice(0, visibleCount);
  const mobileSortValue = `${String(sortConfig.key)}:${sortConfig.direction}`;

  return (
    <div className="min-h-screen bg-canvas px-3 pb-20 pt-3 md:px-6 md:pb-8 md:pt-5">
      {feedbackModal.isOpen && (
        <Modal
          type={feedbackModal.type}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal((prev) => ({ ...prev, isOpen: false }))}
          showConfirmButton={false}
        />
      )}

      {canEditItems && (
        <ItemEditDrawer
          item={editingItem}
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          // The shared items listener brings the saved item back into the list.
          onSaveSuccess={() => { }}
        />
      )}

      {/* HEADER */}
      <header className="mb-4 flex items-center gap-2 md:gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-slate-700 transition hover:bg-slate-200 md:border md:border-slate-300 md:bg-white"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="hidden text-xs text-slate-500 md:block">Reports / Item reports /</p>
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Item report</h1>
            <span className="hidden text-xs text-slate-500 md:inline">Stock, prices and margin for every item</span>
          </div>
          <p className="truncate text-xs text-slate-500 md:hidden">
            {summary.totalItems.toLocaleString('en-IN')} items · {selectedGroupName || 'all groups'}
          </p>
        </div>

        {/* Desktop search */}
        <div className="relative hidden w-72 md:block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search item name or barcode"
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Mobile actions */}
        <div className="flex items-center md:hidden">
          <button
            onClick={() => setShowSearch((s) => !s)}
            aria-label="Search"
            className="rounded-sm p-2 text-slate-700 transition hover:bg-slate-200"
          >
            <Search size={20} />
          </button>
          <DownloadMenu
            variant="icon"
            onExcel={() => runDownload(downloadAsExcel)}
            onPdf={() => runDownload(downloadAsPdf)}
          />
        </div>
      </header>

      {showSearch && (
        <div className="relative mb-3 md:hidden">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search item name or barcode"
            autoFocus
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            onClick={() => {
              setSearchQuery('');
              setShowSearch(false);
            }}
            aria-label="Close search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-slate-400 hover:text-slate-600"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* FILTERS */}
      <div className="relative mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="grid grid-cols-2 gap-2.5 md:flex md:gap-2">
          <div className="relative md:w-44">
            <select value={appliedItemGroupId} onChange={(e) => handleGroupChange(e.target.value)} className={selectClass}>
              <option value="">All groups</option>
              {itemGroups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
              <option value={UNASSIGNED_GROUP_NAME}>Uncategorized</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
          <div className="relative md:w-44">
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)} className={selectClass}>
              <option value="">All locations</option>
              <option value={SHOP_ID}>{SHOP_NAME}</option>
              {godowns.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
        </div>

        {/* Date range — only affects stock in/out in the downloads, so desktop only */}
        <div className="hidden items-center gap-2 md:ml-auto md:flex">
          {ITEM_DATE_PRESETS.map((p) => (
            <button key={p.value} onClick={() => handleDatePresetChange(p.value)} className={chipClass(datePreset === p.value)}>
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setIsRangeOpen((o) => !o)}
            title="Period for stock in / out in the downloads"
            className={`inline-flex shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 ${
              datePreset === 'custom' ? 'border-slate-900' : 'border-slate-300'
            }`}
          >
            <CalendarDays size={15} className="text-slate-500" />
            {rangeLabel}
          </button>
        </div>

        {isRangeOpen && (
          <div className="absolute right-0 top-full z-30 mt-2 w-80">
            <CustomRangePanel
              initialStart={fromDate}
              initialEnd={toDate}
              onApply={handleApplyCustomRange}
              onCancel={() => setIsRangeOpen(false)}
            />
          </div>
        )}
      </div>

      {/* SUMMARY — 2 cols up to laptop width (sidebar eats tablet width), 4 cols on xl+ */}
      <div className="mb-3 grid grid-cols-2 gap-2.5 md:mb-3 md:gap-4 xl:grid-cols-4">
        {statCards.map(({ label, value, hint, icon: Icon, iconClass, valueClass }) => (
          <div key={label} className="min-w-0 rounded-sm border border-line bg-white shadow-card p-3 md:p-4">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}>
                <Icon size={14} />
              </span>
              <span className="truncate text-xs font-medium text-slate-700 md:text-sm">{label}</span>
            </div>
            <p title={value} className={`mt-2 truncate text-lg font-bold sm:text-xl md:text-2xl ${valueClass}`}>{value}</p>
            <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
          </div>
        ))}
      </div>

      {/* HOW TO READ THE AVERAGES */}
      <div className="mb-4 hidden items-center gap-2 rounded-sm bg-blue-50/70 px-3 py-2 text-xs text-blue-800 md:flex">
        <Info size={14} className="shrink-0 text-blue-600" />
        <p>
          Averages are per item, so a few costly items pull them up — sort by MRP to see which. Margin = sale price − cost price.
        </p>
      </div>

      {/* MOBILE: issue chips */}
      <div className="mb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
        {issueChips(true)}
      </div>

      {/* ITEMS */}
      {/* No overflow-hidden here: it would clip the Download menu when the list is short. */}
      <section className="rounded-sm border border-line bg-white shadow-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">Items</h2>
              <span className="hidden rounded-sm bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 md:inline">
                {filteredItems.length.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-xs text-slate-500">Show:</span>
              {issueChips(false)}
            </div>
          </div>

          {/* Desktop controls */}
          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <button
              onClick={() => setIsListVisible(!isListVisible)}
              className="inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              {isListVisible ? <EyeOff size={15} /> : <Eye size={15} />}
              {isListVisible ? 'Hide list' : 'Show list'}
            </button>
            <DownloadMenu
              onExcel={() => runDownload(downloadAsExcel)}
              onPdf={() => runDownload(downloadAsPdf)}
            />
          </div>

          {/* Mobile sort */}
          <div className="relative md:hidden">
            <select
              value={mobileSortValue}
              onChange={(e) => {
                const [key, direction] = e.target.value.split(':') as [keyof Item, 'asc' | 'desc'];
                setSortConfig({ key, direction });
              }}
              className="appearance-none rounded-sm border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 outline-none focus:border-blue-500"
            >
              <option value="name:asc">Name A–Z</option>
              <option value="name:desc">Name Z–A</option>
              <option value="stock:asc">Lowest stock</option>
              <option value="stock:desc">Highest stock</option>
              <option value="mrp:desc">Highest MRP</option>
              <option value="purchasePrice:desc">Highest cost</option>
            </select>
            <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          </div>
        </div>

        {/* Desktop table */}
        {isListVisible && (
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-sunken text-[11px] text-blue-700/80">
                <tr>
                  {renderSortHeader('Barcode', 'barcode')}
                  {renderSortHeader('Item name', 'name')}
                  {renderSortHeader('Stock', 'stock', 'right')}
                  <th className="px-4 py-3 text-left font-semibold uppercase tracking-wide">Group</th>
                  {renderSortHeader('MRP', 'mrp', 'right')}
                  {renderSortHeader('Cost price', 'purchasePrice', 'right')}
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-wide">Stock value</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                      No items match these filters. Clear a filter or try a different search.
                    </td>
                  </tr>
                )}
                {visibleItems.map((item) => {
                  const stock = item.stock || 0;
                  const hasCost = Number(item.purchasePrice) > 0;
                  return (
                    <tr
                      key={item.id}
                      onClick={() => openItem(item)}
                      className={`border-t border-line transition hover:bg-sunken ${canEditItems ? 'cursor-pointer' : ''}`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{item.barcode || '—'}</td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{item.name}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <p className={stock < 0 ? 'font-semibold text-red-600' : 'text-slate-700'}>{stock.toLocaleString('en-IN')}</p>
                        {stock < 0 && <p className="text-[11px] text-red-600">Sold more than stock</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block whitespace-nowrap rounded-sm bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                          {getGroupName(item.itemGroupId)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {Number(item.mrp) > 0 ? (
                          <span className="text-slate-700">{inr(item.mrp)}</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">No MRP</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {hasCost ? (
                          <span className="text-slate-700">{inr(item.purchasePrice)}</span>
                        ) : (
                          <span className="text-xs font-medium text-amber-600">No cost</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-700">
                        {hasCost && stock > 0 ? inrRound(item.valueOfItem) : <span className="text-slate-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Mobile list */}
        <ul className="md:hidden">
          {filteredItems.length === 0 && (
            <li className="border-t border-line px-4 py-10 text-center text-sm text-slate-500">
              No items match these filters. Clear a filter or try a different search.
            </li>
          )}
          {visibleItems.map((item) => {
            const stock = item.stock || 0;
            const hasMrp = Number(item.mrp) > 0;
            const hasCost = Number(item.purchasePrice) > 0;
            return (
              <li
                key={item.id}
                onClick={() => openItem(item)}
                className={`border-t border-line px-4 py-3 ${canEditItems ? 'cursor-pointer active:bg-sunken' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 text-sm font-semibold text-slate-900">{item.name}</p>
                  <p className={`shrink-0 text-sm ${stock < 0 ? 'font-semibold text-red-600' : 'text-slate-700'}`}>
                    {stock.toLocaleString('en-IN')} in stock
                  </p>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="truncate">
                    {[item.barcode, getGroupName(item.itemGroupId)].filter(Boolean).join(' · ')}
                  </span>
                  <span className="shrink-0">
                    {hasMrp ? `MRP ${inr(item.mrp)}` : <span className="font-medium text-amber-600">No MRP</span>}
                    {' · '}
                    {hasCost ? `Cost ${inr(item.purchasePrice)}` : <span className="font-medium text-amber-600">No cost</span>}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* Footer: paging + how stock value is worked out */}
        {filteredItems.length > 0 && (
          // The mobile list is always shown; the desktop table can be hidden.
          <div className={`flex flex-wrap items-center justify-between gap-2 rounded-b-sm border-t border-line bg-sunken px-4 py-2.5 text-xs text-slate-500 ${isListVisible ? '' : 'md:hidden'}`}>
            <span>
              Showing {visibleItems.length.toLocaleString('en-IN')} of {summary.totalItems.toLocaleString('en-IN')}
              <span className="hidden md:inline"> · stock value = stock × cost price</span>
            </span>
            <div className="flex items-center gap-3">
              {visibleItems.length < filteredItems.length && (
                <button
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="rounded-sm border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-slate-400"
                >
                  Show {Math.min(PAGE_SIZE, filteredItems.length - visibleItems.length)} more
                </button>
              )}
              {canEditItems && <span className="hidden md:inline">Open an item to edit it</span>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

export default ItemReport;
