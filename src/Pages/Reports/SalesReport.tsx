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
interface SalesItem {
  name: string;
  mrp: number;
  quantity: number;
}

// This defines the structure of the payment breakdown object
interface PaymentMethods {
  [key: string]: number; // e.g., { cash: 100, upi: 50 }
}

interface SaleRecord {
  id: string;
  partyName: string;
  totalAmount: number;
  paymentMethods: PaymentMethods; // FIX: Changed from paymentMethod
  createdAt: number;
  items: SalesItem[];
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

// FIX: New function to format the payment methods object into a string
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

// --- Main Sales Report Component ---
const SalesReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // Fetch sales data from Firestore
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      setIsLoading(false);
      setError('You must be logged in to view sales reports.');
      return;
    }

    const fetchSales = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const salesCollection = collection(db, 'sales');
        const q = query(
          salesCollection,
          where('userId', '==', currentUser.uid),
        );
        const querySnapshot = await getDocs(q);
        const fetchedSales: SaleRecord[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          fetchedSales.push({
            id: doc.id,
            partyName: data.partyName || 'N/A',
            totalAmount: data.totalAmount || 0,
            paymentMethods: data.paymentMethods || {}, // FIX: Read paymentMethods object
            createdAt:
              data.createdAt instanceof Timestamp
                ? data.createdAt.toMillis()
                : Date.now(),
            items: data.items || [],
          });
        });
        fetchedSales.sort((a, b) => b.createdAt - a.createdAt);
        setSales(fetchedSales);
      } catch (err) {
        console.error('Failed to fetch sales data:', err);
        setError('Failed to load sales report. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSales();
  }, [currentUser, authLoading]);

  // Memoized filtered sales and summary
  const { filteredSales } = useMemo(() => {
    let newFilteredSales = sales;

    if (searchQuery) {
      newFilteredSales = newFilteredSales.filter((sale) =>
        sale.partyName.toLowerCase().includes(searchQuery.toLowerCase()),
      );
    }

    if (startDate || endDate) {
      const startTimestamp = startDate
        ? new Date(startDate).setHours(0, 0, 0, 0)
        : 0;
      const endTimestamp = endDate
        ? new Date(endDate).setHours(23, 59, 59, 999)
        : Infinity;
      newFilteredSales = newFilteredSales.filter((sale) => {
        const saleCreatedAt = sale.createdAt;
        return saleCreatedAt >= startTimestamp && saleCreatedAt <= endTimestamp;
      });
    }

    return { filteredSales: newFilteredSales };
  }, [searchQuery, startDate, endDate, sales]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 text-gray-500">
        <p>Loading sales report...</p>
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
            Sales Report
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
                  placeholder="e.g., John Doe"
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
                {filteredSales.length > 0 ? (
                  filteredSales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800">
                        {sale.id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {sale.partyName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        ₹{sale.totalAmount.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">
                        {/* FIX: Use the new formatting function */}
                        {formatPaymentMethods(sale.paymentMethods)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(sale.createdAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-4 text-center text-sm text-gray-500"
                    >
                      No sales found matching the current filters.
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

export default SalesReport;
