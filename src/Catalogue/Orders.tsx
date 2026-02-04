import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ACTION } from '../enums/action.enum'
import { generatePdf } from '../UseComponents/pdfGenerator'
import type { InvoiceData } from '../UseComponents/pdfGenerator';
import { useLocation } from 'react-router-dom';
import { db } from '../lib/Firebase';
import QRCode from 'react-qr-code';
import SearchableItemInput from '../UseComponents/SearchIteminput';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../../src/constants/routes.constants';
import { GenericCartList } from '../Components/CartItem';
import { ItemEditDrawer } from '../Components/ItemDrawer';
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
    serverTimestamp
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
    note: string;
    tax?: number;
    itemGroupId?: number;
    purchasePrice?: number;
    stock?: number;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
    restockQuantity?: number;
    finalPrice?: number;
}

// 1. Updated Status Types
export type OrderStatus = 'Upcoming' | 'Confirmed' | 'Packed' | 'Completed' | 'Paid';

export interface Order {
    id: string;
    OrderId: string;
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
    userLoginPhone?: string;
    paymentMethod?: 'Cash' | 'UPI' | 'Card';
    paymentMethods?: { [key: string]: number };
    note?: string;
    manualDiscount?: number;
    discount?: number
}

const formatDate = (date: Date): string => {
    if (!date) return 'N/A';
    return date.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit'
    });
};

export const useOrdersData = (
    companyId?: string,
    startDate?: Date | null,
    endDate?: Date | null
) => {
    const [Orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!companyId) {
            setLoading(false);
            setOrders([]);
            return;
        }

        setLoading(true);
        const baseQuery = collection(db, 'companies', companyId, 'Orders');
        const OrdersQuery =
            startDate && endDate
                ? query(
                    baseQuery,
                    where('createdAt', '>=', Timestamp.fromDate(startDate)),
                    where('createdAt', '<=', Timestamp.fromDate(endDate)),
                    orderBy('createdAt', 'desc')
                )
                : query(baseQuery, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(OrdersQuery, (snapshot: QuerySnapshot) => {
            const OrdersData = snapshot.docs.map((doc): Order => {
                const data = doc.data();

                // FIX HERE
                const createdAt =
                    data.createdAt instanceof Timestamp
                        ? data.createdAt.toDate()
                        : new Date(0);

                return {
                    id: doc.id,
                    OrderId: data.OrderId || doc.id,
                    totalAmount: data.totalAmount || 0,
                    paidAmount: data.paidAmount || 0,
                    paymentMethods: data.paymentMethods || {},
                    paymentMethod: data.paymentMethod || '',
                    userName:
                        data.userName ||
                        (data.billingDetails && data.billingDetails.name) ||
                        'Anonymous',
                    userEmail: data.userEmail || 'No Email',
                    userLoginPhone:
                        data.userLoginPhone ||
                        (data.billingDetails && data.billingDetails.phone) ||
                        'N/A',
                    billingDetails: data.billingDetails,
                    shippingDetails: data.shippingDetails,
                    status: data.status || 'Upcoming',
                    createdAt,
                    time: formatDate(createdAt),
                    items: (data.items || []).map((item: any) => ({
                        id: item.id,
                        name: item.name,
                        quantity: item.quantity,
                        mrp: item.mrp,
                        note: item.note || ""
                    })),
                };
            });

            setOrders(OrdersData);
            setLoading(false);
        }, () => {
            setError('Failed to load Orders data.');
            setLoading(false);
        });

        return () => unsubscribe();
    }, [companyId, startDate, endDate]);

    return { Orders, loading, error };
};

