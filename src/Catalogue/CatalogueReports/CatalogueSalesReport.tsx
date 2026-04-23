import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../lib/Firebase';
import {
    collection,
    query,
    where, // 'where' is now used
    getDocs,
    Timestamp,
    orderBy, // 'orderBy' is now used
} from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IconSearch, IconClose } from '../../constants/Icons';
import { CustomTable } from '../../Components/CustomTable';
import type { TableColumn } from '../../Components/CustomTable';
//import CataShowWrapper from '../../context/CataShowWrapper';
//import { Cata_Permissions } from '../enum/cata_permissions.enum';

// --- Data Types (now from Order documents) ---
interface OrderItem { // Renamed from SalesItem
    name: string;
    mrp: number;
    quantity: number;
}
interface PaymentMethods {
    [key: string]: number;
}
interface OrderRecord {
    id: string;
    partyName: string;
    totalAmount: number;
    paymentMethods: PaymentMethods;
    createdAt: number;
    items: OrderItem[];
    invoiceNumber: string;
    status: string;
    [key: string]: any;
}

// --- Helper Functions (Unchanged) ---
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

// --- Reusable Components (Unchanged) ---
const SummaryCard: React.FC<{ title: string; value: string; note?: string }> = ({ title, value, note }) => (
    <div className="bg-white p-4 rounded-sm shadow-md text-center">
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
            className="w-full p-2.5 text-sm text-center bg-gray-50 border border-gray-300 rounded-sm focus:ring-[#F97316] focus:border-[#F97316]"
        >
            {children}
        </select>
    </div>
);

