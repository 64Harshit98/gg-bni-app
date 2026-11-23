// taxReportExport.utils.ts
//
// Export engine for Sellar's Tax Report module.
// Layouts here are reverse-engineered directly from:
//   - GSTR1_Template_2026-06-27.xlsx  (official GSTN GSTR-1 offline-utility template)
//   - 09ABAHR1644A1ZJ_4A_132026.xlsx  (a real, portal-generated GSTR-4A, used as the ground truth for B2B layout/merges)
//   - GSTR3B_09CUPPA8338G1ZA_062026_SystemGenerated.pdf (portal system-generated GSTR-3B summary)
//   - returns_...offline_others_0.json (the actual GSTR-1 JSON payload accepted by the portal, used to sanity check field semantics)
//
// Known gaps (flagged inline with `ASSUMPTION:`), because the source data model (sales/purchases
// Firestore docs) doesn't carry every field the portal needs:
//   1. Credit/Debit notes: no `noteType`/`isCreditNote` field exists on sales docs today, so CDNR/CDNRA
//      sheets are emitted with headers only (zero rows). Wire this up once notes are modeled.
//   2. GSTR-3B Table 4 (ITC) "Import of goods/services" and "ITC from ISD" require GSTR-2B, which this
//      app doesn't ingest. Only "All other ITC" (from purchases where isRcm !== true) is computable here.
//   3. Zero-rated / SEZ / exempt / non-GST supplies require a `supplyType` flag not present on sales docs
//      today, so those rows are always 0.00, same as the portal shows when nothing was reported.

import * as XLSX from 'xlsx';

// ---------------------------------------------------------------------------
// Shared constants & helpers
// ---------------------------------------------------------------------------

export const GST_STATE_NAMES: Record<string, string> = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
    '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
    '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
    '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
    '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
    '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
    '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
    '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
    '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
    '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
    '97': 'Other Territory', '99': 'Centre Jurisdiction',
};

const STATE_NAME_LOOKUP: Record<string, string> = Object.entries(GST_STATE_NAMES)
    .reduce((acc, [code, name]) => { acc[name.toLowerCase()] = code; return acc; }, {} as Record<string, string>);

export const extractPosFromAddress = (addressString: string | undefined, homeStateCode: string) => {
    if (!addressString) return homeStateCode;
    const lower = addressString.toLowerCase();
    for (const [name, code] of Object.entries(STATE_NAME_LOOKUP)) {
        if (lower.includes(name)) return code;
    }
    if (lower.includes('up') || lower.includes('uttar pradesh')) return '09';
    return homeStateCode;
};

export const posLabel = (code: string) => `${code}-${GST_STATE_NAMES[code] || 'Other Territory'}`;

/** "Uttar Pradesh" / "uttar pradesh" / "09" → "09"; '' when unknown. */
export const stateCodeFromName = (state: unknown): string => {
    const s = String(state || '').trim();
    if (!s) return '';
    const code = s.match(/^(\d{2})(?:$|[-\s])/)?.[1]; // "09" or "09-Uttar Pradesh"
    if (code && GST_STATE_NAMES[code]) return code;
    return STATE_NAME_LOOKUP[s.toLowerCase()] || '';
};

const n2 = (v: number) => Number(v || 0).toFixed(2);
export const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export const toDateObj = (timestamp: any): Date => {
    if (!timestamp) return new Date();
    if (timestamp.toDate) return timestamp.toDate();
    if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
    return new Date(timestamp);
};

/** DD-MM-YYYY, used by GSTR-1 sheets ("Invoice date" columns). */
export const ddMmYyyyDash = (timestamp: any) => {
    const d = toDateObj(timestamp);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}-${mm}-${d.getFullYear()}`;
};

/** DD/MM/YYYY, used by GSTR-4A / CMP-08 sheets. */
export const ddMmYyyySlash = (timestamp: any) => {
    const d = toDateObj(timestamp);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
};

/** "Apr-Jun 26" style quarter label used in the GSTR-4A "Read me" and B2B period column. */
export const quarterLabel = (date: Date) => {
    const q = Math.floor(date.getMonth() / 3);
    const startMonth = q * 3;
    const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yy = String(date.getFullYear()).slice(-2);
    return `${monthShort[startMonth]}-${monthShort[startMonth + 2]} ${yy}`;
};

/** "June 2026" style month label used for GSTR-3B "Tax period". */
export const monthYearLabel = (date: Date) => {
    const monthFull = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthFull[date.getMonth()]} ${date.getFullYear()}`;
};

/** "2026-27" for any date inside FY 2026-27 (April–March). */
export const financialYearLabel = (date: Date) => {
    const startYear = date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
    return `${startYear}-${String(startYear + 1).slice(-2)}`;
};

/** "MMYYYY" — the GST portal's return-period ("fp") format. */
export const returnPeriodCode = (date: Date) =>
    `${String(date.getMonth() + 1).padStart(2, '0')}${date.getFullYear()}`;

const autoFit = (ws: XLSX.WorkSheet, headerLens: number[]) => {
    ws['!cols'] = headerLens.map((l) => ({ wch: Math.max(12, l + 2) }));
};

// ---------------------------------------------------------------------------
// Company details block — the first rows of every export's first sheet
// ---------------------------------------------------------------------------

export interface CompanyProfile {
    gstin: string;
    legalName?: string;
    tradeName?: string;
    address?: string;
    homeStateCode?: string;
}

const companyBlock = (title: string, profile: CompanyProfile, periodText: string, periodDate: Date): any[][] => [
    [title],
    [],
    ['GSTIN', profile.gstin || 'NOT PROVIDED — add it in Account › Edit profile'],
    ['Legal name', profile.legalName || ''],
    ['Trade name', profile.tradeName || ''],
    ['Address', profile.address || ''],
    ['State', profile.homeStateCode ? posLabel(profile.homeStateCode) : ''],
    ['Tax period', periodText],
    ['Financial year', financialYearLabel(periodDate)],
    ['Generated on', ddMmYyyySlash(new Date())],
    [],
];

// ---------------------------------------------------------------------------
// Unit Quantity Codes — GSTN only accepts its own UQC list in HSN tables
// ---------------------------------------------------------------------------

const VALID_UQC = new Set([
    'BAG', 'BAL', 'BDL', 'BKL', 'BOU', 'BOX', 'BTL', 'BUN', 'CAN', 'CBM', 'CCM', 'CMS', 'CTN', 'DOZ', 'DRM', 'GGK',
    'GMS', 'GRS', 'GYD', 'KGS', 'KLR', 'KME', 'LTR', 'MLT', 'MTR', 'MTS', 'NOS', 'OTH', 'PAC', 'PCS', 'PRS', 'QTL',
    'ROL', 'SET', 'SQF', 'SQM', 'SQY', 'TBS', 'TGM', 'THD', 'TON', 'TUB', 'UGS', 'UNT', 'YDS',
]);

