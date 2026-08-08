import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { ACTION } from "../enums";
import type { InvoiceData } from "./pdfGenerator";
import { drawWatermark } from "../Components/pdfWatermark";

const compressBase64Image = (
    base64: string,
    quality: number = 0.4,
    maxSize: number = 120
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();

        img.onload = () => {
            const canvas = document.createElement("canvas");

            const scale = Math.min(
                1,
                maxSize / Math.max(img.width, img.height)
            );

            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            const ctx = canvas.getContext("2d");

            if (!ctx) {
                reject("Canvas error");
                return;
            }

            ctx.drawImage(
                img,
                0,
                0,
                canvas.width,
                canvas.height
            );

            resolve(
                canvas.toDataURL(
                    "image/jpeg",
                    quality
                )
            );
        };

        img.onerror = reject;
        img.src = base64;
    });
};
export const generateA5Invoice = async (
    data: InvoiceData,
    isEstimate: boolean = false,
    action: ACTION,
    withDuplicate: boolean = false
) => {
    const doc = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a5",
        compress: true
    }); // A5 Size
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
    for (const item of data.items as any[]) {
        if (
            item.imageBase64 &&
            item.imageBase64.startsWith("data:image") &&
            !item.compressedImageBase64
        ) {
            try {
                item.compressedImageBase64 =
                    await compressBase64Image(
                        item.imageBase64,
                        0.4,
                        120
                    );
            } catch (err) {
                console.error("Image compression failed", err);
            }
        }
    }
    // --- QR CODE (same UPI QR as A4) ---
    let qrBase64: string | null = null;
    if (data.upiId) {
        const upiString = `upi://pay?pa=${data.upiId}&pn=${encodeURIComponent(data.companyName)}&cu=INR`;
        try {
            qrBase64 = await QRCode.toDataURL(upiString, { width: 80, margin: 0, errorCorrectionLevel: "L" });
        } catch (err) {
            console.error("Failed to generate QR code", err);
        }
    }
    // ================= DRAW PAGE HELPER =================
    const drawPage = (isDuplicate: boolean = false) => {
        if (isDuplicate) {
            doc.addPage();
        }

        drawWatermark(doc, pageWidth, pageHeight, "SELLAR.IN", { fontSize: 50, centerYOffset: 6 });

        // --- 1. HEADER (colour fill removed, wrapped in a border box — same plain style as A4) ---
        const headerHeight = showGstinDetails && data.companyGstin ? 26 : 24;

        // Border box around the whole header
        doc.setDrawColor(0, 0, 0);
        doc.rect(5, 2, pageWidth - 10, headerHeight - 2);

        if (isDuplicate) {
            doc.setFontSize(9);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(150, 150, 150);
            doc.text("DUPLICATE", pageWidth / 2, 6, { align: "center" });
        }

        // QR code — left side (same as A4)
        if (qrBase64 && !resolvedIsEstimate) {
            doc.addImage(qrBase64, "JPEG", 7, 4, 18, 18, undefined, "FAST");
            doc.setFontSize(6);
            doc.setTextColor("#000000");
            doc.text("Scan to Pay", 16, 24, { align: "center" });
        }

        // MSME number — top right, above the logo (same placement as A4)
        if (!resolvedIsEstimate) {
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor("#000000");
            doc.text(`Msme No : ${data.msmeNumber || ""}`, pageWidth - 7, 6, { align: "right" });
        }

        // Company logo — right side, below MSME number (same as A4)
        if (data.companyLogoBase64) {
            try {
                doc.addImage(data.companyLogoBase64, "JPEG", pageWidth - 25, 8, 18, 14, undefined, "FAST");
            } catch (e) {
                console.error("A5 logo render error", e);
            }
        }

        doc.setTextColor("#000000");
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
            doc.setTextColor("#000000");
            doc.text("ESTIMATE", pageWidth / 2, 18, { align: "center" });
        }

        // --- 2. META INFO ROW ---

        let cursorY = headerHeight + 3;

        doc.setTextColor("#000000");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);

        // ================= THREE BOX SECTION =================

        const sectionStartY = cursorY;

        const sectionHeight = 26;
        const totalWidth = pageWidth - 10;
        const boxWidth = totalWidth / 3;

        // boxes
        doc.rect(5, sectionStartY, boxWidth, sectionHeight);
        doc.rect(5 + boxWidth, sectionStartY, boxWidth, sectionHeight);
        doc.rect(5 + (boxWidth * 2), sectionStartY, boxWidth, sectionHeight);

        // headings
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);

        doc.text("INVOICE DETAILS", 7, sectionStartY + 5);
        doc.text("BILLED TO", 7 + boxWidth, sectionStartY + 5);
        doc.text("SHIPPED TO", 7 + (boxWidth * 2), sectionStartY + 5);

        // content
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);

        const invoiceX = 7;
        const billX = 7 + boxWidth;
        const shipX = 7 + (boxWidth * 2);

        // ===== INVOICE DETAILS =====

        doc.setFont("helvetica", "bold");

        doc.text(
            `Invoice No : ${data.invoice.number || ""}`,
            invoiceX,
            sectionStartY + 8
        );

        doc.text(
            `Date : ${data.invoice.date || ""}`,
            invoiceX,
            sectionStartY + 11
        );

        const placeLines = doc.splitTextToSize(
            `Place : ${data.shipTo?.address || ""}`,
            boxWidth - 6
        );

        doc.text(
            placeLines,
            invoiceX,
            sectionStartY + 14
        );


        // ===== BILL TO =====

        const billAddrLines = doc.splitTextToSize(
            data.billTo?.address || "",
            boxWidth - 8
        );

        let billY = sectionStartY + 10;

        doc.text(
            data.billTo?.name || "",
            billX,
            billY
        );

        billY += 4;

        doc.text(
            billAddrLines,
            billX,
            billY
        );

        billY += (billAddrLines.length * 3);

        doc.text(
            `Phone : ${data.billTo?.phone || ""}`,
            billX,
            billY
        );

        if (showGstinDetails && data.billTo?.gstin) {
            billY += 3.5;

            doc.text(
                `GSTIN : ${data.billTo.gstin}`,
                billX,
                billY
            );
        }

        // ===== SHIP TO =====

        doc.text(
            data.shipTo?.name || "",
            shipX,
            sectionStartY + 10
        );

        const shipAddrLines = doc.splitTextToSize(
            data.shipTo?.address || "",
            boxWidth - 8
        );

        let shipY = sectionStartY + 10;

        doc.text(
            data.shipTo?.name || "",
            shipX,
            shipY
        );

        shipY += 4;

        doc.text(
            shipAddrLines,
            shipX,
            shipY
        );

        shipY += (shipAddrLines.length * 3);

        doc.text(
            `Phone : ${data.shipTo?.phone || ""}`,
            shipX,
            shipY
        );

        if (showGstinDetails) {
            shipY += 3.5;

            doc.text(
                `GSTIN : ${data.shipTo?.gstin ||
                ""
                }`,
                shipX,
                shipY
            );
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
            theme: 'plain',
            headStyles: {
                fillColor: false,
                textColor: [0, 0, 0],
                lineColor: [0, 0, 0],
                lineWidth: 0.2,
                halign: 'center',
                valign: 'middle',
                fontSize: 8,
                fontStyle: 'normal'
            },
            bodyStyles: {
                fillColor: false,
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
                        textColor: [0, 0, 0],
                        fontSize: 10,
                        lineWidth: 0.2,
                        lineColor: [0, 0, 0]
                    }
                },
                {
                    content: finalTotalAmountToPrint.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }),
                    styles: {
                        halign: "right",
                        fontStyle: "bold",
                        fontSize: 10,
                        textColor: [0, 0, 0],
                        lineWidth: 0.2,
                        lineColor: [0, 0, 0]
                    }
                }
            ]],

            showFoot: "lastPage",

            footStyles: {
                fillColor: false,
                lineWidth: 0.2,
                lineColor: [0, 0, 0],
                minCellHeight: 8
            },

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
                            const imageToUse =
                                (item as any).compressedImageBase64 ||
                                item.imageBase64;

                            doc.addImage(
                                imageToUse,
                                "JPEG",
                                x,
                                y,
                                imgSize,
                                imgSize,
                                undefined,
                                "FAST"
                            );

                            doc.addImage(imageToUse, "JPEG", x, y, imgSize, imgSize, undefined, "FAST");
                        } catch (e) {
                            console.error("A5 image render error", e);
                        }
                    }
                }
            },
        });

        // @ts-ignore
        let finalY = (doc as any).lastAutoTable.finalY + 6;

        let gstTableBottomY = finalY;
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

            const gstBankBlockHeight = 20;

            if (
                finalY + gstBankBlockHeight >
                pageHeight - 42
            ) {
                doc.addPage();
                finalY = 20;
            }

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
                        minCellHeight: 4,
                        fillColor: false
                    },
                    headStyles: {
                        fillColor: false,
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
                gstTableBottomY = (doc as any).lastAutoTable.finalY;
            }
        }
        // ===== SMART SPACE CALCULATION =====

        const footerHeight = 18;

        // --- 4. BANK DETAIL ---
        if (!resolvedIsEstimate) {

            const paymentX = (pageWidth / 2) + 4;

            autoTable(doc, {
                startY: finalY,
                margin: { left: paymentX },
                tableWidth: 56,

                theme: "grid",

                head: [[
                    {
                        content: "BANK DETAIL",
                        colSpan: 2,
                        styles: {
                            halign: "center",
                            fontStyle: "bold"
                        }
                    }
                ]],

                body: [
                    [
                        {
                            content: `Bank : ${data.bankDetails?.bankName || ""}`,
                            colSpan: 1
                        },
                        {
                            content: `A/C No : ${data.bankDetails?.accountNumber || ""}`,
                            colSpan: 1
                        }
                    ],
                    [
                        {
                            content: `IFSC : ${data.bankDetails?.ifscCode || ""}`,
                            colSpan: 2,
                            styles: {
                                halign: "left"
                            }
                        }
                    ]
                ],
                styles: {
                    fontSize: 6,
                    cellPadding: 1,
                    lineWidth: 0.1,
                    textColor: [0, 0, 0],
                    lineColor: [0, 0, 0],
                    minCellHeight: 4,
                    fillColor: false
                },

                headStyles: {
                    fillColor: false,
                    textColor: [0, 0, 0],
                    fontSize: 6,
                    fontStyle: 'bold'
                },

                columnStyles: {
                    0: {
                        cellWidth: 28
                    },
                    1: {
                        cellWidth: 28
                    }
                }
            });

            const paymentTableBottomY =
                (doc as any).lastAutoTable.finalY;

            finalY =
                Math.max(
                    gstTableBottomY,
                    paymentTableBottomY
                ) + 4;
        }

        // --- 5 & 6. TERMS & CONDITIONS (left) + AUTHORISED SIGNATURE (right) — side by side ---
        if (!resolvedIsEstimate) {

            const footerY = pageHeight - footerHeight;

            const splitTerms = doc.splitTextToSize(
                data.terms || "",
                pageWidth - 45
            );

            const termsBlockHeight = 10 + (splitTerms.length * 3.5);
            const signBlockHeight = 18; // space needed for signature image + label

            const blockHeight = Math.max(termsBlockHeight, signBlockHeight);
            const desiredBlockTopY = footerY - blockHeight - 4;

            if (desiredBlockTopY > finalY) {
                finalY = desiredBlockTopY;
            }

            if (finalY + blockHeight > footerY - 4) {
                doc.addPage();
                finalY = 20;
            }

            const blockTopY = finalY + 4;

            // Terms & Conditions — left side
            doc.setFontSize(11);
            doc.setTextColor(0, 0, 0);
            doc.text("Terms & Conditions", 5, blockTopY);

            doc.setFontSize(8);
            doc.setTextColor(80, 80, 80);
            doc.text(splitTerms, 5, blockTopY + 6);

            // Authorised Signature — right end, terms block gets full left-half width
            const signImageY = footerY - 14;
            const signTextY = footerY - 4;

            if (data.signatureBase64) {
                doc.addImage(data.signatureBase64, "JPEG", rightMargin - 28, signImageY, 28, 10, undefined, "FAST");
            }

            doc.setFontSize(9);
            doc.setTextColor(0, 0, 0);
            doc.text("Authorised Sign", rightMargin, signTextY, { align: "right" });

            finalY = footerY - 4;
        }

        // --- 7. FOOTER (colour fill removed — same plain style as A4) ---
        const footerY = pageHeight - footerHeight;

        doc.setDrawColor(200, 200, 200);
        doc.line(5, footerY, rightMargin, footerY);

        doc.setTextColor("#000000");
        doc.setFontSize(8);

        const footeraddressLines = doc.splitTextToSize(data.companyAddress || "", 70);
        doc.text(footeraddressLines, 10, footerY + 6);

        const addressEndY = footerY + 6 + (footeraddressLines.length * 3.2);

        doc.text(`Contact No. - ${data.companyContact || ""}`, 10, addressEndY + 1);

        // ===== BRANDING =====
        const pbText = "Powered by ";
        const linkText = "SELLAR.IN";

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");

        const pbWidth = doc.getTextWidth(pbText);
        const linkWidth = doc.getTextWidth(linkText);

        let brandingX = rightMargin - (pbWidth + linkWidth);

        doc.setTextColor(0, 0, 0);
        doc.text(pbText, brandingX, footerY + 8);
        brandingX += pbWidth;

        doc.setTextColor(0, 102, 204);
        doc.text(linkText, brandingX, footerY + 8);

        doc.setDrawColor(0, 102, 204);
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

        const indiaTextWidth = w1 + w2 + w3;

        let indiaX = rightMargin - indiaTextWidth;
        const indiaY = footerY + 11.5;

        doc.setTextColor(0, 0, 0);
        doc.text(part1, indiaX, indiaY);

        indiaX += w1;
        doc.setTextColor(0, 0, 0);
        doc.text(part2, indiaX, indiaY);

        indiaX += w2;
        doc.setTextColor(0, 0, 0);
        doc.text(part3, indiaX, indiaY);

        doc.setTextColor(0, 0, 0);

    }; // end drawPage

    // ================= RENDER PAGES =================
    drawPage(false);
    if (withDuplicate && !resolvedIsEstimate) {
        drawPage(true);
        if ((data as any).enableTriplicate) {
            drawPage(true);
        }
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