const RankCircle: React.FC<{ rank: number }> = ({ rank }) => (
    <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-blue-100 text-[#F97316] rounded-full font-bold text-sm mr-4">
        {rank}
    </div>
);

const TopCustomersList: React.FC<{ customers: [string, number][] }> = ({ customers }) => (
    <div className="bg-white p-6 rounded-sm shadow-md">
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

    // Filter out methods with 0 value
    const visibleData = sortedData.filter(([, value]) => value > 0);

    if (visibleData.length === 0) {
        return (
            <div className="bg-white p-6 rounded-sm shadow-md">
                <h3 className="text-lg font-bold text-gray-800 mb-5">Payment Methods</h3>
                <p className="text-sm text-center text-gray-500">No payment data for this period.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-sm shadow-md">
            <h3 className="text-lg font-bold text-gray-800 mb-5">Payment Methods</h3>
            <div className="space-y-4">
                {visibleData.map(([method, value]) => (
                    <div key={method}>
                        <div className="flex justify-between items-center text-sm mb-1">
                            <span className="font-medium text-gray-600">{method}</span>
                            <span className="font-semibold text-gray-800">₹{value.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                            <div
                                className="bg-[#F97316] h-2.5 rounded-full transition-all duration-500"
                                style={{ width: `${(value / maxValue) * 100}%` }}
                            ></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
// --- END Reusable Components ---
const tableColumns: TableColumn<OrderRecord>[] = [
    {
        header: 'Date',
        accessor: (row) => formatDate(row.createdAt),
        sortKey: 'createdAt',
    },
    {
        header: 'Order ID',
        accessor: 'invoiceNumber',
        sortKey: 'invoiceNumber',
    },
    {
        header: 'Customer',
        accessor: 'partyName',
        sortKey: 'partyName',
    },
    {
        header: 'Items',
        accessor: (row) =>
            row.items.reduce((sum, i) => sum + i.quantity, 0),
        sortKey: 'items',
        className: 'text-center',
    },
    {
        header: 'Amount',
        accessor: (row) =>
            `₹${row.totalAmount.toLocaleString('en-IN')}`,
        sortKey: 'totalAmount',
        className: 'text-right',
    },
];

// --- Define Payment Modes for Orders ---
// As your 'Orders' doc doesn't have paymentMethods, this will show 0 for now.
const ALL_PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Due'];

// --- Main Component Renamed ---
const OrdersReport: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser, loading: authLoading } = useAuth();
    const [sales, setSales] = useState<OrderRecord[]>([]); // Use OrderRecord
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [datePreset, setDatePreset] = useState<string>('today');
    const [customStartDate, setCustomStartDate] = useState<string>('');
    const [customEndDate, setCustomEndDate] = useState<string>('');
    const [appliedFilters, setAppliedFilters] = useState<{ start: number; end: number } | null>(null);
    const [isListVisible, setIsListVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: keyof OrderRecord; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });

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
        // --- Wait for filters to be set before fetching ---
        if (!appliedFilters) {
            setIsLoading(false);
            return;
        }

        const companyId = currentUser.companyId;
        const start = new Date(appliedFilters.start);
        const end = new Date(appliedFilters.end);

        const fetchSales = async () => {
            setIsLoading(true);
            try {
                // --- FIX: Query 'Orders' collection AND filter by 'Completed' status ---
                const q = query(
                    collection(db, 'companies', companyId, 'Orders'), // Changed to 'Orders'       
                    where('createdAt', '>=', Timestamp.fromDate(start)),
                    where('createdAt', '<=', Timestamp.fromDate(end)),
                    orderBy('createdAt', 'desc')
                    // NOTE: This query requires a composite index.
                    // The error in your console will provide a link to create it.
                );

                const querySnapshot = await getDocs(q);
                const fetchedSales: OrderRecord[] = querySnapshot.docs
                    .map(doc => {
                        const data = doc.data();
                        return {
                            id: doc.id,
                            partyName: data.billingDetails?.name || data.userName || 'N/A', // Use userName from Order
                            totalAmount: data.totalAmount || 0,
                            status: data.status || "",
                            paymentMethods: data.paymentMethods || {}, // Use paymentMethods from Order
                            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Date.now(),
                            items: data.items || [],
                            invoiceNumber: data.orderId || doc.id, // Use orderId
                        };
                    })
                    .filter(order => order.status === 'Completed' || order.status === 'Paid');
                setSales(fetchedSales);
            } catch (err) {
                console.error("Error fetching completed orders:", err);
                setError('Failed to load report. (Check console for index link)');
            } finally {
                setIsLoading(false);
            }
        };
        fetchSales();
    }, [currentUser, authLoading, appliedFilters]); // Re-run when filters change

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

    const handleSort = (key: keyof OrderRecord) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const { filteredSales, summary, topCustomers, paymentModes } = useMemo(() => {
        // Date filtering is now done in the query, so 'sales' is already filtered.
        let newFilteredSales = [...sales];

        const trimmedQuery = searchQuery.toLowerCase().trim();

        if (trimmedQuery) {
            const tokens = trimmedQuery.split(/\s+/);

            newFilteredSales = newFilteredSales.filter((sale) => {
                return tokens.every((token) => {
                    return (
                        sale.invoiceNumber?.toLowerCase().includes(token) ||
                        sale.partyName?.toLowerCase().includes(token) ||
                        sale.items?.some(item =>
                            item.name?.toLowerCase().includes(token)
                        )
                    );
                });
            });
        }

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
            // Note: Your 'Orders' doc (image_8db8e1.png) does not show a paymentMethods object.
            // This logic assumes you will add it. If not, paymentModesData will remain 0.
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
    }, [sales, sortConfig, searchQuery]); // Removed appliedFilters from here

    const downloadAsPdf = async () => {
        if (!appliedFilters) return;
        try {
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();

            // ===== BRAND ACCENT BAR =====
            doc.setFillColor(249, 115, 22);
            doc.rect(0, 0, pageWidth, 6, 'F');

            // ===== HEADER =====
            doc.setFontSize(22);
            doc.setTextColor(17, 24, 39);
            doc.setFont('helvetica', 'bold');
            doc.text('Completed Orders Report', 14, 22);

            doc.setFontSize(10);
            doc.setTextColor(107, 114, 128);
            doc.setFont('helvetica', 'normal');

            const generationDate = new Date().toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric'
            });

            let subtitleText = `Generated on: ${generationDate}`;
            subtitleText += `   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`;

            doc.text(subtitleText, 14, 29);

            // ===== GENERATION TAG =====
            const tagText = `Generated by SELLAR • ${new Date().toLocaleString('en-IN')}`;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);

            const textWidth = doc.getTextWidth(tagText);
            const paddingX = 2;

            const boxWidth = textWidth + paddingX * 2;
            const boxHeight = 5;

            const boxX = pageWidth - 14 - boxWidth;
            const boxY = 10;

            doc.setFillColor(245, 245, 245);
            doc.rect(boxX, boxY, boxWidth, boxHeight, 'F');

            doc.setTextColor(80, 80, 80);
            doc.text(tagText, boxX + paddingX, boxY + 3.5);

            doc.setTextColor(0, 0, 0);

            doc.setFontSize(18);
            doc.text('Completed Orders Report', 14, 20);
            doc.setFontSize(11);
            doc.setTextColor(100);
            doc.text(`Date Range: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`, 14, 29);

            autoTable(doc, {
                startY: 35,
                head: [['Date', 'Order ID', 'Customer', 'Items', 'Amount']], // Headers changed
                body: filteredSales.map((sale) => [
                    formatDate(sale.createdAt),
                    sale.invoiceNumber,
                    sale.partyName,
                    sale.items.reduce((sum, i) => sum + i.quantity, 0),
                    `₹ ${sale.totalAmount.toLocaleString('en-IN')}`,
                ]),
                foot: [
                    ['Total', '', '', `${summary.totalItemsSold}`, `₹ ${summary.totalSales.toLocaleString('en-IN')}`]
                ],
                footStyles: { fontStyle: 'bold' },
            });

            doc.save(`orders_report_${formatDateForInput(new Date())}.pdf`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            // Optionally show an error message to the user
        }
    };

    if (isLoading || authLoading) return <div className="p-4 text-center">Loading...</div>;
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    return (
        <div className="min-h-screen bg-gray-100 p-2 pb-16">

            <div className="flex items-center justify-between pb-3 border-b mb-2">

                {/* LEFT (Toggle Icon) */}
                <button
                    onClick={() => setShowSearch(true)}
                    className="p-2"
                >
                    <IconSearch />
                </button>

                {/* TITLE */}
                <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
                    Orders Report (Completed)
                </h1>

                {/* RIGHT EMPTY (for balance) */}
                <button
                    onClick={() => navigate(-1)}
                    className="rounded-full bg-gray-200 p-2 text-gray-900 hover:bg-gray-300"
                >
                    <IconClose width={20} height={20} />
                </button>

            </div>

            {showSearch && (
                <div className="flex justify-center mb-2 px-2">

                    <div className="flex items-center w-full max-w-md border-b-2 border-slate-300 focus-within:border-[#F97316]">

                        {/* INPUT */}
                        <input
                            type="text"
                            placeholder="Search by Order ID, Customer..."
                            className="flex-1 text-base font-light p-2 outline-none bg-transparent text-center"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />

                        {/*  CLOSE BUTTON (INPUT KE ANDAR RIGHT SIDE) */}
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setShowSearch(false);
                            }}
                            className="p-1 text-gray-500 hover:text-black"
                        >
                            <IconClose />
                        </button>

                    </div>

                </div>
            )}

            <div className="bg-white p-2 rounded-sm shadow-md mb-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <FilterSelect value={datePreset} onChange={(e) => handleDatePresetChange(e.target.value)}>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last7">Last 7 Days</option>
                        <option value="last30">Last 30 Days</option>
                        <option value="custom">Custom</option>
                    </FilterSelect>
                    <div className='grid grid-cols-2 sm:grid-cols-2 gap-4'>
                        <input type="date" value={customStartDate} onChange={e => { setCustomStartDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-gray-50 border rounded-sm" placeholder="Start Date" />
                        <input type="date" value={customEndDate} onChange={e => { setCustomEndDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-gray-50 border rounded-sm" placeholder="End Date" />
                    </div>
                </div>
                <button onClick={handleApplyFilters} className="w-full mt-2 px-3 py-1 bg-[#F97316] text-white text-lg font-semibold rounded-sm shadow-sm hover:bg-[#F97316] transition">Apply</button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
                <SummaryCard title="Total Sales" value={`₹${Math.round(summary.totalSales || 0).toLocaleString('en-IN')}`} />
                <SummaryCard title="Total Orders" value={summary.totalTransactions?.toString() || '0'} /> {/* Renamed from Bills */}
                <SummaryCard title="Items Sold" value={summary.totalItemsSold?.toString() || '0'} />
                <SummaryCard title="Avg Sale Value" value={`₹${Math.round(summary.averageSaleValue || 0).toLocaleString('en-IN')}`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-2">
                <div className="lg:col-span-2">
                    <TopCustomersList customers={topCustomers} />
                </div>
                <PaymentChart data={paymentModes} />
            </div>

            <div className="bg-white p-4 rounded-sm shadow-md flex justify-between items-center">
                <h2 className="text-lg font-semibold text-gray-700">Report Details</h2>
                <div className="flex items-center space-x-3">
                    <button onClick={() => setIsListVisible(!isListVisible)} className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-sm hover:bg-slate-300 transition">{isListVisible ? 'Hide List' : 'Show List'}</button>

                    <button onClick={downloadAsPdf} disabled={filteredSales.length === 0} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-sm shadow-sm hover:bg-blue-700 ">Download PDF</button>
                </div>
            </div>

            {isListVisible && (
                <CustomTable<OrderRecord>
                    data={filteredSales}
                    columns={tableColumns}
                    sortConfig={sortConfig}
                    onSort={handleSort}
                    keyExtractor={(row) => row.id}
                    emptyMessage="No orders found."
                    accentColor="text-[#F97316]"
                />
            )}
        </div>
    );
};

export default OrdersReport;