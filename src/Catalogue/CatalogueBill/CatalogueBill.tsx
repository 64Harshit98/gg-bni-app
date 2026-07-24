import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/Firebase";
import { resolveCompanyLogoBase64 } from "../hooks/useCompanyLogo";
import { generateA5Invoice } from "../../UseComponents/A5PdfGenerator";
import { ACTION } from "../../enums/index";
import QRCode from 'qrcode';

export interface CatalogueInvoiceData {
  companyId?: string;
  companyGstType?: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  logoBase64?: string;
  isEstimate?: boolean;

  companyGstin?: string;
  msmeNumber?: string;
  panNumber?: string;
  placeOfSupply?: string;
  companyState?: string;

  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  ifscCode?: string;
  termsAndConditions?: string;
  signatureBase64?: string;
  taxType?: 'inclusive' | 'exclusive';
  upiId?: string;
  enableTriplicate?: boolean;

  customer: {
    billing: {
      name: string;
      phone: string;
      address?: string;
      city?: string;
      state?: string;
      gstin?: string;
    };
    shipping: {
      name: string;
      phone: string;
      address?: string;
      city?: string;
      state?: string;
      gstin?: string;
    };
  };

  order: {
    orderId: string;
    date: string;
  };

  items: {
    sno: number;
    name: string;
    qty: number;
    price: number;
    total: number;
    imageBase64?: string;
    unitMultiplier?: number;
    tax?: number;
    gst?: number;
    taxRate?: number;
    mrp?: number;
    salesPrice?: number;
    unit?: string;
    compressedImageBase64?: string;
  }[];

  specialInstruction?: string;
  grandTotal: number;
  advancePaid?: number;
  previousBalance?: number;
  billDiscount?: number;
  transportDetails?: {
    transportName?: string;
    grRrNo?: string;
    grRrDate?: string;
    vehicleNo?: string;
    stationFrom?: string;
    pinCode?: string;
  };

