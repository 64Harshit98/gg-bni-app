import React, { useState, useEffect, useMemo } from 'react';
// Import your Auth context hook
import { useAuth } from '../context/auth-context';
// Import the db instance from your central firebase config file
import { db } from '../lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import type { FirestoreError } from 'firebase/firestore';

// --- Mock UI Components (unchanged) ---
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

// --- Data Fetching Hook for Sales Data (unchanged) ---
const useSalesComparison = (userId: string | undefined) => {
  const [todaySales, setTodaySales] = useState(0);
  const [yesterdaySales, setYesterdaySales] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !userId) {
      setLoading(false);
      return;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(todayStart.getDate() - 1);

    const salesCollection = collection(db, 'sales');

    const baseQueryToday = [
      where('userId', '==', userId),
      where('createdAt', '>=', todayStart),
    ];
    const baseQueryYesterday = [
      where('userId', '==', userId),
      where('createdAt', '>=', yesterdayStart),
      where('createdAt', '<', todayStart),
    ];

    const fetchYesterdaySales = async () => {
      const q = query(salesCollection, ...baseQueryYesterday);
      try {
        const querySnapshot = await getDocs(q);
        let total = 0;
        querySnapshot.forEach((doc) => {
          total += doc.data().totalAmount || 0;
        });
        setYesterdaySales(total);
      } catch (err) {
        console.error("Error fetching yesterday's sales: ", err);
        throw new Error("Failed to fetch yesterday's sales.");
      }
    };

    const qToday = query(salesCollection, ...baseQueryToday);
    const unsubscribeToday = onSnapshot(
      qToday,
      (snapshot) => {
        let total = 0;
        snapshot.forEach((doc) => {
          total += doc.data().totalAmount || 0;
        });
        setTodaySales(total);
      },
      (snapshotError: FirestoreError) => {
        console.error("Error listening to today's sales: ", snapshotError);
        setError(`Failed to listen to today's sales: ${snapshotError.message}`);
      },
    );

    const runFetch = async () => {
      try {
        await fetchYesterdaySales();
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

    return () => unsubscribeToday();
  }, [userId]);

  return { todaySales, yesterdaySales, loading, error };
};

// FIX: Define props for the SalesCard component
interface SalesCardProps {
  isDataVisible: boolean;
}

// --- The Sales Card Component ---
// FIX: Update the component to accept the isDataVisible prop
export const SalesCard: React.FC<SalesCardProps> = ({ isDataVisible }) => {
  const { currentUser } = useAuth();
  const { todaySales, yesterdaySales, loading, error } = useSalesComparison(
    currentUser?.uid,
  );

  const percentageChange = useMemo(() => {
    if (loading || error) return 0;
    if (yesterdaySales === 0) {
      return todaySales > 0 ? 100 : 0;
    }
    return ((todaySales - yesterdaySales) / yesterdaySales) * 100;
  }, [todaySales, yesterdaySales, loading, error]);

  const isPositive = percentageChange >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today's Sales</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-gray-500">Loading...</div>
        ) : error ? (
          <div className="text-center text-red-500">{error}</div>
        ) : (
          <div className="text-center">
            <p className="text-4xl font-bold text-blue-600">
              {/* FIX: Conditionally render the sales total */}
              {isDataVisible ? `₹${todaySales.toLocaleString('en-IN')}` : '₹ ******'}
            </p>
            <p className="text-md text-gray-500 mt-2">
              <span
                className={`font-bold ${
                  // FIX: Use a neutral color when data is hidden
                  isDataVisible
                    ? isPositive ? 'text-green-600' : 'text-red-600'
                    : 'text-gray-500'
                  }`}
              >
                {/* FIX: Conditionally render the percentage change */}
                {isDataVisible ? `${percentageChange.toFixed(1)}%` : '**.*%'}
              </span>{' '}
              from yesterday
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}