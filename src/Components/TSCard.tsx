import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';

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
interface SaleDoc {
  userId: string;
}
interface TopSalesperson {
  name: string;
  billCount: number;
}

// --- Custom Hook to Fetch and Process Top Salesperson ---
const useTopSalesperson = () => {
  const [topSalesperson, setTopSalesperson] = useState<TopSalesperson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const salesQuery = query(collection(db, 'sales'));

    const unsubscribe = onSnapshot(
      salesQuery,
      async (snapshot) => {
        if (snapshot.empty) {
          setTopSalesperson(null);
          setLoading(false);
          return;
        }

        const billCounts = new Map<string, number>();
        snapshot.docs.forEach((doc) => {
          const sale = doc.data() as SaleDoc;
          if (sale.userId) {
            const currentCount = billCounts.get(sale.userId) || 0;
            billCounts.set(sale.userId, currentCount + 1);
          }
        });

        if (billCounts.size === 0) {
          setTopSalesperson(null);
          setLoading(false);
          return;
        }

        const topUserEntry = [...billCounts.entries()].reduce((a, b) =>
          b[1] > a[1] ? b : a,
        );
        const [topUserId, billCount] = topUserEntry;

        try {
          const userDocRef = doc(db, 'users', topUserId);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setTopSalesperson({
              name: userData.name || userData.displayName || 'Unknown User',
              billCount: billCount,
            });
          } else {
            setTopSalesperson({
              name: 'Unknown User',
              billCount: billCount,
            });
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
          setError("Failed to fetch top salesperson's name.");
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.error('Error fetching sales for top salesperson:', err);
        setError('Failed to load sales data.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  return { topSalesperson, loading, error };
};

// --- Mock Card Components ---
const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`bg-white rounded-xl shadow-md ${className}`}>{children}</div>
);
const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`p-6 border-b border-gray-200 ${className}`}>{children}</div>
);
const CardTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <h3 className={`text-lg font-semibold text-gray-800 ${className}`}>{children}</h3>
);
const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`p-6 ${className}`}>{children}</div>
);

// FIX: Define props for the component
interface TopSalespersonCardProps {
  isDataVisible: boolean;
}

// --- Main Top Salesperson Card Component ---
export const TopSalespersonCard: React.FC<TopSalespersonCardProps> = ({ isDataVisible }) => {
  const { topSalesperson, loading, error } = useTopSalesperson();

  const renderContent = () => {
    if (loading) {
      return <Spinner />;
    }
    if (error) {
      return <p className="text-center text-red-500">{error}</p>;
    }

    // FIX: Check if data should be hidden
    if (!isDataVisible) {
      return (
        <div className="flex flex-col items-center justify-center text-center text-gray-500 py-8">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
          Data is hidden
        </div>
      );
    }

    if (!topSalesperson) {
      return (
        <p className="text-center text-gray-500">No sales data available.</p>
      );
    }

    return (
      <div className="text-center">
        <p className="text-4xl font-bold text-blue-600 truncate">
          {topSalesperson.name}
        </p>
        <p className="text-md text-gray-500 mt-2">
          with{' '}
          <span className="font-bold text-gray-700">
            {topSalesperson.billCount}
          </span>{' '}
          sales
        </p>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Salesperson</CardTitle>
      </CardHeader>
      <CardContent>{renderContent()}</CardContent>
    </Card>
  );
};