  extraExpenses?: { name: string; amount: number }[];
  extraExpenseName?: string;
  extraExpenseAmount?: number;
  discountDisplayMode?: 'amount' | 'percentage';
  enableDiscount2?: boolean;
}
export const CatalogueBill = async (
  data: CatalogueInvoiceData,
  action: "download" | "print" | "blob" = "download",
  withDuplicate: boolean = false
): Promise<Blob | void> => {

  if ((data as any).printFormat === "A5") {
    const a5Data = {
      companyName: data.companyName,
      companyAddress: data.companyAddress || "",
      companyContact: data.companyPhone || "",
      isEstimate: data.isEstimate === true,
      companyGstType: data.companyGstType,
      taxType: data.taxType,
      enableTriplicate: (data as any).enableTriplicate === true,

      billTo: {
        name: data.customer?.billing?.name || data.customer?.shipping?.name || "",
        address: [
          data.customer?.billing?.address || data.customer?.shipping?.address || "",
          data.customer?.billing?.city || data.customer?.shipping?.city || "",
          data.customer?.billing?.state || data.customer?.shipping?.state || ""
        ].filter(Boolean).join(', '),
        phone: data.customer?.billing?.phone || data.customer?.shipping?.phone || "",
        email: "",
        gstin: data.customer?.billing?.gstin || data.customer?.shipping?.gstin || ""
      },
      shipTo: {
        name: data.customer?.shipping?.name || data.customer?.billing?.name || "",
        address: [
          data.customer?.shipping?.address || data.customer?.billing?.address || "",
          data.customer?.shipping?.city || data.customer?.billing?.city || "",
          data.customer?.shipping?.state || data.customer?.billing?.state || ""
        ].filter(Boolean).join(', '),
        phone: data.customer?.shipping?.phone || data.customer?.billing?.phone || "",
        gstin: data.customer?.shipping?.gstin || data.customer?.billing?.gstin || ""
      },
      invoice: {
        number: data.order?.orderId || "",
        date: data.order?.date || ""
      },
      items: data.items.map((item: any, index: number) => {
        const qty = item.qty || 0;
        let mrp = Number(item.mrp || item.price || item.salesPrice || 0);
        const rawPrice = item.salesPrice || item.price || mrp;
        const taxPercent = item.tax ?? item.gst ?? item.taxRate ?? 0;

        const safeScheme = (data.companyGstType || '').toUpperCase();
        const safeTaxType = (data.taxType || '').toUpperCase();

        const isTaxEnabled = safeScheme === "REGULAR" && safeTaxType !== "EXEMPT" && safeTaxType !== "NONE";
        const effectiveTaxRate = isTaxEnabled ? taxPercent : 0;

        let subtotal = 0;
        let gstAmount = 0;
        let finalRowTotal = 0;

        if (effectiveTaxRate === 0) {
          subtotal = rawPrice * qty;
          gstAmount = 0;
          finalRowTotal = subtotal;
        } else {
          if (safeTaxType === "EXCLUSIVE") {
            subtotal = rawPrice * qty;
            gstAmount = subtotal * (effectiveTaxRate / 100);
            finalRowTotal = subtotal + gstAmount;
          } else {
            // Inclusive: Back-calculate
            finalRowTotal = rawPrice * qty;
            subtotal = finalRowTotal / (1 + (effectiveTaxRate / 100));
            gstAmount = finalRowTotal - subtotal;
          }
        }

        let discountAmt = (mrp * qty) - (rawPrice * qty);
        if (discountAmt < 0) {
          discountAmt = 0;
          mrp = rawPrice;
        }

        const totalPcs = qty * (item.unitMultiplier ?? 1);

        return {
          sno: index + 1,
          name: item.name,
          hsn: "",
          quantity: qty,
          totalPcs,
          unit: item.unit || "Pcs",
          listPrice: rawPrice,
          imageBase64: item.imageBase64 || "",
          gstPercent: effectiveTaxRate,
          gstAmount: gstAmount,
          discountAmount: discountAmt,
          amount: finalRowTotal
        };
      }),
      finalAmount: data.grandTotal,
      bankDetails: {
        accountNumber: data.accountNumber,
        bankName: data.bankName,
        accountName: data.accountName,
        ifscCode: data.ifscCode
      },
      companyGstin: data.companyGstin,
      terms: data.termsAndConditions,
      signatureBase64: data.signatureBase64
    };

    let finalAction: ACTION;

    if (action === "print") {
      finalAction = ACTION.PRINT;
    } else if (action === "blob") {
      finalAction = ACTION.BLOB;
    } else {
      finalAction = ACTION.DOWNLOAD;
    }

    return generateA5Invoice(
      a5Data as any,
      data.isEstimate === true,
      finalAction,
      withDuplicate
    );
  }

  const isEstimate = data.isEstimate === true;
  const doc = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4",
    compress: true
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const startX = margin;
  const endX = pageWidth - margin;

  const lineColor = "#000000";
  const textColor = "#000000";
  doc.setDrawColor(lineColor);
  doc.setTextColor(textColor);
  doc.setLineWidth(0.1);

  let qrBase64: string | null = null;
  if (data.upiId && !isEstimate) {
    const upiString = `upi://pay?pa=${data.upiId}&pn=${encodeURIComponent(data.companyName)}&cu=INR`;
    try {
      // Need top-level await or a quick async resolution
      qrBase64 = await QRCode.toDataURL(upiString, { width: 80, margin: 0, errorCorrectionLevel: "L" });
    } catch (err) {
      console.error("Failed to generate QR code", err);
    }
  }

  // --- STRICT TAX SCHEME LOGIC ---
  const safeScheme = (data.companyGstType && data.companyGstType.trim() !== '') ? data.companyGstType.toUpperCase() : 'NONE';
  const safeTaxType = (data.taxType && data.taxType.trim() !== '') ? data.taxType.toUpperCase() : 'EXCLUSIVE';

  // --- NEW SCHEME LOGIC ---
  const isComposition = safeScheme === 'COMPOSITION';
  const isExemptOrUnreg = safeTaxType === 'EXEMPT' || safeTaxType === 'NONE' || safeScheme === 'NONE' || safeScheme === 'UNREGISTERED';
  const isRegular = safeScheme === 'REGULAR' && !isExemptOrUnreg;

  // Show columns if Regular OR Composition
  const showTaxColumns = !isEstimate && (isRegular || isComposition);
  const showGstinDetails = !isEstimate && safeScheme !== 'UNREGISTERED' && safeScheme !== 'NONE' && safeTaxType !== 'NONE';

  const displayPos = data.placeOfSupply
    || (data.customer?.shipping?.address || "").split(',').pop()?.trim()
    || (data.customer?.billing?.address || "").split(',').pop()?.trim()
    || '';

  const safeCompanyState = (data.companyState || '').trim().toLowerCase();
  const safePos = displayPos.toLowerCase();
  const isIgst = Boolean(safeCompanyState && safePos && safeCompanyState !== safePos);

  const drawBox = (y: number, h: number) => {
    doc.rect(startX, y, contentWidth, h);
  };

  const now = new Date();
  const generatedAt = now.toLocaleString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  const addressLines = doc.splitTextToSize(data.companyAddress, contentWidth - 45);
  const addressBlockHeight = addressLines.length * 4;
  // FIX: Increase box height if GSTIN is present so text doesn't hit the bottom border
  const headerHeight = (showGstinDetails ? 30 : 25) + addressBlockHeight;

  const billName = data.customer?.billing?.name || data.customer?.shipping?.name || "";
  const billFullAddress = [
    data.customer?.billing?.address || data.customer?.shipping?.address || "",
    data.customer?.billing?.city || "",
    data.customer?.billing?.state || ""
  ].filter(Boolean).join(', ');
  const billAddr = doc.splitTextToSize(billFullAddress, contentWidth / 2 - 10);
  const billPhone = `Phone.No.  : ${data.customer?.billing?.phone || ""}`;
  const billGstin = data.customer?.billing?.gstin || "";

  const shipName = data.customer?.shipping?.name || "";
  const shipFullAddress = [
    data.customer?.shipping?.address || "",
    data.customer?.shipping?.city || "",
    data.customer?.shipping?.state || ""
  ].filter(Boolean).join(', ');
  const shipAddr = doc.splitTextToSize(shipFullAddress, contentWidth / 2 - 10);
  const shipPhone = `Phone.No.  : ${data.customer?.shipping?.phone || ""}`;
  const shipGstin = data.customer?.shipping?.gstin || "";

  let totalQty = 0, totalTaxable = 0, totalTaxAmt = 0, grossTotal = 0;
  const hasZeroMrp = data.items.some(item => !item.price || item.price === 0);
  const priceHeader = hasZeroMrp ? 'Sale Price' : 'MRP';

  const taxBreakdown: Record<string, { taxable: number, cgst: number, sgst: number, igst: number }> = {};

  const totalBillDiscount = Number(data.billDiscount) || 0;
  const hasBillDiscount = totalBillDiscount > 0;
  const sumPostDiscountAmounts = data.items.reduce((sum, item) => sum + ((item.price || item.mrp || 0) * (item.qty || 0)), 0);

  const tableBody = data.items.map((item, index) => {
    const qty = Number(item.qty) || 0;
    let mrp = Number(item.mrp || item.price || 0);
    const rawPrice = Number(item.price || mrp);

    // If not Regular, force tax rate to 0 internally for math
    let taxRate = isRegular ? Number(item.tax ?? item.gst ?? item.taxRate ?? 0) : 0;

    // --- Split discount into disc1 amount + disc2 amount (chained: MRP -> disc1 -> disc2) ---
    const disc1Pct = Number((item as any).discount || 0);
    const disc2Pct = Number((item as any).discount2 || 0);
    const priceAfterDisc1 = mrp * (1 - disc1Pct / 100);

    let disc1Amt = (mrp - priceAfterDisc1) * qty;
    let disc2Amt = (priceAfterDisc1 - rawPrice) * qty;
    if (disc1Amt < 0) disc1Amt = 0;
    if (disc2Amt < 0) disc2Amt = 0;

    let itemDisc = disc1Amt + disc2Amt;
    if (itemDisc < 0) {
      itemDisc = 0;
      mrp = rawPrice;
    }

    let rowGross = rawPrice * qty;
    let billDisc = sumPostDiscountAmounts > 0 ? (rowGross / sumPostDiscountAmounts) * totalBillDiscount : 0;
    if (billDisc < 0) billDisc = 0;

    let rowNet = rowGross - billDisc;

    let taxableAmt = 0;
    let taxAmt = 0;
    let finalAmount = 0;

    if (taxRate === 0) {
      taxableAmt = rowNet;
      finalAmount = taxableAmt;
    } else {
      if (safeTaxType === "EXCLUSIVE") {
        taxableAmt = rowNet;
        taxAmt = rowNet * (taxRate / 100);
        finalAmount = rowNet + taxAmt;
      } else {
        // Inclusive: Back-calculate
        finalAmount = rowNet;
        taxableAmt = finalAmount / (1 + (taxRate / 100));
        taxAmt = finalAmount - taxableAmt;
      }
    }

    totalQty += qty;
    totalTaxable += taxableAmt;
    totalTaxAmt += taxAmt;
    grossTotal += finalAmount;

    if (isRegular && taxRate > 0) {
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

    const itemNameCell = `${item.name}\n(${(item.qty * (item.unitMultiplier ?? 1))} pcs)`;
    const unitText = item.unit || "PCS";

    // For Composition, tax cells exist but are visually empty ("-")
    const printTaxRate = isComposition ? "-" : `${taxRate}%`;
    const printTaxAmt = isComposition ? "-" : taxAmt.toFixed(2);

    const showDiscount2 = data.enableDiscount2 === true;

    const discDisplay = showDiscount2
      ? (data.discountDisplayMode === 'percentage'
        ? `${disc1Pct.toFixed(2)}% + ${disc2Pct.toFixed(2)}%`
        : `${disc1Amt.toFixed(2)} + ${disc2Amt.toFixed(2)}`)
      : (data.discountDisplayMode === 'percentage'
        ? `${disc1Pct.toFixed(2)}%`
        : `${disc1Amt.toFixed(2)}`);

    if (!showTaxColumns) {
      return [
        index + 1, "", itemNameCell, qty, unitText, mrp.toFixed(2), discDisplay, ...(hasBillDiscount ? [billDisc.toFixed(2)] : []), finalAmount.toFixed(2)
      ];
    }

    return [
      index + 1, "", itemNameCell, qty, unitText, mrp.toFixed(2), discDisplay, ...(hasBillDiscount ? [billDisc.toFixed(2)] : []), taxableAmt.toFixed(2),
      printTaxRate, printTaxAmt, finalAmount.toFixed(2)
    ];
  });

  const advance = Number(data.advancePaid) || 0;

  let totalExtraExpenses = 0;
  if (data.extraExpenses && data.extraExpenses.length > 0) {
    totalExtraExpenses = data.extraExpenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  } else if (data.extraExpenseAmount) {
    totalExtraExpenses = Number(data.extraExpenseAmount) || 0;
  }

  // pureCalculated exactly mirrors the math including prorated discounts and exclusive tax
  const pureCalculated = grossTotal + totalExtraExpenses;

  // STRICT OVERRIDE: Trust the PDF's internal math, NOT the DB's pre-tax grandTotal
  let invoiceTotal = Math.round(pureCalculated);
  const roundOffAmt = invoiceTotal - pureCalculated;

  const settledAmount = invoiceTotal - advance;
  const prevBal = Number(data.previousBalance) || 0;
  const currentDue = Math.max(0, invoiceTotal - advance);
  const totalDue = prevBal + currentDue;
  const hasPrevOrDue = prevBal > 0 || currentDue > 0;
  const wordsH = hasPrevOrDue ? 12 : 8;
  const leftColW = contentWidth - (hasPrevOrDue ? 70 : 0);

  const renderPage = (isDuplicate: boolean) => {
    if (isDuplicate) doc.addPage();
    let cursorY = margin;

    if (isDuplicate) {
      doc.setFontSize(10); doc.setFont("helvetica", "bold");
      doc.setTextColor(150, 150, 150);
      doc.text("DUPLICATE", pageWidth / 2, cursorY - 2, { align: "center" });
      doc.setTextColor(0, 0, 0);
    }

    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(`Bill generated on ${generatedAt}`, pageWidth - margin, cursorY - 2, { align: "right" });

    drawBox(cursorY, headerHeight);
    if (qrBase64 && !isEstimate) {
      doc.addImage(qrBase64, 'PNG', startX + 2, cursorY + 2, 18, 18);
      doc.setFontSize(6); doc.text('Scan to Pay', startX + 11, cursorY + 22, { align: 'center' });
    }

    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    const title = isEstimate ? 'ESTIMATE' : (isExemptOrUnreg) ? 'BILL OF SUPPLY' : 'TAX INVOICE';
    doc.text(title, pageWidth / 2, cursorY + 5, { align: 'center' });

    doc.setFontSize(8);
    if (!isEstimate && data.msmeNumber) doc.text(`Msme No ${data.msmeNumber}`, endX - 2, cursorY + 5, { align: 'right' });

    if (data.logoBase64) {
      try { doc.addImage(data.logoBase64, 'PNG', endX - 20, cursorY + 7, 18, 14); } catch (e) { }
    }

    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text(data.companyName.toUpperCase(), pageWidth / 2, cursorY + 11, { align: 'center' });
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');

    if (!isEstimate) {
      doc.text(addressLines, pageWidth / 2, cursorY + 16, { align: 'center' });
      doc.text(`Phone : ${data.companyPhone}`, pageWidth / 2, cursorY + 16 + addressBlockHeight, { align: 'center' });
    }

    if (showGstinDetails) {
      doc.setFont('helvetica', 'bold');
      doc.text(`GSTIN : ${data.companyGstin || ''}  (${safeScheme})`, pageWidth / 2, cursorY + 22 + addressBlockHeight, { align: 'center' });
      doc.setFont('helvetica', 'normal');
    }
    // FIX: Increased padding from + 2 to + 5 to ensure the Meta Row clears the header box
    cursorY += headerHeight + 4;

    // --- RESTORED TOP META ROW ---
    doc.setFontSize(9);
    doc.text(`Invoice No : ${data.order?.orderId || ""}`, margin, cursorY);
    doc.text(`Date : ${data.order?.date || ""}`, margin + (contentWidth / 3), cursorY);
    doc.text(`Place of Supply : ${displayPos}`, margin + (contentWidth / 3) * 2, cursorY);

    cursorY += 2;
    doc.setLineWidth(0.4);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 4;
    // --- TRANSPORT DETAILS ROW ---
    const td = data.transportDetails;
    const hasTransport = td && (td.transportName || td.grRrNo || td.vehicleNo || td.grRrDate || td.stationFrom || td.pinCode);
    if (hasTransport && !isEstimate) {
      const transportRowHeight = 10;
      doc.setLineWidth(0.1);
      drawBox(cursorY, transportRowHeight);

      // Draw 2 vertical dividers for 3 equal columns (matches POS layout)
      const colW = contentWidth / 3;

      doc.setFontSize(7); doc.setFont('helvetica', 'bold');

      // Column 1: Transporter + GR/RR No (label and value on same line)
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
    // --- END TRANSPORT DETAILS ROW ---
    // --- RESTORED PARTIES + TOP TOTAL BOX ---
    const totalBoxWidth = 35;
    const tableWidth = contentWidth - totalBoxWidth;
    const sectionHeight = Math.max(32, (Math.max(4 + (billAddr.length), 4 + (shipAddr.length)) * 5) + 5);

    doc.setLineWidth(0.1);
    doc.rect(margin, cursorY, tableWidth, sectionHeight);
    doc.line(margin + tableWidth / 2, cursorY, margin + tableWidth / 2, cursorY + sectionHeight);

    doc.setFont("helvetica", "bold");
    doc.text(isEstimate ? 'Estimate For :' : 'Billed To :', margin + 3, cursorY + 5);
    if (!isEstimate) doc.text('Shipped To :', margin + tableWidth / 2 + 3, cursorY + 5);

    doc.setFont("helvetica", "normal");
    let leftY = cursorY + 10;
    doc.text(billName, margin + 3, leftY); leftY += 5;
    doc.text(billAddr, margin + 3, leftY); leftY += (billAddr.length * 4.5);
    doc.text(billPhone, margin + 3, leftY); leftY += 5;
    if (!isEstimate && showGstinDetails && billGstin) doc.text(`GSTIN : ${billGstin}`, margin + 3, leftY);

    if (!isEstimate) {
      let rightY = cursorY + 10;
      doc.text(shipName, margin + tableWidth / 2 + 3, rightY); rightY += 5;
      doc.text(shipAddr, margin + tableWidth / 2 + 3, rightY); rightY += (shipAddr.length * 4.5);
      doc.text(shipPhone, margin + tableWidth / 2 + 3, rightY); rightY += 5;
      if (showGstinDetails && shipGstin) doc.text(`GSTIN : ${shipGstin}`, margin + tableWidth / 2 + 3, rightY);
    }

    // TOP TOTAL BOX
    const totalBoxX = margin + tableWidth;
    doc.rect(totalBoxX, cursorY, totalBoxWidth, sectionHeight);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("TOTAL", totalBoxX + totalBoxWidth / 2, cursorY + 8, { align: "center" });
    doc.text(invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), totalBoxX + totalBoxWidth / 2, cursorY + 16, { align: "center" });
    doc.setFontSize(10);
    doc.text(`${data.items.length} Products`, totalBoxX + totalBoxWidth / 2, cursorY + 24, { align: "center" });

    cursorY += sectionHeight + 4;

    if (data.specialInstruction) {
      const noteLines = doc.splitTextToSize(data.specialInstruction, contentWidth - 4);
      const boxH = 5 + (noteLines.length * 4) + 4;
      drawBox(cursorY, boxH);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text("Special Instructions:", startX + 2, cursorY + 4);
      doc.setFont("helvetica", "normal");
      doc.text(noteLines, startX + 2, cursorY + 9);
      cursorY += boxH + 2;
    }

    // --- DYNAMIC HEADERS (FIXES COLUMN SHIFT) ---
    const fullTaxHeaders = isIgst
      ? ['S.N.', 'Image', 'Item', 'Qty', 'Unit', priceHeader, 'Discount', ...(hasBillDiscount ? ['Bill Disc.'] : []), 'Subtotal', 'IGST %', 'IGST Amt', 'Amount']
      : ['S.N.', 'Image', 'Item', 'Qty', 'Unit', priceHeader, 'Discount', ...(hasBillDiscount ? ['Bill Disc.'] : []), 'Subtotal', 'GST %', 'GST Amt', 'Amount'];

    const noTaxHeaders = ['S.N.', 'Image', 'Item', 'Qty', 'Unit', priceHeader, 'Discount', ...(hasBillDiscount ? ['Bill Disc.'] : []), 'Amount'];

    const amountColIndexWithTax = hasBillDiscount ? 11 : 10;
    const amountColIndexNoTax = hasBillDiscount ? 8 : 7;

    const activeColumnStyles = showTaxColumns
      ? { 0: { cellWidth: 8 }, 1: { cellWidth: 15 }, 2: { cellWidth: 'auto', halign: 'left' }, [amountColIndexWithTax]: { cellWidth: 18, halign: 'right' } }
      : { 0: { cellWidth: 8 }, 1: { cellWidth: 15 }, 2: { cellWidth: 'auto', halign: 'left' }, [amountColIndexNoTax]: { cellWidth: 20, halign: 'right' } };

    autoTable(doc, {
      startY: cursorY,
      head: [showTaxColumns ? fullTaxHeaders : noTaxHeaders],
      body: tableBody,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, textColor, lineColor, lineWidth: 0.1, halign: 'center', valign: 'middle', minCellHeight: 18 },
      headStyles: { fillColor: [255, 255, 255], textColor, fontStyle: 'bold', lineWidth: 0.1, lineColor },
      // @ts-ignore
      columnStyles: activeColumnStyles as any,
      margin: { left: margin, right: margin },
      didDrawCell: (hookData) => {
        if (hookData.column.index === 1 && hookData.section === "body") {
          const item = data.items[hookData.row.index];
          const imgSize = 14;
          const x = hookData.cell.x + (hookData.cell.width - imgSize) / 2;
          const y = hookData.cell.y + (hookData.cell.height - imgSize) / 2;
          if (item?.imageBase64 && item.imageBase64.startsWith("data:image")) {
            try { doc.addImage(item.imageBase64, item.imageBase64.includes("png") ? "PNG" : "JPEG", x, y, imgSize, imgSize); }
            catch (e) { }
          }
        }
      }
    });

    // @ts-ignore
    let finalY = doc.lastAutoTable.finalY;

    if (finalY > pageHeight - 80) { doc.addPage(); finalY = margin; }
    const vBoxX = endX - 25;

    let hasExpensesAbove = false;

    if (data.extraExpenses && data.extraExpenses.length > 0) {
      hasExpensesAbove = true;
      const expH = 6 * data.extraExpenses.length;
      doc.line(startX, finalY, startX, finalY + expH);   // left
      doc.line(endX, finalY, endX, finalY + expH);       // right
      doc.line(startX, finalY, endX, finalY);            // top only (no bottom border)
      doc.line(vBoxX, finalY, vBoxX, finalY + expH);
      data.extraExpenses.forEach(exp => {
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(`Add : ${exp.name} (+)`, vBoxX - 2, finalY + 4, { align: 'right' });
        doc.text(Number(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4, { align: 'right' });
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
      names.forEach((name, idx) => {
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(`Add : ${name} (+)`, vBoxX - 2, finalY + 4, { align: 'right' });
        if (idx === names.length - 1) doc.text(Number(data.extraExpenseAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4, { align: 'right' });
        finalY += 6;
      });
    }

    // Rounded off row — skip top border if expenses row is directly above it
    doc.line(startX, finalY, startX, finalY + 6);                 // left
    doc.line(endX, finalY, endX, finalY + 6);                     // right
    if (!hasExpensesAbove) doc.line(startX, finalY, endX, finalY); // top (only if no expenses above)
    doc.line(startX, finalY + 6, endX, finalY + 6);                // bottom
    doc.line(vBoxX, finalY, vBoxX, finalY + 6);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('Add : Rounded off (+)', vBoxX - 2, finalY + 4, { align: 'right' });
    doc.text(roundOffAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), endX - 2, finalY + 4, { align: 'right' });
    finalY += 6;

    // Grand Total
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.rect(startX, finalY, contentWidth, 8);
    doc.text('Grand Total', pageWidth / 6, finalY + 5.5);
    doc.text(`${totalQty.toFixed(3)} Unit`, pageWidth / 3, finalY + 5.5);
    doc.text('Rs.', vBoxX - 7, finalY + 5.5);
    doc.rect(vBoxX, finalY, endX - vBoxX, 8);
    doc.text(invoiceTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 5.5, { align: 'right' });
    finalY += 8;

    if (advance > 0 && !isEstimate) {
      // Advance Paid row — no bottom border (so it joins visually with Balance Due below)
      doc.line(startX, finalY, startX, finalY + 6);       // left
      doc.line(endX, finalY, endX, finalY + 6);           // right
      doc.line(startX, finalY, endX, finalY);             // top
      doc.line(vBoxX, finalY, vBoxX, finalY + 6);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('Advance Paid (-)', vBoxX - 2, finalY + 4, { align: 'right' });
      doc.text(advance.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 4, { align: 'right' });
      finalY += 6;

      // Balance Due row — no top border (removes the line between the two rows)
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.line(startX, finalY, startX, finalY + 8);          // left
      doc.line(endX, finalY, endX, finalY + 8);              // right
      doc.line(startX, finalY + 8, endX, finalY + 8);        // bottom
      doc.text('Balance Due', vBoxX - 6, finalY + 5.5, { align: 'right' });
      doc.line(vBoxX, finalY, vBoxX, finalY + 8);            // amount box left divider — now matches expense/rounding off vBoxX
      doc.line(vBoxX, finalY + 8, endX, finalY + 8);         // amount box bottom
      doc.text(settledAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 }), endX - 2, finalY + 5.5, { align: 'right' });
      finalY += 8;
    }

    // TAX BREAKDOWN TABLE - Hidden if composition or exempt
    // TAX BREAKDOWN TABLE - Hidden if exempt, shown for Regular and Composition
    if (showTaxColumns && (Object.keys(taxBreakdown).length > 0 || isComposition)) {
      const taxHeaders = isIgst
        ? [['Tax Rate', 'Taxable Amt.', 'IGST %', 'IGST Amt.', 'Total Tax']]
        : [['Tax Rate', 'Taxable Amt.', 'CGST %', 'CGST Amt.', 'SGST %', 'SGST Amt.', 'Total Tax']];

      let taxBody: any[] = [];
      const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      if (isComposition) {
        // Composition Scheme: Show taxable amount, but no tax percentages/amounts
        if (isIgst) {
          taxBody.push(['-', fmt(totalTaxable), '-', '-', '-']);
          taxBody.push(['TOTAL', fmt(totalTaxable), '', '-', '-']);
        } else {
          taxBody.push(['-', fmt(totalTaxable), '-', '-', '-', '-', '-']);
          taxBody.push(['TOTAL', fmt(totalTaxable), '', '-', '', '-', '-']);
        }
      } else {
        // Regular Scheme: Standard Tax Breakdown
        taxBody = Object.keys(taxBreakdown).map(rate => {
          const d = taxBreakdown[rate];
          const halfRate = (Number(rate) / 2).toFixed(1).replace('.0', '');
          return isIgst
            ? [`${rate}%`, fmt(d.taxable), `${rate}%`, fmt(d.igst), fmt(d.igst)]
            : [`${rate}%`, fmt(d.taxable), `${halfRate}%`, fmt(d.cgst), `${halfRate}%`, fmt(d.sgst), fmt(d.cgst + d.sgst)];
        });

        if (isIgst) {
          taxBody.push(['TOTAL', fmt(totalTaxable), '', fmt(totalTaxAmt), fmt(totalTaxAmt)]);
        } else {
          taxBody.push(['TOTAL', fmt(totalTaxable), '', fmt(totalTaxAmt / 2), '', fmt(totalTaxAmt / 2), fmt(totalTaxAmt)]);
        }
      }

      autoTable(doc, {
        startY: finalY + 2, head: taxHeaders, body: taxBody, theme: 'grid',
        styles: { fontSize: 8, cellPadding: 1, textColor, lineColor, lineWidth: 0.1, halign: 'right' },
        headStyles: { fillColor: [255, 255, 255], textColor, fontStyle: 'bold', halign: 'right', lineColor, lineWidth: 0.1 },
        columnStyles: { 0: { halign: 'left' } },
        tableWidth: contentWidth * 0.65,
        margin: { left: startX },
      });
      // @ts-ignore
      finalY = Math.max(doc.lastAutoTable.finalY + 2, finalY + 25);
    }

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

    if (!isEstimate && !isExemptOrUnreg) {
      doc.rect(startX, finalY, contentWidth, 10);
      doc.setFont('helvetica', 'bold'); doc.text('BANK DETAIL :', startX + 2, finalY + 4);
      doc.line(startX + 2, finalY + 4.5, startX + 2 + doc.getTextWidth('BANK DETAIL :'), finalY + 4.5);
      doc.text(`A/C Holder Name : ${data.accountName || ''}   IFSC Code : ${data.ifscCode || ''}`, startX + 35, finalY + 4);
      doc.text(`Bank name : ${data.bankName || ''} , A/C NO. ${data.accountNumber || ''}`, startX + 35, finalY + 8);
      finalY += 10;
    }

    if (!isEstimate) {
      if (finalY + 35 > pageHeight - margin) { doc.addPage(); finalY = margin; }
      const [tW, rW, aW] = [contentWidth * 0.50, contentWidth * 0.25, contentWidth * 0.25];
      doc.rect(startX, finalY, tW, 35); doc.rect(startX + tW, finalY, rW, 35); doc.rect(startX + tW + rW, finalY, aW, 35);

      doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text('Terms & Condition', startX + 2, finalY + 4);
      doc.line(startX + 2, finalY + 5, startX + 2 + doc.getTextWidth('Terms & Condition'), finalY + 5);
      doc.setFont('helvetica', 'normal'); doc.text('E. & O. E.', startX + 2, finalY + 8);
      doc.text(doc.splitTextToSize(data.termsAndConditions || '', tW - 5), startX + 2, finalY + 12);

      doc.setFont('helvetica', 'bold'); doc.text("Receiver's Signature :", startX + tW + 2, finalY + 4);
      doc.setFontSize(7); doc.text(`for ${data.companyName}`, startX + tW + rW + (aW / 2), finalY + 4, { align: 'center' });
      if (data.signatureBase64) {
        try { doc.addImage(data.signatureBase64, 'PNG', startX + tW + rW + (aW / 2) - 17.5, finalY + 8, 35, 15); } catch (e) { }
      }
      doc.setFontSize(8); doc.text("Authorised Signatory", startX + tW + rW + (aW / 2), finalY + 33, { align: 'center' });
    }

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

  renderPage(false);

  if (withDuplicate && !isEstimate) {
    // Triplicate mode prints 2 duplicate copies (Original + 2 Duplicates = 3 total)
    const duplicateCopies = data.enableTriplicate ? 2 : 1;
    for (let i = 0; i < duplicateCopies; i++) {
      renderPage(true);
    }
  }

  if (action === "print") {
    doc.autoPrint();
    window.open(doc.output("bloburl"), "_blank");
  } else if (action === "download") {
    doc.save(`${isEstimate ? "Estimate" : "Invoice"}_${data.order.orderId}.pdf`);
  } else {
    return doc.output("blob");
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
  }

  if (amount === 0) return "Zero Only";

  let str = "";
  let n = amount;

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

  return str.trim() + " Only";
}

export const prepareCatalogueBillData = async (invoiceData: any) => {

  if (!invoiceData?.companyId) {
    console.error("Company ID is missing in prepareCatalogueBillData:", invoiceData);
    throw new Error("Company ID is required to generate the catalogue bill.");
  }

  let billSettings: any = {};

  try {
    const settingsRef = doc(
      db,
      "companies",
      invoiceData.companyId,
      "settings",
      "bill"
    );

    const settingsSnap = await getDoc(settingsRef);

    if (settingsSnap.exists()) {
      billSettings = settingsSnap.data();
    }
  } catch (err) {
    console.error("Bill settings fetch error:", err);
  }

  let salesSettings: any = {};

  try {
    const salesRef = doc(
      db,
      "companies",
      invoiceData.companyId,
      "settings",
      "catalogue-sales-settings"
    );

    const salesSnap = await getDoc(salesRef);

    if (salesSnap.exists()) {
      salesSettings = salesSnap.data();
    }
  } catch (err) {
    console.error("Sales settings fetch error:", err);
  }

  let companyData: any = {
    name: "",
    address: "",
    phone: "",
    gstType: "",
  };

  const gstTypeMap: any = {
    regular: "Regular",
    composition: "Composition",
    none: "Unregistered"
  };

  const gstTypeFromSales =
    gstTypeMap[salesSettings?.gstScheme] || "";

  if (invoiceData.companyId) {
    try {
      const businessRef = doc(
        db,
        "companies",
        invoiceData.companyId,
        "business_info",
        invoiceData.companyId
      );
      const businessSnap = await getDoc(businessRef);

      if (businessSnap.exists()) {
        const d = businessSnap.data();
        const addressParts = [
          d.streetAddress,
          d.city,
          d.state
        ].filter(Boolean);

        let fullAddress = addressParts.join(", ");

        if (d.postalCode) {
          fullAddress += ` - ${d.postalCode}`;
        }

        companyData = {
          name: d.businessName || d.name || "",
          address: fullAddress,
          phone: d.phoneNumber || d.ownerPhoneNumber || "",
          gstType: d.gstType || "",
          gstin: d.gstin || "",
          state: d.state || ""
        };
      }
    } catch (err) {
      console.error("Catalogue company fetch error:", err);
    }
  }
  let logoBase64 = invoiceData.companyLogoBase64 || "";
  if (!logoBase64 && invoiceData.companyId) {
    try {
      logoBase64 = await resolveCompanyLogoBase64(invoiceData.companyId) || "";
    } catch (err) {
      console.error("Logo fetch error:", err);
    }
  }

  const determinedPlaceOfSupply =
    invoiceData.placeOfSupply ||
    invoiceData.shippingDetails?.state ||
    invoiceData.billingDetails?.state;

  // --- STRICT MATH FIX: Calculate true post-tax total ---
  const taxType = invoiceData.taxType || salesSettings?.taxType || 'exclusive';
  const totalBillDiscount = Number(invoiceData.manualDiscount || invoiceData.billDiscount || 0);
  const sumPostDiscountAmounts = (invoiceData.items || []).reduce((sum: number, item: any) => {
    const mrp = Number(item.mrp || 0);
    const salesPrice = Number(item.salesPrice || 0);
    const actualPrice = item.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);
    return sum + (actualPrice * Number(item.quantity || 0));
  }, 0);

  let trueGrandTotal = 0;

  invoiceData.items?.forEach((item: any) => {
    const mrp = Number(item.mrp || 0);
    const salesPrice = Number(item.salesPrice || 0);

    // 👉 Pull the pure base price, NOT the tax-included customPrice
    const actualPrice = item.effectiveUnitPrice ?? item.customPrice ?? (salesPrice > 0 ? salesPrice : mrp);
    const qty = Number(item.quantity || 0);

    let rowGross = actualPrice * qty;
    let billDisc = sumPostDiscountAmounts > 0 ? (rowGross / sumPostDiscountAmounts) * totalBillDiscount : 0;
    let rowNet = rowGross - billDisc;

    let finalRowAmount = rowNet;
    const itemTaxRate = Number(item.tax ?? item.taxRate ?? 0);

    // 👉 If exclusive, add tax on top of the row net
    if (taxType === 'exclusive' && itemTaxRate > 0) {
      finalRowAmount = rowNet + (rowNet * (itemTaxRate / 100));
    }

    trueGrandTotal += finalRowAmount;
  });

  const totalExpenses = (invoiceData.expenses || invoiceData.extraExpenses || []).reduce((sum: number, e: any) => sum + (parseFloat(String(e.amount)) || 0), 0) + Number(invoiceData.extraExpenseAmount || 0);
  trueGrandTotal = Math.max(0, trueGrandTotal + totalExpenses);

  let advanceAmount = Number(invoiceData.paidAmount || invoiceData.advancePaid || invoiceData.advance || invoiceData.advanceAmount || 0);
  if (invoiceData.status === 'Paid') advanceAmount = trueGrandTotal;

  return {
    ...invoiceData,
    grandTotal: trueGrandTotal, // OVERRIDE PRE-TAX DB TOTAL
    previousBalance: invoiceData.previousBalance || 0,
    advancePaid: advanceAmount,
    billDiscount: totalBillDiscount,
    extraExpenseName: invoiceData.extraExpenseName || '',
    extraExpenseAmount: invoiceData.extraExpenseAmount || 0,
    extraExpenses: invoiceData.extraExpenses || invoiceData.expenses || [],
    transportDetails: invoiceData.transportDetails || null,
    printFormat: billSettings.cataloguePrintFormat || "A4",
    logoBase64,
    companyName: companyData.name || "",
    companyAddress: companyData.address || "",
    companyPhone: companyData.phone || "",
    companyState: companyData.state || "",
    placeOfSupply: determinedPlaceOfSupply || "",
    companyGstType: salesSettings?.gstScheme === "none" ? "" : (gstTypeFromSales || companyData.gstType || ""),
    taxType: taxType,
    companyGstin: invoiceData.companyGstin || companyData.gstin || billSettings.companyGstin || "",
    msmeNumber: invoiceData.msmeNumber || billSettings.msmeNumber || "",
    panNumber: invoiceData.panNumber || billSettings.panNumber || "",
    bankName: invoiceData.bankName || billSettings.bankName || "",
    accountName: invoiceData.accountName || billSettings.accountName || "",
    accountNumber: invoiceData.accountNumber || billSettings.accountNumber || "",
    ifscCode: invoiceData.ifscCode || billSettings.ifscCode || "",
    upiId: billSettings.upiId || companyData.upiId || "",
    termsAndConditions: billSettings.catalogueTermsAndConditions || invoiceData.termsAndConditions || "",
    signatureBase64: billSettings.signatureBase64 || "",
    enableTriplicate: billSettings.enableTriplicate || false,
    discountDisplayMode: billSettings.discountDisplayFormat || invoiceData.discountDisplayFormat || 'amount',
    enableDiscount2: salesSettings?.enableDiscount2 || false,
  };
};