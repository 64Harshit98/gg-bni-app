import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/Firebase';
import { useAuth } from '../context/auth-context';
import {
    collection,
    query,
    onSnapshot,
    Timestamp,
    where
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';
import { Spinner } from '../constants/Spinner';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
} from './ui/card';
import { useFilter } from './Filter'; // Import your filter context

// --- Interfaces ---
interface SaleDoc {
    totalAmount: number;
    createdAt: Timestamp;
    companyId?: string;
    status: string; // 'Upcoming', 'Confirmed', 'Completed', etc.
}

// --- Custom Hook to Fetch and Process Completed Sales Data ---
const useCompletedSalesData = (companyId: string | undefined) => {
    const { filters } = useFilter(); // Get date filters
    const [totalSalesAmount, setTotalSalesAmount] = useState(0);
    const [totalSalesCount, setTotalSalesCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Wait for all required data
        if (!companyId || !filters.startDate || !filters.endDate) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        // Set date range from filters
        const start = new Date(filters.startDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(filters.endDate);
        end.setHours(23, 59, 59, 999);

        // Query the 'Orders' collection for 'Completed' sales
        const salesQuery = query(
            collection(db, 'companies', companyId, 'Orders'), // Correct multi-tenant path
            where('status', '==', 'Completed'), // Filter for "Completed"
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<=', Timestamp.fromDate(end))
            // Note: This query will require a Firestore Index.
            // The console error will provide a link to create it.
        );

        const unsubscribe = onSnapshot(salesQuery, (snapshot) => {
            let amount = 0;
            let count = 0;

            snapshot.forEach((doc) => {
                const sale = doc.data() as SaleDoc;
                amount += sale.totalAmount || 0;
                count += 1;
            });

            setTotalSalesAmount(amount);
            setTotalSalesCount(count);
            setLoading(false);
        }, (err: FirestoreError) => {
            console.error("Error fetching completed sales:", err);
            setError(`Failed to load sales data: ${err.message}`);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [companyId, filters.startDate, filters.endDate]); // Re-run when filters change

    return { totalSalesAmount, totalSalesCount, loading, error };
};


// --- Main Card Component ---
interface CompletedSalesCardProps {
    isDataVisible: boolean;
}

export const CompletedSalesCard: React.FC<CompletedSalesCardProps> = ({ isDataVisible }) => {
    const { currentUser } = useAuth();
    const { totalSalesAmount, totalSalesCount, loading, error } = useCompletedSalesData(
        currentUser?.companyId,
    );

    const { filters } = useFilter(); // Get filters to display date range

    // Format the date range text
    const selectedPeriodText = useMemo(() => {
        if (!filters.startDate || !filters.endDate) {
            return 'for the selected period';
        }
        const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
        const startDate = new Date(filters.startDate).toLocaleDateString('en-IN', options);
        const endDate = new Date(filters.endDate).toLocaleDateString('en-IN', options);

        if (startDate === endDate) {
            return `for ${startDate}`;
        }
        return `from ${startDate} to ${endDate}`;
    }, [filters.startDate, filters.endDate]);

    return (
        <Card>
            <CardHeader className='-mb-4'>
                <CardTitle>Completed Sales</CardTitle>
                <CardDescription>
                    {selectedPeriodText}
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex h-20 items-center justify-center">
                        <Spinner />
                    </div>
                ) : error ? (
                    <div className="flex h-20 items-center justify-center text-center">
                        <p className="text-red-500 text-sm">{error}</p>
                    </div>
                ) : (
                    <div className="text-center">
                        <p className="text-4xl font-bold text-green-600">
                            {isDataVisible ? `₹${totalSalesAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '₹ ******'}
                        </p>
                        <p className="text-md text-gray-500 mt-2">
                            from {isDataVisible ? <strong>{totalSalesCount}</strong> : '**'} completed orders
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};