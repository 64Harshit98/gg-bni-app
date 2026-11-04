import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { db } from '../../lib/Firebase';
import { formatDateForInput } from '../../Pages/Reports/SalesReportComponents/salesReport.utils';
// Deleting orders changes what the catalogue P&L cache holds.
import { clearCatalogueOrdersRangeCache } from './useCataloguepnlreport';

export const normalizePartyNumber = (num?: string): string => {
  if (!num) return '';
  const digits = num.toString().replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
};

/* ---------- TYPES (same names/shape the POS PartyLedger page uses) ---------- */
export interface PaymentRecord {
  amount: number;
  method: string;
  date: string;
  timestamp?: number;
  chequeNumber?: string;
  chequeDate?: string;
}

export interface OpeningBalance {
  id: string;
  partyName: string;
  partyNumber: string;
  partyType: 'Customer' | 'Supplier';
  amount: number;
  dueAmount: number;
  balanceType?: 'due' | 'advance'; // 'due' = they owe you, 'advance' = you owe them
  note?: string;
  address?: string;
  gstNumber?: string;
  createdAt: number;
  paymentHistory: PaymentRecord[];
}

export interface BulkOpeningBalanceRow {
  partyName: string;
  partyNumber: string;
  partyType: 'Customer' | 'Supplier';
  amount: number;
  balanceType: 'due' | 'advance';
  note?: string;
  address?: string;
  gstNumber?: string;
  date?: number;
}

export interface LedgerTransaction {
  id: string;
  /** Order id for orders; undefined for opening balances. */
  invoiceNumber?: string;
  partyName: string;
  partyNumber: string;
  totalAmount: number;
  dueAmount: number;
  paymentHistory: PaymentRecord[];
  createdAt: number;
  type: 'sale';
  isOpeningBalance?: boolean;
  balanceType?: 'due' | 'advance';
  note?: string;
  items?: any[];
  paymentMethods?: Record<string, number>;
}

export interface PartySummary {
  partyName: string;
  partyNumber: string;
  partyType: 'Customer';
  totalBilled: number;
  totalDue: number;
  totalTransactions: number;
  transactions: LedgerTransaction[];
  address?: string;
  gstNumber?: string;
}

interface MasterRecord {
  name: string;
  number: string;
  createdAt?: number;
  address?: string;
  gstNumber?: string;
  nameEdited?: boolean;
}

/* ---------- MAPPERS ---------- */
// Catalogue `Orders` doc -> ledger entry. Fields as used by the old page:
// userName / userLoginPhone / billingDetails / shippingDetails, orderId, totalAmount, paidAmount, paymentHistory.
const mapOrder = (snap: QueryDocumentSnapshot): LedgerTransaction | null => {
  const data = snap.data();
  if (data.status === 'Upcoming') return null; // old query excluded these

  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now();
  const total = Number(data.totalAmount || 0);
  const paid = Number(data.paidAmount || 0);

  const name = data.userName || data.billingDetails?.name || data.shippingDetails?.name || 'Unknown';
  const rawNumber = data.userLoginPhone || data.billingDetails?.phone || data.shippingDetails?.phone || '';

  let history: PaymentRecord[] = data.paymentHistory || [];
  // Orders paid up-front have no history; rebuild it so the statement balances.
  if (history.length === 0 && paid > 0) {
    const methods = Object.entries(data.paymentMethods || {}).filter(
      ([k, v]) => k !== 'due' && k !== 'balance' && Number(v) > 0,
    );
    history = methods.length
      ? methods.map(([method, amount]) => ({
          amount: Number(amount),
          method,
          date: new Date(createdAt).toISOString(),
          timestamp: createdAt,
        }))
      : [{ amount: paid, method: '', date: new Date(createdAt).toISOString(), timestamp: createdAt }];
  }

  return {
    id: snap.id,
    invoiceNumber: data.orderId,
    partyName: name,
    partyNumber: normalizePartyNumber(rawNumber),
    totalAmount: total,
    dueAmount: Math.max(0, total - paid),
    paymentHistory: history,
    createdAt,
    type: 'sale',
    items: data.items || [],
    paymentMethods: data.paymentMethods || {},
  };
};

const mapOpeningBalance = (snap: QueryDocumentSnapshot): OpeningBalance => {
  const data = snap.data();
  return {
    id: snap.id,
    partyName: data.partyName || 'Unknown',
    partyNumber: data.partyNumber || '',
    partyType: data.partyType || 'Customer',
    amount: data.amount || 0,
    dueAmount: data.dueAmount ?? data.amount ?? 0,
    balanceType: data.balanceType || 'due',
    note: data.note || '',
    address: data.address || '',
    gstNumber: data.gstNumber || '',
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
    paymentHistory: data.paymentHistory || [],
  };
};

