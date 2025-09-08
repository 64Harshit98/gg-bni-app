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
// FIX: Added imports for PDF generation
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
        `${mode.charAt(0).toUpperCase() + mode.slice(1)}: ₹${amount.toFixed(
          2
        )}`
    )
    .join(', ');
};

// FIX: New reusable component for summary cards
const SummaryCard: React.FC<{ title: string; value: string; note?: string }> =
  ({ title, value, note }) => (
    <div className="bg-white p-6 rounded-xl shadow">
      <h3 className="text-sm font-medium text-gray-500">{title}</h3>
      <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
      {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
    </div>
  );

// --- Main Purchase Report Component ---
const PurchaseReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();

  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

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
          where('userId', '==', currentUser.uid)
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

  const { filteredPurchases, summary } = useMemo(() => {
    let newFilteredPurchases = purchases;

    if (searchQuery) {
      newFilteredPurchases = newFilteredPurchases.filter((purchase) =>
        purchase.partyName.toLowerCase().includes(searchQuery.toLowerCase())
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
          purchaseCreatedAt >= startTimestamp && purchaseCreatedAt <= endTimestamp
        );
      });
    }

    const totalCost = newFilteredPurchases.reduce(
      (sum, purchase) => sum + purchase.totalAmount,
      0
    );
    const totalOrders = newFilteredPurchases.length;

    // FIX: Added logic to find the top supplier
    const supplierTotals: { [key: string]: number } = {};
    newFilteredPurchases.forEach((p) => {
      supplierTotals[p.partyName] =
        (supplierTotals[p.partyName] || 0) + p.totalAmount;
    });

    const topSupplierData =
      Object.entries(supplierTotals).sort((a, b) => b[1] - a[1])[0] || null;

    return {
      filteredPurchases: newFilteredPurchases,
      summary: { totalCost, totalOrders, topSupplier: topSupplierData },
    };
  }, [searchQuery, startDate, endDate, purchases]);

  // FIX: New function to handle PDF download
  const downloadAsPdf = () => {
    const doc = new jsPDF();
    doc.text('Purchase Report', 20, 10);

    autoTable(doc, {
      head: [
        ['Invoice ID', 'Party Name', 'Total Amount', 'Payment Method', 'Date'],
      ],
      body: filteredPurchases.map((purchase) => [
        purchase.id.slice(0, 8),
        purchase.partyName,
        `₹${purchase.totalAmount.toLocaleString('en-IN')}`,
        formatPaymentMethods(purchase.paymentMethods),
        formatDate(purchase.createdAt),
      ]),
    });

    doc.save('purchase_report.pdf');
  };

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
      <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-6">
        <h1 className="flex-1 text-2xl text-center sm:text-3xl font-bold text-gray-800">
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

      {/* FIX: Updated summary cards section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <SummaryCard
          title="Total Cost (Filtered)"
          value={`₹${summary.totalCost.toLocaleString('en-IN')}`}
        />
        <SummaryCard
          title="Total Orders (Filtered)"
          value={summary.totalOrders.toString()}
        />
        <SummaryCard
          title="Top Supplier (Filtered)"
          value={summary.topSupplier ? summary.topSupplier[0] : 'N/A'}
          note={
            summary.topSupplier
              ? `Total: ₹${summary.topSupplier[1].toLocaleString('en-IN')}`
              : ''
          }
        />
      </div>

      <div className="bg-white rounded-xl shadow-md">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          {/* FIX: Added Download PDF button */}
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-700">Filters</h2>
            <button
              onClick={downloadAsPdf}
              className="bg-blue-600 text-white font-semibold rounded-md py-2 px-4 shadow-sm hover:bg-blue-700 transition"
              disabled={filteredPurchases.length === 0}
            >
              Download PDF
            </button>
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
        {/* FIX: Table has been removed */}
      </div>
    </div>
  );
};

export default PurchaseReport;