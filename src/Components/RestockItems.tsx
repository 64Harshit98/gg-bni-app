import React, { useState, useEffect } from 'react';
import { db } from '../lib/Firebase';
import { useAuth } from '../context/auth-context';
import {
    collection,
    query,
    onSnapshot
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore'; // Good practice to type errors
import { Spinner } from '../constants/Spinner';
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from './ui/card';

// --- Data Types ---
interface ItemDoc {
    id: string;
    name: string;
    amount: number;         // The current stock quantity
    restockQuantity: number; // The alert threshold
    companyId: string;
}

/**
 * Custom hook to fetch items that need restocking for a specific company.
 * An item needs restocking if its current amount is less than or equal to its restock quantity.
 * @param companyId The ID of the company to fetch item data for.
 */
const useRestockAlerts = (companyId?: string) => {
    const [itemsToRestock, setItemsToRestock] = useState<ItemDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!companyId) {
            setLoading(false);
            setItemsToRestock([]);
            return;
        }
        setLoading(true);
        setError(null);

        // --- FIX: Use the correct multi-tenant path ---
        const itemsQuery = query(
            collection(db, 'companies', companyId, 'items')
            // --- FIX: The 'where' clause for companyId is no longer needed ---
        );

        const unsubscribe = onSnapshot(itemsQuery, (snapshot) => {
            const allItems: ItemDoc[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ItemDoc));

            // Filter for items that need restocking (this client-side filter is correct)
            const filteredItems = allItems.filter(item =>
                item.restockQuantity > 0 && item.amount <= item.restockQuantity
            );

            // Sort by urgency (how far below the threshold the item is)
            filteredItems.sort((a, b) => (a.amount - a.restockQuantity) - (b.amount - b.restockQuantity));

            setItemsToRestock(filteredItems);
            setLoading(false);
        }, (err: FirestoreError) => { // Use typed error
            console.error('Error fetching items for restock alerts:', err);
            setError(`Failed to load restock alerts: ${err.message}`);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [companyId]);

    return { itemsToRestock, loading, error };
};


export const RestockAlertsCard: React.FC = ({ }) => {
    const { currentUser } = useAuth();
    const { itemsToRestock, loading, error } = useRestockAlerts(currentUser?.companyId);

    const renderContent = () => {
        if (loading) return <Spinner />;
        if (error) return <p className="text-center text-red-500">{error}</p>;


        if (itemsToRestock.length === 0) {
            return <p className="text-center text-gray-500">All items are well-stocked! 👍</p>;
        }

        return (
            <ul className="space-y-4">
                {itemsToRestock.map((item) => {
                    const isOutOfStock = item.amount <= 0;
                    return (
                        <li key={item.id} className="flex items-center justify-between">
                            <div className="flex items-center">
                                <span className="font-medium text-gray-700">{item.name.slice(0, 15)}</span>
                            </div>
                            <div className="text-center flex grid grid-cols-2 gap-15">
                                <span className={` text-xs font-semibold ${isOutOfStock ? 'text-red-600' : 'text-gray-800'}`}>
                                    {item.amount}
                                </span>
                                <span className="text-xs text-gray-500 block">
                                    {item.restockQuantity}
                                </span>
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between ">
                <CardTitle className="font-bold pr-10 " >Restock Alerts</CardTitle>
                <CardTitle className="text-xs font-semibold text-black-500">Stock</CardTitle>
                <CardTitle className="text-xs font-semibold text-gray-500">Restock</CardTitle>

            </CardHeader>
            <CardContent>{renderContent()}</CardContent>
        </Card>
    );
};