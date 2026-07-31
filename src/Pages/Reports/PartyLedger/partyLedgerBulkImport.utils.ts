/**
 * Pure helpers for the Party Ledger "Bulk Import" (old invoices / opening
 * balances) feature: date parsing, workbook -> row extraction, and the
 * downloadable sample template generator. Extracted verbatim from
 * `PartyLedger.tsx` so the page component only orchestrates state + UI.
 */
import type ExcelJS from 'exceljs';
import XLSX from 'xlsx-js-style';

export interface BulkOpeningBalanceRow {
  partyName: string;
  partyNumber: string;
  partyType: 'Customer' | 'Supplier';
  amount: number;
  balanceType: 'due' | 'advance';
  note: string;
  date?: number;
}

/** Parses a date cell value (Excel Date, `DD/MM/YYYY`, `DD-MM-YYYY`, or ISO) into an epoch ms timestamp. */
export function parseExcelDate(val: unknown): number | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val.getTime();
  const str = String(val).trim();
  if (!str) return undefined;

  // Explicitly parse DD/MM/YYYY or DD-MM-YYYY (the template's format)
  const dmyMatch = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) return d.getTime();
    }
  }

  // ISO fallback: YYYY-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    if (!isNaN(d.getTime())) return d.getTime();
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? undefined : parsed.getTime();
}

export interface ParsedBulkImportWorkbook {
  rows: BulkOpeningBalanceRow[];
  skippedCount: number;
}

/**
 * Extracts opening-balance rows from an uploaded bulk-import workbook.
 * Looks for a header row containing "party name" in column 3, then reads
 * date / type / party name / phone / due / advance / narration columns.
 */
export function parseBulkImportWorkbook(worksheet: ExcelJS.Worksheet): ParsedBulkImportWorkbook {
  const safeGetVal = (rowObj: ExcelJS.Row, colIdx: number) => {
    const val = rowObj.getCell(colIdx).value;
    if (val === null || val === undefined) return '';
    if (val instanceof Date) return val;
    if (typeof val === 'object' && 'richText' in val) {
      return (val as any).richText.map((rt: any) => rt.text).join('').trim();
    }
    if (typeof val === 'object' && 'text' in val) return ((val as any).text || '').toString().trim();
    return val.toString().trim();
  };

  // Locate the header row (looks for "Party Name" in column 3)
  let headerRowNum = 1;
  for (let r = 1; r <= Math.min(worksheet.rowCount, 15); r++) {
    const cell = (safeGetVal(worksheet.getRow(r), 3) as string).toLowerCase();
    if (cell && cell.includes('party name')) { headerRowNum = r; break; }
  }
  const dataStartRow = headerRowNum + 2; // header row + notes row, then data

  const rows: BulkOpeningBalanceRow[] = [];
  let skippedCount = 0;

  for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const partyName = (safeGetVal(row, 3) as string).trim();
    if (!partyName) continue;

    const dateVal = safeGetVal(row, 1);
    const typeVal = (safeGetVal(row, 2) as string).toLowerCase();
    const partyNumber = (safeGetVal(row, 4) as string).trim();
    const dueVal = parseFloat(safeGetVal(row, 5) as string) || 0;
    const advanceVal = parseFloat(safeGetVal(row, 6) as string) || 0;
    const narration = (safeGetVal(row, 7) as string).trim();

    const partyType: 'Customer' | 'Supplier' = typeVal.startsWith('s') ? 'Supplier' : 'Customer';

    // Skip rows with no balance, or rows that fill BOTH columns (ambiguous)
    if (dueVal <= 0 && advanceVal <= 0) { skippedCount++; continue; }
    if (dueVal > 0 && advanceVal > 0) { skippedCount++; continue; }

    rows.push({
      partyName,
      partyNumber,
      partyType,
      amount: dueVal > 0 ? dueVal : advanceVal,
      balanceType: dueVal > 0 ? 'due' : 'advance',
      note: narration,
      date: parseExcelDate(dateVal),
    });
  }

  return { rows, skippedCount };
}

