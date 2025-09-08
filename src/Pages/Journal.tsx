import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  QuerySnapshot,
} from 'firebase/firestore'; // Import QuerySnapshot
import { useAuth } from '../context/auth-context';

// --- Reusable Spinner Component ---
const Spinner: React.FC = () => (
  <div className="flex justify-center items-center p-8">
    <svg
      className="animate-spin h-8 w-8 text-blue-600"
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

// --- Data Types & Helpers ---
interface Invoice {
  id: string;
  amount: number;
  time: string;
  status: 'Paid' | 'Unpaid';
  type: 'Debit' | 'Credit';
  partyName: string;
  createdAt: Date;
  dueAmount?: number; // Added to store the unpaid amount
}

const formatDate = (date: Date): string => {
  if (!date) return 'N/A';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

// --- Custom Hook for Fetching Journal Data ---
const useJournalData = (userId?: string) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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
    const purchasesQuery = query(
      collection(db, 'purchases'),
      where('userId', '==', userId),
    );

    const handleSnapshotError = (err: Error, type: string) => {
      console.error(`Error fetching ${type}:`, err);
      setError(`Failed to load ${type} data.`);
      setLoading(false);
    };

    // FIX: Add explicit type QuerySnapshot for the snapshot parameter
    const processSnapshot = (
      snapshot: QuerySnapshot,
      type: 'Credit' | 'Debit',
    ) => {
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        const createdAt =
          data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date();
        const paymentMethods = data.paymentMethods || {};
        const dueAmount = paymentMethods.due || 0;
        const status: 'Paid' | 'Unpaid' = dueAmount > 0 ? 'Unpaid' : 'Paid';

        return {
          id: doc.id,
          amount: data.totalAmount || 0,
          time: formatDate(createdAt),
          status: status,
          type: type,
          partyName: data.partyName || 'N/A',
          createdAt,
          dueAmount: dueAmount,
        };
      });
    };

    const unsubscribeSales = onSnapshot(
      salesQuery,
      (snapshot) => {
        const salesData = processSnapshot(snapshot, 'Credit');
        setInvoices((prev) => [
          ...prev.filter((inv) => inv.type !== 'Credit'),
          ...salesData,
        ]);
        setLoading(false);
      },
      (err) => handleSnapshotError(err, 'sales'),
    );

    const unsubscribePurchases = onSnapshot(
      purchasesQuery,
      (snapshot) => {
        const purchasesData = processSnapshot(snapshot, 'Debit');
        setInvoices((prev) => [
          ...prev.filter((inv) => inv.type !== 'Debit'),
          ...purchasesData,
        ]);
        setLoading(false);
      },
      (err) => handleSnapshotError(err, 'purchases'),
    );

    return () => {
      unsubscribeSales();
      unsubscribePurchases();
    };
  }, [userId]);

  const sortedInvoices = useMemo(() => {
    return invoices.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }, [invoices]);

  return { invoices: sortedInvoices, loading, error };
};

// --- Main Journal Component ---
const Journal: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Paid' | 'Unpaid'>('Paid');
  const [activeType, setActiveType] = useState<'Debit' | 'Credit'>('Credit');
  const { currentUser, loading: authLoading } = useAuth();
  const {
    invoices,
    loading: dataLoading,
    error,
  } = useJournalData(currentUser?.uid);

  const filteredInvoices = useMemo(
    () =>
      invoices.filter(
        (invoice) =>
          invoice.type === activeType && invoice.status === activeTab,
      ),
    [invoices, activeType, activeTab],
  );

  const renderContent = () => {
    if (authLoading || dataLoading) {
      return <Spinner />;
    }
    if (error) {
      return <p className="p-8 text-center text-red-500">{error}</p>;
    }
    if (filteredInvoices.length > 0) {
      return filteredInvoices.map((invoice) => (
        <div
          key={invoice.id}
          className="mb-4 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 px-5 shadow-sm transition hover:-translate-y-0.5"
        >
          <div>
            <p className="mb-1 text-lg font-semibold text-slate-800">
              {invoice.partyName}
            </p>
            <p className="text-sm text-slate-500">
              Inv #{invoice.id.slice(0, 6)}... at {invoice.time}
              {invoice.status === 'Unpaid' &&
                ` (Total: ₹${invoice.amount.toLocaleString('en-IN')})`}
            </p>
          </div>
          <p
            className={`text-2xl font-bold ${invoice.type === 'Credit' ? 'text-green-600' : 'text-red-600'}`}
          >
            ₹
            {(invoice.status === 'Unpaid'
              ? invoice.dueAmount
              : invoice.amount
            )?.toLocaleString('en-IN')}
          </p>
        </div>
      ));
    }
    return (
      <p className="p-8 text-center text-base text-slate-500">
        No invoices found for this selection.
      </p>
    );
  };

  return (
    <div className="flex min-h-screen w-full flex-col overflow-hidden bg-white shadow-md">
      {/* Top Header */}
      <div className="flex flex-shrink-0 items-center justify-center border-b border-slate-200 bg-white p-4 px-6 shadow-sm ">
        <h1 className="text-3xl font-bold text-slate-800 ">Transactions</h1>
      </div>

      {/* Debit/Credit Tabs */}
      <div className="flex justify-around border-b border-slate-200 bg-white px-6 shadow-sm">
        <button
          className={`flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${activeType === 'Credit' ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500'}`}
          onClick={() => setActiveType('Credit')}
        >
          Sales
        </button>
        <button
          className={`flex-1 cursor-pointer border-b-2 py-3 text-center text-base font-medium transition hover:text-slate-700 ${activeType === 'Debit' ? 'border-blue-600 font-semibold text-blue-600' : 'border-transparent text-slate-500'}`}
          onClick={() => setActiveType('Debit')}
        >
          Purchase
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex justify-around border-b border-slate-200 bg-white p-3 px-6 shadow-md">
        <button
          className={`cursor-pointer rounded-lg border px-5 py-2 text-sm font-medium transition ${activeTab === 'Paid' ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50'}`}
          onClick={() => setActiveTab('Paid')}
        >
          Paid
        </button>
        <button
          className={`cursor-pointer rounded-lg border px-5 py-2 text-sm font-medium transition ${activeTab === 'Unpaid' ? 'border-blue-600 bg-blue-600 text-white shadow-md' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-300 hover:bg-blue-50'}`}
          onClick={() => setActiveTab('Unpaid')}
        >
          Unpaid
        </button>
      </div>

      {/* Invoice List */}
      <div className="flex-grow overflow-y-auto bg-slate-100 p-6">
        {renderContent()}
      </div>
    </div>
  );
};

export default Journal;
