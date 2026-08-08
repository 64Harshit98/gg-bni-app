import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../context/auth-context';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';

export const normalizePartyNumber = (num?: string): string => {
    if (!num) return '';
    const digits = num.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
};
export interface PaymentRecord {
    amount: number;
    method: string;
    date: string;
    timestamp: number;
}
export interface OpeningBalance {
    id: string;
    partyName: string;
    partyNumber: string;
    partyType: 'Customer' | 'Supplier';
    amount: number;
    dueAmount: number;
    balanceType?: 'due' | 'advance'; // ✅ 'due' = they owe you, 'advance' = you owe them
    note?: string;
    address?: string;    // NEW
    gstNumber?: string;  // NEW
    createdAt: number;
    paymentHistory: PaymentRecord[];
}
// NEW: shape of one parsed row from the bulk-import Excel sheet
export interface BulkOpeningBalanceRow {
    partyName: string;
    partyNumber: string;
    partyType: 'Customer' | 'Supplier';
    amount: number;
    balanceType: 'due' | 'advance';
    note?: string;
    address?: string;    // NEW
    gstNumber?: string;  // NEW
    date?: number; // millis, optional — defaults to "now" if not in the sheet
}

// Renamed from LedgerSaleRecord to LedgerTransaction to reflect both Sales & Purchases
export interface LedgerTransaction {
    id: string;
    invoiceNumber?: string;
    partyName: string;
    partyNumber: string;
    totalAmount: number;
    dueAmount: number;
    paymentHistory: PaymentRecord[];
    createdAt: number;
    type: 'sale' | 'purchase'; // NEW: Identifies the type of bill
    isOpeningBalance?: boolean;
    note?: string;
}

export interface PartySummary {
    partyName: string;
    partyNumber: string;
    partyType: 'Customer' | 'Supplier' | 'Both';
    totalBilled: number;
    totalDue: number;
    totalTransactions: number;
    transactions: LedgerTransaction[]; // Changed from 'sales' to 'transactions'
    address?: string;    // NEW
    gstNumber?: string;  // NEW
}

// NEW: given a balanceType + partyType, decide which field on the customers/suppliers
// master doc represents that balance. 'advance' reuses the credit/debit fields already
// used elsewhere (payment settlement, credit notes). 'due' is tracked separately so it
// never gets confused with advance/credit-note balances.
const getMasterBalanceField = (partyType: 'Customer' | 'Supplier', balanceType: 'due' | 'advance'): string => {
    if (balanceType === 'advance') {
        return partyType === 'Customer' ? 'creditBalance' : 'debitBalance';
    }
    return 'dueBalance';
};

