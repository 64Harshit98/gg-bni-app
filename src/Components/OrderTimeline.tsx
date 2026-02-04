import React, { useMemo } from 'react';
import { useAuth } from '../context/auth-context';
import { useOrdersData, type Order, type OrderStatus } from '../Catalogue/Orders';
import { Spinner } from '../constants/Spinner';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { useFilter } from './Filter';

// ✅ Statuses ka order bilkul wahi jo timeline mein chahiye
const orderStatuses: (OrderStatus | 'Upcoming')[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];

const useGroupedOrders = () => {
    const { currentUser } = useAuth();
    // ✅ Main page wala same hook use kar rahe hain
    const { Orders, loading, error } = useOrdersData(currentUser?.companyId);

    const groupedOrders = useMemo(() => {
        const map = new Map<OrderStatus | 'Upcoming', Order[]>();
        // Map initialize kar rahe hain
        orderStatuses.forEach(status => map.set(status, []));

        // ✅ FIX: Date filter hata diya hai taaki numbers 100% Orders page se match karein
        for (const order of Orders) {
            const status = order.status || 'Upcoming';
            const statusGroup = map.get(status);
            if (statusGroup) {
                statusGroup.push(order);
            }
        }
        return map;
    }, [Orders]);

    return { groupedOrders, loading, error };
};

interface OrderTimelineProps {
    isDataVisible: boolean;
}

export const OrderTimeline: React.FC<OrderTimelineProps> = ({ isDataVisible }) => {
    const { groupedOrders, loading, error } = useGroupedOrders();
    const navigate = useNavigate();
    const { filters } = useFilter();

    const selectedPeriodText = useMemo(() => {
        if (!filters.startDate || !filters.endDate) return 'for the selected period';
        const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
        const startDate = new Date(filters.startDate).toLocaleDateString('en-IN', options);
        const endDate = new Date(filters.endDate).toLocaleDateString('en-IN', options);
        return startDate === endDate ? `for ${startDate}` : `from ${startDate} to ${endDate}`;
    }, [filters.startDate, filters.endDate]);

    const handleViewStatus = (status: OrderStatus | 'Upcoming') => {
        // ✅ Navigation setup
        navigate(ROUTES.ORDERDETAILS, { state: { defaultStatus: status } });
    };

    if (loading) return <div className="flex justify-center p-8 bg-white rounded-lg shadow-md"><Spinner /></div>;
    if (error) return <p className="text-center text-red-500 bg-white p-8 rounded-lg shadow-md">{error}</p>;

    return (
        <div className="w-full p-4 md:p-6 bg-white rounded-sm shadow-md">
            <div className="flex flex-col items-center mb-4">
                <h2 className="text-xl md:text-2xl font-bold text-gray-800">Order Journey</h2>
                <span className="bg-blue-100 text-blue-600 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 uppercase">
                    {selectedPeriodText}
                </span>
            </div>

            <div className="flex items-start w-full px-1 md:px-4 pt-12 pb-10">
                {orderStatuses.map((status, index) => {
                    const ordersInStatus = groupedOrders.get(status) || [];
                    const isLast = index === orderStatuses.length - 1;
                    const labelContent = status.replace(' & ', ' &\n');
                    const isTopLabel = index % 2 === 0;

                    return (
                        <React.Fragment key={status}>
                            <div className="flex flex-col items-center flex-1 min-w-0">
                                <button
                                    className="relative flex flex-col items-center cursor-pointer w-full group"
                                    onClick={() => handleViewStatus(status as any)}
                                >
                                    {isTopLabel && (
                                        <span className="absolute bottom-full mb-2 text-center text-[10px] sm:text-xs md:text-sm text-gray-600 font-bold whitespace-pre-line leading-tight w-max">
                                            {labelContent}
                                        </span>
                                    )}
                                    <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full bg-orange-400 flex items-center justify-center transition-all duration-300 z-10 border-2 md:border-4 border-yellow-500 shadow-sm group-hover:scale-110">
                                        <span className="text-xs sm:text-sm md:text-xl font-bold text-white">
                                            {isDataVisible ? ordersInStatus.length : '∗'}
                                        </span>
                                    </div>
                                    {!isTopLabel && (
                                        <span className="absolute top-full mt-2 text-center text-[10px] sm:text-xs md:text-sm text-gray-600 font-bold whitespace-pre-line leading-tight w-max">
                                            {labelContent}
                                        </span>
                                    )}
                                </button>
                            </div>
                            {!isLast && (
                                <div className="flex-auto h-0.5 md:h-1 bg-gray-300 mt-4 sm:mt-5 md:mt-6 -mx-1" />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};