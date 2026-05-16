import React, { useMemo, useState } from 'react';
import useItemReport from '../../Pages/Reports/ItemReportComponents/useItemReport';
import type { Item } from '../../constants/models';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { Spinner } from '../../constants/Spinner';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import { IconClose, IconSearch } from '../../constants/Icons';
import { getItemColumns } from '../../constants/TableColoumns';
import DownloadChoiceModal from '../../Pages/Reports/ItemReportComponents/DownloadChoiceModal';
import FilterSelect from '../../Pages/Reports/ItemReportComponents/FilterSelect';
//import CataShowWrapper from '../../context/CataShowWrapper';
//import { Cata_Permissions } from '../enum/cata_permissions.enum';
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import { useAuth } from '../../context/auth-context';


// Import your Modal and State
import { Modal } from '../../constants/Modal'; // Adjust path to where you saved the Modal code
import { State } from '../../enums';
import BackButton from '../../Components/BackButton';

const UNASSIGNED_GROUP_NAME = 'Uncategorized';
// --- Helper Component ---

const CatalogueItemReport: React.FC = () => {
  const { currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
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
    let newFilteredItems = items.filter((item) => {
      if (!appliedItemGroupId) return true;
      if (appliedItemGroupId === UNASSIGNED_GROUP_NAME) {
        const hasNoGroup =
          (!item.itemGroupIds || item.itemGroupIds.length === 0) && !item.itemGroupId;
        return hasNoGroup;
      }
      const groupIds: string[] = item.itemGroupIds?.length
        ? item.itemGroupIds
        : item.itemGroupId
          ? [item.itemGroupId]
          : [];
      return groupIds.includes(appliedItemGroupId);
    });

    //  SEARCH 
    const trimmedQuery = searchQuery.toLowerCase().trim();

    if (trimmedQuery) {
      const searchTokens = trimmedQuery.split(/\s+/);

      newFilteredItems = newFilteredItems.filter((item) => {
        const name = item.name?.toLowerCase() || '';
        const barcode = item.barcode?.toLowerCase() || '';
        const matchesName = searchTokens.every(token =>
          name.includes(token)
        );
        const matchesBarcode = barcode.includes(trimmedQuery);
        return matchesName || matchesBarcode;
      });
    }

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
  const prepareExportDataForExcel = (item: Item) => {
    const salePrice = item.salesPrice ||
      (item.mrp && item.discount ? parseFloat((item.mrp * (1 - item.discount / 100)).toFixed(2)) : item.mrp || 0);

    return {
      name: item.name || '-',
      barcode: item.barcode || '-',
      itemGroup: item.itemGroupIds?.length
        ? item.itemGroupIds.map((id) => getGroupName(id)).join(', ')
        : getGroupName(item.itemGroupId),
      mrp: item.mrp || 0,
      purchasePrice: item.purchasePrice || 0,
      purchaseDiscount: item.purchasediscount || 0,
      salesPrice: salePrice,
      discount: item.discount || 0,
      tax: item.tax || 0,
      taxRate: item.taxRate || 0,
      gst: item.gst || 0,
      hsnSac: item.hsnSac || '-',
      unit: item.unit || '-',
      packetSize: item.packetSize || 0,
      unitMultiplier: item.unitMultiplier || 0,
      moq: item.moq || 0,
      stock: item.stock || 0,
      restockQuantity: item.restockQuantity || 0,
      description: item.description || '-',
      isListed: item.isListed ? 'Yes' : 'No',
    };
  };

  const downloadAsPdf = async () => {
    try {
      // Initialize in Landscape mode ('l') for the detailed item report
      const doc = new jsPDF('l', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();

      // Embed company logo
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

      // light gray background
      doc.setFillColor(245, 245, 245);
      doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

      // text
      doc.setTextColor(80, 80, 80);
      doc.text(tagText, boxX + paddingX, boxY + 3.5);

      // reset styles
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(14);


      const pageHeight = doc.internal.pageSize.getHeight();

      // --- 1. BRAND ACCENT BAR ---
      // Uses the #F97316 orange from your UI
      doc.setFillColor(249, 115, 22);
      doc.rect(0, 0, pageWidth, 6, 'F');

      // --- 2. HEADER SECTION ---
      doc.setFontSize(22);
      doc.setTextColor(17, 24, 39); // gray-900
      doc.setFont('helvetica', 'bold');
      doc.text('Detailed Item Report', 14, 24);

      // Dynamic Subtitle with Date Range & Summary Stats
      doc.setFontSize(10);
      doc.setTextColor(107, 114, 128); // gray-500
      doc.setFont('helvetica', 'normal');

      const generationDate = new Date().toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });

      // Combining your requested summary stats with the date/period formatting
      let subtitleText = `Generated: ${generationDate}   |   Total Items: ${summary.totalItems}   |   Avg Margin: ${Math.round(summary.averageMarginPercentage)}%`;
      doc.text(subtitleText, 14, 31);

      // --- 3. AUTOTABLE GENERATION ---
      autoTable(doc, {
        startY: 38,
        // UPDATE THESE HEADERS TO MATCH YOUR EXACT ITEM DATA
        head: [['ITEM NAME', 'CATEGORY', 'QTY SOLD', 'TOTAL SALES (Rs.)', 'MARGIN (%)']],
        // DROP YOUR ITEM MAPPING LOGIC HERE
        body: filteredItems.map((item) => {
          return [
            item.name || 'N/A',
            item.itemGroupIds?.length
              ? item.itemGroupIds.map((id) => getGroupName(id)).join(', ')
              : getGroupName(item.itemGroupId),
            (item.stock ?? 0).toString(),
            (item.mrp ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            `${((item.mrp && item.purchasePrice) ? (((item.mrp - item.purchasePrice) / item.mrp) * 100) : 0).toFixed(2)}%`,
          ];
        }),
        // OPTIONAL: ADD A TOTALS ROW AT THE BOTTOM IF NEEDED
        foot: [
          [
            'TOTAL / AVERAGE',
            '-',
            summary.totalItems.toString(), // Assuming this is total qty
            (summary.averageSalePrice ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            `${Math.round(summary.averageMarginPercentage)}%`,
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
        // Adjust column widths and alignments for landscape mode
        columnStyles: {
          0: { halign: 'left', cellWidth: 'auto' }, // Item Name
          1: { halign: 'left', cellWidth: 40 },     // Category
          2: { halign: 'right', cellWidth: 30 },    // Qty
          3: { halign: 'right', cellWidth: 50 },    // Sales
          4: { halign: 'right', cellWidth: 35 },    // Margin
        },
        // --- 4. CONDITIONAL FORMATTING ---
        didParseCell: function (data) {
          // Highlight negative margins in red (assuming Margin is column index 4)
          if ((data.section === 'body' || data.section === 'foot') && data.column.index === 4) {
            const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, '').replace('%', ''));
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

      doc.save(`Detailed_Item_Report_${new Date().toISOString().split('T')[0]}.pdf`);

      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Item PDF downloaded successfully!',
      });
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate Item PDF.',
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
        { header: 'Name', width: 28 },
        { header: 'Barcode', width: 20 },
        { header: 'Category', width: 22 },
        { header: 'MRP (₹)', width: 16 },
        { header: 'Purchase Price (₹)', width: 22 },
        { header: 'Sale Price (₹)', width: 18 },
        { header: 'Discount (%)', width: 16 },
        { header: 'GST (%)', width: 14 },
        { header: 'HSN/SAC', width: 16 },
        { header: 'Unit', width: 12 },
        { header: 'Stock', width: 12 },
        { header: 'Listed', width: 12 },
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
      const totalRows = dataStartRow + filteredItems.length + 1;
      const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

      // Row 0 – Title
      aoa[0][0] = 'Detailed Item Report';

      // Row 1 – Meta
      aoa[1][0] = `Generated: ${generationDate}   |   Total Items: ${summary.totalItems}   |   Avg Margin: ${Math.round(summary.averageMarginPercentage)}%`;

      // Row 3 – Summary label
      aoa[3][0] = 'SUMMARY';

      // Row 4 – Summary values (single merged cell)
      aoa[4][0] = `Total Items: ${summary.totalItems}   |   Avg MRP: ₹${Math.round(summary.averageMrp).toLocaleString('en-IN')}   |   Avg Sale Price: ₹${Math.round(summary.averageSalePrice).toLocaleString('en-IN')}   |   Avg Margin: ${Math.round(summary.averageMarginPercentage)}%`;

      // Row 6 – Column headers
      COLS.forEach((c, i) => { aoa[6][i] = c.header; });

      // Rows 7+ – Data
      filteredItems.forEach((item, idx) => {
        const r = dataStartRow + idx;
        const prepared = prepareExportDataForExcel(item);
        aoa[r][0] = idx + 1;
        aoa[r][1] = prepared.name;
        aoa[r][2] = prepared.barcode;
        aoa[r][3] = prepared.itemGroup;
        aoa[r][4] = prepared.mrp;
        aoa[r][5] = prepared.purchasePrice;
        aoa[r][6] = prepared.salesPrice;
        aoa[r][7] = prepared.discount;
        aoa[r][8] = prepared.gst;
        aoa[r][9] = prepared.hsnSac;
        aoa[r][10] = prepared.unit;
        aoa[r][11] = prepared.stock;
        aoa[r][12] = prepared.isListed;
      });

      // Footer row
      const footerRow = dataStartRow + filteredItems.length;
      aoa[footerRow][0] = 'TOTAL / AVERAGE';
      aoa[footerRow][1] = `${filteredItems.length} items`;
      aoa[footerRow][4] = Math.round(summary.averageMrp);
      aoa[footerRow][5] = Math.round(summary.averagePurchasePrice);
      aoa[footerRow][6] = Math.round(summary.averageSalePrice);

      // ── BUILD WORKSHEET ──────────────────────────────────────────────
      const worksheet = XLSX.utils.aoa_to_sheet(aoa);
      worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
      worksheet['!rows'] = [
        { hpt: 36 }, // 0 title
        { hpt: 20 }, // 1 meta
        { hpt: 8 },  // 2 spacer
        { hpt: 18 }, // 3 summary label
        { hpt: 22 }, // 4 summary values
        { hpt: 8 },  // 5 spacer
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
          { horizontal: i <= 3 ? 'left' : 'center', vertical: 'center' },
          allBorders,
        ));
      });

      // Data rows
      filteredItems.forEach((_item, idx) => {
        const r = dataStartRow + idx;
        const isAlt = idx % 2 === 1;
        const rowBg = solidFill(isAlt ? 'FFF7ED' : 'FFFFFF');

        for (let ci = 0; ci < colCount; ci++) {
          const addr = XLSX.utils.encode_cell({ r, c: ci });
          const isNumeric = ci >= 4 && ci <= 8;
          style(addr, s(
            { sz: 9, color: { rgb: '1E293B' } },
            rowBg,
            { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
            bblr,
          ));
          // Format currency columns
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
          { horizontal: ci <= 3 ? 'left' : 'center', vertical: 'center' },
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
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Item Report');
      XLSX.writeFile(workbook, `Item-Report-${new Date().toISOString().split('T')[0]}.xlsx`);

      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Excel file downloaded successfully!',
      });
    } catch (e) {
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

        {/* TITLE */}
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Item Report
        </h1>

        <button onClick={() => setShowSearch(true)} className="p-2">
          <IconSearch />
        </button>

      </div>

      {showSearch && (
        <div className="flex justify-center mb-2 px-2">
          <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-[#F97316]">

            <input
              type="text"
              placeholder="Search by Item Name..."
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

      <div className="bg-white p-2 rounded-sm mb-2">
        <h2 className="text-center font-semibold text-gray-700 mb-2">
          FILTERS
        </h2>
        <div className="flex space-x-3 items-end">
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
          <button
            onClick={handleApplyFilters}
            className="px-6 py-2 bg-[#F97316] text-white font-semibold rounded-sm shadow-sm hover:bg-[#F97316] transition"
          >
            Apply
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-2">
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Items"
          value={Math.round(summary.totalItems).toLocaleString('en-IN')}
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
          value={`${Math.round(summary.averageMarginPercentage).toLocaleString('en-IN')} %`}
        />
      </div>

      <div className="bg-white p-4 rounded-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-700">Report Details</h2>
        <div className="flex items-center space-x-3 w-full md:w-auto overflow-x-auto">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-sm hover:bg-slate-300 transition whitespace-nowrap"
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
            className="bg-[#F97316] text-white font-semibold rounded-sm py-2 px-4 shadow-sm hover:bg-[#F97316] whitespace-nowrap"
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

export default CatalogueItemReport;