export default function usePartyLedger() {
    const { currentUser, loading: authLoading } = useAuth();
    const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
    const [openingBalances, setOpeningBalances] = useState<OpeningBalance[]>([]);
    // NEW: lightweight master records for customers/suppliers who may have NO transactions
    // or opening balance yet (e.g. bulk-imported with a zero balance) — without this,
    // such parties would never appear in partySummaries at all.
    const [customersMaster, setCustomersMaster] = useState<{ name: string; number: string; createdAt?: number; address?: string; gstNumber?: string }[]>([]);
    const [suppliersMaster, setSuppliersMaster] = useState<{ name: string; number: string; createdAt?: number; address?: string; gstNumber?: string }[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');
    const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);
    const [selectedPartyName, setSelectedPartyName] = useState<string | null>(null);

    const [datePreset, setDatePreset] = useState<string>('thisMonth'); // Change default state

    useEffect(() => {
        const start = new Date();
        start.setDate(start.getDate() - 29);
        const end = new Date();

        const startDateStr = formatDateForInput(start);
        const endDateStr = formatDateForInput(end);

        setCustomStartDate(startDateStr);
        setCustomEndDate(endDateStr);

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        setAppliedFilters({ start: start.getTime(), end: end.getTime() });
    }, []);
    useEffect(() => {
        if (authLoading) return;
        if (!currentUser?.companyId || !appliedFilters) {
            setIsLoading(false);
            return;
        }

        const fetchLedgerData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const start = new Date(appliedFilters.start);
                const end = new Date(appliedFilters.end);
                const companyId = currentUser.companyId;

                // Query setup for BOTH sales and purchases
                const salesRef = collection(db, 'companies', companyId, 'sales');
                const purchasesRef = collection(db, 'companies', companyId, 'purchases');

                const baseQueryConditions = [
                    where('createdAt', '>=', Timestamp.fromDate(start)),
                    where('createdAt', '<=', Timestamp.fromDate(end))
                ];

                const salesQ = query(salesRef, ...baseQueryConditions);
                const purchasesQ = query(purchasesRef, ...baseQueryConditions);

                // Fetch both simultaneously
                const [salesSnapshot, purchasesSnapshot] = await Promise.all([
                    getDocs(salesQ),
                    getDocs(purchasesQ)
                ]);
                const mappedSales = salesSnapshot.docs.map((doc) => {
                    const data = doc.data();
                    const creationMillis = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now();

                    let history: PaymentRecord[] = data.paymentHistory || [];

                    // RETROACTIVE FIX: If no history exists, build it from initial paymentMethods
                    if (history.length === 0 && data.paymentMethods) {
                        Object.entries(data.paymentMethods).forEach(([method, amount]) => {
                            if (method !== 'due' && method !== 'balance' && typeof amount === 'number' && amount > 0) {
                                history.push({
                                    amount: amount,
                                    method: method,
                                    date: new Date(creationMillis).toISOString(),
                                    timestamp: creationMillis
                                });
                            }
                        });
                    }

                    return {
                        id: doc.id,
                        invoiceNumber: data.invoiceNumber,
                        partyName: data.partyName || 'N/A',
                        partyNumber: data.partyNumber || '',
                        totalAmount: data.totalAmount || 0,
                        dueAmount: data.paymentMethods?.due ?? data.dueAmount ?? 0,
                        paymentHistory: history, // <-- Using the reconstructed history
                        createdAt: creationMillis,
                        type: 'sale' as const
                    } as LedgerTransaction;
                });

                const mappedPurchases = purchasesSnapshot.docs.map((doc) => {
                    const data = doc.data();
                    const creationMillis = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now();

                    let history: PaymentRecord[] = data.paymentHistory || [];

                    // RETROACTIVE FIX: If no history exists, build it from initial paymentMethods
                    if (history.length === 0 && data.paymentMethods) {
                        Object.entries(data.paymentMethods).forEach(([method, amount]) => {
                            if (method !== 'due' && method !== 'balance' && typeof amount === 'number' && amount > 0) {
                                history.push({
                                    amount: amount,
                                    method: method,
                                    date: new Date(creationMillis).toISOString(),
                                    timestamp: creationMillis
                                });
                            }
                        });
                    }

                    return {
                        id: doc.id,
                        invoiceNumber: data.invoiceNumber || data.billNumber,
                        partyName: data.partyName || 'N/A',
                        partyNumber: data.partyNumber || '',
                        totalAmount: data.totalAmount || 0,
                        dueAmount: data.paymentMethods?.due ?? data.dueAmount ?? 0,
                        paymentHistory: history, // <-- Using the reconstructed history
                        createdAt: creationMillis,
                        type: 'purchase' as const
                    } as LedgerTransaction;
                });

                // Combine and sort by date descending
                const combinedTransactions = [...mappedSales, ...mappedPurchases].sort((a, b) => b.createdAt - a.createdAt);
                setTransactions(combinedTransactions);

            } catch (err) {
                console.error('Error fetching ledger:', err);
                setError('Failed to load ledger data.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchLedgerData();
    }, [currentUser, authLoading, appliedFilters]);
    // ✅ NEW: Fetch opening balances independently — no date filter, always load all
    useEffect(() => {
        if (authLoading || !currentUser?.companyId) return;

        const fetchOpeningBalances = async () => {
            try {
                const companyId = currentUser.companyId;
                const obRef = collection(db, 'companies', companyId, 'openingBalances');
                const obSnapshot = await getDocs(obRef);
                const mappedOB: OpeningBalance[] = obSnapshot.docs.map(doc => {
                    const data = doc.data();
                    const creationMillis = data.createdAt instanceof Timestamp
                        ? data.createdAt.toMillis()
                        : Date.now();
                    return {
                        id: doc.id,
                        partyName: data.partyName || 'Unknown',
                        partyNumber: data.partyNumber || '',
                        partyType: data.partyType || 'Customer',
                        amount: data.amount || 0,
                        dueAmount: data.dueAmount ?? data.amount ?? 0,
                        balanceType: data.balanceType || 'due', // ✅
                        note: data.note || '',
                        createdAt: creationMillis,
                        paymentHistory: data.paymentHistory || [],
                    };
                });
                setOpeningBalances(mappedOB);
            } catch (err) {
                console.error('Error fetching opening balances:', err);
            }
        };

        fetchOpeningBalances();
    }, [currentUser?.companyId, authLoading]); // ✅ Only re-runs when company changes, NOT on date filter change

    // NEW: Fetch customers/suppliers master records — no date filter, same as opening
    // balances. This is what lets a party onboarded with a zero balance (name/number
    // only, no due/advance) still show up in the party list below.
    useEffect(() => {
        if (authLoading || !currentUser?.companyId) return;

        const fetchMasters = async () => {
            try {
                const companyId = currentUser.companyId;
                const custRef = collection(db, 'companies', companyId, 'customers');
                const supRef = collection(db, 'companies', companyId, 'suppliers');
                const [custSnap, supSnap] = await Promise.all([getDocs(custRef), getDocs(supRef)]);

                setCustomersMaster(custSnap.docs.map(d => {
                    const data = d.data();
                    const createdAtMillis = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : undefined;
                    return {
                        name: data.name || data.partyName || 'Unknown',
                        number: data.number || d.id,
                        createdAt: createdAtMillis,
                        address: data.address || '',      // NEW
                        gstNumber: data.gstNumber || '',  // NEW
                    };
                }));
                setSuppliersMaster(supSnap.docs.map(d => {
                    const data = d.data();
                    const createdAtMillis = data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : undefined;
                    return {
                        name: data.name || data.partyName || 'Unknown',
                        number: data.number || d.id,
                        createdAt: createdAtMillis,
                        address: data.address || '',      // NEW
                        gstNumber: data.gstNumber || '',  // NEW
                    };
                }));
            } catch (err) {
                console.error('Error fetching customers/suppliers master records:', err);
            }
        };

        fetchMasters();
    }, [currentUser?.companyId, authLoading]);

    // Group all transactions (Sales & Purchases) by party name
    const partySummaries = useMemo(() => {
        // ✅ Filter opening balances by the applied date range
        const filteredOBs = openingBalances.filter(ob => {
            if (!appliedFilters) return false;
            return ob.createdAt >= appliedFilters.start && ob.createdAt <= appliedFilters.end;
        });
        // Merge opening balances as pseudo-transactions into grouped view
        const obAsTransactions: LedgerTransaction[] = filteredOBs.map(ob => ({
            id: ob.id,
            invoiceNumber: undefined,
            partyName: ob.partyName,
            partyNumber: ob.partyNumber,
            totalAmount: ob.amount,
            dueAmount: ob.dueAmount,
            paymentHistory: ob.paymentHistory,
            createdAt: ob.createdAt,
            type: ob.partyType === 'Customer' ? 'sale' : 'purchase' as 'sale' | 'purchase',
            isOpeningBalance: true,
            note: ob.note,
            balanceType: ob.balanceType ?? 'due',  // ✅ balanceType pass karo
        } as LedgerTransaction & { isOpeningBalance: boolean; balanceType: string }));

        const allItems = [...transactions, ...obAsTransactions];

       // ✅ Strict date filtering — every party (billing-created or Opening-Balance-created)
        // now gets a proper createdAt stamp from PaymentDrawer/addOpeningBalance, so this
        // filters exactly by the applied date range with no exceptions.
        const filteredCustomersMaster = customersMaster.filter(c => {
            if (!appliedFilters || c.createdAt === undefined) return false;
            return c.createdAt >= appliedFilters.start && c.createdAt <= appliedFilters.end;
        });
        const filteredSuppliersMaster = suppliersMaster.filter(s => {
            if (!appliedFilters || s.createdAt === undefined) return false;
            return s.createdAt >= appliedFilters.start && s.createdAt <= appliedFilters.end;
        });

        // NEW: seed the accumulator with every known customer/supplier master record first,
        // at zero — so a party with no transactions and no opening balance (e.g. bulk
        // imported with a 0 due/advance) still shows up in the list. Real activity below
        // fills in on top of this seed using the same key, so nothing gets double-counted.
        const seed: Record<string, PartySummary> = {};
        filteredCustomersMaster.forEach(c => {
            const normalizedNumber = normalizePartyNumber(c.number);
            const key = normalizedNumber || c.name.trim().toLowerCase();
            seed[key] = {
                partyName: c.name || 'N/A',
                partyNumber: normalizedNumber || c.number || 'N/A',
                partyType: 'Customer',
                totalBilled: 0,
                totalDue: 0,
                totalTransactions: 0,
                transactions: [],
                address: c.address || undefined,     // NEW
                gstNumber: c.gstNumber || undefined, // NEW
            };
        });
        filteredSuppliersMaster.forEach(s => {
            const normalizedNumber = normalizePartyNumber(s.number);
            const key = normalizedNumber || s.name.trim().toLowerCase();
            if (seed[key]) {
                seed[key] = {
                    ...seed[key],
                    partyType: 'Both',
                    address: seed[key].address || s.address,       // NEW
                    gstNumber: seed[key].gstNumber || s.gstNumber,  // NEW
                };
            } else {
                seed[key] = {
                    partyName: s.name || 'N/A',
                    partyNumber: normalizedNumber || s.number || 'N/A',
                    partyType: 'Supplier',
                    totalBilled: 0,
                    totalDue: 0,
                    totalTransactions: 0,
                    transactions: [],
                    address: s.address || undefined,     // NEW
                    gstNumber: s.gstNumber || undefined, // NEW
                };
            }
        });

        const grouped = allItems.reduce((acc, txn) => {
            const normalizedNumber = normalizePartyNumber(txn.partyNumber);
            // Falls back to lowercased name only when there's truly no number to key on
            const key = normalizedNumber || txn.partyName.trim().toLowerCase();
            const currentTxnType = txn.type === 'sale' ? 'Customer' : 'Supplier';

            if (!acc[key]) {
                acc[key] = {
                    partyName: txn.partyName || 'N/A',
                    partyNumber: normalizedNumber || txn.partyNumber || 'N/A',
                    partyType: txn.isOpeningBalance ? currentTxnType : currentTxnType,
                    totalBilled: 0,
                    totalDue: 0,
                    totalTransactions: 0,
                    transactions: [],
                };
            } else {
                if (txn.partyName && txn.partyName !== 'N/A') {
                    acc[key].partyName = txn.partyName;
                }
                // ✅ Only real bills (not opening balances) can flip partyType to 'Both'
                if (!txn.isOpeningBalance && acc[key].partyType !== currentTxnType && acc[key].partyType !== 'Both') {
                    acc[key].partyType = 'Both';
                }
            }

            acc[key].totalBilled += txn.totalAmount;
            // ✅ advance OB totalDue mein add nahi hoga
            if (!(txn.isOpeningBalance && (txn as any).balanceType === 'advance')) {
                acc[key].totalDue += txn.dueAmount;
            }
            if (!txn.isOpeningBalance) {
                acc[key].totalTransactions += 1;
            }
            acc[key].transactions.push(txn);

            return acc;
        }, seed);

        return Object.values(grouped).sort((a, b) => a.partyName.localeCompare(b.partyName));
    }, [transactions, openingBalances, appliedFilters, customersMaster, suppliersMaster]);

    const selectedPartyLedger = useMemo(() => {
        if (!selectedPartyName) return null;
        return (
            partySummaries.find(p => p.partyNumber === selectedPartyName) ||
            partySummaries.find(p => p.partyName === selectedPartyName) ||
            null
        );
    }, [selectedPartyName, partySummaries]);
    const updateTransactionLocally = (invoiceId: string, amountPaid: number, paymentRecord: PaymentRecord) => {
        setTransactions(prev =>
            prev.map(txn => {
                if (txn.id !== invoiceId) return txn;
                return {
                    ...txn,
                    dueAmount: Math.max(0, txn.dueAmount - amountPaid),
                    paymentHistory: [...txn.paymentHistory, paymentRecord],
                };
            })
        );
    };
    const updateOpeningBalanceLocally = (obId: string, amountPaid: number, paymentRecord: PaymentRecord) => {
        setOpeningBalances(prev =>
            prev.map(ob => {
                if (ob.id !== obId) return ob;
                return {
                    ...ob,
                    dueAmount: Math.max(0, ob.dueAmount - amountPaid),
                    paymentHistory: [...ob.paymentHistory, paymentRecord],
                };
            })
        );
    };

    const addOpeningBalance = async (
        partyName: string,
        partyNumber: string,
        partyType: 'Customer' | 'Supplier',
        amount: number,
        note?: string,
        balanceType: 'due' | 'advance' = 'due'
    ) => {
        if (!currentUser?.companyId) throw new Error('Company ID not found.');

        // ✅ Reject if this number already belongs to a different party
        const normalizedNumber = normalizePartyNumber(partyNumber);
        if (normalizedNumber) {
            const clash = partySummaries.find(
                p => normalizePartyNumber(p.partyNumber) === normalizedNumber &&
                    p.partyName.trim().toLowerCase() !== partyName.trim().toLowerCase()
            );
            if (clash) {
                throw new Error(`This number is already saved against "${clash.partyName}". Use the same name, or correct the number.`);
            }
        }

        const { doc, collection: col, setDoc, getDoc, serverTimestamp, increment } = await import('firebase/firestore');
        const obRef = doc(col(db, 'companies', currentUser.companyId, 'openingBalances'));
        const newOB = {
            partyName,
            partyNumber,
            partyType,
            amount,
            dueAmount: balanceType === 'due' ? amount : 0,  // ✅ advance ka dueAmount 0
            balanceType,
            note: note || '',
            paymentHistory: [],
            createdAt: serverTimestamp(),
        };
        await setDoc(obRef, newOB);

        // ✅ NEW: always sync the customers/suppliers master doc (name, number, type + the
        // matching balance field), not just for advances. This keeps the party's master
        // record in sync with what the ledger shows, regardless of balance type.
        if (partyNumber.trim().length >= 3) {
            const collectionName = partyType === 'Customer' ? 'customers' : 'suppliers';
            const balanceField = getMasterBalanceField(partyType, balanceType);
            const partyRef = doc(db, 'companies', currentUser.companyId, collectionName, partyNumber.trim());

            // ✅ Only stamp createdAt the FIRST time this party doc is created — otherwise
            // every later opening balance on the same party would keep resetting it, and
            // the party would fall out of the date filter it was originally created in.
            const existingSnap = await getDoc(partyRef);
            const payload: Record<string, any> = {
                name: partyName,
                number: partyNumber,
                partyType,
                [balanceField]: increment(amount),
            };
            const isNewMasterDoc = !existingSnap.exists() || !existingSnap.data()?.createdAt;
            if (isNewMasterDoc) {
                payload.createdAt = serverTimestamp();
            }
            await setDoc(partyRef, payload, { merge: true });

            // ✅ Reflect it locally right away, so it shows up in the list without a reload
            const normalizedTarget = normalizePartyNumber(partyNumber);
            const localCreatedAt = isNewMasterDoc
                ? Date.now()
                : (existingSnap.data()?.createdAt instanceof Timestamp ? existingSnap.data()!.createdAt.toMillis() : Date.now());
            const upsert = (prev: { name: string; number: string; createdAt?: number }[]) => {
                const exists = prev.some(p => normalizePartyNumber(p.number) === normalizedTarget);
                if (exists) return prev.map(p => normalizePartyNumber(p.number) === normalizedTarget ? { name: partyName, number: partyNumber, createdAt: localCreatedAt } : p);
                return [...prev, { name: partyName, number: partyNumber, createdAt: localCreatedAt }];
            };
            if (partyType === 'Customer') setCustomersMaster(upsert);
            else setSuppliersMaster(upsert);
        }
        const localOB: OpeningBalance = {
            id: obRef.id,
            partyName,
            partyNumber,
            partyType,
            amount,
            dueAmount: balanceType === 'due' ? amount : 0,
            balanceType,   // ✅ stored locally
            note: note || '',
            createdAt: Date.now(),
            paymentHistory: [],
        };
        setOpeningBalances(prev => [...prev, localOB]);
        return localOB;
    };
    // NEW: bulk version of addOpeningBalance — loops through parsed Excel rows,
    // writes each as an opening balance, and reports progress as it goes.
    const addBulkOpeningBalances = async (
        rows: BulkOpeningBalanceRow[],
        onProgress?: (current: number, total: number) => void
    ): Promise<{ success: number; failed: number; duplicates: number }> => {
        if (!currentUser?.companyId) throw new Error('Company ID not found.');
        const { doc, collection: col, setDoc, getDoc, increment, Timestamp: FsTimestamp } = await import('firebase/firestore');
        const companyId = currentUser.companyId;

        let success = 0;
        let failed = 0;
        let duplicates = 0;
        const newLocalOBs: OpeningBalance[] = [];
        // ✅ Collect customer/supplier master upserts here, applied to local state once at
        // the end — so the whole imported list shows up immediately, no reload needed.
        const masterUpserts: { partyType: 'Customer' | 'Supplier'; name: string; number: string; createdAt: number; address?: string; gstNumber?: string }[] = [];

        // ✅ Seed a number→name map with parties that already exist, then keep it
        // updated as we go through the sheet so within-file duplicates are caught too
        const numberToName = new Map<string, string>();
        partySummaries.forEach(p => {
            const norm = normalizePartyNumber(p.partyNumber);
            if (norm) numberToName.set(norm, p.partyName.trim().toLowerCase());
        });

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                const normalizedNumber = normalizePartyNumber(row.partyNumber);
                const rowNameLower = row.partyName.trim().toLowerCase();

                if (normalizedNumber) {
                    const existingName = numberToName.get(normalizedNumber);
                    if (existingName && existingName !== rowNameLower) {
                        console.warn(`Row ${i + 1} skipped: number ${row.partyNumber} already used by "${existingName}"`);
                        duplicates++;
                        onProgress?.(i + 1, rows.length);
                        continue;
                    }
                    numberToName.set(normalizedNumber, rowNameLower);
                }

                // ✅ Only create an opening-balance record when there's an actual amount —
                // a zero-balance row is just onboarding the party, not logging a due/advance,
                // so it shouldn't leave a phantom "₹0" transaction card in the ledger.
                if (row.amount > 0) {
                    const obRef = doc(col(db, 'companies', companyId, 'openingBalances'));
                    const createdAtValue = row.date ? FsTimestamp.fromMillis(row.date) : FsTimestamp.now();

                    const newOB = {
                        partyName: row.partyName,
                        partyNumber: row.partyNumber,
                        partyType: row.partyType,
                        amount: row.amount,
                        dueAmount: row.balanceType === 'due' ? row.amount : 0,
                        balanceType: row.balanceType,
                        note: row.note || '',
                        address: row.address || '',      // NEW
                        gstNumber: row.gstNumber || '',  // NEW
                        paymentHistory: [],
                        createdAt: createdAtValue,
                    };
                    await setDoc(obRef, newOB);

                    newLocalOBs.push({
                        id: obRef.id,
                        partyName: row.partyName,
                        partyNumber: row.partyNumber,
                        partyType: row.partyType,
                        amount: row.amount,
                        dueAmount: row.balanceType === 'due' ? row.amount : 0,
                        balanceType: row.balanceType,
                        note: row.note || '',
                        address: row.address || '',      // NEW
                        gstNumber: row.gstNumber || '',  // NEW
                        createdAt: row.date || Date.now(),
                        paymentHistory: [],
                    });
                }

                // ✅ FIXED: this used to only run for balanceType === 'advance', so "due" rows
                // (the common case — old dues owed to you) never touched the customers/suppliers
                // collection at all. Now every row syncs the party's master doc — including
                // zero-balance rows, so a party with no due/advance still gets created here.
                if (row.partyNumber.trim().length >= 3) {
                    const collectionName = row.partyType === 'Customer' ? 'customers' : 'suppliers';
                    const balanceField = getMasterBalanceField(row.partyType, row.balanceType);
                    const partyRef = doc(db, 'companies', companyId, collectionName, row.partyNumber.trim());

                    // ✅ Only stamp createdAt the FIRST time this party doc is created — a
                    // party imported earlier shouldn't have its date reset by a later row
                    // that happens to touch the same number (e.g. another opening balance).
                    const existingSnap = await getDoc(partyRef);
                    const rowCreatedAtMillis = row.date || Date.now();
                    const payload: Record<string, any> = {
                        name: row.partyName,
                        number: row.partyNumber,
                        partyType: row.partyType,
                        [balanceField]: increment(row.amount),
                        ...(row.address ? { address: row.address } : {}),       // NEW
                        ...(row.gstNumber ? { gstNumber: row.gstNumber } : {}), // NEW
                    };
                    const isNewMasterDoc = !existingSnap.exists() || !existingSnap.data()?.createdAt;
                    if (isNewMasterDoc) {
                        payload.createdAt = row.date ? FsTimestamp.fromMillis(row.date) : FsTimestamp.now();
                    }
                    await setDoc(partyRef, payload, { merge: true });

                    const masterCreatedAt = isNewMasterDoc
                        ? rowCreatedAtMillis
                        : (existingSnap.data()?.createdAt instanceof FsTimestamp ? existingSnap.data()!.createdAt.toMillis() : rowCreatedAtMillis);
                    masterUpserts.push({ partyType: row.partyType, name: row.partyName, number: row.partyNumber, createdAt: masterCreatedAt, address: row.address, gstNumber: row.gstNumber });
                }
                success++;
            } catch (e) {
                console.error('Failed to import opening balance row:', row, e);
                failed++;
            }
            onProgress?.(i + 1, rows.length);
        }

        if (newLocalOBs.length > 0) {
            setOpeningBalances(prev => [...prev, ...newLocalOBs]);
        }

        if (masterUpserts.length > 0) {
            const applyUpserts = (prev: { name: string; number: string; createdAt?: number, address?: string; gstNumber?: string }[], upserts: typeof masterUpserts) => {
                const map = new Map(prev.map(p => [normalizePartyNumber(p.number), p]));
                upserts.forEach(u => map.set(normalizePartyNumber(u.number), { name: u.name, number: u.number, createdAt: u.createdAt, address: u.address, gstNumber: u.gstNumber }));
                return Array.from(map.values());
            };
            const customerUpserts = masterUpserts.filter(u => u.partyType === 'Customer');
            const supplierUpserts = masterUpserts.filter(u => u.partyType === 'Supplier');
            if (customerUpserts.length > 0) setCustomersMaster(prev => applyUpserts(prev, customerUpserts));
            if (supplierUpserts.length > 0) setSuppliersMaster(prev => applyUpserts(prev, supplierUpserts));
        }

        return { success, failed, duplicates };
    };

    // NEW: delete a single party — removes every sale, purchase, and opening-balance
    // document that belongs to them (matched by normalized phone number, falling back
    // to name when there's no number), plus their customers/suppliers master doc(s).
    // Matching is done by fetching each collection and filtering client-side, since
    // partyNumber isn't guaranteed to be stored in a single consistent format, so a
    // direct Firestore `where` query could silently miss variants.
    const deleteParty = async (party: PartySummary): Promise<{ deleted: number }> => {
        if (!currentUser?.companyId) throw new Error('Company ID not found.');
        const companyId = currentUser.companyId;
        const {
            doc, deleteDoc, writeBatch,
            collection: col, getDocs: fsGetDocs,
        } = await import('firebase/firestore');

        const normalizedNumber = normalizePartyNumber(party.partyNumber);
        const nameLower = party.partyName.trim().toLowerCase();
        let deletedCount = 0;

        const matchesParty = (data: any) => {
            const num = normalizePartyNumber(data.partyNumber);
            if (normalizedNumber) return num === normalizedNumber;
            return (data.partyName || '').trim().toLowerCase() === nameLower;
        };

        const deleteMatchingDocs = async (collectionName: string) => {
            const ref = col(db, 'companies', companyId, collectionName);
            const snap = await fsGetDocs(ref);
            const matches = snap.docs.filter(d => matchesParty(d.data()));
            for (let i = 0; i < matches.length; i += 450) {
                const batch = writeBatch(db);
                matches.slice(i, i + 450).forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
            deletedCount += matches.length;
        };

        await deleteMatchingDocs('sales');
        await deleteMatchingDocs('purchases');
        await deleteMatchingDocs('openingBalances');

        // Delete the master record(s) — a party can have both if they're 'Both' type
        if (normalizedNumber) {
            try { await deleteDoc(doc(db, 'companies', companyId, 'customers', normalizedNumber)); } catch { /* may not exist */ }
            try { await deleteDoc(doc(db, 'companies', companyId, 'suppliers', normalizedNumber)); } catch { /* may not exist */ }
        }

        // Update local state so the UI reflects the deletion immediately
        setTransactions(prev => prev.filter(t => !matchesParty(t)));
        setOpeningBalances(prev => prev.filter(ob => !matchesParty(ob)));
        setCustomersMaster(prev => prev.filter(c => !matchesParty({ partyNumber: c.number, partyName: c.name })));
        setSuppliersMaster(prev => prev.filter(s => !matchesParty({ partyNumber: s.number, partyName: s.name })));
        setSelectedPartyName(prev => (prev === party.partyNumber || prev === party.partyName ? null : prev));

        return { deleted: deletedCount };
    };

    // NEW: wipe every party's data for the company — sales, purchases, opening
    // balances, and the customers/suppliers master records. Irreversible; the
    // confirmation step lives in the UI, not here.
    const deleteAllParties = async (): Promise<{ deleted: number }> => {
        if (!currentUser?.companyId) throw new Error('Company ID not found.');
        const companyId = currentUser.companyId;
        const { writeBatch, collection: col, getDocs: fsGetDocs } = await import('firebase/firestore');

        let deletedCount = 0;
        const wipeCollection = async (collectionName: string) => {
            const ref = col(db, 'companies', companyId, collectionName);
            const snap = await fsGetDocs(ref);
            for (let i = 0; i < snap.docs.length; i += 450) {
                const batch = writeBatch(db);
                snap.docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
                await batch.commit();
            }
            deletedCount += snap.docs.length;
        };

        await wipeCollection('sales');
        await wipeCollection('purchases');
        await wipeCollection('openingBalances');
        await wipeCollection('customers');
        await wipeCollection('suppliers');

        setTransactions([]);
        setOpeningBalances([]);
        setCustomersMaster([]);
        setSuppliersMaster([]);
        setSelectedPartyName(null);

        return { deleted: deletedCount };
    };

    return {
        isLoading, authLoading, error,
        companyId: currentUser?.companyId,
        updateTransactionLocally,
        updateOpeningBalanceLocally,
        addOpeningBalance,
        openingBalances,
        addBulkOpeningBalances,
        deleteParty,
        deleteAllParties,
        datePreset, setDatePreset,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        setAppliedFilters,
        partySummaries,
        selectedPartyName, setSelectedPartyName,
        selectedPartyLedger,
    };
}