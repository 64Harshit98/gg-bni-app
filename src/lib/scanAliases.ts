// Remembers "this name on a supplier bill = that item in my catalogue".
//
// When a scanned line is attached to an existing item (or saved as a new item),
// the bill's spelling is stored against the item id, so the next bill from the
// same supplier links it automatically. Kept per company in this browser only:
// it is a convenience, the purchase never depends on it.

import { nameKey } from './itemNameMatch';

type AliasMap = Record<string, string>; // nameKey(bill name) → item id

const MAX_ALIASES = 3000;
const storageKey = (companyId: string) => `purchase_scan_aliases_${companyId}`;

export const loadScanAliases = (companyId?: string): AliasMap => {
    if (!companyId) return {};
    try {
        const raw = localStorage.getItem(storageKey(companyId));
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
};

/** Saves bill-name → item-id pairs. Ignores empty names and temp (unsaved) ids. */
export const rememberScanAliases = (companyId: string | undefined, pairs: { billName?: string; itemId?: string }[]) => {
    if (!companyId) return;
    const valid = pairs.filter(p => p.billName && p.itemId && !p.itemId.startsWith('__'));
    if (!valid.length) return;
    try {
        const map = loadScanAliases(companyId);
        valid.forEach(({ billName, itemId }) => {
            const key = nameKey(billName!);
            if (!key) return;
            delete map[key]; // re-insert so it counts as the newest
            map[key] = itemId!;
        });
        const keys = Object.keys(map);
        if (keys.length > MAX_ALIASES) keys.slice(0, keys.length - MAX_ALIASES).forEach(k => delete map[k]);
        localStorage.setItem(storageKey(companyId), JSON.stringify(map));
    } catch {
        // storage full / blocked — matching still works without it
    }
};

export const lookupScanAlias = (aliases: AliasMap, billName: string): string | undefined =>
    aliases[nameKey(billName)];
