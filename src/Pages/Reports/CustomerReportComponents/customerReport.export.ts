/**
 * Export helpers for the Customer Report page (Excel + PDF generation).
 * Extracted from `CustomerReport.tsx` verbatim (same libraries, same cell
 * layout/styling) so the page component only orchestrates state + UI.
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import XLSX from 'xlsx-js-style';
import { resolveCompanyLogoBase64 } from '../../../Catalogue/hooks/useCompanyLogo';

export interface CustomerRowWithCredit {
  id: string;
  customerName: string;
  customerNumber: string;
  totalBills: number;
  totalSales: number;
  totalDue: number;
  creditNote: number;
  sortKey?: string;
}

export interface CustomerReportSummary {
  totalCustomers: number;
  totalBills: number;
  totalSales: number;
  totalDue: number;
  averageSalePerCustomer: number;
}

/** Generates and downloads the Customer Report as a styled `.xlsx` file. */
export function downloadCustomerReportExcel(
  customerRows: CustomerRowWithCredit[],
  summary: CustomerReportSummary,
  startDate: string,
  endDate: string,
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

  const periodLabel = `Period: ${startDate} – ${endDate}`;

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

  const dataStartRow = 7;
  const totalRows = dataStartRow + customerRows.length + 1;
  const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

  aoa[0][0] = 'Customer Report';
  aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Customers: ${summary.totalCustomers}`;
  aoa[3][0] = 'SUMMARY';
  aoa[4][0] = `Total Customers: ${summary.totalCustomers}   |   Total Sales: ₹${summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Total Due: ₹${summary.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Avg Sale: ₹${Math.round(summary.averageSalePerCustomer).toLocaleString('en-IN')}`;

  COLS.forEach((c, i) => { aoa[6][i] = c.header; });

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

  const footerRow = dataStartRow + customerRows.length;
  aoa[footerRow][0] = 'TOTAL';
  aoa[footerRow][1] = `${customerRows.length} customers`;
  aoa[footerRow][3] = summary.totalBills;
  aoa[footerRow][4] = Math.round(summary.totalSales);
  aoa[footerRow][5] = Math.round(summary.totalDue);
  aoa[footerRow][6] = Math.round(customerRows.reduce((sum, c) => sum + (c.creditNote || 0), 0));

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
    ...customerRows.map(() => ({ hpt: 20 })),
    { hpt: 24 },
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
      { horizontal: i <= 2 ? 'left' : 'center', vertical: 'center' },
      allBorders,
    ));
  });

  const currencyCols = new Set([4, 5, 6]);

  customerRows.forEach((_row, idx) => {
    const r = dataStartRow + idx;
    const isAlt = idx % 2 === 1;
    const rowBg = solidFill(isAlt ? 'F8FAFC' : 'FFFFFF');

    for (let ci = 0; ci < colCount; ci++) {
      const addr = XLSX.utils.encode_cell({ r, c: ci });
      const isCurrency = currencyCols.has(ci);
      const isNumeric = ci === 3 || isCurrency;
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
}

/** Generates and downloads the Customer Report as a branded PDF. */
export async function downloadCustomerReportPdf(
  customerRows: CustomerRowWithCredit[],
  summary: CustomerReportSummary,
  startDate: string,
  endDate: string,
  companyId: string | undefined,
): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);

  const textWidth = doc.getTextWidth(tagText);
  const paddingX = 2;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = 5;

  const logoReservedWidth = 25;
  const boxX = pageWidth - 14 - logoReservedWidth - boxWidth;
  const boxY = 10;

  doc.setFillColor(245, 245, 245);
  doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');

  doc.setTextColor(80, 80, 80);
  doc.text(tagText, boxX + paddingX, boxY + 3.5);

  doc.setTextColor(0, 0, 0);

  try {
    const base64Logo = await resolveCompanyLogoBase64(companyId);
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

  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageWidth, 6, 'F');

  doc.setFontSize(22);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.text('Customer Report', 14, 24);

  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  doc.setFont('helvetica', 'normal');

  const generationDate = new Date().toLocaleDateString('en-IN', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  let subtitleText = `Generated on: ${generationDate}`;
  if (startDate && endDate) {
    subtitleText += `   |   Period: ${startDate} to ${endDate}`;
  }
  doc.text(subtitleText, 14, 31);

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
      halign: 'center',
      lineWidth: { top: 1, bottom: 1 },
      lineColor: [229, 231, 235],
    },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: [17, 24, 39],
      fontStyle: 'bold',
      halign: 'right',
      lineWidth: { top: 1, bottom: 2 },
      lineColor: [17, 24, 39],
    },
    alternateRowStyles: {
      fillColor: [252, 252, 252],
    },
    columnStyles: {
      0: { halign: 'left', cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 35 },
      2: { halign: 'right', cellWidth: 25 },
      3: { halign: 'right', cellWidth: 34 },
      4: { halign: 'right', cellWidth: 30 },
      5: { halign: 'right', cellWidth: 36 },
    },
    didParseCell: function (data) {
      if ((data.section === 'body' || data.section === 'foot') && data.column.index === 4) {
        const rawVal = parseFloat(String(data.cell.raw).replace(/,/g, ''));
        if (rawVal < 0) {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
    didDrawPage: function () {
      const pageCount = (doc.internal as any).getNumberOfPages();
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

  doc.save(`Customer_Report_${new Date().toISOString().split('T')[0]}.pdf`);
}
