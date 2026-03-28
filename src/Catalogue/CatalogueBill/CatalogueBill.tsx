import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/Firebase";

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
}

export const CatalogueBill = async (
  data: CatalogueInvoiceData,
  action: "download" | "print" | "blob" = "download"
): Promise<Blob | void> => {

  const isEstimate = data.isEstimate === true;
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;

  // ================= FORMATTERS =================
  const formatAmount = (num: number) =>
    `${num.toLocaleString("en-IN")}`;

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
    const y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);

    doc.text(
      isEstimate
        ? "ESTIMATE"
        : (data.companyName || "COMPANY NAME").toUpperCase(),
      pageWidth / 2,
      y + 5,
      { align: "center" }
    );

    let dividerY = y + 10; // default for estimate

    if (!isEstimate) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      const addressLines = doc.splitTextToSize(
        data.companyAddress || "",
        pageWidth - 40
      );

      doc.text(addressLines, pageWidth / 2, y + 11, { align: "center" });

      const phoneY = y + 11 + (addressLines.length * 4);

      doc.text(data.companyPhone || "", pageWidth / 2, phoneY, { align: "center" });

      let nextY = phoneY + 4;

      // GST TYPE
      if (data.companyGstType && data.companyGstType.trim() !== "") {

        let gstText = data.companyGstType;

        // sirf tab add karna jab Regular ho
        if (data.companyGstType === "Regular" && data.taxType) {
          const taxLabel =
            data.taxType === "inclusive" ? "Inclusive" : "Exclusive";

          gstText += ` (${taxLabel})`;
        }

        doc.text(`GST Type: ${gstText}`, pageWidth / 2, nextY, { align: "center" });
        nextY += 4;
      }

      // GSTIN ONLY FOR INVOICE (NOT ESTIMATE)
      if (!isEstimate && data.companyGstin) {
        doc.text(`GSTIN: ${data.companyGstin}`, pageWidth / 2, nextY, { align: "center" });
        nextY += 4;
      }

      dividerY = nextY;
    }

    doc.setDrawColor(0);
    doc.setLineWidth(0.6);
    doc.line(margin, dividerY, pageWidth - margin, dividerY);

    return dividerY + 7;
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

    // GSTIN only for real bill
    if (data.customer.billing?.gstin) {
      doc.text(`GSTIN : ${data.customer.billing.gstin}`, billX, textY + 5);
    }

    if (data.customer.shipping?.gstin) {
      doc.text(`GSTIN : ${data.customer.shipping.gstin}`, shipX, textY + 5);
    }
  }

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

  doc.text(
    formatAmount(data.grandTotal),
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
  const isTaxEnabled = data.companyGstType === 'Regular';
  const body = data.items.map((item: any) => {
    const totalPcs = item.qty * (item.unitMultiplier ?? 1);

    const taxPercent = item.tax ?? item.gst ?? item.taxRate ?? 0;

    const price = item.price || item.salesPrice || item.mrp || 0;

    let gstAmount = 0;
    let subtotal = 0;

    // APPLY SETTINGS LOGIC
    const qty = item.qty || 0;

    if (!isTaxEnabled || !taxPercent) {
      subtotal = price * qty;
      gstAmount = 0;
    }
    else if (data.taxType === 'inclusive') {
      const base = price / (1 + taxPercent / 100);

      subtotal = base * qty;              // taxable value
      gstAmount = (price - base) * qty;   // gst
    }
    else {
      subtotal = price * qty;             // taxable
      gstAmount = (price * taxPercent / 100) * qty;
    }

    return isEstimate
      ? [
        item.sno,
        "",
        `${item.name}\n(${totalPcs} pcs)`,
        item.qty,
        formatAmount(item.mrp || 0),
        formatAmount(price),
        formatAmount(item.total),
      ]
      : [
        item.sno,
        "",
        `${item.name}\n(${totalPcs} pcs)`,
        item.qty,
        taxPercent,
        formatAmount(item.mrp || 0),
        formatAmount(price),
        formatAmount(subtotal),
        formatAmount(gstAmount),
        formatAmount(subtotal + gstAmount),
      ];
  });

  // ===== GRAND TOTAL ROW =====
  const foot = isEstimate
    ? [["", "", "", "", "", "Grand Total", formatAmount(data.grandTotal)]]
    : [["", "", "", "", "", "", "", "", "Grand Total", formatAmount(data.grandTotal)]];

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
      ? [["No", "Product", "Item", "Qty", "MRP", "SalePrice", "Total"]]
      : [["No", "Product", "Item", "Qty", "GST%", "MRP", "SalePrice", "SubTotal", "GSTAmt", "Total"]],
    body,
    foot,
    showFoot: "lastPage",
    margin: { left: 7, right: 7 },
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
  if (!isEstimate) {
    let finalY = (doc as any).lastAutoTable.finalY + 4;
    const wordsH = 8;
    const bankH = 12;
    const footerH = 32;

    // check if enough space for footer
    const footerHeight = wordsH + bankH + footerH + 20;

    if (finalY + footerHeight > pageHeight - 15) {
      doc.addPage();
      finalY = margin;
    }

    doc.rect(margin, finalY, pageWidth - margin * 2, wordsH);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    doc.text(
      `Amount in Words : ${convertNumberToWords(Math.round(data.grandTotal))}`,
      margin + 4,
      finalY + 5.5
    );

    finalY += wordsH;

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

  return {
    ...invoiceData,

    companyName: companyData.name || "",
    companyAddress: companyData.address || "",
    companyPhone: companyData.phone || "",
    companyGstType: salesSettings?.gstScheme === "none"
      ? ""
      : (gstTypeFromSales || companyData.gstType || ""),
    taxType: salesSettings?.taxType || 'exclusive',
    // BILL SETTINGS
    companyGstin: companyData.gstin || billSettings.companyGstin || "",
    msmeNumber: billSettings.msmeNumber || "",
    panNumber: billSettings.panNumber || "",

    bankName: billSettings.bankName || "",
    accountName: billSettings.accountName || "",
    accountNumber: billSettings.accountNumber || "",
    ifscCode: billSettings.ifscCode || "",

    termsAndConditions: billSettings.termsAndConditions || "",
    signatureBase64: billSettings.signatureBase64 || ""
  };
};