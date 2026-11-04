import type { PriceTier } from '../constants/models';

// Form state keeps the numeric tier fields as typed strings so the inputs can be
// cleared and retyped (a number state snaps back to its fallback on every keystroke).
export type PriceTierForm = Omit<PriceTier, 'quantity' | 'mrp' | 'salesPrice' | 'purchasePrice'> & {
  quantity: string;
  mrp: string;
  salesPrice: string;
  purchasePrice: string;
};

const asInput = (v: unknown) => (v === undefined || v === null || v === 0 || v === '0' ? '' : String(v));

// Saved item / old draft (numbers) or new draft (strings) -> form state
export const toPriceTierForm = (t: PriceTier | PriceTierForm): PriceTierForm => ({
  ...t,
  quantity: asInput(t.quantity),
  mrp: asInput(t.mrp),
  salesPrice: asInput(t.salesPrice),
  purchasePrice: asInput(t.purchasePrice),
});

// Form state -> what gets validated and saved
export const fromPriceTierForm = (t: PriceTierForm): PriceTier => ({
  ...t,
  quantity: parseInt(t.quantity, 10) || 0,
  mrp: parseFloat(t.mrp) || 0,
  salesPrice: parseFloat(t.salesPrice) || 0,
  purchasePrice: parseFloat(t.purchasePrice) || 0,
});

export const emptyPriceTierForm = (): PriceTierForm => ({
  id: crypto.randomUUID(),
  label: '',
  quantity: '',
  mrp: '',
  salesPrice: '',
  purchasePrice: '',
  discount: 0,
  purchasediscount: 0,
  barcode: '',
});
