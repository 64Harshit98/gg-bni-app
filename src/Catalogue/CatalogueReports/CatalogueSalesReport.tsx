import React, { useState, useEffect, useMemo } from 'react';
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
import { resolveCompanyLogoBase64 } from '../../Catalogue/hooks/useCompanyLogo';
import XLSX from 'xlsx-js-style';
import DownloadChoiceModal from '../../Pages/Reports/ItemReportComponents/DownloadChoiceModal';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { IconSearch, IconClose } from '../../constants/Icons';
import BackButton from '../../Components/BackButton';
import { Spinner } from '../../Components/ui/spinner';
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
    <div className="bg-card p-4 rounded-sm shadow-md text-center">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        <p className="text-2xl font-bold text-foreground mt-2">{value}</p>
        {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
    </div>
);

const FilterSelect: React.FC<{
    label?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    children: React.ReactNode;
}> = ({ label, value, onChange, children }) => (
    <div className="flex-1 min-w-0">
        {label && <label className="block text-xs text-center font-medium text-muted-foreground mb-1">{label}</label>}
        <select
            value={value}
            onChange={onChange}
            className="w-full p-2.5 text-sm text-center bg-muted border border-border rounded-sm focus:ring-[#F97316] focus:border-[#F97316]"
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
    <div className="bg-card p-6 rounded-sm shadow-md">
        <h3 className="text-lg font-bold text-foreground mb-5">Top 5 Customers</h3>
        <div className="space-y-4">
            {customers.length > 0 ? customers.map(([name, total], index) => (
                <div key={name} className="flex items-center justify-between">
                    <div className="flex items-center">
                        <RankCircle rank={index + 1} />
                        <p className="font-medium text-foreground">{name}</p>
                    </div>
                    <div className="text-right font-semibold text-foreground">
                        ₹{total.toLocaleString('en-IN')}
                    </div>
                </div>
            )) : <p className="text-sm text-center text-muted-foreground">No customer data for this period.</p>}
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
            <div className="bg-card p-6 rounded-sm shadow-md">
                <h3 className="text-lg font-bold text-foreground mb-5">Payment Methods</h3>
                <p className="text-sm text-center text-muted-foreground">No payment data for this period.</p>
            </div>
        );
    }

    return (
        <div className="bg-card p-6 rounded-sm shadow-md">
            <h3 className="text-lg font-bold text-foreground mb-5">Payment Methods</h3>
            <div className="space-y-4">
                {visibleData.map(([method, value]) => (
                    <div key={method}>
                        <div className="flex justify-between items-center text-sm mb-1">
                            <span className="font-medium text-muted-foreground">{method}</span>
                            <span className="font-semibold text-foreground">₹{value.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2.5">
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


const SalesListTable: React.FC<{
    sales: OrderRecord[]; // Use OrderRecord
    sortConfig: { key: keyof OrderRecord; direction: 'asc' | 'desc' };
    onSort: (key: keyof OrderRecord) => void;
}> = ({ sales, sortConfig, onSort }) => {
    const SortableHeader: React.FC<{ sortKey: keyof OrderRecord; children: React.ReactNode; className?: string; }> = ({ sortKey, children, className }) => {
        const isSorted = sortConfig.key === sortKey;
        const ASC_ICON = '∧';
        const DESC_ICON = '∨';
        const directionIcon = sortConfig.direction === 'asc' ? ASC_ICON : DESC_ICON;

        return (
            <th className={`py-2 px-3 text-center ${className || ''}`}>
                <button
                    onClick={() => onSort(sortKey)}
                    className="w-full flex items-center justify-center gap-1 uppercase"
                >
                    <span>{children}</span>

                    <span className="w-3 flex justify-center">
                        {isSorted ? (
                            <span className="text-[#F97316] text-xs leading-none">
                                {directionIcon}
                            </span>
                        ) : (
                            <span className="text-muted-foreground text-[10px] inline-flex flex-col leading-[8px] opacity-60">
                                <span>{ASC_ICON}</span>
                                <span>{DESC_ICON}</span>
                            </span>
                        )}
                    </span>
                </button>
            </th>
        );
    };

    return (
        <div className="bg-card p-2 rounded-sm shadow-md mt-2">
            <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm text-center">
                    <thead className="text-xs text-muted-foreground bg-muted sticky top-0">
                        <tr>
                            <SortableHeader sortKey="createdAt">Date</SortableHeader>
                            <SortableHeader sortKey="invoiceNumber">Order ID</SortableHeader> {/* Changed label */}
                            <SortableHeader sortKey="partyName">Customer</SortableHeader> {/* Changed label */}
                            <SortableHeader sortKey="items">Items</SortableHeader>
                            <SortableHeader sortKey="totalAmount">Amount</SortableHeader>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {sales.map(sale => (
                            <tr key={sale.id} className="hover:bg-muted">
                                <td className="py-2 px-3 text-muted-foreground">{formatDate(sale.createdAt)}</td>
                                <td className="py-2 px-3 text-muted-foreground">{sale.invoiceNumber}</td> {/* Use invoiceNumber */}
                                <td className="py-2 px-3 font-medium">{sale.partyName}</td>
                                <td className="py-2 px-3 text-muted-foreground">{sale.items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                                <td className="py-2 px-3 text-muted-foreground">₹{sale.totalAmount.toLocaleString('en-IN')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- Define Payment Modes for Orders ---
// As your 'Orders' doc doesn't have paymentMethods, this will show 0 for now.
const ALL_PAYMENT_MODES = ['Cash', 'Card', 'UPI', 'Due'];

// --- Main Component Renamed ---
const OrdersReport: React.FC = () => {
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
    const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
    const [feedbackModal, setFeedbackModal] = useState({
        isOpen: false,
        type: State.SUCCESS,
        message: ''
    });

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
                const q = query(
                    collection(db, 'companies', companyId, 'Orders'), // Changed to 'Orders'       
                    where('createdAt', '>=', Timestamp.fromDate(start)),
                    where('createdAt', '<=', Timestamp.fromDate(end)),
                    orderBy('createdAt', 'desc')
                );

                const querySnapshot = await getDocs(q);
                const fetchedSales: OrderRecord[] = querySnapshot.docs
                    .map(doc => {
                        const data = doc.data();
                        return {
                            id: doc.id,
                            partyName: data.userName || data.billingDetails?.name || 'N/A', // Use userName from Order
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
            const pageHeight = doc.internal.pageSize.getHeight();

            // ===== GENERATION TAG (drawn first, reserves space on the right) =====
            const generatedAt = new Date().toLocaleString();
            const tagText = `Generated by SELLAR • ${generatedAt}`;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);

            const textWidth = doc.getTextWidth(tagText);
            const paddingX = 2;

            const boxWidth = textWidth + paddingX * 2;
            const boxHeight = 5;

            const logoReservedWidth = 18; // space reserved for logo + gap, so tag never overlaps it
            const boxX = pageWidth - 14 - logoReservedWidth - boxWidth;
            const boxY = 11;

            doc.setFillColor(245, 245, 245);
            doc.rect(boxX, boxY, boxWidth, boxHeight, "F");

            doc.setTextColor(80, 80, 80);
            doc.text(tagText, boxX + paddingX, boxY + 3.5);

            doc.setTextColor(0, 0, 0);

            // ===== LOGO (drawn after, in its own reserved slot at top-right corner) =====
            try {
                const base64Logo = await resolveCompanyLogoBase64(currentUser?.companyId);
                if (base64Logo) {
                    const img = new Image();
                    img.src = base64Logo;
                    await new Promise<void>((resolve) => {
                        img.onload = () => {
                            const logoWidth = 13;
                            const logoHeight = (img.naturalHeight / img.naturalWidth) * logoWidth;
                            const logoX = pageWidth - logoWidth - 14;
                            doc.addImage(base64Logo, 'PNG', logoX, 8, logoWidth, logoHeight);
                            resolve();
                        };
                        img.onerror = () => resolve();
                    });
                }
            } catch { }

            // ===== ORANGE BAR =====
            doc.setFillColor(249, 115, 22);
            doc.rect(0, 0, pageWidth, 6, 'F');

            // ===== HEADER =====
            doc.setFontSize(22);
            doc.setTextColor(17, 24, 39);
            doc.setFont('helvetica', 'bold');
            doc.text('Orders Report', 14, 24);

            doc.setFontSize(10);
            doc.setTextColor(107, 114, 128);
            doc.setFont('helvetica', 'normal');

            const generationDate = new Date().toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric',
            });

            let subtitleText = `Generated on: ${generationDate}`;
            subtitleText += `   |   Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`;

            doc.text(subtitleText, 14, 31);

            // ===== TABLE =====
            autoTable(doc, {
                startY: 38,
                head: [['DATE', 'ORDER ID', 'CUSTOMER', 'ITEMS', 'AMOUNT (Rs.)']],
                body: filteredSales.map((sale) => [
                    formatDate(sale.createdAt),
                    sale.invoiceNumber,
                    sale.partyName,
                    sale.items.reduce((sum, i) => sum + i.quantity, 0).toString(),
                    sale.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                ]),
                foot: [
                    [
                        'TOTAL',
                        '-',
                        '-',
                        summary.totalItemsSold.toString(),
                        summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                    ]
                ],
                theme: 'plain',
                styles: {
                    font: 'helvetica',
                    cellPadding: 5,
                    fontSize: 10,
                    textColor: [55, 65, 81],
                    overflow: 'linebreak',
                    valign: 'middle'
                },
                headStyles: {
                    fillColor: [249, 250, 251],
                    textColor: [17, 24, 39],
                    fontStyle: 'bold',
                    halign: 'center',
                    lineWidth: { top: 1, bottom: 1 },
                    lineColor: [229, 231, 235],
                },
                footStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [17, 24, 39],
                    fontStyle: 'bold',
                    halign: 'right',
                    lineWidth: { top: 1, bottom: 2 },
                    lineColor: [17, 24, 39],
                },
                alternateRowStyles: {
                    fillColor: [252, 252, 252],
                },
                columnStyles: {
                    0: { halign: 'center', cellWidth: 25 },
                    1: { halign: 'center', cellWidth: 30 },
                    2: { halign: 'left', cellWidth: 50 },
                    3: { halign: 'right', cellWidth: 25 },
                    4: { halign: 'right', cellWidth: 30 },
                },
                // Ensure CUSTOMER column header and body align identically
                didParseCell: function (data) {
                    // Force SAME alignment for header and body in CUSTOMER column
                    if (data.column.index === 2) {
                        data.cell.styles.halign = 'left';
                        data.cell.styles.cellPadding = 5; // keep symmetric padding
                    }
                },
                didDrawPage: function () {
                    const pageCount = doc.getNumberOfPages();
                    doc.setFontSize(9);
                    doc.setTextColor(156, 163, 175);
                    doc.text(`Page ${pageCount}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
                },
            });

            doc.save(`Orders_Report_${new Date().toISOString().split('T')[0]}.pdf`);

            setIsDownloadModalOpen(false);
            setFeedbackModal({
                isOpen: true,
                type: State.SUCCESS,
                message: 'PDF downloaded successfully!',
            });

        } catch (err) {
            setFeedbackModal({
                isOpen: true,
                type: State.ERROR,
                message: 'Failed to generate PDF.',
            });
        }
    };

    const downloadAsExcel = () => {
        try {
            const s = (font: any, fill?: any, alignment?: any, border?: any) => ({
                font: { name: 'Arial', ...font },
                fill: fill ?? {},
                alignment: alignment ?? { horizontal: 'center', vertical: 'center', wrapText: true },
                border: border ?? {},
            });
            const solidFill = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
            const allBorders = {
                top: { style: 'thin', color: { rgb: 'FED7AA' } },
                bottom: { style: 'thin', color: { rgb: 'FED7AA' } },
                left: { style: 'thin', color: { rgb: 'FED7AA' } },
                right: { style: 'thin', color: { rgb: 'FED7AA' } },
            };
            const bblr = {
                bottom: { style: 'thin', color: { rgb: 'FED7AA' } },
                left: { style: 'thin', color: { rgb: 'FED7AA' } },
                right: { style: 'thin', color: { rgb: 'FED7AA' } },
            };

            const generationDate = new Date().toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric',
            });

            const periodLabel = appliedFilters
                ? `Period: ${formatDate(appliedFilters.start)} – ${formatDate(appliedFilters.end)}`
                : 'Period: All';

            const COLS = [
                { header: '#', width: 6 },
                { header: 'Date', width: 16 },
                { header: 'Order ID', width: 28 },
                { header: 'Customer', width: 28 },
                { header: 'Items', width: 14 },
                { header: 'Amount (₹)', width: 26 },
            ];
            const colCount = COLS.length;

            // Row layout:
            // 0  → Title  (merged)
            // 1  → Meta   (merged)
            // 2  → blank spacer
            // 3  → Summary label (merged)
            // 4  → Summary values
            // 5  → blank spacer
            // 6  → Column headers
            // 7+ → Data rows
            // Last → Totals footer

            const dataStartRow = 7;
            const totalRows = dataStartRow + filteredSales.length + 1;
            const aoa: any[][] = Array.from({ length: totalRows }, () => Array(colCount).fill(null));

            // Row 0 – Title
            aoa[0][0] = 'Orders Report';

            // Row 1 – Meta
            aoa[1][0] = `Generated: ${generationDate}   |   ${periodLabel}   |   Orders: ${summary.totalTransactions}`;

            // Row 3 – Summary label
            aoa[3][0] = 'SUMMARY';

            // Row 4 – Summary values (single merged cell)
            aoa[4][0] = `Total Orders: ${summary.totalTransactions}   |   Total Sales: ₹${summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}   |   Items Sold: ${summary.totalItemsSold}`;

            // Row 6 – Column headers
            COLS.forEach((c, i) => { aoa[6][i] = c.header; });

            // Rows 7+ – Data
            filteredSales.forEach((sale, idx) => {
                const r = dataStartRow + idx;
                aoa[r][0] = idx + 1;
                aoa[r][1] = formatDate(sale.createdAt);
                aoa[r][2] = sale.invoiceNumber;
                aoa[r][3] = sale.partyName;
                aoa[r][4] = sale.items.reduce((sum, i) => sum + i.quantity, 0);
                aoa[r][5] = Math.round(sale.totalAmount);
            });

            // Footer row
            const footerRow = dataStartRow + filteredSales.length;
            aoa[footerRow][0] = 'TOTAL';
            aoa[footerRow][1] = `${filteredSales.length} orders`;
            aoa[footerRow][4] = summary.totalItemsSold;
            aoa[footerRow][5] = Math.round(summary.totalSales);

            // ── BUILD WORKSHEET ─────────────────────────────────────────────
            const worksheet = XLSX.utils.aoa_to_sheet(aoa);
            worksheet['!cols'] = COLS.map(c => ({ wch: c.width }));
            worksheet['!rows'] = [
                { hpt: 36 }, // 0 title
                { hpt: 20 }, // 1 meta
                { hpt: 8 }, // 2 spacer
                { hpt: 18 }, // 3 summary label
                { hpt: 22 }, // 4 summary values
                { hpt: 8 }, // 5 spacer
                { hpt: 28 }, // 6 headers
                ...filteredSales.map(() => ({ hpt: 20 })),
                { hpt: 24 }, // footer
            ];

            worksheet['!merges'] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
                { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
                { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
                { s: { r: footerRow, c: 1 }, e: { r: footerRow, c: 3 } },
            ];

            const style = (addr: string, st: any) => {
                if (!worksheet[addr]) worksheet[addr] = { t: 's', v: '' };
                worksheet[addr].s = st;
            };

            // Title (row 0) — deep orange
            style('A1', s(
                { sz: 16, bold: true, color: { rgb: 'FFFFFF' } },
                solidFill('EA580C'),
                { horizontal: 'center', vertical: 'center' },
            ));

            // Meta (row 1) — light orange tint
            style('A2', s(
                { sz: 9, italic: true, color: { rgb: '7C2D12' } },
                solidFill('FFEDD5'),
                { horizontal: 'center', vertical: 'center' },
            ));

            // Summary label (row 3)
            style('A4', s(
                { sz: 10, bold: true, color: { rgb: 'C2410C' } },
                solidFill('FFF7ED'),
                { horizontal: 'left', vertical: 'center' },
                allBorders,
            ));

            style('A5', s(
                { sz: 10, bold: true, color: { rgb: '9A3412' } },
                solidFill('FFF7ED'),
                { horizontal: 'center', vertical: 'center' },
                bblr,
            ));

            // Column headers (row 6) — dark orange header bar
            COLS.forEach((_c, i) => {
                const addr = XLSX.utils.encode_cell({ r: 6, c: i });
                style(addr, s(
                    { sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
                    solidFill('C2410C'),
                    { horizontal: i <= 3 ? 'left' : 'center', vertical: 'center' },
                    allBorders,
                ));
            });

            // Data rows
            filteredSales.forEach((_sale, idx) => {
                const r = dataStartRow + idx;
                const isAlt = idx % 2 === 1;
                const rowBg = solidFill(isAlt ? 'FFF7ED' : 'FFFFFF');

                for (let ci = 0; ci < colCount; ci++) {
                    const addr = XLSX.utils.encode_cell({ r, c: ci });
                    const isNumeric = ci === 4 || ci === 5;
                    style(addr, s(
                        { sz: 9, color: { rgb: '1E293B' } },
                        rowBg,
                        { horizontal: isNumeric ? 'center' : 'left', vertical: 'center' },
                        bblr,
                    ));
                    if (ci === 5 && worksheet[addr]) {
                        worksheet[addr].t = 'n';
                        worksheet[addr].z = '₹#,##0.00';
                    }
                }
            });

            // Footer row
            for (let ci = 0; ci < colCount; ci++) {
                const addr = XLSX.utils.encode_cell({ r: footerRow, c: ci });
                style(addr, s(
                    { sz: 10, bold: true, color: { rgb: '1E293B' } },
                    solidFill('FED7AA'),
                    { horizontal: ci <= 3 ? 'left' : 'center', vertical: 'center' },
                    {
                        top: { style: 'medium', color: { rgb: '1E293B' } },
                        bottom: { style: 'medium', color: { rgb: '1E293B' } },
                        left: { style: 'thin', color: { rgb: 'FED7AA' } },
                        right: { style: 'thin', color: { rgb: 'FED7AA' } },
                    },
                ));
                if (ci === 5 && worksheet[addr]) {
                    worksheet[addr].t = 'n';
                    worksheet[addr].z = '₹#,##0.00';
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders Report');
            XLSX.writeFile(workbook, `Orders-Report-${formatDate(appliedFilters!.start)}-to-${formatDate(appliedFilters!.end)}.xlsx`);

            setIsDownloadModalOpen(false);
            setFeedbackModal({
                isOpen: true,
                type: State.SUCCESS,
                message: 'Excel downloaded successfully!',
            });
        } catch {
            setFeedbackModal({
                isOpen: true,
                type: State.ERROR,
                message: 'Failed to generate Excel file.',
            });
        }
    };

    if (isLoading || authLoading) return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
            <Spinner size="xl" />
            <p className="text-sm font-medium">Loading...</p>
        </div>
    );
    if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

    return (
        <div className="min-h-screen bg-muted p-2 pb-16">

            {feedbackModal.isOpen && (
                <Modal
                    type={feedbackModal.type}
                    message={feedbackModal.message}
                    onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
                    showConfirmButton={false}
                />
            )}

            <DownloadChoiceModal
                isOpen={isDownloadModalOpen}
                onClose={() => setIsDownloadModalOpen(false)}
                onDownloadPdf={downloadAsPdf}
                onDownloadExcel={downloadAsExcel}
            />

            <div className="flex items-center justify-between pb-3 border-b mb-2">
                <BackButton />

                {/* TITLE */}
                <h1 className="flex-1 text-xl text-center font-bold text-foreground">
                    Orders Report (Completed)
                </h1>

                <button
                    onClick={() => setShowSearch(true)}
                    className="p-2"
                >
                    <IconSearch />
                </button>

            </div>

            {showSearch && (
                <div className="flex justify-center mb-2 px-2">

                    <div className="flex items-center w-full max-w-md border-b-2 border-border focus-within:border-[#F97316]">

                        {/* INPUT */}
                        <input
                            type="text"
                            placeholder="Search by Order ID, Customer..."
                            className="flex-1 text-base font-light p-2 outline-none bg-transparent text-center"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />

                        {/* ❌ CLOSE BUTTON (INPUT KE ANDAR RIGHT SIDE) */}
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setShowSearch(false);
                            }}
                            className="p-1 text-muted-foreground hover:text-foreground"
                        >
                            <IconClose />
                        </button>

                    </div>

                </div>
            )}

            <div className="bg-card p-2 rounded-sm shadow-md mb-2">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <FilterSelect value={datePreset} onChange={(e) => handleDatePresetChange(e.target.value)}>
                        <option value="today">Today</option>
                        <option value="yesterday">Yesterday</option>
                        <option value="last7">Last 7 Days</option>
                        <option value="last30">Last 30 Days</option>
                        <option value="custom">Custom</option>
                    </FilterSelect>
                    <div className='grid grid-cols-2 sm:grid-cols-2 gap-4'>
                        <input type="date" value={customStartDate} onChange={e => { setCustomStartDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-muted border rounded-sm" placeholder="Start Date" />
                        <input type="date" value={customEndDate} onChange={e => { setCustomEndDate(e.target.value); setDatePreset('custom'); }} className="w-full p-2 text-sm bg-muted border rounded-sm" placeholder="End Date" />
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

            <div className="bg-card p-4 rounded-sm shadow-md flex justify-between items-center">
                <h2 className="text-lg font-semibold text-foreground">Report Details</h2>
                <div className="flex items-center space-x-3">
                    <button onClick={() => setIsListVisible(!isListVisible)} className="px-4 py-2 bg-muted text-foreground font-semibold rounded-sm hover:bg-slate-300 transition">{isListVisible ? 'Hide List' : 'Show List'}</button>

                    <button
                        onClick={() => {
                            if (filteredSales.length === 0) {
                                setFeedbackModal({
                                    isOpen: true,
                                    type: State.INFO,
                                    message: 'No data available to download.'
                                });
                            } else {
                                setIsDownloadModalOpen(true);
                            }
                        }}
                        className="px-4 py-2 bg-[#F97316] text-white font-semibold rounded-sm shadow-sm hover:bg-[#F97316]"
                    >
                        Download Report
                    </button>
                </div>
            </div>

            {isListVisible && <SalesListTable sales={filteredSales} sortConfig={sortConfig} onSort={handleSort} />}
        </div>
    );
};

export default OrdersReport;