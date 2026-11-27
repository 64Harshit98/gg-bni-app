import { collection, getDocs, limit, query, where, type DocumentData } from 'firebase/firestore';
import { db } from './Firebase';

export interface PartyHit {
    id: string;                     // customers/suppliers doc id (phone, else name)
    name: string;
    number: string;
    data: DocumentData;             // the raw doc, for callers that need more fields
}

/**
 * Prefix search on companies/{cid}/{customers|suppliers} by name or number — the
 * same query the billing screens and PaymentDrawer use (lower-case, plus a
 * capitalised variant for names). Returns at most ~10 unique parties.
 */
export const searchParties = async (
    companyId: string,
    collectionName: 'customers' | 'suppliers',
    term: string,
    field: 'name' | 'number',
    max = 5
): Promise<PartyHit[]> => {
    const t = term.trim();
    if (!companyId || t.length < 2) return [];

    const ref = collection(db, 'companies', companyId, collectionName);
    const lower = t.toLowerCase();
    const cap = lower.charAt(0).toUpperCase() + lower.slice(1);
    const variants = field === 'name' ? Array.from(new Set([lower, cap, t])) : [t];

    const snaps = await Promise.all(variants.map(v =>
        getDocs(query(ref, where(field, '>=', v), where(field, '<=', v + ''), limit(max)))
    ));

    const map = new Map<string, PartyHit>();
    snaps.forEach(snap => snap.forEach(d => {
        if (map.has(d.id)) return;
        const data = d.data();
        map.set(d.id, { id: d.id, name: data.name || '', number: data.number || d.id, data });
    }));
    return Array.from(map.values());
};
