import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/Firebase'; // Adjust path if needed
import {
    collection,
    query,
    onSnapshot,
    Timestamp,
    QuerySnapshot,
    doc,
    where,
    updateDoc,
    orderBy // Import orderBy
} from 'firebase/firestore';
import { useAuth } from '../context/Auth-Context'; // Adjust path if needed
import { CustomCard } from '../Components/CustomCard'; // Adjust path if needed
import { Spinner } from '../constants/Spinner'; // Adjust path if needed
import { Modal } from '../constants/Modal'; // Adjust path if needed
import { State, Variant } from '../enums'; // Adjust path if needed
import { CustomButton } from '../Components/CustomButton'; // Adjust path if needed
import { serverTimestamp } from 'firebase/firestore';
import { FiSearch, FiX, FiPackage, FiTruck, FiThumbsUp } from 'react-icons/fi'; // Icons for status

// --- Data Types ---
interface OrderItem {
    id: string;
    name: string;
    quantity: number;
    mrp: number; // Assuming mrp is stored
}

// Define the possible order statuses
type OrderStatus = 'Upcoming' | 'Confirmed' | 'Packed & Dispatched' | 'Completed';

interface Order {
    id: string;          // Firestore document ID
    orderId: string;     // Unique Order ID from data
    totalAmount: number;
    userName: string;
    status: OrderStatus;
    createdAt: Date;
    time: string; // Formatted time string
    items?: OrderItem[];
    // Add other fields from your customerOrders document if needed (e.g., userId, companyId)
}

const formatDate = (date: Date | null): string => {
    if (!date) return 'N/A';
    // Simplified format for orders page
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

// --- Custom Hook for Orders Data ---
const useOrdersData = (companyId?: string) => {
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
        // Query orders collection, order by creation time descending
        const ordersQuery = query(
            collection(db, 'customerOrders'),
            where('companyId', '==', companyId),
            orderBy('createdAt', 'desc') // Order by timestamp
        );

        const unsubscribe = onSnapshot(ordersQuery, (snapshot: QuerySnapshot) => {
            const ordersData = snapshot.docs.map((doc): Order => {
                const data = doc.data();
                const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(); // Convert Timestamp

                // Default status to 'Upcoming' if missing
                const status: OrderStatus = data.status || 'Upcoming';

                return {
                    id: doc.id,
                    orderId: data.orderId || doc.id, // Use doc.id as fallback
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
            setError(null); // Clear error on successful fetch
        }, (err) => {
            console.error("Error fetching orders:", err);
            setError("Failed to load orders data.");
            setLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, [companyId]); // Rerun effect if companyId changes

    return { orders, loading, error };
};

// --- Main Orders Page Component ---
const OrdersPage: React.FC = () => {
    // Define the order of statuses for tabs and progression
    const orderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed & Dispatched', 'Completed'];
    const [activeStatusTab, setActiveStatusTab] = useState<OrderStatus>('Upcoming'); // Default tab

    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null); // Track which order status is being updated

    const { currentUser, loading: authLoading } = useAuth();
    const { orders, loading: dataLoading, error } = useOrdersData(currentUser?.companyId);

    // Filter orders based on the active status tab and search query
    const filteredOrders = useMemo(() => {
        return orders
            .filter(order => order.status === activeStatusTab) // Filter by selected status tab
            .filter(order => { // Then filter by search query
                const lowerCaseQuery = searchQuery.toLowerCase();
                return (
                    order.orderId.toLowerCase().includes(lowerCaseQuery) ||
                    order.userName.toLowerCase().includes(lowerCaseQuery)
                    // Add other searchable fields if needed (e.g., item names within order)
                );
            });
    }, [orders, activeStatusTab, searchQuery]);

    const handleOrderClick = (orderId: string) => {
        setExpandedOrderId(prevId => (prevId === orderId ? null : orderId));
    };

    // Function to get the next status in the sequence
    const getNextStatus = (currentStatus: OrderStatus): OrderStatus | null => {
        const currentIndex = orderStatuses.indexOf(currentStatus);
        if (currentIndex === -1 || currentIndex === orderStatuses.length - 1) {
            return null; // No next status if not found or already completed
        }
        return orderStatuses[currentIndex + 1];
    };

    // Function to handle status updates
    const handleUpdateStatus = async (orderId: string, currentStatus: OrderStatus) => {
        const nextStatus = getNextStatus(currentStatus);
        if (!nextStatus || isUpdatingStatus === orderId) return; // Don't update if no next status or already updating

        setIsUpdatingStatus(orderId);
        setModal(null); // Clear previous modals
        const orderDocRef = doc(db, 'customerOrders', orderId);

        try {
            await updateDoc(orderDocRef, {
                status: nextStatus,
                updatedAt: serverTimestamp() // Optionally track updates
            });
            setModal({ message: `Order moved to ${nextStatus}.`, type: State.SUCCESS });
            // The local state will update automatically due to the onSnapshot listener
        } catch (err) {
            console.error("Error updating order status:", err);
            setModal({ message: `Failed to update status: ${err instanceof Error ? err.message : 'Unknown error'}`, type: State.ERROR });
        } finally {
            setIsUpdatingStatus(null);
            // Optionally auto-close success modal
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
                                <div className="space-y-2 text-sm max-h-40 overflow-y-auto pr-2"> {/* Added max height and scroll */}
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
                                {/* Optional: Add date filter display here if needed */}
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
                {/* Optional: Add Date Filter Button Here */}
                {/* <div className="relative pl-4" ref={filterRef}>...</div> */}
            </div>

            {/* Status Tabs */}
            <div className="flex justify-center border-b border-gray-300 p-2 bg-white sticky top-[calc(4rem+1px)] z-10 grid grid-cols-2 gap-2"> {/* Adjust top based on header height */}
                {orderStatuses.map(status => (
                    <CustomButton
                        key={status}
                        variant={Variant.Transparent}
                        active={activeStatusTab === status}
                        onClick={() => setActiveStatusTab(status)}
                        className="flex-shrink-0 text-sm md:text-base" // Responsive text
                    >
                        {status.replace('&', '& ')} {/* Add space for wrapping */}
                    </CustomButton>
                ))}
            </div>

            {/* Orders List */}
            <div className="flex-grow overflow-y-auto bg-slate-100 space-y-3 p-2 md:p-4"> {/* Responsive Padding */}
                {renderContent()}
            </div>
        </div>
    );
};

export default OrdersPage;