export interface Invoice {
  id: string;
  invoiceNumber: string;
  companyId: string;
  partyName?: string;
  partyNumber?: string;
  totalAmount: number;
  items: any[]; // You can be more specific if you have a SalesItem type
  createdAt?: any;
  salesmanId?: string;
  // Add other fields you use, like taxAmount, subtotal, etc.
}

export interface Item {
  id?: string;
  name: string;
  mrp: number;
  purchasePrice: number;
  discount: number;
  purchasediscount?: number;
  tax: number;
  taxRate?: number;
  itemGroupId?: string;
  itemGroupIds?: string[];
  isDeleted?: boolean;
  salesPrice: number;
  stock: number;
  amount?: number;
  barcode?: string;
  createdAt: number | object;
  updatedAt: number | object;
  category?: string;
  hsnSac?: string;
  gst?: number;
  unit?: string;
  companyId?: string | null;
  restockQuantity: number;
  isListed?: boolean;
  imageUrl?: string | null;
  imageUrls?: string[];
  description?: string;
  firestoreDocId?: string;
  packetSize?: number;
  unitMultiplier?: number;
  moq?: number;
  mrpOriginal?: number;
  mfgDate?: string;
  expDate?: string;
  variants?: string[];
  godownStock?: Record<string, number>;
  priceTiers?: PriceTier[];
  quantitySlabs?: QuantitySlab[];
  addOnGroups?: AddOnGroup[];     // legacy: groups saved inside the item (older items)
  addOnGroupIds?: string[];       // ids of groups from the add-on library (Item groups page)
    // Per-group overrides for this item. No entry = all options + the group's own limit.
  // optionIds missing = all options; maxSelect missing/0 = use the group's limit
  addOnPicks?: { groupId: string; optionIds?: string[]; maxSelect?: number }[];
}

export interface ItemGroup {
  id?: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  imageUrl?: string;
}

export interface PurchaseItem {
  id: string;
  name: string;
  purchasePrice: number;
  quantity: number;
  stock?: number;
  taxType?: 'inclusive' | 'exclusive' | 'exempt';
  taxRate?: number;
  tax?: number;
}

export interface Purchase {
  id: string;
  userId: string;
  partyName: string;
  partyNumber: string;
  invoiceNumber: string;
  items: PurchaseItem[];
  totalAmount: number;
  paymentMethods: {
    method: string;
    amount: number;
  }[];
  createdAt: any;
  companyId: string;
}

export interface PaymentMode {
  id: 'cash' | 'card' | 'upi' | 'due';
  name: string;
  description: string;
}

export interface PaymentDetails {
  [key: string]: number;
}

export interface PurchaseCompletionData {
  paymentDetails: PaymentDetails;
  discount: number;
  finalAmount: number;
}

export interface PaymentDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  subtotal: number;
  partyName: string;
  onPaymentComplete: (completionData: PurchaseCompletionData) => Promise<void>;
}

export interface SalesItem {
  id: string;
  name: string;
  mrp: number;
  quantity: number;
  discount?: number;
  discountPercentage?: number;
  finalPrice?: number;
  stock?: number;
  productId?: string
}

export interface PriceTier {
  id: string;
  label: string;              // "Piece", "Box of 10", "Combo Pack"
  quantity: number;           // kitne base pcs = 1 tier (e.g. 10, 3, 1)
  mrp: number;
  salesPrice: number;
  purchasePrice?: number;
  discount?: number;
  purchasediscount?: number;
  barcode?: string;           // is tier ka apna alag barcode (optional)
}

export interface QuantitySlab {
  id: string;
  minQty: number;
  maxQty: number | null;      // null = "and above"
  salesPrice: number;         // per-unit price for the WHOLE quantity when qty falls in this slab
}
export interface AddOnOption {
  id: string;
  name: string;               // "Extra cheese", "Thin crust"
  price: number | string;     // extra amount on top of the item price (0 = free). String only while typing in the form; saved as number
  itemId?: string;            // set when this option is an inventory item (e.g. Coke sold with a burger)
  itemQty?: number;           // pieces of that item taken from stock per 1 add-on (default 1)
    syncPrice?: boolean;        // linked option: use the inventory item's current price instead of the saved one
  extraPrice?: number | null; // charge when picked beyond the group's limit. empty = option's Price, then the group's flat extra
  soldOut?: boolean;          // runtime only (set by resolveAddOnGroups): linked item has not enough stock
}

