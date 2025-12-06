import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/auth-context';
import { db } from '../lib/Firebase';
import {
    collection,
    query,
    onSnapshot,
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
export type EntityType = 'sales' | 'purchases';

interface TransactionDoc {
    partyName: string;
    totalAmount: number;
    createdAt: any;
}

interface EntityStats {
    name: string;
    amount: number;
    quantity: number; // This now represents "Count of Bills"
}

interface ChartFilters {
    start: Date | number | string | null;
    end: Date | number | string | null;
}

// --- Helper: Rank Circle ---
const RankCircle: React.FC<{ rank: number }> = ({ rank }) => (
    <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full font-bold text-sm mr-4">
        {rank}
    </div>
);

// --- Custom Hook ---
const useTopEntities = (
    collectionName: EntityType,
    filters: ChartFilters
) => {
    const { currentUser } = useAuth();
    const [entities, setEntities] = useState<EntityStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!currentUser?.companyId || !filters.start || !filters.end) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        const start = new Date(filters.start);
        const end = new Date(filters.end);

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        const q = query(
            collection(db, 'companies', currentUser.companyId, collectionName),
            where('createdAt', '>=', start),
            where('createdAt', '<=', end),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const aggMap = snapshot.docs.reduce((acc, doc) => {
                const data = doc.data() as TransactionDoc;
                const name = data.partyName || 'N/A';
                const amount = data.totalAmount || 0;

                if (!acc[name]) {
                    acc[name] = { name, amount: 0, quantity: 0 };
                }

                acc[name].amount += amount;

                // --- CHANGED LOGIC HERE ---
                // Instead of summing items, we just add 1 for "1 Bill"
                acc[name].quantity += 1;

                return acc;
            }, {} as { [key: string]: EntityStats });

            setEntities(Object.values(aggMap));
            setLoading(false);
        }, (err: FirestoreError) => {
            console.error(`Error fetching ${collectionName} top list:`, err);
            setError(`Failed to load data: ${err.message}`);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, collectionName, filters.start, filters.end]);

    return { entities, loading, error };
};

// --- Main Component ---
interface TopEntitiesListProps {
    isDataVisible: boolean;
    type: EntityType;
    filters: ChartFilters | null;
    titleOverride?: string;
}

export const TopEntitiesList: React.FC<TopEntitiesListProps> = ({ isDataVisible, type, filters, titleOverride }) => {
    const [viewMode, setViewMode] = useState<'amount' | 'quantity'>('amount');

    const { entities, loading, error } = useTopEntities(type, {
        start: filters?.start ?? null,
        end: filters?.end ?? null
    });

    const defaultTitle = type === 'sales' ? 'Top 5 Customers' : 'Top 5 Suppliers';
    const title = titleOverride || defaultTitle;

    const top5 = useMemo(() => {
        const sorted = [...entities].sort((a, b) => {
            if (viewMode === 'amount') {
                return b.amount - a.amount;
            }
            return b.quantity - a.quantity;
        });
        return sorted.slice(0, 5);
    }, [entities, viewMode]);

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

        if (top5.length === 0) {
            return <p className="text-center text-gray-500">No data found for this period.</p>;
        }

        return (
            <div className="space-y-4">
                {top5.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center">
                            <RankCircle rank={index + 1} />
                            <p className="font-medium text-gray-700">{item.name}</p>
                        </div>
                        <div className="text-right font-semibold text-gray-800">
                            {viewMode === 'amount'
                                ? `₹${item.amount.toLocaleString('en-IN')}`
                                // Changed label to 'Bills'
                                : `${item.quantity.toLocaleString('en-IN')} Bills`
                            }
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{title}</CardTitle>
                <div className="flex items-center p-1 bg-gray-100 rounded-lg">
                    <button
                        onClick={() => setViewMode('amount')}
                        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'amount' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                            }`}
                    >
                        Amt
                    </button>
                    <button
                        onClick={() => setViewMode('quantity')}
                        className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'quantity' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'
                            }`}
                    >
                        Qty
                    </button>
                </div>
            </CardHeader>
            <CardContent>
                {renderContent()}
            </CardContent>
        </Card>
    );
};