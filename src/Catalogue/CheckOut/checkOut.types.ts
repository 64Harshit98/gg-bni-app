// Types moved verbatim out of CheckOut.tsx (formatting/hoisting only — no
// behavior changes). Unlike Orders/Sales/Purchase, CheckOut's cart item is a
// self-contained shape used only within this public-facing checkout flow —
// it does NOT extend OrderItem/Order from '../Orders/orders.types' or any
// shared base in constants/models.ts. It carries no `taxType` field at all;
// tax mode for the whole cart is driven by the bill-level
// CatalogueSalesSettings.gstScheme/taxType instead of a per-line taxType,
// which is a structural divergence from Orders' per-line tax model. See the
// header comment in checkOut.calculations.ts for the full list of
// consequences of that divergence.
export interface CartItem {
    id: string | number
    name: string
    category: string
    groupId?: string
    mrp: number
    salesPrice: number
    quantity: number
    image: string
    note: string
    imageUrl?: string
    moq?: number
    unit?: string
    unitMultiplier?: number
    tax?: number
}

export interface CatalogueSalesSettings {
    minimumOrderValue: number;
    voucherPrefix?: string;
    currentVoucherNumber?: number;
    hidePrice?: boolean;
    requireApproval?: boolean;
    gstScheme?: string;
    taxType?: string;
}

export interface Address {
    name: string;
    phone: string;
    city: string;
    state: string;
    address: string;
    gstin?: string
}
