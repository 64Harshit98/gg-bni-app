// POS and the catalogue share companies/{cid}/customers, so a report has to tell
// whose customer a record is. New records carry `source` (set on first create);
// older ones are judged by the activity stamp each side writes:
// POS billing → lastSaleAt, catalogue checkout → lastOrderAt.

export type CustomerSource = 'pos' | 'catalogue';

export interface CustomerSourceFields {
  source?: CustomerSource;
  hasSale?: boolean; // lastSaleAt is set
  hasOrder?: boolean; // lastOrderAt is set
}

/** Reads the fields customerBelongsTo needs from a raw customers/{id} doc. */
export const customerSourceFields = (data: Record<string, unknown>): CustomerSourceFields => ({
  source: data.source === 'pos' || data.source === 'catalogue' ? data.source : undefined,
  hasSale: !!data.lastSaleAt,
  hasOrder: !!data.lastOrderAt,
});

/** Whether a customer record belongs in the given mode's reports. Customers who used both appear in both. */
export const customerBelongsTo = (mode: CustomerSource, c: CustomerSourceFields) =>
  mode === 'catalogue'
    ? c.source === 'catalogue' || !!c.hasOrder
    : c.source === 'pos' || !!c.hasSale || (!c.source && !c.hasOrder);
