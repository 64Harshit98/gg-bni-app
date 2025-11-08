import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import {
  collection,
  query,
  onSnapshot,
  Timestamp
} from 'firebase/firestore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- Data Types ---
interface Transaction {
  id: string;
  partyName: string;
  invoiceNumber: string;
  totalAmount: number;
  createdAt: Date;
  costOfGoodsSold?: number;
}

interface TransactionDetail extends Transaction {
  type: 'Revenue' | 'Cost';
  profit?: number; // Added profit for sorting
}

interface Item {
  id: string;
  purchasePrice: number;
}

const formatDateForInput = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const formatDate = (date: Date): string => {
  if (!date) return 'N/A';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};


const SummaryCard: React.FC<{ title: string; value: string; valueClassName?: string }> =
  ({ title, value, valueClassName = 'text-gray-900' }) => (
    <div className="bg-white p-4 rounded-lg shadow-md text-center">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
      <p className={`text-3xl font-bold mt-2 ${valueClassName}`}>{value}</p>
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
      className="w-full p-2.5 text-sm bg-gray-50 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
    >
      {children}
    </select>
  </div>
);

const PnlListTable: React.FC<{
  transactions: TransactionDetail[];
  sortConfig: { key: keyof TransactionDetail; direction: 'asc' | 'desc' };
  onSort: (key: keyof TransactionDetail) => void;
}> = ({ transactions, sortConfig, onSort }) => {
  const SortableHeader: React.FC<{ sortKey: keyof TransactionDetail; children: React.ReactNode; className?: string; }> = ({ sortKey, children, className }) => {
    const isSorted = sortConfig.key === sortKey;
    const directionIcon = sortConfig.direction === 'asc' ? '▲' : '▼';
    return (
      <th className={`py-2 px-3 ${className || ''}`}>
        <button onClick={() => onSort(sortKey)} className="flex items-center gap-2 uppercase">
          {children}
          <span className="w-0">
            {isSorted ? <span className="text-blue-600 text-xs">{directionIcon}</span> : <span className="text-gray-400 hover:text-gray-600 text-xs inline-flex flex-col leading-3"><span>▲</span><span className="-mt-1">▼</span></span>}
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
              <SortableHeader sortKey="invoiceNumber">Invoice</SortableHeader>
              <SortableHeader sortKey="totalAmount" className="text-center">Sales</SortableHeader>
              <SortableHeader sortKey="costOfGoodsSold" className="text-center">Cost</SortableHeader>
              <SortableHeader sortKey="profit" className="text-center">Profit</SortableHeader>
            </tr>
          </thead>
          <tbody className="divide-y">
            {transactions.filter(t => t.type === 'Revenue').map(t => {
              const profit = t.profit || 0;
              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 text-slate-600">{formatDate(t.createdAt)}</td>
                  <td className="py-2 px-3 font-medium">{t.invoiceNumber}</td>
                  <td className="py-2 px-3 text-green-600 ">
                    {`₹${t.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                  </td>
                  <td className="py-2 px-3 text-red-600">
                    {`₹${(t.costOfGoodsSold || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                  </td>
                  <td className={`py-2 px-3 font-medium ${profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {`₹${profit.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const usePnlReport = (companyId: string | undefined) => {
  const [sales, setSales] = useState<Transaction[]>([]);
  const [itemsMap, setItemsMap] = useState<Map<string, Item>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    // --- FIX 1: Use the correct multi-tenant path for 'items' ---
    const itemsCollectionRef = collection(db, 'companies', companyId, 'items');
    // --- FIX 1: Remove the 'companyId' where clause ---
    const qItems = query(itemsCollectionRef);

    const unsubscribeItems = onSnapshot(qItems, (snapshot) => {
      const newItemsMap = new Map<string, Item>();
      snapshot.docs.forEach(doc => {
        newItemsMap.set(doc.id, {
          id: doc.id,
          purchasePrice: doc.data().purchasePrice || 0,
        });
      });
      setItemsMap(newItemsMap);
    }, (_err) => setError('Failed to fetch item data.'));

    // --- FIX 2: Use the correct multi-tenant path for 'sales' ---
    const salesCollectionRef = collection(db, 'companies', companyId, 'sales');
    // --- FIX 2: Remove the 'companyId' where clause ---
    const qSales = query(salesCollectionRef);

    const unsubscribeSales = onSnapshot(qSales, (snapshot) => {
      // This logic to wait for itemsMap is correct
      if (itemsMap.size === 0 && snapshot.size > 0) return;

      setSales(snapshot.docs.map(doc => {
        const saleData = doc.data();
        const costOfGoodsSold = (saleData.items || []).reduce((sum: number, item: { id: string; quantity: number }) => {
          const itemDetails = itemsMap.get(item.id);
          const itemCost = itemDetails ? itemDetails.purchasePrice : 0;
          return sum + (itemCost * (item.quantity || 0));
        }, 0);

        return {
          id: doc.id,
          totalAmount: saleData.totalAmount || 0,
          createdAt: saleData.createdAt instanceof Timestamp ? saleData.createdAt.toDate() : new Date(),
          invoiceNumber: saleData.invoiceNumber || 'N/A',
          partyName: saleData.partyName || 'N/A',
          costOfGoodsSold: costOfGoodsSold,
          items: saleData.items || [], // Added items for useMemo
        };
      }));
      setLoading(false);
    }, (_err) => setError('Failed to fetch sales data.'));

    return () => {
      unsubscribeItems();
      unsubscribeSales();
    };
  }, [companyId, itemsMap]); // itemsMap dependency is correct

  return { sales, loading, error };
};


const PnlReportPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, loading: authLoading } = useAuth();
  const { sales, loading: dataLoading, error } = usePnlReport(currentUser?.companyId);

  const [datePreset, setDatePreset] = useState<string>('today');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [appliedFilters, setAppliedFilters] = useState({ start: '', end: '' });
  const [isListVisible, setIsListVisible] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: keyof TransactionDetail; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

  useEffect(() => {
    const today = new Date();
    const formattedToday = formatDateForInput(today);
    setStartDate(formattedToday);
    setEndDate(formattedToday);
    const startTimestamp = new Date(formattedToday);
    startTimestamp.setHours(0, 0, 0, 0);
    const endTimestamp = new Date(formattedToday);
    endTimestamp.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: startTimestamp.toISOString(), end: endTimestamp.toISOString() });
  }, []);

  const { pnlSummary, filteredTransactions } = useMemo(() => {
    const startTimestamp = appliedFilters.start ? new Date(appliedFilters.start).getTime() : 0;
    const endTimestamp = appliedFilters.end ? new Date(appliedFilters.end).getTime() : Infinity;
    const filteredSales = sales.filter(s => s.createdAt.getTime() >= startTimestamp && s.createdAt.getTime() <= endTimestamp);

    const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const totalCostOfGoodsSold = filteredSales.reduce((sum, sale) => sum + (sale.costOfGoodsSold || 0), 0);
    const grossProfit = totalRevenue - totalCostOfGoodsSold;
    const grossProfitPercentage = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    let salesTransactions: TransactionDetail[] = filteredSales.map(s => ({
      ...s,
      type: 'Revenue' as const,
      profit: s.totalAmount - (s.costOfGoodsSold || 0)
    }));

    salesTransactions.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = a[key] as any ?? (typeof a[key] === 'number' ? 0 : '');
      const valB = b[key] as any ?? (typeof b[key] === 'number' ? 0 : '');
      if (valA instanceof Date && valB instanceof Date) { return (valA.getTime() - valB.getTime()) * direction; }
      if (typeof valA === 'number' && typeof valB === 'number') { return (valA - valB) * direction; }
      if (typeof valA === 'string' && typeof valB === 'string') { return valA.localeCompare(valB) * direction; }
      return 0;
    });

    return {
      pnlSummary: { totalRevenue, totalCost: totalCostOfGoodsSold, grossProfit, grossProfitPercentage },
      filteredTransactions: salesTransactions
    };
  }, [sales, appliedFilters, sortConfig]);

  const handleSort = (key: keyof TransactionDetail) => {
    setSortConfig(prevConfig => ({
      key,
      direction: prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

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
    setStartDate(formatDateForInput(start));
    setEndDate(formatDateForInput(end));
  };

  const handleApplyFilters = () => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: start.toISOString(), end: end.toISOString() });
  };

  const selectedPeriodText = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const format = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-IN', options);

    if (!appliedFilters.start || !appliedFilters.end) return "Loading period...";

    const start = format(appliedFilters.start);
    const end = format(appliedFilters.end);

    if (start === end) return `For ${start}`;
    return `From ${start} to ${end}`;
  }, [appliedFilters]);


  const handleDownloadPdf = () => {
    const doc = new jsPDF();
    const { totalRevenue, totalCost, grossProfit, grossProfitPercentage } = pnlSummary;

    doc.setFontSize(18);
    doc.text('Profit & Loss Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(selectedPeriodText, 14, 30);

    const summaryY = 45;
    autoTable(doc, {
      startY: summaryY,
      body: [
        ['Total Sales:', `₹${totalRevenue.toLocaleString('en-IN')}`, 'Gross Profit / Loss:', `₹${grossProfit.toLocaleString('en-IN')}`],
        ['Total Cost:', `₹${totalCost.toLocaleString('en-IN')}`, 'Gross Profit %:', `${grossProfitPercentage.toFixed(2)}%`],
      ],
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        2: { fontStyle: 'bold' },
      }
    });

    const tableHead = [['Date', 'Invoice', 'Sales', 'Cost', 'Profit']];
    const tableBody = filteredTransactions.map(t => [
      formatDate(t.createdAt),
      t.invoiceNumber,
      `₹${t.totalAmount.toLocaleString('en-IN')}`,
      `₹${(t.costOfGoodsSold || 0).toLocaleString('en-IN')}`,
      `₹${(t.profit || 0).toLocaleString('en-IN')}`
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: tableHead,
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`PNL-Report-${startDate}-to-${endDate}.pdf`);
  };

  if (authLoading || dataLoading) {
    return <div className="p-4 text-center">Loading Report...</div>;
  }
  if (error) {
    return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  }
  if (!currentUser) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-2">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">Profit & Loss Report</h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md mb-2">
        <FilterSelect value={datePreset} onChange={(e) => handleDatePresetChange(e.target.value)}>
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7">Last 7 Days</option>
          <option value="last30">Last 30 Days</option>
          <option value="custom">Custom</option>
        </FilterSelect>
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 mt-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setDatePreset('custom'); }}
            className="w-full p-2 text-sm bg-gray-50 border border-gray-300 rounded-md"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setDatePreset('custom'); }}
            className="w-full p-2 text-sm bg-gray-50 border border-gray-300 rounded-md"
          />
        </div>
        <button
          onClick={handleApplyFilters}
          className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition"
        >
          Apply
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 gap-2">
        <SummaryCard
          title="Total Sales"
          value={`₹${pnlSummary.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          valueClassName="text-blue-600"
        />
        <SummaryCard
          title="Total Cost"
          value={`₹${pnlSummary.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          valueClassName="text-red-600"
        />
        <SummaryCard
          title="Profit / Loss"
          value={`₹${pnlSummary.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          valueClassName={pnlSummary.grossProfit >= 0 ? "text-green-600" : "text-red-600"}
        />
        <SummaryCard
          title="Gross Profit %"
          value={`${Math.round(pnlSummary.grossProfitPercentage).toFixed(0)}%`}
          valueClassName={pnlSummary.grossProfit >= 0 ? "text-green-600" : "text-red-600"}
        />
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center mt-2">
        <h2 className="text-lg font-semibold text-gray-700">P&L Details</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setIsListVisible(!isListVisible)} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition">
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button onClick={handleDownloadPdf} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition">
            Download as PDF
          </button>
        </div>
      </div>

      {isListVisible && <PnlListTable transactions={filteredTransactions} sortConfig={sortConfig} onSort={handleSort} />}
    </div>
  );
};

export default PnlReportPage;