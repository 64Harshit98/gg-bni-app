import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  serverTimestamp,
  writeBatch,
  type Transaction,
} from 'firebase/firestore';
import { db } from '../../../lib/Firebase';

// companies/{companyId}/customerAliases/{secondaryPhone} -> { primary, mergedAt, mergedBy }
// Bills / customers / openingBalances ko kabhi touch nahi karte: merge = alias doc banana,
// unmerge = alias doc delete karna.

const ALIASES = 'customerAliases';
const MAX_HOPS = 5; // safety: agar kabhi chain ban jaye to infinite loop na ho

/** secondary phone -> primary phone */
export type AliasMap = Record<string, string>;

const cache = new Map<string, AliasMap>(); // companyId -> map (session)

const isPhone = (p: string) => /^\d{10}$/.test(p);

export const loadAliases = async (companyId: string, force = false): Promise<AliasMap> => {
  if (!force && cache.has(companyId)) return cache.get(companyId)!;
  const snap = await getDocs(collection(db, 'companies', companyId, ALIASES));
  const map: AliasMap = {};
  snap.forEach((d) => {
    const primary = String(d.data().primary || '');
    if (isPhone(d.id) && isPhone(primary)) map[d.id] = primary;
  });
  cache.set(companyId, map);
  return map;
};

export const resolvePhone = (aliases: AliasMap, phone: string): string => {
  let current = phone;
  for (let i = 0; i < MAX_HOPS; i++) {
    const next = aliases[current];
    if (!next || next === current) return current;
    current = next;
  }
  return current;
};

/** Primary + uske saare alias numbers (primary sabse pehle). Merge nahi hai to sirf [phone]. */
export const groupPhones = (aliases: AliasMap, phone: string): string[] => {
  const root = resolvePhone(aliases, phone);
  const others = Object.keys(aliases).filter((p) => resolvePhone(aliases, p) === root && p !== root);
  return [root, ...others.sort()];
};

/**
 * `secondaries` ko `primary` ke group me merge karta hai.
 * - primary pehle apne root tak resolve hota hai
 * - secondary ka poora group (uske apne aliases ke saath) root pe re-point hota hai, chain nahi banti
 */
export const mergeCustomers = async (
  companyId: string,
  primary: string,
  secondaries: string[],
  actorUid: string,
): Promise<AliasMap> => {
  const aliases = { ...(await loadAliases(companyId, true)) };
  const root = resolvePhone(aliases, primary);
  if (!isPhone(root)) throw new Error('Primary number must be a 10-digit phone.');

  const toMove = new Set<string>();
  for (const s of secondaries) {
    if (!isPhone(s)) throw new Error(`${s} is not a valid 10-digit phone.`);
    const sRoot = resolvePhone(aliases, s);
    if (sRoot === root) continue; // pehle se same group me
    groupPhones(aliases, sRoot).forEach((p) => toMove.add(p));
  }
  if (toMove.size === 0) return aliases;

  const batch = writeBatch(db);
  toMove.forEach((phone) => {
    batch.set(doc(db, 'companies', companyId, ALIASES, phone), {
      primary: root,
      mergedAt: serverTimestamp(),
      mergedBy: actorUid,
    });
    aliases[phone] = root;
  });
  await batch.commit();
  cache.set(companyId, aliases);
  return aliases;
};

/** Ek number ko group se alag karta hai (undo). Primary ko unmerge karna allowed nahi. */
export const unmergeNumber = async (companyId: string, phone: string): Promise<AliasMap> => {
  const aliases = { ...(await loadAliases(companyId, true)) };
  if (!aliases[phone]) throw new Error('This number is not merged into another customer.');
  const batch = writeBatch(db);
  batch.delete(doc(db, 'companies', companyId, ALIASES, phone));
  await batch.commit();
  delete aliases[phone];
  cache.set(companyId, aliases);
  return aliases;
};

export const clearAliasCache = (companyId?: string) => {
  if (companyId) cache.delete(companyId);
  else cache.clear();
};

/** Token (digits) kisi bhi merged number me aaye to us customer ke saare numbers. */
export const linkedNumbersForToken = (aliases: AliasMap, token: string): Set<string> => {
  const out = new Set<string>();
  if (!/^\d+$/.test(token)) return out;
  const involved = new Set([...Object.keys(aliases), ...Object.values(aliases)]);
  involved.forEach((p) => {
    if (p.includes(token)) groupPhones(aliases, p).forEach((n) => out.add(n));
  });
  return out;
};
/** Group ke saare numbers ka creditBalance (customers/{phone}). Primary pehle. */
export const loadGroupCredit = async (
  companyId: string,
  aliases: AliasMap,
  phone: string,
): Promise<number> => {
  const phones = groupPhones(aliases, phone);
  const snaps = await Promise.all(
    phones.map((p) => getDoc(doc(db, 'companies', companyId, 'customers', p))),
  );
  return snaps.reduce((sum, s) => sum + (s.exists() ? Number(s.data().creditBalance || 0) : 0), 0);
};

/**
 * Transaction ke andar group ke docs se credit kaatta hai (primary pehle, phir baaki).
 * NOTE: Firestore transaction me saare reads writes se PEHLE hone chahiye,
 * isliye ise us transaction ke pehle write se pehle call karna hai.
 */
export const deductGroupCredit = async (
  tx: Transaction,
  companyId: string,
  aliases: AliasMap,
  phone: string,
  amount: number,
): Promise<void> => {
  const refs = groupPhones(aliases, phone).map((p) => doc(db, 'companies', companyId, 'customers', p));
  const snaps = await Promise.all(refs.map((r) => tx.get(r)));
  let remaining = amount;
  snaps.forEach((s, i) => {
    if (remaining <= 0 || !s.exists()) return;
    const take = Math.min(Number(s.data().creditBalance || 0), remaining);
    if (take > 0) {
      tx.update(refs[i], { creditBalance: increment(-take) });
      remaining -= take;
    }
  });
  if (remaining > 0) throw new Error('Not enough credit note balance.');
};