const UQC_ALIASES: Record<string, string> = {
    pc: 'PCS', pcs: 'PCS', piece: 'PCS', pieces: 'PCS', no: 'NOS', nos: 'NOS', number: 'NOS', numbers: 'NOS',
    kg: 'KGS', kgs: 'KGS', kilo: 'KGS', kilogram: 'KGS', kilograms: 'KGS', g: 'GMS', gm: 'GMS', gms: 'GMS',
    gram: 'GMS', grams: 'GMS', l: 'LTR', lt: 'LTR', ltr: 'LTR', ltrs: 'LTR', litre: 'LTR', liter: 'LTR',
    litres: 'LTR', liters: 'LTR', ml: 'MLT', m: 'MTR', mtr: 'MTR', mtrs: 'MTR', meter: 'MTR', metre: 'MTR',
    meters: 'MTR', metres: 'MTR', cm: 'CMS', box: 'BOX', boxes: 'BOX', bag: 'BAG', bags: 'BAG', btl: 'BTL',
    bottle: 'BTL', bottles: 'BTL', doz: 'DOZ', dozen: 'DOZ', set: 'SET', sets: 'SET', pair: 'PRS', pairs: 'PRS',
    pack: 'PAC', packs: 'PAC', packet: 'PAC', packets: 'PAC', pkt: 'PAC', unit: 'UNT', units: 'UNT',
    roll: 'ROL', rolls: 'ROL', bundle: 'BDL', bundles: 'BDL', can: 'CAN', cans: 'CAN', carton: 'CTN',
    cartons: 'CTN', ctn: 'CTN', tube: 'TUB', tubes: 'TUB', ton: 'TON', tonne: 'TON', tonnes: 'TON',
    quintal: 'QTL', qtl: 'QTL', sqft: 'SQF', sqm: 'SQM', sqyd: 'SQY', drum: 'DRM', drums: 'DRM',
};

export const toUqc = (unit: string | undefined, isService = false): string => {
    if (isService) return 'NA';
    const raw = String(unit || '').trim();
    if (!raw) return 'OTH';
    const upper = raw.toUpperCase();
    if (VALID_UQC.has(upper)) return upper;
    return UQC_ALIASES[raw.toLowerCase().replace(/[^a-z]/g, '')] || 'OTH';
};

// ---------------------------------------------------------------------------
// Line-item extraction (shared by metrics + every export)
// ---------------------------------------------------------------------------

export interface LineItem {
    taxRate: number;
    taxableAmount: number;
    taxAmount: number;
    qty: number;
    name: string;
    unit: string;
    hsn: string;
}

/**
 * Catalogue item id → HSN/SAC + unit. Sale lines usually don't store `hsnSac`
 * (the bill PDF resolves it from the catalogue too), so without this lookup
 * almost every line falls into "HSN not set" and the HSN sheets come out empty.
 */
export type CatalogueLookup = Map<string, { hsn?: string; unit?: string }>;

const cleanHsn = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s && s.toUpperCase() !== 'N/A' && s !== '-' ? s : '';
};

export const getItems = (row: any, lookup?: CatalogueLookup): LineItem[] => {
    if (row.items && row.items.length > 0) {
        return row.items.map((item: any) => {
            const taxAmt = Number(item.taxAmount || item.gstAmount || 0);
            let taxableAmt = Number(item.taxableAmount || item.subtotal || 0);
            const finalAmount = Number(item.finalPrice || item.amount || item.total || 0);
            const taxRate = Number(item.taxRate || item.gstPercent || item.tax || 0);
            const qty = Number(item.quantity || 1);
            if (!taxableAmt && finalAmount > 0) taxableAmt = finalAmount - taxAmt;
            const ref = lookup && (lookup.get(String(item.productId || '')) || lookup.get(String(item.id || '')));
            return {
                taxRate, taxableAmount: taxableAmt, taxAmount: taxAmt, qty,
                name: item.name || 'Item', unit: item.unit || ref?.unit || 'PCS',
                hsn: cleanHsn(item.hsn) || cleanHsn(item.hsnSac) || cleanHsn(ref?.hsn) || 'N/A',
            };
        });
    }
    const rowTaxable = Number(row.taxableAmount || row.subtotal || 0);
    const rowTax = Number(row.taxAmount || row.gstAmount || row.totalTax || 0);
    const rate = rowTaxable ? Math.round((rowTax / rowTaxable) * 100) : 0;
    return [{ taxRate: rate, taxableAmount: rowTaxable, taxAmount: rowTax, qty: 1, name: 'Item Summary', unit: 'PCS', hsn: 'N/A' }];
};

// ---------------------------------------------------------------------------
// Unified metrics engine — single source of truth for both the on-screen
// tabs and every Excel export, so the numbers you see always match the file.
// ---------------------------------------------------------------------------

/** One B2B invoice, tax split per rate — the shape GSTR-1 JSON `b2b[].inv[]` needs. */
export interface B2bInvoice {
    ctin: string; inum: string; idt: string; val: number; pos: string; rchrg: 'Y' | 'N';
    isInterState: boolean;
    rates: { rt: number; txval: number; tax: number }[];
}

export interface TaxReportMetrics {
    salesTurnover: number; purchaseTurnover: number;
    /** Sum of line-item taxable values (excl. GST) — GSTR-3B 3.1(a) "Total taxable value". */
    salesTaxable: number;
    igstOut: number; cgstOut: number; sgstOut: number;
    rcmIgst: number; rcmCgst: number; rcmSgst: number; rcmLiability: number;
    itcIgst: number; itcCgst: number; itcSgst: number; totalItc: number;
    netPayable: number;
    b2bRows: any[]; b2csRows: any[];
    hsnB2bRows: any[]; hsnB2cRows: any[];
    /** Sold lines with no HSN/SAC on the bill or the catalogue item — left out of Table 12. */
    hsnMissingRows: any[];
    docsRows: any[];
    b2bInvoices: B2bInvoice[];
}

