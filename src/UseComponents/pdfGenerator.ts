import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ACTION } from '../enums';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import QRCode from 'qrcode';
import { generateThermalReceipt } from './ThermalpdfGenerator';
import { generateA5Invoice } from './A5PdfGenerator';
import { drawWatermark } from '../Components/pdfWatermark';

export interface InvoiceData {
  printFormat?: 'A4' | 'THERMAL58' | 'A5';
  enableTriplicate?: boolean;
  enableItemImages?: boolean;
  gstScheme?: string;
  taxType?: string;
  companyGstType?: string;
  companyName: string;
  companyAddress: string;
  companyContact: string;
  companyEmail?: string;
  companyGstin?: string;
  companyState?: string;
  placeOfSupply?: string;
  companyLogoBase64?: string;
  msmeNumber?: string;
  signatureBase64?: string;
  billDiscount?: number;
  discountDisplayFormat?: 'amount' | 'percentage';
  enableDiscount2?: boolean;
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
    discount1Amount?: number;   // NEW
    discount2Amount?: number;
    discount1Percent?: number;  // NEW
    discount2Percent?: number;  // NEW
    amount?: number;
    gstAmount?: number;
    imageBase64?: string;
  }[];
  terms: string;
  transportDetails?: {
    transportName?: string;
    grRrNo?: string;
    grRrDate?: string;
    vehicleNo?: string;
    stationFrom?: string;
    pinCode?: string;
  };
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
if (data.printFormat !== 'A4') {
    data.items = data.items.map(item => {
      const { imageBase64, ...rest } = item as any;
      return rest;
    });
  }
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

  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
    compress: true
  });
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
      qrBase64 = await QRCode.toDataURL(upiString, { width: 80, margin: 0, errorCorrectionLevel: 'L' });
    } catch (err) {
      console.error("Failed to generate QR code", err);
    }
  }

  const safeScheme = (data.gstScheme && data.gstScheme.trim() !== '') ? data.gstScheme.toUpperCase() : 'NONE';
  const safeTaxType = (data.taxType && data.taxType.trim() !== '') ? data.taxType.toLowerCase() : 'EXCLUSIVE';

  // NEW: exempt (NONE scheme / exempt taxType) bills lose GST columns just like an estimate,
  // but heading/bank/terms/signature stay normal (SCRUM-1266).
  const isTaxExempt = safeScheme === 'NONE' || safeTaxType === 'EXEMPT' || safeTaxType === 'NONE';
  const showGstinDetails = !isEstimate && !isTaxExempt;
  const showTaxColumns = !isEstimate && !isTaxExempt;
  // NEW: POS-Photos toggle
  const showImages = data.enableItemImages === true;
  // NEW: Determine IGST based on Place of Supply vs Company State
  const safeCompanyState = (data.companyState || '').trim().toLowerCase();
  const safePos = (data.placeOfSupply || '').trim().toLowerCase();

  // If we have both strings and they don't match, it's an inter-state (IGST) bill
  const isIgst = Boolean(safeCompanyState && safePos && safeCompanyState !== safePos);

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
  const addressBlockHeight = addressLines.length * 4; // Dynamic height based on address lines

  const headerHeight = 25 + addressBlockHeight; // Expanded box height
  const hasBilledBy = !!(data.invoice.billedBy && data.invoice.billedBy.trim() !== '');
  const metaHeight = hasBilledBy ? 21 : 16; // extra room for "Billed by" line
  const td = data.transportDetails ?? undefined;
  const hasTransport = !!(
    td &&
    typeof td === 'object' &&
    (td.transportName || td.grRrNo || td.vehicleNo || td.stationFrom || td.grRrDate || td.pinCode)
  );
  const transportRowHeight = hasTransport ? 10 : 0;

  const billName = data.billTo.name;
  const billAddr = doc.splitTextToSize(data.billTo.address, contentWidth / 2 - 10);
  const billPhone = `Phone.No.  : ${data.billTo.phone || ''}`;

  const shipName = data.shipTo?.name || '';
  const shipAddr = doc.splitTextToSize(data.shipTo?.address || '', contentWidth / 2 - 10);
  const shipPhone = `Phone.No.  : ${data.shipTo?.phone || ''}`;

  const lineHeight = 5;
  const padding = 10;
  const partyHeight = (Math.max(5 + billAddr.length, 4 + shipAddr.length) * lineHeight) + padding;

  let totalQty = 0, totalTaxable = 0, totalTaxAmt = 0, grossTotal = 0;
  const hasZeroMrp = data.items.some(item => !item.listPrice || item.listPrice === 0);
  const priceHeader = hasZeroMrp ? 'Sale Price' : 'MRP';

  const taxBreakdown: Record<string, { taxable: number, cgst: number, sgst: number, igst: number }> = {};

  // 1. Calculate proportional scales for Bill Discount
  const totalBillDiscount = Number(data.billDiscount) || 0;
  const sumPostDiscountAmounts = data.items.reduce((sum, item) => {
    let tAmt = Number((item as any).taxableAmount || (item as any).subtotal || 0);
    let txAmt = Number((item as any).taxAmount || (item as any).gstAmount || 0);
    let fAmt = Number((item as any).finalPrice || item.amount || (item as any).total || 0);
    return sum + (tAmt > 0 || txAmt > 0 ? tAmt + txAmt : fAmt);
  }, 0);

  const tableBody = data.items.map(item => {
    const qty = Number(item.quantity) || 0;
    let mrp = Number((item as any).mrp || item.listPrice || (item as any).salesPrice || (item as any).rate || 0);

    let taxAmt = Number((item as any).taxAmount || item.gstAmount || 0);
    let taxableAmt = Number((item as any).taxableAmount || (item as any).subtotal || 0);
    let finalAmount = Number((item as any).finalPrice || item.amount || (item as any).total || 0);

    if (taxableAmt > 0 || taxAmt > 0) {
      finalAmount = taxableAmt + taxAmt;
    } else if (!taxableAmt && finalAmount > 0) {
      taxableAmt = finalAmount - taxAmt;
    }

    if (mrp === 0 && qty > 0 && taxableAmt > 0) {
      mrp = taxableAmt / qty;
    }

    // FIX: PRICE MARKUP BUG
    const effectiveUnitRate = qty > 0 ? (taxableAmt / qty) : 0;
    if (effectiveUnitRate > mrp) {
      mrp = effectiveUnitRate;
    }

    // --- FIX: DISCOUNT 1 + DISCOUNT 2 dono ko ₹ amount mein dikhana ---
    let disc1Amt = Number((item as any).discount1Amount || 0);
    let disc2Amt = Number((item as any).discount2Amount || 0);
    if (disc1Amt < 0) disc1Amt = 0;
    if (disc2Amt < 0) disc2Amt = 0;
    const fmtPct = (n: number) => {
      const v = Number(n) || 0;
      return v % 1 === 0 ? v.toFixed(0) : v.toFixed(1);
    };

    const showDiscount2 = data.enableDiscount2 === true;

    const itemDiscDisplay = showDiscount2
      ? (data.discountDisplayFormat === 'percentage'
        ? `${fmtPct((item as any).discount1Percent)}% + ${fmtPct((item as any).discount2Percent)}%`
        : `${disc1Amt.toFixed(2)} + ${disc2Amt.toFixed(2)}`)
      : (data.discountDisplayFormat === 'percentage'
        ? `${fmtPct((item as any).discount1Percent)}%`
        : `${disc1Amt.toFixed(2)}`);

    // 2. Pro-rate the global bill discount across rows
    let billDisc = sumPostDiscountAmounts > 0 ? (finalAmount / sumPostDiscountAmounts) * totalBillDiscount : 0;
    if (billDisc < 0) billDisc = 0;

    let taxRate = Number(item.taxRate || item.gstPercent || (item as any).tax || 0);

    if (isEstimate || safeScheme === 'NONE' || safeTaxType === 'EXEMPT' || safeTaxType === 'NONE') {
      taxRate = 0;

      // Preserve the full value for Inclusive items, strip tax for Exclusive
      const itemTaxType = ((item as any).taxType || safeTaxType).toUpperCase();
      if (itemTaxType === 'INCLUSIVE') {
        finalAmount = taxableAmt + taxAmt;
      } else {
        finalAmount = taxableAmt;
      }

      taxAmt = 0;
    }

    totalQty += qty;
    totalTaxable += taxableAmt;
    totalTaxAmt += taxAmt;
    grossTotal += finalAmount;

    if (taxRate > 0) {
      const rateKey = taxRate.toString();
      if (!taxBreakdown[rateKey]) {
        taxBreakdown[rateKey] = { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      }
      taxBreakdown[rateKey].taxable += taxableAmt;
      if (isIgst) {
        taxBreakdown[rateKey].igst += taxAmt;
      } else {
        taxBreakdown[rateKey].cgst += (taxAmt / 2);
        taxBreakdown[rateKey].sgst += (taxAmt / 2);
      }
    }

    // Unified Columns
    if (!showTaxColumns) {
      const row: any[] = [
        item.sno, item.name, item.hsn || (item as any).hsnSac || '', qty, item.unit || 'PCS',
        mrp.toFixed(2), itemDiscDisplay, billDisc.toFixed(2), finalAmount.toFixed(2)
      ];
      if (showImages) row.splice(1, 0, ''); // NEW: blank cell — actual photo didDrawCell se draw hogi
      return row;
    }

    const row: any[] = [
      item.sno, item.name, item.hsn || (item as any).hsnSac || '', qty, item.unit || 'PCS',
      mrp.toFixed(2), itemDiscDisplay, billDisc.toFixed(2), taxableAmt.toFixed(2),
      `${taxRate}%`, taxAmt.toFixed(2), finalAmount.toFixed(2)
    ];
    if (showImages) row.splice(1, 0, ''); // NEW
    return row;
  });

  const advance = Number(data.advance) || 0;

  let totalExtraExpenses = Number(data.extraExpenseAmount) || 0;
  if (data.expenses && data.expenses.length > 0) {
    totalExtraExpenses = data.expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }

  // --- STRICT MATH FIX ---
  // We DO NOT subtract billDiscount here because the items table already factors it in!
  const pureCalculated = grossTotal + totalExtraExpenses;
  let invoiceTotal = Number(data.finalAmount || (data as any).grandTotal || 0);

  const isExemptOrEstimate = isEstimate || safeScheme === 'NONE' || safeTaxType === 'EXEMPT' || safeTaxType === 'NONE';
  if (isExemptOrEstimate || !invoiceTotal) {
    invoiceTotal = Math.round(pureCalculated);
  }

  const roundOffAmt = invoiceTotal - pureCalculated;

  // Lock the settled amount to a minimum of 0
  const settledAmount = data.due !== undefined ? Number(data.due) : Math.max(0, invoiceTotal - advance);

  const prevBal = Number(data.previousBalance) || 0;

  // Calculate currentDue based on the PDF's internal invoiceTotal minus payments.
  const currentDue = settledAmount;

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

    drawWatermark(doc, pageWidth, pageHeight);

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
      doc.addImage(qrBase64, 'JPEG', startX + 2, cursorY + 2, 18, 18, undefined, 'FAST');
      doc.setFontSize(6); doc.text('Scan to Pay', startX + 11, cursorY + 22, { align: 'center' });
    }

    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    const title = isEstimate ? 'ESTIMATE' : (safeScheme === 'COMPOSITION' || safeScheme === 'NONE') ? 'BILL OF SUPPLY' : 'TAX INVOICE';
    doc.text(title, pageWidth / 2, cursorY + 5, { align: 'center' });

    doc.setFontSize(8);
    if (!isEstimate) doc.text(`Msme No : ${data.msmeNumber || ''}`, endX - 2, cursorY + 5, { align: 'right' });

    if (data.companyLogoBase64) {
      try { doc.addImage(data.companyLogoBase64, 'JPEG', endX - 20, cursorY + 7, 18, 14, undefined, 'FAST'); } catch (e) { }
    }

    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(data.companyName.toUpperCase(), pageWidth / 2, cursorY + 11, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');

    if (!isEstimate) {
      doc.text(addressLines, pageWidth / 2, cursorY + 16, { align: 'center' });
      // Push phone number below the address dynamically
      doc.text(`Phone : ${data.companyContact}`, pageWidth / 2, cursorY + 16 + addressBlockHeight, { align: 'center' });
    }

    if (showGstinDetails) {
      doc.setFont('helvetica', 'bold');
      // Push GSTIN below the phone number
      doc.text(`GSTIN : ${data.companyGstin || ''}  (${safeScheme})`, pageWidth / 2, cursorY + 22 + addressBlockHeight, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    }
    cursorY += headerHeight;

    // 2. Meta Info
    drawBox(cursorY, metaHeight); doc.line(pageWidth / 2, cursorY, pageWidth / 2, cursorY + metaHeight);
    doc.setFontSize(9);
    doc.text(`Invoice No. :  ${data.invoice.number}`, startX + 2, cursorY + 5);
    doc.text(`Date          :  ${data.invoice.date}`, startX + 2, cursorY + 10);
    if (hasBilledBy) {
      doc.text(`Billed by    :  ${data.invoice.billedBy}`, startX + 2, cursorY + 15);
    }

    // UPDATED: Use the specific placeOfSupply string
    const displayPos = data.placeOfSupply || data.billTo.address.split(',').pop()?.trim() || '';
    doc.text(`Place of Supply : ${displayPos}`, (pageWidth / 2) + 2, cursorY + 5);
    if (showGstinDetails) {
      doc.setFont('helvetica', 'bold');
      doc.text(`GST Type: ${safeScheme}${safeScheme === 'REGULAR' ? ` (tax ${safeTaxType})` : ''}`, (pageWidth / 2) + 2, cursorY + 10);
      doc.setFont('helvetica', 'normal');
    }
    cursorY += metaHeight;

    // 3a. Transport Details Row (optional)
    if (hasTransport && td) {
      drawBox(cursorY, transportRowHeight);

      // Dividers — split into 3 equal columns
      const colW = contentWidth / 3;

      doc.setFontSize(7); doc.setFont('helvetica', 'bold');

      // Column 1: Transport Name + GR/RR No
      doc.text('Transport :', startX + 2, cursorY + 3.5);
      doc.setFont('helvetica', 'normal');
      doc.text(td.transportName || '-', startX + 22, cursorY + 3.5);
      doc.setFont('helvetica', 'bold');
      doc.text('GR/RR No :', startX + 2, cursorY + 8);
      doc.setFont('helvetica', 'normal');
      doc.text(td.grRrNo || '-', startX + 22, cursorY + 8);

      // Column 2: GR/RR Date + Vehicle No
      const col2X = startX + colW + 2;
      doc.setFont('helvetica', 'bold');
      doc.text('GR/RR Date :', col2X, cursorY + 3.5);
      doc.setFont('helvetica', 'normal');
      doc.text(td.grRrDate || '-', col2X + 24, cursorY + 3.5);
      doc.setFont('helvetica', 'bold');
      doc.text('Vehicle No :', col2X, cursorY + 8);
      doc.setFont('helvetica', 'normal');
      doc.text(td.vehicleNo || '-', col2X + 24, cursorY + 8);

      // Column 3: Station From + PIN Code
      const col3X = startX + colW * 2 + 2;
      doc.setFont('helvetica', 'bold');
      doc.text('Station From :', col3X, cursorY + 3.5);
      doc.setFont('helvetica', 'normal');
      doc.text(td.stationFrom || '-', col3X + 27, cursorY + 3.5);
      doc.setFont('helvetica', 'bold');
      doc.text('PIN Code :', col3X, cursorY + 8);
      doc.setFont('helvetica', 'normal');
      doc.text(td.pinCode || '-', col3X + 27, cursorY + 8);

      cursorY += transportRowHeight;
    }

    // 3. Parties
    drawBox(cursorY, partyHeight); doc.line(pageWidth / 2, cursorY, pageWidth / 2, cursorY + partyHeight);
    const headerY = cursorY + 5;
    doc.setFont('helvetica', 'bold');
    doc.text(isEstimate ? 'Estimate For :' : 'Billed to :', startX + 2, headerY);
    if (!isEstimate) doc.text('Shipped to :', (pageWidth / 2) + 2, headerY);
    doc.setFont('helvetica', 'normal');

    let leftY = headerY + 6;

    // FIX: Prioritize primary billing details for Estimates so it doesn't print blank
    const printName = isEstimate ? (billName || shipName) : billName;
    const printAddr = isEstimate ? (data.billTo.address ? billAddr : shipAddr) : billAddr;
    const printPhone = isEstimate ? (data.billTo.phone ? billPhone : shipPhone) : billPhone;

    doc.text(printName, startX + 2, leftY); leftY += lineHeight;
    doc.text(printAddr, startX + 2, leftY); leftY += (printAddr.length * lineHeight);
    doc.text(printPhone, startX + 2, leftY); leftY += lineHeight;

    if (!isEstimate && showGstinDetails && data.billTo.gstin) {
      doc.text(`GST No. : ${data.billTo.gstin}`, startX + 2, leftY);
    }

    if (!isEstimate) {
      let rightY = headerY + 6;
      doc.text(shipName, (pageWidth / 2) + 2, rightY); rightY += lineHeight;
      doc.text(shipAddr, (pageWidth / 2) + 2, rightY); rightY += (shipAddr.length * lineHeight);
      doc.text(shipPhone, (pageWidth / 2) + 2, rightY); rightY += lineHeight;
      if (showGstinDetails && data.shipTo?.gstin) doc.text(`GST No. : ${data.shipTo.gstin}`, (pageWidth / 2) + 2, rightY);
    }
    cursorY += partyHeight;

    const fullTaxHeaders = showImages
      ? (isIgst
        ? ['S.N.', 'Image', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Bill Disc.', 'Subtotal', 'IGST', 'IGST Amt', 'Amount']
        : ['S.N.', 'Image', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Bill Disc.', 'Subtotal', 'GST', 'GST Amt', 'Amount'])
      : (isIgst
        ? ['S.N.', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Bill Disc.', 'Subtotal', 'IGST', 'IGST Amt', 'Amount']
        : ['S.N.', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Bill Disc.', 'Subtotal', 'GST', 'GST Amt', 'Amount']);

    const noTaxHeaders = showImages
      ? ['S.N.', 'Image', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Bill Disc.', 'Amount']
      : ['S.N.', 'Items', 'HSN', 'Qty', 'Unit', priceHeader, 'Discount', 'Bill Disc.', 'Amount'];

    // NEW: image column ke wajah se baaki columns ka index +1 shift hota hai
    const activeColumnStyles = showImages
      ? (showTaxColumns
        ? { 0: { cellWidth: 8 }, 1: { cellWidth: 15 }, 2: { cellWidth: 'auto', halign: 'left' }, 3: { cellWidth: 12 }, 12: { cellWidth: 18, halign: 'right' } }
        : { 0: { cellWidth: 8 }, 1: { cellWidth: 15 }, 2: { cellWidth: 'auto', halign: 'left' }, 3: { cellWidth: 15 }, 9: { cellWidth: 20, halign: 'right' } })
      : (showTaxColumns
        ? { 0: { cellWidth: 8 }, 1: { cellWidth: 'auto', halign: 'left' }, 2: { cellWidth: 12 }, 11: { cellWidth: 18, halign: 'right' } }
        : { 0: { cellWidth: 8 }, 1: { cellWidth: 'auto', halign: 'left' }, 2: { cellWidth: 15 }, 8: { cellWidth: 20, halign: 'right' } });

    autoTable(doc, {
      startY: cursorY,
      head: [showTaxColumns ? fullTaxHeaders : noTaxHeaders],
      body: tableBody,
      theme: 'grid',
      styles: {
        fontSize: 8, cellPadding: 1, textColor, lineColor, lineWidth: 0.1, halign: 'center', valign: 'middle', fillColor: false,
        ...(showImages ? { minCellHeight: 16 } : {}) // NEW: photo fit karne ke liye row height
      },
      headStyles: { fillColor: false, textColor, fontStyle: 'bold', lineWidth: 0.1, lineColor },
      // @ts-ignore
      columnStyles: activeColumnStyles as any,
      margin: { left: margin, right: margin },
      // NEW: har item ki photo "Image" column (index 1) me draw karo
      ...(showImages ? {
        didDrawCell: (hookData: any) => {
          if (hookData.column.index === 1 && hookData.section === 'body') {
            const item = data.items[hookData.row.index];
            const imgSize = 12;
            const x = hookData.cell.x + (hookData.cell.width - imgSize) / 2;
            const y = hookData.cell.y + (hookData.cell.height - imgSize) / 2;
            if (item?.imageBase64 && item.imageBase64.startsWith('data:image')) {
              try {
                doc.addImage(item.imageBase64, item.imageBase64.includes('png') ? 'PNG' : 'JPEG', x, y, imgSize, imgSize, undefined, 'FAST');
              } catch (e) { /* skip broken image */ }
            }
          }
        }
      } : {}),
    });
    // @ts-ignore
    let finalY = doc.lastAutoTable.finalY;

    // 5. Bottom Section (Totals)
    if (finalY > pageHeight - 80) { doc.addPage(); finalY = margin; }
    const vBoxX = endX - 25;

    const addRow = (label: string, amt: number, h: number, noTopBorder: boolean = false, noBottomBorder: boolean = false, bold: boolean = false) => {
      doc.line(startX, finalY, startX, finalY + h);                          // left
      doc.line(endX, finalY, endX, finalY + h);                              // right
      if (!noTopBorder) doc.line(startX, finalY, endX, finalY);              // top
      if (!noBottomBorder) doc.line(startX, finalY + h, endX, finalY + h);   // bottom
      doc.line(vBoxX, finalY, vBoxX, finalY + h);
      doc.setFontSize(9); doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.text(label, vBoxX - 2, finalY + 4, { align: 'right' });
      doc.text(amt.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4, { align: 'right' });
      finalY += h;
    };
    let hasExpensesAbove = false;

    if (data.expenses && data.expenses.length > 0) {
      hasExpensesAbove = true;
      const expH = 6 * data.expenses.length;
      doc.line(startX, finalY, startX, finalY + expH);   // left
      doc.line(endX, finalY, endX, finalY + expH);       // right
      doc.line(startX, finalY, endX, finalY);            // top only (no bottom border)
      doc.line(vBoxX, finalY, vBoxX, finalY + expH);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      data.expenses.forEach(exp => {
        doc.text(`Add : ${exp.name} (+)`, vBoxX - 2, finalY + 4, { align: 'right' });
        doc.text(exp.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4, { align: 'right' });
        finalY += 6;
      });
    } else if (data.extraExpenseName && data.extraExpenseAmount) {
      hasExpensesAbove = true;
      const names = data.extraExpenseName.split(',').map(n => n.trim()).filter(Boolean);
      const expH = 6 * names.length;
      doc.line(startX, finalY, startX, finalY + expH);   // left
      doc.line(endX, finalY, endX, finalY + expH);       // right
      doc.line(startX, finalY, endX, finalY);            // top only (no bottom border)
      doc.line(vBoxX, finalY, vBoxX, finalY + expH);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      names.forEach((name, idx) => {
        doc.text(`Add : ${name} (+)`, vBoxX - 2, finalY + 4, { align: 'right' });
        if (idx === names.length - 1) doc.text(data.extraExpenseAmount!.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4, { align: 'right' });
        finalY += 6;
      });
    }

    addRow('Add : Rounded off (+)', roundOffAmt, 6, hasExpensesAbove);

    // --- GRAND TOTAL (True Invoice Total) ---
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.rect(startX, finalY, contentWidth, 8);
    doc.text('Grand Total', pageWidth / 6, finalY + 5.5);
    doc.text(`${totalQty.toFixed(3)} Unit`, pageWidth / 3, finalY + 5.5);
    doc.text('Rs.', vBoxX - 7, finalY + 5.5);
    doc.rect(vBoxX, finalY, endX - vBoxX, 8);
    doc.text(invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 5.5, { align: 'right' });
    finalY += 8;

    // --- ADVANCE & SETTLED AMOUNT ---
    if (advance > 0 && !isEstimate) {
      addRow('Amount Paid (-)', advance, 6, false, true); // no bottom border on this row

      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.line(startX, finalY, startX, finalY + 6);          // outer box left
      doc.line(endX, finalY, endX, finalY + 6);              // outer box right
      doc.line(startX, finalY + 6, endX, finalY + 6);        // outer box bottom (no top border)
      doc.text('Balance Due', vBoxX - 6, finalY + 5.5, { align: 'right' });
      doc.line(vBoxX, finalY, vBoxX, finalY + 6);            // amount box left — now matches expense/rounding off vBoxX
      doc.line(vBoxX, finalY + 6, endX, finalY + 6);         // amount box bottom (no top border)
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
      // 1. Updated Headers with dedicated % columns
      const taxHeaders = isIgst
        ? [['Tax Rate', 'Taxable Amt.', 'IGST %', 'IGST Amt.', 'Total Tax']]
        : [['Tax Rate', 'Taxable Amt.', 'CGST %', 'CGST Amt.', 'SGST %', 'SGST Amt.', 'Total Tax']];

      // 2. Map the body to place rates and amounts in separate columns
      const taxBody = Object.keys(taxBreakdown).map(rate => {
        const d = taxBreakdown[rate];
        const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

        // Format the half rate (e.g., 18 -> 9, 5 -> 2.5)
        const halfRate = (Number(rate) / 2).toFixed(1).replace('.0', '');

        return isIgst
          ? [`${rate}%`, fmt(d.taxable), `${rate}%`, fmt(d.igst), fmt(d.igst)]
          : [`${rate}%`, fmt(d.taxable), `${halfRate}%`, fmt(d.cgst), `${halfRate}%`, fmt(d.sgst), fmt(d.cgst + d.sgst)];
      });

      // 3. Add the totals row (using empty strings '' for the percentage columns)
      const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
      if (isIgst) {
        taxBody.push(['TOTAL', fmt(totalTaxable), '', fmt(totalTaxAmt), fmt(totalTaxAmt)]);
      } else {
        taxBody.push(['TOTAL', fmt(totalTaxable), '', fmt(totalTaxAmt / 2), '', fmt(totalTaxAmt / 2), fmt(totalTaxAmt)]);
      }

      // 4. Render the table
      autoTable(doc, {
        startY: finalY + 2, head: taxHeaders, body: taxBody, theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1, textColor, lineColor, lineWidth: 0.1, halign: 'right', fillColor: false },
        headStyles: { fillColor: false, textColor, fontStyle: 'bold', halign: 'right', lineColor, lineWidth: 0.1 },
        columnStyles: { 0: { halign: 'left' } },
        tableWidth: contentWidth * 0.65,
        margin: { left: startX },
      });

      // @ts-ignore
      finalY = Math.max(doc.lastAutoTable.finalY + 2, finalY + 25);
    }

    // Amount in Words & Due
    // Fix: Convert the actual invoice total to words
    doc.rect(startX, finalY, contentWidth, wordsH);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text(`Rs. ${convertNumberToWords(invoiceTotal)}`, startX + 2, finalY + (hasPrevOrDue ? 7 : 5.5));
    if (hasPrevOrDue) {
      const divX = startX + leftColW;
      doc.line(divX, finalY, divX, finalY + wordsH); doc.line(divX, finalY + 6, endX, finalY + 6);
      doc.setFont('helvetica', 'normal'); doc.text('Previous Balance :', divX + 2, finalY + 4.5);
      doc.text(prevBal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4.5, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.text('Total Balance Due :', divX + 2, finalY + 10);
      doc.text(totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 10, { align: 'right' });
    }
    finalY += wordsH;

    if (!isEstimate && safeScheme !== 'NONE') {
      doc.rect(startX, finalY, contentWidth, 10);
      doc.setFont('helvetica', 'bold'); doc.text('BANK DETAIL :', startX + 2, finalY + 4);
      doc.line(startX + 2, finalY + 4.5, startX + 2 + doc.getTextWidth('BANK DETAIL :'), finalY + 4.5);
      doc.text(`A/C Holder Name : ${data.bankDetails?.accountName || ''}   IFSC Code : ${data.bankDetails?.ifsc || data.bankDetails?.ifscCode || ''}`, startX + 35, finalY + 4);
      doc.text(`Bank name : ${data.bankDetails?.bankName || ''} , A/C NO : ${data.bankDetails?.accountNumber || ''}`, startX + 35, finalY + 8);
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
        try { doc.addImage(data.signatureBase64, 'JPEG', startX + tW + rW + (aW / 2) - 17.5, finalY + 8, 35, 15, undefined, 'FAST'); } catch (e) { }
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
    doc.setTextColor(0, 0, 0);
    doc.text("Made with ", mx, by + 10); mx += doc.getTextWidth("Made with ");
    doc.text("Love", mx, by + 10); mx += doc.getTextWidth("Love");
    doc.text(" in India", mx, by + 10); doc.setTextColor(0);
  };

  // --- TRIGGER PAGE GENERATION ---
  renderPage(false);

  if (withDuplicate && !isEstimate) {
    renderPage(true);
    // NEW: triplicate mode prints one extra "DUPLICATE" copy (1 original + 2 duplicates)
    if (data.enableTriplicate) {
      renderPage(true);
    }
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
export const compressImage = (
  blob: Blob,
  quality: number = 0.5
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');

      const maxWidth = 300;

      const scale = Math.min(1, maxWidth / img.width);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject('Canvas context not available');
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      resolve(canvas.toDataURL('image/jpeg', quality));
    };

    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
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

        // Grab state from business_info if it exists
        if (businessData?.state) {
          companyData.state = businessData.state;
        }

        const logoUrl = businessData?.companyLogo;
        if (logoUrl) {
          // Convert logo URL to base64
          try {
            const response = await fetch(logoUrl);
            const blob = await response.blob();

            companyLogoBase64 = await compressImage(blob, 0.5);
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
    // --- TRANSPORT DETAILS ---
    transportDetails: invoiceData.transportDetails || undefined,
    // --- TEXT FIELDS (The likely culprits) ---
    companyState: companyData.state, // Fetch this from your companyDoc
    placeOfSupply: invoiceData.placeOfSupply || '',
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
    upiId: invoiceData.settings?.upiId || companyData.upiId || '',
    discountDisplayFormat: invoiceData.settings?.discountDisplayFormat || invoiceData.discountDisplayFormat || 'amount',

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
    items: (invoiceData.items || []).map((item: any) => {
      // --- NEW: Discount 1 + Discount 2 ko ₹ amount mein nikalna ---
      const baseMrp = Number(item.mrp) || 0;
      const qty = Number(item.quantity) || 1;
      const d1Pct = Number(item.discount) || 0;
      const d2Pct = Number(item.discount2) || 0;

      const priceAfterD1 = baseMrp * (1 - d1Pct / 100);
      const priceAfterD2 = priceAfterD1 * (1 - d2Pct / 100);

      const discount1Amount = (baseMrp - priceAfterD1) * qty;
      let discount2Amount = (priceAfterD1 - priceAfterD2) * qty;

      // Back-calculate discount2Amount from taxableAmount if d2Pct is missing/zero
      if (d2Pct === 0) {
        const taxableAmt = Number(item.taxableAmount) || 0;
        if (taxableAmt > 0) {
          const totalDiscountAmt = (baseMrp * qty) - taxableAmt;
          discount2Amount = Math.max(0, totalDiscountAmt - discount1Amount);
        }
      }

      return {
        ...item,
        name: item.name || 'Item',
        unit: item.unit || 'pcs',
        hsn: item.hsn || '',
        gstRate: item.gstRate || item.tax || 0,
        quantity: item.quantity || 0,
        price: item.price || item.rate || 0,
        amount: item.amount ?? undefined,
        discountAmount: item.discountAmount ?? item.discount ?? 0,
        discount1Amount,   // NEW
        discount2Amount,   // NEW
        discount1Percent: d1Pct,   // NEW
        discount2Percent: d2Pct,   // NEW
        // Ensure these exist for items too
        taxType: item.taxType || 'exclusive'
      };
    })
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