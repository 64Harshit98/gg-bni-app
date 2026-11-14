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

// Personal remarks have their own collection because `customers` and `sales` are
// publicly readable (storefront / QR bill download); this one falls under the
// company-members-only catch-all in firestore.rules, so never copy a remark onto
// those docs. Doc id: the 10-digit phone, or the name for a customer without one.
export const CUSTOMER_REMARKS_COLLECTION = 'customerRemarks';

// Members-only collections (see firestore.rules). Pricing data never goes on the
// public customers/suppliers docs.
export const CUSTOMER_PRICING_COLLECTION = 'customerPricing';
export const SUPPLIER_PRICE_BOOK_COLLECTION = 'supplierPriceBook';
export const SUPPLIER_PRICING_COLLECTION = 'supplierPricing'; // supplier-wise fixed discounts (same shape as customerPricing)

/**
 * Doc id of a party (customers/suppliers): the trimmed phone, else the trimmed name.
 * Must stay identical to PaymentDrawer's `safePartyNumber || safePartyName`.
 */
export const getPartyDocId = (name?: string | null, number?: string | null): string =>
  (number ?? '').trim() || (name ?? '').trim();

/** Whether a customer record belongs in the given mode's reports. Customers who used both appear in both. */
export const customerBelongsTo = (mode: CustomerSource, c: CustomerSourceFields) =>
  mode === 'catalogue'
    ? c.source === 'catalogue' || !!c.hasOrder
    : c.source === 'pos' || !!c.hasSale || (!c.source && !c.hasOrder);
