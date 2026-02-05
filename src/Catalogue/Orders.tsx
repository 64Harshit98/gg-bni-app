import React, { useState, useEffect, useMemo, useRef } from 'react';
type IconProps = React.SVGProps<SVGSVGElement>;
import { ACTION } from '../enums/action.enum'
import { generatePdf } from '../UseComponents/pdfGenerator'
import type { InvoiceData } from '../UseComponents/pdfGenerator';
import { useLocation } from 'react-router-dom';
import { db } from '../lib/Firebase';
import QRCode from 'react-qr-code';
import {
    collection,
    query,
    onSnapshot,
    Timestamp,
    QuerySnapshot,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    orderBy,
    where,
    serverTimestamp,
    runTransaction
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { CustomCard } from '../Components/CustomCard';
import { Spinner } from '../constants/Spinner';
import { Modal, PaymentModal } from '../constants/Modal';
import { State } from '../enums';
import { FiSearch, FiX } from 'react-icons/fi';

export interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    mrp: number;
}

export type OrderStatus = 'Upcoming' | 'Confirmed' | 'Packed' | 'Completed' | 'Paid';

export interface Order {
    id: string;
    orderId: string;
    totalAmount: number;
    userName: string;
    status: OrderStatus;
    paidAmount?: number;
    createdAt: Date;
    time: string;
    items?: OrderItem[];
    billingDetails?: {
        address: string;
        phone: string;
        name: string;
    };
    shippingDetails?: any;
    userEmail?: string;
    userLoginPhone?: string
}

