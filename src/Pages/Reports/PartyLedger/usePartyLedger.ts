import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../context/auth-context';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../../lib/Firebase';
import { formatDateForInput } from '../SalesReportComponents/salesReport.utils';

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
    createdAt: number;
    paymentHistory: PaymentRecord[];
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
}

export default function usePartyLedger() {
    const { currentUser, loading: authLoading } = useAuth();
    const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
    const [openingBalances, setOpeningBalances] = useState<OpeningBalance[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');
    const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);
    const [selectedPartyName, setSelectedPartyName] = useState<string | null>(null);

    const [datePreset, setDatePreset] = useState<string>('thisMonth'); // Change default state

    useEffect(() => {
        const today = new Date();

        // Calculate This Month's start and end dates for the initial load
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);

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
                        partyName: data.partyName || 'Unknown Party',
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

        const grouped = allItems.reduce((acc, txn) => {
            const key = txn.partyNumber?.trim() || txn.partyName;
            const currentTxnType = txn.type === 'sale' ? 'Customer' : 'Supplier';

            if (!acc[key]) {
                acc[key] = {
                    partyName: txn.partyName || 'N/A',
                    partyNumber: txn.partyNumber || 'N/A',
                    partyType: txn.isOpeningBalance ? currentTxnType : currentTxnType, // will be corrected below
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
        }, {} as Record<string, PartySummary>);

        return Object.values(grouped).sort((a, b) => a.partyName.localeCompare(b.partyName));
    }, [transactions, openingBalances, appliedFilters]);

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
        const { doc, collection: col, setDoc, serverTimestamp, increment } = await import('firebase/firestore');
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

        // ✅ advance hai toh credit/debit balance update karo
        if (partyNumber.trim().length >= 3) {
            const collectionName = partyType === 'Customer' ? 'customers' : 'suppliers';
            let balanceField: string;

            if (partyType === 'Customer') {
                if (balanceType === 'advance') {
                    balanceField = 'creditBalance'; // You owe customer → their credit
                } else {
                    balanceField = ''; // Customer owes you → nothing to store on customer doc
                }
            } else {
                // Supplier
                if (balanceType === 'advance') {
                    balanceField = 'debitBalance'; // You pre-paid supplier → your debit/advance
                } else {
                    balanceField = ''; // Supplier owes you → receivable, nothing to store on supplier doc
                }
            }

            if (balanceField) {
                const partyRef = doc(db, 'companies', currentUser.companyId, collectionName, partyNumber.trim());
                await setDoc(partyRef, {
                    name: partyName,
                    number: partyNumber,
                    [balanceField]: increment(amount),
                }, { merge: true });
            }
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

    return {
        isLoading, authLoading, error,
        companyId: currentUser?.companyId,
        updateTransactionLocally,
        updateOpeningBalanceLocally,
        addOpeningBalance,
        openingBalances,
        datePreset, setDatePreset,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        setAppliedFilters,
        partySummaries,
        selectedPartyName, setSelectedPartyName,
        selectedPartyLedger,
    };
}