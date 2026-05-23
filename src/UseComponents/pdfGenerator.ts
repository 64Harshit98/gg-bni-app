import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ACTION } from '../enums';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import QRCode from 'qrcode';
import { generateThermalReceipt } from './ThermalpdfGenerator';
import { generateA5Invoice } from './A5PdfGenerator';

export interface InvoiceData {
  printFormat?: 'A4' | 'THERMAL58' | 'A5';
  gstScheme?: string;
  taxType?: string;
  companyGstType?: string;
  companyName: string;
  companyAddress: string;
  companyContact: string;
  companyEmail?: string;
  companyGstin?: string;
  companyLogoBase64?: string;
  msmeNumber?: string;
  signatureBase64?: string;
  billDiscount?: number;
  upiId?: string;
  ifscCode?: number;

  billTo: {
    name: string;
    address: string;
    email?: string;
    phone: string;
    gstin?: string;
  };
  shipTo?: {
    name: string;
    address: string;
    phone: string;
    gstin?: string;
  };
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  narration?: string;
  invoice: {
    number: string;
    date: string;
    billedBy: string;
    roNumber?: string;
  };
  finalAmount?: number;
   previousBalance?: number;
  advance?: number;
  due?: number;
  items: {
    sno: number;
    name: string;
    hsn: string;
    quantity: number;
    totalPcs?: number;
    unit: string;
    listPrice: number;
    gstPercent?: number;
    taxRate?: number;
    discountAmount: number;
    amount?: number;
    gstAmount?: number;
    imageBase64?: string;
  }[];
  terms: string;
  bankDetails?: {
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
    gstin?: string;
    ifsc?: string;
    ifscCode?: string;
  };
}

