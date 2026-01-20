import React, { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { db } from '../lib/Firebase'; // Adjust path if needed
import {
    collection,
    query,
    onSnapshot,
    Timestamp,
    QuerySnapshot,
    doc,
    updateDoc,
    orderBy,
    where // --- IMPORT 'where' ---
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context'; // Adjust path if needed
import { CustomCard } from '../Components/CustomCard'; // Adjust path if needed
import { Spinner } from '../constants/Spinner'; // Adjust path if needed
import { Modal } from '../constants/Modal'; // Adjust path if needed
import { State } from '../enums'; // Adjust path if needed
import { serverTimestamp } from 'firebase/firestore';
import { FiSearch, FiX, FiPackage, FiTruck, FiThumbsUp } from 'react-icons/fi'; // Added FiCheckCircle


// --- Data Types ---
export interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    mrp: number;
}

export type OrderStatus = 'Upcoming' | 'Confirmed' | 'Packed' | 'Completed';

export interface Order {
    id: string;      // Firestore document ID
    orderId: string;     // Unique Order ID from data
    totalAmount: number;
    userName: string;
    status: OrderStatus;
    createdAt: Date;
    time: string; // Formatted time string
    items?: OrderItem[];
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

// --- FIX: Updated useOrdersData signature ---
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
            setError("Company ID not available.");
            return;
        }

        setLoading(true);
        setError(null); // Clear error on new fetch

        // --- FIX: Build the query ---
        let ordersQuery;

        // 1. Base query
        const baseQuery = collection(db, 'companies', companyId, 'Orders');

        // 2. Add filters if they exist
        if (startDate && endDate) {
            const start = Timestamp.fromDate(startDate);
            const end = Timestamp.fromDate(endDate);

            ordersQuery = query(
                baseQuery,
                where('createdAt', '>=', start),
                where('createdAt', '<=', end),
                orderBy('createdAt', 'desc')
                // NOTE: This query requires a composite index in Firestore.
                // The error in your console will provide a link to create it.
            );
        } else {
            // 3. Default query (no date filter)
            ordersQuery = query(baseQuery, orderBy('createdAt', 'desc'));
        }
        // --- END FIX ---

        const unsubscribe = onSnapshot(ordersQuery, (snapshot: QuerySnapshot) => {
            const ordersData = snapshot.docs.map((doc): Order => {
                const data = doc.data();
                const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
                const status: OrderStatus = data.status || 'Upcoming';

                return {
                    id: doc.id,
                    orderId: data.orderId || doc.id,
                    totalAmount: data.totalAmount || 0,
                    userName: data.userName || 'N/A',
                    status: status,
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
            setError(null);
        }, (err) => {
            console.error("Error fetching orders:", err);
            setError("Failed to load orders data. (Check console for index link)");
            setLoading(false);
        });

        return () => unsubscribe();
        // --- FIX: Add filters to dependency array ---
    }, [companyId, startDate, endDate]);

    return { orders, loading, error };
};

// --- (Cart Components: Omitted for brevity) ---
// ...

// --- Main Orders Page Component ---
// ... (Saare imports aur interface same hain)

const OrdersPage: React.FC = () => {
    const orderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];
    const location = useLocation();
    const defaultStatus = (location.state?.defaultStatus as OrderStatus) || 'Upcoming';

    const [activeStatusTab, setActiveStatusTab] = useState<OrderStatus>(defaultStatus);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

    const { currentUser, loading: authLoading } = useAuth();
    const { orders, loading: dataLoading, error } = useOrdersData(currentUser?.companyId, null, null);

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

    // --- ⬇️ DUMMY DATA FOR UI PREVIEW (ONLY ADDED THIS) ⬇️ ---
    const dummyOrders: Order[] = [
        {
            id: 'dummy-1',
            orderId: 'ORD-TEST-001',
            userName: 'Amit UI Developer',
            totalAmount: 1250.00,
            status: activeStatusTab, // Tab switch karne par cards wahan bhi dikhenge
            createdAt: new Date(),
            time: 'Just Now',
            items: [
                { id: 'i1', name: 'Sample Product 1', quantity: 2, mrp: 500 },
                { id: 'i2', name: 'Sample Product 2', quantity: 1, mrp: 250 }
            ]
        },
        {
            id: 'dummy-2',
            orderId: 'ORD-TEST-002',
            userName: 'Suresh Designer',
            totalAmount: 899.00,
            status: activeStatusTab,
            createdAt: new Date(),
            time: '10 mins ago',
            items: [
                { id: 'i3', name: 'Testing Item 3', quantity: 1, mrp: 899 }
            ]
        }
    ];

    // Agar real data nahi hai toh dummy data dikhao
    const displayOrders = filteredOrders.length > 0 ? filteredOrders : dummyOrders;
    // --- ⬆️ DUMMY DATA END ⬆️ ---

    const handleOrderClick = (orderId: string) => {
        setExpandedOrderId(prevId => (prevId === orderId ? null : orderId));
    };

    const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
        const currentIndex = orderStatuses.indexOf(currentStatus);
        if (currentIndex === -1 || currentIndex === orderStatuses.length - 1) return null;
        return orderStatuses[currentIndex + 1];
    };

    const handleUpdateStatus = async (orderId: string, currentStatus: OrderStatus) => {
        // 1. Agar dummy data hai toh aage mat badho (kyunki Firestore mein dummy ID nahi hoti)
        if (orderId.startsWith('dummy-')) return;

        const nextStatus = getNextStatus(currentStatus);

        // Check agar next status possible hai aur update process mein toh nahi hai
        if (!nextStatus || isUpdatingStatus === orderId || !currentUser?.companyId) return;

        const companyId = currentUser.companyId;
        setIsUpdatingStatus(orderId); // Loading start

        try {
            const orderDocRef = doc(db, 'companies', companyId, 'Orders', orderId);
            await updateDoc(orderDocRef, {
                status: nextStatus,
                updatedAt: serverTimestamp()
            });
            // Popup (Modal) yahan se hata diya gaya hai
        } catch (err) {
            console.error("Update Error:", err);
        } finally {
            setIsUpdatingStatus(null); // Loading stop
        }
    };

    const renderContent = () => {
    if (authLoading || dataLoading) {
        return <div className="flex justify-center items-center py-10"><Spinner /></div>;
    }
    if (error) {
        return <p className="p-8 text-center text-red-500">{error}</p>;
    }

    if (displayOrders.length > 0) {
        // FLATMAP use karne se har order ka har item ek alag card ban raha hai
        return displayOrders.flatMap((order) => {
            return (order.items || []).map((item, idx) => {
                // Yeh ID sirf UI expansion toggle karne ke liye hai
                const itemUIKey = `${order.id}-${idx}`; 
                const isExpanded = expandedOrderId === itemUIKey;

                return (
                    <CustomCard
                        key={itemUIKey}
                        onClick={() => handleOrderClick(itemUIKey)}
                        className="p-4 mb-3 bg-white shadow-sm border border-gray-100 rounded-lg cursor-pointer transition-all"
                    >
                        {/* --- HEADER SECTION --- */}
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-base font-bold text-slate-800">{order.orderId}</h3>
                                <p className="text-gray-500 text-sm">{order.userName}</p>
                            </div>
                            <div className="text-right flex flex-col items-end">
                                <div className="flex items-center gap-2">
                                    <span className="text-lg font-bold text-slate-900">
                                        {(item.mrp * item.quantity).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                    </span>
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        strokeWidth={2.5}
                                        stroke="currentColor"
                                        className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                    </svg>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">{order.time}</p>
                            </div>
                        </div>

                        {/* --- EXPANDED SECTION --- */}
                        {isExpanded && (
                            <div className="mt-4 transition-all duration-300">
                                <div className="border-t border-gray-100 mb-4"></div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">ITEMS</p>
                                <div className="space-y-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-medium text-slate-800">{item.name}</p>
                                            <p className="text-[11px] text-gray-400 font-medium">MRP: ₹{item.mrp}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-slate-800">
                                                {(item.mrp * item.quantity).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                            </p>
                                            <p className="text-[11px] text-gray-400 font-medium">Qty: {item.quantity}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="text-right mt-4 mb-6">
                                    <p className="text-[11px] text-gray-400">
                                        Paid via: <span className="text-slate-600 font-semibold uppercase ml-1">Cash: {(item.mrp * item.quantity).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</span>
                                    </p>
                                </div>

                                <div className="grid grid-cols-4 gap-3 pt-4 border-t border-gray-100">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); console.log("Edit clicked"); }}
                                        className="py-2.5 bg-[#8E8E93] text-white text-xs font-bold rounded-sm shadow-sm active:scale-95 transition-transform cursor-pointer"
                                    >
                                        Edit
                                    </button>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); console.log("Delete clicked"); }}
                                        className="py-2.5 bg-[#FF3B30] text-white text-xs font-bold rounded-sm shadow-sm active:scale-95 transition-transform cursor-pointer"
                                    >
                                        Delete
                                    </button>

                                    {/* --- NEXT BUTTON (MAIN FIX) --- */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation(); // Card ko collapse hone se rokne ke liye
                                            handleUpdateStatus(order.id, order.status); // YAHAN order.id JANA CHAHIYE
                                        }}
                                        disabled={isUpdatingStatus === order.id || getNextStatus(order.status) === null}
                                        className={`py-2.5 text-white text-xs font-bold rounded-sm shadow-sm active:scale-95 transition-transform cursor-pointer ${
                                            isUpdatingStatus === order.id ? 'bg-gray-400' : 'bg-[#00A2FF]'
                                        } ${getNextStatus(order.status) === null ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {isUpdatingStatus === order.id ? '...' : 'Next'}
                                    </button>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); window.print(); }}
                                        className="py-2.5 bg-black text-white text-xs font-bold rounded-sm shadow-sm active:scale-95 transition-transform cursor-pointer"
                                    >
                                        Print
                                    </button>
                                </div>
                            </div>
                        )}
                    </CustomCard>
                );
            });
        });
    }
    return (
        <p className="p-8 text-center text-base text-slate-500">
            No orders found for '{activeStatusTab}' status.
        </p>
    );
};

    return (
        <div className="flex min-h-screen w-full flex-col overflow-hidden bg-gray-100 mb-10 ">
            {modal && <Modal message={modal.message} type={modal.type} onClose={() => setModal(null)} />}

            {/* Header / Search bar */}
            <div className="flex items-center justify-between p-4 px-6 bg-white shadow-sm sticky top-0 z-10">
                <div className="flex flex-1 items-center">
                    <button onClick={() => setShowSearch(!showSearch)} className="text-slate-500 hover:text-slate-800 transition-colors mr-4">
                        {showSearch ? <FiX className="w-6 h-6" /> : <FiSearch className="w-6 h-6" />}
                    </button>
                    <div className="flex-1">
                        {!showSearch ? <h1 className="text-2xl font-bold text-slate-800">Customer Orders</h1> :
                            <input
                                type="text"
                                placeholder="Search..."
                                className="w-full text-base p-1 border-b-2 border-slate-300 outline-none"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />}
                    </div>
                </div>
            </div>

            {/* Timeline Tabs */}
            <div className="flex items-center w-full px-6 md:px-10 pt-12 pb-10 bg-white shadow-sm sticky top-[calc(4rem+1px)] z-10">
                {orderStatuses.map((status, index) => {
                    const activeIndex = orderStatuses.indexOf(activeStatusTab);
                    const isCompleted = index < activeIndex;
                    const isActive = index === activeIndex;
                    return (
                        <React.Fragment key={status}>
                            <div className="relative flex flex-col items-center flex-shrink-0 cursor-pointer px-2" onClick={() => setActiveStatusTab(status)}>
                                <span className={`absolute ${index % 2 === 0 ? 'bottom-full mb-3' : 'top-full mt-3'} text-center text-sm ${isActive ? 'text-orange-600 font-bold' : 'text-gray-500'}`}>
                                    {status}
                                </span>
                                <div className={`w-7 h-7 rounded-full transition-all duration-300 z-10 border-[5px] border-yellow-500 ${isCompleted || isActive ? 'bg-orange-500' : 'bg-gray-300'} ${isActive ? 'scale-110 shadow-lg' : ''}`} />
                            </div>
                            {index < orderStatuses.length - 1 && (
                                <div className={`flex-auto h-2 ${isCompleted ? 'bg-orange-500' : 'bg-gray-300'}`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            <div className="flex-grow overflow-y-auto bg-slate-100 space-y-3 p-2 md:p-4">
                {renderContent()}
            </div>
        </div>
    );
};

export default OrdersPage;