/** B2B vs B2C, place of supply and inter/intra-state for one sale — shared by metrics and JSON. */
const classifySale = (row: any, homeStateCode: string) => {
    const gstin = String(row.partyGstin || '').trim().toUpperCase();
    const isB2B = gstin.length === 15;
    const posCode = stateCodeFromName(row.placeOfSupply)
        || (isB2B ? gstin.substring(0, 2) : extractPosFromAddress(row.partyAddress, homeStateCode));
    return { gstin, isB2B, posCode, isInterState: posCode !== homeStateCode };
};

export const buildMetrics = (
    salesData: any[], purchaseData: any[], gstScheme: 'Regular' | 'Composition' | 'None',
    homeStateCode: string, compRate: number, lookup?: CatalogueLookup,
): TaxReportMetrics => {
    let salesTurnover = 0, purchaseTurnover = 0, salesTaxable = 0;
    let igstOut = 0, cgstOut = 0, sgstOut = 0;
    let rcmIgst = 0, rcmCgst = 0, rcmSgst = 0;
    let itcIgst = 0, itcCgst = 0, itcSgst = 0;

    const b2bList: any[] = [];
    const b2bInvoices: B2bInvoice[] = [];
    const b2csAggregator = new Map<string, any>();
    const hsnB2bAggregator = new Map<string, any>();
    const hsnB2cAggregator = new Map<string, any>();
    const hsnMissingAggregator = new Map<string, any>();

    salesData.forEach((row) => {
        const invoiceTotal = Number(row.finalAmount || row.grandTotal || row.totalAmount || 0);
        salesTurnover += invoiceTotal;

        const { gstin, isB2B, posCode, isInterState } = classifySale(row, homeStateCode);
        const formattedPos = posLabel(posCode);

        const rowTax = Number(row.taxAmount || row.gstAmount || row.totalTax || 0);
        if (isInterState) igstOut += rowTax; else { cgstOut += rowTax / 2; sgstOut += rowTax / 2; }

        const items = getItems(row, lookup);
        const invoiceRates = new Map<number, { rt: number; txval: number; tax: number }>();
        items.forEach((item) => {
            salesTaxable += item.taxableAmount;
            if (isB2B) {
                const r = invoiceRates.get(item.taxRate) || { rt: item.taxRate, txval: 0, tax: 0 };
                r.txval += item.taxableAmount;
                r.tax += item.taxAmount;
                invoiceRates.set(item.taxRate, r);
            }
        });
        if (isB2B) {
            b2bInvoices.push({
                ctin: gstin,
                inum: String(row.invoiceNumber || row.billNumber || 'INV-000'),
                idt: ddMmYyyyDash(row.createdAt),
                val: round2(invoiceTotal),
                pos: posCode,
                rchrg: row.isRcm ? 'Y' : 'N',
                isInterState,
                rates: Array.from(invoiceRates.values()),
            });
        }

        items.forEach((item) => {
            if (isB2B) {
                b2bList.push({
                    _key: `${row.id || row.invoiceNumber || row.billNumber || 'inv'}_${b2bList.length}`,
                    'GSTIN/UIN of Recipient': row.partyGstin,
                    'Receiver Name': row.partyName || '',
                    'Invoice Number': row.invoiceNumber || row.billNumber || 'INV-000',
                    'Invoice date': ddMmYyyyDash(row.createdAt),
                    'Invoice Value': round2(invoiceTotal),
                    'Place Of Supply': formattedPos,
                    'Reverse Charge': row.isRcm ? 'Y' : 'N',
                    'Applicable % of Tax Rate': '',
                    'Invoice Type': 'Regular B2B',
                    'E-Commerce GSTIN': row.ecommerceGstin || '',
                    'Rate': item.taxRate,
                    'Taxable Value': round2(item.taxableAmount),
                    'Cess Amount': '',
                });
            } else {
                const key = `${formattedPos}_${item.taxRate}`;
                if (!b2csAggregator.has(key)) {
                    b2csAggregator.set(key, {
                        'Type': 'OE', 'Place Of Supply': formattedPos, 'Applicable % of Tax Rate': '',
                        'Rate': item.taxRate, 'Taxable Value': 0, 'Cess Amount': '', 'E-Commerce GSTIN': '',
                        // UI/JSON-only fields (not in the GSTN b2cs sheet headers):
                        posCode, isInterState, taxAmount: 0,
                    });
                }
                const agg = b2csAggregator.get(key);
                agg['Taxable Value'] = round2(agg['Taxable Value'] + item.taxableAmount);
                agg.taxAmount = round2(agg.taxAmount + item.taxAmount);
            }

            if (!item.hsn || item.hsn === 'N/A') {
                const key = `${isB2B ? 'B2B' : 'B2C'}_${item.name.trim().toLowerCase()}_${item.taxRate}`;
                if (!hsnMissingAggregator.has(key)) {
                    hsnMissingAggregator.set(key, {
                        Supply: isB2B ? 'B2B' : 'B2C', Description: item.name, Rate: item.taxRate,
                        'Total Quantity': 0, 'Taxable Value': 0, 'Tax Amount': 0,
                    });
                }
                const m = hsnMissingAggregator.get(key);
                m['Total Quantity'] += item.qty;
                m['Taxable Value'] = round2(m['Taxable Value'] + item.taxableAmount);
                m['Tax Amount'] = round2(m['Tax Amount'] + item.taxAmount);
            } else {
                const isService = item.hsn.startsWith('99');
                const target = isB2B ? hsnB2bAggregator : hsnB2cAggregator;
                const key = `${item.hsn}_${item.taxRate}`;
                if (!target.has(key)) {
                    target.set(key, {
                        HSN: item.hsn, Description: item.name, UQC: toUqc(item.unit, isService),
                        'Total Quantity': 0, 'Total Value': 0, Rate: item.taxRate, 'Taxable Value': 0,
                        'Integrated Tax Amount': 0, 'Central Tax Amount': 0, 'State/UT Tax Amount': 0, 'Cess Amount': 0,
                        isService, // UI-only flag (not part of the exported sheet's headers) used to split the HSN/SAC tabs
                    });
                }
                const entry = target.get(key);
                entry['Total Quantity'] += item.qty;
                entry['Taxable Value'] = round2(entry['Taxable Value'] + item.taxableAmount);
                entry['Total Value'] = round2(entry['Total Value'] + item.taxableAmount + item.taxAmount);
                if (isInterState) {
                    entry['Integrated Tax Amount'] = round2(entry['Integrated Tax Amount'] + item.taxAmount);
                } else {
                    entry['Central Tax Amount'] = round2(entry['Central Tax Amount'] + item.taxAmount / 2);
                    entry['State/UT Tax Amount'] = round2(entry['State/UT Tax Amount'] + item.taxAmount / 2);
                }
            }
        });
    });

    purchaseData.forEach((row) => {
        const purchaseTotal = Number(row.finalAmount || row.grandTotal || row.totalAmount || 0);
        purchaseTurnover += purchaseTotal;
        const posCode = stateCodeFromName(row.placeOfSupply) || (row.partyGstin ? row.partyGstin.substring(0, 2) : homeStateCode);
        const isInterState = posCode !== homeStateCode;
        // Sum from line items (with the same 0-taxAmount fallback used elsewhere) rather than a
        // single document-level field, since that field is frequently unset/0 on purchase docs.
        const rowTax = getItems(row).reduce((sum, item) => {
            const eff = item.taxAmount > 0 ? item.taxAmount : round2(item.taxableAmount * (item.taxRate / 100));
            return sum + eff;
        }, 0);
        if (row.isRcm) {
            if (isInterState) rcmIgst += rowTax; else { rcmCgst += rowTax / 2; rcmSgst += rowTax / 2; }
        } else {
            if (isInterState) itcIgst += rowTax; else { itcCgst += rowTax / 2; itcSgst += rowTax / 2; }
        }
    });

    const rcmLiability = rcmIgst + rcmCgst + rcmSgst;
    const totalItc = itcIgst + itcCgst + itcSgst;
    const netPayable = gstScheme === 'Regular'
        ? (igstOut + cgstOut + sgstOut) - totalItc + rcmLiability
        : (salesTurnover * (compRate / 100)) + rcmLiability;

    // Documents-issued register: group by simple numeric-vs-alpha series so
    // "1..27" and "INV-6..INV-8" don't collapse into one bogus range.
    const invoiceNumbers = salesData.map((r) => String(r.invoiceNumber || r.billNumber || '').trim()).filter(Boolean);
    const numericSeries = invoiceNumbers.filter((s) => /^\d+$/.test(s)).map(Number).sort((a, b) => a - b);
    const alphaSeries = invoiceNumbers.filter((s) => !/^\d+$/.test(s)).sort();
    const docsRows: any[] = [];
    if (numericSeries.length) {
        docsRows.push({
            'Nature of Document': 'Invoices for outward supply', 'Sr. No. From': String(numericSeries[0]),
            'Sr. No. To': String(numericSeries[numericSeries.length - 1]), 'Total Number': numericSeries.length, 'Cancelled': 0,
        });
    }
    if (alphaSeries.length) {
        docsRows.push({
            'Nature of Document': 'Invoices for outward supply', 'Sr. No. From': alphaSeries[0],
            'Sr. No. To': alphaSeries[alphaSeries.length - 1], 'Total Number': alphaSeries.length, 'Cancelled': 0,
        });
    }

    return {
        salesTurnover, purchaseTurnover, salesTaxable: round2(salesTaxable), igstOut, cgstOut, sgstOut,
        rcmIgst, rcmCgst, rcmSgst, rcmLiability,
        itcIgst, itcCgst, itcSgst, totalItc, netPayable,
        b2bRows: b2bList, b2csRows: Array.from(b2csAggregator.values()),
        hsnB2bRows: Array.from(hsnB2bAggregator.values()), hsnB2cRows: Array.from(hsnB2cAggregator.values()),
        hsnMissingRows: Array.from(hsnMissingAggregator.values()).sort((a, b) => b['Taxable Value'] - a['Taxable Value']),
        docsRows, b2bInvoices,
    };
};

