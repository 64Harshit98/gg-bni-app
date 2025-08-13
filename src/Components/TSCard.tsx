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
  // ... other sale properties
}

interface TopSalesperson {
  name: string;
  billCount: number;
}

// --- Custom Hook to Fetch and Process Top Salesperson ---
const useTopSalesperson = () => {
  const [topSalesperson, setTopSalesperson] = useState<TopSalesperson | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // This query fetches ALL sales, not just for the current user
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

        // Aggregate bill counts for each user
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

        // Find the user with the most bills
        const topUserEntry = [...billCounts.entries()].reduce((a, b) =>
          b[1] > a[1] ? b : a,
        );
        const [topUserId, billCount] = topUserEntry;

        try {
          // Fetch the top user's profile to get their name
          const userDocRef = doc(db, 'users', topUserId);
          const userDocSnap = await getDoc(userDocRef);

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setTopSalesperson({
              name: userData.name || userData.displayName || 'Unknown User',
              billCount: billCount,
            });
          } else {
            // Handle case where user profile might not exist
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
  }, []); // Empty dependency array to run only once

  return { topSalesperson, loading, error };
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

// --- Main Top Salesperson Card Component ---
export const TopSalespersonCard: React.FC = () => {
  const { topSalesperson, loading, error } = useTopSalesperson();

  const renderContent = () => {
    if (loading) {
      return <Spinner />;
    }
    if (error) {
      return <p className="text-center text-red-500">{error}</p>;
    }
    if (!topSalesperson) {
      return (
        <p className="text-center text-gray-500">No sales data available.</p>
      );
    }
    return (
      <div className="text-center">
        <p className="text-4xl font-bold text-blue-600">
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
