import { describe, expect, it } from 'vitest';
import XLSX from 'xlsx-js-style';
import { readFirstSheet } from './excelImport';
import {
  RAW_MATERIAL_COLUMNS,
  RAW_MATERIAL_EXAMPLE,
  isPetpoojaRawMaterialSheet,
  parsePetpoojaRawMaterialRows,
  sheetRowsFromAoa,
} from '../../../lib/restaurant/importSheet';

// A workbook laid out exactly like the downloaded template (title, gap, header, help row, data)
const templateLike = (rows: (string | number)[][]) => {
  const aoa = [
    ['Raw materials — fill rows below this line (★ = required)'],
    [],
    RAW_MATERIAL_COLUMNS.map((c) => (c.required ? `★ ${c.header}` : c.header)),
    RAW_MATERIAL_COLUMNS.map((c) => c.note),
    ...rows,
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Import');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ignored']]), 'Example');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buf], 'raw.xlsx');
};

describe('raw material template round trip', () => {
  it('reads the first sheet of a filled template into ready rows with Excel row numbers', async () => {
    const file = templateLike(RAW_MATERIAL_EXAMPLE);
    const rows = sheetRowsFromAoa(await readFirstSheet(file), RAW_MATERIAL_COLUMNS)!;
    expect(rows.map((r) => r.row)).toEqual([5, 6, 7]);
    // our template uses Petpooja's layout, so it goes through the same parser
    expect(isPetpoojaRawMaterialSheet(rows)).toBe(true);
    const { ready, issues } = parsePetpoojaRawMaterialRows(rows, []);
    expect(issues).toEqual([]);
    expect(ready.map((r) => [r.name, r.baseUnit, r.openingStock])).toEqual([
      ['Tomato', 'GRM', 12000],
      ['Burger Bun', 'PC', 60],
      ['Coke 250ml', 'PC', 48],
    ]);
  });

  it('reads every column of the template', async () => {
    const rows = sheetRowsFromAoa(await readFirstSheet(templateLike(RAW_MATERIAL_EXAMPLE)), RAW_MATERIAL_COLUMNS)!;
    const coke = parsePetpoojaRawMaterialRows(rows, []).ready.find((r) => r.name === 'Coke 250ml')!;
    expect(coke).toMatchObject({
      purchaseUnit: { name: 'case', factor: 24 },
      otherPurchaseUnits: [{ name: 'crate', factor: 48 }],
      purchasePrice: 20,
      openingCost: 20,
      taxType: 'GST',
      taxRate: 28,
      hsn: '2202',
      restockLevel: 24,
      restockUnit: 'case',
      parLevel: 96,
      parUnit: 'case',
      category: 'Beverages',
      subCategory: 'Cold drinks',
      rank: 3,
      favourite: false,
      closingStockOn: ['Weekly', 'Monthly'],
      exclusive: false,
      isExpiry: false,
      brand: 'Coca-Cola',
      allowDecimal: false,
      active: true,
    });
    const tomato = parsePetpoojaRawMaterialRows(rows, []).ready.find((r) => r.name === 'Tomato')!;
    expect(tomato).toMatchObject({ isExpiry: true, shelfLifeDays: 5, closingStockOn: ['Daily'], shortCode: 'TOM', normalLossPct: 2, purchasePrice: 0.04 });
  });
});
