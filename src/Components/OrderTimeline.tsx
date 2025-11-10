import React, { useMemo } from 'react';
import { useAuth } from '../context/auth-context';
import { useOrdersData, type Order, type OrderStatus } from '../Catalogue/Orders';
import { Spinner } from '../constants/Spinner';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';

const orderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];


const useGroupedOrders = () => {
    const { currentUser } = useAuth();
    const { orders, loading, error } = useOrdersData(currentUser?.companyId);

    const groupedOrders = useMemo(() => {
        const map = new Map<OrderStatus, Order[]>();
        orderStatuses.forEach(status => map.set(status, []));
        for (const order of orders) {
            const status = order.status || 'Upcoming';
            const statusGroup = map.get(status);
            if (statusGroup) {
                statusGroup.push(order);
            }
        }
        return map;
    }, [orders]);

    return { groupedOrders, loading, error };
};

interface OrderTimelineProps {
    isDataVisible: boolean;
}

export const OrderTimeline: React.FC<OrderTimelineProps> = ({ isDataVisible }) => { // <-- ADD PROP
    const { groupedOrders, loading, error } = useGroupedOrders();
    const navigate = useNavigate();

    const handleViewStatus = (status: OrderStatus) => {
        navigate(ROUTES.ORDERDETAILS, { state: { defaultStatus: status } });
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center p-8 bg-white rounded-lg shadow-md">
                <Spinner />
            </div>
        );
    }

    if (error) {
        return <p className="text-center text-red-500 bg-white p-8 rounded-lg shadow-md">{error}</p>;
    }

    return (
        <div className="w-full p-4 md:p-6 bg-white rounded-sm shadow-md">
            <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-2 text-center">Order Journey</h2>

            <div className="flex items-start w-full px-2 md:px-4 pt-12 pb-10">
                {orderStatuses.map((status, index) => {
                    const ordersInStatus = groupedOrders.get(status) || [];
                    const isLast = index === orderStatuses.length - 1;

                    const labelContent = status.replace(' & ', ' &\n');

                    const isTopLabel = index % 2 === 0;

                    return (
                        <React.Fragment key={status}>
                            <button
                                className="relative flex flex-col items-center flex-shrink-0 cursor-pointer px-2"
                                onClick={() => handleViewStatus(status)}
                            >
                                {isTopLabel && (
                                    <span className={`absolute bottom-full mb-3 text-center text-sm md:text-base text-gray-600 font-medium transition-colors whitespace-pre-line`}>
                                        {labelContent}
                                    </span>
                                )}
                                <div className={`w-12 h-12 rounded-full bg-orange-400 flex items-center justify-center transition-all duration-300 z-10 border-4 border-yellow-500 shadow-md`}>
                                    <span className="text-xl font-bold text-white">
                                        {isDataVisible ? ordersInStatus.length : '∗'}
                                    </span>
                                </div>
                                {!isTopLabel && (
                                    <span className={`absolute top-full mt-3 text-center text-sm md:text-base text-gray-600 font-medium transition-colors whitespace-pre-line`}>
                                        {labelContent}
                                    </span>
                                )}
                            </button>
                            {!isLast && (
                                <div className={`flex-auto h-1 bg-gray-300 transition-colors mt-6`} />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};