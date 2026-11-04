import { safeGetJSON } from '../../lib/safeStorage';

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
