import React, { useState, useEffect, useMemo } from 'react';
// --- FIX: Import useLocation ---
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
    orderBy // Import orderBy
} from 'firebase/firestore';
import { useAuth } from '../context/auth-context'; // Adjust path if needed
import { CustomCard } from '../Components/CustomCard'; // Adjust path if needed
import { Spinner } from '../constants/Spinner'; // Adjust path if needed
import { Modal } from '../constants/Modal'; // Adjust path if needed
import { State } from '../enums'; // Adjust path if needed
import { serverTimestamp } from 'firebase/firestore';
import { FiSearch, FiX, FiPackage, FiTruck, FiThumbsUp } from 'react-icons/fi'; // Icons

// --- Data Types ---
export interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    mrp: number;
}

export type OrderStatus = 'Upcoming' | 'Confirmed' | 'Packed & Dispatched' | 'Completed';

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

// --- Custom Hook for Orders Data ---
export const useOrdersData = (companyId?: string) => {
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
        const ordersQuery = query(
            collection(db, 'companies', companyId, 'Orders'),
            orderBy('createdAt', 'desc')
        );
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
            setError("Failed to load orders data.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [companyId]);

    return { orders, loading, error };
};

// --- Main Orders Page Component ---
const OrdersPage: React.FC = () => {
    const orderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed & Dispatched', 'Completed'];

    // --- FIX: Get navigation state ---
    const location = useLocation();
    const defaultStatus = (location.state?.defaultStatus as OrderStatus) || 'Upcoming';

    // --- FIX: Use defaultStatus to set the initial tab ---
    const [activeStatusTab, setActiveStatusTab] = useState<OrderStatus>(defaultStatus);

    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

    const { currentUser, loading: authLoading } = useAuth();
    const { orders, loading: dataLoading, error } = useOrdersData(currentUser?.companyId);

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

    const handleOrderClick = (orderId: string) => {
        setExpandedOrderId(prevId => (prevId === orderId ? null : orderId));
    };

    const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
        const currentIndex = orderStatuses.indexOf(currentStatus);
        if (currentIndex === -1 || currentIndex === orderStatuses.length - 1) {
            return null;
        }
        return orderStatuses[currentIndex + 1];
    };

    const handleUpdateStatus = async (orderId: string, currentStatus: OrderStatus) => {
        const nextStatus = getNextStatus(currentStatus);

        if (!nextStatus || isUpdatingStatus === orderId || !currentUser?.companyId) {
            if (!currentUser?.companyId) {
                console.error("Cannot update status: user or companyId is missing.");
                setModal({ message: "Error: Not logged in.", type: State.ERROR });
            }
            return;
        }

        const companyId = currentUser.companyId;
        setIsUpdatingStatus(orderId);
        setModal(null);

        const orderDocRef = doc(db, 'companies', companyId, 'Orders', orderId);

        try {
            await updateDoc(orderDocRef, {
                status: nextStatus,
                updatedAt: serverTimestamp()
            });
            setModal({ message: `Order moved to ${nextStatus}.`, type: State.SUCCESS });
        } catch (err) {
            console.error("Error updating order status:", err);
            setModal({ message: `Failed to update status: ${err instanceof Error ? err.message : 'Unknown error'}`, type: State.ERROR });
        } finally {
            setIsUpdatingStatus(null);
            setTimeout(() => setModal(null), 2000);
        }
    };


    const renderContent = () => {
        if (authLoading || dataLoading) {
            return <div className="flex justify-center items-center py-10"><Spinner /></div>;
        }
        if (error) {
            return <p className="p-8 text-center text-red-500">{error}</p>;
        }
        if (filteredOrders.length > 0) {
            return filteredOrders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const nextStatus = getNextStatus(order.status);

                return (
                    <CustomCard
                        key={order.id}
                        onClick={() => handleOrderClick(order.id)}
                        className="cursor-pointer transition-shadow hover:shadow-md"
                    >
                        {/* Card Header */}
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-base font-semibold text-slate-800">{order.orderId}</p>
                                <p className="text-sm text-slate-500 mt-1">{order.userName}</p>
                            </div>
                            <div className="flex items-center space-x-3">
                                <div className="text-right">
                                    <p className="text-lg font-bold text-slate-800">
                                        {order.totalAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                    </p>
                                    <p className="text-xs text-slate-500">{order.time}</p>
                                </div>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={`w-5 h-5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                </svg>
                            </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                            <div className="mt-4 pt-4 border-t border-slate-200">
                                <h4 className="text-sm font-semibold text-slate-500 mb-2 uppercase tracking-wide">Items</h4>
                                <div className="space-y-2 text-sm max-h-40 overflow-y-auto pr-2">
                                    {(order.items && order.items.length > 0) ? order.items.map((item, index) => (
                                        <div key={item.id || index} className="flex justify-between items-center text-slate-700">
                                            <div className="flex-1 pr-4">
                                                <p className="font-medium">{item.name} <span className="text-slate-400 text-xs">(x{item.quantity})</span></p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold">
                                                    {(item.mrp * item.quantity).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
                                                </p>
                                                <p className="text-xs text-slate-400">MRP: {item.mrp.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}</p>
                                            </div>
                                        </div>
                                    )) : <p className="text-xs text-slate-400">No item details available.</p>}
                                </div>

                                {/* Action Button to move to next status */}
                                {nextStatus && (
                                    <div className="flex justify-end mt-4 pt-4 border-t border-slate-200">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateStatus(order.id, order.status); }}
                                            disabled={isUpdatingStatus === order.id}
                                            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:bg-gray-400 flex items-center gap-2"
                                        >
                                            {isUpdatingStatus === order.id ? <Spinner /> :
                                                (nextStatus === 'Confirmed' ? <FiThumbsUp size={16} /> :
                                                    (nextStatus === 'Packed & Dispatched' ? <FiPackage size={16} /> :
                                                        (nextStatus === 'Completed' ? <FiTruck size={16} /> : null)))
                                            }
                                            {isUpdatingStatus === order.id ? 'Updating...' : `Mark as ${nextStatus}`}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </CustomCard>
                );
            });
        }
        return (
            <p className="p-8 text-center text-base text-slate-500">
                No orders found for '{activeStatusTab}' status {searchQuery && `matching "${searchQuery}"`}.
            </p>
        );
    };

    return (
        <div className="flex min-h-screen w-full flex-col overflow-hidden bg-gray-100 mb-10 ">
            {modal && (
                <Modal
                    message={modal.message}
                    type={modal.type}
                    onClose={() => setModal(null)}
                />
            )}

            {/* Header with Search Toggle */}
            <div className="flex items-center justify-between p-4 px-6 bg-white shadow-sm sticky top-0 z-10">
                <div className="flex flex-1 items-center">
                    <button onClick={() => setShowSearch(!showSearch)} className="text-slate-500 hover:text-slate-800 transition-colors mr-4">
                        {showSearch ? <FiX className="w-6 h-6" /> : <FiSearch className="w-6 h-6" />}
                    </button>
                    <div className="flex-1">
                        {!showSearch ? (
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800">Customer Orders</h1>
                            </div>
                        ) : (
                            <input
                                type="text"
                                placeholder="Search by Order ID or Customer Name..."
                                className="w-full text-base font-light p-1 border-b-2 border-slate-300 focus:border-slate-800 outline-none transition-colors bg-transparent"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Stepper */}
            <div className="flex items-center w-full px-6 md:px-10 pt-12 pb-10 bg-white shadow-sm sticky top-[calc(4rem+1px)] z-10">
                {orderStatuses.map((status, index) => {
                    const activeIndex = orderStatuses.indexOf(activeStatusTab);
                    const isCompleted = index < activeIndex;
                    const isActive = index === activeIndex;

                    const dotColor = isCompleted || isActive ? 'bg-orange-500' : 'bg-gray-300';
                    const lineColor = isCompleted ? 'bg-orange-500' : 'bg-gray-300';
                    const textColor = isActive
                        ? 'text-orange-600 font-bold'
                        : (isCompleted ? 'text-orange-500 font-medium' : 'text-gray-500 font-medium');
                    const dotStateStyles = isActive ? 'scale-110 shadow-lg' : 'scale-100 shadow-sm';
                    const isTopLabel = index % 2 === 0;
                    const labelContent = status.replace(' & ', ' &\n');

                    return (
                        <React.Fragment key={status}>
                            {/* Step (Dot + Labels) */}
                            <div
                                className="relative flex flex-col items-center flex-shrink-0 cursor-pointer px-2"
                                onClick={() => setActiveStatusTab(status)}
                            >
                                {/* Top Label */}
                                {isTopLabel && (
                                    <span className={`absolute bottom-full mb-3 text-center text-sm md:text-base ${textColor} transition-colors whitespace-pre-line`}>
                                        {labelContent}
                                    </span>
                                )}

                                {/* Dot */}
                                <div className={`w-7 h-7 rounded-full ${dotColor} transition-all duration-300 z-10 border-[5px] border-yellow-500 ${dotStateStyles}`} />

                                {/* Bottom Label */}
                                {!isTopLabel && (
                                    <span className={`absolute top-full mt-3 text-center text-sm md:text-base ${textColor} transition-colors whitespace-pre-line`}>
                                        {labelContent}
                                    </span>
                                )}
                            </div>

                            {/* Connector Line */}
                            {index < orderStatuses.length - 1 && (
                                <div className={`flex-auto h-2 ${lineColor} transition-colors`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Orders List */}
            <div className="flex-grow overflow-y-auto bg-slate-100 space-y-3 p-2 md:p-4">
                {renderContent()}
            </div>
        </div>
    );
};

export default OrdersPage;