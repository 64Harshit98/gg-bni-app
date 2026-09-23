export interface ParsedItem {
    id: string; // Generated on the fly so React has a key
    name: string;
    quantity: number;
    unit: string;
    purchasePrice: number; // Mapped from 'Rate'
    discountPercentage: number; // Mapped from 'DIS%'
    totalAmount: number; // Mapped from 'Amount'
}

export interface ParsedData {
    amount: string;
    date: string;
    referenceNumber: string;
    items: ParsedItem[];
    rawText: string;
}

export const parseRawText = (text: string): ParsedData => {
    // 1. Clean the text globally for standard fields, but keep newlines for table parsing
    const cleanTextForSummary = text.replace(/[^a-zA-Z0-9\s/$.:-]/g, '');

    // --- EXTRACT SUMMARY FIELDS ---

    // Extract Currency/Amount (Looking for GRAND TOTAL from your image)
    const amountRegex = /(?:Total|Amt|Amount|GRAND TOTAL|₹|Rs\.?)[\s:]*(\d+[\.,]\d{2})/i;
    const amountMatch = cleanTextForSummary.match(amountRegex);

    // Extract Dates & Convert to YYYY-MM-DD for HTML input
    const dateRegex = /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/;
    const dateMatch = cleanTextForSummary.match(dateRegex);
    let formattedDate = '';

    if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].padStart(2, '0');
        let year = dateMatch[3];
        if (year.length === 2) year = `20${year}`;
        formattedDate = `${year}-${month}-${day}`;
    }

    // Extract Invoice Numbers (Looking for Estimate No: HE/000015)
    const refRegex = /(?:Inv|Ref|No|Num|Estimate No)[\s:#.]+([A-Z0-9-/]+)/i;
    const refMatch = cleanTextForSummary.match(refRegex);


    // --- EXTRACT TABLE ITEMS (MATH-REVERSE-ENGINEERED REGEX) ---
    const extractedItems: ParsedItem[] = [];
    const lines = text.split('\n');

    // Capture everything after the Unit as a single block of trailing text
    const itemRowRegex = /(.*)\s+(\d+(?:\.\d+)?)\s+((?:PCS|NOS|KGS|BOX|PKT|SET|LTR)(?:\s+(?:PCS|NOS|KGS|BOX|PKT|SET|LTR))*)\s+(.*)/i;

    lines.forEach(line => {
        const cleanLine = line.replace(/\|/g, '1').replace(/l/g, '1').trim();
        const match = cleanLine.match(itemRowRegex);

        if (match) {
            let rawName = match[1].trim();

            // Strip leading Serial Numbers and trailing HSN Codes
            rawName = rawName.replace(/^\d+\s+/, '').trim();
            rawName = rawName.replace(/\s+(N\s*\/\s*A|N\/A|N\s*A|\d{4,8})$/i, '').trim();

            const quantity = parseFloat(match[2]);
            const cleanUnit = match[3].trim().split(/\s+/)[0].toUpperCase();

            // Extract all trailing numbers (Rate, Discount, Amount, etc.)
            const trailingText = match[4];
            const trailingNumbers = trailingText.match(/\d+(?:\.\d+)?/g);

            if (trailingNumbers && trailingNumbers.length > 0) {
                // The first number is almost always the Base Rate (MRP)
                const purchasePrice = parseFloat(trailingNumbers[0]);

                // The last number is almost always the Final Line Amount
                const finalAmount = parseFloat(trailingNumbers[trailingNumbers.length - 1]);

                // REVERSE ENGINEER THE EXACT DISCOUNT PERCENTAGE!
                // This ignores fake OCR columns and calculates the *actual* applied discount.
                let calculatedDiscount = 0;
                if (quantity > 0 && purchasePrice > 0) {
                    const netPricePerUnit = finalAmount / quantity;
                    calculatedDiscount = ((purchasePrice - netPricePerUnit) / purchasePrice) * 100;

                    // Round to 2 decimals and prevent negative weirdness
                    calculatedDiscount = Math.max(0, Math.round(calculatedDiscount * 100) / 100);
                }

                extractedItems.push({
                    id: crypto.randomUUID(),
                    name: rawName,
                    quantity: quantity,
                    unit: cleanUnit,
                    purchasePrice: purchasePrice,
                    discountPercentage: calculatedDiscount, // Perfectly matches the paper's math!
                    totalAmount: finalAmount
                });
            }
        }
    });
    return {
        amount: amountMatch ? amountMatch[1] : '',
        date: formattedDate,
        referenceNumber: refMatch ? refMatch[1] : '',
        items: extractedItems,
        rawText: text
    };
};