export interface AddOnGroup {
  id: string;                 // for saved groups this is the Firestore doc id of companies/{id}/addOnTemplates
  name: string;               // "Crust", "Toppings"
  multiple: boolean;          // false = choose one, true = choose many
    maxSelect?: number;         // only when multiple: max choices (e.g. 4 sauces out of 10). 0 / empty = no limit
  extraPrice?: number | null; // only with maxSelect: price added to each choice beyond maxSelect. empty = going over the limit is not allowed
  options: AddOnOption[];
}

/** Returns the slab matching this quantity, or null if none matches. */
export const getSlabForQty = (
  item: { quantitySlabs?: QuantitySlab[] },
  qty: number
): QuantitySlab | null => {
  const slabs = item.quantitySlabs;
  if (!slabs || slabs.length === 0) return null;
  return (
    slabs.find(s => qty >= s.minQty && (s.maxQty === null || qty <= s.maxQty)) ?? null
  );
};

/** Per-unit sales price before discount. Falls back to base salesPrice if no slab matches. */
export const getEffectiveSalesPrice = (
  item: { salesPrice: number; quantitySlabs?: QuantitySlab[] },
  qty: number
): number => getSlabForQty(item, qty)?.salesPrice ?? item.salesPrice;

/** Returns an English error message if slabs are invalid, otherwise null. */
export const validateQuantitySlabs = (
  slabs: QuantitySlab[],
  mrp: number
): string | null => {
  if (slabs.length === 0) return null;
  const sorted = [...slabs].sort((a, b) => a.minQty - b.minQty);

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (!s.minQty || s.minQty < 1) return 'Quantity slab "From Qty" must be at least 1.';
    if (s.maxQty !== null && s.maxQty < s.minQty) {
      return `Quantity slab starting at ${s.minQty}: "To Qty" cannot be less than "From Qty".`;
    }
    if (!s.salesPrice || s.salesPrice <= 0) {
      return `Quantity slab starting at ${s.minQty} needs a valid price.`;
    }
    if (mrp > 0 && s.salesPrice > mrp) {
      return `Quantity slab starting at ${s.minQty}: price cannot be greater than MRP.`;
    }
    if (s.maxQty === null && i !== sorted.length - 1) {
      return 'Only the last slab can be "and above" (blank To Qty).';
    }
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.maxQty !== null && s.minQty !== prev.maxQty + 1) {
        return prev.maxQty >= s.minQty
          ? 'Quantity slabs cannot overlap.'
          : `Gap found between ${prev.maxQty} and ${s.minQty}. Slabs must be continuous.`;
      }
    }
  }
  return null;
};

/** Returns an English error message if add-on groups are invalid, otherwise null. */
export const validateAddOnGroups = (groups: AddOnGroup[]): string | null => {
  for (const g of groups) {
    if (!g.name.trim()) return 'Every add-on group needs a name (e.g. "Crust").';
        if (g.options.length === 0) return `Add-on group "${g.name}" needs at least one option.`;
    if (Number(g.maxSelect) < 0) return `"${g.name}": max choices cannot be negative.`;
    for (const o of g.options) {
      if (!o.name.trim()) return `Every option in "${g.name}" needs a name.`;
      if (Number(o.price) < 0) return `Option "${o.name}" cannot have a negative price.`;
    }
  }
  return null;
};
/** Charge for a pick beyond the limit: option's own Extra, else its Price, else the group's flat extra. */
export const extraChargeOf = (g: AddOnGroup, o: AddOnOption): number =>
  o.extraPrice != null
    ? Number(o.extraPrice) || 0
    : Number(o.price) > 0
      ? Number(o.price)
      : Number(g.extraPrice) || 0;

