import jsPDF from 'jspdf';
import { ACTION } from '../enums';
import type { InvoiceData } from './pdfGenerator';

export const generateThermalReceipt = (
    data: InvoiceData,
    action: ACTION.DOWNLOAD | ACTION.PRINT | ACTION.BLOB
): Blob | void => {
    // 58mm standard thermal paper width
    const paperWidth = 58;
    const margin = 2;
    const contentWidth = paperWidth - margin * 2;

    // --- 1. PRE-CALCULATE DATA & HEIGHT ---

    // Tax Logic calculations
    const safeScheme = (data.gstScheme && data.gstScheme.trim() !== '') ? data.gstScheme.toUpperCase() : 'NONE';
    const safeTaxType = (data.taxType && data.taxType.trim() !== '') ? data.taxType.toUpperCase() : 'EXCLUSIVE';

    let subTotal = 0;
    let totalTaxAmt = 0;
    let grossTotal = 0;
    const taxBreakdown: Record<string, { taxable: number; cgst: number; sgst: number }> = {};

    // Estimate item height requirements
    let itemsAreaHeight = 0;

    const processedItems = data.items.map((item) => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.listPrice) || 0;
        let rowTotal = item.amount !== undefined && item.amount !== null
            ? Number(item.amount)
            : (rate * qty) - Number(item.discountAmount || 0);

        let effectiveTaxRate = Number(item.gstPercent || item.taxRate || 0);
        if (safeScheme === 'COMPOSITION' || safeScheme === 'NONE') effectiveTaxRate = 0;

        let taxableValue = 0;
        let taxAmt = 0;
        let netAmount = 0;

        if (effectiveTaxRate === 0) {
            netAmount = rowTotal;
            taxableValue = rowTotal;
        } else {
            if (safeTaxType === 'EXCLUSIVE') {
                taxableValue = rowTotal;
                taxAmt = taxableValue * (effectiveTaxRate / 100);
                netAmount = taxableValue + taxAmt;
            } else {
                netAmount = rowTotal;
                taxableValue = netAmount / (1 + (effectiveTaxRate / 100));
                taxAmt = netAmount - taxableValue;
            }
        }

        subTotal += taxableValue;
        totalTaxAmt += taxAmt;
        grossTotal += netAmount;

        if (effectiveTaxRate > 0) {
            const rateKey = effectiveTaxRate.toString();
            if (!taxBreakdown[rateKey]) taxBreakdown[rateKey] = { taxable: 0, cgst: 0, sgst: 0 };
            taxBreakdown[rateKey].taxable += taxableValue;
            taxBreakdown[rateKey].cgst += (taxAmt / 2);
            taxBreakdown[rateKey].sgst += (taxAmt / 2);
        }

        // Estimate line wrap for height (approx 18 chars fit in the item name column)
        const lines = Math.max(1, Math.ceil(item.name.length / 18));
        itemsAreaHeight += (lines * 3) + 2;

        return { name: item.name, qty, rate, amount: safeTaxType === 'EXCLUSIVE' ? taxableValue : netAmount };
    });

    const billDiscount = Number(data.billDiscount) || 0;
    const extraExpense = Number(data.extraExpenseAmount) || 0;
    const netPayable = grossTotal - billDiscount + extraExpense;
    const finalRoundTotal = Math.round(netPayable);

    // Dynamic Height calculation
    const baseHeight = 70; // Headers & basic layout
    const taxLinesCount = Object.keys(taxBreakdown).length * 2; // CGST + SGST per rate
    const taxAreaHeight = 15 + (taxLinesCount * 3);
    const narrationHeight = data.narration ? Math.ceil(data.narration.length / 30) * 3 + 5 : 0;
    const termsHeight = data.terms ? Math.ceil(data.terms.length / 30) * 3 + 10 : 10;

    const calculatedHeight = baseHeight + itemsAreaHeight + taxAreaHeight + narrationHeight + termsHeight;

    // --- 2. INITIALIZE DOCUMENT ---
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [paperWidth, calculatedHeight],
    });

    // Helper for dashed lines
    // Fallback if TS is still being stubborn:
    const drawDashedLine = (y: number) => {
        doc.setLineWidth(0.1);
        (doc as any).setLineDash([1, 1], 0);
        doc.line(margin, y, paperWidth - margin, y);
        (doc as any).setLineDash([]); // reset
    };

    let currentY = 5;

    // --- HEADER ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(data.companyName.toUpperCase(), paperWidth / 2, currentY, { align: 'center' });
    currentY += 4;

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    if (data.companyAddress) {
        const addressLines = doc.splitTextToSize(data.companyAddress, contentWidth);
        doc.text(addressLines, paperWidth / 2, currentY, { align: 'center' });
        currentY += addressLines.length * 3;
    }
    if (data.companyContact) {
        doc.text(`Ph: ${data.companyContact}`, paperWidth / 2, currentY, { align: 'center' });
        currentY += 3;
    }

    currentY += 1;
    drawDashedLine(currentY);
    currentY += 3.5;

    // TITLE
    const title = (safeScheme === 'COMPOSITION' || safeScheme === 'NONE') ? 'BILL OF SUPPLY' : 'TAX INVOICE';
    doc.setFont('helvetica', 'bold');
    doc.text(title, paperWidth / 2, currentY, { align: 'center' });
    currentY += 1.5;

    drawDashedLine(currentY);
    currentY += 4;

    // --- META INFO ---
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${data.invoice.date.split(',')[0]}`, margin, currentY);
    doc.text(`Bill No: ${data.invoice.number}`, paperWidth - margin, currentY, { align: 'right' });
    currentY += 3.5;

    if (data.billTo?.name && data.billTo.name !== 'Cash Customer') {
        doc.text(`Customer: ${data.billTo.name.substring(0, 20)}`, margin, currentY);
        currentY += 3.5;
    }

    drawDashedLine(currentY);
    currentY += 4;

    // --- ITEMS TABLE HEADER ---
    doc.setFont('helvetica', 'bold');
    doc.text('Particulars', margin, currentY);
    doc.text('Qty', 32, currentY, { align: 'right' });
    doc.text('Rate', 43, currentY, { align: 'right' });
    doc.text('Amount', 56, currentY, { align: 'right' });
    currentY += 2;

    drawDashedLine(currentY);
    currentY += 4;

    // --- ITEMS ---
    doc.setFont('helvetica', 'normal');

    processedItems.forEach((item) => {
        // 1. Text Wrapping for Long Names
        const nameLines = doc.splitTextToSize(item.name, 24); // Wrap at 24mm width

        // Draw Qty, Rate, Amount on the first line
        doc.text(item.qty.toString(), 32, currentY, { align: 'right' });
        doc.text(item.rate.toFixed(2), 43, currentY, { align: 'right' });
        doc.text(item.amount.toFixed(2), 56, currentY, { align: 'right' });

        // Draw Name (which might push currentY down multiple lines)
        doc.text(nameLines, margin, currentY);
        currentY += (nameLines.length * 3) + 1;
    });

    currentY += 1;

    // --- TAX & TOTALS SECTION ---
    if (Object.keys(taxBreakdown).length > 0 || billDiscount > 0 || extraExpense > 0) {
        doc.text('Sub Total :', 43, currentY, { align: 'right' });
        doc.text(subTotal.toFixed(2), 56, currentY, { align: 'right' });
        currentY += 4;
    }

    // Taxes
    Object.keys(taxBreakdown).forEach((rate) => {
        const tax = taxBreakdown[rate];
        doc.text(`CGST @${(Number(rate) / 2)}% :`, 43, currentY, { align: 'right' });
        doc.text(tax.cgst.toFixed(2), 56, currentY, { align: 'right' });
        currentY += 3.5;

        doc.text(`SGST @${(Number(rate) / 2)}% :`, 43, currentY, { align: 'right' });
        doc.text(tax.sgst.toFixed(2), 56, currentY, { align: 'right' });
        currentY += 3.5;
    });

    if (extraExpense > 0) {
        doc.text(`${data.extraExpenseName?.substring(0, 10) || 'Extra'} (+) :`, 43, currentY, { align: 'right' });
        doc.text(extraExpense.toFixed(2), 56, currentY, { align: 'right' });
        currentY += 3.5;
    }

    if (billDiscount > 0) {
        doc.text('Discount (-) :', 43, currentY, { align: 'right' });
        doc.text(billDiscount.toFixed(2), 56, currentY, { align: 'right' });
        currentY += 3.5;
    }

    currentY += 0.5;
    drawDashedLine(currentY);
    currentY += 4.5;

    // GRAND TOTAL
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Total :', 40, currentY, { align: 'right' });
    doc.text(finalRoundTotal.toFixed(2), 56, currentY, { align: 'right' });
    currentY += 2;

    drawDashedLine(currentY);
    currentY += 4;

    // --- NARRATION ---
    if (data.narration) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text('Remarks:', margin, currentY);
        currentY += 3.5;
        const narrationLines = doc.splitTextToSize(data.narration, contentWidth);
        doc.text(narrationLines, margin, currentY);
        currentY += (narrationLines.length * 3) + 2;
    }

    // --- LEFT-ALIGNED FOOTER TERMS ---
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    const termsLines = doc.splitTextToSize(data.terms || 'E.&O.E.', contentWidth);

    // Left aligned terms as requested
    doc.text(termsLines, margin, currentY);
    currentY += (termsLines.length * 3) + 4;

    // Final Greetings
    doc.setFont('helvetica', 'bold');
    doc.text('THANK YOU     Visit Again', paperWidth / 2, currentY, { align: 'center' });
    currentY += 4;

    if (data.companyGstin) {
        doc.setFont('helvetica', 'normal');
        doc.text(`GST-${data.companyGstin}`, paperWidth / 2, currentY, { align: 'center' });
        currentY += 4;
    }

    // Branding
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.text('Powered by SELLAR.IN', paperWidth / 2, currentY, { align: 'center' });

    // --- OUTPUT ROUTING ---
    if (action === ACTION.PRINT) {
        doc.autoPrint();
        window.open(doc.output('bloburl'), '_blank');
    } else if (action === ACTION.DOWNLOAD) {
        doc.save(`Receipt_${data.invoice.number}.pdf`);
    } else if (action === ACTION.BLOB) {
        return doc.output('blob');
    }
};