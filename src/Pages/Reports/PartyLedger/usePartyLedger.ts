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

    // Group all transactions (Sales & Purchases) by party name
    const partySummaries = useMemo(() => {
        const grouped = transactions.reduce((acc, txn) => {
            const name = txn.partyName;
            const currentTxnType = txn.type === 'sale' ? 'Customer' : 'Supplier';

            if (!acc[name]) {
                acc[name] = {
                    partyName: name || 'N/A',
                    partyNumber: txn.partyNumber || 'N/A',
                    partyType: currentTxnType, // Set initial type
                    totalBilled: 0,
                    totalDue: 0,
                    totalTransactions: 0,
                    transactions: [],
                };
            } else {
                // If they already exist, check if we need to update them to "Both"
                if (acc[name].partyType !== currentTxnType && acc[name].partyType !== 'Both') {
                    acc[name].partyType = 'Both';
                }
            }

            acc[name].totalBilled += txn.totalAmount;
            acc[name].totalDue += txn.dueAmount;
            acc[name].totalTransactions += 1;
            acc[name].transactions.push(txn);

            return acc;
        }, {} as Record<string, PartySummary>);

        return Object.values(grouped).sort((a, b) => a.partyName.localeCompare(b.partyName));
    }, [transactions]);

    const selectedPartyLedger = useMemo(() => {
        if (!selectedPartyName) return null;
        return partySummaries.find(p => p.partyName === selectedPartyName) || null;
    }, [selectedPartyName, partySummaries]);

    return {
        isLoading, authLoading, error,
        datePreset, setDatePreset,
        customStartDate, setCustomStartDate,
        customEndDate, setCustomEndDate,
        setAppliedFilters,
        partySummaries,
        selectedPartyName, setSelectedPartyName,
        selectedPartyLedger,
    };
}