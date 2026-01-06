import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ACTION } from '../enums';

// --- Interface ---
export interface InvoiceData {
  companyName: string;
  companyAddress: string;
  companyContact: string;
  companyEmail?: string;
  billTo: {
    name: string;
    address: string;
    phone: string;
    gstin?: string; // Customer GSTIN
  };
  invoice: {
    number: string;
    date: string;
    billedBy: string;
    roNumber?: string;
  };
  items: {
    sno: number;
    name: string;
    hsn: string;
    quantity: number;
    unit: string;
    listPrice: number; // Inclusive Price
    gstPercent?: number;
    taxRate?: number;
    tax?: number;
    discountAmount: number;
    amount?: number;
  }[];
  terms: string;
  subtotal?: number;
  discount?: number;
  finalAmount?: number;
  bankDetails?: {
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
    gstin?: string;
  };
}

export const generatePdf = async (data: InvoiceData, action: ACTION.DOWNLOAD | ACTION.PRINT | ACTION.BLOB = ACTION.DOWNLOAD): Promise<Blob | void> => {
  const doc = new jsPDF('p', 'mm', 'a5');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;

  const primaryColor = '#083a5e';
  const textColor = '#333333';
  const lightText = '#666666';

  // --- 1. HEADER BAR ---
  doc.setFillColor(primaryColor);
  doc.rect(0, 0, pageWidth, 25, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  const titleWidth = doc.getTextWidth(data.companyName);
  doc.text(data.companyName, (pageWidth - titleWidth) / 2, 16);

  // --- 2. INFO SECTION ---
  const startY = 40;
  const leftColX = margin;
  const leftValueX = margin + 14;
  const rightColLabelX = 85;
  const rightColValueX = pageWidth - margin;

  let cursorY = startY;

  doc.setFontSize(10);
  doc.setTextColor(primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text("Bill To:", leftColX, cursorY);
  doc.text("Invoice Details:", rightColLabelX, cursorY);

  cursorY += 6;

  // Row 1
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(lightText);
  doc.text("Name:", leftColX, cursorY);

  doc.setTextColor(textColor);
  const maxNameWidth = rightColLabelX - leftValueX - 5;
  const nameLines = doc.splitTextToSize(data.billTo.name, maxNameWidth);
  doc.text(nameLines, leftValueX, cursorY);

  doc.setTextColor(lightText);
  doc.text("Invoice No:", rightColLabelX, cursorY);
  doc.setTextColor(textColor);
  doc.setFont('helvetica', 'bold');
  doc.text(data.invoice.number, rightColValueX, cursorY, { align: 'right' });

  const nameHeight = (nameLines.length - 1) * 4;
  cursorY += 5 + nameHeight;

  // Row 2
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(lightText);
  doc.text("Address:", leftColX, cursorY);

  const addressLines = doc.splitTextToSize(data.billTo.address, maxNameWidth);
  doc.setTextColor(textColor);
  doc.text(addressLines, leftValueX, cursorY);

  doc.setTextColor(lightText);
  doc.text("Date:", rightColLabelX, cursorY);
  doc.setTextColor(textColor);
  doc.text(data.invoice.date, rightColValueX, cursorY, { align: 'right' });

  const addressHeight = addressLines.length * 4;
  const row3Y = cursorY + 5;

  if (data.invoice.billedBy) {
    doc.setTextColor(lightText);
    doc.text("Billed By:", rightColLabelX, row3Y);
    doc.setTextColor(textColor);
    doc.text(data.invoice.billedBy, rightColValueX, row3Y, { align: 'right' });
  }
  // Left Side Details
  let leftContentY = cursorY + addressHeight + 1;

  if (data.billTo.phone) {
    doc.setTextColor(lightText);
    doc.text("Phone:", leftColX, leftContentY);
    doc.setTextColor(textColor);
    doc.text(`+91-${data.billTo.phone}`, leftValueX, leftContentY);
    leftContentY += 5;
  }

  if (data.billTo.gstin && data.billTo.gstin.trim() !== '') {
    doc.setTextColor(lightText);
    doc.text("GSTIN:", leftColX, leftContentY);
    doc.setTextColor(textColor);
    doc.text(data.billTo.gstin, leftValueX, leftContentY);
    leftContentY += 5;
  }

  let headerBottomY = Math.max(leftContentY, row3Y + 5);

  // RO Number
  if (data.invoice.roNumber) {
    headerBottomY += 4;
    doc.setFontSize(10);
    doc.setTextColor(textColor);
    doc.setFont('helvetica', 'bold');
    const roText = `RO No: ${data.invoice.roNumber}`;
    doc.text(roText, pageWidth / 2, headerBottomY, { align: 'center' });
    headerBottomY += 2;
  }

  const tableStartY = headerBottomY + 4;

  // --- 3. PRODUCT TABLE ---
  let calcTotal = 0;
  let totalTaxAmount = 0;

  const tableBody: any[] = data.items.map(item => {
    const taxRate = item.gstPercent || item.taxRate || item.tax || 0;
    const qty = item.quantity;
    const inclusivePrice = item.listPrice;

    const basePrice = inclusivePrice / (1 + (taxRate / 100));
    const taxVal = (inclusivePrice - basePrice) * qty;
    const finalItemAmount = (item.amount !== undefined && item.amount !== null)
      ? item.amount
      : (inclusivePrice * qty);

    calcTotal += finalItemAmount;
    totalTaxAmount += taxVal;

    return [
      item.sno,
      item.name,
      qty.toFixed(0),
      basePrice.toFixed(2),
      `${taxRate}%`,
      taxVal.toFixed(2),
      inclusivePrice.toFixed(2),
      finalItemAmount.toFixed(2)
    ];
  });

  const finalTotal = (data.finalAmount !== undefined) ? data.finalAmount : calcTotal;

  // Tax Total Row
  tableBody.push([
    {
      content: 'Total Tax Amount',
      colSpan: 7,
      styles: { textColor: lightText, fontStyle: 'bold', halign: 'right' }
    },
    {
      content: totalTaxAmount.toFixed(2),
      styles: { textColor: textColor, fontStyle: 'bold', halign: 'right' }
    }
  ]);

  // Grand Total Row
  tableBody.push([
    {
      content: 'GRAND TOTAL',
      colSpan: 7,
      styles: { textColor: primaryColor, fontStyle: 'bold', halign: 'right', fontSize: 9 }
    },
    {
      content: finalTotal.toFixed(2),
      styles: { textColor: primaryColor, fontStyle: 'bold', halign: 'right', fontSize: 9 }
    }
  ]);

  autoTable(doc, {
    startY: tableStartY,
    head: [['S.No', 'Item', 'Qty', 'Base Rate', 'GST', 'Tax Amt', 'Net Rate', 'Total']],
    body: tableBody,
    theme: 'plain',
    styles: {
      fontSize: 6.5,
      cellPadding: 2,
      textColor: textColor,
      lineWidth: 0.1,
      lineColor: [200, 200, 200]
    },
    headStyles: {
      textColor: primaryColor,
      fontStyle: 'bold',
      fillColor: [255, 255, 255],
      lineWidth: 0.1,
      lineColor: [100, 100, 100]
    },
    columnStyles: {
      0: { cellWidth: 7 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 8 },
      3: { cellWidth: 13, halign: 'right' },
      4: { cellWidth: 9, halign: 'right' },
      5: { cellWidth: 13, halign: 'right' },
      6: { cellWidth: 13, halign: 'right' },
      7: { cellWidth: 16, halign: 'right' }
    },
    margin: { left: margin, right: margin },
    didParseCell: function (data) {
      data.cell.styles.lineWidth = 0.1;
      data.cell.styles.lineColor = [180, 180, 180];
    }
  });

  // @ts-ignore
  let finalY = doc.lastAutoTable.finalY + 8;

  if (finalY > pageHeight - 50) {
    doc.addPage();
    finalY = 20;
  }

  doc.setFontSize(9);
  doc.setTextColor(textColor);
  doc.setFont('helvetica', 'bold');
  doc.text("Payment Information", margin, finalY);

  const payY = finalY + 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');

  doc.text("Account:", margin, payY);
  doc.text("Account Name:", margin, payY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(lightText);
  doc.text(data.bankDetails?.accountNumber || "------------------", margin + 25, payY);
  doc.text(data.bankDetails?.accountName || "------------------", margin + 25, payY + 5);

  doc.setTextColor(textColor);
  doc.setFont('helvetica', 'bold');
  const col2X = pageWidth / 2 + 10;
  doc.text("Bank Details:", col2X, payY);
  doc.text("GSTIN:", col2X, payY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(lightText);
  doc.text(data.bankDetails?.bankName || "------------------", col2X + 25, payY);
  doc.text(data.bankDetails?.gstin || "----------------", col2X + 25, payY + 5);

  const termsY = payY + 15;
  doc.setTextColor(textColor);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text("Terms & Conditions", margin, termsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(lightText);
  const splitTerms = doc.splitTextToSize(data.terms, pageWidth - (margin * 2));
  doc.text(splitTerms, margin, termsY + 5);

  // --- 5. SIGNATURE ---
  const signY = termsY + 25;
  doc.setDrawColor(200);
  doc.line(pageWidth - 50, signY, pageWidth - margin, signY);
  doc.setFontSize(8);
  doc.setTextColor(textColor);
  doc.text("Authorised Sign", pageWidth - margin, signY + 5, { align: 'right' });

  // --- 6. FOOTER BAR ---
  const footerHeight = 25;
  doc.setFillColor(primaryColor);
  doc.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, 'F');

  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);

  const footerTextY = pageHeight - footerHeight + 5;
  const addressClean = data.companyAddress.replace(/\n/g, ", ");
  const addressLinesFooter = doc.splitTextToSize(addressClean, 90);
  doc.text(addressLinesFooter, margin, footerTextY + 3);

  const contactY = footerTextY + 3 + (addressLinesFooter.length * 3.5);

  if (data.companyContact) {
    doc.text(`Contact No. : ${data.companyContact}`, margin, contactY);
  }

  if (data.companyEmail) {
    doc.text(data.companyEmail, margin, contactY + 3.5);
  }

  // --- BRANDING ---
  const text1 = "Made With ";
  const text2 = "Love";
  const text3 = ", in India, By SELLAR.IN";

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');

  const w1 = doc.getTextWidth(text1);
  const w2 = doc.getTextWidth(text2);
  const w3 = doc.getTextWidth(text3);
  const totalW = w1 + w2 + w3;

  let cursorX = (pageWidth / 2) - (totalW / 2);
  const textY = pageHeight - 5;

  doc.setTextColor(255, 255, 255);
  doc.text(text1, cursorX, textY);
  cursorX += w1;

  doc.setTextColor(255, 100, 100);
  doc.text(text2, cursorX, textY);
  cursorX += w2;

  doc.setTextColor(255, 255, 255);
  doc.text(text3, cursorX, textY);

  // --- ACTION HANDLER ---
  if (action === ACTION.PRINT) {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else if (action === ACTION.DOWNLOAD) {
    doc.save(`Invoice_${data.invoice.number}.pdf`);
  } else if (action === ACTION.BLOB) {
    return doc.output('blob');
  }
};