const mapToAoA = (dataObjects: any[], headers: string[]) => {
    const aoa: any[][] = [headers];
    dataObjects.forEach((obj) => aoa.push(headers.map((h) => (obj[h] !== undefined && obj[h] !== null ? obj[h] : ''))));
    return aoa;
};

// ---------------------------------------------------------------------------
// GSTR-1 — matches GSTR1_Template_2026-06-27.xlsx sheet-for-sheet
// ---------------------------------------------------------------------------

export const downloadGSTR1Excel = (
    merchantProfile: CompanyProfile, metrics: TaxReportMetrics, periodDate: Date, periodText = monthYearLabel(periodDate),
) => {
    const wb = XLSX.utils.book_new();

    const helpRows = [
        ...companyBlock('GSTR-1 — Details of outward supplies (GSTN Excel workbook format)', merchantProfile, periodText, periodDate),
        ['Help Instructions'],
        ['1. This workbook matches the official GST portal GSTR-1 offline-utility template (one sheet per section).'],
        ['2. Enter only Rate and Taxable Value — IGST/CGST/SGST are auto-computed from the rate and place of supply.'],
        ['3. Place Of Supply must be the "code-State" form, e.g. 07-Delhi, 27-Maharashtra, 29-Karnataka.'],
        ['4. Dates are DD-MM-YYYY. Invoice Type for normal B2B = Regular B2B.'],
        ['5. HSN summary is split into hsn(b2b) and hsn(b2c) as required by Table 12. Documents issued go in docs.'],
        [`6. ${metrics.hsnMissingRows.length} sold item(s) have no HSN/SAC code and are not in the hsn sheets — add HSN in Items to include them.`],
    ];
    const wsHelp = XLSX.utils.aoa_to_sheet(helpRows);
    autoFit(wsHelp, [16, 60]);
    XLSX.utils.book_append_sheet(wb, wsHelp, 'Help Instruction');

    const b2bHeaders = ['GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount'];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mapToAoA(metrics.b2bRows, b2bHeaders)), 'b2b,sez,de');

    // ASSUMPTION: amendment sheets are left header-less placeholders (no amendment data model exists yet).
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'b2ba');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'b2cl');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'b2cla');

    const b2csHeaders = ['Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mapToAoA(metrics.b2csRows, b2csHeaders)), 'b2cs');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'b2csa');

    // ASSUMPTION: CDNR/CDNUR (credit-debit notes) are empty — no note-type field on sales docs yet.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'cdnr');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'cdnra');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'cdnur');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'cdnura');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'exp');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'expa');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'at');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'atadj');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), 'exemp');

    const hsnHeaders = ['HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value', 'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount', 'Cess Amount'];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mapToAoA(metrics.hsnB2bRows, hsnHeaders)), 'hsn(b2b)');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mapToAoA(metrics.hsnB2cRows, hsnHeaders)), 'hsn(b2c)');

    const docsHeaders = ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mapToAoA(metrics.docsRows, docsHeaders)), 'docs');

    const fname = `GSTR1_${merchantProfile.gstin || 'report'}_${String(periodDate.getMonth() + 1).padStart(2, '0')}${periodDate.getFullYear()}.xlsx`;
    XLSX.writeFile(wb, fname);
};

