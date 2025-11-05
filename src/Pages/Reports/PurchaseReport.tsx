import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/firebase';
import {
  collection,
  query,
  where, // Make sure 'where' is imported
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { jsPDF } from 'jspdf';
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
  createdAt: number; // Using number for timestamp (milliseconds)
  items: PurchaseItem[];
  // Add other potential keys for sorting
  [key: string]: any;
}

// --- Helper Functions ---
const formatDate = (timestamp: number): string => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// --- Reusable Components (Unchanged) ---
const SummaryCard: React.FC<{ title: string; value: string; note?: string }> = ({ title, value, note }) => (
  <div className="bg-white p-4 rounded-lg shadow-md text-center">
    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
    <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
    {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
  </div>
);

const FilterSelect: React.FC<{
  label?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
  <div className="flex-1 min-w-0">
    {label && <label className="block text-xs text-center font-medium text-gray-600 mb-1">{label}</label>}
    <select
      value={value}
      onChange={onChange}
      className="w-full p-2.5 text-sm text-center bg-gray-50 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
    >
      {children}
    </select>
  </div>
);

const RankCircle: React.FC<{ rank: number }> = ({ rank }) => (
  <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full font-bold text-sm mr-4">
    {rank}
  </div>
);

const TopSuppliersList: React.FC<{ suppliers: [string, number][] }> = ({ suppliers }) => (
  <div className="bg-white p-6 rounded-lg shadow-md">
    <h3 className="text-lg font-bold text-gray-800 mb-5">Top 5 Suppliers</h3>
    <div className="space-y-4">
      {suppliers.length > 0 ? suppliers.map(([name, total], index) => (
        <div key={name} className="flex items-center justify-between">
          <div className="flex items-center">
            <RankCircle rank={index + 1} />
            <p className="font-medium text-gray-700">{name}</p>
          </div>
          <div className="text-right font-semibold text-gray-800">
            ₹{total.toLocaleString('en-IN')}
          </div>
        </div>
      )) : <p className="text-sm text-center text-gray-500">No supplier data for this period.</p>}
    </div>
  </div>
);

const PaymentChart: React.FC<{ data: { [key: string]: number } }> = ({ data }) => {
  const sortedData = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const maxValue = Math.max(...sortedData.map(([, value]) => value), 1);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h3 className="text-lg font-bold text-gray-800 mb-5">Payment Methods</h3>
      <div className="space-y-4">
        {sortedData.map(([method, value]) => (
          <div key={method}>
            <div className="flex justify-between items-center text-sm mb-1">
              <span className="font-medium text-gray-600">{method}</span>
              <span className="font-semibold text-gray-800">₹{value.toLocaleString('en-IN')}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${(value / maxValue) * 100}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PurchaseListTable: React.FC<{
  purchases: PurchaseRecord[];
  sortConfig: { key: keyof PurchaseRecord; direction: 'asc' | 'desc' };
  onSort: (key: keyof PurchaseRecord) => void;
}> = ({ purchases, sortConfig, onSort }) => {
  const SortableHeader: React.FC<{ sortKey: keyof PurchaseRecord; children: React.ReactNode; className?: string; }> = ({ sortKey, children, className }) => {
    const isSorted = sortConfig.key === sortKey;
    const directionIcon = sortConfig.direction === 'asc' ? '▲' : '▼';
    return (
      <th className={`py-2 px-3 ${className || ''}`}>
        <button onClick={() => onSort(sortKey)} className="flex items-center gap-2 uppercase">
          {children}
          <span className="w-0">
            {isSorted ? (
              <span className="text-blue-600 text-xs">{directionIcon}</span>
            ) : (
              <span className="text-gray-400 hover:text-gray-600 text-xs inline-flex flex-col leading-3">
                <span>▲</span>
                <span className="-mt-1">▼</span>
              </span>
            )}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-md mt-2">
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm text-center">
          <thead className="text-xs text-slate-500 bg-slate-100 sticky top-0">
            <tr>
              <SortableHeader sortKey="createdAt">Date</SortableHeader>
              <SortableHeader sortKey="partyName">Name</SortableHeader>
              <th className="py-3 px-4 uppercase">Items</th>
              <SortableHeader sortKey="totalAmount" className="text-right">Amount</SortableHeader>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-300">
            {purchases.map(purchase => (
              <tr key={purchase.id} className="hover:bg-slate-50">
                <td className="py-2 px-3` text-slate-600">{formatDate(purchase.createdAt)}</td>
                <td className="py-3 px-4 font-medium">{purchase.partyName}</td>
                <td className="py-3 px-4 text-slate-600">{purchase.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                <td className="py-3 px-4 text-slate-600">₹{purchase.totalAmount.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// --- Main Purchase Report Component ---
const ALL_PAYMENT_MODES = ['Bank Transfer', 'Cheque', 'Cash', 'Credit'];

const PurchaseReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<string>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);
  const [isListVisible, setIsListVisible] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof PurchaseRecord; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  useEffect(() => {
    const today = new Date();
    const startDateStr = formatDateForInput(today);
    const endDateStr = formatDateForInput(today);
    setCustomStartDate(startDateStr);
    setCustomEndDate(endDateStr);

    const start = new Date(startDateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDateStr);
    end.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  }, []);

  // --- FIX 1: Fetch data securely with companyId AND filters ---
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser?.companyId) {
      setIsLoading(false);
      setError('Company information not found. Please log in again.');
      return;
    }
    // --- FIX: Wait for filters to be applied ---
    if (!appliedFilters) {
      setIsLoading(false);
      setPurchases([]);
      return;
    }

    const companyId = currentUser.companyId;
    // --- FIX: Get dates from appliedFilters ---
    const start = new Date(appliedFilters.start);
    const end = new Date(appliedFilters.end);

    const fetchPurchases = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // --- FIX: Use multi-tenant path and add date filters ---
        const q = query(
          collection(db, 'companies', companyId, 'purchases'),
          where('createdAt', '>=', Timestamp.fromDate(start)),
          where('createdAt', '<=', Timestamp.fromDate(end))
          // No 'companyId' where clause needed
        );
        const querySnapshot = await getDocs(q);
        const fetchedPurchases: PurchaseRecord[] = querySnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            partyName: data.partyName || 'N/A',
            totalAmount: data.totalAmount || 0,
            paymentMethods: data.paymentMethods || {},
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
            items: data.items || [],
          };
        });
        setPurchases(fetchedPurchases);
      } catch (err) {
        console.error("Error fetching purchases:", err); // Log the actual error
        setError('Failed to load purchase report.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchPurchases();
    // --- FIX 2: Add appliedFilters to dependency array ---
  }, [currentUser, authLoading, appliedFilters]);

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    let start = new Date();
    let end = new Date();
    switch (preset) {
      case 'today': break;
      case 'yesterday': start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); break;
      case 'last7': start.setDate(start.getDate() - 6); break;
      case 'last30': start.setDate(start.getDate() - 29); break;
      case 'custom': return;
    }
    setCustomStartDate(formatDateForInput(start));
    setCustomEndDate(formatDateForInput(end));
  };

  const handleApplyFilters = () => {
    let start = customStartDate ? new Date(customStartDate) : new Date(0);
    start.setHours(0, 0, 0, 0);
    let end = customEndDate ? new Date(customEndDate) : new Date();
    end.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  };

  const handleSort = (key: keyof PurchaseRecord) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const { filteredPurchases, summary, topSuppliers, paymentModes } = useMemo(() => {
    if (!appliedFilters) {
      return { filteredPurchases: [], summary: { totalPurchases: 0, totalOrders: 0, totalItemsPurchased: 0, averagePurchaseValue: 0 }, topSuppliers: [], paymentModes: {} };
    }

    // --- FIX: Date filtering is now done in useEffect query. Remove it from here. ---
    // --- FIX: Typo s/sales/purchases/ ---
    let newFilteredPurchases = [...purchases];

    newFilteredPurchases.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = a[key] ?? '';
      const valB = b[key] ?? '';
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * direction;
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * direction;
      }
      return 0;
    });

    // (Rest of the summary logic is correct)
    const totalPurchases = newFilteredPurchases.reduce((acc, p) => acc + p.totalAmount, 0);
    const totalItemsPurchased = newFilteredPurchases.reduce((acc, p) => acc + p.items.reduce((iAcc, i) => iAcc + i.quantity, 0), 0);
    const totalOrders = newFilteredPurchases.length;
    const averagePurchaseValue = totalOrders > 0 ? totalPurchases / totalOrders : 0;
    const supplierTotals: { [key: string]: number } = {};
    const paymentModesData: { [key: string]: number } = {};
    ALL_PAYMENT_MODES.forEach(mode => { paymentModesData[mode] = 0; });

    newFilteredPurchases.forEach((p) => {
      supplierTotals[p.partyName] = (supplierTotals[p.partyName] || 0) + p.totalAmount;
      for (const [methodFromDB, amount] of Object.entries(p.paymentMethods)) {
        const normalizedMethod = methodFromDB.toLowerCase().replace(/\s/g, '');
        const matchedMode = ALL_PAYMENT_MODES.find(m => m.toLowerCase().replace(/\s/g, '') === normalizedMethod);
        if (matchedMode && typeof amount === 'number') {
          paymentModesData[matchedMode] += amount;
        }
      }
    });

    const topSuppliers = Object.entries(supplierTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      filteredPurchases: newFilteredPurchases,
      summary: { totalPurchases, totalOrders, totalItemsPurchased, averagePurchaseValue },
      topSuppliers,
      paymentModes: paymentModesData,
    };
  }, [appliedFilters, purchases, sortConfig]);

  const downloadAsPdf = () => {
    // (This function is correct, no changes needed)
    const doc = new jsPDF();
    doc.text('Purchase Report', 20, 10);
    autoTable(doc, {
      head: [['Date', 'Supplier Name', 'Total Amount', 'Payment Method']],
      body: filteredPurchases.map((purchase) => [
        formatDate(purchase.createdAt),
        purchase.partyName,
        `₹${purchase.totalAmount.toLocaleString('en-IN')}`,
        Object.keys(purchase.paymentMethods).join(', ') || 'N/A',
      ]),
    });
    doc.save('purchase_report.pdf');
  };

  if (isLoading || authLoading) return <div className="p-4 text-center">Loading...</div>;
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Purchase Report</h1>
        <button onClick={() => navigate(-1)} className="p-2"> <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md mb-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <FilterSelect value={datePreset} onChange={(e) => handleDatePresetChange(e.target.value)}>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom</option>
          </FilterSelect>
          <div className='grid grid-cols-2 sm:grid-cols-2 gap-4'>
            <input type="date" value={customStartDate} onChange={e => { setCustomStartDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-gray-50 border rounded-md" placeholder="Start Date" />
            <input type="date" value={customEndDate} onChange={e => { setCustomEndDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-gray-50 border rounded-md" placeholder="End Date" />
          </div>
        </div>
        <button onClick={handleApplyFilters} className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition">Apply</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
        <SummaryCard title="Total Cost" value={`₹${Math.round(summary.totalPurchases || 0)}`} />
        <SummaryCard title="Total Orders" value={summary.totalOrders?.toString() || '0'} />
        <SummaryCard title="Total Items" value={summary.totalItemsPurchased?.toString() || '0'} />
        <SummaryCard title="Avg Purchase" value={`₹${Math.round(summary.averagePurchaseValue || 0)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-2">
        <div className="lg:col-span-2">
          <TopSuppliersList suppliers={topSuppliers} />
        </div>
        <PaymentChart data={paymentModes} />
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-700">Report Details</h2>
        <div className="flex items-center space-x-3">
          <button onClick={() => setIsListVisible(!isListVisible)} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition">{isListVisible ? 'Hide List' : 'Show List'}</button>
          <button onClick={downloadAsPdf} disabled={filteredPurchases.length === 0} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 disabled:opacity-50 transition">Download PDF</button>
        </div>
      </div>

      {isListVisible && <PurchaseListTable purchases={filteredPurchases} sortConfig={sortConfig} onSort={handleSort} />}
    </div>
  );
};

export default PurchaseReport;