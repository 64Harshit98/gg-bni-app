import type { Item } from '../constants/models';

type Candidate = { barcode: string; label?: string }; // label is set for pricing options

/**
 * Returns an error message if any candidate barcode is already used by
 * ANOTHER item (as its main barcode or as one of its pricing-option barcodes).
 * `alreadySaved` = barcodes this item already has in the database; they are skipped
 * so old data never blocks an unrelated edit.
 */
export const findBarcodeConflict = (
  items: Item[],
  currentItemId: string | undefined,
  candidates: Candidate[],
  alreadySaved: string[] = []
): string | null => {
  const owners = new Map<string, string>();
  items.forEach(o => {
    if (o.id === currentItemId || o.isDeleted || (o as any).deleted) return;
    const main = o.barcode?.trim();
    if (main) owners.set(main, `"${o.name}"`);
    (o.priceTiers ?? []).forEach(t => {
      const tb = t.barcode?.trim();
      if (tb) owners.set(tb, `"${o.name}" (${t.label})`);
    });
  });

  for (const c of candidates) {
    const b = c.barcode.trim();
    if (!b || alreadySaved.includes(b)) continue;
    const owner = owners.get(b);
    if (owner) {
      return c.label
        ? `Pricing option "${c.label}": barcode ${b} is already used by ${owner}.`
        : `Barcode ${b} is already used by ${owner}.`;
    }
  }
  return null;
};