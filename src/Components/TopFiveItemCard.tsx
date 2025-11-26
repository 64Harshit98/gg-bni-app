import React, { useState, useEffect, } from 'react';
import { db } from '../lib/Firebase';
import { useAuth } from '../context/auth-context';
import {
  collection,
  query,
  onSnapshot,
  where,
  Timestamp,
  orderBy // Added orderBy just in case, though your original didn't have it
} from 'firebase/firestore';
import { Spinner } from '../constants/Spinner';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { useFilter } from './Filter';

// --- Interfaces ---
interface SalesItem {
  id: string;
  name: string;
  quantity: number;
  finalPrice: number;
}
interface SaleDoc {
  items: SalesItem[];
  createdAt: Timestamp;
  companyId: string;
}
interface TopItem {
  name: string;
  quantitySold: number;
  unitPrice: number; // Storing the individual price
}

// --- Custom Hook to Fetch and Process Top Items ---
const useTopItems = () => {
  const { currentUser } = useAuth();
  const { filters } = useFilter();

  const [topItemsByQuantity, setTopItemsByQuantity] = useState<TopItem[]>([]);
  const [topItemsByPrice, setTopItemsByPrice] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser?.companyId || !filters.startDate || !filters.endDate) {
      setLoading(!currentUser);
      return;
    }

    setLoading(true);
    setError(null); // Reset error on new fetch
    const start = new Date(filters.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);

    // --- FIX: Use the correct multi-tenant path ---
    const salesQuery = query(
      collection(db, 'companies', currentUser.companyId, 'sales'),
      // --- FIX: No longer need the companyId filter ---
      where('createdAt', '>=', start),
      where('createdAt', '<=', end),
      orderBy('createdAt', 'asc') // Added for query consistency
    );

    const unsubscribe = onSnapshot(salesQuery, (snapshot) => {
      const stats = new Map<string, { name: string; quantitySold: number; unitPrice: number }>();

      snapshot.docs.forEach((doc) => {
        const sale = doc.data() as SaleDoc;
        sale.items?.forEach((item) => {
          // Ensure item is valid before processing
          if (!item || !item.id || !item.name) return;

          const currentStats = stats.get(item.id) || { name: item.name, quantitySold: 0, unitPrice: 0 };
          const itemUnitPrice = (item.finalPrice / item.quantity) || 0;

          stats.set(item.id, {
            name: item.name,
            quantitySold: currentStats.quantitySold + (item.quantity || 0),
            // Store the highest price this item was sold for
            unitPrice: Math.max(currentStats.unitPrice, itemUnitPrice),
          });
        });
      });

      const allItems = Array.from(stats.values());

      // Sort by Quantity
      const sortedByQuantity = [...allItems].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 5);
      setTopItemsByQuantity(sortedByQuantity);

      // Sort by Individual Price
      const sortedByPrice = [...allItems].sort((a, b) => b.unitPrice - a.unitPrice).slice(0, 5);
      setTopItemsByPrice(sortedByPrice);

      setLoading(false);
      setError(null);
    }, (err) => {
      console.error("Error fetching top items:", err);
      setError("Failed to load top items.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser, filters]); // Using currentUser ensures it re-runs when auth is ready

  return { topItemsByQuantity, topItemsByPrice, loading, error };
};


// --- Main Card Component ---
interface TopSoldItemsCardProps {
  isDataVisible: boolean;
}

export const TopSoldItemsCard: React.FC<TopSoldItemsCardProps> = ({ isDataVisible }) => {
  const [viewMode, setViewMode] = useState<'quantity' | 'price'>('price');
  const { topItemsByQuantity, topItemsByPrice, loading, error } = useTopItems();

  const renderContent = () => {
    if (loading) return <Spinner />;
    if (error) return <p className="text-center text-red-500">{error}</p>;
    if (!isDataVisible) {
      return (
        <div className="flex flex-col items-center justify-center text-center text-gray-500 py-8">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
          Data is hidden
        </div>
      );
    }

    const itemsToDisplay = viewMode === 'quantity' ? topItemsByQuantity : topItemsByPrice;

    if (itemsToDisplay.length === 0) {
      return <p className="text-center text-gray-500 py-8">No items sold in this period.</p>;
    }

    return (
      <ul className="space-y-4">
        {itemsToDisplay.map((item, index) => (
          <li key={item.name + index} className="flex items-center">
            <div className="flex items-center w-4/5">
              <span className={`text-sm font-bold rounded-full h-6 w-6 flex items-center justify-center mr-3 flex-shrink-0 ${viewMode === 'quantity' ? 'text-blue-600 bg-blue-100' : 'text-blue-600 bg-blue-100'}`}>{index + 1}</span>
              <span className="font-medium text-gray-700 truncate">{item.name.slice(0, 18)}</span>
            </div>
            <div className="w-1/5 text-right">
              {viewMode === 'quantity' ? (
                <>
                  <span className="font-semibold text-gray-800">{item.quantitySold}</span>
                  <span className="text-xs text-gray-500 ml-1">sold</span>
                </>
              ) : (
                <span className="font-semibold text-gray-800">
                  {item.unitPrice.toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 })}
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
        <CardTitle>Top 5 Items</CardTitle>
        <div className="flex items-center p-1 bg-gray-100 rounded-lg">
          <button
            onClick={() => setViewMode('price')}
            className={`px-3 py-1 text-sm font-semibold rounded-md transition-colors ${viewMode === 'price' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}
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