/* ---------- HOOK ---------- */
export default function useCataloguePartyLedger() {
  const { currentUser, loading: authLoading } = useAuth();
  const companyId = currentUser?.companyId;

  const [orders, setOrders] = useState<LedgerTransaction[]>([]);
  const [openingBalances, setOpeningBalances] = useState<OpeningBalance[]>([]);
  const [customersMaster, setCustomersMaster] = useState<MasterRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState<string>('last30');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);
  const [selectedPartyName, setSelectedPartyName] = useState<string | null>(null);

  // Default period: last 30 days.
  useEffect(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    setCustomStartDate(formatDateForInput(start));
    setCustomEndDate(formatDateForInput(end));
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  }, []);

  // Orders for the applied period only (was: a live listener on up to 5000 orders).
  // Status is filtered client-side so no composite index is needed.
  useEffect(() => {
    if (authLoading) return;
    if (!companyId || !appliedFilters) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const q = query(
          collection(db, 'companies', companyId, 'Orders'),
          where('createdAt', '>=', Timestamp.fromMillis(appliedFilters.start)),
          where('createdAt', '<=', Timestamp.fromMillis(appliedFilters.end)),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        setOrders(snap.docs.map(mapOrder).filter((o): o is LedgerTransaction => o !== null));
      } catch (err) {
        console.error('Error fetching catalogue ledger orders:', err);
        if (!cancelled) setError('Failed to load ledger data.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, authLoading, appliedFilters]);

  // Opening balances (catalogue only) — not date-bound, loaded once per company.
  useEffect(() => {
    if (authLoading || !companyId) return;
    const fetchOpeningBalances = async () => {
      try {
        const snap = await getDocs(
          query(collection(db, 'companies', companyId, 'openingBalances'), where('source', '==', 'catalogue')),
        );
        setOpeningBalances(snap.docs.map(mapOpeningBalance));

        // Legacy sync (kept from the old page): advance OBs whose credit was never applied.
        const unsynced = snap.docs.filter((d) => {
          const data = d.data();
          return data.balanceType === 'advance' && !data.creditSynced && data.partyType !== 'Supplier';
        });
        for (const obDoc of unsynced) {
          const data = obDoc.data();
          const phone = normalizePartyNumber(data.partyNumber);
          if (!phone) continue;
          try {
            await setDoc(
              doc(db, 'companies', companyId, 'customers', phone),
              {
                number: phone,
                name: data.partyName || '',
                creditBalance: increment(data.dueAmount ?? data.amount ?? 0),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            );
            await updateDoc(obDoc.ref, { creditSynced: true });
          } catch (e) {
            console.error('Credit sync failed for:', phone, e);
          }
        }
      } catch (err) {
        console.error('Error fetching opening balances:', err);
      }
    };
    fetchOpeningBalances();
  }, [companyId, authLoading]);

  // Customer master list (name / number / createdAt / address / gstNumber).
  useEffect(() => {
    if (authLoading || !companyId) return;
    const fetchCustomers = async () => {
      try {
        const snap = await getDocs(collection(db, 'companies', companyId, 'customers'));
        setCustomersMaster(
          snap.docs.map((d) => {
            const data = d.data();
            return {
              name: data.name || 'Unknown',
              number: data.number || d.id,
              createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : undefined,
              address: data.address || '',
              gstNumber: data.gstNumber || '',
              nameEdited: !!data.nameEditedAt,
            };
          }),
        );
      } catch (err) {
        console.error('Error fetching customers master:', err);
      }
    };
    fetchCustomers();
  }, [companyId, authLoading]);

  /* ---------- GROUPING ---------- */
  const partySummaries = useMemo(() => {
    const inRange = (t: number) => !!appliedFilters && t >= appliedFilters.start && t <= appliedFilters.end;
    const map = new Map<string, PartySummary>();
    const keyOf = (num: string, name: string) =>
      num || `NO_PHONE_${name.trim().toLowerCase().replace(/\s+/g, '_')}`;

    const ensure = (name: string, rawNumber: string, updateName = true) => {
      const number = normalizePartyNumber(rawNumber);
      const key = keyOf(number, name);
      let p = map.get(key);
      if (!p) {
        p = {
          partyName: name || 'N/A',
          partyNumber: number,
          partyType: 'Customer',
          totalBilled: 0,
          totalDue: 0,
          totalTransactions: 0,
          transactions: [],
        };
        map.set(key, p);
      } else if (updateName && name.length > p.partyName.length) {
        p.partyName = name;
      }
      return p;
    };

    // Customers created inside the period show up even with no orders left.
    customersMaster
      .filter((c) => c.createdAt !== undefined && inRange(c.createdAt))
      .forEach((c) => {
        const p = ensure(c.name, c.number, false);
        p.address = p.address || c.address || undefined;
        p.gstNumber = p.gstNumber || c.gstNumber || undefined;
      });

    orders.forEach((t) => {
      const p = ensure(t.partyName, t.partyNumber);
      p.totalBilled += t.totalAmount;
      p.totalDue += t.dueAmount;
      p.totalTransactions += 1;
      p.transactions.push(t);
    });

    openingBalances
      .filter((ob) => inRange(ob.createdAt))
      .forEach((ob) => {
        const p = ensure(ob.partyName, ob.partyNumber, false);
        p.address = p.address || ob.address || undefined;
        p.gstNumber = p.gstNumber || ob.gstNumber || undefined;
        // A zero-amount OB only exists so a new party shows up — no phantom ₹0 entry.
        if (ob.amount <= 0) return;
        const advance = ob.balanceType === 'advance';
        p.transactions.push({
          id: ob.id,
          invoiceNumber: undefined,
          partyName: ob.partyName,
          partyNumber: p.partyNumber,
          totalAmount: ob.amount,
          dueAmount: ob.dueAmount,
          paymentHistory: ob.paymentHistory,
          createdAt: ob.createdAt,
          type: 'sale',
          isOpeningBalance: true,
          balanceType: ob.balanceType ?? 'due',
          note: ob.note,
        });
        if (!advance) {
          p.totalBilled += ob.amount;
          p.totalDue += ob.dueAmount;
        }
      });

    // Details saved on the customer record (edit party) apply to every party.
    const masterByNumber = new Map<string, MasterRecord>();
    customersMaster.forEach((m) => {
      const n = normalizePartyNumber(m.number);
      if (n) masterByNumber.set(n, m);
    });
    const hasName = (name?: string) => !!name && name !== 'N/A' && name !== 'Unknown';
    map.forEach((p) => {
      const m = masterByNumber.get(p.partyNumber);
      if (!m) return;
      if (hasName(m.name) && (m.nameEdited || !hasName(p.partyName))) p.partyName = m.name;
      p.address = p.address || m.address || undefined;
      p.gstNumber = p.gstNumber || m.gstNumber || undefined;
    });

    return Array.from(map.values()).sort((a, b) => a.partyName.localeCompare(b.partyName));
  }, [orders, openingBalances, customersMaster, appliedFilters]);

  const selectedPartyLedger = useMemo(() => {
    if (!selectedPartyName) return null;
    return (
      partySummaries.find((p) => p.partyNumber && p.partyNumber === selectedPartyName) ||
      partySummaries.find((p) => p.partyName === selectedPartyName) ||
      null
    );
  }, [selectedPartyName, partySummaries]);

  /* ---------- LOCAL UPDATES (no refetch after a payment) ---------- */
  const updateTransactionLocally = (orderId: string, amountPaid: number, paymentRecord: PaymentRecord) => {
    setOrders((prev) =>
      prev.map((t) =>
        t.id !== orderId
          ? t
          : {
              ...t,
              dueAmount: Math.max(0, t.dueAmount - amountPaid),
              paymentHistory: [...t.paymentHistory, paymentRecord],
            },
      ),
    );
  };

  const updateOpeningBalanceLocally = (obId: string, amountPaid: number, paymentRecord: PaymentRecord) => {
    setOpeningBalances((prev) =>
      prev.map((ob) =>
        ob.id !== obId
          ? ob
          : {
              ...ob,
              dueAmount: Math.max(0, ob.dueAmount - amountPaid),
              paymentHistory: [...ob.paymentHistory, paymentRecord],
            },
      ),
    );
  };

  /* ---------- OPENING BALANCES ---------- */
  // Credit is applied to the customer first, then the OB is flagged creditSynced so the
  // legacy sync above never applies it a second time.
  const applyAdvanceCredit = async (
    obId: string,
    partyType: 'Customer' | 'Supplier',
    partyName: string,
    partyNumber: string,
    amount: number,
    extra?: { address?: string; gstNumber?: string },
  ) => {
    if (!companyId) return false;
    const phone = normalizePartyNumber(partyNumber);
    if (!phone) return false;
    const collectionName = partyType === 'Customer' ? 'customers' : 'suppliers';
    const balanceField = partyType === 'Customer' ? 'creditBalance' : 'debitBalance';
    await setDoc(
      doc(db, 'companies', companyId, collectionName, phone),
      {
        number: phone,
        name: partyName,
        [balanceField]: increment(amount),
        ...(extra?.address ? { address: extra.address } : {}),
        ...(extra?.gstNumber ? { gstNumber: extra.gstNumber } : {}),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    await updateDoc(doc(db, 'companies', companyId, 'openingBalances', obId), { creditSynced: true });
    return true;
  };

  const addOpeningBalance = async (
    partyName: string,
    partyNumber: string,
    partyType: 'Customer' | 'Supplier',
    amount: number,
    note?: string,
    balanceType: 'due' | 'advance' = 'due',
  ): Promise<{ ob: OpeningBalance; credit: 'n/a' | 'ok' | 'failed' | 'no_phone' }> => {
    if (!companyId) throw new Error('Company ID not found.');

    const obRef = doc(collection(db, 'companies', companyId, 'openingBalances'));
    await setDoc(obRef, {
      partyName,
      partyNumber,
      partyType,
      amount,
      dueAmount: balanceType === 'due' ? amount : 0,
      balanceType,
      note: note || '',
      paymentHistory: [],
      createdAt: serverTimestamp(),
      source: 'catalogue',
    });

    let credit: 'n/a' | 'ok' | 'failed' | 'no_phone' = 'n/a';
    if (balanceType === 'advance') {
      try {
        credit = (await applyAdvanceCredit(obRef.id, partyType, partyName, partyNumber, amount)) ? 'ok' : 'no_phone';
      } catch (e) {
        console.error('Credit update failed:', e);
        credit = 'failed';
      }
    }

    const localOB: OpeningBalance = {
      id: obRef.id,
      partyName,
      partyNumber,
      partyType,
      amount,
      dueAmount: balanceType === 'due' ? amount : 0,
      balanceType,
      note: note || '',
      createdAt: Date.now(),
      paymentHistory: [],
    };
    setOpeningBalances((prev) => [...prev, localOB]);
    return { ob: localOB, credit };
  };

  const addBulkOpeningBalances = async (
    rows: BulkOpeningBalanceRow[],
    onProgress?: (current: number, total: number) => void,
  ): Promise<{ success: number; failed: number; duplicates: number }> => {
    if (!companyId) throw new Error('Company ID not found.');

    let success = 0;
    let failed = 0;
    let duplicates = 0;
    const newLocalOBs: OpeningBalance[] = [];

    // number -> name, so a number already used by a different party is rejected (also within the file).
    const numberToName = new Map<string, string>();
    partySummaries.forEach((p) => {
      const n = normalizePartyNumber(p.partyNumber);
      if (n) numberToName.set(n, p.partyName.trim().toLowerCase());
    });
    openingBalances.forEach((ob) => {
      const n = normalizePartyNumber(ob.partyNumber);
      if (n && !numberToName.has(n)) numberToName.set(n, ob.partyName.trim().toLowerCase());
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const phone = normalizePartyNumber(row.partyNumber);
        const nameLower = row.partyName.trim().toLowerCase();
        if (phone) {
          const existing = numberToName.get(phone);
          if (existing && existing !== nameLower) {
            duplicates++;
            onProgress?.(i + 1, rows.length);
            continue;
          }
          numberToName.set(phone, nameLower);
        }

        const obRef = doc(collection(db, 'companies', companyId, 'openingBalances'));
        await setDoc(obRef, {
          partyName: row.partyName,
          partyNumber: row.partyNumber,
          partyType: row.partyType,
          amount: row.amount,
          dueAmount: row.balanceType === 'due' ? row.amount : 0,
          balanceType: row.balanceType,
          note: row.note || '',
          address: row.address || '',
          gstNumber: row.gstNumber || '',
          paymentHistory: [],
          createdAt: row.date ? Timestamp.fromMillis(row.date) : Timestamp.now(),
          source: 'catalogue',
        });

        if (row.balanceType === 'advance' && row.amount > 0) {
          await applyAdvanceCredit(obRef.id, row.partyType, row.partyName, row.partyNumber, row.amount, {
            address: row.address,
            gstNumber: row.gstNumber,
          });
        }

        newLocalOBs.push({
          id: obRef.id,
          partyName: row.partyName,
          partyNumber: row.partyNumber,
          partyType: row.partyType,
          amount: row.amount,
          dueAmount: row.balanceType === 'due' ? row.amount : 0,
          balanceType: row.balanceType,
          note: row.note || '',
          address: row.address || '',
          gstNumber: row.gstNumber || '',
          createdAt: row.date || Date.now(),
          paymentHistory: [],
        });
        success++;
      } catch (e) {
        console.error('Failed to import row:', row, e);
        failed++;
      }
      onProgress?.(i + 1, rows.length);
    }

    if (newLocalOBs.length > 0) setOpeningBalances((prev) => [...prev, ...newLocalOBs]);
    return { success, failed, duplicates };
  };

  /* ---------- DELETE ---------- */
  const commitDeletes = async (docs: QueryDocumentSnapshot[]) => {
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db);
      docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  };

  const catalogueObDocs = async (id: string) =>
    (await getDocs(query(collection(db, 'companies', id, 'openingBalances'), where('source', '==', 'catalogue')))).docs;

  // Rare, destructive action: reads all orders once so every phone/name variant is matched.
  const deleteParty = async (party: PartySummary): Promise<{ deleted: number }> => {
    if (!companyId) throw new Error('Company ID not found.');
    const targetPhone = normalizePartyNumber(party.partyNumber);

    const ordersSnap = await getDocs(collection(db, 'companies', companyId, 'Orders'));
    const orderDocs = ordersSnap.docs.filter((d) => {
      const data = d.data();
      const phone = normalizePartyNumber(
        data.userLoginPhone || data.billingDetails?.phone || data.shippingDetails?.phone || '',
      );
      if (targetPhone) return phone === targetPhone;
      const name = data.userName || data.billingDetails?.name || data.shippingDetails?.name || 'Unknown';
      return !phone && name === party.partyName;
    });
    const obDocs = (await catalogueObDocs(companyId)).filter((d) => {
      const data = d.data();
      const phone = normalizePartyNumber(data.partyNumber || '');
      return targetPhone ? phone === targetPhone : data.partyName === party.partyName;
    });

    await commitDeletes([...orderDocs, ...obDocs]);
    clearCatalogueOrdersRangeCache(companyId);

    const orderIds = new Set(orderDocs.map((d) => d.id));
    const obIds = new Set(obDocs.map((d) => d.id));
    setOrders((prev) => prev.filter((t) => !orderIds.has(t.id)));
    setOpeningBalances((prev) => prev.filter((ob) => !obIds.has(ob.id)));
    setSelectedPartyName((prev) => (prev === party.partyNumber || prev === party.partyName ? null : prev));
    return { deleted: orderDocs.length + obDocs.length };
  };

  const deleteAllParties = async (): Promise<{ deleted: number }> => {
    if (!companyId) throw new Error('Company ID not found.');
    const ordersSnap = await getDocs(collection(db, 'companies', companyId, 'Orders'));
    const obDocs = await catalogueObDocs(companyId);
    const all = [...ordersSnap.docs, ...obDocs];
    await commitDeletes(all);
    clearCatalogueOrdersRangeCache(companyId);
    setOrders([]);
    setOpeningBalances([]);
    setSelectedPartyName(null);
    return { deleted: all.length };
  };

  /* ---------- EDIT PARTY ---------- */
  // Name / GSTIN / address live on the customers doc (keyed by 10-digit phone).
  const updatePartyDetails = async (
    party: Pick<PartySummary, 'partyNumber'>,
    details: { name: string; gstNumber: string; address: string },
  ) => {
    const phone = normalizePartyNumber(party.partyNumber);
    if (!companyId || phone.length !== 10) throw new Error('This party has no phone number to save details against.');
    const name = details.name.trim();
    const gstNumber = details.gstNumber.trim().toUpperCase();
    const address = details.address.trim();

    await setDoc(
      doc(db, 'companies', companyId, 'customers', phone),
      { number: phone, gstNumber, address, ...(name ? { name, nameEditedAt: Date.now() } : {}) },
      { merge: true },
    );

    setCustomersMaster((prev) => {
      const patch = { gstNumber, address, ...(name ? { name, nameEdited: true } : {}) };
      const i = prev.findIndex((m) => normalizePartyNumber(m.number) === phone);
      return i >= 0
        ? prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m))
        : [...prev, { name: name || 'Unknown', number: phone, ...patch }];
    });
  };

  return {
    updatePartyDetails,
    isLoading,
    authLoading,
    error,
    companyId,
    updateTransactionLocally,
    updateOpeningBalanceLocally,
    addOpeningBalance,
    openingBalances,
    addBulkOpeningBalances,
    deleteParty,
    deleteAllParties,
    datePreset,
    setDatePreset,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    appliedFilters,
    setAppliedFilters,
    partySummaries,
    selectedPartyName,
    setSelectedPartyName,
    selectedPartyLedger,
  };
}