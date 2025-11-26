import React, { useState, useEffect, useMemo } from 'react';
// Import your Auth context hook
import { useAuth } from '../context/auth-context';
// Import the db instance from your central firebase config file
import { db } from '../lib/Firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';

// --- Mock UI Components (for a self-contained example) ---
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
// --- End of Mock UI Components ---

// --- Data Fetching Hook for Purchase Data ---
const usePurchaseComparison = (userId: string | undefined) => {
  const [todayPurchase, setTodayPurchase] = useState(0);
  const [yesterdayPurchase, setYesterdayPurchase] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Don't fetch if there's no user ID
    if (!userId) {
      setLoading(false);
      return;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);

    const purchaseCollection = collection(db, 'purchases');

    // Define query conditions
    const queryToday = [
      where('userId', '==', userId),
      where('createdAt', '>=', todayStart),
    ];
    const queryYesterday = [
      where('userId', '==', userId),
      where('createdAt', '>=', yesterdayStart),
      where('createdAt', '<', todayStart),
    ];

    // Fetch yesterday's purchases once
    const fetchYesterdayPurchase = async () => {
      const q = query(purchaseCollection, ...queryYesterday);
      try {
        const querySnapshot = await getDocs(q);
        let total = 0;
        querySnapshot.forEach((doc) => {
          total += doc.data().totalAmount || 0;
        });
        setYesterdayPurchase(total);
      } catch (err) {
        console.error("Error fetching yesterday's purchases: ", err);
        throw new Error("Failed to fetch yesterday's purchases.");
      }
    };

    // Set up a real-time listener for today's purchases
    const qToday = query(purchaseCollection, ...queryToday);
    const unsubscribeToday = onSnapshot(
      qToday,
      (snapshot) => {
        let total = 0;
        snapshot.forEach((doc) => {
          total += doc.data().totalAmount || 0;
        });
        setTodayPurchase(total);
      },
      (snapshotError: FirestoreError) => {
        console.error("Error listening to today's purchases: ", snapshotError);
        setError(
          `Failed to listen to today's purchases: ${snapshotError.message}`,
        );
      },
    );

    // Run the initial fetch and manage loading state
    const runFetch = async () => {
      try {
        await fetchYesterdayPurchase();
      } catch (e: unknown) {
        if (e instanceof Error) {
          setError(e.message);
        } else {
          setError('An unknown error occurred');
        }
      } finally {
        setLoading(false);
      }
    };

    runFetch();

    // Cleanup the listener when the component unmounts
    return () => unsubscribeToday();
  }, [userId]);

  return { todayPurchase, yesterdayPurchase, loading, error };
};

// --- The Purchase Card Component ---
export function PurchaseCard() {
  const { currentUser } = useAuth();
  const { todayPurchase, yesterdayPurchase, loading, error } =
    usePurchaseComparison(currentUser?.uid);

  const percentageChange = useMemo(() => {
    if (loading || error) return 0;
    if (yesterdayPurchase === 0) {
      return todayPurchase > 0 ? 100 : 0;
    }
    return ((todayPurchase - yesterdayPurchase) / yesterdayPurchase) * 100;
  }, [todayPurchase, yesterdayPurchase, loading, error]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Purchase</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-gray-500">Loading...</div>
        ) : error ? (
          <div className="text-center text-red-500">{error}</div>
        ) : (
          <div className="text-center">
            <p className="text-4xl font-bold text-blue-600">
              ₹{todayPurchase.toLocaleString('en-IN')}
            </p>
            <p className="text-md text-gray-500 mt-2">
              <span
                className={`font-bold ${percentageChange >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {percentageChange.toFixed(1)}%
              </span>{' '}
              from yesterday
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
