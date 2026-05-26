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
  expenses?: { name: string; amount: number }[];
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
      action,
      withDuplicate
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
    const upiString = `upi://pay?pa=${data.upiId}&pn=${encodeURIComponent(data.companyName)}&cu=INR`;
    try {
      qrBase64 = await QRCode.toDataURL(upiString, { width: 80, margin: 0 });
    } catch (err) {
      console.error("Failed to generate QR code", err);
    }
  }

  // --- NORMALIZATION ---
  const safeScheme = (data.gstScheme && data.gstScheme.trim() !== '') ? data.gstScheme.toUpperCase() : 'NONE';
  const safeTaxType = (data.taxType && data.taxType.trim() !== '') ? data.taxType.toUpperCase() : 'EXCLUSIVE';
  const showGstinDetails = !isEstimate && safeScheme !== 'NONE' && safeTaxType !== 'EXEMPT' && safeTaxType !== 'NONE';
  const showTaxColumns = !isEstimate;

  const drawBox = (y: number, h: number) => {
    doc.rect(startX, y, contentWidth, h);
  };

  const now = new Date();
  const generatedAt = now.toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // --- PRE-CALCULATE LAYOUT HEIGHTS ---
  const addressLines = doc.splitTextToSize(data.companyAddress, contentWidth - 50);
  const extraAddressLines = Math.max(0, addressLines.length - 1);
  const addressOffset = extraAddressLines * 4;
  const headerHeight = 25 + addressOffset;

  const metaHeight = 16;

  const billName = data.billTo.name;
  const billAddr = doc.splitTextToSize(data.billTo.address, contentWidth / 2 - 10);
  const billPhone = `Phone.No.  : ${data.billTo.phone || ''}`;

  const shipName = data.shipTo?.name || '';
  const shipAddr = doc.splitTextToSize(data.shipTo?.address || '', contentWidth / 2 - 10);
  const shipPhone = `Phone.No.  : ${data.shipTo?.phone || ''}`;

  const lineHeight = 5;
  const padding = 10;
  const partyHeight = (Math.max(5 + billAddr.length, 4 + shipAddr.length) * lineHeight) + padding;

  // --- PRE-CALCULATE MATH ONCE ---
  let totalQty = 0, totalTaxable = 0, totalTaxAmt = 0, grossTotal = 0;
  const hasZeroMrp = data.items.some(item => !item.listPrice || item.listPrice === 0);
  const priceHeader = hasZeroMrp ? 'Sale Price' : 'MRP';
  const taxBreakdown: Record<string, { taxable: number, cgst: number, sgst: number }> = {};

  const tableBody = data.items.map(item => {
    const qty = Number(item.quantity) || 0;
    let mrp = Number((item as any).mrp || item.listPrice || 0);
    let taxAmt = Number((item as any).taxAmount || item.gstAmount || 0);
    let taxableAmt = Number((item as any).taxableAmount || (item as any).subtotal || 0);
    let finalAmount = Number((item as any).finalPrice || item.amount || (item as any).total || 0);

    // --- CRITICAL FIX: Ensure Row Amount includes Tax for perfect math! ---
    if (taxableAmt > 0 || taxAmt > 0) {
      finalAmount = taxableAmt + taxAmt;
    } else if (!taxableAmt && finalAmount > 0) {
      taxableAmt = finalAmount - taxAmt;
    }

    let discountAmt = Number(item.discountAmount || (item as any).manualDiscount || (item as any).discount || 0);
    if (discountAmt === 0 && mrp > 0 && taxableAmt > 0) {
      discountAmt = (mrp * qty) - taxableAmt;
    }

    if (discountAmt < 0) {
      discountAmt = 0;
      mrp = qty > 0 ? (taxableAmt / qty) : taxableAmt;
    }

    let taxRate = Number(item.taxRate || item.gstPercent || (item as any).tax || 0);

    // Zero out tax for Estimates/Exempt
    if (isEstimate || safeScheme === 'NONE' || safeTaxType === 'EXEMPT' || safeTaxType === 'NONE') {
      taxRate = 0;
      taxAmt = 0;
      finalAmount = taxableAmt;
    }

    totalQty += qty;
    totalTaxable += taxableAmt;
    totalTaxAmt += taxAmt;
    grossTotal += finalAmount; // Gross total now correctly includes tax!

    if (taxRate > 0) {
      const rateKey = taxRate.toString();
      if (!taxBreakdown[rateKey]) {
        taxBreakdown[rateKey] = { taxable: 0, cgst: 0, sgst: 0 };
      }
      taxBreakdown[rateKey].taxable += taxableAmt;
      taxBreakdown[rateKey].cgst += (taxAmt / 2);
      taxBreakdown[rateKey].sgst += (taxAmt / 2);
    }

    return showTaxColumns ? [
      item.sno, item.name, item.hsn || (item as any).hsnSac || '', qty, item.unit || 'PCS',
      mrp.toFixed(2), discountAmt.toFixed(2), taxableAmt.toFixed(2),
      `${(taxRate / 2)}%`, (taxAmt / 2).toFixed(2), `${(taxRate / 2)}%`, (taxAmt / 2).toFixed(2), finalAmount.toFixed(2)
    ] : [
      item.sno, item.name, item.hsn || (item as any).hsnSac || '', qty, item.unit || 'PCS',
      mrp.toFixed(2), discountAmt.toFixed(2), finalAmount.toFixed(2)
    ];
  });

  const billDiscount = Number(data.billDiscount) || 0;
  const advance = Number(data.advance) || 0;

  // Safely sum up all extra expenses
  let totalExtraExpenses = Number(data.extraExpenseAmount) || 0;
  if (data.expenses && data.expenses.length > 0) {
    totalExtraExpenses = data.expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }

  // --- STRICT MATH FIX ---
  const pureCalculated = grossTotal - billDiscount + totalExtraExpenses;
  const invoiceTotal = Number(data.finalAmount || (data as any).grandTotal || 0) || Math.round(pureCalculated);
  const roundOffAmt = invoiceTotal - pureCalculated;
  const settledAmount = invoiceTotal - advance;

  const prevBal = Number(data.previousBalance) || 0;
  const currentDue = Number(data.due) || 0;
  const totalDue = prevBal + currentDue;
  const hasPrevOrDue = prevBal > 0 || currentDue > 0;
  const wordsH = hasPrevOrDue ? 12 : 8;
  const leftColW = contentWidth - (hasPrevOrDue ? 70 : 0);

  // ==========================================
  // --- REUSABLE PAGE RENDERER ---
  // ==========================================
  const renderPage = (isDuplicate: boolean) => {
    if (isDuplicate) doc.addPage();
    let cursorY = margin;

    // --- ONLY DIFFERENCE: THE "DUPLICATE" STAMP ---
    if (isDuplicate) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(150, 150, 150);
      doc.text("DUPLICATE", pageWidth / 2, cursorY - 2, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }

    // 1. Timestamp & Header
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Bill generated on ${generatedAt}`, pageWidth - margin, cursorY - 2, { align: "right" });

    drawBox(cursorY, headerHeight);
    if (qrBase64 && !isEstimate) {
      doc.addImage(qrBase64, 'PNG', startX + 2, cursorY + 2, 18, 18);
      doc.setFontSize(6); doc.text('Scan to Pay', startX + 11, cursorY + 22, { align: 'center' });
    }

    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    const title = isEstimate ? 'ESTIMATE' : (safeScheme === 'COMPOSITION' || safeScheme === 'NONE') ? 'BILL OF SUPPLY' : 'TAX INVOICE';
    doc.text(title, pageWidth / 2, cursorY + 5, { align: 'center' });

    doc.setFontSize(8);
    if (!isEstimate) doc.text(`Msme No ${data.msmeNumber || ''}`, endX - 2, cursorY + 5, { align: 'right' });

    if (data.companyLogoBase64) {
      try { doc.addImage(data.companyLogoBase64, 'PNG', endX - 20, cursorY + 7, 18, 14); } catch (e) { }
    }

    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(data.companyName.toUpperCase(), pageWidth / 2, cursorY + 11, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    if (!isEstimate) doc.text(addressLines, pageWidth / 2, cursorY + 16, { align: 'center' });
    if (!isEstimate) doc.text(`Phone : ${data.companyContact}`, pageWidth / 2, cursorY + 20, { align: 'center' });

    if (showGstinDetails) {
      doc.setFont('helvetica', 'bold');
      doc.text(`GSTIN : ${data.companyGstin || ''}  (${safeScheme})`, pageWidth / 2, cursorY + 24 + addressOffset, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    }
    cursorY += headerHeight;

    // 2. Meta Info
    drawBox(cursorY, metaHeight); doc.line(pageWidth / 2, cursorY, pageWidth / 2, cursorY + metaHeight);
    doc.setFontSize(9);
    doc.text(`Invoice No. :  ${data.invoice.number}`, startX + 2, cursorY + 5);
    doc.text(`Date          :  ${data.invoice.date}`, startX + 2, cursorY + 10);
    doc.text(`Place of Supply : ${data.billTo.address.split(',').pop()?.trim() || ''}`, (pageWidth / 2) + 2, cursorY + 5);
    if (showGstinDetails) {
      doc.setFont('helvetica', 'bold');
      doc.text(`GST Type: ${safeScheme}${safeScheme === 'REGULAR' ? ` (${safeTaxType})` : ''}`, (pageWidth / 2) + 2, cursorY + 10);
      doc.setFont('helvetica', 'normal');
    }
    cursorY += metaHeight;

    // 3. Parties
    drawBox(cursorY, partyHeight); doc.line(pageWidth / 2, cursorY, pageWidth / 2, cursorY + partyHeight);
    const headerY = cursorY + 5;
    doc.setFont('helvetica', 'bold');
    doc.text(isEstimate ? 'Estimate For :' : 'Billed to :', startX + 2, headerY);
    if (!isEstimate) doc.text('Shipped to :', (pageWidth / 2) + 2, headerY);
    doc.setFont('helvetica', 'normal');

    let leftY = headerY + 6;
    doc.text(isEstimate ? shipName : billName, startX + 2, leftY); leftY += lineHeight;
    const leftAddr = isEstimate ? shipAddr : billAddr; doc.text(leftAddr, startX + 2, leftY); leftY += (leftAddr.length * lineHeight);
    doc.text(isEstimate ? shipPhone : billPhone, startX + 2, leftY); leftY += lineHeight;
    if (!isEstimate && showGstinDetails && data.billTo.gstin) doc.text(`GST No. : ${data.billTo.gstin}`, startX + 2, leftY);

    if (!isEstimate) {
      let rightY = headerY + 6;
      doc.text(shipName, (pageWidth / 2) + 2, rightY); rightY += lineHeight;
      doc.text(shipAddr, (pageWidth / 2) + 2, rightY); rightY += (shipAddr.length * lineHeight);
      doc.text(shipPhone, (pageWidth / 2) + 2, rightY); rightY += lineHeight;
      if (showGstinDetails && data.shipTo?.gstin) doc.text(`GST No. : ${data.shipTo.gstin}`, (pageWidth / 2) + 2, rightY);
    }
    cursorY += partyHeight;

    // 4. AutoTable
    autoTable(doc, {
      startY: cursorY,
      head: [showTaxColumns
        ? ['S.N.', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Subtotal', 'CGST', 'CGST Amt', 'SGST', 'SGST Amt', 'Amount']
        : ['S.N.', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Amount']
      ],
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 1, textColor, lineColor, lineWidth: 0.1, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: [255, 255, 255], textColor, fontStyle: 'bold', lineWidth: 0.1, lineColor },
      columnStyles: showTaxColumns ? { 0: { cellWidth: 8 }, 1: { cellWidth: 'auto', halign: 'left' }, 2: { cellWidth: 15 }, 12: { cellWidth: 20, halign: 'right' } }
        : { 0: { cellWidth: 8 }, 1: { cellWidth: 'auto', halign: 'left' }, 2: { cellWidth: 15 }, 7: { cellWidth: 20, halign: 'right' } },
      margin: { left: margin, right: margin },
    });
    // @ts-ignore
    let finalY = doc.lastAutoTable.finalY;

    // 5. Bottom Section (Totals)
    if (finalY > pageHeight - 80) { doc.addPage(); finalY = margin; }
    const vBoxX = endX - 25;

    const addRow = (label: string, amt: number, h: number) => {
      doc.rect(startX, finalY, contentWidth, h); doc.line(vBoxX, finalY, vBoxX, finalY + h);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      doc.text(label, vBoxX - 2, finalY + 4, { align: 'right' });
      doc.text(amt.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4, { align: 'right' });
      finalY += h;
    };

    if (billDiscount > 0) addRow('Less : Bill Discount (-)', billDiscount, 6);

    if (data.expenses && data.expenses.length > 0) {
      doc.rect(startX, finalY, contentWidth, 6 * data.expenses.length); doc.line(vBoxX, finalY, vBoxX, finalY + (6 * data.expenses.length));
      data.expenses.forEach(exp => {
        doc.text(`Add : ${exp.name} (+)`, vBoxX - 2, finalY + 4, { align: 'right' });
        doc.text(exp.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4, { align: 'right' });
        finalY += 6;
      });
    } else if (data.extraExpenseName && data.extraExpenseAmount) {
      const names = data.extraExpenseName.split(',').map(n => n.trim()).filter(Boolean);
      doc.rect(startX, finalY, contentWidth, 6 * names.length); doc.line(vBoxX, finalY, vBoxX, finalY + (6 * names.length));
      names.forEach((name, idx) => {
        doc.text(`Add : ${name} (+)`, vBoxX - 2, finalY + 4, { align: 'right' });
        if (idx === names.length - 1) doc.text(data.extraExpenseAmount!.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4, { align: 'right' });
        finalY += 6;
      });
    }

    addRow('Add : Rounded off (+)', roundOffAmt, 6);

    // --- GRAND TOTAL (True Invoice Total) ---
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.rect(startX, finalY, contentWidth, 8);
    doc.text('Grand Total', pageWidth / 6, finalY + 5.5);
    doc.text(`${totalQty.toFixed(3)} Unit`, pageWidth / 3, finalY + 5.5);
    doc.text('Rs.', endX - 35, finalY + 5.5);
    doc.rect(endX - 30, finalY, 30, 8);
    doc.text(invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 5.5, { align: 'right' });
    finalY += 8;

    // --- ADVANCE & SETTLED AMOUNT ---
    if (advance > 0) {
      addRow('Advance Paid (-)', advance, 6);

      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.rect(startX, finalY, contentWidth, 8);
      doc.text('Balance Due', vBoxX - 2, finalY + 5.5, { align: 'right' });
      doc.rect(endX - 30, finalY, 30, 8);
      doc.text(settledAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 5.5, { align: 'right' });
      finalY += 8;
    }
    if (data.narration && data.narration.trim() !== '') {
      const nLines = doc.splitTextToSize(data.narration, contentWidth - 18);
      const nH = (nLines.length * 4) + 4;
      if (finalY + nH > pageHeight - margin) { doc.addPage(); finalY = margin; }
      doc.rect(startX, finalY, contentWidth, nH);
      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('Remarks:', startX + 2, finalY + 4);
      doc.setFont('helvetica', 'normal'); doc.text(nLines, startX + 16, finalY + 4);
      finalY += nH;
    }

    if (showTaxColumns) {
      const taxHeaders = [['Tax Rate', 'Taxable Amt.', 'CGST', 'SGST', 'Total Tax']];
      const taxBody = Object.keys(taxBreakdown).map(rate => {
        const d = taxBreakdown[rate];
        const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
        return [`${rate}%`, fmt(d.taxable), fmt(d.cgst), fmt(d.sgst), fmt(d.cgst + d.sgst)];
      });
      const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
      taxBody.push(['TOTAL', fmt(totalTaxable), fmt(totalTaxAmt / 2), fmt(totalTaxAmt / 2), fmt(totalTaxAmt)]);
      autoTable(doc, {
        startY: finalY + 2, head: taxHeaders, body: taxBody, theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1, textColor, lineColor, lineWidth: 0.1, halign: 'right' },
        headStyles: { fillColor: [255, 255, 255], textColor, fontStyle: 'bold', halign: 'right', lineColor, lineWidth: 0.1 },
        columnStyles: { 0: { halign: 'left' } }, tableWidth: contentWidth / 2, margin: { left: startX },
      });
      // @ts-ignore
      finalY = Math.max(doc.lastAutoTable.finalY + 2, finalY + 25);
    }

    // Amount in Words & Due
    // Fix: Convert the actual invoice total to words
    doc.rect(startX, finalY, contentWidth, wordsH);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${convertNumberToWords(invoiceTotal)}`, startX + 2, finalY + (hasPrevOrDue ? 7 : 5.5));
    if (hasPrevOrDue) {
      const divX = startX + leftColW;
      doc.line(divX, finalY, divX, finalY + wordsH); doc.line(divX, finalY + 6, endX, finalY + 6);
      doc.setFont('helvetica', 'normal'); doc.text('Previous Balance :', divX + 2, finalY + 4.5);
      doc.text(prevBal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4.5, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.text('Balance Due :', divX + 2, finalY + 10);
      doc.text(totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 10, { align: 'right' });
    }
    finalY += wordsH;

    if (!isEstimate && safeScheme !== 'NONE') {
      doc.rect(startX, finalY, contentWidth, 10);
      doc.setFont('helvetica', 'bold'); doc.text('BANK DETAIL :', startX + 2, finalY + 4);
      doc.line(startX + 2, finalY + 4.5, startX + 2 + doc.getTextWidth('BANK DETAIL :'), finalY + 4.5);
      doc.text(`Bank name : ${data.bankDetails?.bankName || ''} , A/C NO. ${data.bankDetails?.accountNumber || ''}`, startX + 35, finalY + 4);
      doc.text(`IFSC Code ${data.bankDetails?.ifsc || data.bankDetails?.ifscCode || ''}`, startX + 35, finalY + 8);
      finalY += 10;
    }

    if (!isEstimate) {
      if (finalY + 35 > pageHeight - margin) { doc.addPage(); finalY = margin; }
      const [tW, rW, aW] = [contentWidth * 0.50, contentWidth * 0.25, contentWidth * 0.25];
      doc.rect(startX, finalY, tW, 35); doc.rect(startX + tW, finalY, rW, 35); doc.rect(startX + tW + rW, finalY, aW, 35);

      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('Terms & Condition', startX + 2, finalY + 4);
      doc.line(startX + 2, finalY + 5, startX + 2 + doc.getTextWidth('Terms & Condition'), finalY + 5);
      doc.setFont('helvetica', 'normal'); doc.text('E. & O. E.', startX + 2, finalY + 8);
      doc.text(doc.splitTextToSize(data.terms, tW - 5), startX + 2, finalY + 12);

      doc.setFont('helvetica', 'bold'); doc.text("Receiver's Signature :", startX + tW + 2, finalY + 4);
      doc.setFontSize(7); doc.text(`for ${data.companyName}`, startX + tW + rW + (aW / 2), finalY + 4, { align: 'center' });
      if (data.signatureBase64) {
        try { doc.addImage(data.signatureBase64, 'PNG', startX + tW + rW + (aW / 2) - 17.5, finalY + 8, 35, 15); } catch (e) { }
      }
      doc.setFontSize(8); doc.text("Authorised Signatory", startX + tW + rW + (aW / 2), finalY + 33, { align: 'center' });
    }

    // Branding
    const by = pageHeight - 15;
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    const [pb, lk] = ['Powered by ', 'SELLAR.IN'];
    let bx = (pageWidth / 2) - ((doc.getTextWidth(pb) + doc.getTextWidth(lk)) / 2);
    doc.text(pb, bx, by + 5); bx += doc.getTextWidth(pb);
    doc.setTextColor(0, 102, 204); doc.text(lk, bx, by + 5);
    doc.setDrawColor(0, 102, 204); doc.line(bx, by + 5.5, bx + doc.getTextWidth(lk), by + 5.5);
    doc.link(bx, by + 2, doc.getTextWidth(lk), 4, { url: 'https://www.sellar.in' });
    doc.setTextColor(0); doc.setDrawColor(0);

    doc.setFont('helvetica', 'normal');
    let mx = (pageWidth / 2) - ((doc.getTextWidth("Made with ") + doc.getTextWidth("Love") + doc.getTextWidth(" in India")) / 2);
    doc.text("Made with ", mx, by + 10); mx += doc.getTextWidth("Made with ");
    doc.setTextColor(255, 0, 0); doc.text("Love", mx, by + 10); mx += doc.getTextWidth("Love");
    doc.setTextColor(0, 0, 139); doc.text(" in India", mx, by + 10); doc.setTextColor(0);
  };

  // --- TRIGGER PAGE GENERATION ---
  renderPage(false);

  if (withDuplicate && !isEstimate) {
    renderPage(true);
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
    expenses: invoiceData.expenses || [],

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