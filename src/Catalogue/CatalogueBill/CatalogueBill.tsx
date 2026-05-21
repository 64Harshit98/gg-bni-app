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

  // NEW SETTINGS
  companyGstin?: string;
  msmeNumber?: string;
  panNumber?: string;

  bankName?: string;
  accountName?: string;
  accountNumber?: string;
  ifscCode?: string;
  termsAndConditions?: string;
  signatureBase64?: string;
  taxType?: 'inclusive' | 'exclusive';
  upiId?: string;
  customer: {
    billing: {
      name: string;
      phone: string;
      address?: string;
      gstin?: string;
    };
    shipping: {
      name: string;
      phone: string;
      address?: string;
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
  }[];
  specialInstruction?: string
  grandTotal: number;
  advancePaid?: number;
  previousBalance?: number;
}

export const CatalogueBill = async (
  data: CatalogueInvoiceData,
  action: "download" | "print" | "blob" = "download"
): Promise<Blob | void> => {

  if ((data as any).printFormat === "A5") {

    const a5Data = {
      companyName: data.companyName,
      companyAddress: data.companyAddress || "",
      companyContact: data.companyPhone || "",
      isEstimate: data.isEstimate === true,
      companyGstType: data.companyGstType,
      taxType: data.taxType,

      billTo: {
        name:
          data.customer?.billing?.name ||
          data.customer?.shipping?.name ||
          "",

        address:
          data.customer?.billing?.address ||
          data.customer?.shipping?.address ||
          "",

        phone:
          data.customer?.billing?.phone ||
          data.customer?.shipping?.phone ||
          "",

        email: "",

        gstin:
          data.customer?.billing?.gstin ||
          data.customer?.shipping?.gstin ||
          ""
      },

      shipTo: {
        name:
          data.customer?.shipping?.name ||
          data.customer?.billing?.name ||
          "",

        address:
          data.customer?.shipping?.address ||
          data.customer?.billing?.address ||
          "",

        phone:
          data.customer?.shipping?.phone ||
          data.customer?.billing?.phone ||
          "",

        gstin:
          data.customer?.shipping?.gstin ||
          data.customer?.billing?.gstin ||
          ""
      },

      invoice: {
        number: data.order?.orderId || "",
        date: data.order?.date || ""
      },

      items: data.items.map((item: any, index: number) => {
        const qty = item.qty || 0;

        // Trust exact DB schema
        let mrp = Number(item.mrp || item.price || item.salesPrice || 0);
        const rawPrice = item.salesPrice || item.price || mrp;
        const taxPercent = item.tax ?? item.gst ?? item.taxRate ?? 0;

        const safeScheme = (data.companyGstType || '').toUpperCase();
        const safeTaxType = (data.taxType || '').toUpperCase();

        // Enable tax if Composition OR (Regular but NOT Exempt/None)
        const isTaxEnabled = safeScheme === "REGULAR" && safeTaxType !== "EXEMPT" && safeTaxType !== "NONE";
        const effectiveTaxRate = isTaxEnabled ? taxPercent : 0;

        let subtotal = 0;
        let gstAmount = 0;
        let finalRowTotal = 0;

        // RESTORED: Proper Inclusive vs Exclusive math
        if (effectiveTaxRate === 0) {
          subtotal = rawPrice * qty;
          gstAmount = 0;
          finalRowTotal = subtotal;
        } else if (data.taxType === 'inclusive') {
          finalRowTotal = rawPrice * qty;
          subtotal = finalRowTotal / (1 + (effectiveTaxRate / 100));
          gstAmount = finalRowTotal - subtotal;
        } else {
          // EXCLUSIVE
          subtotal = rawPrice * qty;
          gstAmount = subtotal * (effectiveTaxRate / 100);
          finalRowTotal = subtotal + gstAmount;
        }

        // Fix for negative discount (Markup)
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
          unit: "Pcs",
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
      finalAction
    );
  }

  const isEstimate = data.isEstimate === true;
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;

  let qrBase64: string | null = null;
  if (data.upiId && !isEstimate) {
    const upiString = `upi://pay?pa=${data.upiId}&pn=${encodeURIComponent(data.companyName)}&cu=INR`;
    try {
      // Need top-level await or a quick async resolution
      qrBase64 = await QRCode.toDataURL(upiString, { width: 80, margin: 0 });
    } catch (err) {
      console.error("Failed to generate QR code", err);
    }
  }

  // ================= FORMATTERS =================
  const formatAmount = (num: number) => {
    const validNum = Number(num) || 0;
    return validNum.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };
  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return "";

    const currentYear = new Date().getFullYear().toString().slice(-2);

    // agar already year hai to same return karo
    if (/\d{2}\/\d{2}\/\d{2}/.test(dateStr)) {
      return dateStr;
    }

    // format: 10/03, 05:02 pm -> 10/03/26 05:02 pm
    const parts = dateStr.split(",");

    const datePart = parts[0].trim();
    const timePart = parts[1]?.trim() || "";

    return `${datePart}/${currentYear}, ${timePart}`;
  };

  // ================= HEADER =================
  const drawHeader = () => {
    let cursorY = margin;
    const safeMaxWidth = pageWidth - (margin * 2) - 50; // Keep text from hitting QR/Logo

    // ===== 1. GENERATED TIMESTAMP (Top Right) =====
    const y = margin - 2;
    const now = new Date();
    const generatedAt = now.toLocaleString('en-IN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(`Bill generated on ${generatedAt}`, pageWidth - margin, y, { align: "right" });

    if (isEstimate) {
      // ONLY print "ESTIMATE" perfectly centered
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('ESTIMATE', pageWidth / 2, cursorY + 12, { align: 'center' });
      cursorY += 20;
    } else {
      // --- NORMAL INVOICE HEADER ---

      // ===== 2. QR CODE (Left) =====
      if (qrBase64) {
        doc.addImage(qrBase64, 'PNG', margin + 2, cursorY + 2, 18, 18);
        doc.setFontSize(6);
        doc.setFont('helvetica', 'normal');
        doc.text('Scan to Pay', margin + 11, cursorY + 22, { align: 'center' });
      }

      // ===== 3. DOCUMENT TITLE (Center) =====
      const safeScheme = (data.companyGstType || '').toUpperCase();
      const safeTaxType = (data.taxType || '').toUpperCase();

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const title = (safeScheme === 'COMPOSITION' || safeScheme === 'UNREGISTERED' || safeScheme === 'NONE' || safeTaxType === 'NONE' || safeTaxType === 'EXEMPT')
        ? 'BILL OF SUPPLY'
        : 'TAX INVOICE';
      doc.text(title, pageWidth / 2, cursorY + 5, { align: 'center' });

      // ===== 4. MSME NUMBER (Right) =====
      if (data.msmeNumber) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(`Msme No ${data.msmeNumber}`, pageWidth - margin - 2, cursorY + 5, { align: 'right' });
      }

      // ===== 5. LOGO (Right) =====
      const logoW = 18;
      const logoH = 14;
      const logoX = pageWidth - margin - logoW - 2;
      const logoY = cursorY + 7;

      if (data.logoBase64 && data.logoBase64.startsWith("data:image")) {
        try {
          const mimeMatch = data.logoBase64.match(/data:image\/([a-zA-Z0-9]+);base64/);
          let format = "JPEG";
          if (mimeMatch && mimeMatch[1]) {
            const type = mimeMatch[1].toUpperCase();
            if (type === "PNG") format = "PNG";
            else if (type === "WEBP") format = "WEBP";
            else if (type === "JPEG" || type === "JPG") format = "JPEG";
          }
          doc.addImage(data.logoBase64, format, logoX, logoY, logoW, logoH);
        } catch (e) {
          console.error("jsPDF Logo render error:", e);
        }
      }

      // ===== 6. COMPANY DETAILS (Center) =====
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text((data.companyName || "COMPANY NAME").toUpperCase(), pageWidth / 2, cursorY + 11, { align: "center", maxWidth: safeMaxWidth });

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const addressLines = doc.splitTextToSize(data.companyAddress || "", safeMaxWidth);
      doc.text(addressLines, pageWidth / 2, cursorY + 16, { align: "center" });

      const phoneY = cursorY + 16 + (addressLines.length * 4);
      doc.text(`Phone : ${data.companyPhone || ""}`, pageWidth / 2, phoneY, { align: "center" });

      let nextY = phoneY + 4;

      const showGstinDetails = safeScheme !== 'UNREGISTERED' && safeScheme !== 'NONE' && safeScheme !== '' && safeTaxType !== 'EXEMPT' && safeTaxType !== 'NONE';

      if (showGstinDetails) {
        doc.setFont('helvetica', 'bold');
        let gstText = `GSTIN : ${data.companyGstin || ''}  (${data.companyGstType || ''})`;
        doc.text(gstText, pageWidth / 2, nextY, { align: "center" });
        doc.setFont('helvetica', 'normal');
        nextY += 4;
      }

      // Ensure cursor clears whichever is taller: the center text or the QR/Logo
      cursorY = Math.max(cursorY + 25, nextY);
    }

    doc.setDrawColor(0);
    doc.setLineWidth(0.6);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);

    return cursorY + 5;
  };

  let cursorY = drawHeader();

  // ===== META INFO (Invoice row like main invoice) =====

  const metaY = cursorY + 2;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  // usable width
  const usableWidth = pageWidth - (margin * 2);

  // 4 equal columns
  const colWidth = usableWidth / 3;

  const col1X = margin;
  const col2X = margin + colWidth;
  const col3X = margin + (colWidth * 2);


  // draw text
  doc.text(
    `Invoice No : ${data.order.orderId || ""}`,
    col1X,
    metaY
  );

  doc.text(
    `Date : ${formatDateTime(data.order.date)}`,
    col2X,
    metaY
  );
  // place of supply
  const posVal = data.customer.shipping?.address || "";

  // max width of third column
  const posMaxWidth = colWidth - 4;

  // wrap text
  const posLines = doc.splitTextToSize(
    `Place of Supply : ${posVal}`,
    posMaxWidth
  );

  // draw wrapped text
  doc.text(
    posLines,
    col3X,
    metaY
  );

  // bottom border
  doc.setLineWidth(0.4);
  doc.line(
    margin,
    metaY + 6,
    pageWidth - margin,
    metaY + 6
  );

  cursorY = metaY + 8;

  // ===== PRODUCT COUNT =====
  const totalProducts = data.items.reduce(
    (sum, item) => sum + (item.qty || 0),
    0
  );

  // ================= BILL / SHIP + TOTAL ROW =================

  const sectionStartY = cursorY + 4;
  const sectionHeight = 32;

  const totalBoxWidth = 35;

  // FULL WIDTH SAME AS PRODUCT TABLE
  const fullWidth = pageWidth - (margin * 2);

  // left table width
  const tableWidth = fullWidth - totalBoxWidth;

  // outer border
  doc.rect(margin, sectionStartY, tableWidth, sectionHeight);

  // middle divider
  doc.line(
    margin + tableWidth / 2,
    sectionStartY,
    margin + tableWidth / 2,
    sectionStartY + sectionHeight
  );

  // headers
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);

  doc.text(
    isEstimate ? "Estimate For :" : "Billed To :",
    margin + 3,
    sectionStartY + 6
  );

  if (!isEstimate) {
    doc.text(
      "Shipped To :",
      margin + tableWidth / 2 + 3,
      sectionStartY + 6
    );
  }

  // values
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);

  let textY = sectionStartY + 12;

  const billX = margin + 3;
  const shipX = margin + tableWidth / 2 + 3;

  // name
  if (isEstimate) {
    doc.text(data.customer.shipping?.name || "", billX, textY);
  } else {
    doc.text(data.customer.billing?.name || "", billX, textY);
    doc.text(data.customer.shipping?.name || "", shipX, textY);
  }

  textY += 4;

  // address
  if (isEstimate) {
    const shippingAddrLines = doc.splitTextToSize(
      data.customer.shipping?.address || "",
      tableWidth - 6
    );

    doc.text(shippingAddrLines, billX, textY);
    textY += shippingAddrLines.length * 4;
  } else {
    const billingAddrLines = doc.splitTextToSize(
      data.customer.billing?.address || "",
      tableWidth / 2 - 6
    );

    const shippingAddrLines = doc.splitTextToSize(
      data.customer.shipping?.address || "",
      tableWidth / 2 - 6
    );

    doc.text(billingAddrLines, billX, textY);
    doc.text(shippingAddrLines, shipX, textY);

    textY += Math.max(
      billingAddrLines.length,
      shippingAddrLines.length
    ) * 5;
  }

  // phone
  if (isEstimate) {
    doc.text(`Phone : ${data.customer.shipping?.phone || ""}`, billX, textY);
  } else {
    doc.text(`Phone : ${data.customer.billing?.phone || ""}`, billX, textY);
    doc.text(`Phone : ${data.customer.shipping?.phone || ""}`, shipX, textY);

    const safeScheme = (data.companyGstType || '').toUpperCase();
    const safeTaxType = (data.taxType || '').toUpperCase();
    const showGstinDetails = !isEstimate && safeScheme !== 'UNREGISTERED' && safeScheme !== 'NONE' && safeScheme !== '' && safeTaxType !== 'EXEMPT' && safeTaxType !== 'NONE';

    // GSTIN only for real bill AND if the company is registered
    if (showGstinDetails && data.customer.billing?.gstin) {
      doc.text(`GSTIN : ${data.customer.billing.gstin}`, billX, textY + 5);
    }

    if (showGstinDetails && data.customer.shipping?.gstin) {
      doc.text(`GSTIN : ${data.customer.shipping.gstin}`, shipX, textY + 5);
    }
  }

  // ================= PRE-CALCULATE EXACT GRAND TOTAL =================
  const precalcSafeScheme = (data.companyGstType || '').toUpperCase();
  const precalcSafeTaxType = (data.taxType || '').toUpperCase();

  // FIX: Unique variable name, and enforces that Composition/Exempt = 0% tax
  const isPrecalcTaxEnabled = precalcSafeScheme === "REGULAR" && precalcSafeTaxType !== "EXEMPT" && precalcSafeTaxType !== "NONE";

  let preCalculatedGrandTotal = 0;

  data.items.forEach((item: any) => {
    const qty = Number(item.qty) || 0;
    let mrp = Number(item.mrp || item.price || item.salesPrice || 0);
    const rawPrice = Number(item.salesPrice || item.price || mrp);
    const taxPercent = Number(item.tax ?? item.gst ?? item.taxRate ?? 0);
    const effectiveTaxRate = (isEstimate || !isPrecalcTaxEnabled) ? 0 : taxPercent;

    if (effectiveTaxRate === 0 || data.taxType?.toLowerCase() === 'inclusive') {
      preCalculatedGrandTotal += rawPrice * qty;
    } else {
      // EXCLUSIVE MATH
      const subtotal = rawPrice * qty;
      preCalculatedGrandTotal += subtotal + (subtotal * (effectiveTaxRate / 100));
    }
  });

  const finalTotalAmountToPrint = preCalculatedGrandTotal;

  // ================= TOTAL BOX =================

  const totalBoxX = margin + tableWidth;
  const totalBoxY = sectionStartY;

  doc.setDrawColor(0, 0, 0);
  doc.rect(totalBoxX, totalBoxY, totalBoxWidth, sectionHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);

  doc.text(
    `TOTAL`,
    totalBoxX + totalBoxWidth / 2,
    totalBoxY + 8,
    { align: "center" }
  );

  // FIX: Use the mathematically correct total instead of the raw DB total
  doc.text(
    formatAmount(finalTotalAmountToPrint),
    totalBoxX + totalBoxWidth / 2,
    totalBoxY + 16,
    { align: "center" }
  );

  doc.setFontSize(10);

  doc.text(
    `${totalProducts} Products`,
    totalBoxX + totalBoxWidth / 2,
    totalBoxY + 24,
    { align: "center" }
  );

  cursorY = sectionStartY + sectionHeight + 6;

  // SPECIAL INSTRUCTION ABOVE TABLE (FOR BOTH BILL + ESTIMATE)

  if (data.specialInstruction) {

    const boxPadding = 3;

    const heading = "Special Instructions:";

    const noteLines = doc.splitTextToSize(
      data.specialInstruction,
      pageWidth - (margin * 2) - (boxPadding * 2)
    );

    const lineHeight = 4;
    const headingHeight = 5;

    const boxHeight =
      headingHeight +
      (noteLines.length * lineHeight) +
      (boxPadding * 2);

    // box (top gap kam)
    doc.rect(
      margin,
      cursorY - 2,
      pageWidth - (margin * 2),
      boxHeight
    );

    // heading (bold + bigger)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(
      heading,
      margin + boxPadding,
      cursorY + boxPadding
    );

    // text (with bottom padding fix)
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      noteLines,
      margin + boxPadding,
      cursorY + boxPadding + headingHeight
    );

    cursorY += boxHeight + 3;
  }

  // ================= TABLE DATA =================
  const safeScheme = (data.companyGstType || '').toUpperCase();
  const safeTaxType = (data.taxType || '').toUpperCase();

  // Tax is enabled if Composition OR (Regular but NOT Exempt/None)
  const isTaxEnabled = safeScheme === "REGULAR" && safeTaxType !== "EXEMPT" && safeTaxType !== "NONE";
  const showMrpColumn =
    data.items.length === 1
      ? Number((data.items[0] as any)?.mrp || 0) > 0
      : !data.items.some((item: any) => Number(item.mrp || 0) === 0);

  let calculatedGrandTotal = 0;

  const body = data.items.map((item: any) => {
    const totalPcs = item.qty * (item.unitMultiplier ?? 1);
    const qty = item.qty || 0;

    let mrp = Number(item.mrp || item.price || item.salesPrice || 0);
    const rawPrice = item.salesPrice || item.price || mrp;
    const taxPercent = item.tax ?? item.gst ?? item.taxRate ?? 0;

    const effectiveTaxRate = isTaxEnabled ? taxPercent : 0;
    let subtotal = 0;
    let gstAmount = 0;
    let finalRowTotal = 0;

    // RESTORED: Proper Inclusive vs Exclusive math
    if (effectiveTaxRate === 0) {
      subtotal = rawPrice * qty;
      gstAmount = 0;
      finalRowTotal = subtotal;
    } else if (data.taxType === 'inclusive') {
      finalRowTotal = rawPrice * qty;
      subtotal = finalRowTotal / (1 + (effectiveTaxRate / 100));
      gstAmount = finalRowTotal - subtotal;
    } else {
      // EXCLUSIVE
      subtotal = rawPrice * qty;
      gstAmount = subtotal * (effectiveTaxRate / 100);
      finalRowTotal = subtotal + gstAmount;
    }

    // Fix for negative discount (Markup)
    let discountAmt = (mrp * qty) - (rawPrice * qty);
    if (discountAmt < 0) {
      discountAmt = 0;
      mrp = rawPrice;
    }

    calculatedGrandTotal += finalRowTotal;

    return isEstimate
      ? (
        showMrpColumn
          ? [
            item.sno,
            "",
            `${item.name}\n(${totalPcs} pcs)`,
            qty,
            formatAmount(mrp),
            formatAmount(rawPrice),
            formatAmount(finalRowTotal),
          ]
          : [
            item.sno,
            "",
            `${item.name}\n(${totalPcs} pcs)`,
            qty,
            formatAmount(rawPrice),
            formatAmount(finalRowTotal),
          ]
      )
      : (
        showMrpColumn
          ? [
            item.sno,
            "",
            `${item.name}\n(${totalPcs} pcs)`,
            qty,
            effectiveTaxRate,
            formatAmount(mrp),
            formatAmount(rawPrice),
            formatAmount(subtotal),
            formatAmount(gstAmount),
            formatAmount(finalRowTotal),
          ]
          : [
            item.sno,
            "",
            `${item.name}\n(${totalPcs} pcs)`,
            qty,
            effectiveTaxRate,
            formatAmount(rawPrice),
            formatAmount(subtotal),
            formatAmount(gstAmount),
            formatAmount(finalRowTotal),
          ]
      );
  });

  const foot: any[] = [];

  const drawBrandingFooter = () => {

    const brandingHeight = 15;
    const brandingY = pageHeight - brandingHeight;

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");

    const pbText = "Powered by ";
    const linkText = "SELLAR.IN";

    const pbWidth = doc.getTextWidth(pbText);
    const linkWidth = doc.getTextWidth(linkText);

    let brandingX = (pageWidth / 2) - ((pbWidth + linkWidth) / 2);

    // Powered by
    doc.setTextColor(0, 0, 0);
    doc.text(pbText, brandingX, brandingY + 5);
    brandingX += pbWidth;

    // SELLAR.IN
    const linkColor: [number, number, number] = [0, 102, 204];

    doc.setTextColor(...linkColor);
    doc.text(linkText, brandingX, brandingY + 5);

    doc.setDrawColor(...linkColor);
    doc.setLineWidth(0.1);
    doc.line(brandingX, brandingY + 5.5, brandingX + linkWidth, brandingY + 5.5);

    doc.link(brandingX, brandingY + 2, linkWidth, 4, {
      url: "https://www.sellar.in",
    });

    doc.setTextColor(0, 0, 0);

    // Made with pride
    doc.setFont("helvetica", "normal");

    const part1 = "Made with ";
    const part2 = "pride";
    const part3 = " in India";

    const w1 = doc.getTextWidth(part1);
    const w2 = doc.getTextWidth(part2);
    const w3 = doc.getTextWidth(part3);

    const total = w1 + w2 + w3;

    let x = (pageWidth / 2) - (total / 2);
    const y = brandingY + 10;

    doc.text(part1, x, y);
    x += w1;

    doc.setTextColor(0, 0, 0);
    doc.text(part2, x, y);
    x += w2;

    doc.setTextColor(0, 0, 0);
    doc.text(part3, x, y);

    doc.setTextColor(0, 0, 0);
  };

  // ================= TABLE =================
  autoTable(doc, {
    startY: cursorY,
    head: isEstimate
      ? [
        showMrpColumn
          ? ["No", "Product", "Item", "Qty", "MRP", "Price", "Total"]
          : ["No", "Product", "Item", "Qty", "Price", "Total"]
      ]
      : [
        showMrpColumn
          ? ["No", "Product", "Item", "Qty", "GST%", "MRP", "Price", "SubTotal", "GSTAmt", "Total"]
          : ["No", "Product", "Item", "Qty", "GST%", "Price", "SubTotal", "GSTAmt", "Total"]
      ],
    body,
    foot,
    showFoot: "never",
    margin: { left: margin, right: margin },
    theme: "grid",

    headStyles: {
      fillColor: false,
      textColor: [0, 0, 0],
    },

    footStyles: {
      fontStyle: "bold",
      halign: "center",
      fillColor: false,
      textColor: [0, 0, 0]
    },

    styles: {
      fontSize: 8,
      cellPadding: 4,
      valign: "middle",
      minCellHeight: 20,
      lineColor: [0, 0, 0],
      lineWidth: 0.2
    },

    columnStyles: isEstimate
      ? {
        0: { cellWidth: 12, halign: "center" },
        1: { cellWidth: 22 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 14, halign: "center" },
        4: { cellWidth: 24, halign: "center" },
        5: { cellWidth: 24, halign: "center" },
        6: { cellWidth: 24, halign: "center", fontStyle: "bold" },
      }
      : {
        0: { cellWidth: 12, halign: "center" },   // No
        1: { cellWidth: 20 },                     // Image
        2: { cellWidth: "auto" },                 // Item (MOST IMPORTANT)
        3: { cellWidth: 16, halign: "center" },   // Qty
        4: { cellWidth: 16, halign: "center" },   // GST%
        5: { cellWidth: 18, halign: "center" },   // MRP
        6: { cellWidth: 22, halign: "center" },   // SalePrice
        7: { cellWidth: 22, halign: "center" },   // Subtotal
        8: { cellWidth: 20, halign: "center" },   // GST
        9: { cellWidth: 22, halign: "center", fontStyle: "bold" }, // Total
      },

    didDrawCell: (hookData) => {
      const colIndex = hookData.column.index;

      // ===== PRODUCT IMAGE =====
      if (colIndex === 1 && hookData.section === "body") {
        const item = data.items[hookData.row.index];

        const imgSize = 16;

        const x =
          hookData.cell.x +
          (hookData.cell.width - imgSize) / 2;

        const y =
          hookData.cell.y +
          (hookData.cell.height - imgSize) / 2;

        if (item?.imageBase64 && item.imageBase64.startsWith("data:image")) {
          try {
            const format = item.imageBase64.includes("png")
              ? "PNG"
              : "JPEG";

            doc.addImage(
              item.imageBase64,
              format,
              x,
              y,
              imgSize,
              imgSize
            );
          } catch (e) {
            console.error("Image error", e);
          }
        } else {
          // fallback placeholder
          doc.setDrawColor(200);
          doc.rect(x, y, imgSize, imgSize);

          doc.setFontSize(6);
          doc.text(
            "No Image",
            x + imgSize / 2,
            y + imgSize / 2,
            { align: "center" }
          );
        }
      }
    },

    didDrawPage: (data) => {
      if (data.pageNumber === 1) {
        drawHeader();
      }
      drawBrandingFooter();
    },
  });

  // table end position
  // @ts-ignore
  // @ts-ignore
  if (!isEstimate) {
    let finalY = (doc as any).lastAutoTable.finalY;

    const advancePaid = (data as any).advancePaid || 0;
    const previousBalance = Number((data as any).previousBalance) || 0;

    // Calculate the grand total after deducting advance
    const grandTotalAfterAdvance = finalTotalAmountToPrint - advancePaid;

    const currentDue = grandTotalAfterAdvance;
    const totalDue = previousBalance + currentDue;
    const hasPrevOrDue = previousBalance > 0 || currentDue > 0;

    const valueBoxW = 30;
    const valueBoxX = (pageWidth - margin) - valueBoxW;

    // ── Advance Paid row BEFORE Grand Total ──
    if (advancePaid > 0) {
      const advH = 6;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.rect(margin, finalY, pageWidth - margin * 2, advH);
      doc.line(valueBoxX, finalY, valueBoxX, finalY + advH);
      doc.text('Advance Paid (-)', valueBoxX - 2, finalY + 4, { align: 'right' });
      doc.text(formatAmount(advancePaid), pageWidth - margin - 2, finalY + 4, { align: 'right' });
      finalY += advH;
    }

    // ── Grand Total Row (shows amount after advance deduction) ──
    const grandTotalH = 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.rect(margin, finalY, pageWidth - margin * 2, grandTotalH);
    doc.rect(valueBoxX, finalY, valueBoxW, grandTotalH);
    doc.text('Grand Total', margin + (pageWidth - margin * 2) / 6, finalY + 5.5);
    doc.text('Rs.', valueBoxX - 5, finalY + 5.5, { align: 'right' });
    doc.text(formatAmount(grandTotalAfterAdvance), pageWidth - margin - 2, finalY + 5.5, { align: 'right' });
    finalY += grandTotalH + 4;
    const wordsH = 12;
    const bankH = 12;
    const footerH = 32;

    // check if enough space for footer
    const footerHeight = wordsH + bankH + footerH + 20;

    if (finalY + footerHeight > pageHeight - 15) {
      doc.addPage();
      finalY = margin;
    }

    const wordsText = `Amount in Words : ${convertNumberToWords(Math.round(grandTotalAfterAdvance))}`;
    const rightColW = 70;
    const leftColW = pageWidth - margin * 2 - rightColW;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const wordsLines = doc.splitTextToSize(wordsText, leftColW - 4);

    // ── Amount in Words + Previous Balance / Balance Due ──
    const wordsRowH = hasPrevOrDue ? 12 : 8;
    const dividerX = (pageWidth - margin) - rightColW;
    const rightEndX = pageWidth - margin - 2;

    doc.rect(margin, finalY, pageWidth - margin * 2, wordsRowH);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(wordsLines, margin + 2, finalY + (hasPrevOrDue ? 7 : 5.5));

    if (hasPrevOrDue) {
      doc.line(dividerX, finalY, dividerX, finalY + wordsRowH);
      doc.line(dividerX, finalY + 6, pageWidth - margin, finalY + 6);

      doc.setFont("helvetica", "normal");
      doc.text('Previous Balance :', dividerX + 2, finalY + 4.5);
      doc.text(formatAmount(previousBalance), rightEndX, finalY + 4.5, { align: 'right' });

      doc.setFont("helvetica", "bold");
      doc.text('Balance Due :', dividerX + 2, finalY + 10);
      doc.text(formatAmount(totalDue), rightEndX, finalY + 10, { align: 'right' });
    }

    finalY += wordsRowH;

    doc.rect(margin, finalY, pageWidth - margin * 2, bankH);

    doc.setFont("helvetica", "bold");
    doc.text("BANK DETAIL :", margin + 3, finalY + 4);

    const bdWidth = doc.getTextWidth("BANK DETAIL :");

    doc.line(
      margin + 3,
      finalY + 4.5,
      margin + 3 + bdWidth,
      finalY + 4.5
    );

    doc.setFont("helvetica", "normal");

    // ===== 2 COLUMN LAYOUT =====
    const contentStartX = margin + 35;
    const contentWidth = pageWidth - margin * 2 - 40;

    // split into 2 columns
    const leftColWidth = contentWidth * 0.6;
    const rightColWidth = contentWidth * 0.4;

    // LEFT → Bank + A/C No
    const leftText = [
      `Bank : ${data.bankName || ""}`,
      `A/C No : ${data.accountNumber || ""}`,
    ].join("\n");

    const leftLines = doc.splitTextToSize(leftText, leftColWidth);

    // RIGHT → IFSC
    const rightText = `IFSC : ${data.ifscCode || ""}`;
    const rightLines = doc.splitTextToSize(rightText, rightColWidth);

    // draw LEFT
    doc.text(
      leftLines,
      contentStartX,
      finalY + 4
    );

    // draw RIGHT
    doc.text(
      rightLines,
      contentStartX + leftColWidth + 5,
      finalY + 4
    );

    finalY += bankH;

    const termsWidth = (pageWidth - margin * 2) * 0.5;
    const receiverWidth = (pageWidth - margin * 2) * 0.25;
    const authWidth = (pageWidth - margin * 2) * 0.25;
    const termsX = margin;
    const receiverX = margin + termsWidth;
    const authX = margin + termsWidth + receiverWidth;
    doc.rect(termsX, finalY, termsWidth, footerH);
    doc.rect(receiverX, finalY, receiverWidth, footerH);
    doc.rect(authX, finalY, authWidth, footerH);

    let termY = finalY + 4;

    doc.setFont("helvetica", "bold");

    doc.text(
      "Terms & Conditions",
      termsX + 3,
      termY
    );

    termY += 6;

    doc.setFont("helvetica", "normal");

    const terms = doc.splitTextToSize(
      data.termsAndConditions || "",
      termsWidth - 6
    );

    doc.text(
      terms,
      termsX + 3,
      termY
    );

    // line height adjust automatically
    termY += terms.length * 4;

    doc.setFont("helvetica", "bold");

    doc.text(
      "Receiver's Signature :",
      receiverX + 3,
      finalY + 5
    );

    doc.text(
      `For ${data.companyName}`,
      authX + 5,
      finalY + 6
    );

    if (data.signatureBase64) {
      try {
        doc.addImage(
          data.signatureBase64,
          "PNG",
          authX + 5,
          finalY + 10,
          35,
          12
        );
      } catch (e) {
        console.error("Signature error", e);
      }
    }

    doc.text(
      "Authorised Signatory",
      authX + 5,
      finalY + footerH - 4
    );
  }

  //  BRANDING FOOTER
  if (!isEstimate) {
    const brandingHeight = 15;
    const brandingY = pageHeight - brandingHeight;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');

    // --- Split text to link and underline "SELLAR.IN" ---
    const pbText = 'Powered by ';
    const linkText = 'SELLAR.IN';

    const pbWidth = doc.getTextWidth(pbText);
    const linkWidth = doc.getTextWidth(linkText);

    // Calculate Start X to center the combined text
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

    // "Made with pride in India" logic (Unchanged)
    doc.setFont('helvetica', 'normal');
    const part1 = "Made with ";
    const part2 = "pride";
    const part3 = " in India";

    const part1Width = doc.getTextWidth(part1);
    const part2Width = doc.getTextWidth(part2);
    const part3Width = doc.getTextWidth(part3);

    const totalWidth = part1Width + part2Width + part3Width;
    let currentX = (pageWidth / 2) - (totalWidth / 2);
    const textZ = brandingY + 10;

    doc.text(part1, currentX, textZ);
    currentX += part1Width;
    doc.setTextColor(255, 0, 0);
    doc.text(part2, currentX, textZ);
    currentX += part2Width;
    doc.setTextColor(0, 0, 139);
    doc.text(part3, currentX, textZ);
  }
  doc.setTextColor(0, 0, 0);

  // ================= OUTPUT =================
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

  // GST Scheme mapping from sales settings
  const gstTypeMap: any = {
    regular: "Regular",
    composition: "Composition",
    none: "Unregistered"
  };

  const gstTypeFromSales =
    gstTypeMap[salesSettings?.gstScheme] || "";

  //  SAME PATTERN as invoice
  if (invoiceData.companyId) {
    //  FIRST try business_info (your real source)
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
          gstin: d.gstin || ""
        };
      } else {
        //  fallback to company root (safe)
        const companyDoc = await getDoc(
          doc(db, "companies", invoiceData.companyId)
        );

        if (companyDoc.exists()) {
          const d = companyDoc.data();
          companyData = {
            name: d.name || "",
            address: d.address || "",
            phone: d.phone || "",
          };
        }
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

  return {
    ...invoiceData,
    previousBalance: invoiceData.previousBalance || 0,
    advancePaid: invoiceData.advancePaid || invoiceData.advance || invoiceData.advanceAmount || 0,
    printFormat: billSettings.printFormat || "A4",
    logoBase64,

    companyName: companyData.name || "",
    companyAddress: companyData.address || "",
    companyPhone: companyData.phone || "",
    companyGstType: salesSettings?.gstScheme === "none"
      ? ""
      : (gstTypeFromSales || companyData.gstType || ""),
    taxType: salesSettings?.taxType || 'exclusive',
    // BILL SETTINGS
    companyGstin:
      invoiceData.companyGstin ||
      companyData.gstin ||
      billSettings.companyGstin ||
      "",

    msmeNumber:
      invoiceData.msmeNumber ||
      billSettings.msmeNumber ||
      "",

    panNumber:
      invoiceData.panNumber ||
      billSettings.panNumber ||
      "",

    bankName:
      invoiceData.bankName ||
      billSettings.bankName ||
      "",

    accountName:
      invoiceData.accountName ||
      billSettings.accountName ||
      "",

    accountNumber:
      invoiceData.accountNumber ||
      billSettings.accountNumber ||
      "",

    ifscCode:
      invoiceData.ifscCode ||
      billSettings.ifscCode ||
      "",
    upiId: billSettings.upiId || companyData.upiId || "",
    termsAndConditions: billSettings.termsAndConditions || "",
    signatureBase64: billSettings.signatureBase64 || ""
  };
};