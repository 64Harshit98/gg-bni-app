/**
 * Export helpers for the Restock Report page (PDF + Excel generation).
 * Extracted from `RestockReport.tsx` verbatim (same libraries, same layout
 * and cell styling) so the page component only orchestrates state + UI.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { resolveCompanyLogoBase64 } from '../../../Catalogue/hooks/useCompanyLogo';
import type { ItemDoc } from './restockReport.utils';

export type RestockActiveFilter = 'all' | 'urgent' | 'low';

const activeFilterLabel = (activeFilter: RestockActiveFilter): string =>
  activeFilter === 'urgent'
    ? 'Urgent items only'
    : activeFilter === 'low'
      ? 'Low stock items only'
      : 'All items';

/** Generates and downloads the Restock Report as a branded PDF. */
export async function downloadRestockReportPdf(
  displayedItems: ItemDoc[],
  activeFilter: RestockActiveFilter,
  outOfStockCount: number,
  companyId: string | undefined,
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  let base64Logo: string | null = null;
  try {
    base64Logo = await resolveCompanyLogoBase64(companyId);
  } catch {
    // Continue without logo
  }

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 6, 'F');

  if (base64Logo) {
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const logoWidth = 20;
        const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
        doc.addImage(base64Logo!, 'PNG', pageWidth - logoWidth - 14, 10, logoWidth, logoHeight);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = base64Logo!;
    });
  }

  const now = new Date();
  const generatedAt = now.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const margin = 14;
  const tagText = `Generated using SELLAR • ${generatedAt}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  const textWidth = doc.getTextWidth(tagText);
  const paddingX = 2;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = 5;
  const boxX = pageWidth - margin - boxWidth;
  const boxY = 10;
  doc.setFillColor(245, 245, 245);
  doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');
  doc.setTextColor(80, 80, 80);
  doc.text(tagText, boxX + paddingX, boxY + 3.5);
  doc.setTextColor(0, 0, 0);

  doc.setFontSize(22);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('Restock Report', 14, 24);

  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.setFont('helvetica', 'normal');

  const generationDate = new Date().toLocaleDateString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  const subtitleText = `Generated: ${generationDate}   |   Filter: ${activeFilterLabel(activeFilter)}   |   Items: ${displayedItems.length}`;
  doc.text(subtitleText, 14, 31);

  autoTable(doc, {
    startY: 38,
    head: [['PRODUCT', 'STOCK', 'MIN. NEEDED', 'UNITS SHORT', 'STATUS']],
    body: displayedItems.map((item) => {
      const currentStock = item.stock ?? 0;
      const deficit = Math.max((item.restockQuantity ?? 0) - currentStock, 0);
      const status =
        currentStock <= 0 ? 'Urgent' :
          currentStock <= 5 ? 'Low Stock' :
            'In Stock';
      return [
        item.name,
        currentStock.toString(),
        (item.restockQuantity ?? 0).toString(),
        deficit > 0 ? `-${deficit}` : '-',
        status,
      ];
    }),
    foot: [
      [
        `Total: ${displayedItems.length} items`,
        '',
        '',
        '',
        `Out of stock: ${outOfStockCount}`,
      ],
    ],
    theme: 'plain',
    styles: {
      font: 'helvetica',
      cellPadding: 7,
      fontSize: 10,
      textColor: [55, 65, 81],
    },
    headStyles: {
      fillColor: [249, 250, 251],
      textColor: [17, 24, 39],
      fontStyle: 'bold',
      halign: 'left',
      lineWidth: { top: 1, bottom: 1 },
      lineColor: [229, 231, 235],
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
      0: { halign: 'left', cellWidth: 70 },
      1: { halign: 'left', cellWidth: 25 },
      2: { halign: 'left', cellWidth: 35 },
      3: { halign: 'left', cellWidth: 30 },
      4: { halign: 'left', cellWidth: 30 },
    },
    didParseCell: function (data) {
      if (data.section === 'body' && data.column.index === 4) {
        const val = String(data.cell.raw);
        if (val === 'Urgent') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else if (val === 'Low Stock') {
          data.cell.styles.textColor = [234, 88, 12];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [22, 163, 74];
        }
      }
      if (data.section === 'body' && data.column.index === 3) {
        const val = String(data.cell.raw);
        if (val.startsWith('-')) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.section === 'foot') {
        data.cell.styles.halign = 'left';
      }
    },
    didDrawPage: function () {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(9);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `Page ${pageCount}`,
        pageWidth - 14,
        pageHeight - 10,
        { align: 'right' },
      );
    },
  });

  doc.save(`restock_report_${new Date().toISOString().split('T')[0]}.pdf`);
}

/** Generates and downloads the Restock Report as a styled `.xlsx` file. */
export function downloadRestockReportExcel(
  displayedItems: ItemDoc[],
  activeFilter: RestockActiveFilter,
  outOfStockCount: number,
  totalItemsToRestock: number,
  estimatedCostToRestock: number,
): void {
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

  const COLS = [
    { header: '#', width: 6 },
    { header: 'Product', width: 30 },
    { header: 'Stock', width: 12 },
    { header: 'Min. Needed', width: 16 },
    { header: 'Units Short', width: 16 },
    { header: 'Status', width: 16 },
  ];
  const colCount = COLS.length;

  const dataStartRow = 7;
  const totalRows = dataStartRow + displayedItems.length + 1;
  const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

  aoa[0][0] = 'Restock Report';
  aoa[1][0] = `Generated: ${generationDate}   |   Filter: ${activeFilterLabel(activeFilter)}   |   Items: ${displayedItems.length}`;
  aoa[3][0] = 'SUMMARY';
  aoa[4][0] = `Need to Restock: ${totalItemsToRestock}   |   Urgent: ${outOfStockCount}   |   Est. Cost: ₹${estimatedCostToRestock.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  COLS.forEach((c, i) => { aoa[6][i] = c.header; });

  displayedItems.forEach((item, idx) => {
    const r = dataStartRow + idx;
    const currentStock = item.stock ?? 0;
    const deficit = Math.max((item.restockQuantity ?? 0) - currentStock, 0);
    const status =
      currentStock <= 0 ? 'Urgent' :
        currentStock <= 5 ? 'Low Stock' :
          'In Stock';

    aoa[r][0] = idx + 1;
    aoa[r][1] = item.name;
    aoa[r][2] = currentStock;
    aoa[r][3] = item.restockQuantity ?? 0;
    aoa[r][4] = deficit > 0 ? -deficit : 0;
    aoa[r][5] = status;
  });

  const footerRow = dataStartRow + displayedItems.length;
  aoa[footerRow][0] = 'TOTAL';
  aoa[footerRow][1] = `${displayedItems.length} items`;
  aoa[footerRow][2] = '';
  aoa[footerRow][3] = '';
  aoa[footerRow][4] = '';
  aoa[footerRow][5] = `Out of stock: ${outOfStockCount}`;

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
  worksheet['!rows'] = [
    { hpt: 36 },
    { hpt: 20 },
    { hpt: 8 },
    { hpt: 18 },
    { hpt: 22 },
    { hpt: 8 },
    { hpt: 28 },
    ...displayedItems.map(() => ({ hpt: 20 })),
    { hpt: 24 },
  ];

  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
    { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 4 } },
  ];

  const style = (addr: string, st: any) => {
    if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
    worksheet[addr].s = st;
  };

  style('A1', s(
    { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
    solidFill('2563EB'),
    { horizontal: 'center', vertical: 'center' },
  ));

  style('A2', s(
    { sz: 9, italic: true, color: { rgb: '475569' } },
    solidFill('DBEAFE'),
    { horizontal: 'center', vertical: 'center' },
  ));

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

  COLS.forEach((_c, i) => {
    const addr = XLSX.utils.encode_cell({ r: 6, c: i });
    style(addr, s(
      { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
      solidFill('1E40AF'),
      { horizontal: i <= 1 ? 'left' : 'center', vertical: 'center' },
      allBorders,
    ));
  });

  displayedItems.forEach((item, idx) => {
    const r = dataStartRow + idx;
    const isAlt = idx % 2 === 1;
    const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');
    const currentStock = item.stock ?? 0;

    for (let ci = 0; ci < colCount; ci++) {
      const addr = XLSX.utils.encode_cell({ r, c: ci });
      const isNumeric = ci >= 2 && ci <= 4;

      let fontColor = '1E293B';
      if (ci === 5) {
        const status = aoa[r][5];
        if (status === 'Urgent') fontColor = 'DC2626';
        else if (status === 'Low Stock') fontColor = 'EA580C';
        else fontColor = '16A34A';
      }
      if (ci === 4 && typeof aoa[r][4] === 'number' && aoa[r][4] < 0) {
        fontColor = 'DC2626';
      }

      style(addr, s(
        { sz: 9, color: { rgb: fontColor }, bold: (ci === 5 && currentStock <= 5) },
        rowBg,
        { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
        bblr,
      ));
    }
  });

  for (let ci = 0; ci < colCount; ci++) {
    const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
    style(addr, s(
      { sz: 10, bold: true, color: { rgb: '1E293B' } },
      solidFill('E2E8F0'),
      { horizontal: ci <= 1 ? 'left' : 'center', vertical: 'center' },
      {
        top: { style: 'medium', color: { rgb: '1E293B' } },
        bottom: { style: 'medium', color: { rgb: '1E293B' } },
        left: { style: 'thin', color: { rgb: 'CBD5E1' } },
        right: { style: 'thin', color: { rgb: 'CBD5E1' } },
      },
    ));
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Restock Report');
  XLSX.writeFile(workbook, `Restock-Report-${new Date().toISOString().split('T')[0]}.xlsx`);
}
