import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ACTION } from "../enums";
import type { InvoiceData } from "./pdfGenerator";

export const generateA5Invoice = async (
    data: InvoiceData,
    isEstimate: boolean = false,
    action: ACTION
) => {
    const doc = new jsPDF("p", "mm", "a5"); // A5 Size
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const rightMargin = pageWidth - 10;

    // --- MASTER SWITCHES (Ported from A4) ---
    const safeScheme = (data.gstScheme || "").toUpperCase().trim();
    const safeTaxType = (data.taxType || "").toUpperCase().trim();

    // Hide GST details if Unregistered, None, or Exempt
    const showGstinDetails = !isEstimate && safeScheme !== 'UNREGISTERED' && safeScheme !== 'NONE' && safeScheme !== '' && safeTaxType !== 'EXEMPT' && safeTaxType !== 'NONE';

    // Tax math is enabled if Composition OR (Regular + Not Exempt)
    const isTaxEnabled = !isEstimate && safeScheme !== 'UNREGISTERED' && safeScheme !== 'NONE' && safeScheme !== '' && (safeScheme === 'COMPOSITION' || (safeTaxType !== 'EXEMPT' && safeTaxType !== 'NONE'));

    const hasImages = data.items.some(
        (item: any) =>
            item.imageBase64 &&
            typeof item.imageBase64 === "string" &&
            item.imageBase64.startsWith("data:image")
    );

    // --- 1. HEADER ---
    doc.setFillColor("#0c3b5e");
    doc.rect(0, 0, pageWidth, 20, "F");

    doc.setTextColor("#ffffff");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(data.companyName || "Giftinguru.com", pageWidth / 2, 13, { align: "center" });

    // Use the new showGstinDetails switch here
    if (showGstinDetails) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);

        let gstText = safeScheme;

        if (safeScheme === "REGULAR" && data.taxType) {
            gstText += ` (${data.taxType.toLowerCase() === "inclusive" ? "Inclusive" : "Exclusive"})`;
        }

        doc.text(`GST Type: ${gstText}`, pageWidth / 2, 18, { align: "center" });
    }

    if (isEstimate) {
        doc.setFontSize(10);
        doc.setTextColor("#ffffff");
        doc.text("ESTIMATE", pageWidth / 2, 18, { align: "center" });
    }

    // --- 2. META INFO ROW ---

    let cursorY = 28;

    doc.setTextColor("#000000");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    const usableWidth = pageWidth - 10;
    const colWidth = usableWidth / 3;

    const col1X = 5;
    const col2X = 5 + colWidth;
    const col3X = 5 + (colWidth * 2);

    doc.text(`Invoice No : ${data.invoice.number || ""}`, col1X, cursorY);
    doc.text(`Date : ${data.invoice.date || ""}`, col2X, cursorY);

    const posLines = doc.splitTextToSize(`Place of Supply : ${data.billTo.address || ""}`, colWidth - 2);
    doc.text(posLines, col3X, cursorY);

    doc.line(5, cursorY + 4, pageWidth - 5, cursorY + 4);

    cursorY += 8;

    // ================= BILL / SHIP TABLE =================

    const sectionStartY = cursorY;
    const sectionHeight = 28;
    const sectionWidth = pageWidth - 10;

    doc.rect(5, sectionStartY, sectionWidth, sectionHeight);

    // middle divider
    doc.line(5 + sectionWidth / 2, sectionStartY, 5 + sectionWidth / 2, sectionStartY + sectionHeight);

    // headings
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(isEstimate ? "Estimate For :" : "Billed To :", 8, sectionStartY + 5);

    if (!isEstimate) {
        doc.text("Shipped To :", 5 + sectionWidth / 2 + 3, sectionStartY + 5);
    }

    // values
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let textY = sectionStartY + 10;

    const billX = 8;
    const shipX = 5 + sectionWidth / 2 + 3;

    // ===== NAME =====
    if (isEstimate) {
        doc.text(data.billTo?.name || "", billX, textY);
    } else {
        doc.text(data.billTo?.name || "", billX, textY);
        doc.text(data.shipTo?.name || data.billTo?.name || "", shipX, textY);
    }

    textY += 4;

    // ===== ADDRESS =====
    const billAddrLines = doc.splitTextToSize(data.billTo?.address || "", sectionWidth / 2 - 8);
    doc.text(billAddrLines, billX, textY);

    if (!isEstimate) {
        const shipAddrLines = doc.splitTextToSize(data.shipTo?.address || data.billTo?.address || "", sectionWidth / 2 - 8);
        doc.text(shipAddrLines, shipX, textY);
    }

    textY += 8;

    // ===== PHONE =====
    doc.text(`Phone : ${data.billTo?.phone || ""}`, billX, textY);

    if (!isEstimate) {
        doc.text(`Phone : ${data.shipTo?.phone || data.billTo?.phone || ""}`, shipX, textY);
    }

    // ===== GSTIN =====
    if (showGstinDetails && data.billTo?.gstin) {
        textY += 4;
        doc.text(`GSTIN : ${data.billTo.gstin}`, billX, textY);

        if (!isEstimate && data.shipTo?.gstin) {
            doc.text(`GSTIN : ${data.shipTo.gstin}`, shipX, textY);
        }
    }

    const tableStartY = sectionStartY + sectionHeight + 5;

    // ================= PRE-CALCULATE MATH & GRAND TOTAL =================
    let calculatedGrandTotal = 0;

    const processedItems = data.items.map((item: any, index: number) => {
        const totalPcs = item.totalPcs || item.quantity || 1;
        const qty = Number(item.quantity) || 0;

        let mrp = Number(item.mrp || item.listPrice || item.price || item.salesPrice || 0);
        let rawPrice = Number(item.listPrice || item.salesPrice || item.price || mrp);
        const taxPercent = Number(item.gstPercent || item.taxRate || item.tax || item.gst || 0);

        const effectiveTaxRate = isTaxEnabled ? taxPercent : 0;

        // 1. CALCULATE DISCOUNT FIRST
        let explicitDiscount = Number(item.discountPercentage || item.discount || item.discountAmount || 0);
        let sellingPricePerUnit = rawPrice;
        let rowDiscountAmt = 0;

        if (explicitDiscount > 0 && explicitDiscount <= 100) {
            // Percentage discount
            sellingPricePerUnit = rawPrice - (rawPrice * (explicitDiscount / 100));
            rowDiscountAmt = (rawPrice * qty) - (sellingPricePerUnit * qty);
        } else if (explicitDiscount > 100) {
            // Flat amount discount
            rowDiscountAmt = explicitDiscount;
            sellingPricePerUnit = rawPrice - (rowDiscountAmt / qty);
        }

        // 2. NEGATIVE DISCOUNT FIX (MARKUP)
        if (sellingPricePerUnit > rawPrice) {
            rowDiscountAmt = 0;
            mrp = sellingPricePerUnit;
            rawPrice = sellingPricePerUnit;
        }

        let subtotal = 0;
        let gstAmount = 0;
        let finalRowTotal = 0;

        // 3. THE MATH ENGINE (Applied on the discounted selling price)
        if (effectiveTaxRate === 0) {
            finalRowTotal = sellingPricePerUnit * qty;
            subtotal = finalRowTotal;
            gstAmount = 0;
        } else if (data.taxType?.toLowerCase() === 'inclusive') {
            finalRowTotal = sellingPricePerUnit * qty;
            subtotal = finalRowTotal / (1 + (effectiveTaxRate / 100));
            gstAmount = finalRowTotal - subtotal;
        } else {
            // EXCLUSIVE
            subtotal = sellingPricePerUnit * qty;
            gstAmount = subtotal * (effectiveTaxRate / 100);
            finalRowTotal = subtotal + gstAmount;
        }

        calculatedGrandTotal += finalRowTotal;

        return {
            sno: item.sno || (index + 1).toString(),
            name: item.name || "",
            totalPcs,
            unit: item.unit || "pcs",
            qty,
            rawPrice,
            effectiveTaxRate,
            gstAmount,
            discountAmt: rowDiscountAmt,
            finalRowTotal,
            imageBase64: item.imageBase64
        };
    });

    const finalTotalAmountToPrint = calculatedGrandTotal > 0 ? calculatedGrandTotal : Number(data.finalAmount || 0);

    // ================= ITEMS TABLE =================
    autoTable(doc, {
        startY: tableStartY,
        margin: { left: 5, right: 5 },
        tableWidth: 'auto',
        rowPageBreak: 'avoid',
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            halign: 'center',
            valign: 'middle',
            fontSize: 8,
            fontStyle: 'normal'
        },
        bodyStyles: {
            lineColor: [0, 0, 0],
            lineWidth: 0.2,
            textColor: [0, 0, 0],
            fontSize: 8,
            halign: 'center',
            valign: 'middle',
            minCellHeight: hasImages ? 18 : 10
        },
        columnStyles: hasImages
            ? {
                1: { cellWidth: 18, halign: "center" },
                2: { halign: "left" }
            }
            : {
                1: { halign: "left" }
            },
        head: [[
            "S. No.",
            ...(hasImages ? ["Image"] : []),
            "Product",
            "Qty.",
            "Price",
            ...(isEstimate ? [] : ["GST (%)", "GST Amt"]),
            "Discount",
            "Amount"
        ]],
        body: processedItems.map(item => [
            item.sno,
            ...(hasImages ? [""] : []),
            `${item.name}\n(${item.totalPcs} ${item.unit})`,
            item.qty,
            item.rawPrice.toFixed(2),
            ...(isEstimate ? [] : [
                `${item.effectiveTaxRate}%`,
                item.gstAmount.toFixed(2)
            ]),
            item.discountAmt.toFixed(2),
            item.finalRowTotal.toFixed(2)
        ]),

        foot: [[
            {
                content: "GRAND TOTAL",
                colSpan: isEstimate ? (hasImages ? 6 : 5) : (hasImages ? 8 : 7),
                styles: {
                    halign: "right",
                    fontStyle: "bold",
                    textColor: [12, 59, 94],
                    fontSize: 10
                }
            },
            {
                content: finalTotalAmountToPrint.toFixed(2),
                styles: {
                    halign: "right",
                    fontStyle: "bold",
                    fontSize: 10
                }
            }
        ]],

        showFoot: "lastPage",

        didDrawCell: (hookData) => {
            if (!hasImages) return;
            const imageColumnIndex = 1;

            if (hookData.section === "body" && hookData.column.index === imageColumnIndex) {
                const item = processedItems[hookData.row.index];

                if (item?.imageBase64 && item.imageBase64.startsWith("data:image")) {
                    try {
                        const imgSize = 14;
                        const x = hookData.cell.x + (hookData.cell.width - imgSize) / 2;
                        const y = hookData.cell.y + (hookData.cell.height - imgSize) / 2;
                        const format = item.imageBase64.includes("png") ? "PNG" : "JPEG";

                        doc.addImage(item.imageBase64, format, x, y, imgSize, imgSize);
                    } catch (e) {
                        console.error("A5 image render error", e);
                    }
                }
            }
        },
    });

    // @ts-ignore
    let finalY = doc.lastAutoTable.finalY + 8;

    // ===== SMART SPACE CALCULATION =====

    const footerHeight = 22;
    const paymentHeight = !isEstimate ? 18 : 0;
    const termsLines = doc.splitTextToSize(data.terms || "", rightMargin - 10);
    const termsHeight = !isEstimate ? (termsLines.length * 3.5) + 10 : 0;
    const signatureHeight = !isEstimate && data.signatureBase64 ? 16 : 10;

    const requiredBottomSpace = footerHeight + paymentHeight + termsHeight + signatureHeight + 8;

    if (finalY + requiredBottomSpace > pageHeight) {
        doc.addPage();
        finalY = 20;
    }

    // --- 4. PAYMENT INFORMATION ---
    if (!isEstimate) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.text("Payment Information", 10, finalY);

        finalY += 6;
        doc.setFontSize(9);

        // Grid Row 1
        doc.text("Account Number:", 10, finalY);
        doc.text(data.bankDetails?.accountNumber || "", 45, finalY);

        doc.text("Bank Name:", 80, finalY);
        doc.text(data.bankDetails?.bankName || "", rightMargin, finalY, { align: "right" });

        // Grid Row 2
        finalY += 6;
        doc.text("Account Name:", 10, finalY);
        doc.text(data.bankDetails?.accountName || "", 45, finalY);

        doc.text("IFSC Code:", 80, finalY);
        doc.text(data.bankDetails?.ifsc || "", rightMargin, finalY, { align: "right" });

        // Separator Line
        finalY += 6;
        doc.setDrawColor(200, 200, 200);
        doc.line(10, finalY, rightMargin, finalY);
    }

    // --- 5. TERMS & CONDITIONS ---
    if (!isEstimate) {
        finalY += 4;
        doc.setFontSize(11);
        doc.text("Terms & Conditions", 10, finalY);

        finalY += 6;
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        const splitTerms = doc.splitTextToSize(data.terms || "", rightMargin - 10);
        doc.text(splitTerms, 10, finalY);

        finalY += (splitTerms.length * 3.5) + 2;

        doc.setDrawColor(200, 200, 200);
        doc.line(10, finalY, rightMargin, finalY);
    }

    // --- 6. AUTHORISED SIGNATURE ---
    if (!isEstimate) {
        const footerY = pageHeight - footerHeight;
        const signTextY = footerY - 4;
        const signImageY = footerY - 14;

        if (data.signatureBase64) {
            doc.addImage(data.signatureBase64, "PNG", rightMargin - 30, signImageY, 30, 10);
        }

        doc.setFontSize(9);
        doc.text("Authorised Sign", rightMargin, signTextY, { align: "right" });
    }

    // --- 7. FOOTER ---
    const footerY = pageHeight - footerHeight;

    doc.setFillColor("#0c3b5e");
    doc.rect(0, footerY, pageWidth, footerHeight, "F");

    doc.setTextColor("#ffffff");
    doc.setFontSize(8);

    // Left side Footer (DYNAMIC)
    const footeraddressLines = doc.splitTextToSize(data.companyAddress || "", 70);
    doc.text(footeraddressLines, 10, footerY + 6);

    const addressEndY = footerY + 6 + (footeraddressLines.length * 4);

    doc.text(`Contact No. - ${data.companyContact || ""}`, 10, addressEndY + 2);

    if (data.companyGstin) {
        doc.text(`GSTIN - ${data.companyGstin}`, 10, addressEndY + 6);
    }

    // ===== BRANDING =====
    const pbText = "Powered by ";
    const linkText = "SELLAR.IN";

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");

    const pbWidth = doc.getTextWidth(pbText);
    const linkWidth = doc.getTextWidth(linkText);

    let brandingX = rightMargin - (pbWidth + linkWidth);

    doc.setTextColor(255, 255, 255);
    doc.text(pbText, brandingX, footerY + 8);
    brandingX += pbWidth;

    doc.setTextColor(120, 190, 255);
    doc.text(linkText, brandingX, footerY + 8);

    doc.setDrawColor(120, 190, 255);
    doc.line(brandingX, footerY + 8.5, brandingX + linkWidth, footerY + 8.5);

    doc.link(brandingX, footerY + 5, linkWidth, 4, { url: "https://www.sellar.in" });

    // ===== MADE IN INDIA =====
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    const part1 = "Made with ";
    const part2 = "pride";
    const part3 = " in India";

    const w1 = doc.getTextWidth(part1);
    const w2 = doc.getTextWidth(part2);
    const w3 = doc.getTextWidth(part3);

    const totalWidth = w1 + w2 + w3;

    let indiaX = rightMargin - totalWidth;
    const indiaY = footerY + 13.5;

    doc.setTextColor(255, 255, 255);
    doc.text(part1, indiaX, indiaY);

    indiaX += w1;
    doc.setTextColor(220, 40, 40);
    doc.text(part2, indiaX, indiaY);

    indiaX += w2;
    doc.setTextColor(40, 90, 200);
    doc.text(part3, indiaX, indiaY);

    doc.setTextColor(255, 255, 255);

    // --- PRINT / DOWNLOAD / BLOB ---
    if (action === ACTION.PRINT) {
        doc.autoPrint();
        window.open(doc.output("bloburl"), "_blank");
    } else if (action === ACTION.BLOB) {
        return doc.output("blob");
    } else {
        doc.save(`Invoice_${data.invoice.number}.pdf`);
    }
};