export const generatePdf = async (data: InvoiceData, action: ACTION.DOWNLOAD | ACTION.PRINT | ACTION.BLOB = ACTION.DOWNLOAD, withDuplicate: boolean = false): Promise<Blob | void> => {
  const isEstimate = (data as any).isEstimate === true;

  if (data.printFormat === 'THERMAL58') {
    return generateThermalReceipt(data, action);
  }

  if (data.printFormat === 'A5') {
    data.companyGstType =
      data.companyGstType ||
      data.gstScheme;

    return generateA5Invoice(
      data,
      isEstimate,
      action
    );
  }

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const margin = 10;
  const contentWidth = pageWidth - (margin * 2);
  const startX = margin;
  const endX = pageWidth - margin;

  const lineColor = '#000000';
  const textColor = '#000000';
  doc.setDrawColor(lineColor);
  doc.setTextColor(textColor);
  doc.setLineWidth(0.1);

  let qrBase64: string | null = null;
  if (data.upiId) {
    // Standard UPI format: upi://pay?pa=<UPI_ID>&pn=<NAME>&cu=INR
    const upiString = `upi://pay?pa=${data.upiId}&pn=${encodeURIComponent(data.companyName)}&cu=INR`;
    try {
      qrBase64 = await QRCode.toDataURL(upiString, { width: 80, margin: 0 });
    } catch (err) {
      console.error("Failed to generate QR code", err);
    }
  }

  // --- NORMALIZATION ---
  const safeScheme = (data.gstScheme && data.gstScheme.trim() !== '')
    ? data.gstScheme.toUpperCase()
    : 'NONE';

  const safeTaxType = (data.taxType && data.taxType.trim() !== '')
    ? data.taxType.toUpperCase()
    : 'EXCLUSIVE';

  const showGstinDetails = !isEstimate && safeScheme !== 'NONE' && safeTaxType !== 'EXEMPT' && safeTaxType !== 'NONE';

  const showTaxColumns = !isEstimate;

  const drawBox = (y: number, h: number) => {
    doc.rect(startX, y, contentWidth, h);
  };

  let cursorY = margin;

  // --- GENERATED TIMESTAMP (TOP RIGHT) ---
  const y = margin - 2;
  const now = new Date();
  const generatedAt = now.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(
    `Bill generated on ${generatedAt}`,
    pageWidth - margin,
    y,
    { align: "right" }
  );

  // --- 1. HEADER SECTION ---
  doc.setFontSize(9);
  const addressLines = doc.splitTextToSize(data.companyAddress, contentWidth - 50);
  const extraAddressLines = Math.max(0, addressLines.length - 1);
  const addressOffset = extraAddressLines * 4;

  const headerHeight = 25 + addressOffset;
  drawBox(cursorY, headerHeight);

  if (qrBase64 && !isEstimate) {
    // Draw image at X: startX + 2, Y: cursorY + 2. Size: 18x18 mm
    doc.addImage(qrBase64, 'PNG', startX + 2, cursorY + 2, 18, 18);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text('Scan to Pay', startX + 11, cursorY + 22, { align: 'center' });
  }

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');

  const title = isEstimate
    ? 'ESTIMATE'
    : (safeScheme === 'COMPOSITION' || safeScheme === 'NONE')
      ? 'BILL OF SUPPLY'
      : 'TAX INVOICE';
  doc.text(title, pageWidth / 2, cursorY + 5, { align: 'center' });

  doc.setFontSize(8);
  if (!isEstimate) {
    doc.text(`Msme No ${data.msmeNumber || ''}`, endX - 2, cursorY + 5, { align: 'right' });
  }

  // Company Logo placeholder (below MSME number, top-right)
  const logoW = 18;
  const logoH = 14;
  const logoX = endX - logoW - 2;
  const logoY = cursorY + 7;
  if (data.companyLogoBase64) {
    try {
      doc.addImage(data.companyLogoBase64, 'PNG', logoX, logoY, logoW, logoH);
    } catch (e) {
      console.error("Error adding company logo", e);
      doc.rect(logoX, logoY, logoW, logoH);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text('LOGO', logoX + logoW / 2, logoY + logoH / 2 + 1, { align: 'center' });
    }
  }

  doc.setFontSize(16);
  doc.text(data.companyName.toUpperCase(), pageWidth / 2, cursorY + 11, { align: 'center' });

  // 3. Print the dynamic address
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (!isEstimate) {
    const addressLines = doc.splitTextToSize(data.companyAddress, contentWidth - 50);
    doc.text(addressLines, pageWidth / 2, cursorY + 16, { align: 'center' });
  }

  if (!isEstimate) {
    doc.text(`Phone : ${data.companyContact}`, pageWidth / 2, cursorY + 20, { align: 'center' });
  }

  if (showGstinDetails) {
    doc.setFont('helvetica', 'bold');
    const gstText = `GSTIN : ${data.companyGstin || ''}  (${safeScheme})`;
    doc.text(gstText, pageWidth / 2, cursorY + 24 + addressOffset, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  }

  cursorY += headerHeight;

  // --- 2. META INFO ---
  const metaHeight = 16;
  drawBox(cursorY, metaHeight);
  doc.line(pageWidth / 2, cursorY, pageWidth / 2, cursorY + metaHeight);

  doc.setFontSize(9);
  doc.text(`Invoice No. :  ${data.invoice.number}`, startX + 2, cursorY + 5);
  doc.text(`Date          :  ${data.invoice.date}`, startX + 2, cursorY + 10);

  const posVal = data.billTo.address.split(',').pop()?.trim() || '';
  doc.text(`Place of Supply : ${posVal}`, (pageWidth / 2) + 2, cursorY + 5);

  if (showGstinDetails) {
    let schemeInfo = `GST Type: ${safeScheme}`;
    if (safeScheme === 'REGULAR') {
      schemeInfo += ` (${safeTaxType})`;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(schemeInfo, (pageWidth / 2) + 2, cursorY + 10);
  }
  doc.setFont('helvetica', 'normal');

  cursorY += metaHeight;

  // --- 3. PARTIES SECTION ---
  const billName = data.billTo.name;
  const billAddr = doc.splitTextToSize(data.billTo.address, contentWidth / 2 - 10);
  const billPhone = `Phone.No.  : ${data.billTo.phone || ''}`;

  const shipName = data.shipTo?.name || '';
  const shipAddr = doc.splitTextToSize(data.shipTo?.address || '', contentWidth / 2 - 10);
  const shipPhone = `Phone.No.  : ${data.shipTo?.phone || ''}`;

  const lineHeight = 5;
  const padding = 10;

  const billLines = 5 + billAddr.length;
  const shipLines = 4 + shipAddr.length;

  const partyHeight = (Math.max(billLines, shipLines) * lineHeight) + padding;

  drawBox(cursorY, partyHeight);

  // Divider line
  doc.line(pageWidth / 2, cursorY, pageWidth / 2, cursorY + partyHeight);

  const headerY = cursorY + 5;

  // Headers
  doc.setFont('helvetica', 'bold');
  doc.text(isEstimate ? 'Estimate For :' : 'Billed to :', startX + 2, headerY);

  if (!isEstimate) {
    doc.text('Shipped to :', (pageWidth / 2) + 2, headerY);
  }

  doc.setFont('helvetica', 'normal');

  //Bill / Estimate
  let currentYLeft = headerY + 6;
  doc.text(isEstimate ? shipName : billName, startX + 2, currentYLeft);

  currentYLeft += lineHeight;
  const leftAddr = isEstimate ? shipAddr : billAddr;
  doc.text(leftAddr, startX + 2, currentYLeft);
  currentYLeft += (leftAddr.length * lineHeight);

  doc.text(
    isEstimate
      ? `Phone.No.  : ${data.shipTo?.phone || ''}`
      : billPhone,
    startX + 2,
    currentYLeft
  );

  currentYLeft += lineHeight;

  if (!isEstimate) {
    currentYLeft += lineHeight;
    if (showGstinDetails && data.billTo.gstin) {
      doc.text(`GST No. : ${data.billTo.gstin}`, startX + 2, currentYLeft);
    }
  }

  // Shipping
  if (!isEstimate) {
    let currentYRight = headerY + 6;

    doc.text(shipName, (pageWidth / 2) + 2, currentYRight);
    currentYRight += lineHeight;

    doc.text(shipAddr, (pageWidth / 2) + 2, currentYRight);
    currentYRight += (shipAddr.length * lineHeight);

    doc.text(shipPhone, (pageWidth / 2) + 2, currentYRight);
    currentYRight += lineHeight;

    if (showGstinDetails && data.shipTo?.gstin) {
      doc.text(`GST No. : ${data.shipTo.gstin}`, (pageWidth / 2) + 2, currentYRight);
    }
  }

  cursorY += partyHeight;

  let totalQty = 0;
  let totalTaxable = 0;
  let totalTaxAmt = 0;
  let grossTotal = 0;

  // --- Determine price column header ---
  const hasZeroMrp = data.items.some(item => !item.listPrice || item.listPrice === 0);
  const priceHeader = hasZeroMrp ? 'Sale Price' : 'MRP';

  const taxBreakdown: Record<string, { taxable: number, cgst: number, sgst: number }> = {};

  const tableBody = data.items.map(item => {
    const qty = Number(item.quantity) || 0;

    // 1. TRUST THE EXACT DB SCHEMA
    let mrp = Number((item as any).mrp || item.listPrice || 0);
    let finalAmount = Number((item as any).finalPrice || item.amount || (item as any).total || 0);
    let taxAmt = Number((item as any).taxAmount || item.gstAmount || 0);
    let taxableAmt = Number((item as any).taxableAmount || (item as any).subtotal || 0);

    // Safety fallback if taxableAmount is missing
    if (!taxableAmt && finalAmount > 0) {
      taxableAmt = finalAmount - taxAmt;
    }

    // Fallback for discount if it's not saved as a direct currency amount
    let discountAmt = Number(item.discountAmount || (item as any).manualDiscount || (item as any).discount || 0);
    if (discountAmt === 0 && mrp > 0 && taxableAmt > 0) {
      discountAmt = (mrp * qty) - taxableAmt;
    }

    // --- FIX FOR NEGATIVE DISCOUNT (MARKUP) ---
    // If the item was sold for more than MRP, zero out the discount 
    // and bump the printed MRP up to match the actual sales price per unit.
    if (discountAmt < 0) {
      discountAmt = 0;
      mrp = qty > 0 ? (taxableAmt / qty) : taxableAmt;
    }

    // 2. Tax Formatting
    let taxRate = Number(item.taxRate || item.gstPercent || (item as any).tax || 0);

    // FIX: Zero out taxes for Exempt/None, but keep the columns visible!
    const isExempt = safeScheme === 'NONE' || safeTaxType === 'EXEMPT' || safeTaxType === 'NONE';

    if (isEstimate || isExempt) {
      taxRate = 0;
      taxAmt = 0; // Force tax amount to 0.00
      finalAmount = taxableAmt; // Drop the tax from the row's final amount
    }

    totalQty += qty;
    totalTaxable += taxableAmt;
    totalTaxAmt += taxAmt;
    grossTotal += finalAmount;

    if (taxRate > 0) {
      const rateKey = taxRate.toString();
      if (!taxBreakdown[rateKey]) {
        taxBreakdown[rateKey] = { taxable: 0, cgst: 0, sgst: 0 };
      }
      taxBreakdown[rateKey].taxable += taxableAmt;
      taxBreakdown[rateKey].cgst += (taxAmt / 2);
      taxBreakdown[rateKey].sgst += (taxAmt / 2);
    }

    // FIX: Only return the tax columns if showTaxColumns is true
    return showTaxColumns ? [
      item.sno,
      item.name,
      item.hsn || (item as any).hsnSac || '',
      qty,
      item.unit || 'PCS',
      mrp.toFixed(2),
      discountAmt.toFixed(2),
      taxableAmt.toFixed(2),
      `${(taxRate / 2)}%`,
      (taxAmt / 2).toFixed(2),
      `${(taxRate / 2)}%`,
      (taxAmt / 2).toFixed(2),
      finalAmount.toFixed(2)
    ] : [
      item.sno,
      item.name,
      item.hsn || (item as any).hsnSac || '',
      qty,
      item.unit || 'PCS',
      mrp.toFixed(2),
      discountAmt.toFixed(2),
      finalAmount.toFixed(2)
    ];
  });

  const billDiscount = Number(data.billDiscount) || 0;
  const extraExpense = Number(data.extraExpenseAmount) || 0;
  const advance = Number(data.advance) || 0;

  let finalRoundTotal = Number(data.finalAmount || (data as any).grandTotal || 0);
  const pureCalculated = grossTotal - billDiscount + extraExpense- advance;;

  if (!finalRoundTotal) {
    finalRoundTotal = Math.round(pureCalculated);
  }
  const roundOffAmt = finalRoundTotal - pureCalculated;

  autoTable(doc, {
    startY: cursorY,
    head: [showTaxColumns
      ? ['S.N.', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Subtotal', 'CGST', 'CGST Amt', 'SGST', 'SGST Amt', 'Amount']
      : ['S.N.', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Amount']
    ],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 1,
      textColor: textColor,
      lineColor: lineColor,
      lineWidth: 0.1,
      halign: 'center',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: textColor,
      fontStyle: 'bold',
      lineWidth: 0.1,
      lineColor: lineColor
    },
    columnStyles: showTaxColumns ? {
      0: { cellWidth: 8 },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 15 },
      12: { cellWidth: 20, halign: 'right' }
    } : {
      0: { cellWidth: 8 },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 15 },
      7: { cellWidth: 20, halign: 'right' }
    },
    margin: { left: margin, right: margin },
  });

  // @ts-ignore
  let finalY = doc.lastAutoTable.finalY;

  // --- 5. BOTTOM SECTION ---

  if (finalY > pageHeight - 80) {
    doc.addPage();
    finalY = margin;
  }

  const valueBoxW = 25;
  const valueBoxX = endX - valueBoxW;

  
  // --- ADDED: BILL DISCOUNT ROW ---
  if (billDiscount > 0) {
    const discH = 6;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.rect(startX, finalY, contentWidth, discH);
    doc.line(valueBoxX, finalY, valueBoxX, finalY + discH); // Vertical separator

    doc.text('Less : Bill Discount (-)', valueBoxX - 2, finalY + 4, { align: 'right' });
     doc.text(formatNumberWithCommas(billDiscount), endX - 2, finalY + 4, { align: 'right' });
    finalY += discH;
  }

  if (advance > 0) {
    const advH = 6;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.rect(startX, finalY, contentWidth, advH);
    doc.line(valueBoxX, finalY, valueBoxX, finalY + advH); // Vertical separator
    doc.text('Advance Paid (-):', valueBoxX - 2, finalY + 4, { align: 'right' });
    doc.text(formatNumberWithCommas(advance), endX - 2, finalY + 4, { align: 'right' });
    finalY += advH;
  }

 // --- ADDED: EXTRA EXPENSE ROW ---
  if (data.extraExpenseName && data.extraExpenseAmount && data.extraExpenseAmount > 0) {
    const names = data.extraExpenseName.split(',').map(n => n.trim()).filter(Boolean);
    const totalExpense = data.extraExpenseAmount;

    if (names.length <= 1) {
      const expH = 6;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.rect(startX, finalY, contentWidth, expH);
      doc.line(valueBoxX, finalY, valueBoxX, finalY + expH); // Vertical separator

      doc.text(`Add : ${names[0] || 'Extra Expense'} (+)`, valueBoxX - 2, finalY + 4, { align: 'right' });
      doc.text(totalExpense.toFixed(2), endX - 2, finalY + 4, { align: 'right' });
      finalY += expH;
    } else {
      const totalExpenseH = 6 * names.length;
      doc.rect(startX, finalY, contentWidth, totalExpenseH);
      doc.line(valueBoxX, finalY, valueBoxX, finalY + totalExpenseH); // Vertical separator

      names.forEach((name, idx) => {
        const expH = 6;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Add : ${name} (+)`, valueBoxX - 2, finalY + 4, { align: 'right' });
        if (idx === names.length - 1) {
          doc.text(totalExpense.toFixed(2), endX - 2, finalY + 4, { align: 'right' });
        }
        finalY += expH;
      });
    }
  }

  // 1. ROUNDED OFF
  const roundOffH = 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.rect(startX, finalY, contentWidth, roundOffH);
  doc.line(valueBoxX, finalY, valueBoxX, finalY + roundOffH); // Vertical separator

  doc.text('Add : Rounded off (+)', valueBoxX - 2, finalY + 4, { align: 'right' });
  doc.text(roundOffAmt.toFixed(2), endX - 2, finalY + 4, { align: 'right' });
  finalY += roundOffH;

  // 2. GRAND TOTAL
const grandTotalAfterAdvance = finalRoundTotal - advance; // ✅ subtract advance
const grandTotalH = 8;
doc.setFontSize(9);
doc.setFont('helvetica', 'bold');
doc.rect(startX, finalY, contentWidth, grandTotalH);

doc.text('Grand Total', pageWidth / 6, finalY + 5.5);
doc.text(`${totalQty.toFixed(3)} Unit`, pageWidth / 3, finalY + 5.5);
doc.text('Rs.', endX - 35, finalY + 5.5);

doc.rect(endX - 30, finalY, 30, grandTotalH);
doc.text(formatNumberWithCommas(grandTotalAfterAdvance), endX - 2, finalY + 5.5, { align: 'right' }); // ✅ use new value
finalY += grandTotalH;

  if (data.narration && data.narration.trim() !== '') {
    doc.setFontSize(8);

    const narrationLines = doc.splitTextToSize(data.narration, contentWidth - 18);
    const narrationH = (narrationLines.length * 4) + 4;

    if (finalY + narrationH > pageHeight - margin) {
      doc.addPage();
      finalY = margin;
    }

    doc.rect(startX, finalY, contentWidth, narrationH);

    doc.setFont('helvetica', 'bold');
    doc.text('Remarks:', startX + 2, finalY + 4);

    doc.setFont('helvetica', 'normal');
    doc.text(narrationLines, startX + 16, finalY + 4);

    finalY += narrationH;
  }
  
  // 3. TAX TABLE
  if (showTaxColumns) {
    const taxHeaders = [['Tax Rate', 'Taxable Amt.', 'CGST', 'SGST', 'Total Tax']];
    const taxBody = Object.keys(taxBreakdown).map(rate => {
      const d = taxBreakdown[rate];
      return [`${rate}%`, formatNumberWithCommas(d.taxable), formatNumberWithCommas(d.cgst), formatNumberWithCommas(d.sgst), formatNumberWithCommas(d.cgst + d.sgst)];
    });

    taxBody.push(['TOTAL', formatNumberWithCommas(totalTaxable), formatNumberWithCommas(totalTaxAmt / 2), formatNumberWithCommas(totalTaxAmt / 2), formatNumberWithCommas(totalTaxAmt)]);

    autoTable(doc, {
      startY: finalY + 2,
      head: taxHeaders,
      body: taxBody,
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 1,
        textColor: textColor,
        lineColor: lineColor,
        lineWidth: 0.1,
        halign: 'right'
      },
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: textColor,
        fontStyle: 'bold',
        halign: 'right',
        lineColor: lineColor,
        lineWidth: 0.1
      },
      columnStyles: {
        0: { halign: 'left' }
      },
      tableWidth: contentWidth / 2,
      margin: { left: startX },
    });

    // @ts-ignore
    let taxTableEnd = doc.lastAutoTable.finalY;
    finalY = Math.max(taxTableEnd + 2, finalY + 25);
  }

  // 4. AMOUNT IN WORDS + PREVIOUS BALANCE / TOTAL DUE (same row, after tax table)
  const prevBal = Number(data.previousBalance) || 0;
  const currentDue = Number(data.due) || 0;
  const totalDue = prevBal + currentDue;
  const hasPrevOrDue = prevBal > 0 || currentDue > 0;

  const wordsH = hasPrevOrDue ? 12 : 8;
  const rightColW = hasPrevOrDue ? 70 : 0;
  const leftColW = contentWidth - rightColW;

  doc.rect(startX, finalY, contentWidth, wordsH);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  const amountWords = convertNumberToWords(grandTotalAfterAdvance);
  doc.text(`Rs. ${amountWords}`, startX + 2, finalY + (hasPrevOrDue ? 7 : 5.5));

  if (hasPrevOrDue) {
    const dividerX = startX + leftColW;
    doc.line(dividerX, finalY, dividerX, finalY + wordsH);
    doc.line(dividerX, finalY + 6, endX, finalY + 6);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Previous Balance :', dividerX + 2, finalY + 4.5);
    doc.text(formatNumberWithCommas(prevBal), endX - 2, finalY + 4.5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text('Balance Due :', dividerX + 2, finalY + 10);
    doc.text(formatNumberWithCommas(totalDue), endX - 2, finalY + 10, { align: 'right' });
  }

  finalY += wordsH;

  // 5. BANK DETAILS
  if (!isEstimate && safeScheme !== 'NONE') {
    const bankH = 10;
    doc.rect(startX, finalY, contentWidth, bankH);
    doc.setFont('helvetica', 'bold');
    doc.text('BANK DETAIL :', startX + 2, finalY + 4);
    const bdWidth = doc.getTextWidth('BANK DETAIL :');
    doc.line(startX + 2, finalY + 4.5, startX + 2 + bdWidth, finalY + 4.5);
    doc.setFont('helvetica', 'bold');
    const bankText = `Bank name : ${data.bankDetails?.bankName || ''} , A/C NO. ${data.bankDetails?.accountNumber || ''}`;
    doc.text(bankText, startX + 35, finalY + 4);
    doc.text(`IFSC Code ${data.bankDetails?.ifsc || ''}`, startX + 35, finalY + 8);
    finalY += bankH;
  }

  // 6. FOOTER
  if (!isEstimate) {
    const footerH = 35;
    if (finalY + footerH > pageHeight - margin) {
      doc.addPage();
      finalY = margin;
    }
    const termsWidth = contentWidth * 0.50;
    const receiverWidth = contentWidth * 0.25;
    const authWidth = contentWidth * 0.25;

    const termsX = startX;
    const receiverX = startX + termsWidth;
    const authX = startX + termsWidth + receiverWidth;

    doc.rect(termsX, finalY, termsWidth, footerH);
    doc.rect(receiverX, finalY, receiverWidth, footerH);
    doc.rect(authX, finalY, authWidth, footerH);

    let termY = finalY + 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Terms & Condition', termsX + 2, termY);
    const tcWidth = doc.getTextWidth('Terms & Condition');
    doc.line(termsX + 2, termY + 1, termsX + 2 + tcWidth, termY + 1);

    termY += 4;
    doc.setFont('helvetica', 'normal');
    doc.text('E. & O. E.', termsX + 2, termY);
    termY += 4;
    const termLines = doc.splitTextToSize(data.terms, termsWidth - 5);
    doc.text(termLines, termsX + 2, termY);

    doc.setFont('helvetica', 'bold');
    doc.text("Receiver's Signature :", receiverX + 2, finalY + 4);

    const authCenter = authX + (authWidth / 2);
    doc.setFontSize(7);
    doc.text(`for ${data.companyName}`, authCenter, finalY + 4, { align: 'center' });

    if (data.signatureBase64) {
      const imgWidth = 35;
      const imgHeight = 15;
      const imgX = authCenter - (imgWidth / 2);
      const imgY = finalY + 8;
      try {
        doc.addImage(data.signatureBase64, 'PNG', imgX, imgY, imgWidth, imgHeight);
      } catch (e) {
        console.error("Error adding signature", e);
      }
    }

    doc.setFontSize(8);
    doc.text("Authorised Signatory", authCenter, finalY + footerH - 2, { align: 'center' });
  }

  // 7. BRANDING FOOTER
  const brandingHeight = 15;
  const brandingY = pageHeight - brandingHeight;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');

  const pbText = 'Powered by ';
  const linkText = 'SELLAR.IN';

  const pbWidth = doc.getTextWidth(pbText);
  const linkWidth = doc.getTextWidth(linkText);

  let brandingX = (pageWidth / 2) - ((pbWidth + linkWidth) / 2);

  // 1. Print "Powered by " (Black)
  doc.text(pbText, brandingX, brandingY + 5);
  brandingX += pbWidth;

  // 2. Print "SELLAR.IN" (Blue)
  const linkColorR = 0;
  const linkColorG = 102;
  const linkColorB = 204;

  doc.setTextColor(linkColorR, linkColorG, linkColorB);
  doc.text(linkText, brandingX, brandingY + 5);

  // 3. Draw Underline (Same Blue Color)
  doc.setDrawColor(linkColorR, linkColorG, linkColorB);
  doc.setLineWidth(0.1);
  // Line from start of text to end of text, slightly below baseline (+ 5.5)
  doc.line(brandingX, brandingY + 5.5, brandingX + linkWidth, brandingY + 5.5);

  // 4. Create Clickable Link
  doc.link(brandingX, brandingY + 2, linkWidth, 4, { url: 'https://www.sellar.in' });

  // Reset Colors for next section
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  // "Made with Love in India" logic (Unchanged)
  doc.setFont('helvetica', 'normal');
  const part1 = "Made with ";
  const part2 = "Love";
  const part3 = " in India";

  const part1Width = doc.getTextWidth(part1);
  const part2Width = doc.getTextWidth(part2);
  const part3Width = doc.getTextWidth(part3);

  const totalWidth = part1Width + part2Width + part3Width;
  let currentX = (pageWidth / 2) - (totalWidth / 2);
  const textY = brandingY + 10;

  doc.text(part1, currentX, textY);
  currentX += part1Width;
  doc.setTextColor(255, 0, 0);
  doc.text(part2, currentX, textY);
  currentX += part2Width;
  doc.setTextColor(0, 0, 139);
  doc.text(part3, currentX, textY);
  doc.setTextColor(0, 0, 0);

  // --- DUPLICATE PAGE ---
  if (withDuplicate && !isEstimate) {
    doc.addPage();

    // "DUPLICATE" label at top center
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 100, 100);
    doc.text("DUPLICATE", pageWidth / 2, margin + 2, { align: "center" });
    doc.setTextColor(0, 0, 0);

    let dupCursorY = margin;

    // Timestamp
    const dupNow = new Date();
    const dupGeneratedAt = dupNow.toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Bill generated on ${dupGeneratedAt}`, pageWidth - margin, dupCursorY - 2, { align: "right" });

    // --- RE-DRAW HEADER ---
    const dupAddressLines = doc.splitTextToSize(data.companyAddress, contentWidth - 50);
    const dupExtraAddressLines = Math.max(0, dupAddressLines.length - 1);
    const dupAddressOffset = dupExtraAddressLines * 4;
    const dupHeaderHeight = 25 + dupAddressOffset;

    doc.rect(startX, dupCursorY, contentWidth, dupHeaderHeight);

    if (qrBase64) {
      doc.addImage(qrBase64, 'PNG', startX + 2, dupCursorY + 2, 18, 18);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'normal');
      doc.text('Scan to Pay', startX + 11, dupCursorY + 22, { align: 'center' });
    }

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(title, pageWidth / 2, dupCursorY + 5, { align: 'center' });

    doc.setFontSize(8);
    doc.text(`Msme No ${data.msmeNumber || ''}`, endX - 2, dupCursorY + 5, { align: 'right' });

    const dupLogoX = endX - 18 - 2;
    const dupLogoY = dupCursorY + 7;
    if (data.companyLogoBase64) {
      try {
        doc.addImage(data.companyLogoBase64, 'PNG', dupLogoX, dupLogoY, 18, 14);
      } catch (e) { /* skip */ }
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(data.companyName.toUpperCase(), pageWidth / 2, dupCursorY + 11, { align: 'center' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(dupAddressLines, pageWidth / 2, dupCursorY + 16, { align: 'center' });
    doc.text(`Phone : ${data.companyContact}`, pageWidth / 2, dupCursorY + 20, { align: 'center' });

    if (showGstinDetails) {
      doc.setFont('helvetica', 'bold');
      doc.text(`GSTIN : ${data.companyGstin || ''}  (${safeScheme})`, pageWidth / 2, dupCursorY + 24 + dupAddressOffset, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    }

    dupCursorY += dupHeaderHeight;

    // --- RE-DRAW META INFO ---
    doc.rect(startX, dupCursorY, contentWidth, metaHeight);
    doc.line(pageWidth / 2, dupCursorY, pageWidth / 2, dupCursorY + metaHeight);
    doc.setFontSize(9);
    doc.text(`Invoice No. :  ${data.invoice.number}`, startX + 2, dupCursorY + 5);
    doc.text(`Date          :  ${data.invoice.date}`, startX + 2, dupCursorY + 10);
    const dupPosVal = data.billTo.address.split(',').pop()?.trim() || '';
    doc.text(`Place of Supply : ${dupPosVal}`, (pageWidth / 2) + 2, dupCursorY + 5);
    if (showGstinDetails) {
      let dupSchemeInfo = `GST Type: ${safeScheme}`;
      if (safeScheme === 'REGULAR') dupSchemeInfo += ` (${safeTaxType})`;
      doc.setFont('helvetica', 'bold');
      doc.text(dupSchemeInfo, (pageWidth / 2) + 2, dupCursorY + 10);
      doc.setFont('helvetica', 'normal');
    }
    dupCursorY += metaHeight;

    // --- RE-DRAW PARTIES SECTION ---
    doc.rect(startX, dupCursorY, contentWidth, partyHeight);
    doc.line(pageWidth / 2, dupCursorY, pageWidth / 2, dupCursorY + partyHeight);

    const dupHeaderY = dupCursorY + 5;
    doc.setFont('helvetica', 'bold');
    doc.text('Billed to :', startX + 2, dupHeaderY);
    doc.text('Shipped to :', (pageWidth / 2) + 2, dupHeaderY);
    doc.setFont('helvetica', 'normal');

    let dupLeftY = dupHeaderY + 6;
    doc.text(billName, startX + 2, dupLeftY);
    dupLeftY += 5;
    doc.text(billAddr, startX + 2, dupLeftY);
    dupLeftY += billAddr.length * 5;
    doc.text(billPhone, startX + 2, dupLeftY);
    dupLeftY += 5;
    if (showGstinDetails && data.billTo.gstin) {
      doc.text(`GST No. : ${data.billTo.gstin}`, startX + 2, dupLeftY);
    }

    let dupRightY = dupHeaderY + 6;
    doc.text(shipName, (pageWidth / 2) + 2, dupRightY);
    dupRightY += 5;
    doc.text(shipAddr, (pageWidth / 2) + 2, dupRightY);
    dupRightY += shipAddr.length * 5;
    doc.text(shipPhone, (pageWidth / 2) + 2, dupRightY);
    dupRightY += 5;
    if (showGstinDetails && data.shipTo?.gstin) {
      doc.text(`GST No. : ${data.shipTo.gstin}`, (pageWidth / 2) + 2, dupRightY);
    }

    dupCursorY += partyHeight;

    // --- RE-DRAW ITEMS TABLE ---
    autoTable(doc, {
      startY: dupCursorY,
      head: [showTaxColumns
        ? ['S.N.', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Subtotal', 'CGST', 'CGST Amt', 'SGST', 'SGST Amt', 'Amount']
        : ['S.N.', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Amount']
      ],
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1, textColor, lineColor, lineWidth: 0.1, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [255, 255, 255], textColor, fontStyle: 'bold', lineWidth: 0.1, lineColor },
      columnStyles: showTaxColumns ? {
        0: { cellWidth: 8 }, 1: { cellWidth: 'auto', halign: 'left' }, 2: { cellWidth: 15 }, 12: { cellWidth: 20, halign: 'right' }
      } : {
        0: { cellWidth: 8 }, 1: { cellWidth: 'auto', halign: 'left' }, 2: { cellWidth: 15 }, 7: { cellWidth: 20, halign: 'right' }
      },
      margin: { left: margin, right: margin },
    });

    // @ts-ignore
    let dupFinalY = doc.lastAutoTable.finalY;

    // --- RE-DRAW BOTTOM TOTALS (discount, advance, round-off, grand total) ---
    if (billDiscount > 0) {
      const discH = 6;
      doc.rect(startX, dupFinalY, contentWidth, discH);
      doc.line(valueBoxX, dupFinalY, valueBoxX, dupFinalY + discH);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text('Less : Bill Discount (-)', valueBoxX - 2, dupFinalY + 4, { align: 'right' });
      doc.text(formatNumberWithCommas(billDiscount), endX - 2, dupFinalY + 4, { align: 'right' });
      dupFinalY += discH;
    }

    if (advance > 0) {
      const advH = 6;
      doc.rect(startX, dupFinalY, contentWidth, advH);
      doc.line(valueBoxX, dupFinalY, valueBoxX, dupFinalY + advH);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text('Advance Paid (-):', valueBoxX - 2, dupFinalY + 4, { align: 'right' });
      doc.text(formatNumberWithCommas(advance), endX - 2, dupFinalY + 4, { align: 'right' });
      dupFinalY += advH;
    }

    if (data.extraExpenseName && data.extraExpenseAmount && data.extraExpenseAmount > 0) {
      const names = data.extraExpenseName.split(',').map(n => n.trim()).filter(Boolean);
      if (names.length <= 1) {
        const expH = 6;
        doc.rect(startX, dupFinalY, contentWidth, expH);
        doc.line(valueBoxX, dupFinalY, valueBoxX, dupFinalY + expH);
        doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        doc.text(`Add : ${names[0] || 'Extra Expense'} (+)`, valueBoxX - 2, dupFinalY + 4, { align: 'right' });
        doc.text(data.extraExpenseAmount.toFixed(2), endX - 2, dupFinalY + 4, { align: 'right' });
        dupFinalY += expH;
      } else {
        const totalExpenseH = 6 * names.length;
        doc.rect(startX, dupFinalY, contentWidth, totalExpenseH);
        doc.line(valueBoxX, dupFinalY, valueBoxX, dupFinalY + totalExpenseH);
        names.forEach((name, idx) => {
          doc.setFontSize(8); doc.setFont('helvetica', 'normal');
          doc.text(`Add : ${name} (+)`, valueBoxX - 2, dupFinalY + 4, { align: 'right' });
          if (idx === names.length - 1) doc.text(data.extraExpenseAmount!.toFixed(2), endX - 2, dupFinalY + 4, { align: 'right' });
          dupFinalY += 6;
        });
      }
    }

    // Round off
    doc.rect(startX, dupFinalY, contentWidth, roundOffH);
    doc.line(valueBoxX, dupFinalY, valueBoxX, dupFinalY + roundOffH);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Add : Rounded off (+)', valueBoxX - 2, dupFinalY + 4, { align: 'right' });
    doc.text(roundOffAmt.toFixed(2), endX - 2, dupFinalY + 4, { align: 'right' });
    dupFinalY += roundOffH;

    // Grand total
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.rect(startX, dupFinalY, contentWidth, grandTotalH);
    doc.text('Grand Total', pageWidth / 6, dupFinalY + 5.5);
    doc.text(`${totalQty.toFixed(3)} Unit`, pageWidth / 3, dupFinalY + 5.5);
    doc.text('Rs.', endX - 35, dupFinalY + 5.5);
    doc.rect(endX - 30, dupFinalY, 30, grandTotalH);
    doc.text(formatNumberWithCommas(grandTotalAfterAdvance), endX - 2, dupFinalY + 5.5, { align: 'right' });
    dupFinalY += grandTotalH;

    // Narration
    if (data.narration && data.narration.trim() !== '') {
      const dupNarrationLines = doc.splitTextToSize(data.narration, contentWidth - 18);
      const dupNarrationH = (dupNarrationLines.length * 4) + 4;
      doc.rect(startX, dupFinalY, contentWidth, dupNarrationH);
      doc.setFont('helvetica', 'bold');
      doc.text('Remarks:', startX + 2, dupFinalY + 4);
      doc.setFont('helvetica', 'normal');
      doc.text(dupNarrationLines, startX + 16, dupFinalY + 4);
      dupFinalY += dupNarrationH;
    }

    // Tax table
    if (showTaxColumns) {
      const dupTaxHeaders = [['Tax Rate', 'Taxable Amt.', 'CGST', 'SGST', 'Total Tax']];
      const dupTaxBody = Object.keys(taxBreakdown).map(rate => {
        const d = taxBreakdown[rate];
        return [`${rate}%`, formatNumberWithCommas(d.taxable), formatNumberWithCommas(d.cgst), formatNumberWithCommas(d.sgst), formatNumberWithCommas(d.cgst + d.sgst)];
      });
      dupTaxBody.push(['TOTAL', formatNumberWithCommas(totalTaxable), formatNumberWithCommas(totalTaxAmt / 2), formatNumberWithCommas(totalTaxAmt / 2), formatNumberWithCommas(totalTaxAmt)]);
      autoTable(doc, {
        startY: dupFinalY + 2,
        head: dupTaxHeaders,
        body: dupTaxBody,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1, textColor, lineColor, lineWidth: 0.1, halign: 'right' },
        headStyles: { fillColor: [255, 255, 255], textColor, fontStyle: 'bold', halign: 'right', lineColor, lineWidth: 0.1 },
        columnStyles: { 0: { halign: 'left' } },
        tableWidth: contentWidth / 2,
        margin: { left: startX },
      });
      // @ts-ignore
      dupFinalY = Math.max(doc.lastAutoTable.finalY + 2, dupFinalY + 25);
    }

    // Amount in words + Previous balance
    doc.rect(startX, dupFinalY, contentWidth, wordsH);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${convertNumberToWords(grandTotalAfterAdvance)}`, startX + 2, dupFinalY + (hasPrevOrDue ? 7 : 5.5));
    if (hasPrevOrDue) {
      const dupDividerX = startX + leftColW;
      doc.line(dupDividerX, dupFinalY, dupDividerX, dupFinalY + wordsH);
      doc.line(dupDividerX, dupFinalY + 6, endX, dupFinalY + 6);
      doc.setFont('helvetica', 'normal');
      doc.text('Previous Balance :', dupDividerX + 2, dupFinalY + 4.5);
      doc.text(formatNumberWithCommas(prevBal), endX - 2, dupFinalY + 4.5, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text('Balance Due :', dupDividerX + 2, dupFinalY + 10);
      doc.text(formatNumberWithCommas(totalDue), endX - 2, dupFinalY + 10, { align: 'right' });
    }
    dupFinalY += wordsH;

    // Bank details
    if (safeScheme !== 'NONE') {
      const dupBankH = 10;
      doc.rect(startX, dupFinalY, contentWidth, dupBankH);
      doc.setFont('helvetica', 'bold');
      doc.text('BANK DETAIL :', startX + 2, dupFinalY + 4);
      const dupBdWidth = doc.getTextWidth('BANK DETAIL :');
      doc.line(startX + 2, dupFinalY + 4.5, startX + 2 + dupBdWidth, dupFinalY + 4.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`Bank name : ${data.bankDetails?.bankName || ''} , A/C NO. ${data.bankDetails?.accountNumber || ''}`, startX + 35, dupFinalY + 4);
      doc.text(`IFSC Code ${data.bankDetails?.ifsc || ''}`, startX + 35, dupFinalY + 8);
      dupFinalY += dupBankH;
    }

    // Footer (Terms, Receiver, Auth Signatory)
    const dupFooterH = 35;
    if (dupFinalY + dupFooterH > pageHeight - margin) {
      doc.addPage();
      dupFinalY = margin;
    }
    const dupTermsWidth = contentWidth * 0.50;
    const dupReceiverWidth = contentWidth * 0.25;
    const dupAuthWidth = contentWidth * 0.25;
    const dupTermsX = startX;
    const dupReceiverX = startX + dupTermsWidth;
    const dupAuthX = startX + dupTermsWidth + dupReceiverWidth;

    doc.rect(dupTermsX, dupFinalY, dupTermsWidth, dupFooterH);
    doc.rect(dupReceiverX, dupFinalY, dupReceiverWidth, dupFooterH);
    doc.rect(dupAuthX, dupFinalY, dupAuthWidth, dupFooterH);

    let dupTermY = dupFinalY + 4;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Terms & Condition', dupTermsX + 2, dupTermY);
    const dupTcWidth = doc.getTextWidth('Terms & Condition');
    doc.line(dupTermsX + 2, dupTermY + 1, dupTermsX + 2 + dupTcWidth, dupTermY + 1);
    dupTermY += 4;
    doc.setFont('helvetica', 'normal');
    doc.text('E. & O. E.', dupTermsX + 2, dupTermY);
    dupTermY += 4;
    doc.text(doc.splitTextToSize(data.terms, dupTermsWidth - 5), dupTermsX + 2, dupTermY);

    doc.setFont('helvetica', 'bold');
    doc.text("Receiver's Signature :", dupReceiverX + 2, dupFinalY + 4);

    const dupAuthCenter = dupAuthX + (dupAuthWidth / 2);
    doc.setFontSize(7);
    doc.text(`for ${data.companyName}`, dupAuthCenter, dupFinalY + 4, { align: 'center' });

    if (data.signatureBase64) {
      try {
        doc.addImage(data.signatureBase64, 'PNG', dupAuthCenter - 17.5, dupFinalY + 8, 35, 15);
      } catch (e) { /* skip */ }
    }
    doc.setFontSize(8);
    doc.text("Authorised Signatory", dupAuthCenter, dupFinalY + dupFooterH - 2, { align: 'center' });
  }
  // --- OUTPUT ---
  if (action === ACTION.PRINT) {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else if (action === ACTION.DOWNLOAD) {
    doc.save(`Invoice_${data.invoice.number}.pdf`);
  } else if (action === ACTION.BLOB) {
    return doc.output('blob');
  }
};
const formatNumberWithCommas = (num: number): string => {
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};
const convertNumberToWords = (amount: number): string => {
  const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
  const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const numToWords = (n: number): string => {
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + units[n % 10] : "");
    if (n < 1000) return units[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + numToWords(n % 100) : "");
    return "";
  };

  if (amount === 0) return "Zero Only";

  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);

  let str = "";
  let n = integerPart;

  if (Math.floor(n / 10000000) > 0) {
    str += numToWords(Math.floor(n / 10000000)) + " Crore ";
    n %= 10000000;
  }
  if (Math.floor(n / 100000) > 0) {
    str += numToWords(Math.floor(n / 100000)) + " Lakh ";
    n %= 100000;
  }
  if (Math.floor(n / 1000) > 0) {
    str += numToWords(Math.floor(n / 1000)) + " Thousand ";
    n %= 1000;
  }
  if (n > 0) {
    str += numToWords(n);
  }

  str += " Only";

  if (decimalPart > 0) {
    str += " and " + numToWords(decimalPart) + " Paise Only";
  }

  return str.trim();
};

export const preparePdfData = async (invoiceData: any) => {
  // 1. Fetch Company Details (Safe Fetch)
  let companyData: any = {
    name: 'My Company',
    address: '',
    phone: '',
    email: '',
    gstin: ''
  };
  let companyLogoBase64: string | undefined = undefined;
  if (invoiceData.companyId) {
    try {
      const companyDoc = await getDoc(doc(db, 'companies', invoiceData.companyId));
      if (companyDoc.exists()) {
        companyData = { ...companyData, ...companyDoc.data() };
      }
      // **NEW: Fetch company logo from business_info**
      const businessInfoDoc = await getDoc(
        doc(db, 'companies', invoiceData.companyId, 'business_info', invoiceData.companyId)
      );

      if (businessInfoDoc.exists()) {
        const businessData = businessInfoDoc.data();
        const logoUrl = businessData?.companyLogo;

        if (logoUrl) {
          // Convert logo URL to base64
          try {
            const response = await fetch(logoUrl);
            const blob = await response.blob();
            companyLogoBase64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (error) {
            console.error("Error converting logo to base64:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching company for PDF:", error);
    }
  }

  return {
    ...invoiceData,
    companyLogoBase64,

    // --- TEXT FIELDS (The likely culprits) ---
    type: invoiceData.type || 'SALES',              // Fixes 'undefined' type
    voucherName: invoiceData.voucherName || 'Tax Invoice',
    currency: invoiceData.currency || 'INR',        // Fixes currency crash
    status: invoiceData.status || 'Paid',           // Fixes status crash
    paymentStatus: invoiceData.paymentStatus || 'Paid',
    taxType: invoiceData.taxType || 'exclusive',
    gstScheme: invoiceData.gstScheme || 'regular',
    partyName: invoiceData.partyName || 'Cash Customer',
    invoiceNumber: invoiceData.invoiceNumber || 'INV-000',
    mode: invoiceData.mode || 'print',
    upiId: invoiceData.settings?.upiId || companyData.upiId || '',        // Some generators check 'mode'

    // --- OBJECTS ---
    company: companyData,
    settings: invoiceData.settings || {},           // Prevents settings.something crash

    // --- NUMBERS ---
    totalAmount: invoiceData.totalAmount || 0,
    subtotal: invoiceData.subtotal || 0,
    taxAmount: invoiceData.taxAmount || 0,
    roundOff: invoiceData.roundOff || 0,
    advance: invoiceData.advance || invoiceData.advanceAmount || 0,
    due: invoiceData.due || invoiceData.dueAmount || invoiceData.balanceDue || 0,

    // --- ARRAYS ---
    items: (invoiceData.items || []).map((item: any) => ({
      ...item,
      name: item.name || 'Item',
      unit: item.unit || 'pcs',
      hsn: item.hsn || '',
      gstRate: item.gstRate || item.tax || 0,
      quantity: item.quantity || 0,
      price: item.price || item.rate || 0,
      amount: item.amount ?? undefined,
      discountAmount: item.discountAmount ?? item.discount ?? 0,
      // Ensure these exist for items too
      taxType: item.taxType || 'exclusive'
    }))
  };
};
export const generatePdfBlob = async (data: InvoiceData, withDuplicate: boolean = false): Promise<Blob> => {
  const result = await generatePdf(data, ACTION.BLOB, withDuplicate);

  // Ensure we actually got a Blob back
  if (result instanceof Blob) {
    return result;
  }

  throw new Error("Failed to generate PDF Blob");
};