const getDateRange = (filter: string, customStart?: Date | null, customEnd?: Date | null) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    switch (filter) {
        case 'today': return { start, end };
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
    const navigate = useNavigate();
    const OrderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];

    const filterRef = useRef<HTMLDivElement>(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const location = useLocation();

    const [activeStatusTab, setActiveStatusTab] = useState<OrderStatus>(
        (location.state?.defaultStatus as OrderStatus) || 'Confirmed'
    );

    const [activeDateFilter, setActiveDateFilter] = useState<string>('today');
    const [inventoryItems, setInventoryItems] = useState<any[]>([]);
    const [companyInfo, setCompanyInfo] = useState<any>(null);
    const [showPaymentModal, setShowPaymentModal] = useState<Order | null>(null);
    const [isEditDrawerOpen, setIsEditDrawerOpen] = useState(false);
    const [selectedItemForEdit, setSelectedItemForEdit] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);
    const [selectedOrderForAction, setSelectedOrderForAction] = useState<Order | null>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [activeTab, setActiveTab] = useState<'billing' | 'shipping'>('billing');
    const [paymentFilter, setPaymentFilter] = useState<'paid' | 'unpaid'>('unpaid');
    const [editingOrder, setEditingOrder] = useState<Order | null>(null);
    const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
    const [showQrModal, setShowQrModal] = useState<Order | null>(null);
    const [dateRange, setDateRange] = useState<{ start: Date | null, end: Date | null }>({
        start: new Date(new Date().setHours(0, 0, 0, 0)),
        end: new Date(new Date().setHours(23, 59, 59, 999))
    });

    const { currentUser } = useAuth();
    const { Orders, loading: dataLoading, error } = useOrdersData(
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


    const getDateDisplay = useMemo(() => {
        if (activeDateFilter === 'custom') {
            return `${customDateRange.start || '...'} to ${customDateRange.end || '...'}`;
        }

        const today = new Date();
        let start = new Date();
        let end = new Date();

        if (activeDateFilter === 'today') {
            return today.toLocaleDateString('en-GB'); // Format: DD/MM/YYYY
        }

        if (activeDateFilter === 'yesterday') {
            start.setDate(today.getDate() - 1);
            return start.toLocaleDateString('en-GB');
        }

        if (activeDateFilter === 'last7') {
            start.setDate(today.getDate() - 7);
        } else if (activeDateFilter === 'last30') {
            start.setDate(today.getDate() - 30);
        }

        // Format: "DD/MM/YYYY to DD/MM/YYYY"
        return `${start.toLocaleDateString('en-GB')} to ${end.toLocaleDateString('en-GB')}`;
    }, [activeDateFilter, customDateRange]);

    useEffect(() => {
        if (location.state?.defaultStatus) {
            setActiveStatusTab(location.state.defaultStatus);
        }
    }, [location.state]);

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

    useEffect(() => {
        if (!currentUser?.companyId) return;
        const itemsRef = collection(db, 'companies', currentUser.companyId, 'items');
        const unsubscribe = onSnapshot(itemsRef, (snapshot) => {
            setInventoryItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [currentUser?.companyId]);

    // const handleItemSelectInDrawer = (item: any) => {
    //     if (!editingOrder) return;

    //     const newItem: OrderItem = {
    //         id: item.id,
    //         name: item.name,
    //         mrp: Number(item.mrp),
    //         quantity: 1,
    //         note: ""
    //     };

    //     const updatedItems = [...(editingOrder.items || []), newItem];

    //     // Naya total calculate karo
    //     const newTotal = updatedItems.reduce((sum, i) => sum + (i.mrp * i.quantity), 0);

    //     setEditingOrder({
    //         ...editingOrder,
    //         items: updatedItems,
    //         totalAmount: newTotal
    //     });
    // };

    // PDF & Sharing Functions (Same as provided)
    const handlePdfAction = async (Order: Order, action: ACTION) => {
        setIsGeneratingPdf(true);
        try {
            const data: InvoiceData = {
                companyName: companyInfo?.name || "Your Store",
                companyAddress: companyInfo?.address || "Store Address",
                companyContact: companyInfo?.ownerPhoneNumber || "Phone",
                companyEmail: companyInfo?.email || "",
                billTo: {
                    name: Order.userName || "Customer",
                    address: Order.billingDetails?.address || "N/A",
                    phone: Order.billingDetails?.phone || "N/A",
                },
                invoice: { number: Order.OrderId, date: Order.time, billedBy: "Admin" },
                items: (Order.items || []).map((item, index) => ({
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
                finalAmount: Order.totalAmount,
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



    const handleShareBill = async (Order: Order) => {
        setIsGeneratingPdf(true);
        try {
            const data: InvoiceData = {
                companyName: companyInfo?.name || "Your Store",
                companyAddress: companyInfo?.address || "Store Address",
                companyContact: companyInfo?.ownerPhoneNumber || "Phone",
                companyEmail: companyInfo?.email || "",
                billTo: {
                    name: Order.userName || "Customer",
                    address: Order.billingDetails?.address || "N/A",
                    phone: Order.billingDetails?.phone || "N/A",
                },
                invoice: { number: Order.OrderId, date: Order.time, billedBy: "Admin" },
                items: (Order.items || []).map((item, index) => ({
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
                finalAmount: Order.totalAmount,
                bankDetails: {
                    accountName: companyInfo?.name,
                    accountNumber: companyInfo?.accountNo,
                    bankName: companyInfo?.bankBranch,
                    gstin: companyInfo?.gstin
                }
            };
            const pdfBlob = await generatePdf(data, ACTION.BLOB);
            if (!pdfBlob || !(pdfBlob instanceof Blob)) throw new Error("PDF generation failed");
            const file = new File([pdfBlob], `Bill_${Order.OrderId}.pdf`, { type: 'application/pdf' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `Invoice #${Order.OrderId}`,
                    text: `Hi ${Order.userName}, your bill is ready.`,
                });
            } else {
                const billUrl = `${window.location.origin}/download-bill/${currentUser?.companyId}/${Order.id}`;
                const message = `*Invoice from ${companyInfo?.name}*%0A*Amount:* ₹${Order.totalAmount}%0A*Download:* ${billUrl}`;
                window.open(`https://wa.me/${Order.billingDetails?.phone?.replace(/\D/g, '')}?text=${message}`, '_blank');
            }
        } catch (err) {
            console.error("Sharing error:", err);
            alert("Sharing failed. Please use Download option.");
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    // const handleAddPayment = async (amountToAdd: number, method: string = 'Cash') => {
    //     try {
    //         if (!currentUser?.companyId || !showPaymentModal?.id) return;

    //         const OrderRef = doc(db, 'companies', currentUser.companyId, 'Orders', showPaymentModal.id);

    //         const currentPaid = Number(showPaymentModal.paidAmount || 0);
    //         const newTotalPaid = currentPaid + Number(amountToAdd);

    //         await updateDoc(OrderRef, {
    //             paidAmount: newTotalPaid,
    //             paymentMethod: method, // Yeh field UI ke liye zaroori hai
    //             [`paymentMethods.${method}`]: (showPaymentModal.paymentMethods?.[method] || 0) + Number(amountToAdd)
    //         });

    //         setShowPaymentModal(null);
    //     } catch (err) {
    //         console.error("Error:", err);
    //     }
    // };

    const statusCounts = useMemo(() => {
        return OrderStatuses.reduce((acc, status) => {
            acc[status] = Orders.filter(o => o.status === status).length;
            return acc;
        }, {} as Record<string, number>);
    }, [Orders, OrderStatuses]);

    // 3. Simplified Filter (No toggle dependency)
    const filteredOrders = useMemo(() => {
        return Orders
            .filter(order => {
                // Sirf wahi orders dikhao jo current tab ke status se match karte ho
                const matchesStatus = order.status === activeStatusTab;

                // Completed tab ke andar Paid/Unpaid ka extra filter
                if (activeStatusTab === 'Completed') {
                    const due = (order.totalAmount || 0) - (order.paidAmount || 0);
                    if (paymentFilter === 'paid') return order.status === 'Completed' && due <= 0;
                    if (paymentFilter === 'unpaid') return order.status === 'Completed' && due > 0;
                }
                return matchesStatus;
            })
            .filter(order => {
                const searchLower = searchQuery.toLowerCase();
                return (
                    order.OrderId?.toLowerCase().includes(searchLower) ||
                    order.userName?.toLowerCase().includes(searchLower)
                );
            });
    }, [Orders, activeStatusTab, searchQuery, paymentFilter]);

    const handleOrderClick = (uiKey: string) => {
        setExpandedOrderId(prevId => (prevId === uiKey ? null : uiKey));
    };

    const handleDeleteOrder = async (OrderId: string) => {
        const confirmDelete = window.confirm("Are you sure you want to delete this entire Order?");
        if (!confirmDelete || !currentUser?.companyId) return;
        try {
            const OrderDocRef = doc(db, 'companies', currentUser.companyId, 'Orders', OrderId);
            await deleteDoc(OrderDocRef);
            setModal({ message: "Order deleted successfully", type: State.SUCCESS });
        } catch (err) {
            setModal({ message: "Failed to delete Order", type: State.ERROR });
        }
    };

    const handleUpdateStatus = async (OrderId: string, currentStatus: OrderStatus, manualNextStatus?: OrderStatus) => {
        setIsUpdatingStatus(OrderId);
        try {
            const nextStatusMap: Record<OrderStatus, OrderStatus> = {
                'Upcoming': 'Confirmed',
                'Confirmed': 'Packed',
                'Packed': 'Completed',
                'Completed': 'Paid',
                'Paid': 'Paid'
            };

            // Agar toggle se manualNextStatus aaya hai toh woh use karo
            const nextStatus = manualNextStatus || nextStatusMap[currentStatus];

            if (!currentUser?.companyId) return;
            const OrderRef = doc(db, 'companies', currentUser.companyId, 'Orders', OrderId);

            await updateDoc(OrderRef, {
                status: nextStatus,
                updatedAt: serverTimestamp()
            });
        } catch (err) {
            console.error("Error updating status:", err);
        } finally {
            setIsUpdatingStatus(null);
        }
    };

    // const handleSettleOrderPayment = async (Order: any, amountPaidNow: number, method: string) => {
    //     if (!currentUser?.companyId) return;
    //     try {
    //         const OrderRef = doc(db, 'companies', currentUser.companyId, 'Orders', Order.id);
    //         await runTransaction(db, async (transaction) => {
    //             const OrderDoc = await transaction.get(OrderRef);
    //             if (!OrderDoc.exists()) throw "Order not found!";

    //             const data = OrderDoc.data();
    //             const totalToPay = Number(data.totalAmount || 0);
    //             const alreadyPaid = Number(data.paidAmount || 0);
    //             const newPaidTotal = alreadyPaid + Number(amountPaidNow);
    //             const isFullyPaid = Math.round(newPaidTotal) >= Math.round(totalToPay);
    //             const newStatus = isFullyPaid ? 'Paid' : 'Completed';

    //             transaction.update(OrderRef, {
    //                 paidAmount: newPaidTotal,
    //                 status: newStatus,
    //                 // Yeh do lines sabse zaroori hain UI ke liye
    //                 paymentMethod: method,
    //                 [`paymentMethods.${method}`]: (data.paymentMethods?.[method] || 0) + Number(amountPaidNow),
    //                 updatedAt: serverTimestamp()
    //             });
    //         });
    //         setModal({ message: "Payment updated successfully!", type: State.SUCCESS });
    //         setShowPaymentModal(null);
    //     } catch (err: any) {
    //         setModal({ message: "Error: " + err.toString(), type: State.ERROR });
    //     }
    // };

    return (
        <div className="flex min-h-screen w-full flex-col bg-gray-100 mb-10">
            {modal && <Modal message={modal.message} type={modal.type} onClose={() => setModal(null)} />}

            {/* --- 5. UPDATED HEADER (No Toggle) --- */}
            <div className="bg-white shadow-sm sticky top-0 z-[100] px-4 py-2">
                {/* Main Header Row */}
                <div className="flex items-center justify-between">
                    {/* Left: Search Icon */}
                    <div className="w-10">
                        <button onClick={() => setShowSearch(!showSearch)} className="text-slate-500">
                            {showSearch ? <FiX className="w-6 h-6" /> : <FiSearch className="w-6 h-6" />}
                        </button>
                    </div>

                    {/* Center: Title & Search Input */}
                    <div className="flex-1 flex flex-col items-center justify-center">
                        {showSearch ? (
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full max-w-[200px] text-center text-sm font-light p-1 border-b border-slate-300 focus:border-slate-800 outline-none transition-colors bg-transparent"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                        ) : (
                            <h1 className="text-xl font-bold text-slate-800">Orders</h1>
                        )}

                        {/* Date Filter - Just below Header */}
                        <div className="mt-0.5">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                {getDateDisplay}
                            </span>
                        </div>
                    </div>

                    {/* Right: Filter Icon */}
                    <div className="w-10 flex justify-end">
                        <div className="relative" ref={filterRef}>
                            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="text-slate-500 hover:text-slate-800">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.572a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
                                </svg>
                            </button>

                            {isFilterOpen && (
                                <div className="absolute top-full right-0 mt-3 w-64 bg-white rounded-sm shadow-lg z-[1000] border p-3">
                                    <ul className="py-1 border-b mb-2">
                                        {dateFilters.map((filter) => (
                                            <li key={filter.value}>
                                                <button onClick={() => handleDateFilterSelect(filter.value)} className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === filter.value ? 'bg-orange-50 text-orange-600 font-bold' : 'text-slate-700'} hover:bg-slate-50`}>{filter.label}</button>
                                            </li>
                                        ))}
                                    </ul>
                                    {activeDateFilter === 'custom' && (
                                        <div className="space-y-2 mt-2">
                                            <input type="date" className="text-xs p-1.5 border rounded w-full" onChange={(e) => setCustomDateRange({ ...customDateRange, start: e.target.value })} />
                                            <input type="date" className="text-xs p-1.5 border rounded w-full" onChange={(e) => setCustomDateRange({ ...customDateRange, end: e.target.value })} />
                                            <button onClick={handleApplyCustomDate} className="w-full bg-orange-500 text-white py-1.5 rounded text-xs font-bold mt-2">Apply Filter</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* --- 6. UPDATED STEPPER SECTION --- */}
            <div className={`bg-white shadow-sm sticky z-[50] bOrder-b top-[72px]`}>
                <div className="flex items-center w-full px-2 md:px-10 pt-10 pb-8 overflow-x-auto no-scrollbar bg-white">
                    {OrderStatuses.map((status, index) => {
                        const activeIndex = OrderStatuses.indexOf(activeStatusTab);
                        const isCompleted = index < activeIndex;
                        const isActive = index === activeIndex;
                        const count = statusCounts[status] || 0;

                        return (
                            <React.Fragment key={status}>
                                <div
                                    className="relative flex flex-col items-center flex-1 min-w-0 cursor-pointer"
                                    onClick={() => setActiveStatusTab(status)}
                                >
                                    <span className={`absolute ${index % 2 === 0 ? 'bottom-full mb-2' : 'top-full mt-2'} 
                                        text-center text-[8px] sm:text-[10px] md:text-[11px] uppercase tracking-tighter 
                                        ${isActive ? 'text-orange-600 font-black' : 'text-gray-400 font-bold'} whitespace-nowrap`}
                                    >
                                        {status}
                                    </span>



                                    <div className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10 bOrder-[2px] md:bOrder-[3px] 
                                        ${isCompleted || isActive ? 'bg-orange-500 bOrder-orange-200 text-white' : 'bg-gray-200 bOrder-gray-300 text-gray-500'} 
                                        ${isActive ? 'scale-110 shadow-md ring-2 ring-orange-100' : ''}`}
                                    >
                                        <span className="text-[10px] md:text-xs font-black">{count}</span>
                                    </div>
                                </div>

                                {index < OrderStatuses.length - 1 && (
                                    <div className={`flex-auto h-0.5 md:h-1.5 transition-colors duration-500 ${index < activeIndex ? 'bg-orange-500' : 'bg-gray-200'}`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {activeStatusTab === 'Completed' && (
                <div className="sticky top-[178px] z-[90] flex p-1 bg-white mx-4 mt-2 rounded-sm shadow-sm border border-slate-200 max-w-md md:mx-auto w-[92%]">
                    {['unpaid', 'paid'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setPaymentFilter(f as any)}
                            className={`flex-1 py-2 text-[10px] font-black uppercase rounded-sm transition-all ${paymentFilter === f
                                ? 'bg-slate-800 text-white shadow-sm'
                                : 'text-slate-500'
                                }`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
            )}

            {/* --- 7. ORDERS LIST --- */}
            <div className="flex-grow overflow-y-hidden bg-slate-100 space-y-2 p-1 md:p-4">
                {dataLoading ? (
                    <div className="flex justify-center py-10"><Spinner /></div>
                ) : error ? (
                    <p className="p-8 text-center text-red-500">{error}</p>
                ) : filteredOrders.length > 0 ? (
                    filteredOrders.map((Order) => {
                        const isExpanded = expandedOrderId === Order.id;
                        // const isCompletedStatus = Order.status === 'Completed';
                        // const isPaidStatus = Order.status === 'Paid'; // Ab use ho raha hai
                        const isUpcomingStatus = Order.status === 'Upcoming';
                        const total = Number(Order.totalAmount || 0);
                        const paid = Number(Order.paidAmount || 0);
                        const due = total - paid;

                        return (
                            <CustomCard key={Order.id} onClick={() => handleOrderClick(Order.id)} className="p-5 mb-3 bg-white shadow-sm border border-gray-100 rounded-sm cursor-pointer relative">
                                <button
                                    onClick={(e) => { e.stopPropagation(); setEditingOrder(Order); }}
                                    className="absolute top-2 left-2 p-2 bg-white/90 backdrop-blur-sm text-slate-500 rounded-sm transition-all duration-300 shadow-md z-20 group"
                                >
                                    <div className="flex items-center gap-1">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3"><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" /></svg>
                                        <span className="text-[5px] font-bold uppercase hidden">Edit</span>
                                    </div>
                                </button>

                                <div className='absolute right-5 top-0'>
                                    {Order.paymentMethods && Object.keys(Order.paymentMethods).length > 0 ? (
                                        Object.keys(Order.paymentMethods).map((m) => (
                                            <span key={m} className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded border tracking-wider bg-blue-50 text-blue-600 border-blue-100 whitespace-nowrap">
                                                {m}
                                            </span>
                                        ))
                                    ) :
                                        /* 2. Fallback: Agar singular field ho (Purana Data) */
                                        Order.paymentMethods ? (
                                            <span className="text-[8px] uppercase font-bold px-1.5 py-0.5 rounded   tracking-wider text-blue-600 border-blue-100 whitespace-nowrap">
                                                {Order.paymentMethod}
                                            </span>
                                        ) : null
                                    }
                                </div>

                                <div className="flex justify-between items-start pl-6 mt-1">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-800">{Order.OrderId}</h3>
                                        <p className="text-gray-600 text-xs font-medium">{Order.userName}</p>
                                        <p className="text-[10px] text-gray-400 mt-1">{Order.time}</p>
                                        {isUpcomingStatus && (
                                            <div className="mt-2 p-2 bg-blue-50 rounded bOrder bOrder-dashed bOrder-blue-200">
                                                <p className="text-[8px] font-black text-blue-500 uppercase">Customer Contact</p>
                                                <p className="text-[10px] text-slate-700 font-bold">{Order.userEmail}</p>
                                                <p className="text-[10px] text-slate-700 font-bold">{Order.userLoginPhone}</p>
                                            </div>
                                        )}
                                    </div>


                                    <div className="text-right flex flex-col items-end">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[18px] font-bold text-black">₹{total.toFixed(2)}</p>
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><path d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                                        </div>
                                        <p className="text-[10px] font-boldpx-2 py-0.5 mt-1">Items: {Order.items?.length || 0}</p>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="mt-1 border-t pt-4">
                                        {/* Addresses Section */}
                                        <div className="grid grid-cols-2 gap-4 mb-1 pb-4 border-b">
                                            <div className="space-y-1">
                                                <p className="text-[8px] font-black text-orange-500 uppercase">Billing Address</p>
                                                <p className="text-[11px] font-bold text-slate-800">{Order.billingDetails?.name}</p>
                                                <p className="text-[10px] text-gray-500 leading-tight">{Order.billingDetails?.address}</p>
                                                <p className="text-[10px] text-gray-500">{Order.billingDetails?.phone}</p>
                                            </div>
                                            <div className="space-y-1 border-l pl-4">
                                                <p className="text-[8px] font-black text-blue-500 uppercase">Shipping Address</p>
                                                <p className="text-[11px] font-bold text-slate-800">{Order.shippingDetails?.name || Order.billingDetails?.name}</p>
                                                <p className="text-[10px] text-gray-500 leading-tight">{Order.shippingDetails?.address || Order.billingDetails?.address}</p>
                                                <p className="text-[10px] text-gray-500">{Order.shippingDetails?.phone}</p>
                                            </div>
                                        </div>

                                        {/* Items Section */}
                                        <div>
                                            {Order.items?.map((item, idx) => (
                                                <div key={idx} className="p-2">
                                                    <div className="flex justify-between items-start -mb-1">
                                                        <div className="flex-1">
                                                            <p className="text-[11px] font-extrabold text-slate-800 leading-tight mb-1">{item.name}</p>
                                                            {item.note && (
                                                                <p className="text-[9px] leading-tight flex items-baseline gap-1.5 mt-1 opacity-80">
                                                                    <span className="font-black uppercase tracking-widest font-xs">Note:</span>
                                                                    <span className="font-xs italic text-slate-600">{item.note}</span>
                                                                </p>
                                                            )}
                                                            <p className="text-[10px] text-gray-400">₹{item.mrp} per unit</p>
                                                        </div>
                                                        <div className="text-right ml-4">
                                                            <p className="text-[13px] font-black text-slate-900">₹{item.mrp * item.quantity}</p>
                                                            <p className="text-[9px] font-bold text-slate-500 bg-white">Qty: {item.quantity}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {/* Totals Section */}
                                            <div className="border-t mt-1 p-2 flex items-center justify-between">
                                                <div className="flex flex-wrap gap-1 items-center">
                                                    {(paid > 0) && (
                                                        Order.paymentMethods && Object.keys(Order.paymentMethods).length > 0 ? (
                                                            Object.entries(Order.paymentMethods).map(([method, amount]) => (
                                                                <div key={method} className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-green-100">
                                                                    <span className="text-[8px] font-bold text-green-800 uppercase">{method}:</span>
                                                                    <span className="text-[9px] font-black text-green-600">₹{Number(amount).toFixed(2)}</span>
                                                                </div>
                                                            ))
                                                        ) : <div className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-green-100">
                                                            <span className="text-[8px] font-bold text-green-800 uppercase">{Order.paymentMethod || 'Paid'}:</span>
                                                            <span className="text-[9px] font-black text-green-600">₹{paid.toFixed(2)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className='flex gap-3 items-center'>
                                                    <div className="text-right border-r border-slate-200 pr-3">
                                                        <p className="text-[7px] font-bold text-green-600 uppercase tracking-tighter leading-none mb-0.5">Paid</p>
                                                        <p className="text-[11px] font-black text-green-700 leading-none">₹{paid.toFixed(2)}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[7px] font-bold text-red-600 uppercase tracking-tighter leading-none mb-0.5">Due</p>
                                                        <p className="text-[11px] font-black text-red-700 leading-none">₹{due.toFixed(2)}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Buttons Section - Updated Grid & Logic */}
                                        <div className={`grid ${Order.status === 'Completed' ? 'grid-cols-3' : 'grid-cols-4'} gap-3 pt-6 border-t`}>
                                            {/* 1. Delete Button (Sabme dikhega) */}
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteOrder(Order.id); }} className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm">Delete</button>

                                            {Order.status === 'Completed' ? (
                                                /* Stage: COMPLETED (3 Buttons logic) */
                                                <>
                                                    {due > 0 ? (
                                                        // Unpaid section: Settle button
                                                        <button onClick={(e) => { e.stopPropagation(); setShowPaymentModal(Order); }} className="py-2.5 bg-blue-600 text-white text-xs font-bold rounded-sm">
                                                            Settle
                                                        </button>
                                                    ) : (
                                                        // Paid section: Return button
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                // Hum poora order object 'state' ke zariye bhej rahe hain
                                                                navigate(`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`, {
                                                                    state: { selectedOrder: Order }
                                                                });
                                                            }}
                                                            className="py-2.5 bg-orange-500 text-white text-xs font-bold rounded-sm px-4"
                                                        >
                                                            Return
                                                        </button>
                                                    )}
                                                    <button onClick={(e) => { e.stopPropagation(); setSelectedOrderForAction(Order); }} className="py-2.5 bg-black text-white text-xs font-bold rounded-sm">Print</button>
                                                </>
                                            ) : (
                                                /* Other Stages: Upcoming, Confirmed, Packed (4 Buttons logic) */
                                                <>
                                                    <button onClick={(e) => { e.stopPropagation(); setShowPaymentModal(Order); }} className="py-2.5 bg-green-600 text-white text-xs font-bold rounded-sm">
                                                        Advance
                                                    </button>
                                                    <button onClick={(e) => { e.stopPropagation(); setSelectedOrderForAction(Order); }} className="py-2.5 bg-black text-white text-xs font-bold rounded-sm">Print</button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(Order.id, Order.status); }}
                                                        disabled={isUpdatingStatus === Order.id}
                                                        className="py-2.5 text-white text-xs font-bold rounded-sm bg-[#00A2FF]"
                                                    >
                                                        {isUpdatingStatus === Order.id ? '...' : (Order.status === 'Upcoming' ? 'Confirm' : 'Next')}
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </CustomCard>
                        );
                    })
                ) : (
                    <p className="p-8 text-center text-slate-500">No Orders found.</p>
                )}
            </div>

            {/* Modals (SelectedAction, QR, Payment, Editing) Same as provided */}
            {selectedOrderForAction && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedOrderForAction(null)}>
                    <div className="bg-white rounded-sm p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-bold mb-4">Select Action</h3>
                        <div className="flex flex-col gap-3">
                            <button onClick={() => { handleShareBill(selectedOrderForAction); setSelectedOrderForAction(null); }} className="w-full bg-[#25D366] text-white py-2.5 rounded-sm font-bold flex items-center justify-center gap-2">Share on WhatsApp</button>
                            <button onClick={() => handlePdfAction(selectedOrderForAction, ACTION.DOWNLOAD)} className="w-full bg-blue-600 text-white py-2.5 rounded-sm font-bold">{isGeneratingPdf ? <Spinner /> : 'Download PDF'}</button>
                            <button onClick={() => handlePdfAction(selectedOrderForAction, ACTION.PRINT)} className="w-full bOrder py-2.5 rounded-sm font-bold">Print Directly</button>
                            <button onClick={() => setShowQrModal(selectedOrderForAction)} className="w-full bg-gray-900 text-white py-2.5 rounded-sm font-bold">Generate QR Code</button>
                        </div>
                    </div>
                </div>
            )}

            {showQrModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-sm p-6 w-full max-w-sm flex flex-col items-center relative">
                        <button onClick={() => setShowQrModal(null)} className="absolute top-4 right-4 text-gray-400"><FiX size={24} /></button>
                        <div className="bg-white p-2 bOrder rounded-sm mb-4"><QRCode value={`${window.location.origin}/download-bill/${currentUser?.companyId}/${showQrModal.id}`} size={200} /></div>
                        <button onClick={() => setShowQrModal(null)} className="w-full bg-blue-600 text-white py-3 rounded-sm font-semibold">Close</button>
                    </div>
                </div>
            )}

            {showPaymentModal && (
                <PaymentModal
                    isOpen={!!showPaymentModal}
                    onClose={() => setShowPaymentModal(null)}
                    invoice={{
                        id: showPaymentModal.id,
                        invoiceNumber: showPaymentModal.OrderId,
                        amount: Number(showPaymentModal.totalAmount),
                        partyName: showPaymentModal.userName,
                        dueAmount: Number(showPaymentModal.totalAmount) - Number(showPaymentModal.paidAmount || 0),
                        time: showPaymentModal.time,
                        status: 'Unpaid',
                        type: 'Credit',
                        createdAt: new Date(),
                    }}
                    onSubmit={async (_inv, amount, method) => {
                        try {
                            if (!currentUser?.companyId || !showPaymentModal) return;

                            const orderRef = doc(db, 'companies', currentUser.companyId, 'Orders', showPaymentModal.id);

                            // Naya method object banate hain
                            const currentMethods = showPaymentModal.paymentMethods || {};
                            // onSubmit ke andar ye change karo
                            const methodKey = method ? method.toUpperCase() : 'CASH';

                            const updatedMethods = {
                                ...currentMethods,
                                [methodKey]: (currentMethods[methodKey] || 0) + amount
                            };

                            // Database update
                            await updateDoc(orderRef, {
                                paidAmount: (showPaymentModal.paidAmount || 0) + amount,
                                paymentMethods: updatedMethods, // Ye data jayega tabhi card pe dikhega
                                updatedAt: serverTimestamp()
                            });

                            setShowPaymentModal(null);
                            setModal({ message: "Payment successful!", type: State.SUCCESS });
                        } catch (err) {
                            console.error("Payment Error:", err);
                            setModal({ message: "Payment failed", type: State.ERROR });
                        }
                    }}
                />
            )}

            {editingOrder && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 md:p-4">
                    <div className="bg-white rounded-sm w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="px-5 py-3 border-b flex justify-between items-center bg-slate-50">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 leading-tight">Edit Order</h3>
                                <p className="text-[10px] text-orange-600 font-bold uppercase tracking-tighter">{editingOrder.OrderId}</p>
                            </div>
                            <button onClick={() => setEditingOrder(null)} className="p-1.5 hover:bg-gray-200 rounded-sm transition-colors"><FiX size={20} /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                                {/* LEFT SIDE: ADDRESSES */}
                                <div className="space-y-4">
                                    <div className="flex sm:hidden p-1 bg-slate-100 rounded-sm mb-2">
                                        <button
                                            onClick={() => setActiveTab('billing')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-sm transition-all ${activeTab === 'billing' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}
                                        >
                                            Billing
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('shipping')}
                                            className={`flex-1 py-2 text-xs font-bold rounded-sm transition-all ${activeTab === 'shipping' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                                        >
                                            Shipping
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4">
                                        {/* Billing Address Section */}
                                        <div className={`p-4 rounded-sm border border-slate-200 bg-orange-50/30 space-y-3 ${activeTab === 'billing' ? 'block' : 'hidden sm:block'}`}>
                                            <div className="flex justify-between items-center">
                                                <h4 className="text-[11px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 bg-orange-600 rounded-sm"></span> Billing Address
                                                </h4>

                                                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                                    <input
                                                        type="checkbox"
                                                        id="sameAsBilling" // Id add kar di for reference
                                                        className="w-3.5 h-3.5 accent-orange-600 rounded-sm cursor-pointer"
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setEditingOrder({
                                                                    ...editingOrder,
                                                                    shippingDetails: { ...editingOrder.billingDetails }
                                                                });
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase">Same for Shipping</span>
                                                </label>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                                {/* NAME FIELD */}
                                                <input
                                                    type="text"
                                                    placeholder="Name"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-orange-400"
                                                    value={editingOrder.billingDetails?.name || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked;

                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, name: val },
                                                            // LIVE SYNC: Agar checkbox ticked hai toh shipping name bhi update karo
                                                            ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, name: val } })
                                                        });
                                                    }}
                                                />

                                                {/* PHONE FIELD */}
                                                <input
                                                    type="text"
                                                    placeholder="Phone"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-orange-400"
                                                    value={editingOrder.billingDetails?.phone || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked;

                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, phone: val },
                                                            // LIVE SYNC
                                                            ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, phone: val } })
                                                        });
                                                    }}
                                                />

                                                {/* ADDRESS FIELD */}
                                                <textarea
                                                    placeholder="Address"
                                                    className="col-span-2 p-2 border border-slate-300 rounded-sm text-xs h-16 resize-none outline-none focus:border-orange-400"
                                                    value={editingOrder.billingDetails?.address || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        const isSame = (document.getElementById('sameAsBilling') as HTMLInputElement)?.checked;

                                                        setEditingOrder({
                                                            ...editingOrder,
                                                            billingDetails: { ...editingOrder.billingDetails!, address: val },
                                                            // LIVE SYNC
                                                            ...(isSame && { shippingDetails: { ...editingOrder.shippingDetails!, address: val } })
                                                        });
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {/* Shipping Address Section */}
                                        <div className={`p-4 rounded-sm border border-slate-200 bg-blue-50/30 space-y-3 ${activeTab === 'shipping' ? 'block' : 'hidden sm:block'}`}>
                                            <h4 className="text-[11px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 bg-blue-600 rounded-sm"></span> Shipping Address
                                            </h4>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Name"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-blue-400"   
                                                    value={editingOrder.shippingDetails?.name || ''}
                                                    onChange={(e) => setEditingOrder({
                                                        ...editingOrder,
                                                        shippingDetails: { ...editingOrder.shippingDetails!, name: e.target.value }
                                                    })}
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Phone"
                                                    className="p-2 border border-slate-300 rounded-sm text-xs outline-none focus:border-blue-400"
                                                    value={editingOrder.shippingDetails?.phone || ''}
                                                    onChange={(e) => setEditingOrder({
                                                        ...editingOrder,
                                                        shippingDetails: { ...editingOrder.shippingDetails!, phone: e.target.value }
                                                    })}
                                                />
                                                <textarea
                                                    placeholder="Address"
                                                    className="col-span-2 p-2 border border-slate-300 rounded-sm text-xs h-16 resize-none outline-none focus:border-blue-400"

                                                    value={editingOrder.shippingDetails?.address || ''}
                                                    onChange={(e) => setEditingOrder({
                                                        ...editingOrder,
                                                        shippingDetails: { ...editingOrder.shippingDetails!, address: e.target.value }
                                                    })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT SIDE: ITEMS & TOTAL */}
                                <div className="flex flex-col h-full space-y-2">
                                    {/* ADD NEW ITEM SEARCH BOX */}
                                    <div className="p-2 border-t border-slate-200">
                                        <p className="text-[9px] font-black text-orange-600 uppercase tracking-widest mb-2">Add New Item</p>
                                        <SearchableItemInput
                                            items={inventoryItems}
                                            onItemSelected={(selectedItem) => {
                                                // Yahan ensure kar rahe hain ki item wahi add ho jiska ID ho
                                                if (!selectedItem.id) return;

                                                const newItem: OrderItem = {
                                                    id: selectedItem.id,
                                                    name: selectedItem.name,
                                                    mrp: Number(selectedItem.mrp),
                                                    quantity: 1,
                                                    note: "",
                                                    tax: Number(selectedItem.tax)
                                                };
                                                const updatedItems = [...(editingOrder.items || []), newItem];
                                                const newTotal = updatedItems.reduce((sum, i) => sum + (i.mrp * i.quantity), 0);
                                                setEditingOrder({ ...editingOrder, items: updatedItems, totalAmount: newTotal });
                                            }}
                                            placeholder="Search item to add..."
                                        />
                                    </div>

                                    <div className="flex-1 p-1 rounded-md border border-slate-200 bg-slate-50 flex flex-col min-h-0">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">
                                            Items ({editingOrder.items?.length})
                                        </h4>

                                        {/* Items List Container */}
                                        <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
                                            <GenericCartList
                                                items={(editingOrder.items || []).map(item => ({
                                                    ...item,
                                                    id: String(item.id),
                                                    itemGroupId: item.itemGroupId ? String(item.itemGroupId) : undefined,
                                                    isEditable: true
                                                }))}
                                                availableItems={(editingOrder.items || []) as any}
                                                basePriceKey="mrp"
                                                priceLabel="Price"
                                                State={State}
                                                settings={{
                                                    enableRounding: false,
                                                    roundingInterval: 1,
                                                    enableItemWiseDiscount: false,
                                                    lockDiscount: true,
                                                    lockPrice: false,
                                                    hideMrp: false
                                                }}
                                                applyRounding={(amt) => amt}
                                                setModal={() => { }}

                                                // --- DRAWER TRIGGER HERE ---
                                                onOpenEditDrawer={(item) => {
                                                    console.log("Drawer Triggered for:", item);
                                                    setSelectedItemForEdit(item);
                                                    setIsEditDrawerOpen(true);
                                                }}

                                                onDiscountChange={() => { }}
                                                onCustomPriceChange={() => { }}
                                                onCustomPriceBlur={() => { }}
                                                onDiscountClick={() => { }}
                                                onPriceClick={() => { }}
                                                onDeleteItem={(itemId) => {
                                                    const updatedItems = editingOrder.items?.filter(i => String(i.id) !== String(itemId)) || [];
                                                    const newTotal = updatedItems.reduce((sum, i) => sum + (i.mrp * i.quantity), 0);
                                                    setEditingOrder({ ...editingOrder, items: updatedItems, totalAmount: newTotal });
                                                }}
                                                onQuantityChange={(itemId, newQuantity) => {
                                                    const updatedItems = [...(editingOrder.items || [])];
                                                    const idx = updatedItems.findIndex(i => String(i.id) === String(itemId));
                                                    if (idx !== -1) {
                                                        updatedItems[idx].quantity = newQuantity;
                                                        const newTotal = updatedItems.reduce((sum, i) => sum + (i.mrp * i.quantity), 0);
                                                        setEditingOrder({ ...editingOrder, items: updatedItems, totalAmount: newTotal });
                                                    }
                                                }}
                                            />
                                        </div>

                                        {/* --- ITEM EDIT DRAWER COMPONENT --- */}
                                        <ItemEditDrawer
                                            isOpen={isEditDrawerOpen}
                                            onClose={() => {
                                                setIsEditDrawerOpen(false);
                                                setSelectedItemForEdit(null);
                                            }}
                                            item={selectedItemForEdit}
                                            onSaveSuccess={(updatedItemData: any) => {
                                                // Logic to update the item in editingOrder.items
                                                const updatedItems = editingOrder.items?.map(i =>
                                                    String(i.id) === String(selectedItemForEdit.id) ? { ...i, ...updatedItemData } : i
                                                );
                                                const newTotal = updatedItems?.reduce((sum, i) => sum + (i.mrp * i.quantity), 0) || 0;
                                                setEditingOrder({ ...editingOrder, items: updatedItems, totalAmount: newTotal });
                                                setIsEditDrawerOpen(false);
                                            }}
                                        />
                                    </div>

                                    <div className="bg-slate-900 rounded-sm p-4 flex justify-between items-center shadow-sm">
                                        <div className="text-slate-400">
                                            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Total Amount</p>
                                        </div>
                                        <span className="text-xl font-black text-white">₹{editingOrder.totalAmount.toFixed(2)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="px-6 py-4 bg-slate-50 border-t flex gap-3">
                            <button
                                onClick={() => setEditingOrder(null)}
                                className="flex-1 py-2.5 text-slate-500 text-sm font-bold hover:bg-slate-100 rounded-sm transition-colors"
                            >
                                Discard
                            </button>

                            <button
                                onClick={async () => {
                                    if (!editingOrder || !currentUser?.companyId) return;
                                    try {
                                        const OrderRef = doc(db, 'companies', currentUser.companyId, 'Orders', editingOrder.id);
                                        await updateDoc(OrderRef, {
                                            items: editingOrder.items,
                                            totalAmount: editingOrder.totalAmount,
                                            billingDetails: editingOrder.billingDetails,
                                            shippingDetails: editingOrder.shippingDetails,
                                            updatedAt: serverTimestamp()
                                        });
                                        setEditingOrder(null);
                                    } catch (error) {
                                        console.error("Error updating Order:", error);
                                        alert("Failed to save changes.");
                                    }
                                }}
                                className="flex-[2] bg-orange-600 text-white py-2.5 rounded-sm text-sm font-black shadow-sm hover:bg-orange-700 transition-colors uppercase"
                            >
                                SAVE CHANGES
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrdersPage;