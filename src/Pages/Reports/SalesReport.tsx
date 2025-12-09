import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
  collection,
  query,
  getDocs,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import { PaymentChart } from '../../Components/PaymentChart';
import { TopEntitiesList } from '../../Components/TopFiveEntities';
import { IconClose } from '../../constants/Icons';
import { getSalesColumns } from '../../constants/TableColoumns';

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
  [key: string]: any;
}

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

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser?.companyId) {
      setIsLoading(false);
      setError('Company information not found. Please log in again.');
      return;
    }

    const companyId = currentUser.companyId;

    const fetchSales = async () => {
      setIsLoading(true);
      try {
        const q = query(
          collection(db, 'companies', companyId, 'sales'),
          orderBy('createdAt', 'desc')
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
        console.error("Error fetching sales:", err);
        setError('Failed to load sales report.');
      } finally {
        setIsLoading(false);
      }
    };
    fetchSales();
  }, [currentUser, authLoading]);

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

  const { filteredSales, summary } = useMemo(() => {
    if (!appliedFilters) {
      return { filteredSales: [], summary: { totalSales: 0, totalTransactions: 0, totalItemsSold: 0, averageSaleValue: 0 } };
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
      if (typeof valA === 'string' && typeof valB === 'string') return valA.localeCompare(valB) * direction;
      if (typeof valA === 'number' && typeof valB === 'number') return (valA - valB) * direction;
      return 0;
    });

    const totalSales = newFilteredSales.reduce((acc, sale) => acc + sale.totalAmount, 0);
    const totalItemsSold = newFilteredSales.reduce((acc, sale) => acc + sale.items.reduce((iAcc, i) => iAcc + i.quantity, 0), 0);
    const totalTransactions = newFilteredSales.length;
    const averageSaleValue = totalTransactions > 0 ? totalSales / totalTransactions : 0;

    return {
      filteredSales: newFilteredSales,
      summary: { totalSales, totalTransactions, totalItemsSold, averageSaleValue },
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

const tableColumns = useMemo(() => getSalesColumns(), []);

  if (isLoading || authLoading) return <div className="p-4 text-center">Loading...</div>;
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Sales Report</h1>
        <button onClick={() => navigate(-1)} className="p-2"> 
          <IconClose width={20} height={20} />
        </button>
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
        <button onClick={handleApplyFilters} className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg shadow-sm hover:bg-blue-700">Apply</button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <CustomCard variant={CardVariant.Summary} title="Total Sales" value={`₹${Math.round(summary.totalSales || 0).toLocaleString('en-IN')}`} />
        <CustomCard variant={CardVariant.Summary} title="Total Bills" value={summary.totalTransactions?.toString() || '0'} />
        <CustomCard variant={CardVariant.Summary} title="Items Sold" value={summary.totalItemsSold?.toString() || '0'} />
        <CustomCard variant={CardVariant.Summary} title="Avg Sale Value" value={`₹${Math.round(summary.averageSaleValue || 0).toLocaleString('en-IN')}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-2">
        <div className="lg:col-span-2">
          <TopEntitiesList 
             isDataVisible={true} 
             type="sales" 
             filters={appliedFilters} 
             titleOverride="Top 5 Customers"
          />
        </div>
        <PaymentChart isDataVisible={true} type="sales" filters={appliedFilters} />
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-700">Report Details</h2>
        <div className="flex items-center space-x-3">
          <button onClick={() => setIsListVisible(!isListVisible)} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition">{isListVisible ? 'Hide List' : 'Show List'}</button>
          <button onClick={downloadAsPdf} disabled={filteredSales.length === 0} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 ">Download PDF</button>
        </div>
      </div>

      {isListVisible && (
        <CustomTable<SaleRecord>
          data={filteredSales}
          columns={tableColumns}
          keyExtractor={(sale) => sale.id}
          sortConfig={sortConfig}
          onSort={handleSort}
          emptyMessage="No sales found for the selected period."
        />
      )}
    </div>
  );
};

export default SalesReport;