// "Previous Balance" printed on a bill — computed exactly the way the Party Ledger
// computes a party's balance, so the bill's Total Balance Due always matches the
// figure shown in the ledger.
//
// POS (Party Ledger, usePartyLedger + balanceOf in PartyLedger.tsx):
//   receivable = unpaid sale bills + "due" opening balances
//   payable    = unpaid purchase bills
//   net        = receivable − payable   ("They owe you" when > 0)
// A party is keyed by its last 10 digits, with merged numbers (aliases) folded in.
//
// Catalogue (CataloguePartyLedger, useCataloguepartyledger):
//   receivable = unpaid orders (not "Upcoming") + "due" catalogue opening balances
//
// The bill being printed is left out; the bill's own due is added on top of this.
import { collection, getDocs, query, where, type DocumentData } from 'firebase/firestore';
import { db } from './Firebase';
import { loadAliases, groupPhones } from '../Pages/Reports/CustomerReportComponents/customerAliases';

export const last10 = (num?: unknown): string => {
    if (num === undefined || num === null) return '';
    const digits = String(num).replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
};

const isAdvanceOB = (ob: DocumentData) => (ob.balanceType ?? 'due') === 'advance';
const obDue = (ob: DocumentData) => Number(ob.dueAmount ?? ob.amount ?? 0) || 0;
const billDue = (bill: DocumentData) => Number(bill.paymentMethods?.due ?? bill.dueAmount ?? 0) || 0;

type Doc = { id: string; data: DocumentData };

/** POS ledger net balance (+ = they owe you), leaving out one sale/purchase. */
export const posLedgerNet = (
    sales: Doc[],
    purchases: Doc[],
    openingBalances: Doc[],
    exclude?: { id: string; kind: 'sale' | 'purchase' },
): number => {
    let receivable = 0;
    let payable = 0;
    sales.forEach(({ id, data }) => {
        if (exclude?.kind === 'sale' && id === exclude.id) return;
        const due = billDue(data);
        if (due > 0) receivable += due;
    });
    purchases.forEach(({ id, data }) => {
        if (exclude?.kind === 'purchase' && id === exclude.id) return;
        const due = billDue(data);
        if (due > 0) payable += due;
    });
    openingBalances.forEach(({ data }) => {
        if (isAdvanceOB(data)) return;
        const due = obDue(data);
        if (due > 0) receivable += due;
    });
    return receivable - payable;
};

/** Catalogue ledger receivable, leaving out one order. */
export const catalogueLedgerDue = (orders: Doc[], openingBalances: Doc[], excludeOrderId?: string): number => {
    let total = 0;
    orders.forEach(({ id, data }) => {
        if (id === excludeOrderId || data.status === 'Upcoming') return;
        total += Math.max(0, Number(data.totalAmount || 0) - Number(data.paidAmount || 0));
    });
    openingBalances.forEach(({ data }) => {
        if (data.source !== 'catalogue' || isAdvanceOB(data)) return;
        const due = obDue(data);
        if (due > 0) total += due;
    });
    return total;
};

/** Spellings a phone is commonly saved under, so a Firestore `in` query finds them. */
const phoneVariants = (phones: string[], raw?: string): string[] => {
    const set = new Set<string>();
    phones.forEach((p) => {
        [p, `+91${p}`, `91${p}`, `+91 ${p}`, `0${p}`].forEach((v) => set.add(v));
    });
    if (raw && raw.trim()) set.add(raw.trim());
    return [...set];
};

/** Every doc in `coll` whose `field` is one of `values` (chunks of 30 for the `in` limit). */
const fetchWhereIn = async (companyId: string, coll: string, field: string, values: string[]): Promise<Doc[]> => {
    const chunks: string[][] = [];
    for (let i = 0; i < values.length; i += 30) chunks.push(values.slice(i, i + 30));
    const snaps = await Promise.all(
        chunks.map((c) => getDocs(query(collection(db, 'companies', companyId, coll), where(field, 'in', c)))),
    );
    const byId = new Map<string, Doc>();
    snaps.forEach((s) => s.forEach((d) => byId.set(d.id, { id: d.id, data: d.data() })));
    return [...byId.values()];
};

/** The party's phone plus any numbers merged into it (falls back to just the phone). */
const partyPhones = async (companyId: string, phone: string): Promise<string[]> => {
    try {
        return groupPhones(await loadAliases(companyId), phone).filter(Boolean);
    } catch {
        return [phone];
    }
};

/**
 * Previous balance for a POS sale or purchase bill.
 * Sale bill → what they owe you (ledger net). Purchase bill → what you owe them (−net).
 */
export const fetchPosPreviousBalance = async (
    companyId: string | undefined,
    partyNumber: string | undefined,
    exclude: { id: string; kind: 'sale' | 'purchase' },
): Promise<number> => {
    const phone = last10(partyNumber);
    if (!companyId || !phone) return 0;

    const phones = await partyPhones(companyId, phone);
    const inGroup = new Set(phones);
    const variants = phoneVariants(phones, partyNumber);
    const mine = (docs: Doc[]) => docs.filter((d) => inGroup.has(last10(d.data.partyNumber)));

    // Each source is independent: one blocked by rules shouldn't zero the others.
    const [sales, purchases, obs] = await Promise.all([
        fetchWhereIn(companyId, 'sales', 'partyNumber', variants).catch(() => [] as Doc[]),
        fetchWhereIn(companyId, 'purchases', 'partyNumber', variants).catch(() => [] as Doc[]),
        fetchWhereIn(companyId, 'openingBalances', 'partyNumber', variants).catch(() => [] as Doc[]),
    ]);

    const net = posLedgerNet(mine(sales), mine(purchases), mine(obs), exclude);
    return Math.round((exclude.kind === 'purchase' ? -net : net) * 100) / 100;
};

/** Previous balance for a catalogue order bill (matches the Catalogue Party Ledger). */
export const fetchCataloguePreviousBalance = async (
    companyId: string | undefined,
    partyNumber: string | undefined,
    excludeOrderId: string,
): Promise<number> => {
    const phone = last10(partyNumber);
    if (!companyId || !phone) return 0;

    const phones = await partyPhones(companyId, phone);
    const inGroup = new Set(phones);
    const variants = phoneVariants(phones, partyNumber);

    // The ledger files an order under userLoginPhone, else billing, else shipping phone.
    const [byLogin, byBilling, byShipping, obs] = await Promise.all([
        fetchWhereIn(companyId, 'Orders', 'userLoginPhone', variants).catch(() => [] as Doc[]),
        fetchWhereIn(companyId, 'Orders', 'billingDetails.phone', variants).catch(() => [] as Doc[]),
        fetchWhereIn(companyId, 'Orders', 'shippingDetails.phone', variants).catch(() => [] as Doc[]),
        fetchWhereIn(companyId, 'openingBalances', 'partyNumber', variants).catch(() => [] as Doc[]),
    ]);
    const orders = new Map<string, Doc>();
    [...byLogin, ...byBilling, ...byShipping].forEach((d) => {
        const owner = d.data.userLoginPhone || d.data.billingDetails?.phone || d.data.shippingDetails?.phone || '';
        if (inGroup.has(last10(owner))) orders.set(d.id, d);
    });

    const mineObs = obs.filter((d) => inGroup.has(last10(d.data.partyNumber)));
    return Math.round(catalogueLedgerDue([...orders.values()], mineObs, excludeOrderId) * 100) / 100;
};
