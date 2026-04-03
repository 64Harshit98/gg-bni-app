import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { useFilter } from './Filter';
import { Spinner } from '../constants/Spinner';
import type { OrderStatus } from '../Catalogue/Orders';

const orderStatuses: (OrderStatus | 'Upcoming')[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];

// ── Props (counts come from HomePage, no internal fetch) ─────────────────────
interface OrderTimelineProps {
    isDataVisible: boolean;
    orderCounts: Record<string, number>;
    loading: boolean;
}

export const OrderTimeline: React.FC<OrderTimelineProps> = ({
    isDataVisible,
    orderCounts,
    loading,
}) => {
    const { filters } = useFilter();
    const navigate = useNavigate();

    const selectedPeriodText = useMemo(() => {
        if (!filters.startDate || !filters.endDate) return '';
        const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
        const s = new Date(filters.startDate); s.setHours(0, 0, 0, 0);
        const e = new Date(filters.endDate); e.setHours(23, 59, 59, 999);
        const start = s.toLocaleDateString('en-IN', opts);
        const end = e.toLocaleDateString('en-IN', opts);
        return start === end ? `for ${start}` : `from ${start} to ${end}`;
    }, [filters.startDate, filters.endDate]);

    const handleViewStatus = (status: OrderStatus | 'Upcoming') => {
        navigate(ROUTES.ORDERDETAILS, {
            state: {
                defaultStatus: status,
                startDate: filters.startDate,
                endDate: filters.endDate
            }
        });
    };

    if (loading) {
        return (
            <div className="flex justify-center p-8 bg-white rounded-lg shadow-md">
                <Spinner />
            </div>
        );
    }

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
                    const count = orderCounts[status] ?? 0;
                    const isLast = index === orderStatuses.length - 1;
                    const labelContent = status === "Upcoming" ? "Upcoming" : status.replace(' & ', ' &\n');
                    const isTopLabel = index % 2 === 0;

                    return (
                        <React.Fragment key={status}>
                            <div className="flex flex-col items-center flex-1 min-w-0">
                                <button
                                    className={`relative flex flex-col items-center w-full group ${status === "Upcoming" ? "cursor-not-allowed" : "cursor-pointer"}`}
                                    onClick={() => {
                                        if (status !== "Upcoming") {
                                            handleViewStatus(status as any);
                                        }
                                    }}
                                >
                                    {isTopLabel && (
                                        <span className="absolute bottom-full mb-2 text-center text-[10px] sm:text-xs md:text-sm text-gray-600 font-bold whitespace-pre-line leading-tight w-max">
                                            {labelContent}
                                        </span>
                                    )}
                                    <div className="relative w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-full bg-orange-400 flex items-center justify-center transition-all duration-300 z-10 border-2 md:border-4 border-yellow-500 shadow-sm group-hover:scale-110">
                                        {status === "Upcoming" ? (
                                            <span className="absolute px-1 py-[2px] text-[6px] font-black uppercase rounded-full bg-orange-100 text-orange-700 border border-orange-300 whitespace-nowrap">
                                                Coming Soon
                                            </span>
                                        ) : (
                                            <span className="text-xs sm:text-sm md:text-xl font-bold text-white">
                                                {isDataVisible ? count : '∗'}
                                            </span>
                                        )}
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