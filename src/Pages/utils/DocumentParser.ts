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

const UNIT_WORDS = [
    'PCS', 'PC', 'NOS', 'NO', 'KGS', 'KG', 'GMS', 'GM', 'GRAM', 'GRAMS',
    'MTR', 'MTRS', 'METER', 'METERS', 'DZ', 'DOZEN', 'BAG', 'BAGS',
    'BTL', 'BTLS', 'BOTTLE', 'BOTTLES', 'EA', 'EACH', 'UNIT', 'UNITS',
    'ROLL', 'ROLLS', 'TAB', 'TABS', 'STRIP', 'STRIPS', 'BOX', 'BOXES',
    'PKT', 'PKTS', 'PACKET', 'PACKETS', 'SET', 'SETS', 'LTR', 'LTRS',
    'LITER', 'LITERS', 'L', 'ML', 'QTL', 'QUINTAL', 'TON', 'TONS',
    'TONNE', 'CTN', 'CARTON', 'CARTONS', 'BUNDLE', 'BUNDLES', 'PAIR', 'PAIRS'
];
const UNIT_REGEX_PART = UNIT_WORDS.join('|');

// Strips thousands separators before parsing, so "1,250.50" -> 1250.50 instead of "1"
const normalizeNumberString = (raw: string): number => {
    const cleaned = raw.replace(/,/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
};

// Only fixes OCR's l/|/I -> 1 confusion inside number-like tokens.
// Never applied to item names, so "Milk", "Oil", "Bulb" etc. stay intact.
const fixNumericOcrNoise = (token: string): string => token.replace(/[|lI]/g, '1');


type ColumnKey = 'SLNO' | 'DESCRIPTION' | 'HSN' | 'QTY' | 'RATE' | 'DISCOUNT' | 'TAX' | 'AMOUNT';

const COLUMN_DEFS: { key: ColumnKey; regex: RegExp }[] = [
    { key: 'SLNO', regex: /SL\s*NO|SR\s*NO/i },
    { key: 'DESCRIPTION', regex: /DESCRIPTION|PARTICULARS?|ITEM\s*NAME/i },
    { key: 'HSN', regex: /HSN(\s*NO)?|SAC/i },
    { key: 'QTY', regex: /QTY|QUANTITY/i },
    { key: 'RATE', regex: /RATE|PRICE|UNIT\s*PRICE/i },
    { key: 'DISCOUNT', regex: /DISC(OUNT)?\s*%?/i },
    { key: 'TAX', regex: /TAX|GST|VAT/i },
    { key: 'AMOUNT', regex: /AMOUNT|TOTAL|NET\s*AMT/i },
];

// OCR often renders "SL . NO ." for "SL NO." -- strip periods and collapse whitespace
// before matching column keywords, so spacing/punctuation noise doesn't break detection.
const normalizeHeaderLine = (line: string): string =>
    line.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();

interface HeaderMap {
    leading: ColumnKey[];   // columns that appear BEFORE the item name in each row (e.g. SLNO)
    trailing: ColumnKey[];  // columns that appear AFTER the item name, in left-to-right order
    headerRawLine: string;  // the exact original line, so we can skip it during item parsing
}

const detectHeaderMap = (lines: string[]): HeaderMap | null => {
    for (const rawLine of lines) {
        const line = normalizeHeaderLine(rawLine);
        const found: { key: ColumnKey; index: number }[] = [];
        for (const def of COLUMN_DEFS) {
            const m = line.match(def.regex);
            if (m && m.index !== undefined) found.push({ key: def.key, index: m.index });
        }
        const keys = found.map(f => f.key);
        // Require the essential trio + a description column before trusting this as a real header
        if (keys.includes('QTY') && keys.includes('RATE') && keys.includes('AMOUNT') && keys.includes('DESCRIPTION')) {
            found.sort((a, b) => a.index - b.index);
            const descIndex = found.find(f => f.key === 'DESCRIPTION')!.index;
            const leading = found.filter(f => f.index < descIndex).map(f => f.key);
            const trailing = found.filter(f => f.index > descIndex).map(f => f.key);
            console.log('[DocumentParser] Header detected:', { leading, trailing, headerRawLine: rawLine });
            return { leading, trailing, headerRawLine: rawLine };
        }
    }
    console.log('[DocumentParser] No table header detected -- will fall back to fixed patterns.');
    return null;
};

// Lines that are almost certainly summary/metadata rather than item rows, even if they
// happen to contain enough numbers to otherwise pass the column-count check.
const NON_ITEM_LINE_BLACKLIST =
    /TOTAL|TAXABLE|PAYABLE|DISCOUNT\s*@|NOTE\s*[:.-]|THANK\s*YOU|AUTHORIZED|PHONE\s*[:.]|GSTIN\s*[:.]|GST\s*(NO|NUMBER)\s*[:.]|INVOICE\s*(NO|DATE)|DUE\s*DATE|BILL\s*TO|SHIP\s*TO|\bCGST\b|\bSGST\b|\bIGST\b|BALANCE\s*DUE|AMOUNT\s*PAID|ROUNDED\s*OFF/i;

const parseRowWithHeaderMap = (
    rawLine: string,
    leading: ColumnKey[],
    trailing: ColumnKey[]
): ParsedItem | null => {
    if (NON_ITEM_LINE_BLACKLIST.test(rawLine)) return null;

    // Strip currency text so it doesn't get counted as, or interrupt, numeric tokens
    let line = rawLine.replace(/Rs\.?/gi, ' ').replace(/₹/g, ' ');

    // Strip exactly as many leading numeric tokens as the header says come before the name
    // (typically just the serial number column)
    for (let i = 0; i < leading.length; i++) {
        const leadMatch = line.match(/^\s*[0-9]+(?:\.[0-9]+)?\s+/);
        if (leadMatch) {
            line = line.slice(leadMatch[0].length);
        } else {
            return null; // doesn't look like an item row (no leading serial number found)
        }
    }

    // Every numeric token remaining in the line, with its character position
    const numberRegex = /[0-9]+(?:,[0-9]+)*(?:\.[0-9]+)?/g;
    const allMatches = [...line.matchAll(numberRegex)];

    if (allMatches.length < trailing.length) return null; // not enough numeric columns present

    // The LAST N numeric tokens (N = trailing.length) are the pricing columns, in header order.
    // Anchoring from the end means numbers embedded in the item name itself (e.g. "Item 2")
    // are safely ignored, since they always sit before the real pricing columns.
    const trailingMatches = allMatches.slice(allMatches.length - trailing.length);
    const values: Partial<Record<ColumnKey, number>> = {};
    trailing.forEach((key, i) => {
        values[key] = normalizeNumberString(fixNumericOcrNoise(trailingMatches[i][0]));
    });

    // Item name = everything before the first trailing numeric column
    const nameEndPos = trailingMatches[0].index as number;
    let name = line.slice(0, nameEndPos).trim();
    name = name.replace(/^\d+\s+/, '').trim(); // safety net for any stray leading number
    if (!name) return null;

    const quantity = values.QTY ?? 0;
    const purchasePrice = values.RATE ?? 0;
    const finalAmount = values.AMOUNT ?? 0;

    if (quantity <= 0 || purchasePrice <= 0) return null;

    // Prefer an explicit Discount% column if the header has one; otherwise reverse-engineer
    // the discount from rate vs. net-per-unit, same as before.
    let calculatedDiscount: number;
    if (values.DISCOUNT !== undefined) {
        calculatedDiscount = values.DISCOUNT;
    } else {
        const netPricePerUnit = finalAmount / quantity;
        calculatedDiscount = ((purchasePrice - netPricePerUnit) / purchasePrice) * 100;
        calculatedDiscount = Math.round(calculatedDiscount * 100) / 100;
    }
    if (!isFinite(calculatedDiscount) || calculatedDiscount < 0 || calculatedDiscount > 95) {
        calculatedDiscount = 0;
    }

    // Try to detect a real unit word in the row (rare for GST-style invoices with HSN codes,
    // but common in simpler bills); default to PCS if none found.
    const unitMatch = rawLine.match(new RegExp(`\\b(${UNIT_REGEX_PART})\\.?\\b`, 'i'));
    const unit = unitMatch ? unitMatch[1].toUpperCase() : 'PCS';

    console.log('[DocumentParser] Parsed row via header map:', { rawLine, name, quantity, unit, purchasePrice, finalAmount, calculatedDiscount });

    return {
        id: crypto.randomUUID(),
        name,
        quantity,
        unit,
        purchasePrice,
        discountPercentage: calculatedDiscount,
        totalAmount: finalAmount
    };
};

const parseItemsWithHeaderMap = (lines: string[], headerMap: HeaderMap): ParsedItem[] => {
    const items: ParsedItem[] = [];
    for (const line of lines) {
        if (line === headerMap.headerRawLine) continue;
        const item = parseRowWithHeaderMap(line, headerMap.leading, headerMap.trailing);
        if (item) items.push(item);
    }
    return items;
};

// =====================================================================================
// STRATEGY 2 (FALLBACK): Fixed pattern matching, used only when no table header could be
// detected at all (e.g. a simple thermal-printer receipt with no column headings).
// =====================================================================================

const parseItemsWithFixedPatterns = (lines: string[]): ParsedItem[] => {
    const extractedItems: ParsedItem[] = [];

    // Pattern A: name ... qty UNIT trailing-numbers   (most common layout)
    const rowWithUnitAfterQty = new RegExp(
        `^(.*?)\\s+([0-9]+(?:\\.[0-9]+)?)\\s+((?:${UNIT_REGEX_PART})\\.?)\\b\\s*(.*)$`, 'i'
    );
    // Pattern B: name ... UNIT qty trailing-numbers   (unit printed before qty)
    const rowWithUnitBeforeQty = new RegExp(
        `^(.*?)\\s+((?:${UNIT_REGEX_PART})\\.?)\\s+([0-9]+(?:\\.[0-9]+)?)\\b\\s*(.*)$`, 'i'
    );
    // Pattern C: no unit column, money values prefixed with Rs/₹, possible HSN code in between
    const rowRsPrefixed = new RegExp(
        `^(.*?)\\s+([0-9]+(?:\\.[0-9]+)?)\\s+(?:Rs\\.?|₹)\\s*\\.?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s+(?:Rs\\.?|₹)\\s*\\.?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*$`, 'i'
    );
    // Pattern D: no unit column at all, no Rs prefix either -- name ... qty  rate ... amount
    const rowWithoutUnit = /^(.*?)\s+([0-9]+(?:\.[0-9]+)?)\s+((?:[0-9,]+(?:\.[0-9]+)?\s*){2,})$/;

    lines.forEach(rawLine => {
        if (NON_ITEM_LINE_BLACKLIST.test(rawLine)) return;

        let name = '';
        let quantity = 0;
        let unit = '';
        let trailingText = '';
        let matched = false;

        let m = rawLine.match(rowWithUnitAfterQty);
        if (m) {
            name = m[1].trim();
            quantity = normalizeNumberString(fixNumericOcrNoise(m[2]));
            unit = m[3].trim().toUpperCase();
            trailingText = m[4];
            matched = true;
        }

        if (!matched) {
            m = rawLine.match(rowWithUnitBeforeQty);
            if (m) {
                name = m[1].trim();
                unit = m[2].trim().toUpperCase();
                quantity = normalizeNumberString(fixNumericOcrNoise(m[3]));
                trailingText = m[4];
                matched = true;
            }
        }

        if (!matched) {
            m = rawLine.match(rowRsPrefixed);
            if (m) {
                name = m[1].trim();
                quantity = normalizeNumberString(fixNumericOcrNoise(m[2]));
                unit = 'PCS';
                const rate = normalizeNumberString(fixNumericOcrNoise(m[3]));
                const amount = normalizeNumberString(fixNumericOcrNoise(m[4]));
                trailingText = `${rate} ${amount}`;
                matched = true;
            }
        }

        if (!matched) {
            m = rawLine.match(rowWithoutUnit);
            if (m) {
                name = m[1].trim();
                quantity = normalizeNumberString(fixNumericOcrNoise(m[2]));
                unit = 'PCS';
                trailingText = m[3];
                matched = true;
            }
        }

        if (!matched) return;

        name = name.replace(/^\d+\s+/, '').trim();
        name = name.replace(/\s+(N\s*\/\s*A|N\/A|N\s*A|\d{4,8})$/i, '').trim();

        name = name.replace(/(?:\s+\d+)+$/, '').trim();

        if (!name || quantity <= 0 || !/[a-zA-Z]{2,}/.test(name)) return;

        const trailingNumberTokens = trailingText.match(/[0-9][0-9,]*(?:\.[0-9]+)?/g);
        if (!trailingNumberTokens || trailingNumberTokens.length === 0) return;

        const trailingNumbers = trailingNumberTokens.map(t => normalizeNumberString(fixNumericOcrNoise(t)));
        const purchasePrice = trailingNumbers[0];
        const finalAmount = trailingNumbers[trailingNumbers.length - 1];

        if (purchasePrice <= 0) return;

        let calculatedDiscount = 0;
        const netPricePerUnit = finalAmount / quantity;
        calculatedDiscount = ((purchasePrice - netPricePerUnit) / purchasePrice) * 100;
        calculatedDiscount = Math.round(calculatedDiscount * 100) / 100;
        if (!isFinite(calculatedDiscount) || calculatedDiscount < 0 || calculatedDiscount > 95) {
            calculatedDiscount = 0;
        }

        extractedItems.push({
            id: crypto.randomUUID(),
            name,
            quantity,
            unit,
            purchasePrice,
            discountPercentage: calculatedDiscount,
            totalAmount: finalAmount
        });
    });

    return extractedItems;
};

// =====================================================================================
// STRATEGY 3 (LAST RESORT): OCR emitted columns as separate blocks instead of full rows.
// =====================================================================================

function reconstructFromColumnBlocks(lines: string[]): ParsedItem[] {
    const isNumberLike = (l: string) => /^[0-9][0-9,.\s]*$/.test(l);
    const isNameLike = (l: string) =>
        !isNumberLike(l) &&
        /[a-zA-Z]{2,}/.test(l) &&
        l.length < 60 &&
        !NON_ITEM_LINE_BLACKLIST.test(l);

    const items: ParsedItem[] = [];
    let i = 0;

    while (i < lines.length) {
        const nameStart = i;
        while (i < lines.length && isNameLike(lines[i])) i++;
        const names = lines.slice(nameStart, i);

        if (names.length < 2) {
            i = Math.max(i, nameStart + 1);
            continue;
        }

        const columns: number[][] = [];
        while (i < lines.length && columns.length < 4) {
            const colStart = i;
            while (i < lines.length && isNumberLike(lines[i])) i++;
            const col = lines.slice(colStart, i);
            if (col.length !== names.length) {
                i = colStart;
                break;
            }
            columns.push(col.map(v => normalizeNumberString(fixNumericOcrNoise(v))));
        }

        if (columns.length >= 2) {
            const qtyCol = columns[0];
            const rateCol = columns[1];
            const amountCol = columns[columns.length - 1];

            for (let r = 0; r < names.length; r++) {
                const quantity = qtyCol[r] || 1;
                const purchasePrice = rateCol[r] || 0;
                const finalAmount = amountCol[r] || purchasePrice * quantity;
                if (purchasePrice <= 0) continue;

                const netPricePerUnit = finalAmount / (quantity || 1);
                let calculatedDiscount = Math.round((((purchasePrice - netPricePerUnit) / purchasePrice) * 100) * 100) / 100;
                if (!isFinite(calculatedDiscount) || calculatedDiscount < 0 || calculatedDiscount > 95) {
                    calculatedDiscount = 0;
                }

                items.push({
                    id: crypto.randomUUID(),
                    name: names[r].replace(/^\d+\s+/, '').trim(),
                    quantity,
                    unit: 'PCS',
                    purchasePrice,
                    discountPercentage: calculatedDiscount,
                    totalAmount: finalAmount
                });
            }
        }

        i = Math.max(i, nameStart + 1);
    }

    return items;
}

// =====================================================================================
// MAIN ENTRY POINT
// =====================================================================================
const mergeWrappedItemLines = (rawLines: string[]): string[] => {
    const merged: string[] = [];
    for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i];
        const next = rawLines[i + 1];
        const looksLikeOrphanStart =
            /^\d+\s+[A-Za-z]/.test(line) &&
            !new RegExp(`\\b(${UNIT_REGEX_PART})\\b`, 'i').test(line) &&
            (line.match(/[0-9]+(?:\.[0-9]+)?/g) || []).length <= 2;
        if (looksLikeOrphanStart && next) {
            merged.push(`${line} ${next}`);
            i++; // skip the line we just merged in
        } else {
            merged.push(line);
        }
    }
    return merged;
};
export const parseRawText = (text: string): ParsedData => {
    const cleanTextForSummary = text.replace(/[^a-zA-Z0-9\s/$.:-]/g, '');

    const currencyAmountRegex = /(?:Rs\.?|₹)\s*[:.]?\s*(\d[\d,]*\.\d{2})/i;
    const fallbackAmountRegex = /(?:Total|Amt|Amount|GRAND TOTAL)[\s:]*(\d+[\.,]\d{2})/i;
    const amountMatch =
        cleanTextForSummary.match(currencyAmountRegex) ||
        cleanTextForSummary.match(fallbackAmountRegex);
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

    const refRegex = /(?:Invoice\s*No|Inv\s*No|Bill\s*No|Estimate\s*No|Ref(?:erence)?\s*No)[\s:#.]+([A-Z0-9-/]+)/i;
    const refMatch = cleanTextForSummary.match(refRegex);

    const lines = mergeWrappedItemLines(text.split('\n').map(l => l.trim()).filter(Boolean));

    // STRATEGY 1: try to learn the column layout from the bill's own header row
    const headerMap = detectHeaderMap(lines);
    let extractedItems: ParsedItem[] = headerMap ? parseItemsWithHeaderMap(lines, headerMap) : [];

    // STRATEGY 2: no header found, or header-driven parsing found nothing usable
    if (extractedItems.length === 0) {
        console.log('[DocumentParser] Header-driven parsing found nothing, trying fixed patterns.');
        extractedItems = parseItemsWithFixedPatterns(lines);
    }

    // STRATEGY 3: last resort, column-block reconstruction
    if (extractedItems.length === 0) {
        console.log('[DocumentParser] Fixed patterns found nothing, trying column-block fallback.');
        extractedItems = reconstructFromColumnBlocks(lines);
    }

    return {
        amount: amountMatch ? amountMatch[1] : '',
        date: formattedDate,
        referenceNumber: refMatch ? refMatch[1] : '',
        items: extractedItems,
        rawText: text
    };
};