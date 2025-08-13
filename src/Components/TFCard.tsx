import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';

// --- Reusable Spinner Component ---
const Spinner: React.FC = () => (
  <div className="flex justify-center items-center p-4">
    <svg
      className="animate-spin h-6 w-6 text-blue-600"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  </div>
);

// --- Data Types ---
interface SalesItem {
  id: string;
  name: string;
  quantity: number;
}

interface SaleDoc {
  items: SalesItem[];
  userId: string;
  createdAt: Timestamp;
}

interface AggregatedItem {
  name: string;
  totalQuantity: number;
}

// --- Custom Hook to Fetch and Process Top Sold Items ---
const useTopSoldItems = (userId?: string) => {
  const [topItems, setTopItems] = useState<AggregatedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const salesQuery = query(
      collection(db, 'sales'),
      where('userId', '==', userId),
    );

    const unsubscribe = onSnapshot(
      salesQuery,
      (snapshot) => {
        const itemMap = new Map<string, number>();

        // Aggregate quantities for each item across all sales documents
        snapshot.docs.forEach((doc) => {
          const sale = doc.data() as SaleDoc;
          if (sale.items && Array.isArray(sale.items)) {
            sale.items.forEach((item) => {
              const currentQuantity = itemMap.get(item.name) || 0;
              itemMap.set(item.name, currentQuantity + item.quantity);
            });
          }
        });

        // Convert map to array, sort by quantity, and take the top 5
        const aggregatedList: AggregatedItem[] = Array.from(
          itemMap.entries(),
        ).map(([name, totalQuantity]) => ({
          name,
          totalQuantity,
        }));

        aggregatedList.sort((a, b) => b.totalQuantity - a.totalQuantity);

        setTopItems(aggregatedList.slice(0, 5));
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching sales for top items:', err);
        setError('Failed to load top sold items.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [userId]);

  return { topItems, loading, error };
};

// --- Mock Card Components for self-contained example ---
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={`bg-white rounded-xl shadow-md ${className}`}>{children}</div>
);
const CardHeader: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={`p-6 border-b border-gray-200 ${className}`}>{children}</div>
);
const CardTitle: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <h3 className={`text-lg font-semibold text-gray-800 ${className}`}>
    {children}
  </h3>
);
const CardContent: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

// --- Main Top Sold Items Card Component ---
export const TopSoldItemsCard: React.FC = () => {
  const { currentUser, loading: authLoading } = useAuth();
  const {
    topItems,
    loading: dataLoading,
    error,
  } = useTopSoldItems(currentUser?.uid);

  const renderContent = () => {
    if (authLoading || dataLoading) {
      return <Spinner />;
    }
    if (error) {
      return <p className="text-center text-red-500">{error}</p>;
    }
    if (topItems.length === 0) {
      return (
        <p className="text-center text-gray-500">
          No sales data available to determine top items.
        </p>
      );
    }
    return (
      <ul className="space-y-4">
        {topItems.map((item, index) => (
          <li key={item.name} className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-sm font-bold text-blue-600 bg-blue-100 rounded-full h-6 w-6 flex items-center justify-center mr-3">
                {index + 1}
              </span>
              <span className="font-medium text-gray-700">{item.name}</span>
            </div>
            <span className="font-semibold text-gray-800">
              {item.totalQuantity}{' '}
              <span className="text-sm font-normal text-gray-500">sold</span>
            </span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 5 Sold Items</CardTitle>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </Card>
  );
};
export default TopSoldItemsCard;
