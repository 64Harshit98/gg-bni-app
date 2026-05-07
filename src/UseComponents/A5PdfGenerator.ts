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
    const safeScheme =
        (data.companyGstType || data.gstScheme || "")
            .toUpperCase()
            .trim();

    const isTaxEnabled =
        safeScheme === "REGULAR";

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

    if (!isEstimate && safeScheme) {

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);

        let gstText = safeScheme;

        if (
            safeScheme === "REGULAR" &&
            data.taxType
        ) {

            gstText += ` (${data.taxType === "inclusive"
                ? "Inclusive"
                : "Exclusive"
                })`;
        }

        doc.text(
            `GST Type: ${gstText}`,
            pageWidth / 2,
            18,
            { align: "center" }
        );
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

    doc.text(
        `Invoice No : ${data.invoice.number || ""}`,
        col1X,
        cursorY
    );

    doc.text(
        `Date : ${data.invoice.date || ""}`,
        col2X,
        cursorY
    );

    const posLines = doc.splitTextToSize(
        `Place of Supply : ${data.billTo.address || ""}`,
        colWidth - 2
    );

    doc.text(
        posLines,
        col3X,
        cursorY
    );

    doc.line(
        5,
        cursorY + 4,
        pageWidth - 5,
        cursorY + 4
    );

    cursorY += 8;


    // ================= BILL / SHIP TABLE =================

    const sectionStartY = cursorY;
    const sectionHeight = 28;

    const sectionWidth = pageWidth - 10;

    doc.rect(
        5,
        sectionStartY,
        sectionWidth,
        sectionHeight
    );

    // middle divider
    doc.line(
        5 + sectionWidth / 2,
        sectionStartY,
        5 + sectionWidth / 2,
        sectionStartY + sectionHeight
    );

    // headings
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);

    doc.text(
        isEstimate ? "Estimate For :" : "Billed To :",
        8,
        sectionStartY + 5
    );

    if (!isEstimate) {
        doc.text(
            "Shipped To :",
            5 + sectionWidth / 2 + 3,
            sectionStartY + 5
        );
    }

    // values
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);

    let textY = sectionStartY + 10;

    const billX = 8;
    const shipX = 5 + sectionWidth / 2 + 3;


    // ===== NAME =====

    if (isEstimate) {

        doc.text(
            data.billTo?.name || "",
            billX,
            textY
        );

    } else {

        doc.text(
            data.billTo?.name || "",
            billX,
            textY
        );

        doc.text(
            data.shipTo?.name || data.billTo?.name || "",
            shipX,
            textY
        );
    }

    textY += 4;


    // ===== ADDRESS =====

    const billAddrLines = doc.splitTextToSize(
        data.billTo?.address || "",
        sectionWidth / 2 - 8
    );

    doc.text(
        billAddrLines,
        billX,
        textY
    );

    if (!isEstimate) {

        const shipAddrLines = doc.splitTextToSize(
            data.shipTo?.address || data.billTo?.address || "",
            sectionWidth / 2 - 8
        );

        doc.text(
            shipAddrLines,
            shipX,
            textY
        );
    }

    textY += 8;


    // ===== PHONE =====

    doc.text(
        `Phone : ${data.billTo?.phone || ""}`,
        billX,
        textY
    );

    if (!isEstimate) {

        doc.text(
            `Phone : ${data.shipTo?.phone || data.billTo?.phone || ""}`,
            shipX,
            textY
        );
    }


    // ===== GSTIN =====

    if (isTaxEnabled && data.billTo?.gstin) {

        textY += 4;

        doc.text(
            `GSTIN : ${data.billTo.gstin}`,
            billX,
            textY
        );

        if (!isEstimate && data.shipTo?.gstin) {

            doc.text(
                `GSTIN : ${data.shipTo.gstin}`,
                shipX,
                textY
            );
        }
    }

    const tableStartY = sectionStartY + sectionHeight + 5;

    autoTable(doc, {
        startY: tableStartY,
        margin: { left: 5, right: 5 },
        tableWidth: 'auto',
        rowPageBreak: 'avoid', // This gives the exact cell borders like in the image
        headStyles: {
            fillColor: [255, 255, 255], // Transparent/White header
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
        body: data.items.map(item => [
            item.sno || "1",
            ...(hasImages ? [""] : []),
            `${item.name || ""}\n(${item.totalPcs || item.quantity || 0} ${item.unit || "pcs"})`,
            (item.quantity || 0),
            (item.listPrice || 0).toFixed(2),
            ...(isEstimate ? [] : (() => {

                const taxRate =
                    Number(item.gstPercent || item.taxRate || 0);

                const amount =
                    Number(item.amount || 0);

                let gstAmount = 0;

                if (isTaxEnabled && taxRate > 0) {

                    if (
                        data.taxType?.toLowerCase() === "inclusive"
                    ) {

                        const taxable =
                            amount / (1 + (taxRate / 100));

                        gstAmount =
                            amount - taxable;

                    } else {

                        gstAmount =
                            amount * (taxRate / 100);
                    }
                }

                return [
                    `${taxRate}%`,
                    gstAmount.toFixed(2)
                ];

            })()),
            (item.discountAmount || 0).toFixed(2),
            (item.amount || 0).toFixed(2)
        ]),

        foot: [[
            {
                content: "GRAND TOTAL",

                colSpan: isEstimate
                    ? (hasImages ? 6 : 5)
                    : (hasImages ? 8 : 7),

                styles: {
                    halign: "right",
                    fontStyle: "bold",
                    textColor: [12, 59, 94],
                    fontSize: 10
                }
            },

            {
                content: Number(data.finalAmount || 0).toFixed(2),

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

            if (
                hookData.section === "body" &&
                hookData.column.index === imageColumnIndex
            ) {

                const item = data.items[hookData.row.index];

                if (
                    item?.imageBase64 &&
                    item.imageBase64.startsWith("data:image")
                ) {

                    try {

                        const imgSize = 14;

                        const x =
                            hookData.cell.x +
                            (hookData.cell.width - imgSize) / 2;

                        const y =
                            hookData.cell.y +
                            (hookData.cell.height - imgSize) / 2;

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

    const termsLines = doc.splitTextToSize(
        data.terms || "",
        rightMargin - 10
    );

    const termsHeight = !isEstimate
        ? (termsLines.length * 3.5) + 10
        : 0;

    const signatureHeight =
        !isEstimate && data.signatureBase64
            ? 16
            : 10;

    // total required space
    const requiredBottomSpace =
        footerHeight +
        paymentHeight +
        termsHeight +
        signatureHeight +
        8;

    // only move to next page if ACTUALLY needed
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
        doc.text(data.bankDetails?.accountName || "", 45, finalY); // Need this in your data

        doc.text("IFSC Code:", 80, finalY);

        doc.text(
            data.bankDetails?.ifscCode ||
            data.bankDetails?.ifsc ||
            "",
            rightMargin,
            finalY,
            { align: "right" }
        );

        // Separator Line
        finalY += 6;
        doc.setDrawColor(200, 200, 200);
        doc.line(10, finalY, rightMargin, finalY);
    }

    // --- 5. TERMS & CONDITIONS ---
    if (!isEstimate) {
        finalY += 4;
        doc.setFontSize(11);
        doc.text("Terms & Conditions", 10, finalY); // Fixed spelling to standard from the image typo

        finalY += 6;
        doc.setFontSize(8);
        doc.setTextColor(80, 80, 80);
        const splitTerms = doc.splitTextToSize(data.terms || "Lorem Ipsum blah blah...", rightMargin - 10);
        doc.text(splitTerms, 10, finalY);

        finalY += (splitTerms.length * 3.5) + 2;

        // Separator Line
        doc.setDrawColor(200, 200, 200);
        doc.line(10, finalY, rightMargin, finalY);
    }

    // --- 6. AUTHORISED SIGNATURE ---
    if (!isEstimate) {

        const footerY = pageHeight - footerHeight;

        // signature always footer ke paas rahe
        const signTextY = footerY - 4;
        const signImageY = footerY - 14;

        if (data.signatureBase64) {
            doc.addImage(
                data.signatureBase64,
                "PNG",
                rightMargin - 30,
                signImageY,
                30,
                10
            );
        }

        doc.setFontSize(9);

        doc.text(
            "Authorised Sign",
            rightMargin,
            signTextY,
            { align: "right" }
        );
    }
    // --- 7. FOOTER ---
    const footerY = pageHeight - footerHeight;

    doc.setFillColor("#0c3b5e");
    doc.rect(0, footerY, pageWidth, footerHeight, "F");

    doc.setTextColor("#ffffff");
    doc.setFontSize(8);

    // Left side Footer (DYNAMIC)
    const footeraddressLines = doc.splitTextToSize(
        data.companyAddress || "",
        70
    );

    doc.text(footeraddressLines, 10, footerY + 6);

    const addressEndY =
        footerY + 6 + (footeraddressLines.length * 4);

    // Contact No
    doc.text(
        `Contact No. - ${data.companyContact || ""}`,
        10,
        addressEndY + 2
    );

    // GSTIN
    if (data.companyGstin) {
        doc.text(
            `GSTIN - ${data.companyGstin}`,
            10,
            addressEndY + 6
        );
    }

    // ===== BRANDING =====

    const pbText = "Powered by ";
    const linkText = "SELLAR.IN";

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");

    const pbWidth = doc.getTextWidth(pbText);
    const linkWidth = doc.getTextWidth(linkText);

    let brandingX =
        rightMargin - (pbWidth + linkWidth);

    // Powered by
    doc.setTextColor(255, 255, 255);
    doc.text(pbText, brandingX, footerY + 8);

    brandingX += pbWidth;

    // SELLAR.IN
    doc.setTextColor(120, 190, 255);

    doc.text(
        linkText,
        brandingX,
        footerY + 8
    );

    // underline
    doc.setDrawColor(120, 190, 255);

    doc.line(
        brandingX,
        footerY + 8.5,
        brandingX + linkWidth,
        footerY + 8.5
    );

    // clickable link
    doc.link(
        brandingX,
        footerY + 5,
        linkWidth,
        4,
        {
            url: "https://www.sellar.in",
        }
    );

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

    // reset
    doc.setTextColor(255, 255, 255);

    // --- PRINT / DOWNLOAD ---
    if (action === ACTION.PRINT) {
        doc.autoPrint();
        window.open(doc.output("bloburl"), "_blank");
    } else {
        doc.save(`Invoice_${data.invoice.number}.pdf`);
    }
};