import React, { useState, useEffect } from 'react';
import { db } from '../lib/Firebase';
import { useAuth } from '../context/auth-context';
import {
    collection,
    query,
    onSnapshot,
    Timestamp,
    where,
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';
import { Spinner } from '../constants/Spinner';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from './ui/card';
import { useFilter } from './Filter'; // Import your filter context

// --- Interfaces ---
interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    mrp: number;
}
interface OrderDoc {
    items: OrderItem[];
    createdAt: Timestamp;
    status: string; // 'Upcoming', 'Confirmed', 'Completed', etc.
}
interface TopItem {
    id: string;
    name: string;
    totalQuantity: number;
    totalAmount: number;
}

// --- Custom Hook to Fetch and Process Top Sold Items from Orders ---
const useTopSoldItemsFromOrders = (companyId: string | undefined) => {
    const { filters } = useFilter(); // Get date filters
    const [topByQuantity, setTopByQuantity] = useState<TopItem[]>([]);
    const [topByAmount, setTopByAmount] = useState<TopItem[]>([]);
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

        const ordersQuery = query(
            collection(db, 'companies', companyId, 'Orders'),
            where('status', '==', 'Completed'), // <-- Only "Completed" orders
            where('createdAt', '>=', Timestamp.fromDate(start)),
            where('createdAt', '<=', Timestamp.fromDate(end))
            // Note: This query will require a Firestore Index.
            // The console error will provide a link to create it.
        );

        const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
            // A Map to aggregate data: { "itemId": { name, totalQuantity, totalAmount } }
            const stats = new Map<string, { name: string; totalQuantity: number; totalAmount: number }>();

            snapshot.docs.forEach((doc) => {
                const order = doc.data() as OrderDoc;
                order.items?.forEach((item) => {
                    if (!item.id || !item.name) return; // Skip invalid items

                    const currentStats = stats.get(item.id) || { name: item.name, totalQuantity: 0, totalAmount: 0 };
                    const itemTotalAmount = (item.mrp || 0) * (item.quantity || 0);

                    stats.set(item.id, {
                        name: item.name,
                        totalQuantity: currentStats.totalQuantity + (item.quantity || 0),
                        totalAmount: currentStats.totalAmount + itemTotalAmount,
                    });
                });
            });

            const allItems: TopItem[] = Array.from(stats.entries()).map(([id, data]) => ({
                id,
                ...data
            }));

            // Sort by Quantity
            const sortedByQuantity = [...allItems].sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 5);
            setTopByQuantity(sortedByQuantity);

            // Sort by Amount
            const sortedByAmount = [...allItems].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5);
            setTopByAmount(sortedByAmount);

            setLoading(false);
            setError(null);
        }, (err: FirestoreError) => {
            console.error("Error fetching top items from orders:", err);
            setError("Failed to load top items. (Check console for index link)");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [companyId, filters.startDate, filters.endDate]);

    return { topByQuantity, topByAmount, loading, error };
};


// --- Main Card Component ---
interface TopSoldItemsCardProps {
    isDataVisible: boolean;
}

export const TopSoldItemsCard: React.FC<TopSoldItemsCardProps> = ({ isDataVisible }) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('quantity'); // Default to Qty
    const { topByQuantity, topByAmount, loading, error } = useTopSoldItemsFromOrders(
        useAuth().currentUser?.companyId
    );

    const renderContent = () => {
        if (loading) {
            return <div className="flex h-40 items-center justify-center"><Spinner /></div>;
        }
        if (error) {
            return <div className="flex h-40 items-center justify-center text-center"><p className="text-red-500 text-sm">{error}</p></div>;
        }
        if (!isDataVisible) {
            return (
                <div className="flex flex-col items-center justify-center text-center text-gray-500 py-8 h-40">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                    Data is hidden
                </div>
            );
        }

        const itemsToDisplay = viewMode === 'quantity' ? topByQuantity : topByAmount;

        if (itemsToDisplay.length === 0) {
            return <p className="text-center text-gray-500 py-8 h-40">No items sold in this period.</p>;
        }

        return (
            <ul className="space-y-4">
                {itemsToDisplay.map((item, index) => (
                    <li key={item.id} className="flex items-center">
                        <div className="flex items-center w-3/5">
                            <span className={`text-sm font-bold rounded-full h-6 w-6 flex items-center justify-center mr-3 flex-shrink-0 text-blue-600 bg-blue-100`}>
                                {index + 1}
                            </span>
                            <span className="font-medium text-gray-700 truncate" title={item.name}>{item.name.slice(0, 18)}</span>
                        </div>
                        <div className="w-2/5 text-right">
                            {viewMode === 'quantity' ? (
                                <>
                                    <span className="font-semibold text-gray-800">{item.totalQuantity}</span>
                                    <span className="text-xs text-gray-500 ml-1">sold</span>
                                </>
                            ) : (
                                <span className="font-semibold text-gray-800">
                                    {item.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}
                                </span>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        );
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Top 5 Items Sold</CardTitle>
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