/** All add-on groups of an item: legacy groups saved on the item + groups picked from the library (only the options this item chose). */
export const resolveAddOnGroups = (
  item: {
    addOnGroups?: AddOnGroup[];
    addOnGroupIds?: string[];
    addOnPicks?: { groupId: string; optionIds?: string[]; maxSelect?: number }[];
  },
  library: AddOnGroup[],
  // Optional: inventory, so linked options get the live price and a sold-out flag
  ctx?: {
    items?: { id?: string; stock?: number; salesPrice?: number; mrp?: number }[];
    allowNegative?: boolean;
  }
): AddOnGroup[] => {
  const live = (o: AddOnOption): AddOnOption => {
    if (!o.itemId || !ctx?.items) return o;
    const it = ctx.items.find((i) => i.id === o.itemId);
    if (!it) return o;
    const next: AddOnOption = { ...o };
    if (o.syncPrice) next.price = Number(it.salesPrice) || Number(it.mrp) || 0;
    if (!ctx.allowNegative && Number(it.stock ?? 0) < (Number(o.itemQty) || 1)) next.soldOut = true;
    return next;
  };
  const fromLibrary = (item.addOnGroupIds ?? [])
    .map((id) => library.find((g) => g.id === id))
    .filter((g): g is AddOnGroup => !!g)
    .map((g) => {
      const pick = item.addOnPicks?.find((p) => p.groupId === g.id);
      const options = (pick?.optionIds ? g.options.filter((o) => pick.optionIds!.includes(o.id)) : g.options).map(live);
      let multiple = g.multiple;
      let maxSelect = Number(g.maxSelect) || 0;
      if (multiple && Number(pick?.maxSelect) > 0) maxSelect = Number(pick!.maxSelect); // this item's own limit
            let extraPrice = g.extraPrice != null ? Number(g.extraPrice) || 0 : undefined;
      if (multiple && maxSelect >= options.length) maxSelect = 0;                       // limit can never be reached = no limit
      if (maxSelect === 0) extraPrice = undefined;                                      // no limit = no extra price
      if (multiple && maxSelect === 1 && extraPrice === undefined) { multiple = false; maxSelect = 0; } // limit 1 = "Choose one"
      return { ...g, options, multiple, maxSelect, extraPrice };
    })
    .filter((g) => g.options.length > 0);
  return [...(item.addOnGroups ?? []), ...fromLibrary];
};

export const buildAddOnPicks = (
  groupIds: string[],
  picks: Record<string, string[]>,
  limits: Record<string, number>,
  library: AddOnGroup[]
): { groupId: string; optionIds?: string[]; maxSelect?: number }[] =>
  groupIds.flatMap((gid) => {
    const sel = picks[gid];
    const lim = Number(limits[gid]) > 0 ? Number(limits[gid]) : 0;
    const g = library.find((x) => x.id === gid);
    if (!g) return sel ? [{ groupId: gid, optionIds: sel, ...(lim ? { maxSelect: lim } : {}) }] : []; // library not loaded: keep what was chosen
    const allChecked = !sel || g.options.every((o) => sel.includes(o.id));
    if (allChecked && !lim) return [];
    return [{
      groupId: gid,
      ...(allChecked ? {} : { optionIds: sel }),
      ...(g.multiple && lim ? { maxSelect: lim } : {}),
    }];
  });

export const addOnStockOf = (
  line: { addOns?: AddOnOption[]; addOnStock?: { itemId: string; qty: number }[] }
): { itemId: string; qty: number }[] =>
  line.addOnStock ??
  (line.addOns ?? []).filter((a) => a.itemId).map((a) => ({ itemId: a.itemId as string, qty: Number(a.itemQty) || 1 }));

/** Stock to give back when `returnedQty` units of a bill line are returned: linked items, summed per itemId. */
export const addOnStockToRestore = (
  line: { addOns?: AddOnOption[]; addOnStock?: { itemId: string; qty: number }[] },
  returnedQty: number
): Map<string, number> => {
  const out = new Map<string, number>();
  addOnStockOf(line).forEach((a) => out.set(a.itemId, (out.get(a.itemId) || 0) + a.qty * (Number(returnedQty) || 0)));
  return out;
};