/** Generates and downloads the sample Excel template for the bulk-import feature. */
export function generateBulkImportTemplate(): void {
  const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
    font: { name: 'Arial', ...font },
    fill: fill ?? {},
    alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true },
    border: border ?? {},
  });
  const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
  const thinBorder = (sides: ('top' | 'bottom' | 'left' | 'right')[]) => {
    const b: any = {};
    sides.forEach(side => { b[side] = { style: 'thin', color: { rgb: 'CBD5E1' } }; });
    return b;
  };
  const allBorders = thinBorder(['top', 'bottom', 'left', 'right']);
  const bblr = thinBorder(['bottom', 'left', 'right']);

  const COLS = [
    { header: '● Date', note: 'DD/MM/YYYY (Optional, defaults to today)', width: 14 },
    { header: '★ Type', note: 'Customer or Supplier', width: 14 },
    { header: '★ Party Name', note: 'Full party name', width: 22 },
    { header: '● Party Number', note: 'Phone number (Recommended)', width: 16 },
    { header: '● Due Amount', note: 'They owe you (₹) — leave blank if none', width: 16 },
    { header: '● Advance Amount', note: 'You owe them (₹) — leave blank if none', width: 16 },
    { header: '● Narration', note: 'Optional note / description', width: 26 },
  ];

  const REQ = { bg: 'FEE2E2', txt: 'DC2626' };
  const OPT = { bg: 'DCFCE7', txt: '15803D' };
  const colCount = COLS.length;

  const legendRows = [
    { bg: REQ.bg, txt: REQ.txt, marker: '★  Required', desc: 'Must be filled in – row will be skipped if missing' },
    { bg: OPT.bg, txt: OPT.txt, marker: '●  Optional', desc: 'Leave blank if not applicable' },
  ];

  const sampleRows = [
    ['01/04/2024', 'Customer', 'Ramesh Traders', '9876543210', 5000, '', 'Pending from last year'],
    ['15/03/2024', 'Supplier', 'Sharma Distributors', '9123456780', '', 3000, 'Advance paid for stock'],
  ];

  const totalRows = 11;
  const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

  aoa[0][0] = 'SELLAR  ·  Old Invoices / Opening Balance Import Template';
  aoa[1][0] = 'Fill in the rows below and upload this file in Party Ledger → Bulk Import. Do NOT rename column headers. Fill only ONE of Due Amount or Advance Amount per row.';
  aoa[3][0] = 'LEGEND';
  legendRows.forEach((l, i) => { aoa[4 + i][0] = l.marker; aoa[4 + i][1] = l.desc; });

  COLS.forEach((c, i) => { aoa[7][i] = c.header; });
  COLS.forEach((c, i) => { aoa[8][i] = c.note; });
  sampleRows.forEach((row, ri) => { row.forEach((val, ci) => { aoa[9 + ri][ci] = val; }); });

  const ws: any = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = COLS.map(c => ({ wch: c.width }));
  ws['!rows'] = [{ hpt: 34 }, { hpt: 24 }, { hpt: 8 }, { hpt: 20 }, { hpt: 18 }, { hpt: 8 }, { hpt: 30 }, { hpt: 22 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
    ...legendRows.map((_, i) => ({ s: { r: 4 + i, c: 1 }, e: { r: 4 + i, c: 3 } })),
  ];

  const style = (addr: string, st: any) => {
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = st;
  };

  style('A1', s({ sz: 15, bold: true, color: { rgb: 'FFFFFF' } }, solidFill('0369A1'), { horizontal: 'center', vertical: 'center' }));
  style('A2', s({ sz: 9, italic: true, color: { rgb: '475569' } }, solidFill('DBEAFE'), { horizontal: 'center', vertical: 'center', wrapText: true }));
  style('A4', s({ sz: 10, bold: true, color: { rgb: '0369A1' } }, solidFill('E0F2FE'), { horizontal: 'left', vertical: 'center' }, allBorders));

  legendRows.forEach((l, i) => {
    const row = 5 + i;
    style(`A${row}`, s({ sz: 9, bold: true, color: { rgb: l.txt } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
    style(`B${row}`, s({ sz: 9, color: { rgb: '334155' } }, solidFill(l.bg), { horizontal: 'left', vertical: 'center' }, bblr));
    ['C', 'D'].forEach(col => {
      const addr = `${col}${row}`;
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = s({ sz: 9 }, solidFill(l.bg), {}, bblr);
    });
  });

  COLS.forEach((c, i) => {
    const isReq = c.header.startsWith('★');
    const { bg, txt } = isReq ? REQ : OPT;
    const addr = XLSX.utils.encode_cell({ r: 7, c: i });
    style(addr, s({ sz: 9, bold: true, color: { rgb: txt } }, solidFill(bg), { horizontal: 'center', vertical: 'center', wrapText: true }, allBorders));
  });

  COLS.forEach((_c, i) => {
    const addr = XLSX.utils.encode_cell({ r: 8, c: i });
    style(addr, s({ sz: 7, italic: true, color: { rgb: '64748B' } }, solidFill('F8FAFC'), { horizontal: 'center', vertical: 'center', wrapText: true }, bblr));
  });

  sampleRows.forEach((row, ri) => {
    const altBg = ri % 2 === 1 ? 'F1F5F9' : 'FFFFFF';
    row.forEach((_val, ci) => {
      const addr = XLSX.utils.encode_cell({ r: 9 + ri, c: ci });
      style(addr, s({ sz: 9, color: { rgb: '1E293B' } }, solidFill(altBg), { horizontal: 'center', vertical: 'center' }, bblr));
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'OpeningBalances');
  XLSX.writeFile(wb, 'Sellar_OpeningBalances_Import_Template.xlsx');
}
