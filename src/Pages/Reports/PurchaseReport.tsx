import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import {
  collection,
  query,
  getDocs,
  where,
  Timestamp,
} from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';

// --- Data Types ---
interface PurchaseItem {
  name: string;
  purchasePrice: number;
  quantity: number;
}

interface PaymentMethods {
  [key: string]: number;
}

interface PurchaseRecord {
  id: string;
  partyName: string;
  totalAmount: number;
  paymentMethods: PaymentMethods;
  createdAt: number;
  items: PurchaseItem[];
}

// --- Helper Functions ---
const formatDate = (timestamp: number): string => {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatPaymentMethods = (methods: PaymentMethods): string => {
  if (!methods || Object.keys(methods).length === 0) {
    return 'N/A';
  }
  return Object.entries(methods)
    .map(
      ([mode, amount]) =>
        `${mode.charAt(0).toUpperCase() + mode.slice(1)}: ₹${amount.toFixed(2)}`,
    )
    .join(', ');
};

// --- Main Purchase Report Component ---
const PurchaseReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Fetch purchase data from Firestore
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      setIsLoading(false);
      setError('You must be logged in to view purchase reports.');
      return;
    }

    const fetchPurchases = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const purchasesCollection = collection(db, 'purchases');
        const q = query(
          purchasesCollection,
          where('userId', '==', currentUser.uid),
        );
        const querySnapshot = await getDocs(q);
        const fetchedPurchases: PurchaseRecord[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          fetchedPurchases.push({
            id: doc.id,
            partyName: data.partyName || 'N/A',
            totalAmount: data.totalAmount || 0,
            paymentMethods: data.paymentMethods || {},
            createdAt:
              data.createdAt instanceof Timestamp
                ? data.createdAt.toMillis()
                : Date.now(),
            items: data.items || [],
          });
        });
        fetchedPurchases.sort((a, b) => b.createdAt - a.createdAt);
        setPurchases(fetchedPurchases);
      } catch (err) {
        console.error('Failed to fetch purchase data:', err);
        setError('Failed to load purchase report. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPurchases();
  }, [currentUser, authLoading]);

  // Memoized filtered purchases and summary
  const { filteredPurchases, summary } = useMemo(() => {
    let newFilteredPurchases = purchases;

    if (searchQuery) {
      newFilteredPurchases = newFilteredPurchases.filter((purchase) =>
        purchase.partyName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    if (startDate || endDate) {
      const startTimestamp = startDate
        ? new Date(startDate).setHours(0, 0, 0, 0)
        : 0;
      const endTimestamp = endDate
        ? new Date(endDate).setHours(23, 59, 59, 999)
        : Infinity;
      newFilteredPurchases = newFilteredPurchases.filter((purchase) => {
        const purchaseCreatedAt = purchase.createdAt;
        return (
          purchaseCreatedAt >= startTimestamp &&
          purchaseCreatedAt <= endTimestamp
        );
      });
    }

    const totalCost = newFilteredPurchases.reduce(
      (sum, purchase) => sum + purchase.totalAmount,
      0,
    );
    const totalOrders = newFilteredPurchases.length;

    return {
      filteredPurchases: newFilteredPurchases,
      summary: { totalCost, totalOrders },
    };
  }, [searchQuery, startDate, endDate, purchases]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 text-gray-500">
        <p>Loading purchase report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 text-red-500">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
            Purchase Report
          </h1>
          <button
            onClick={() => navigate(-1)}
            className="rounded-full bg-gray-200 p-2 text-gray-700 transition hover:bg-gray-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-sm font-medium text-gray-500">
              Total Cost (Filtered)
            </h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              ₹{summary.totalCost.toLocaleString('en-IN')}
            </p>
          </div>
          <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-sm font-medium text-gray-500">
              Total Orders (Filtered)
            </h3>
            <p className="text-3xl font-bold text-gray-900 mt-2">
              {summary.totalOrders}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-md">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-700 mb-4">
              Filters
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label
                  htmlFor="searchQuery"
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  Party Name
                </label>
                <input
                  type="text"
                  id="searchQuery"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g., Supplier Inc."
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="startDate"
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  From Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor="endDate"
                  className="block text-sm font-medium text-gray-600 mb-1"
                >
                  To Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <button
                  onClick={handleClearFilters}
                  className="w-full bg-gray-600 text-white rounded-md py-2 px-4 shadow-sm hover:bg-gray-700 transition"
                >
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Invoice ID
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Party Name
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Total Amount
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Payment Method
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPurchases.length > 0 ? (
                  filteredPurchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">
                        {purchase.id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {purchase.partyName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        ₹{purchase.totalAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">
                        {formatPaymentMethods(purchase.paymentMethods)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(purchase.createdAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-4 text-center text-sm text-gray-500"
                    >
                      No purchases found matching the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseReport;
