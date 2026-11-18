// Excel file helpers for the restaurant imports (template download, reading, error list).
import XLSX from 'xlsx-js-style';
import type { ImportColumn, ImportIssue } from '../../../lib/restaurant/importSheet';

const solid = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
const border = { top: { style: 'thin', color: { rgb: 'CBD5E1' } }, bottom: { style: 'thin', color: { rgb: 'CBD5E1' } }, left: { style: 'thin', color: { rgb: 'CBD5E1' } }, right: { style: 'thin', color: { rgb: 'CBD5E1' } } };

export interface ExtraSheet {
  name: string;
  rows: (string | number)[][];
  widths: number[];
}

/** Header + help row + rows, styled like the item import template. */
const buildSheet = (title: string, columns: ImportColumn[], rows: (string | number)[][]) => {
  const aoa: (string | number)[][] = [
    [title],
    [],
    columns.map((c) => (c.required ? `★ ${c.header}` : c.header)),
    columns.map((c) => c.note),
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = columns.map((c) => ({ wch: c.width }));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }];
  ws['!rows'] = [{ hpt: 28 }, { hpt: 6 }, { hpt: 22 }, { hpt: 30 }];
  ws.A1.s = { font: { name: 'Arial', sz: 13, bold: true, color: { rgb: 'FFFFFF' } }, fill: solid('155DFC'), alignment: { vertical: 'center', horizontal: 'left' } };
  columns.forEach((c, i) => {
    const h = XLSX.utils.encode_cell({ r: 2, c: i });
    ws[h].s = {
      font: { name: 'Arial', sz: 10, bold: true, color: { rgb: c.required ? 'B91C1C' : '0F172B' } },
      fill: solid(c.required ? 'FEE2E2' : 'E6EEFF'),
      alignment: { horizontal: 'center', vertical: 'center' },
      border,
    };
    const n = XLSX.utils.encode_cell({ r: 3, c: i });
    ws[n].s = { font: { name: 'Arial', sz: 8, italic: true, color: { rgb: '5B6B86' } }, fill: solid('F8FAFC'), alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border };
  });
  return ws;
};

/**
 * Download an import template: sheet 1 is empty and is the one imported; sheet 2 shows a
 * filled example; any extra sheets (e.g. "Your raw materials") are reference only.
 */
export const downloadImportTemplate = (
  fileName: string,
  title: string,
  columns: ImportColumn[],
  example: (string | number)[][],
  extra: ExtraSheet[] = [],
) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(`${title} — fill rows below this line (★ = required)`, columns, []), 'Import');
  XLSX.utils.book_append_sheet(wb, buildSheet(`${title} — example (not imported)`, columns, example), 'Example');
  extra.forEach((s) => {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws['!cols'] = s.widths.map((wch) => ({ wch }));
    (s.rows[0] || []).forEach((_, i) => {
      const a = XLSX.utils.encode_cell({ r: 0, c: i });
      if (ws[a]) ws[a].s = { font: { name: 'Arial', sz: 10, bold: true }, fill: solid('E6EEFF'), border };
    });
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, fileName);
};

/** First sheet of an .xlsx / .xls / .csv file as rows of cells (row 1 of the file = index 0). */
export const readFirstSheet = async (file: File): Promise<unknown[][]> => {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws || !ws['!ref']) return [];
  const startRow = XLSX.utils.decode_range(ws['!ref']).s.r;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true, blankrows: true });
  // keep index == file row - 1 even when the used range doesn't start at row 1
  return [...Array.from({ length: startRow }, () => [] as unknown[]), ...rows];
};

/** Download the rows that could not be imported, with the reason. */
export const downloadImportIssues = (fileName: string, issues: ImportIssue[]) => {
  const ws = XLSX.utils.aoa_to_sheet([['Excel Row', 'Name', 'Reason'], ...issues.map((i) => [i.row, i.name, i.reason])]);
  ws['!cols'] = [{ wch: 10 }, { wch: 30 }, { wch: 70 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Not imported');
  XLSX.writeFile(wb, fileName);
};
