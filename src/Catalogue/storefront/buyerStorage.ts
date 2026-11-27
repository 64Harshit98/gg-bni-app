import { safeGetJSON, safeSetJSON } from '../../lib/safeStorage';

// Buyer-side state the storefront pages (catalogue, category, checkout,
// lead popup) share through localStorage. Reads never throw and always
// return the expected shape — a blocked, corrupted or hand-edited value used
// to throw inside these pages (JSON.parse, or `.replace` on a non-string).

export interface SavedLead {
  name?: string;
  number?: string;
}

export const readLeadData = (): SavedLead => {
  const raw = safeGetJSON<unknown>('leadData', {});
  if (!raw || typeof raw !== 'object') return {};
  const lead = raw as Record<string, unknown>;
  return {
    name: typeof lead.name === 'string' ? lead.name : undefined,
    number: lead.number != null ? String(lead.number) : undefined,
  };
};

/** Checkout address the buyer last ordered with, so the next checkout is pre-filled. */
export interface SavedAddress {
  name: string;
  phone: string;
  city: string;
  state: string;
  address: string;
  gstin: string;
}

export interface SavedCheckoutDetails {
  billing: SavedAddress;
  /** Only kept when it differed from billing. */
  shipping?: SavedAddress;
  sameAsBilling: boolean;
}

const CHECKOUT_DETAILS_KEY = 'checkoutDetails';
const str = (v: unknown) => (typeof v === 'string' ? v : v != null ? String(v) : '');
const toAddress = (raw: unknown): SavedAddress | null => {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  return {
    name: str(a.name),
    phone: str(a.phone).replace(/\D/g, '').slice(-10),
    city: str(a.city),
    state: str(a.state),
    address: str(a.address),
    gstin: str(a.gstin).toUpperCase().slice(0, 15),
  };
};

export const readCheckoutDetails = (): SavedCheckoutDetails | null => {
  const raw = safeGetJSON<unknown>(CHECKOUT_DETAILS_KEY, null);
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const billing = toAddress(d.billing);
  if (!billing) return null;
  const shipping = toAddress(d.shipping) ?? undefined;
  return { billing, shipping, sameAsBilling: d.sameAsBilling !== false || !shipping };
};

export const saveCheckoutDetails = (details: SavedCheckoutDetails): void => {
  safeSetJSON(CHECKOUT_DETAILS_KEY, {
    billing: details.billing,
    ...(details.sameAsBilling || !details.shipping ? {} : { shipping: details.shipping }),
    sameAsBilling: details.sameAsBilling,
  });
};

export const readSavedCart = <T>(): T[] => {
  const cart = safeGetJSON<unknown>('temp_cart', []);
  return Array.isArray(cart) ? (cart as T[]) : [];
};

// crypto.randomUUID needs Safari 15.4+ and a secure context; fall back to a
// random id that is just as good for a guest key.
export const randomId = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};
