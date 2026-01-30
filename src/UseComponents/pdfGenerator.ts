import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ACTION } from '../enums';

export interface InvoiceData {
  gstScheme?: string;       // 'REGULAR', 'COMPOSITION', 'NONE'
  taxType?: string;         // 'INCLUSIVE' or 'EXCLUSIVE'

  companyName: string;
  companyAddress: string;
  companyContact: string;
  companyEmail?: string;
  companyGstin?: string;
  msmeNumber?: string;
  signatureBase64?: string;
  billTo: {
    name: string;
    address: string;
    email?: string;
    phone: string;
    gstin?: string;
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
    listPrice: number;
    gstPercent?: number;
    taxRate?: number;
    discountAmount: number;
    amount?: number;
  }[];
  terms: string;
  bankDetails?: {
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
    gstin?: string;
    ifsc?: string;
  };
}

export const generatePdf = async (data: InvoiceData, action: ACTION.DOWNLOAD | ACTION.PRINT | ACTION.BLOB = ACTION.DOWNLOAD): Promise<Blob | void> => {
  console.log("PDF Generator Data:", {
    scheme: data.gstScheme,
    taxType: data.taxType,
    items: data.items
  });

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

  // --- NORMALIZATION ---
  const safeScheme = (data.gstScheme && data.gstScheme.trim() !== '')
    ? data.gstScheme.toUpperCase()
    : 'NONE';

  const safeTaxType = (data.taxType && data.taxType.trim() !== '')
    ? data.taxType.toUpperCase()
    : 'EXCLUSIVE';

  const drawBox = (y: number, h: number) => {
    doc.rect(startX, y, contentWidth, h);
  };

  let cursorY = margin;

  // --- 1. HEADER SECTION ---
  const headerHeight = 25;
  drawBox(cursorY, headerHeight);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');

  const title = (safeScheme === 'COMPOSITION' || safeScheme === 'NONE')
    ? 'BILL OF SUPPLY'
    : 'TAX INVOICE';
  doc.text(title, pageWidth / 2, cursorY + 5, { align: 'center' });

  doc.setFontSize(8);
  doc.text(`Msme No ${data.msmeNumber || ''}`, endX - 2, cursorY + 5, { align: 'right' });

  doc.setFontSize(16);
  doc.text(data.companyName.toUpperCase(), pageWidth / 2, cursorY + 11, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const addressLines = doc.splitTextToSize(data.companyAddress, contentWidth - 50);
  doc.text(addressLines, pageWidth / 2, cursorY + 16, { align: 'center' });

  doc.text(`Phone : ${data.companyContact}`, pageWidth / 2, cursorY + 20, { align: 'center' });

  if (safeScheme !== 'NONE') {
    doc.setFont('helvetica', 'bold');
    const gstText = `GSTIN : ${data.companyGstin || ''}  (${safeScheme})`;
    doc.text(gstText, pageWidth / 2, cursorY + 24, { align: 'center' });
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

  const posVal = data.billTo.address.split(',').pop()?.trim() || 'Uttar Pradesh';
  doc.text(`Place of Supply : ${posVal}`, (pageWidth / 2) + 2, cursorY + 5);

  if (safeScheme !== 'NONE') {
    let schemeInfo = `GST Type: ${safeScheme}`;
    if (safeScheme === 'REGULAR') {
      schemeInfo += ` (${safeTaxType})`;
    }

    doc.setFont('helvetica', 'bold');
    doc.text(schemeInfo, (pageWidth / 2) + 2, cursorY + 10);
  }
  doc.setFont('helvetica', 'normal');
  doc.text(`Vehicle No.      : ${data.invoice.roNumber || ''}`, (pageWidth / 2) + 2, cursorY + 15);

  cursorY += metaHeight;

  // --- 3. PARTIES SECTION ---
  const billName = data.billTo.name;
  const billAddr = doc.splitTextToSize(data.billTo.address, (contentWidth / 2) - 5);
  const billPhone = `PH.NO.  : ${data.billTo.phone || ''}`;
  const billEmail = `E Mail  : ${data.billTo.email || ''}`;
  const billGst = `GST No. : ${data.billTo.gstin || ''}`;

  const shipName = data.billTo.name;
  const shipAddr = billAddr;
  const shipPhone = `PH.NO.  :`;
  const shipEmail = `E Mail  :`;
  const shipGst = `GST No. :`;

  const lineHeight = 5;
  const padding = 10;
  const fixedLines = 5;
  const billLines = fixedLines + billAddr.length;
  const shipLines = fixedLines + shipAddr.length;
  const partyHeight = (Math.max(billLines, shipLines) * lineHeight) + padding;

  drawBox(cursorY, partyHeight);
  doc.line(pageWidth / 2, cursorY, pageWidth / 2, cursorY + partyHeight);

  const headerY = cursorY + 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Billed to :', startX + 2, headerY);
  const billedToWidth = doc.getTextWidth('Billed to :');
  doc.line(startX + 2, headerY + 1, startX + 2 + billedToWidth, headerY + 1);

  doc.text('Shipped to :', (pageWidth / 2) + 2, headerY);
  const shippedToWidth = doc.getTextWidth('Shipped to :');
  doc.line((pageWidth / 2) + 2, headerY + 1, (pageWidth / 2) + 2 + shippedToWidth, headerY + 1);
  doc.setFont('helvetica', 'normal');

  let currentY = headerY + 6;
  doc.text(billName, startX + 2, currentY);
  currentY += lineHeight;
  doc.text(billAddr, startX + 2, currentY);
  currentY += (billAddr.length * lineHeight);
  doc.text(billPhone, startX + 2, currentY);
  currentY += lineHeight;
  doc.text(billEmail, startX + 2, currentY);
  currentY += lineHeight;
  doc.text(billGst, startX + 2, currentY);

  currentY = headerY + 6;
  const midX = (pageWidth / 2) + 2;
  doc.text(shipName, midX, currentY);
  currentY += lineHeight;
  doc.text(shipAddr, midX, currentY);
  currentY += (shipAddr.length * lineHeight);
  doc.text(shipPhone, midX, currentY);
  currentY += lineHeight;
  doc.text(shipEmail, midX, currentY);
  currentY += lineHeight;
  doc.text(shipGst, midX, currentY);

  cursorY += partyHeight;

  // --- 4. ITEM TABLE ---
  let totalQty = 0;
  let totalTaxable = 0;
  let totalTaxAmt = 0;
  let grossTotal = 0;

  const taxBreakdown: Record<string, { taxable: number, cgst: number, sgst: number }> = {};

  const tableBody = data.items.map(item => {
    const qty = Number(item.quantity) || 0;
    const mrp = Number(item.listPrice) || 0;

    // --- STEP 1: DETERMINE ROW TOTAL (MONEY VALUE) ---
    // We trust 'item.amount' as the absolute Final Total (inclusive of tax)
    let rowTotal = 0;
    if (item.amount !== undefined && item.amount !== null && Number(item.amount) > 0) {
      rowTotal = Number(item.amount);
    } else {
      // Fallback: Calculate from MRP and Disc
      rowTotal = (mrp * qty) - (Number(item.discountAmount) || 0);
    }

    // --- STEP 2: DETERMINE DISPLAY DISCOUNT (VISUAL ONLY) ---
    let displayDiscount = 0;
    // PRIORITY: Use the explicit discount amount if valid
    if (item.discountAmount !== undefined && Number(item.discountAmount) > 0) {
      displayDiscount = Number(item.discountAmount);
    } else {
      // Fallback: Try to calculate difference (MRP*Qty - Total)
      // Note: This might be 0 or negative if Total includes Tax > Discount
      displayDiscount = (mrp * qty) - rowTotal;
    }
    // Safety clamp
    if (displayDiscount < 0) displayDiscount = 0;


    // --- STEP 3: TAX RATE ---
    let effectiveTaxRate = Number(item.gstPercent || item.taxRate || 0);

    if (safeScheme === 'COMPOSITION' || safeScheme === 'NONE') {
      effectiveTaxRate = 0;
    }

    // --- STEP 4: CALCULATION LOGIC ---
    let taxableValue = 0;
    let taxAmt = 0;
    let netAmount = 0;

    if (safeScheme === 'NONE' || safeScheme === 'COMPOSITION') {
      netAmount = rowTotal;
      taxableValue = rowTotal;
      taxAmt = 0;
    }
    else {
      // REGULAR SCHEME
      // Since 'rowTotal' comes from backend ALREADY INCLUDING TAX (per your requirement),
      // we ALWAYS back-calculate tax.
      netAmount = rowTotal;
      taxableValue = netAmount / (1 + (effectiveTaxRate / 100));
      taxAmt = netAmount - taxableValue;
    }

    totalQty += qty;
    totalTaxable += taxableValue;
    totalTaxAmt += taxAmt;
    grossTotal += netAmount;

    if (effectiveTaxRate > 0) {
      const rateKey = effectiveTaxRate.toString();
      if (!taxBreakdown[rateKey]) {
        taxBreakdown[rateKey] = { taxable: 0, cgst: 0, sgst: 0 };
      }
      taxBreakdown[rateKey].taxable += taxableValue;
      taxBreakdown[rateKey].cgst += (taxAmt / 2);
      taxBreakdown[rateKey].sgst += (taxAmt / 2);
    }

    return [
      item.sno,
      item.name,
      item.hsn,
      qty,
      item.unit || 'PCS',
      mrp.toFixed(2),
      displayDiscount.toFixed(2), // Now prioritized to explicit value
      taxableValue.toFixed(2),
      `${(effectiveTaxRate / 2)}%`,
      (taxAmt / 2).toFixed(2),
      `${(effectiveTaxRate / 2)}%`,
      (taxAmt / 2).toFixed(2),
      netAmount.toFixed(2)
    ];
  });

  const finalRoundTotal = Math.round(grossTotal);
  const roundOffAmt = finalRoundTotal - grossTotal;

  autoTable(doc, {
    startY: cursorY,
    head: [['S.N.', 'Description', 'HSN', 'Qty', 'Unit', 'MRP', 'Disc.', 'Subtotal', 'CGST', 'Amt', 'SGST', 'Amt', 'Amount']],
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
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 15 },
      12: { cellWidth: 20, halign: 'right' }
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

  // 1. ROUNDED OFF
  const roundOffH = 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.rect(startX, finalY, contentWidth, roundOffH);
  doc.text('Add : Rounded off (+)', endX - 35, finalY + 4);
  doc.text(roundOffAmt.toFixed(2), endX - 2, finalY + 4, { align: 'right' });
  finalY += roundOffH;

  // 2. GRAND TOTAL
  const grandTotalH = 8;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.rect(startX, finalY, contentWidth, grandTotalH);

  doc.text('Grand Total', pageWidth / 6, finalY + 5.5);
  doc.text(`${totalQty.toFixed(3)} Unit`, pageWidth / 3, finalY + 5.5);
  doc.text('Rs.', endX - 35, finalY + 5.5);

  doc.rect(endX - 30, finalY, 30, grandTotalH);
  doc.text(finalRoundTotal.toFixed(2), endX - 2, finalY + 5.5, { align: 'right' });
  finalY += grandTotalH;

  // 3. TAX TABLE (ALWAYS SHOW)
  const taxHeaders = [['Tax Rate', 'Taxable Amt.', 'CGST', 'SGST', 'Total Tax']];
  const taxBody = Object.keys(taxBreakdown).map(rate => {
    const d = taxBreakdown[rate];
    return [`${rate}%`, d.taxable.toFixed(2), d.cgst.toFixed(2), d.sgst.toFixed(2), (d.cgst + d.sgst).toFixed(2)];
  });

  taxBody.push(['TOTAL', totalTaxable.toFixed(2), (totalTaxAmt / 2).toFixed(2), (totalTaxAmt / 2).toFixed(2), totalTaxAmt.toFixed(2)]);

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

  // 4. AMOUNT IN WORDS
  const wordsH = 8;
  doc.rect(startX, finalY, contentWidth, wordsH);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const amountWords = convertNumberToWords(finalRoundTotal);
  doc.text(`Rs. ${amountWords}`, startX + 2, finalY + 5.5);
  finalY += wordsH;

  // 5. BANK DETAILS
  const bankH = 10;
  doc.rect(startX, finalY, contentWidth, bankH);
  doc.setFont('helvetica', 'bold');
  doc.text('BANK DETAIL :', startX + 2, finalY + 4);
  const bdWidth = doc.getTextWidth('BANK DETAIL :');
  doc.line(startX + 2, finalY + 4.5, startX + 2 + bdWidth, finalY + 4.5);
  doc.setFont('helvetica', 'bold');
  const bankText = `Bank name : ${data.bankDetails?.bankName || ''} , A/C NO. ${data.bankDetails?.accountNumber || ''}`;
  doc.text(bankText, startX + 35, finalY + 4);
  doc.text(`IFSC Code ${data.bankDetails?.ifsc || data.bankDetails?.gstin || ''}`, startX + 35, finalY + 8);
  finalY += bankH;

  // 6. FOOTER
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

  // 7. BRANDING FOOTER
  const brandingHeight = 15;
  const brandingY = pageHeight - brandingHeight;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Powered by SELLAR.IN', pageWidth / 2, brandingY + 5, { align: 'center' });

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