// ---------------------------------------------------------------------------
// GSTR-3B — mirrors the system-generated PDF's Section I (Table 3.1 & 4)
// ---------------------------------------------------------------------------

export const downloadGSTR3BExcel = (
    merchantProfile: CompanyProfile,
    metrics: TaxReportMetrics, periodDate: Date, periodText = monthYearLabel(periodDate),
) => {
    const wb = XLSX.utils.book_new();

    const header = [
        ...companyBlock('Form GSTR-3B — Summary (generated in-app from Sellar sales/purchase records)', merchantProfile, periodText, periodDate),
        ['For information and guidance only. Verify all figures before filing on the GST portal.'],
        [],
    ];

    const t31Head = ['A. Table 3.1 — Outward supplies & inward supplies liable to reverse charge', 'Total taxable value', 'Integrated tax', 'Central Tax', 'State/UT Tax', 'Cess'];
    const t31Rows = [
        ['(a) Outward taxable supplies (other than zero rated, nil rated and exempted)', n2(metrics.salesTaxable), n2(metrics.igstOut), n2(metrics.cgstOut), n2(metrics.sgstOut), '0.00'],
        ['(b) Outward taxable supplies (zero rated)', '0.00', '0.00', '', '', '0.00'],
        ['(c) Other outward supplies (Nil rated, exempted)', '0.00', '', '', '', ''],
        ['(d) Inward supplies (liable to reverse charge)', n2(metrics.rcmIgst + metrics.rcmCgst + metrics.rcmSgst), n2(metrics.rcmIgst), n2(metrics.rcmCgst), n2(metrics.rcmSgst), '0.00'],
        ['(e) Non-GST outward supplies', '0.00', '', '', '', ''],
    ];

    const t4Head = ['D. Table 4 — Eligible ITC', 'Integrated tax', 'Central tax', 'State/UT tax', 'Cess'];
    const t4Rows = [
        ['(A)(1) Import of goods', 'Not Generated', 'Not Generated', '', ''],
        ['(A)(2) Import of services', 'Not Generated', 'Not Generated', 'Not Generated', ''],
        ['(A)(3) Inward supplies liable to reverse charge (other than 1 & 2)', n2(metrics.rcmIgst), n2(metrics.rcmCgst), n2(metrics.rcmSgst), '0.00'],
        ['(A)(4) Inward supplies from ISD', 'Not Generated', 'Not Generated', 'Not Generated', ''],
        ['(A)(5) All other ITC', n2(metrics.itcIgst), n2(metrics.itcCgst), n2(metrics.itcSgst), '0.00'],
        ['(B)(1) ITC Reversed — Rule 38/42/43 & Sec 17(5)', '', '', '', ''],
        ['(B)(2) ITC Reversed — Others', 'Not Generated', 'Not Generated', 'Not Generated', ''],
        ['(C) Net ITC Available (A) − (B)', n2(metrics.itcIgst), n2(metrics.itcCgst), n2(metrics.itcSgst), '0.00'],
    ];

    const netHead = ['Net computation', 'Integrated tax', 'Central tax', 'State/UT tax'];
    const cgstSgstNet = Math.max(0, metrics.cgstOut + metrics.rcmCgst - metrics.itcCgst);
    const netRows = [
        ['Output tax + RCM liability', n2(metrics.igstOut + metrics.rcmIgst), n2(metrics.cgstOut + metrics.rcmCgst), n2(metrics.sgstOut + metrics.rcmSgst)],
        ['Less: Net ITC available', n2(metrics.itcIgst), n2(metrics.itcCgst), n2(metrics.itcSgst)],
        ['Net cash tax payable', n2(Math.max(0, metrics.igstOut + metrics.rcmIgst - metrics.itcIgst)), n2(cgstSgstNet), n2(Math.max(0, metrics.sgstOut + metrics.rcmSgst - metrics.itcSgst))],
    ];

    const note = [
        [],
        ['Notes:'],
        ['- Table 3.1(b)/(c)/(e) are 0.00 because zero-rated/exempt/non-GST supply types are not yet tracked per invoice.'],
        ['- Table 4(A)(1), (2) and (4) show "Not Generated" — they require GSTR-2B data, which this app does not ingest.'],
        ['- RCM tax paid this period becomes ITC only in a later period per GST law; it is shown here as liability only.'],
    ];

    const aoa = [...header, t31Head, ...t31Rows, [], t4Head, ...t4Rows, [], netHead, ...netRows, ...note];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    autoFit(ws, [70, 18, 14, 14, 14, 10]);
    XLSX.utils.book_append_sheet(wb, ws, 'GSTR-3B Summary');

    const fname = `GSTR3B_Summary_${merchantProfile.gstin || 'report'}_${String(periodDate.getMonth() + 1).padStart(2, '0')}${periodDate.getFullYear()}.xlsx`;
    XLSX.writeFile(wb, fname);
};

// ---------------------------------------------------------------------------
// GSTR-4A — headers/merges copied from a real portal-generated 4A workbook
// ---------------------------------------------------------------------------

