// Single source for super-admin access in the client. This only controls what
// the UI shows — the real enforcement is firestore.rules and the SUPER_ADMIN_UIDS
// check in functions/lib/index.js, which must be kept in sync with this list.
export const SUPER_ADMIN_UIDS = [
  '6vwZ1HRqX7VSnh5KP4JW0TKeuZm2',
  '1AKioGfop8PmHhry6uXOz8Rw6qT2',
];

export const isSuperAdmin = (uid?: string | null): boolean =>
  !!uid && SUPER_ADMIN_UIDS.includes(uid);
