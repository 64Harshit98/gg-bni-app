import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { db } from '../lib/Firebase';
import {
    collection,
    query,
    onSnapshot,
    Timestamp,
    where,
    orderBy // <-- Import orderBy
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore'; // Import FirestoreError
import { Spinner } from '../constants/Spinner';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from './ui/card';
import { useFilter } from './Filter';

// --- Interfaces ---
interface SaleDoc {
    paymentMethods?: { [key: string]: number };
    createdAt: Timestamp;
    companyId?: string;
}

// --- Data structure for our aggregated data ---
interface PaymentStats {
    totalAmount: number;
    count: number;
}

// --- Custom Hook to Fetch and Process Payment Data ---
const usePaymentData = () => {
    const { currentUser } = useAuth();
    const { filters } = useFilter();
    const [paymentData, setPaymentData] = useState<{ [key: string]: PaymentStats }>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser?.companyId || !filters.startDate || !filters.endDate) {
            setLoading(!currentUser);
            return;
        }

        setLoading(true);
        setError(null);

        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);

        // --- FIX: Use the correct multi-tenant path ---
        const salesQuery = query(
            collection(db, 'companies', currentUser.companyId, 'sales'),
            // --- FIX: The 'companyId' where clause is no longer needed ---
            where('createdAt', '>=', start),
            where('createdAt', '<=', end),
            orderBy('createdAt', 'asc') // Add orderBy for query consistency
        );

        const unsubscribe = onSnapshot(salesQuery, (snapshot) => {
            const paymentTotals = snapshot.docs.reduce((acc, doc) => {
                const sale = doc.data() as SaleDoc;
                if (sale.paymentMethods) {
                    for (const method in sale.paymentMethods) {
                        if (sale.paymentMethods[method] > 0) { // Only count if a value was entered
                            const capitalizedMethod = method.charAt(0).toUpperCase() + method.slice(1);

                            const currentStats = acc[capitalizedMethod] || { totalAmount: 0, count: 0 };

                            acc[capitalizedMethod] = {
                                totalAmount: currentStats.totalAmount + sale.paymentMethods[method],
                                count: currentStats.count + 1
                            };
                        }
                    }
                }
                return acc;
            }, {} as { [key: string]: PaymentStats });

            setPaymentData(paymentTotals);
            setLoading(false);
        }, (err: FirestoreError) => { // Use typed error
            console.error('Error fetching payment data:', err);
            setError(`Failed to load payment data: ${err.message}`);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, filters]); // 'currentUser' is correct, it contains companyId

    return { paymentData, loading, error };
};


// --- Main Payment Chart Component ---
interface PaymentChartProps {
    isDataVisible: boolean;
}

export const PaymentChart: React.FC<PaymentChartProps> = ({ isDataVisible }) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');
    const { paymentData, loading, error } = usePaymentData();

    const renderContent = () => {
        if (loading) return <Spinner />;
        if (error) return <p className="text-center text-red-500">{error}</p>;

        if (!isDataVisible) {
            return (
                <div className="flex flex-col items-center justify-center text-center text-gray-500 py-4">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                    Data is hidden
                </div>
            );
        }

        const dataToSort = Object.entries(paymentData);

        if (viewMode === 'amount') {
            dataToSort.sort(([, a], [, b]) => b.totalAmount - a.totalAmount);
        } else {
            dataToSort.sort(([, a], [, b]) => b.count - a.count);
        }

        if (dataToSort.length === 0) {
            return <p className="text-center text-gray-500">No payment data for this period.</p>;
        }

        const maxValue = Math.max(...dataToSort.map(([, stats]) => viewMode === 'amount' ? stats.totalAmount : stats.count), 1);

        return (
            <div className="space-y-4">
                {dataToSort.map(([method, stats]) => (
                    <div key={method}>
                        <div className="flex justify-between items-center text-sm mb-1">
                            <span className="font-medium text-gray-600 capitalize">{method}</span>
                            {viewMode === 'amount' ? (
                                <span className="font-semibold text-gray-800">₹{stats.totalAmount.toLocaleString('en-IN')}</span>
                            ) : (
                                <span className="font-semibold text-gray-800">{stats.count} <span className="text-xs font-normal text-gray-500">times</span></span>
                            )}
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                                style={{ width: `${((viewMode === 'amount' ? stats.totalAmount : stats.count) / maxValue) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Payment Methods</CardTitle>
                <div className="flex items-center p-1 bg-gray-100 rounded-lg">
                    <button
                        onClick={() => setViewMode('amount')}
                        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        Amt
                    </button>
                    <button
                        onClick={() => setViewMode('quantity')}
                        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'quantity' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
                    >
                        Qty
                    </button>
                </div>
            </CardHeader>
            <CardContent>{renderContent()}</CardContent>
        </Card>
    );
};