import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ACTION } from "../enums";
import type { InvoiceData } from "./pdfGenerator";

export const generateA5Invoice = async (
    data: InvoiceData,
    isEstimate: boolean = false,
    action: ACTION,
    withDuplicate: boolean = false
) => {
    const doc = new jsPDF("p", "mm", "a5"); // A5 Size
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const rightMargin = pageWidth - 10;

    // --- MASTER SWITCHES (Ported from A4) ---
    const safeScheme = (data.gstScheme || "").toUpperCase().trim();
    const safeTaxType = (data.taxType || "").toUpperCase().trim();
    // Keep isEstimate as the parameter, just augment it:
    const isExplicitEstimate = isEstimate || (data as any).isEstimate === true;
    const resolvedIsEstimate = isExplicitEstimate ||
        (safeScheme !== 'COMPOSITION' && (safeTaxType === 'NONE' || safeTaxType === 'EXEMPT' || safeScheme === 'NONE' || safeScheme === 'EXEMPT'));
    // Hide GST details if Unregistered, None, or Exempt
    const showGstinDetails = !resolvedIsEstimate && safeScheme !== 'UNREGISTERED' && safeScheme !== 'NONE' && safeScheme !== '' && safeTaxType !== 'EXEMPT' && safeTaxType !== 'NONE';

    // Tax math is enabled if Composition OR (Regular + Not Exempt)
    // const isTaxEnabled = !resolvedIsEstimate && safeScheme !== 'UNREGISTERED' && safeScheme !== 'NONE' && safeScheme !== '' && (safeScheme === 'COMPOSITION' || (safeTaxType !== 'EXEMPT' && safeTaxType !== 'NONE'));

    const hasImages = data.items.some(
        (item: any) =>
            item.imageBase64 &&
            typeof item.imageBase64 === "string" &&
            item.imageBase64.startsWith("data:image")
    );
 // ================= DRAW PAGE HELPER =================
    const drawPage = (isDuplicate: boolean = false) => {
        if (isDuplicate) {
            doc.addPage();
        }
    // --- 1. HEADER ---
    const headerHeight = showGstinDetails && data.companyGstin ? 25 : 20;
    doc.setFillColor("#0c3b5e");
    doc.rect(0, 0, pageWidth, headerHeight, "F");
    if (isDuplicate) {
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(200, 200, 200);
        doc.text("DUPLICATE", pageWidth / 2, 5, { align: "center" });
    }
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
        if (data.companyGstin) {
            doc.setFontSize(7);
            doc.text(`GSTIN: ${data.companyGstin}`, pageWidth / 2, 21, { align: "center" });
        }
    }

    if (resolvedIsEstimate) {
        doc.setFontSize(10);
        doc.setTextColor("#ffffff");
        doc.text("ESTIMATE", pageWidth / 2, 18, { align: "center" });
    }

    // --- 2. META INFO ROW ---

    let cursorY = headerHeight + 8;

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
    doc.text(resolvedIsEstimate ? "Estimate For :" : "Billed To :", 8, sectionStartY + 5);

    if (!resolvedIsEstimate) {
        doc.text("Shipped To :", 5 + sectionWidth / 2 + 3, sectionStartY + 5);
    }

    // values
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    let textY = sectionStartY + 10;

    const billX = 8;
    const shipX = 5 + sectionWidth / 2 + 3;

    // ===== NAME =====
    if (resolvedIsEstimate) {
        doc.text(data.billTo?.name || "", billX, textY);
    } else {
        doc.text(data.billTo?.name || "", billX, textY);
        doc.text(data.shipTo?.name || data.billTo?.name || "", shipX, textY);
    }

    textY += 4;

    // ===== ADDRESS =====
    const billAddrLines = doc.splitTextToSize(data.billTo?.address || "", sectionWidth / 2 - 8);
    doc.text(billAddrLines, billX, textY);

    if (!resolvedIsEstimate) {
        const shipAddrLines = doc.splitTextToSize(data.shipTo?.address || data.billTo?.address || "", sectionWidth / 2 - 8);
        doc.text(shipAddrLines, shipX, textY);
    }

    textY += 8;

    // ===== PHONE =====
    doc.text(`Phone : ${data.billTo?.phone || ""}`, billX, textY);

    if (!resolvedIsEstimate) {
        doc.text(`Phone : ${data.shipTo?.phone || data.billTo?.phone || ""}`, shipX, textY);
    }

    // ===== GSTIN =====
    if (showGstinDetails && data.billTo?.gstin) {
        textY += 4;
        doc.text(`GSTIN : ${data.billTo.gstin}`, billX, textY);

        if (!resolvedIsEstimate && data.shipTo?.gstin) {
            doc.text(`GSTIN : ${data.shipTo.gstin}`, shipX, textY);
        }
    }

    const tableStartY = sectionStartY + sectionHeight + 5;

    // ================= PRE-CALCULATE MATH & GRAND TOTAL =================
    let calculatedGrandTotal = 0;
    let totalQty = 0;
    let totalTaxable = 0;
    let totalTaxAmt = 0;

    const processedItems = data.items.map((item: any, index: number) => {
        const totalPcs = item.totalPcs || item.quantity || 1;
        const qty = Number(item.quantity) || 0;

        let mrp = Number(item.listPrice) || 0;

        if (mrp === 0) {
            const salesPrice = Number(item.price || item.rate || 0);
            if (salesPrice > 0) {
                mrp = salesPrice;
            } else if (qty > 0) {
                mrp = Number(item.amount || 0) / qty;
            }
        }
        let rawPrice = mrp;
        let effectiveTaxRate = resolvedIsEstimate ? 0 : Number(item.gstPercent || item.taxRate || 0);

        if (safeScheme === 'COMPOSITION' || safeScheme === 'NONE') {
            effectiveTaxRate = 0;
        }

        let rowTotal = 0;
        let rowDiscountAmt = 0;

        if (item.amount !== undefined && item.amount !== null && Number(item.amount) > 0) {
            rowTotal = Number(item.amount);
            rowDiscountAmt = (mrp * qty) - rowTotal;
            if (rowDiscountAmt < 0) rowDiscountAmt = 0;
        } else {
            const discAmt = Number(item.discountAmount) || 0;
            rowDiscountAmt = discAmt;
            rowTotal = (mrp * qty) - discAmt;
        }

        // Explicit Discount Priority (A4 logic)
        if (item.discountAmount !== undefined && Number(item.discountAmount) > 0) {
            rowDiscountAmt = Number(item.discountAmount);
        }

        let taxableValue = 0;
        let taxAmt = 0;
        let finalRowTotal = 0;

        if (resolvedIsEstimate) {
            finalRowTotal = rowTotal;
            taxableValue = rowTotal;
            taxAmt = 0;
        } else if (safeScheme === 'NONE' || safeScheme === 'COMPOSITION') {
            finalRowTotal = rowTotal;
            taxableValue = rowTotal;
            taxAmt = 0;
        } else {
            if (safeTaxType === 'EXCLUSIVE') {
                taxableValue = rowTotal;
                taxAmt = taxableValue * (effectiveTaxRate / 100);
                finalRowTotal = taxableValue + taxAmt;
            } else {
                // INCLUSIVE
                finalRowTotal = rowTotal;
                taxableValue = finalRowTotal / (1 + (effectiveTaxRate / 100));
                taxAmt = finalRowTotal - taxableValue;
            }
        }

        totalQty += qty;
        totalTaxable += taxableValue;
        totalTaxAmt += taxAmt;
        calculatedGrandTotal += finalRowTotal;

        return {
            sno: item.sno || (index + 1).toString(),
            name: item.name || "",
            totalPcs,
            unit: item.unit || "pcs",
            qty,
            rawPrice,
            effectiveTaxRate,
            taxAmt,
            taxableValue,
            discountAmt: rowDiscountAmt,
            finalRowTotal,
            imageBase64: item.imageBase64
        };
    });

    const billDiscount = Number(data.billDiscount) || 0;
    const extraExpense = Number(data.extraExpenseAmount) || 0;
    const advance = Number((data as any).advance) || 0;

    const netPayable = calculatedGrandTotal - billDiscount + extraExpense - advance;
    const finalRoundTotal = Math.round(netPayable);
    // const roundOffAmt = finalRoundTotal - netPayable;

    const finalTotalAmountToPrint = finalRoundTotal > 0
        ? finalRoundTotal
        : Number(data.finalAmount || 0);
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
                ...(resolvedIsEstimate ? [] : ["GST (%)", "GST Amt"]),
                "Discount",
                "Amount"
            ]],
            body: processedItems.map(item => [
                item.sno,
                ...(hasImages ? [""] : []),
                `${item.name}\n(${item.totalPcs} ${item.unit})`,
                item.qty,
                item.rawPrice.toFixed(2),
                ...(resolvedIsEstimate ? [] : [
                    `${item.effectiveTaxRate}%`,
                    item.taxAmt.toLocaleString("en-IN", {   // renamed field + Indian format
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })
                ]),
                item.discountAmt.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }),
                item.finalRowTotal.toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })
            ]),

            foot: [[
                {
                    content: "GRAND TOTAL",
                    colSpan: resolvedIsEstimate ? (hasImages ? 6 : 5) : (hasImages ? 8 : 7),
                    styles: {
                        halign: "right",
                        fontStyle: "bold",
                        textColor: [255, 255, 255],
                        fontSize: 10
                    }
                },
                {
                    content: finalTotalAmountToPrint.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }),
                    styles: { halign: "right", fontStyle: "bold", fontSize: 10 }
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
        let finalY = doc.lastAutoTable.finalY + 6;
        // --- 4. TAX BREAKDOWN TABLE (BEFORE PAYMENT INFO) ---
        if (!resolvedIsEstimate && showGstinDetails) {
            const taxBreakdownData: Record<string, { taxable: number, cgst: number, sgst: number }> = {};

            processedItems.forEach(item => {
                if (item.effectiveTaxRate > 0) {
                    const rateKey = item.effectiveTaxRate.toString();
                    if (!taxBreakdownData[rateKey]) {
                        taxBreakdownData[rateKey] = { taxable: 0, cgst: 0, sgst: 0 };
                    }
                    taxBreakdownData[rateKey].taxable += item.taxableValue;
                    taxBreakdownData[rateKey].cgst += (item.taxAmt / 2);
                    taxBreakdownData[rateKey].sgst += (item.taxAmt / 2);
                }
            });

            if (Object.keys(taxBreakdownData).length > 0) {
                autoTable(doc, {
                    startY: finalY,
                    margin: { left: 5 },
                    head: [["Tax Rate", "Taxable Amt.", "CGST", "SGST", "Total Tax"]],
                    body: [
                        ...Object.keys(taxBreakdownData).map(rate => {
                            const d = taxBreakdownData[rate];
                            return [
                                `${rate}%`,
                                d.taxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                (d.cgst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                (d.sgst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                                (d.cgst + d.sgst).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            ];
                        }),
                        [
                            "TOTAL",
                            totalTaxable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                            (totalTaxAmt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                            (totalTaxAmt / 2).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                            totalTaxAmt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                        ]
                    ],
                    theme: 'grid',
                    styles: {
                        fontSize: 6,
                        cellPadding: 1,
                        textColor: [0, 0, 0],
                        lineColor: [0, 0, 0],
                        lineWidth: 0.1,
                        halign: 'right',
                        valign: 'middle',
                        minCellHeight: 4
                    },
                    headStyles: {
                        fillColor: [255, 255, 255],
                        textColor: [0, 0, 0],
                        fontStyle: 'bold',
                        lineWidth: 0.1,
                        lineColor: [0, 0, 0],
                        halign: 'right'
                    },
                    columnStyles: {
                        0: { halign: 'left', cellWidth: 15 }
                    },
                    tableWidth: (pageWidth - 10) / 2
                });

                // @ts-ignore
                finalY = doc.lastAutoTable.finalY + 6;
            }
        }
        // ===== SMART SPACE CALCULATION =====

        const footerHeight = 22;
        const paymentHeight = !resolvedIsEstimate ? 24 : 0;
        // const termsLines = doc.splitTextToSize(data.terms || "", rightMargin - 10);
        // const termsHeight = !resolvedIsEstimate ? (termsLines.length * 3.5) + 10 : 0;
        const signatureHeight = !resolvedIsEstimate && data.signatureBase64 ? 16 : 10;

        const splitTermsPreview = doc.splitTextToSize(data.terms || "", rightMargin - 5);
        const termsHeightAccurate = !resolvedIsEstimate ? (splitTermsPreview.length * 3.5) + 10 : 0;

        const requiredBottomSpace = paymentHeight + termsHeightAccurate + signatureHeight + 10;

        if (finalY + requiredBottomSpace > pageHeight) {
            doc.addPage();
            finalY = 20;
        }

        // --- 4. PAYMENT INFORMATION ---
        if (!resolvedIsEstimate) {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.text("Payment Information", 5, finalY);

            finalY += 3;
            autoTable(doc, {
                startY: finalY,
                margin: { left: 5, right: 5 },
                tableWidth: pageWidth - 10,
                theme: 'grid',
                body: [
                    [
                        { content: "Account Number", styles: { fontStyle: 'bold' } },
                        { content: data.bankDetails?.accountNumber || "" },
                        { content: "Bank Name", styles: { fontStyle: 'bold' } },
                        { content: data.bankDetails?.bankName || "" },
                    ],
                    [
                        { content: "Account Name", styles: { fontStyle: 'bold' } },
                        { content: data.bankDetails?.accountName || "" },
                        { content: "IFSC Code", styles: { fontStyle: 'bold' } },
                        { content: data.bankDetails?.ifsc || "" },
                    ],
                ],
                styles: {
                    fontSize: 8,
                    cellPadding: 2,
                    textColor: [0, 0, 0],
                    lineColor: [200, 200, 200],
                    lineWidth: 0.2,
                    valign: 'middle',
                },
                columnStyles: {
                    0: { cellWidth: 30, halign: 'left' },
                    1: { halign: 'left' },
                    2: { cellWidth: 25, halign: 'left' },
                    3: { halign: 'left' },
                },
            });

            // @ts-ignore
            finalY = doc.lastAutoTable.finalY + 3;
            // doc.setDrawColor(200, 200, 200);
            // doc.line(10, finalY, rightMargin, finalY);
        }

        // --- 5. TERMS & CONDITIONS ---
        if (!resolvedIsEstimate) {
            finalY += 4;
            doc.setFontSize(11);
            doc.text("Terms & Conditions", 5, finalY);

            finalY += 6;
            doc.setFontSize(8);
            doc.setTextColor(80, 80, 80);
            const splitTerms = doc.splitTextToSize(data.terms || "", rightMargin - 5);
            doc.text(splitTerms, 5, finalY);

            finalY += (splitTerms.length * 3.5) + 2;

            doc.setDrawColor(200, 200, 200);
            doc.line(5, finalY, rightMargin, finalY);
        }

        // --- 6. AUTHORISED SIGNATURE ---
        if (!resolvedIsEstimate) {
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
        doc.setTextColor(255, 255, 255);
        doc.text(part2, indiaX, indiaY);

        indiaX += w2;
        doc.setTextColor(255, 255, 255);
        doc.text(part3, indiaX, indiaY);

        doc.setTextColor(255, 255, 255);

    }; // end drawPage

    // ================= RENDER PAGES =================
    drawPage(false);
    if (withDuplicate && !resolvedIsEstimate) {
        drawPage(true);
    }
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