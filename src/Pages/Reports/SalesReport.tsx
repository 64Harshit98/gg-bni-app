import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  collection,
  query,
  getDocs,
  Timestamp,
  orderBy, // Import orderBy
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
  createdAt: number; // Using number for timestamp (milliseconds)
  items: SalesItem[];
  [key: string]: any;
}

// --- Helper Functions ---
const formatDate = (timestamp: number): string => {
  if (!timestamp) return 'N/A';
  return new Date(timestamp).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// --- Reusable Components ---
const SummaryCard: React.FC<{ title: string; value: string; note?: string }> = ({ title, value, note }) => (
  <div className="bg-white p-4 rounded-lg shadow-md text-center">
    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
    <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
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

const TopCustomersList: React.FC<{ customers: [string, number][] }> = ({ customers }) => (
  <div className="bg-white p-6 rounded-lg shadow-md">
    <h3 className="text-lg font-bold text-gray-800 mb-5">Top 5 Customers</h3>
    <div className="space-y-4">
      {customers.length > 0 ? customers.map(([name, total], index) => (
        <div key={name} className="flex items-center justify-between">
          <div className="flex items-center">
            <RankCircle rank={index + 1} />
            <p className="font-medium text-gray-700">{name}</p>
          </div>
          <div className="text-right font-semibold text-gray-800">
            ₹{total.toLocaleString('en-IN')}
          </div>
        </div>
      )) : <p className="text-sm text-center text-gray-500">No customer data for this period.</p>}
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

const SalesListTable: React.FC<{
  sales: SaleRecord[];
  sortConfig: { key: keyof SaleRecord; direction: 'asc' | 'desc' };
  onSort: (key: keyof SaleRecord) => void;
}> = ({ sales, sortConfig, onSort }) => {

    // Define Unicode symbols
    const ASC_ICON = '∧'; // Up Arrow/Wedge for Ascending
    const DESC_ICON = '∨'; // Down Arrow/Vel for Descending

  const SortableHeader: React.FC<{ sortKey: keyof SaleRecord; children: React.ReactNode; className?: string; }> = ({ sortKey, children, className }) => {
    const isSorted = sortConfig.key === sortKey;
    // Use constants instead of HTML entities
    const directionIcon = sortConfig.direction === 'asc' ? ASC_ICON : DESC_ICON; 

    return (
      <th className={`py-2 px-3 ${className || ''}`}>
        <button onClick={() => onSort(sortKey)} className="flex items-center gap-2 uppercase">
          {children}
          <span className="w-0">
            {isSorted ? (
              <span className="text-blue-600 text-xs">{directionIcon}</span>
            ) : (
              <span className="text-gray-400 hover:text-gray-600 text-xs inline-flex flex-col leading-3">
                <span>{ASC_ICON}</span> {/* Up arrow for unsorted state */}
                <span className="-mt-1">{DESC_ICON}</span> {/* Down arrow for unsorted state */}
              </span>
            )}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="bg-white p-2 rounded-lg shadow-md mt-2">
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full text-sm text-center">
          <thead className="text-xs text-slate-500 bg-slate-100 sticky top-0">
            <tr>
              <SortableHeader sortKey="createdAt">Date</SortableHeader>
              <SortableHeader sortKey="partyName">Party Name</SortableHeader>
              <SortableHeader sortKey="items">Items</SortableHeader>
              <SortableHeader sortKey="totalAmount">Amount</SortableHeader>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sales.map(sale => (
              <tr key={sale.id} className="hover:bg-slate-50">
                <td className="py-2 px-3 text-slate-600">{formatDate(sale.createdAt)}</td>
                <td className="py-2 px-3 font-medium">{sale.partyName}</td>
                <td className="py-2 px-3 text-slate-600">{sale.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                <td className="py-2 px-3 text-slate-600">₹{sale.totalAmount.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ALL_PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Due'];

const SalesReport: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [datePreset, setDatePreset] = useState<string>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);
  const [isListVisible, setIsListVisible] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof SaleRecord; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

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

  // Fetch data securely with companyId
  useEffect(() => {
    if (authLoading) return;
    if (!currentUser?.companyId) {
      setIsLoading(false);
      setError('Company information not found. Please log in again.');
      return;
    }

    const companyId = currentUser.companyId; // Get companyId

    const fetchSales = async () => {
      setIsLoading(true);
      try {
        // --- FIX: Use the correct multi-tenant path ---
        const q = query(
          collection(db, 'companies', companyId, 'sales'),
          orderBy('createdAt', 'desc') // Order by, since 'where' is not always used
        );

        const querySnapshot = await getDocs(q);
        const fetchedSales: SaleRecord[] = querySnapshot.docs.map(doc => {
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
        setSales(fetchedSales);
      } catch (err) {
        console.error("Error fetching sales:", err); // Log the actual error
        setError('Failed to load sales report.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSales();
  }, [currentUser, authLoading]); // Re-fetch if currentUser (and thus companyId) changes

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

  const handleSort = (key: keyof SaleRecord) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const { filteredSales, summary, topCustomers, paymentModes } = useMemo(() => {
    if (!appliedFilters) {
      return { filteredSales: [], summary: { totalSales: 0, totalTransactions: 0, totalItemsSold: 0, averageSaleValue: 0 }, topCustomers: [], paymentModes: {} };
    }

    let newFilteredSales = sales.filter(sale =>
      sale.createdAt >= appliedFilters.start && sale.createdAt <= appliedFilters.end
    );

    newFilteredSales.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;

      if (key === 'items') {
        const totalItemsA = a.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalItemsB = b.items.reduce((sum, item) => sum + item.quantity, 0);
        return (totalItemsA - totalItemsB) * direction;
      }

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

    const totalSales = newFilteredSales.reduce((acc, sale) => acc + sale.totalAmount, 0);
    const totalItemsSold = newFilteredSales.reduce((acc, sale) => acc + sale.items.reduce((iAcc, i) => iAcc + i.quantity, 0), 0);
    const totalTransactions = newFilteredSales.length;
    const averageSaleValue = totalTransactions > 0 ? totalSales / totalTransactions : 0;
    const customerTotals: { [key: string]: number } = {};
    const paymentModesData: { [key: string]: number } = {};
    ALL_PAYMENT_MODES.forEach(mode => { paymentModesData[mode] = 0; });

    newFilteredSales.forEach((s) => {
      customerTotals[s.partyName] = (customerTotals[s.partyName] || 0) + s.totalAmount;
      for (const [methodFromDB, amount] of Object.entries(s.paymentMethods)) {
        const normalizedMethod = methodFromDB.toLowerCase();
        const matchedMode = ALL_PAYMENT_MODES.find(m => m.toLowerCase().replace(/\s/g, '') === normalizedMethod);
        if (matchedMode && typeof amount === 'number') {
          paymentModesData[matchedMode] += amount;
        }
      }
    });

    const topCustomers = Object.entries(customerTotals).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      filteredSales: newFilteredSales,
      summary: { totalSales, totalTransactions, totalItemsSold, averageSaleValue },
      topCustomers,
      paymentModes: paymentModesData,
    };
  }, [appliedFilters, sales, sortConfig]);

  const downloadAsPdf = () => {
    if (!appliedFilters) return;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text('Sales Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Date Range: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`, 14, 29);

    autoTable(doc, {
      startY: 35,
      head: [['Date', 'Party Name', 'Items', 'Amount']],
      body: filteredSales.map((sale) => [
        formatDate(sale.createdAt),
        sale.partyName,
        sale.items.reduce((sum, i) => sum + i.quantity, 0),
        `₹ ${sale.totalAmount.toLocaleString('en-IN')}`,
      ]),
      foot: [
        ['Total', '', `${summary.totalItemsSold}`, `₹ ${summary.totalSales.toLocaleString('en-IN')}`]
      ],
      footStyles: { fontStyle: 'bold' },
    });

    doc.save(`sales_report_${formatDateForInput(new Date())}.pdf`);
  };

  if (isLoading || authLoading) return <div className="p-4 text-center">Loading...</div>;
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Sales Report</h1>
        <button onClick={() => navigate(-1)} className="p-2"> <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg></button>
      </div>

      <div className="bg-white p-2 rounded-lg shadow-md mb-2">
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
        <button onClick={handleApplyFilters} className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg shadow-sm hover:bg-blue-7Example">Apply</button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <SummaryCard title="Total Sales" value={`₹${Math.round(summary.totalSales || 0).toLocaleString('en-IN')}`} />
        <SummaryCard title="Total Bills" value={summary.totalTransactions?.toString() || '0'} />
        <SummaryCard title="Items Sold" value={summary.totalItemsSold?.toString() || '0'} />
        <SummaryCard title="Avg Sale Value" value={`₹${Math.round(summary.averageSaleValue || 0).toLocaleString('en-IN')}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-2">
        <div className="lg:col-span-2">
          <TopCustomersList customers={topCustomers} />
        </div>
        <PaymentChart data={paymentModes} />
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-700">Report Details</h2>
        <div className="flex items-center space-x-3">
          <button onClick={() => setIsListVisible(!isListVisible)} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition">{isListVisible ? 'Hide List' : 'Show List'}</button>
          <button onClick={downloadAsPdf} disabled={filteredSales.length === 0} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 ">Download PDF</button>
        </div>
      </div>

      {isListVisible && <SalesListTable sales={filteredSales} sortConfig={sortConfig} onSort={handleSort} />}
    </div>
  );
};

export default SalesReport;