const formatDate = (date: Date | null): string => {
    if (!date) return 'N/A';
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

export const useOrdersData = (
    companyId?: string,
    startDate?: Date | null,
    endDate?: Date | null
) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!companyId) {
            setLoading(false);
            setOrders([]);
            return;
        }

        setLoading(true);
        let ordersQuery;
        const baseQuery = collection(db, 'companies', companyId, 'Orders');

        if (startDate && endDate) {
            const start = Timestamp.fromDate(startDate);
            const end = Timestamp.fromDate(endDate);
            ordersQuery = query(
                baseQuery,
                where('createdAt', '>=', start),
                where('createdAt', '<=', end),
                orderBy('createdAt', 'desc')
            );
        } else {
            ordersQuery = query(baseQuery, orderBy('createdAt', 'desc'));
        }

        const unsubscribe = onSnapshot(ordersQuery, (snapshot: QuerySnapshot) => {
            const ordersData = snapshot.docs.map((doc): Order => {
                const data = doc.data();
                const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();

                return {
                    id: doc.id,
                    orderId: data.orderId || doc.id,
                    totalAmount: data.totalAmount || 0,
                    paidAmount: data.paidAmount || 0,
                    userName: data.userName || data.name || (data.billingDetails && data.billingDetails.name) || 'Anonymous',
                    userEmail: data.userEmail || data.email || 'No Email',
                    userLoginPhone: data.userLoginPhone || data.phone || (data.billingDetails && data.billingDetails.phone) || 'N/A',
                    billingDetails: data.billingDetails || {
                        address: data.address || 'N/A',
                        phone: data.phone || data.userPhone || 'N/A',
                        name: data.userName || 'N/A'
                    },
                    shippingDetails: data.shippingDetails || null,
                    status: data.status || 'Confirmed',
                    createdAt: createdAt,
                    time: formatDate(createdAt),
                    items: (data.items || []).map((item: any) => ({
                        id: item.id || '',
                        name: item.name || 'N/A',
                        quantity: item.quantity || 0,
                        mrp: item.mrp || 0,
                    })),
                };
            });
            setOrders(ordersData);
            setLoading(false);
        }, (err) => {
            console.error("Error fetching orders:", err);
            setError("Failed to load orders data.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [companyId, startDate, endDate]);

    return { orders, loading, error };
};

const getDateRange = (filter: string, customStart?: Date | null, customEnd?: Date | null) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    switch (filter) {
        case 'today':
            return { start, end };
        case 'yesterday':
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
            return { start, end };
        case 'last7':
            start.setDate(start.getDate() - 7);
            return { start, end };
        case 'last30':
            start.setDate(start.getDate() - 30);
            return { start, end };
        case 'custom':
            return { start: customStart || null, end: customEnd || null };
        default:
            return { start, end };
    }
};

const OrdersPage: React.FC = () => {
    const orderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed', 'Paid'];
    const filterRef = useRef<HTMLDivElement>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [activeDateFilter, setActiveDateFilter] = useState<string>('today');
    const location = useLocation();
    const defaultStatus = (location.state?.defaultStatus as OrderStatus) || 'Confirmed';
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [showPaymentModal, setShowPaymentModal] = useState<Order | null>(null);
    const [activeStatusTab, setActiveStatusTab] = useState<OrderStatus>(defaultStatus);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
    const [selectedOrderForAction, setSelectedOrderForAction] = useState<Order | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
    const [showQrModal, setShowQrModal] = useState<Order | null>(null);
    const [dateRange, setDateRange] = useState<{ start: Date | null, end: Date | null }>({
        start: new Date(new Date().setHours(0, 0, 0, 0)),
        end: new Date(new Date().setHours(23, 59, 59, 999))
    });

    const { currentUser } = useAuth();
    const { orders, loading: dataLoading, error } = useOrdersData(
        currentUser?.companyId,
        dateRange.start,
        dateRange.end
    );

    const dateFilters = [
        { label: 'Today', value: 'today' },
        { label: 'Yesterday', value: 'yesterday' },
        { label: 'Last 7 Days', value: 'last7' },
        { label: 'Last 30 Days', value: 'last30' },
        { label: 'Custom Range', value: 'custom' },
    ];

    const handleDateFilterSelect = (value: string) => {
        setActiveDateFilter(value);
        if (value !== 'custom') {
            const range = getDateRange(value);
            setDateRange(range);
            setIsFilterOpen(false);
        }
    };

    const handleApplyCustomDate = () => {
        if (customDateRange.start && customDateRange.end) {
            setDateRange({
                start: new Date(customDateRange.start),
                end: new Date(new Date(customDateRange.end).setHours(23, 59, 59))
            });
            setIsFilterOpen(false);
        }
    };

    useEffect(() => {
        const fetchCompanyInfo = async () => {
            if (currentUser?.companyId) {
                const companyRef = doc(db, 'companies', currentUser.companyId);
                const companySnap = await getDoc(companyRef);
                if (companySnap.exists()) {
                    setCompanyInfo(companySnap.data());
                }
            }
        };
        fetchCompanyInfo();
    }, [currentUser]);

    const handlePdfAction = async (order: Order, action: ACTION) => {
        setIsGeneratingPdf(true);
        try {
            const data: InvoiceData = {
                companyName: companyInfo?.name || "Your Store",
                companyAddress: companyInfo?.address || "Store Address",
                companyContact: companyInfo?.ownerPhoneNumber || "Phone",
                companyEmail: companyInfo?.email || "",
                billTo: {
                    name: order.userName || "Customer",
                    address: order.billingDetails?.address || "N/A",
                    phone: order.billingDetails?.phone || "N/A",
                },
                invoice: {
                    number: order.orderId,
                    date: order.time,
                    billedBy: "Admin",
                },
                items: (order.items || []).map((item, index) => ({
                    sno: index + 1,
                    name: item.name,
                    hsn: "8517",
                    quantity: item.quantity,
                    unit: "PCS",
                    listPrice: item.mrp,
                    gstPercent: 18,
                    discountAmount: 0,
                })),
                terms: "1. Goods once sold will not be taken back.",
                finalAmount: order.totalAmount,
                bankDetails: {
                    accountName: companyInfo?.name,
                    accountNumber: companyInfo?.accountNo,
                    bankName: companyInfo?.bankBranch,
                    gstin: companyInfo?.gstin
                }
            };
            await generatePdf(data, action);
            setSelectedOrderForAction(null);
        } catch (err) {
            setModal({ message: "Failed to generate PDF", type: State.ERROR });
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handleShareBill = async (order: Order) => {
        setIsGeneratingPdf(true);
        try {
            const data: InvoiceData = {
                companyName: companyInfo?.name || "Your Store",
                companyAddress: companyInfo?.address || "Store Address",
                companyContact: companyInfo?.ownerPhoneNumber || "Phone",
                companyEmail: companyInfo?.email || "",
                billTo: {
                    name: order.userName || "Customer",
                    address: order.billingDetails?.address || "N/A",
                    phone: order.billingDetails?.phone || "N/A",
                },
                invoice: {
                    number: order.orderId,
                    date: order.time,
                    billedBy: "Admin",
                },
                items: (order.items || []).map((item, index) => ({
                    sno: index + 1,
                    name: item.name,
                    hsn: "8517",
                    quantity: item.quantity,
                    unit: "PCS",
                    listPrice: item.mrp,
                    gstPercent: 18,
                    discountAmount: 0,
                })),
                terms: "1. Goods once sold will not be taken back.",
                finalAmount: order.totalAmount,
                bankDetails: {
                    accountName: companyInfo?.name,
                    accountNumber: companyInfo?.accountNo,
                    bankName: companyInfo?.bankBranch,
                    gstin: companyInfo?.gstin
                }
            };
            const pdfBlob = await generatePdf(data, ACTION.BLOB);
            if (!pdfBlob || !(pdfBlob instanceof Blob)) throw new Error("PDF generation failed");
            const file = new File([pdfBlob], `Bill_${order.orderId}.pdf`, { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `Invoice #${order.orderId}`,
                    text: `Hi ${order.userName}, your bill is ready.`,
                });
            } else {
                const billUrl = `${window.location.origin}/download-bill/${currentUser?.companyId}/${order.id}`;
                const message = `*Invoice from ${companyInfo?.name}*%0A*Amount:* ₹${order.totalAmount}%0A*Download:* ${billUrl}`;
                window.open(`https://wa.me/${order.billingDetails?.phone?.replace(/\D/g, '')}?text=${message}`, '_blank');
            }
        } catch (err) {
            console.error("Sharing error:", err);
            alert("Sharing failed. Please use Download option.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const statusCounts = useMemo(() => {
        return orderStatuses.reduce((acc, status) => {
            acc[status] = orders.filter(o => o.status === status).length;
            return acc;
        }, {} as Record<OrderStatus, number>);
    }, [orders]);

    // (All other logic and JSX in OrdersPage.tsx remains the same as you provided)
    // ...
    const filteredOrders = useMemo(() => {
        return orders
            .filter(order => order.status === activeStatusTab)
            .filter(order => {
                const lowerCaseQuery = searchQuery.toLowerCase();
                return (
                    order.orderId.toLowerCase().includes(lowerCaseQuery) ||
                    order.userName.toLowerCase().includes(lowerCaseQuery)
                );
            });
    }, [orders, activeStatusTab, searchQuery]);

    const handleOrderClick = (uiKey: string) => {
        setExpandedOrderId(prevId => (prevId === uiKey ? null : uiKey));
    };

    const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
        const currentIndex = orderStatuses.indexOf(currentStatus);
        if (currentIndex === -1 || currentIndex === orderStatuses.length - 1) {
            return null;
        }
        return orderStatuses[currentIndex + 1];
    };

    const handleDeleteOrder = async (orderId: string) => {
        const confirmDelete = window.confirm("Are you sure you want to delete this entire order?");
        if (!confirmDelete || !currentUser?.companyId) return;
        try {
            const orderDocRef = doc(db, 'companies', currentUser.companyId, 'Orders', orderId);
            await deleteDoc(orderDocRef);
            setModal({ message: "Order deleted successfully", type: State.SUCCESS });
        } catch (err) {
            setModal({ message: "Failed to delete order", type: State.ERROR });
        }
    };

    const handleUpdateStatus = async (orderId: string, currentStatus: OrderStatus) => {
        const nextStatus = getNextStatus(currentStatus);
        if (!nextStatus || isUpdatingStatus === orderId || !currentUser?.companyId) return;
        setIsUpdatingStatus(orderId);
        try {
            const orderDocRef = doc(db, 'companies', currentUser.companyId, 'Orders', orderId);
            await updateDoc(orderDocRef, {
                status: nextStatus,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Error updating order status:", err);
            setModal({ message: `Failed to update status: ${err instanceof Error ? err.message : 'Unknown error'}`, type: State.ERROR });
        } finally {
            setIsUpdatingStatus(null);
        }
    };


    const handleSettleOrderPayment = async (order: any, amountPaidNow: number, method: string) => {
        if (!currentUser?.companyId) return;
        try {
            const orderRef = doc(db, 'companies', currentUser.companyId, 'Orders', order.id);
            await runTransaction(db, async (transaction) => {
                const orderDoc = await transaction.get(orderRef);
                if (!orderDoc.exists()) throw "Order not found!";
                const data = orderDoc.data();
                const totalToPay = Number(data.totalAmount || 0);
                const alreadyPaid = Number(data.paidAmount || 0);
                const enteringAmount = Number(amountPaidNow || 0);
                const newPaidTotal = alreadyPaid + enteringAmount;
                const isFullyPaid = Math.round(newPaidTotal) >= Math.round(totalToPay);
                const newStatus = isFullyPaid ? 'Paid' : 'Completed';
                transaction.update(orderRef, {
                    paidAmount: newPaidTotal,
                    status: newStatus,
                    [`paymentMethods.${method}`]: (data.paymentMethods?.[method] || 0) + enteringAmount,
                    updatedAt: serverTimestamp()
                });
            });
            setModal({ message: "Payment updated successfully!", type: State.SUCCESS });
            setShowPaymentModal(null);
        } catch (err: any) {
            setModal({ message: "Error: " + err.toString(), type: State.ERROR });
        }
    };

    const IconFilter: React.FC<IconProps> = (props) => (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6" {...props}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.572a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
        </svg>
    );

    return (
        <div className="flex min-h-screen w-full flex-col overflow-hidden bg-gray-100 mb-10">
            {modal && <Modal message={modal.message} type={modal.type} onClose={() => setModal(null)} />}

            {/* Header */}
            <div className="flex items-center justify-between p-4 px-6 bg-white shadow-sm sticky top-0 z-10">
                <div className="flex flex-1 items-center">
                    <button onClick={() => setShowSearch(!showSearch)} className="text-slate-500 mr-4">
                        {showSearch ? <FiX className="w-6 h-6" /> : <FiSearch className="w-6 h-6" />}
                    </button>
                    <div className="flex-1">
                        {!showSearch ? (
                            <div className='flex items-center justify-center'>
                                <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
                            </div>
                        ) : (
                            <input
                                type="text"
                                placeholder="Search by Order ID or Customer Name..."
                                className="w-full text-base font-light p-1 border-b-2 border-slate-300 focus:border-slate-800 outline-none transition-colors bg-transparent"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />)}
                    </div>
                    <div className="relative pl-4" ref={filterRef}>
                        <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="text-slate-500 hover:text-slate-800 transition-colors">
                            <IconFilter />
                        </button>
                        {isFilterOpen && (
                            <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-md shadow-lg z-20 border p-3">
                                <ul className="py-1 border-b mb-2">
                                    {dateFilters.map((filter) => (
                                        <li key={filter.value}>
                                            <button onClick={() => handleDateFilterSelect(filter.value)} className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === filter.value ? 'bg-orange-50 text-orange-600 font-bold' : 'text-slate-700'} hover:bg-slate-50`}>
                                                {filter.label}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                                {activeDateFilter === 'custom' && (
                                    <div className="space-y-2 mt-2">
                                        <input type="date" className="text-xs p-1.5 border rounded w-full outline-orange-500" onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })} />
                                        <input type="date" className="text-xs p-1.5 border rounded w-full outline-orange-500" onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })} />
                                        <button onClick={handleApplyCustomDate} className="w-full bg-orange-500 text-white py-1.5 rounded text-xs font-bold mt-2">Apply Filter</button>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* FIXED STEPPER SECTION: NO SCROLL, FULL WIDTH, FULL NAMES */}
            <div className="flex items-center w-full px-2 md:px-10 pt-12 pb-10 bg-white shadow-sm sticky top-[calc(4rem+1px)] overflow-hidden">
                {orderStatuses.map((status, index) => {
                    const activeIndex = orderStatuses.indexOf(activeStatusTab);
                    const isCompleted = index < activeIndex;
                    const isActive = index === activeIndex;
                    const count = statusCounts[status] || 0;

                    return (
                        <React.Fragment key={status}>
                            <div
                                className="relative flex flex-col items-center flex-1 min-w-0 cursor-pointer"
                                onClick={() => setActiveStatusTab(status)}
                            >
                                <span className={`absolute ${index % 2 === 0 ? 'bottom-full mb-3' : 'top-full mt-3'} text-center text-[8px] sm:text-[10px] md:text-[11px] uppercase tracking-tighter sm:tracking-wider ${isActive ? 'text-orange-600 font-black' : 'text-gray-400 font-bold'} whitespace-nowrap`}>
                                    {status}
                                </span>

                                <div className={`
                                    w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10 border-[2px] md:border-[3px] 
                                    ${isCompleted || isActive ? 'bg-orange-500 border-orange-200 text-white' : 'bg-gray-200 border-gray-300 text-gray-500'} 
                                    ${isActive ? 'scale-110 md:scale-125 shadow-md ring-2 md:ring-4 ring-orange-100' : ''}
                                `}>
                                    <span className="text-[10px] md:text-xs font-black">
                                        {count}
                                    </span>
                                </div>
                            </div>
                            {index < orderStatuses.length - 1 && (
                                <div className={`flex-auto h-0.5 md:h-1.5 transition-colors duration-500 ${index < activeIndex ? 'bg-orange-500' : 'bg-gray-200'}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Date Filter Label */}
            <div className="relative flex justify-center items-center py-4 bg-gray-100">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300"></div></div>
                <div className="relative bg-gray-100 px-4">
                    <span className="text-sm font-bold text-gray-500 capitalize tracking-wide">
                        {activeDateFilter === 'custom' ? `${customDateRange.start || '...'} to ${customDateRange.end || '...'}` : activeDateFilter.replace('last', 'Last ')}
                    </span>
                </div>
            </div>

            {/* Orders List Content */}
            <div className="flex-grow overflow-y-auto bg-slate-100 space-y-3 p-2 md:p-4">
                {dataLoading ? <div className="flex justify-center py-10"><Spinner /></div> :
                    error ? <p className="p-8 text-center text-red-500">{error}</p> :
                        filteredOrders.length > 0 ? filteredOrders.map((order) => {
                            const isExpanded = expandedOrderId === order.id;
                            const isCompletedStatus = order.status === 'Completed';
                            const isPaidStatus = order.status === 'Paid';
                            const isUpcomingStatus = order.status === 'Upcoming';
                            const total = Number(order.totalAmount || 0);
                            const paid = Number(order.paidAmount || 0);
                            const due = total - paid;

                            return (
                                <CustomCard key={order.id} onClick={() => handleOrderClick(order.id)} className="p-4 mb-3 bg-white shadow-sm border border-gray-100 rounded-lg cursor-pointer">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-800">{order.orderId}</h3>
                                            <p className="text-gray-600 text-xs font-medium">{order.userName}</p>
                                            <p className="text-[10px] text-gray-400 mt-1">{order.time}</p>
                                            {isUpcomingStatus && (
                                                <div className="mt-2 p-2 bg-blue-50 rounded border border-dashed border-blue-200">
                                                    <p className="text-[8px] font-black text-blue-500 uppercase">Customer Contact</p>
                                                    <p className="text-[10px] text-slate-700 font-bold">{order.userEmail}</p>
                                                    <p className="text-[10px] text-slate-700 font-bold">{order.userLoginPhone}</p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="text-right flex flex-col items-end">
                                            <div className="flex items-center gap-2">
                                                {/* Yahan changes hain: Completed tab mein 'due' dikhayenge, baaki mein total/paid */}
                                                <p className="text-[18px] font-bold text-black">
                                                    ₹{activeStatusTab === 'Completed'
                                                        ? due.toFixed(2)
                                                        : (order.status === 'Confirmed' || order.status === 'Packed' || order.status === 'Upcoming')
                                                            ? total.toFixed(2)
                                                            : paid.toFixed(2)
                                                    }
                                                </p>
                                                <svg
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    strokeWidth={2.5}
                                                    stroke="currentColor"
                                                    className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                                >
                                                    <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                </svg>
                                            </div>
                                            <p className="text-[11px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded mt-1">
                                                Items: {order.items?.length || 0}
                                            </p>

                                            {/* Optional: Pehchan ke liye ki ye due amount hai */}
                                            {activeStatusTab === 'Completed' && (
                                                <p className="text-[8px] font-black text-red-500 uppercase mt-0.5 tracking-tighter">
                                                    Due Balance
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="mt-4 border-t pt-4">
                                            {/* Address Section - New Added */}
                                            <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b">
                                                <div className="space-y-1">
                                                    <p className="text-[8px] font-black text-orange-500 uppercase">Billing Address</p>
                                                    <p className="text-[11px] font-bold text-slate-800">{order.billingDetails?.name}</p>
                                                    <p className="text-[10px] text-gray-500 leading-tight">{order.billingDetails?.address}</p>
                                                    <p className="text-[10px] text-gray-500">{order.billingDetails?.phone}</p>
                                                </div>
                                                <div className="space-y-1 border-l pl-4">
                                                    <p className="text-[8px] font-black text-blue-500 uppercase">Shipping Address</p>
                                                    <p className="text-[11px] font-bold text-slate-800">{order.shippingDetails?.name || order.billingDetails?.name}</p>
                                                    <p className="text-[10px] text-gray-500 leading-tight">{order.shippingDetails?.address || order.billingDetails?.address}</p>
                                                    <p className="text-[10px] text-gray-500">{order.shippingDetails?.phone || order.billingDetails?.phone}</p>
                                                </div>
                                            </div>

                                            {/* Items Section (Wahi purana) */}
                                            <div className="space-y-1 mb-4">
                                                {order.items?.map((item, idx) => (
                                                    <div key={idx} className="flex justify-between p-1">
                                                        <div>
                                                            <p className="text-[11px] font-extrabold">{item.name}</p>
                                                            <p className="text-[10px] text-gray-500">₹{item.mrp}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-sm font-black">₹{item.mrp * item.quantity}</p>
                                                            <p className="text-[11px] text-slate-500">Qty: {item.quantity}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Payment Summary */}
                                            <div className='flex justify-end gap-3 p-1.5 border rounded-md'>
                                                <div className="text-right border-r pr-3">
                                                    <p className="text-[8px] font-bold text-green-600 uppercase">Paid</p>
                                                    <p className="text-[11px] font-black text-green-700">₹{paid.toFixed(2)}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[8px] font-bold text-red-600 uppercase">Due</p>
                                                    <p className="text-[11px] font-black text-red-700">₹{due.toFixed(2)}</p>
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className={`grid ${isPaidStatus || isCompletedStatus ? 'grid-cols-3' : 'grid-cols-4'} gap-3 pt-6 mt-1 border-t`}>
                                                <button onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.id); }} className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm">Delete</button>
                                                {isPaidStatus ? <button className="py-2.5 bg-orange-500 text-white text-xs font-bold rounded-sm">Return</button> :
                                                    isCompletedStatus ? <button onClick={(e) => { e.stopPropagation(); setShowPaymentModal(order); }} className="py-2.5 bg-green-600 text-white text-xs font-bold rounded-sm">Settle</button> :
                                                        <button className="py-2.5 bg-[#8E8E93] text-white text-xs font-bold rounded-sm">Edit</button>}
                                                <button onClick={(e) => { e.stopPropagation(); setSelectedOrderForAction(order); }} className="py-2.5 bg-black text-white text-xs font-bold rounded-sm">Print</button>
                                                {!isPaidStatus && !isCompletedStatus &&
                                                    <button onClick={(e) => { e.stopPropagation(); handleUpdateStatus(order.id, order.status); }} disabled={isUpdatingStatus === order.id} className="py-2.5 bg-[#00A2FF] text-white text-xs font-bold rounded-sm">
                                                        {isUpdatingStatus === order.id ? '...' : (isUpcomingStatus ? 'Confirm' : 'Next')}
                                                    </button>}
                                            </div>
                                        </div>
                                    )}
                                </CustomCard>
                            );
                        }) : <p className="p-8 text-center text-slate-500">No orders found.</p>}
            </div>

            {/* Modals (Action, QR, Payment) */}
            {selectedOrderForAction && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedOrderForAction(null)}>
                    <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4">Select Action</h3>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => { handleShareBill(selectedOrderForAction); setSelectedOrderForAction(null); }} className="w-full bg-[#25D366] text-white py-2.5 rounded-md font-bold flex items-center justify-center gap-2">Share on WhatsApp</button>
                            <button onClick={() => handlePdfAction(selectedOrderForAction, ACTION.DOWNLOAD)} className="w-full bg-blue-600 text-white py-2.5 rounded-md font-bold">{isGeneratingPdf ? <Spinner /> : 'Download PDF'}</button>
                            <button onClick={() => handlePdfAction(selectedOrderForAction, ACTION.PRINT)} className="w-full border py-2.5 rounded-md font-bold">Print Directly</button>
                            <button onClick={() => setShowQrModal(selectedOrderForAction)} className="w-full bg-gray-900 text-white py-2.5 rounded-md font-bold">Generate QR Code</button>
                        </div>
                    </div>
                </div>
            )}

            {showQrModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl p-6 w-full max-w-sm flex flex-col items-center relative">
                        <button onClick={() => setShowQrModal(null)} className="absolute top-4 right-4 text-gray-400"><FiX size={24} /></button>
                        <h3 className="text-xl font-bold mb-1">Download Bill</h3>
                        <p className="text-sm text-gray-500 mb-4">Invoice #{showQrModal.orderId}</p>
                        <div className="bg-white p-2 border rounded-lg mb-4"><QRCode value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${showQrModal.id}`} size={200} /></div>
                        <button onClick={() => setShowQrModal(null)} className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold">Close</button>
                    </div>
                </div>
            )}

            {showPaymentModal && (
                <PaymentModal
                    isOpen={!!showPaymentModal}
                    onClose={() => setShowPaymentModal(null)}
                    invoice={{
                        id: showPaymentModal.id,
                        invoiceNumber: showPaymentModal.orderId,
                        amount: Number(showPaymentModal.totalAmount) - Number(showPaymentModal.paidAmount || 0),
                        partyName: showPaymentModal.userName,
                        dueAmount: Number(showPaymentModal.totalAmount) - Number(showPaymentModal.paidAmount || 0),
                        time: showPaymentModal.time,
                        status: 'Unpaid',
                        type: 'Credit',
                        createdAt: new Date(),
                    }}
                    onSubmit={async (_inv, amount, method) => {
                        await handleSettleOrderPayment(showPaymentModal, amount, method);
                    }}
                />
            )}
        </div>
    );
};

export default OrdersPage;