export const downloadGSTR4AExcel = (
    purchaseData: any[], merchantProfile: CompanyProfile,
    homeStateCode: string, periodDate: Date, lookup?: CatalogueLookup,
) => {
    const wb = XLSX.utils.book_new();
    const qLabel = quarterLabel(periodDate);
    const today = ddMmYyyySlash(new Date());

    const readMe = [
        [],
        ['', "Taxpayer's GSTIN", merchantProfile.gstin || 'NOT PROVIDED', 'Tax period', `${qLabel} to ${qLabel}`],
        ['', 'Legal name', merchantProfile.legalName || '', 'Financial year', financialYearLabel(periodDate)],
        ['', 'Trade name', merchantProfile.tradeName || '', 'Date of generation', today],
        ['', 'Address', merchantProfile.address || '', 'State', posLabel(homeStateCode)],
        [],
        ['', 'Form GSTR-4A data instructions'],
    ];
    const wsReadMe = XLSX.utils.aoa_to_sheet(readMe);
    wsReadMe['!cols'] = [{ wch: 2 }, { wch: 18 }, { wch: 48 }, { wch: 18 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, wsReadMe, 'Read me');

    // --- B2B sheet (this layout is copied verbatim from the real filed workbook) ---
    const b2bHeader = [
        ['Goods and Services Tax  - GSTR 4A', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['Taxable inward supplies received from registered persons', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['GSTR-4A period', 'GSTIN of supplier/ECO', 'Trade/Legal name', 'Invoice details', '', '', '', 'Place of supply', 'Supply attract reverse charge', 'Rate (%)', 'Taxable value (₹)', 'Tax amount', '', '', '', 'GSTR-1/IFF/GSTR-1A/GSTR-5 filing date', 'Source', 'IRN', 'IRN date'],
        ['', '', '', 'Invoice number', 'Invoice type', 'Invoice date', 'Invoice value (₹)', '', '', '', '', 'Integrated tax  (₹)', 'Central tax (₹)', 'State/UT tax (₹)', 'Cess  (₹)', '', '', '', ''],
    ];

    const b2bRows: any[][] = [];
    purchaseData.forEach((row) => {
        if (String(row.invoiceNumber || row.billNumber || '').toLowerCase().includes('cn')) return; // ASSUMPTION: notes filtered by naming convention only
        const isB2B = !!(row.partyGstin && row.partyGstin.trim().length === 15);
        if (!isB2B) return; // GSTR-4A only ever contains invoices from registered suppliers — an unregistered
        // vendor never files a GSTR-1, so their invoices can never appear here on the real portal.
        const invoiceTotal = Number(row.finalAmount || row.grandTotal || row.totalAmount || 0);
        const posCode = row.placeOfSupply || row.partyGstin.substring(0, 2);
        const isInterState = posCode !== homeStateCode;

        getItems(row, lookup).forEach((item) => {
            // A registered supplier's tax should already be on the line item. For RCM invoices the
            // supplier doesn't charge tax at all, so item.taxAmount may legitimately be 0 — in that
            // case (and as a general safety net against a bad stored 0) recompute from the rate.
            const effectiveTax = item.taxAmount > 0 ? item.taxAmount : round2(item.taxableAmount * (item.taxRate / 100));
            let igst = 0, cgst = 0, sgst = 0;
            if (isInterState) igst = effectiveTax; else { cgst = effectiveTax / 2; sgst = effectiveTax / 2; }
            b2bRows.push([
                qLabel, row.partyGstin || '', row.partyName || '', row.invoiceNumber || row.billNumber || '', 'R',
                ddMmYyyySlash(row.createdAt), n2(invoiceTotal), GST_STATE_NAMES[posCode] || 'Other Territory', row.isRcm ? 'Y' : 'N',
                item.taxRate, n2(item.taxableAmount), n2(igst), n2(cgst), n2(sgst), '0.00', ddMmYyyySlash(row.createdAt), '', '', '',
            ]);
        });
    });

    const wsB2b = XLSX.utils.aoa_to_sheet([...b2bHeader, ...b2bRows]);
    wsB2b['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 2, c: 18 } }, { s: { r: 3, c: 0 }, e: { r: 3, c: 18 } },
        { s: { r: 4, c: 0 }, e: { r: 5, c: 0 } }, { s: { r: 4, c: 1 }, e: { r: 5, c: 1 } },
        { s: { r: 4, c: 2 }, e: { r: 5, c: 2 } }, { s: { r: 4, c: 3 }, e: { r: 4, c: 6 } },
        { s: { r: 4, c: 7 }, e: { r: 5, c: 7 } }, { s: { r: 4, c: 8 }, e: { r: 5, c: 8 } },
        { s: { r: 4, c: 9 }, e: { r: 5, c: 9 } }, { s: { r: 4, c: 10 }, e: { r: 5, c: 10 } },
        { s: { r: 4, c: 11 }, e: { r: 4, c: 14 } }, { s: { r: 4, c: 15 }, e: { r: 5, c: 15 } },
        { s: { r: 4, c: 16 }, e: { r: 5, c: 16 } }, { s: { r: 4, c: 17 }, e: { r: 5, c: 17 } },
        { s: { r: 4, c: 18 }, e: { r: 5, c: 18 } },
    ];
    XLSX.utils.book_append_sheet(wb, wsB2b, 'B2B');

    // ASSUMPTION: no amendment/credit-note model yet — placeholders only, matching the real workbook's empty tabs.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Goods and Services Tax - GSTR4A']]), 'B2BA');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Goods and Services Tax - GSTR4A']]), 'CDNR');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Goods and Services Tax - GSTR4A']]), 'CDNRA');

    const fname = `GSTR4A_${merchantProfile.gstin || 'report'}_${qLabel.replace(/\s|-/g, '')}.xlsx`;
    XLSX.writeFile(wb, fname);
};

// ---------------------------------------------------------------------------
// CMP-08 — quarterly composition-scheme tax payment statement
// ---------------------------------------------------------------------------

export const downloadCMP08Excel = (
    merchantProfile: CompanyProfile,
    metrics: TaxReportMetrics, compRate: number, periodDate: Date,
) => {
    const wb = XLSX.utils.book_new();
    const qLabel = quarterLabel(periodDate);
    const outwardTax = metrics.salesTurnover * (compRate / 100);

    const aoa = [
        ...companyBlock('Form GST CMP-08 — Statement for payment of self-assessed tax', merchantProfile, `Quarter ${qLabel}`, periodDate),
        ['Composition tax rate applied', `${compRate}%`],
        [],
        ['Sr.', 'Description', 'Taxable Value (₹)', 'Integrated Tax (₹)', 'Central Tax (₹)', 'State/UT Tax (₹)', 'Total Tax (₹)'],
        ['1', 'Outward supplies (including exempt supplies)', n2(metrics.salesTurnover), '0.00', n2(outwardTax / 2), n2(outwardTax / 2), n2(outwardTax)],
        ['2', 'Inward supplies attracting reverse charge, incl. import of services', '0.00', n2(metrics.rcmIgst), n2(metrics.rcmCgst), n2(metrics.rcmSgst), n2(metrics.rcmLiability)],
        ['3', 'Tax payable (1 + 2)', n2(metrics.salesTurnover), n2(metrics.rcmIgst), n2(outwardTax / 2 + metrics.rcmCgst), n2(outwardTax / 2 + metrics.rcmSgst), n2(outwardTax + metrics.rcmLiability)],
        ['4', 'Interest payable, if any', '', '0.00', '0.00', '0.00', '0.00'],
        ['5', 'Total tax and interest payable (3 + 4)', '', n2(metrics.rcmIgst), n2(outwardTax / 2 + metrics.rcmCgst), n2(outwardTax / 2 + metrics.rcmSgst), n2(outwardTax + metrics.rcmLiability)],
        [],
        ['Note: Composition dealers cannot claim ITC — RCM tax is a cash liability only, never a credit.'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    autoFit(ws, [4, 55, 16, 16, 16, 16, 14]);
    XLSX.utils.book_append_sheet(wb, ws, 'CMP-08');

    const fname = `CMP08_${merchantProfile.gstin || 'report'}_${qLabel.replace(/\s|-/g, '')}.xlsx`;
    XLSX.writeFile(wb, fname);
};

// ---------------------------------------------------------------------------
// HSN Summary — GSTR-1 Table 12, readable layout (B2B, B2C, combined + missing HSN)
// ---------------------------------------------------------------------------

/** B2B + B2C HSN rows merged on HSN + rate (what the business actually sold, HSN-wise). */
export const combineHsnRows = (metrics: TaxReportMetrics) => {
    const merged = new Map<string, any>();
    [...metrics.hsnB2bRows, ...metrics.hsnB2cRows].forEach((r) => {
        const key = `${r.HSN}_${r.Rate}`;
        const m = merged.get(key);
        if (!m) { merged.set(key, { ...r }); return; }
        m['Total Quantity'] += r['Total Quantity'];
        (['Total Value', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount', 'State/UT Tax Amount'] as const)
            .forEach((k) => { m[k] = round2(m[k] + r[k]); });
    });
    return Array.from(merged.values()).sort((a, b) => String(a.HSN).localeCompare(String(b.HSN)) || a.Rate - b.Rate);
};

export const downloadHsnSummaryExcel = (
    merchantProfile: CompanyProfile, metrics: TaxReportMetrics, periodDate: Date, periodText = monthYearLabel(periodDate),
) => {
    const wb = XLSX.utils.book_new();
    const headers = ['Sr.', 'HSN/SAC', 'Description', 'Type', 'UQC', 'Total Quantity', 'Rate (%)', 'Taxable Value (₹)',
        'Integrated Tax (₹)', 'Central Tax (₹)', 'State/UT Tax (₹)', 'Cess (₹)', 'Total Value (₹)'];

    const table = (title: string, rows: any[]): any[][] => {
        const sum = (k: string) => round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
        return [
            [title],
            headers,
            ...rows.map((r, i) => [
                i + 1, r.HSN, r.Description, r.isService ? 'Services' : 'Goods', r.UQC, r.isService ? 0 : round2(r['Total Quantity']),
                r.Rate, r['Taxable Value'], r['Integrated Tax Amount'], r['Central Tax Amount'], r['State/UT Tax Amount'], 0, r['Total Value'],
            ]),
            rows.length
                ? ['', 'Total', '', '', '', '', '', sum('Taxable Value'), sum('Integrated Tax Amount'), sum('Central Tax Amount'), sum('State/UT Tax Amount'), 0, sum('Total Value')]
                : ['', 'No HSN-coded sales in this period'],
            [],
        ];
    };

    const aoa = [
        ...companyBlock('HSN-wise summary of outward supplies (GSTR-1 Table 12)', merchantProfile, periodText, periodDate),
        ...table('Table 12 — B2B supplies (to registered persons)', metrics.hsnB2bRows),
        ...table('Table 12 — B2C supplies (to unregistered persons)', metrics.hsnB2cRows),
        ...table('All supplies — HSN + rate wise', combineHsnRows(metrics)),
    ];
    if (metrics.hsnMissingRows.length) {
        aoa.push([`Note: ${metrics.hsnMissingRows.length} sold item(s) have no HSN/SAC code and are listed on the "Items without HSN" sheet.`]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [6, 14, 34, 10, 7, 14, 9, 18, 17, 16, 16, 9, 16].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, 'HSN Summary');

    if (metrics.hsnMissingRows.length) {
        const missHeaders = ['Supply', 'Description', 'Rate', 'Total Quantity', 'Taxable Value', 'Tax Amount'];
        const wsMiss = XLSX.utils.aoa_to_sheet([
            ['Sold items with no HSN/SAC code — add the HSN code on the item, then download again.'],
            [],
            ...mapToAoA(metrics.hsnMissingRows, missHeaders),
        ]);
        wsMiss['!cols'] = [10, 40, 8, 14, 16, 14].map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(wb, wsMiss, 'Items without HSN');
    }

    XLSX.writeFile(wb, `HSN_Summary_${merchantProfile.gstin || 'report'}_${returnPeriodCode(periodDate)}.xlsx`);
};

// ---------------------------------------------------------------------------
// GSTR-1 JSON — GSTN offline-tool upload format
// ---------------------------------------------------------------------------
// Sections: b2b, b2cs, hsn (hsn_b2b / hsn_b2c split, as required since the
// Table 12 change), doc_issue. Empty sections are omitted, as the offline tool does.
// ASSUMPTION: the `version` string is not verified against the current offline tool
// release — if the portal ever rejects it, update it to the version in a JSON the
// offline tool itself exports. B2CL (inter-state B2C invoices above ₹1 lakh) is not
// split out yet; those still land in b2cs, same as the Excel export.

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Reasons the GSTR-1 JSON can't be generated for this profile/range, or null when it can. */
export const gstr1JsonBlocker = (profile: CompanyProfile, range: { start: number; end: number } | null): string | null => {
    if (!profile.gstin) return 'Add your GSTIN in Account › Edit profile before downloading the GSTR-1 JSON.';
    if (!GSTIN_RE.test(profile.gstin)) return `Your GSTIN "${profile.gstin}" doesn't look valid. Fix it in Account › Edit profile.`;
    if (range) {
        const s = new Date(range.start);
        const e = new Date(range.end);
        if (s.getFullYear() !== e.getFullYear() || s.getMonth() !== e.getMonth()) {
            return 'GSTR-1 is filed month by month. Pick a single month (e.g. "This month" or "Last month") to download the JSON.';
        }
    }
    return null;
};

export const buildGSTR1Json = (profile: CompanyProfile, metrics: TaxReportMetrics, periodDate: Date) => {
    const taxSplit = (tax: number, inter: boolean) =>
        inter ? { iamt: round2(tax) } : { camt: round2(tax / 2), samt: round2(tax / 2) };

    // 0%-rated lines are nil-rated supplies: they go to the `nil` table (Table 8),
    // not b2b/b2cs, which only take taxable rates.
    const nilTotals: Record<'INTRB2B' | 'INTRAB2B' | 'INTRB2C' | 'INTRAB2C', number> = {
        INTRB2B: 0, INTRAB2B: 0, INTRB2C: 0, INTRAB2C: 0,
    };

    const byCtin = new Map<string, any[]>();
    metrics.b2bInvoices.forEach((inv) => {
        const taxed = inv.rates.filter((r) => r.rt > 0 && r.txval > 0);
        inv.rates.filter((r) => r.rt === 0).forEach((r) => {
            nilTotals[inv.isInterState ? 'INTRB2B' : 'INTRAB2B'] += r.txval;
        });
        if (!taxed.length) return;
        const list = byCtin.get(inv.ctin) || [];
        list.push({
            inum: inv.inum, idt: inv.idt, val: inv.val, pos: inv.pos, rchrg: inv.rchrg, inv_typ: 'R',
            itms: taxed.map((r) => ({
                num: Math.round(r.rt * 100) + 1,
                itm_det: { txval: round2(r.txval), rt: r.rt, ...taxSplit(r.tax, inv.isInterState), csamt: 0 },
            })),
        });
        byCtin.set(inv.ctin, list);
    });
    const b2b = Array.from(byCtin.entries()).map(([ctin, inv]) => ({ ctin, inv }));

    metrics.b2csRows.filter((r) => r.Rate === 0).forEach((r) => {
        nilTotals[r.isInterState ? 'INTRB2C' : 'INTRAB2C'] += r['Taxable Value'];
    });
    const b2cs = metrics.b2csRows
        .filter((r) => r.Rate > 0 && r['Taxable Value'] > 0)
        .map((r) => ({
            sply_ty: r.isInterState ? 'INTER' : 'INTRA', rt: r.Rate, typ: 'OE', pos: r.posCode,
            txval: round2(r['Taxable Value']), ...taxSplit(r.taxAmount, r.isInterState), csamt: 0,
        }));

    const nilInv = (Object.entries(nilTotals) as [string, number][])
        .filter(([, amt]) => amt > 0)
        .map(([sply_ty, amt]) => ({ sply_ty, expt_amt: 0, nil_amt: round2(amt), ngsup_amt: 0 }));

    const hsnJson = (rows: any[]) => rows.map((h, i) => ({
        num: i + 1, hsn_sc: h.HSN, desc: String(h.Description || '').slice(0, 30), uqc: h.UQC,
        qty: h.isService ? 0 : round2(h['Total Quantity']), rt: h.Rate, txval: h['Taxable Value'],
        iamt: h['Integrated Tax Amount'], camt: h['Central Tax Amount'], samt: h['State/UT Tax Amount'], csamt: 0,
    }));

    const json: Record<string, any> = {
        gstin: profile.gstin,
        fp: returnPeriodCode(periodDate),
        version: 'GST3.2.2',
        hash: 'hash',
    };
    if (b2b.length) json.b2b = b2b;
    if (b2cs.length) json.b2cs = b2cs;
    if (nilInv.length) json.nil = { inv: nilInv };
    if (metrics.hsnB2bRows.length || metrics.hsnB2cRows.length) {
        json.hsn = {
            ...(metrics.hsnB2bRows.length ? { hsn_b2b: hsnJson(metrics.hsnB2bRows) } : {}),
            ...(metrics.hsnB2cRows.length ? { hsn_b2c: hsnJson(metrics.hsnB2cRows) } : {}),
        };
    }
    if (metrics.docsRows.length) {
        json.doc_issue = {
            doc_det: [{
                doc_num: 1, doc_typ: 'Invoices for outward supply',
                docs: metrics.docsRows.map((d, i) => ({
                    num: i + 1, from: d['Sr. No. From'], to: d['Sr. No. To'],
                    totnum: d['Total Number'], cancel: d['Cancelled'], net_issue: d['Total Number'] - d['Cancelled'],
                })),
            }],
        };
    }
    return json;
};

export const downloadGSTR1Json = (profile: CompanyProfile, metrics: TaxReportMetrics, periodDate: Date) => {
    const json = buildGSTR1Json(profile, metrics, periodDate);
    const blob = new Blob([JSON.stringify(json)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR1_${profile.gstin}_${returnPeriodCode(periodDate)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// ---------------------------------------------------------------------------
// Master dispatcher
// ---------------------------------------------------------------------------

export type TaxDownloadType = 'GSTR-1' | 'GSTR-1-JSON' | 'GSTR-3B' | 'HSN' | 'GSTR-4A' | 'CMP-08' | 'REGISTER';

export const downloadTaxReportExcel = (
    reportType: Exclude<TaxDownloadType, 'GSTR-1-JSON'>,
    opts: {
        salesData: any[]; purchaseData: any[];
        merchantProfile: CompanyProfile & { homeStateCode: string; compositionRate: number };
        metrics: TaxReportMetrics; periodDate: Date;
        /** Human label for the selected range, e.g. "1 Nov – 30 Nov 2026". */
        periodText?: string;
        lookup?: CatalogueLookup;
    },
) => {
    const { salesData, purchaseData, merchantProfile, metrics, periodDate, lookup } = opts;
    const periodText = opts.periodText || monthYearLabel(periodDate);
    switch (reportType) {
        case 'GSTR-1':
            return downloadGSTR1Excel(merchantProfile, metrics, periodDate, periodText);
        case 'GSTR-3B':
            return downloadGSTR3BExcel(merchantProfile, metrics, periodDate, periodText);
        case 'HSN':
            return downloadHsnSummaryExcel(merchantProfile, metrics, periodDate, periodText);
        case 'GSTR-4A':
            return downloadGSTR4AExcel(purchaseData, merchantProfile, merchantProfile.homeStateCode, periodDate, lookup);
        case 'CMP-08':
            return downloadCMP08Excel(merchantProfile, metrics, merchantProfile.compositionRate, periodDate);
        case 'REGISTER': {
            const wb = XLSX.utils.book_new();
            const registerSheet = (title: string, rows: any[]) => {
                const data = rows.map((r) => ({
                    Date: ddMmYyyySlash(r.createdAt), 'Bill No': r.invoiceNumber || r.billNumber || '', Party: r.partyName || '',
                    GSTIN: r.partyGstin || '', Amount: Number(r.totalAmount || r.finalAmount || 0),
                }));
                const ws = XLSX.utils.aoa_to_sheet(companyBlock(title, merchantProfile, periodText, periodDate));
                XLSX.utils.sheet_add_json(ws, data, { origin: -1 });
                ws['!cols'] = [14, 48, 28, 18, 14].map((wch) => ({ wch }));
                return ws;
            };
            XLSX.utils.book_append_sheet(wb, registerSheet('Sales Register', salesData), 'Sales Register');
            XLSX.utils.book_append_sheet(wb, registerSheet('Purchase Register', purchaseData), 'Purchase Register');
            XLSX.writeFile(wb, `Sales_Purchase_Register_${returnPeriodCode(periodDate)}.xlsx`);
            return;
        }
    }
};