// "Apply item discount on sale price" (Sales Settings → discountOnSalePrice).
//
// OFF (default, the old behaviour): when an item has both MRP and a sale price,
// the bill uses the sale price as it is and Disc1 shows the MRP → sale price gap.
// The item's own Sale discount is ignored. Disc1/Disc2 are taken off MRP.
//
// ON: the sale price comes as it is, then the item's Sale discount (Disc1) is
// taken off the sale price, then Disc2 on top of that. MRP is only shown.
//   MRP 100, sale 90, Disc1 10%, Disc2 5%  →  90 → 81 → 76.95
//
// Saved bills keep `discount` as the saving against MRP (19% above), so printed
// bills, the Journal, returns and reports read it the way they always have.
// The on-sale-price Disc1 is saved next to it as `saleDiscount`, so the
// invoice can be reopened for editing with the same numbers.

const num = (v: unknown): number => {
    const n = typeof v === 'string' ? parseFloat(v) : Number(v);
    return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface DiscountPriceSource {
    mrp?: unknown;
    salesPrice?: unknown;
}

/** The price Disc1 is taken off. */
export const discountBaseOf = (line: DiscountPriceSource, onSalePrice: boolean): number => {
    const mrp = num(line.mrp);
    const sales = num(line.salesPrice);
    if (onSalePrice && sales > 0) return sales;
    return mrp > 0 ? mrp : sales;
};

/** Starting net price and Disc1 for a line, from the item's MRP, sale price and Sale discount. */
export const presetLinePricing = (
    mrpIn: unknown,
    salesPriceIn: unknown,
    presetDiscountIn: unknown,
    onSalePrice: boolean,
): { net: number; discount: number } => {
    const mrp = Math.max(0, num(mrpIn));
    const salesPrice = Math.max(0, num(salesPriceIn));
    const preset = num(presetDiscountIn);

    if (mrp > 0 && salesPrice > 0) {
        if (onSalePrice) return { net: salesPrice * (1 - preset / 100), discount: preset };
        return { net: salesPrice, discount: ((mrp - salesPrice) / mrp) * 100 };
    }
    if (salesPrice > 0) return { net: salesPrice * (1 - preset / 100), discount: preset };
    if (mrp > 0) return { net: mrp * (1 - preset / 100), discount: preset };
    return { net: 0, discount: 0 };
};

/** Disc1 taken off the sale price → the same price as a discount off MRP. */
export const saleDiscountToMrp = (mrpIn: unknown, salesIn: unknown, d1: number): number => {
    const mrp = num(mrpIn);
    const sales = num(salesIn);
    if (!(mrp > 0) || !(sales > 0)) return d1;
    return round2((1 - (sales * (1 - d1 / 100)) / mrp) * 100);
};

/** Disc1 off MRP → the same price as a discount off the sale price. */
export const mrpDiscountToSale = (mrpIn: unknown, salesIn: unknown, d1: number): number => {
    const mrp = num(mrpIn);
    const sales = num(salesIn);
    if (!(mrp > 0) || !(sales > 0)) return d1;
    return round2((1 - (mrp * (1 - d1 / 100)) / sales) * 100);
};

export interface SavedDiscountLine extends DiscountPriceSource {
    discount?: unknown;
    saleDiscount?: unknown;
    discountOnSalePrice?: boolean;
}

/** Disc1 for a saved invoice line being reopened for editing, in the current mode. */
export const loadedLineDiscount = (line: SavedDiscountLine, onSalePrice: boolean): number => {
    const saved = num(line.discount);
    const savedOnSale = line.discountOnSalePrice === true && line.saleDiscount !== undefined && line.saleDiscount !== null;
    if (onSalePrice) return savedOnSale ? num(line.saleDiscount) : mrpDiscountToSale(line.mrp, line.salesPrice, saved);
    return saved; // `discount` is always saved against MRP
};

/**
 * The discount fields written to a saved invoice line. `discount` is always the
 * saving against MRP; in on-sale-price mode the cart's Disc1 is kept as `saleDiscount`.
 */
export const savedDiscountFields = (
    line: DiscountPriceSource,
    cartDiscount: number,
    onSalePrice: boolean,
): { discount: number; discountPercentage: number; saleDiscount?: number; discountOnSalePrice?: boolean } => {
    const mrp = num(line.mrp);
    const sales = num(line.salesPrice);
    if (onSalePrice && mrp > 0 && sales > 0) {
        const asMrp = saleDiscountToMrp(mrp, sales, cartDiscount);
        return { discount: asMrp, discountPercentage: asMrp, saleDiscount: cartDiscount, discountOnSalePrice: true };
    }
    return { discount: cartDiscount, discountPercentage: cartDiscount };
};
