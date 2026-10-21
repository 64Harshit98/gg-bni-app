import {
  collection,
  doc,
  documentId,
  getDocs,
  query,
  setDoc,
  Timestamp,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { createRangeCache } from '../reportRangeCache';
import { customerSourceFields, type CustomerSourceFields } from '../../../constants/customerSource';

// Data the Customer report needs besides sales (which come from the shared
// sales cache). Opening balances and newly added customers are cached per date
// range — see reportRangeCache.ts.

const toMillis = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : 0);

/* ---------- OPENING BALANCES ---------- */

export interface OpeningBalanceRecord {
  id: string;
  partyName: string;
  partyNumber: string;
  amount: number;
  dueAmount: number;
  balanceType: 'due' | 'advance';
  createdAt: number;
  source?: string; // 'catalogue' for catalogue ledger entries
  partyType?: string;
}

const mapOpeningBalance = (snap: QueryDocumentSnapshot): OpeningBalanceRecord => {
  const data = snap.data();
  return {
    id: snap.id,
    partyName: data.partyName || '',
    partyNumber: data.partyNumber || '',
    amount: Number(data.amount) || 0,
    dueAmount: Number(data.dueAmount ?? data.amount ?? 0) || 0,
    balanceType: data.balanceType === 'advance' ? 'advance' : 'due',
    createdAt: toMillis(data.createdAt),
    source: data.source || undefined,
    partyType: data.partyType || undefined,
  };
};

const openingBalanceCache = createRangeCache<OpeningBalanceRecord>({
  name: 'openingBalanceRangeCacheV2', // V2: records carry source + partyType
  collectionName: 'openingBalances',
  mapDoc: mapOpeningBalance,
});

export const loadOpeningBalancesForRange = openingBalanceCache.load;
export const clearOpeningBalanceCache = openingBalanceCache.clear;

/* ---------- CUSTOMERS ADDED IN THE RANGE ---------- */

// Customers whose master record was created in the range are listed even with
// no bills (e.g. all their bills were deleted).
export interface NewCustomerRecord extends CustomerSourceFields {
  id: string;
  name: string;
  number: string;
  createdAt: number;
}

const customersCreatedCache = createRangeCache<NewCustomerRecord>({
  name: 'customersCreatedRangeCacheV2', // V2: records carry source fields
  collectionName: 'customers',
  mapDoc: (snap) => {
    const data = snap.data();
    return {
      id: snap.id,
      name: String(data.name || '').trim(),
      number: String(data.number || '').trim(),
      createdAt: toMillis(data.createdAt),
      ...customerSourceFields(data),
    };
  },
});

export const loadCustomersCreatedForRange = customersCreatedCache.load;

/* ---------- NAMES FOR "NO NAME" CUSTOMERS ---------- */

// Bills saved without a name still have the customer's phone; the customer
// master (customers/{10-digit phone}) may know the name. Looked up only for
// the unnamed phones on screen and remembered for the session.
const nameCache = new Map<string, string>(); // `${companyId}:${phone}` → name ('' = none)

export const loadCustomerNames = async (companyId: string, phones: string[]) => {
  const missing = [...new Set(phones)].filter((p) => !nameCache.has(`${companyId}:${p}`));
  const customers = collection(db, 'companies', companyId, 'customers');
  // Firestore 'in' takes at most 30 values per query.
  for (let i = 0; i < missing.length; i += 30) {
    const chunk = missing.slice(i, i + 30);
    const snap = await getDocs(query(customers, where(documentId(), 'in', chunk)));
    const found = new Map(snap.docs.map((d) => [d.id, String(d.data().name || '').trim()]));
    chunk.forEach((p) => nameCache.set(`${companyId}:${p}`, found.get(p) || ''));
  }
  return Object.fromEntries(
    phones.map((p) => [p, nameCache.get(`${companyId}:${p}`) || '']).filter(([, name]) => name),
  ) as Record<string, string>;
};

export const saveCustomerName = async (companyId: string, phone: string, name: string) => {
  await setDoc(doc(db, 'companies', companyId, 'customers', phone), { name, number: phone }, { merge: true });
  nameCache.set(`${companyId}:${phone}`, name);
};

/* ---------- CREDIT NOTE BALANCES ---------- */

// Only customers holding a credit balance — usually a handful of docs — instead
// of the whole customers collection. Not range based, so it is read fresh on
// each visit / refresh.
export const loadCustomerCredits = async (companyId: string) => {
  const snap = await getDocs(
    query(collection(db, 'companies', companyId, 'customers'), where('creditBalance', '>', 0)),
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      name: String(data.name || '').trim(),
      number: String(data.number || '').trim(),
      creditBalance: Number(data.creditBalance) || 0,
    };
  });
};
