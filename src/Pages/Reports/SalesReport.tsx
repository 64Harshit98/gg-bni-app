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
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Data Types ---
interface SalesItem {
  name: string;
  mrp: number;
  quantity: number;
}

interface PaymentMethods {
  [key: string]: number;
}

interface SaleRecord {
  id: string;
  partyName: string;
  totalAmount: number;
  paymentMethods: PaymentMethods;
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

const formatPaymentMethods = (methods: PaymentMethods): string => {
  if (!methods || Object.keys(methods).length === 0) {
    return 'N/A';
  }
  return Object.entries(methods)
    .map(
      ([mode, amount]) =>
        `${mode.charAt(0).toUpperCase() + mode.slice(1)}: ₹${amount.toFixed(
          2
        )}`
    )
    .join(', ');
};

// --- Child Components ---
// FIX: New SummaryCard component for displaying key metrics
const SummaryCard: React.FC<{ title: string; value: string; icon: any }> = ({
  title,
  value,
  icon,
}) => (
  <div className="bg-white p-4 rounded-lg shadow-md flex items-center">
    <div className="bg-blue-100 text-blue-600 rounded-full p-3 mr-4">
      {icon}
    </div>
    <div>
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-xl font-bold text-gray-800">{value}</p>
    </div>
  </div>
);

// --- Main Sales Report Component ---
const SalesReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

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
          where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);
        const fetchedSales: SaleRecord[] = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          fetchedSales.push({
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

  // FIX: Added summary calculations to the memoized function
  const { filteredSales, summary } = useMemo(() => {
    let newFilteredSales = sales;

    if (searchQuery) {
      newFilteredSales = newFilteredSales.filter((sale) =>
        sale.partyName.toLowerCase().includes(searchQuery.toLowerCase())
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

    const totalSales = newFilteredSales.reduce(
      (acc, sale) => acc + sale.totalAmount,
      0
    );
    const totalTransactions = newFilteredSales.length;

    return {
      filteredSales: newFilteredSales,
      summary: {
        totalSales,
        totalTransactions,
      },
    };
  }, [searchQuery, startDate, endDate, sales]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  // FIX: New function to handle PDF download
  const downloadAsPdf = () => {
    const doc = new jsPDF();
    doc.text('Sales Report', 20, 10);

    autoTable(doc, { // Correct way to call the function
      head: [
        ['Invoice ID', 'Party Name', 'Total Amount', 'Payment Method', 'Date'],
      ],
      body: filteredSales.map((sale) => [
        sale.id.slice(0, 8),
        sale.partyName,
        `₹${sale.totalAmount.toLocaleString('en-IN')}`,
        formatPaymentMethods(sale.paymentMethods),
        formatDate(sale.createdAt),
      ]),
    });

    doc.save('sales_report.pdf');
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
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-6">
        <h1 className="flex-1 text-2xl sm:text-3xl font-bold text-gray-800 text-center">
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

      {/* FIX: Summary Cards section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <SummaryCard
          title="Total Sales"
          value={`₹${summary.totalSales.toLocaleString('en-IN')}`}
          icon={
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
              <line x1="12" x2="12" y1="2" y2="22" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
        <SummaryCard
          title="Total Transactions"
          value={summary.totalTransactions.toString()}
          icon={
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          }
        />
      </div>

      <div className="bg-white rounded-xl shadow-md">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-700">Filters</h2>
          </div>
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
              <button
                onClick={downloadAsPdf}
                className="bg-blue-600 text-white rounded-md py-2 px-4 shadow-sm hover:bg-blue-700 transition"
              >
                Download PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesReport;