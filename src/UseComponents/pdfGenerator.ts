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

// ---------------------------------------------------------------------------
// Pure utility — converts a number to Indian-English words
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Item Row calculation — Restored from your correct Main Branch (V1)
// to ensure exact DB mappings and negative discount/markup fixes.
// ---------------------------------------------------------------------------
interface ItemRowResult {
  cells: (string | number)[];
  qty: number;
  taxableAmt: number;
  taxAmt: number;
  finalAmount: number;
  taxRate: number;
}

function buildItemRowData(
  item: InvoiceData['items'][number],
  safeScheme: string,
  safeTaxType: string,
  isEstimate: boolean,
  showTaxColumns: boolean
): ItemRowResult {
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
  if (discountAmt < 0) {
    discountAmt = 0;
    mrp = qty > 0 ? (taxableAmt / qty) : taxableAmt;
  }

  // 2. Tax Formatting
  let taxRate = Number(item.taxRate || item.gstPercent || (item as any).tax || 0);

  // Zero out taxes for Exempt/None, but keep the columns visible!
  const isExempt = safeScheme === 'NONE' || safeTaxType === 'EXEMPT' || safeTaxType === 'NONE';

  if (isEstimate || isExempt) {
    taxRate = 0;
    taxAmt = 0;
    finalAmount = taxableAmt;
  }

  const cells = showTaxColumns ? [
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

  return { cells, qty, taxableAmt, taxAmt, finalAmount, taxRate };
}

// ---------------------------------------------------------------------------
// Branding Footer Generator
// ---------------------------------------------------------------------------
function drawBrandingFooter(doc: jsPDF, pageWidth: number, pageHeight: number): void {
  const brandingHeight = 15;
  const brandingY = pageHeight - brandingHeight;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');

  const pbText = 'Powered by ';
  const linkText = 'SELLAR.IN';

  const pbWidth = doc.getTextWidth(pbText);
  const linkWidth = doc.getTextWidth(linkText);

  let brandingX = (pageWidth / 2) - ((pbWidth + linkWidth) / 2);

  doc.setTextColor(0, 0, 0);
  doc.text(pbText, brandingX, brandingY + 5);
  brandingX += pbWidth;

  // Blue hyperlink
  doc.setTextColor(0, 102, 204);
  doc.text(linkText, brandingX, brandingY + 5);
  doc.setDrawColor(0, 102, 204);
  doc.setLineWidth(0.1);
  doc.line(brandingX, brandingY + 5.5, brandingX + linkWidth, brandingY + 5.5);
  doc.link(brandingX, brandingY + 2, linkWidth, 4, { url: 'https://www.sellar.in' });

  // Reset colours
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  // "Made with Love in India"
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
}

// ---------------------------------------------------------------------------
// A4 Invoice Orchestrator
// ---------------------------------------------------------------------------
async function generateA4Invoice(
  data: InvoiceData,
  isEstimate: boolean,
  action: ACTION.DOWNLOAD | ACTION.PRINT | ACTION.BLOB
): Promise<Blob | void> {
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

  // QR code for UPI payment
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
  const now = new Date();
  const generatedAt = now.toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(`Bill generated on ${generatedAt}`, pageWidth - margin, margin - 2, { align: "right" });

  // --- 1. HEADER SECTION ---
  doc.setFontSize(9);
  const addressLines = doc.splitTextToSize(data.companyAddress, contentWidth - 50);
  const addressOffset = Math.max(0, addressLines.length - 1) * 4;
  const headerHeight = 25 + addressOffset;
  drawBox(cursorY, headerHeight);

  if (qrBase64 && !isEstimate) {
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

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (!isEstimate) {
    const addrLines = doc.splitTextToSize(data.companyAddress, contentWidth - 50);
    doc.text(addrLines, pageWidth / 2, cursorY + 16, { align: 'center' });
    doc.text(`Phone : ${data.companyContact}`, pageWidth / 2, cursorY + 20, { align: 'center' });
  }

  if (showGstinDetails) {
    doc.setFont('helvetica', 'bold');
    doc.text(
      `GSTIN : ${data.companyGstin || ''}  (${safeScheme})`,
      pageWidth / 2, cursorY + 24 + addressOffset, { align: 'center' }
    );
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
    if (safeScheme === 'REGULAR') schemeInfo += ` (${safeTaxType})`;
    doc.setFont('helvetica', 'bold');
    doc.text(schemeInfo, (pageWidth / 2) + 2, cursorY + 10);
  }
  doc.setFont('helvetica', 'normal');

  cursorY += metaHeight;

  // --- 3. PARTIES SECTION ---
  const billName = data.billTo.name;
  const billAddr = doc.splitTextToSize(data.billTo.address, contentWidth / 2 - 10);
  const billPhone = `Phone.No.  : ${data.billTo.phone || ''}`;
  const billEmail = `E Mail  : ${data.billTo.email || ''}`;

  const shipName = data.shipTo?.name || '';
  const shipAddr = doc.splitTextToSize(data.shipTo?.address || '', contentWidth / 2 - 10);
  const shipPhone = `Phone.No.  : ${data.shipTo?.phone || ''}`;

  const lineHeight = 5;
  const padding = 10;

  // Base heights matching your V1
  const billLines = 5 + billAddr.length;
  const shipLines = 4 + shipAddr.length;
  const partyHeight = (Math.max(billLines, shipLines) * lineHeight) + padding;

  drawBox(cursorY, partyHeight);
  doc.line(pageWidth / 2, cursorY, pageWidth / 2, cursorY + partyHeight);

  const headerY = cursorY + 5;
  doc.setFont('helvetica', 'bold');
  doc.text(isEstimate ? 'Estimate For :' : 'Billed to :', startX + 2, headerY);
  if (!isEstimate) doc.text('Shipped to :', (pageWidth / 2) + 2, headerY);
  doc.setFont('helvetica', 'normal');

  let currentYLeft = headerY + 6;
  doc.text(isEstimate ? shipName : billName, startX + 2, currentYLeft);
  currentYLeft += lineHeight;

  const leftAddr = isEstimate ? shipAddr : billAddr;
  doc.text(leftAddr, startX + 2, currentYLeft);
  currentYLeft += leftAddr.length * lineHeight;

  doc.text(isEstimate ? `Phone.No.  : ${data.shipTo?.phone || ''}` : billPhone, startX + 2, currentYLeft);
  currentYLeft += lineHeight;

  if (!isEstimate) {
    if (data.billTo.email) {
      doc.text(billEmail, startX + 2, currentYLeft);
    }
    currentYLeft += lineHeight;
    if (showGstinDetails && data.billTo.gstin) {
      doc.text(`GST No. : ${data.billTo.gstin}`, startX + 2, currentYLeft);
    }
  }

  if (!isEstimate) {
    let currentYRight = headerY + 6;
    doc.text(shipName, (pageWidth / 2) + 2, currentYRight);
    currentYRight += lineHeight;
    doc.text(shipAddr, (pageWidth / 2) + 2, currentYRight);
    currentYRight += shipAddr.length * lineHeight;
    doc.text(shipPhone, (pageWidth / 2) + 2, currentYRight);
    currentYRight += lineHeight;
    if (showGstinDetails && data.shipTo?.gstin) {
      doc.text(`GST No. : ${data.shipTo.gstin}`, (pageWidth / 2) + 2, currentYRight);
    }
  }

  cursorY += partyHeight;

  // --- 4. ITEM TABLE ---
  let totalQty = 0;
  let totalTaxable = 0;
  let totalTaxAmt = 0;
  let grossTotal = 0;

  const hasZeroMrp = data.items.some(item => !item.listPrice && !(item as any).mrp);
  const priceHeader = hasZeroMrp ? 'Sales Price' : 'MRP';

  const taxBreakdown: Record<string, { taxable: number; cgst: number; sgst: number }> = {};

  const tableBody = data.items.map(item => {
    const row = buildItemRowData(item, safeScheme, safeTaxType, isEstimate, showTaxColumns);

    totalQty += row.qty;
    totalTaxable += row.taxableAmt;
    totalTaxAmt += row.taxAmt;
    grossTotal += row.finalAmount;

    if (row.taxRate > 0) {
      const rateKey = row.taxRate.toString();
      if (!taxBreakdown[rateKey]) taxBreakdown[rateKey] = { taxable: 0, cgst: 0, sgst: 0 };
      taxBreakdown[rateKey].taxable += row.taxableAmt;
      taxBreakdown[rateKey].cgst += row.taxAmt / 2;
      taxBreakdown[rateKey].sgst += row.taxAmt / 2;
    }

    return row.cells;
  });

  const billDiscount = Number(data.billDiscount) || 0;
  const extraExpense = Number(data.extraExpenseAmount) || 0;

  let finalRoundTotal = Number(data.finalAmount || (data as any).grandTotal || 0);
  const pureCalculated = grossTotal - billDiscount + extraExpense;

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
      fontSize: 8, cellPadding: 1,
      textColor, lineColor, lineWidth: 0.1,
      halign: 'center', valign: 'middle'
    },
    headStyles: {
      fillColor: [255, 255, 255], textColor,
      fontStyle: 'bold', lineWidth: 0.1, lineColor
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

  // Extra expense rows (Maintains your multiple/comma-separated logic)
  if (data.extraExpenseName && data.extraExpenseAmount && data.extraExpenseAmount > 0) {
    const names = data.extraExpenseName.split(',').map(n => n.trim()).filter(Boolean);
    const totalExpense = data.extraExpenseAmount;

    if (names.length <= 1) {
      const expH = 6;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.rect(startX, finalY, contentWidth, expH);
      doc.line(valueBoxX, finalY, valueBoxX, finalY + expH);

      doc.text(`Add : ${names[0] || 'Extra Expense'} (+)`, valueBoxX - 2, finalY + 4, { align: 'right' });
      doc.text(totalExpense.toFixed(2), endX - 2, finalY + 4, { align: 'right' });
      finalY += expH;
    } else {
      const totalExpenseH = 6 * names.length;
      doc.rect(startX, finalY, contentWidth, totalExpenseH);
      doc.line(valueBoxX, finalY, valueBoxX, finalY + totalExpenseH);

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

  // Bill discount row
  if (billDiscount > 0) {
    const discH = 6;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.rect(startX, finalY, contentWidth, discH);
    doc.line(valueBoxX, finalY, valueBoxX, finalY + discH);

    doc.text('Less : Bill Discount (-)', valueBoxX - 2, finalY + 4, { align: 'right' });
    doc.text(billDiscount.toFixed(2), endX - 2, finalY + 4, { align: 'right' });
    finalY += discH;
  }

  // Rounded off row
  const roundOffH = 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.rect(startX, finalY, contentWidth, roundOffH);
  doc.line(valueBoxX, finalY, valueBoxX, finalY + roundOffH);

  doc.text('Add : Rounded off (+)', valueBoxX - 2, finalY + 4, { align: 'right' });
  doc.text(roundOffAmt.toFixed(2), endX - 2, finalY + 4, { align: 'right' });
  finalY += roundOffH;

  // Grand total row
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

  // Narration / Remarks
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

  // Tax breakdown table
  if (showTaxColumns) {
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
        fontSize: 8, cellPadding: 1,
        textColor, lineColor, lineWidth: 0.1, halign: 'right'
      },
      headStyles: {
        fillColor: [255, 255, 255], textColor,
        fontStyle: 'bold', halign: 'right', lineColor, lineWidth: 0.1
      },
      columnStyles: { 0: { halign: 'left' } },
      tableWidth: contentWidth / 2,
      margin: { left: startX },
    });

    // @ts-ignore
    const taxTableEnd = doc.lastAutoTable.finalY;
    finalY = Math.max(taxTableEnd + 2, finalY + 25);
  }

  // Amount in words
  const wordsH = 8;
  doc.rect(startX, finalY, contentWidth, wordsH);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`Rs. ${convertNumberToWords(finalRoundTotal)}`, startX + 2, finalY + 5.5);
  finalY += wordsH;

  // Bank details
  if (!isEstimate && safeScheme !== 'NONE') {
    const bankH = 10;
    doc.rect(startX, finalY, contentWidth, bankH);
    doc.setFont('helvetica', 'bold');
    doc.text('BANK DETAIL :', startX + 2, finalY + 4);
    const bdWidth = doc.getTextWidth('BANK DETAIL :');
    doc.line(startX + 2, finalY + 4.5, startX + 2 + bdWidth, finalY + 4.5);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Bank name : ${data.bankDetails?.bankName || ''} , A/C NO. ${data.bankDetails?.accountNumber || ''}`,
      startX + 35, finalY + 4
    );
    doc.text(`IFSC Code ${data.bankDetails?.ifsc || ''}`, startX + 35, finalY + 8);
    finalY += bankH;
  }

  // --- 6. FOOTER (Terms + Signatures) ---
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
    doc.text(doc.splitTextToSize(data.terms, termsWidth - 5), termsX + 2, termY);

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

  // --- 7. BRANDING FOOTER ---
  drawBrandingFooter(doc, pageWidth, pageHeight);

  // --- OUTPUT ---
  if (action === ACTION.PRINT) {
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  } else if (action === ACTION.DOWNLOAD) {
    doc.save(`Invoice_${data.invoice.number}.pdf`);
  } else if (action === ACTION.BLOB) {
    return doc.output('blob');
  }
}

// ---------------------------------------------------------------------------
// Public entry point — dispatches to the correct format generator.
// ---------------------------------------------------------------------------
export const generatePdf = async (
  data: InvoiceData,
  action: ACTION.DOWNLOAD | ACTION.PRINT | ACTION.BLOB = ACTION.DOWNLOAD
): Promise<Blob | void> => {
  const isEstimate = (data as any).isEstimate === true;

  if (data.printFormat === 'THERMAL58') {
    return generateThermalReceipt(data, action);
  }

  if (data.printFormat === 'A5') {
    data.companyGstType = data.companyGstType || data.gstScheme;
    return generateA5Invoice(data, isEstimate, action);
  }

  return generateA4Invoice(data, isEstimate, action);
};

// ---------------------------------------------------------------------------
// Fetches company details from Firestore and enriches raw invoice data with
// safe defaults so the PDF generators never crash on missing fields.
// ---------------------------------------------------------------------------
export const preparePdfData = async (invoiceData: any) => {
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

      const businessInfoDoc = await getDoc(
        doc(db, 'companies', invoiceData.companyId, 'business_info', invoiceData.companyId)
      );

      if (businessInfoDoc.exists()) {
        const businessData = businessInfoDoc.data();
        const logoUrl = businessData?.companyLogo;
        if (logoUrl) {
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
    type: invoiceData.type || 'SALES',
    voucherName: invoiceData.voucherName || 'Tax Invoice',
    currency: invoiceData.currency || 'INR',
    status: invoiceData.status || 'Paid',
    paymentStatus: invoiceData.paymentStatus || 'Paid',
    taxType: invoiceData.taxType || 'exclusive',
    gstScheme: invoiceData.gstScheme || 'regular',
    partyName: invoiceData.partyName || 'Cash Customer',
    invoiceNumber: invoiceData.invoiceNumber || 'INV-000',
    mode: invoiceData.mode || 'print',
    upiId: invoiceData.settings?.upiId || companyData.upiId || '',
    company: companyData,
    settings: invoiceData.settings || {},
    totalAmount: invoiceData.totalAmount || 0,
    subtotal: invoiceData.subtotal || 0,
    taxAmount: invoiceData.taxAmount || 0,
    roundOff: invoiceData.roundOff || 0,
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
      taxType: item.taxType || 'exclusive'
    }))
  };
};

// ---------------------------------------------------------------------------
// Convenience wrapper — returns a Blob directly.
// ---------------------------------------------------------------------------
export const generatePdfBlob = async (data: InvoiceData): Promise<Blob> => {
  const result = await generatePdf(data, ACTION.BLOB);
  if (result instanceof Blob) return result;
  throw new Error("Failed to generate PDF Blob");
};