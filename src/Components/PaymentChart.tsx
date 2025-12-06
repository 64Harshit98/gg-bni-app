import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/auth-context';
import { db } from '../lib/Firebase';
import {
    collection,
    query,
    onSnapshot,
    Timestamp,
    where,
    orderBy
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';
import { Spinner } from '../constants/Spinner';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from './ui/card';

// --- Types ---
export type ReportType = 'sales' | 'purchases';

interface TransactionDoc {
    paymentMethods?: { [key: string]: number };
    createdAt: Timestamp;
    companyId?: string;
}

interface PaymentStats {
    totalAmount: number;
    count: number;
}

// Interface for the filters passed as props
export interface ChartFilters {
    start: Date | number | string | null;
    end: Date | number | string | null;
}

// --- Custom Hook ---
const usePaymentData = (
    collectionName: ReportType, 
    filters: ChartFilters
) => {
    const { currentUser } = useAuth();
    
    const [paymentData, setPaymentData] = useState<{ [key: string]: PaymentStats }>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Validation: Ensure we have user, dates, and collection
        if (!currentUser?.companyId || !filters.start || !filters.end) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        // Normalize dates to Date objects
        const start = new Date(filters.start);
        const end = new Date(filters.end);

        const q = query(
            collection(db, 'companies', currentUser.companyId, collectionName),
            where('createdAt', '>=', start),
            where('createdAt', '<=', end),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const paymentTotals = snapshot.docs.reduce((acc, doc) => {
                const data = doc.data() as TransactionDoc;
                
                if (data.paymentMethods) {
                    for (const method in data.paymentMethods) {
                        const amount = data.paymentMethods[method];
                        if (amount > 0) {
                            // Format: "creditCard" -> "Credit Card"
                            const formattedMethod = method
                                .replace(/([a-z])([A-Z])/g, '$1 $2')
                                .replace(/_/g, ' ')
                                .replace(/\b\w/g, c => c.toUpperCase());

                            const currentStats = acc[formattedMethod] || { totalAmount: 0, count: 0 };

                            acc[formattedMethod] = {
                                totalAmount: currentStats.totalAmount + amount,
                                count: currentStats.count + 1
                            };
                        }
                    }
                }
                return acc;
            }, {} as { [key: string]: PaymentStats });

            setPaymentData(paymentTotals);
            setLoading(false);
        }, (err: FirestoreError) => {
            console.error(`Error fetching ${collectionName} data:`, err);
            setError(`Failed to load data: ${err.message}`);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, collectionName, filters.start, filters.end]);

    return { paymentData, loading, error };
};

// --- Main Component ---
interface PaymentChartProps {
    isDataVisible: boolean;
    type: ReportType;
    filters: ChartFilters | null; // Accept filters as prop
}

export const PaymentChart: React.FC<PaymentChartProps> = ({ isDataVisible, type, filters }) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');
    
    // Pass the props to the hook. Default to null if filters is null.
    const { paymentData, loading, error } = usePaymentData(type, {
        start: filters?.start ?? null,
        end: filters?.end ?? null
    });

    const cardTitle = type === 'sales' ? 'Sales Payment Methods' : 'Purchase Payment Methods';

    const renderContent = () => {
        if (loading) return <Spinner />;
        if (error) return <p className="text-center text-red-500">{error}</p>;

        if (!isDataVisible) {
            return (
                <div className="flex flex-col items-center justify-center text-center text-gray-500 py-4">
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
            return <p className="text-center text-gray-500">No data found for this period.</p>;
        }

        const maxValue = Math.max(...dataToSort.map(([, stats]) => viewMode === 'amount' ? stats.totalAmount : stats.count), 1);

        return (
            <div className="space-y-4">
                {dataToSort.map(([method, stats]) => (
                    <div key={method}>
                        <div className="flex justify-between items-center text-sm mb-1">
                            <span className="font-medium text-gray-600">{method}</span>
                            {viewMode === 'amount' ? (
                                <span className="font-semibold text-gray-800">₹{stats.totalAmount.toLocaleString('en-IN')}</span>
                            ) : (
                                <span className="font-semibold text-gray-800">{stats.count}</span>
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
                <CardTitle>{cardTitle}</CardTitle>
                <div className="flex items-center p-1 bg-gray-100 rounded-lg">
                    <button onClick={() => setViewMode('amount')} className={`px-3 py-1 text-sm font-semibold rounded-md ${viewMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Amt</button>
                    <button onClick={() => setViewMode('quantity')} className={`px-3 py-1 text-sm font-semibold rounded-md ${viewMode === 'quantity' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>Qty</button>
                </div>
            </CardHeader>
            <CardContent>{renderContent()}</CardContent>
        </Card>
    );
};