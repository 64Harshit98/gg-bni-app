import { describe, expect, it } from 'vitest';
import {
  KITCHEN_ID,
  type RawMaterial,
  type StockLedgerEntry,
} from '../../../lib/restaurant/types';
import {
  computeRawMaterialSummary,
  computeStockSummary,
  convertUnitQty,
  currentStockAtLocation,
  formatQty3,
  getDisplayUnit,
  r3,
} from './stockSummary.utils';

const makeRawMaterial = (overrides: Partial<RawMaterial> = {}): RawMaterial => ({
  id: 'rm-1',
  name: 'Veg Original Momo',
  category: 'Frozen',
  baseUnit: 'PC',
  purchaseUnit: { name: 'pkt', factor: 20 },
  stock: 200, // Kitchen: 200 PC (10 pkt)
  godownStock: {
    'godown-1': 100, // 5 pkt
    'godown-2': 40,  // 2 pkt
  },
  avgCost: 5,
  restockLevel: 60,
  active: true,
  ...overrides,
});

describe('stockSummary.utils', () => {
  const fromMs = 1_700_000_000_000;
  const midMs = 1_700_050_000_000;
  const toMs = 1_700_100_000_000;
  const afterToMs = 1_700_150_000_000;

  // Ledger entries starting from `fromMs`:
  // Within [fromMs, toMs]:
  // - Kitchen purchase: +80 PC (4 pkt)
  // - Kitchen excess: +10 PC (0.5 pkt)
  // - Kitchen return: +10 PC (0.5 pkt)
  // - Kitchen production: +20 PC (1 pkt)
  // - Kitchen consumed: -50 PC (2.5 pkt)
  // - Kitchen wastage: -10 PC (0.5 pkt)
  // - Kitchen normal loss: -6 PC (0.3 pkt)
  // - Kitchen shortage: -4 PC (0.2 pkt)
  // - Transfer Kitchen -> godown-1: -40 PC at Kitchen, +40 PC at godown-1
  // - godown-1 purchase: +60 PC (3 pkt)
  // - godown-1 wastage: -20 PC (1 pkt)
  // After toMs (date > toMs):
  // - Kitchen consumed: -30 PC (1.5 pkt)
  // - Kitchen purchase: +50 PC (2.5 pkt)
  // - godown-1 purchase: +20 PC (1 pkt)
  const ledger: StockLedgerEntry[] = [
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'purchase', qty: 80, locationId: KITCHEN_ID, date: fromMs + 1000 },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'excess', qty: 10, locationId: KITCHEN_ID, date: midMs },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'return', qty: 10, locationId: KITCHEN_ID, date: midMs + 100 },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'production', qty: 20, locationId: KITCHEN_ID, date: midMs + 200 },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'consumed', qty: -50, locationId: KITCHEN_ID, date: midMs + 300 },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'wastage', qty: -10, locationId: KITCHEN_ID, date: midMs + 400 },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'loss', qty: -6, locationId: KITCHEN_ID, date: midMs + 500 },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'shortage', qty: -4, locationId: KITCHEN_ID, date: midMs + 600 },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'transfer', qty: -40, locationId: KITCHEN_ID, date: midMs + 700 },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'transfer', qty: 40, locationId: 'godown-1', date: midMs + 700 },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'purchase', qty: 60, locationId: 'godown-1', date: toMs },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'wastage', qty: -20, locationId: 'godown-1', date: toMs },
    // Post-range rows (date > toMs)
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'consumed', qty: -30, locationId: KITCHEN_ID, date: afterToMs },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'purchase', qty: 50, locationId: KITCHEN_ID, date: afterToMs + 1000 },
    { rawMaterialId: 'rm-1', rawMaterialName: 'Veg Original Momo', type: 'purchase', qty: 20, locationId: 'godown-1', date: afterToMs + 2000 },
  ];

  it('computes currentStockAtLocation accurately for Kitchen, Godown, and All locations', () => {
    const rm = makeRawMaterial();
    expect(currentStockAtLocation(rm, KITCHEN_ID)).toBe(200);
    expect(currentStockAtLocation(rm, 'godown-1')).toBe(100);
    expect(currentStockAtLocation(rm, 'godown-2')).toBe(40);
    expect(currentStockAtLocation(rm, 'unknown-godown')).toBe(0);
    expect(currentStockAtLocation(rm, '')).toBe(340);
    expect(currentStockAtLocation(rm, 'all')).toBe(340);
  });

  it('computes Kitchen summary in base units and satisfies Closing Stock == current(L) - sum(date > toMs)', () => {
    const rm = makeRawMaterial();
    const row = computeRawMaterialSummary(rm, ledger, fromMs, toMs, KITCHEN_ID, 'base');

    // Kitchen current = 200
    // Sum in [fromMs, toMs] for Kitchen = 80 + 10 + 10 + 20 - 50 - 10 - 6 - 4 - 40 = +10
    // Sum after toMs for Kitchen = -30 + 50 = +20
    // Total since fromMs = +30 => Opening = 200 - 30 = 170
    expect(row.opening).toBe(170);
    expect(row.purchase).toBe(80);
    expect(row.excess).toBe(20); // 10 excess + 10 return
    expect(row.totalIn).toBe(270); // 170 + 80 + 20
    expect(row.consumed).toBe(50);
    expect(row.wastage).toBe(10);
    expect(row.normalLoss).toBe(6);
    expect(row.transfer).toBe(40);
    expect(row.shortage).toBe(4);
    expect(row.production).toBe(20);
    expect(row.totalOut).toBe(110); // 50 + 10 + 6 + 40 + 4

    // Closing Stock = Opening + Purchase + Excess + Production - Total Out
    const formulaClosing = r3(row.opening + row.purchase + row.excess + row.production - row.totalOut);
    expect(row.closingStock).toBe(formulaClosing);
    expect(row.closingStock).toBe(180);

    // Must equal current(Kitchen) - sum of rows with date > toMs
    const postRangeSum = ledger
      .filter((r) => r.rawMaterialId === rm.id && r.locationId === KITCHEN_ID && r.date > toMs)
      .reduce((s, r) => s + r.qty, 0);
    expect(row.closingStock).toBe(r3(currentStockAtLocation(rm, KITCHEN_ID) - postRangeSum));
  });

  it('computes Godown summary and All-locations summary where Closing Stock == current(L) - sum(date > toMs)', () => {
    const rm = makeRawMaterial();

    for (const loc of ['', KITCHEN_ID, 'godown-1', 'godown-2']) {
      for (const unitMode of ['base', 'purchase'] as const) {
        const row = computeRawMaterialSummary(rm, ledger, fromMs, toMs, loc, unitMode);

        // Formula check
        expect(row.totalIn).toBe(r3(row.opening + row.purchase + row.excess));
        expect(row.totalOut).toBe(
          r3(row.consumed + row.wastage + row.normalLoss + row.transfer + row.shortage),
        );
        expect(row.closingStock).toBe(
          r3(row.opening + row.purchase + row.excess + row.production - row.totalOut),
        );

        // Post-toMs ledger invariant check
        const postRangeBaseSum = ledger
          .filter(
            (r) =>
              r.rawMaterialId === rm.id &&
              (!loc || r.locationId === loc) &&
              r.date > toMs,
          )
          .reduce((s, r) => s + r.qty, 0);

        const expectedClosingBase = r3(currentStockAtLocation(rm, loc) - postRangeBaseSum);
        const expectedClosing = convertUnitQty(rm, expectedClosingBase, unitMode);
        expect(row.closingStock).toBe(expectedClosing);
      }
    }

    // All locations transfer is 0
    const allRow = computeRawMaterialSummary(rm, ledger, fromMs, toMs, '', 'purchase');
    expect(allRow.transfer).toBe(0);
    expect(allRow.unitName).toBe('pkt');
  });

  it('converts values with fromBase when Purchase Unit is selected and formats to 3 decimals', () => {
    const rm = makeRawMaterial();
    const [row] = computeStockSummary({
      rawMaterials: [rm],
      ledgerSinceFrom: ledger,
      fromMs,
      toMs,
      locationId: KITCHEN_ID,
      unitMode: 'purchase',
    });

    // 170 PC / 20 = 8.5 pkt; 180 PC / 20 = 9 pkt
    expect(row.opening).toBe(8.5);
    expect(row.purchase).toBe(4);
    expect(row.excess).toBe(1);
    expect(row.totalIn).toBe(13.5);
    expect(row.closingStock).toBe(9);
    expect(formatQty3(row.opening)).toBe('8.500');
    expect(formatQty3(row.closingStock)).toBe('9.000');
    expect(getDisplayUnit(rm, 'purchase')).toBe('pkt');
    expect(getDisplayUnit(rm, 'base')).toBe('PC');
  });
});
