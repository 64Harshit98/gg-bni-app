import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { useFilter } from './Filter';
import { Spinner } from '../constants/Spinner';
import { Card } from './ui/card';
import type { OrderStatus } from '../Catalogue/Orders';

const orderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];

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

    const handleViewStatus = (status: OrderStatus) => {
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
            <Card className="flex h-full items-center justify-center rounded-2xl border border-border/70 py-4 shadow-sm">
                <Spinner />
            </Card>
        );
    }

    return (
        <Card className="h-full gap-3 rounded-2xl border border-border/70 border-t-2 border-t-primary py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
            <div className="flex flex-col items-center px-4">
                <h2 className="text-sm font-semibold text-foreground">Order Journey</h2>
                <span className="bg-primary/10 text-primary text-[11px] font-bold px-2 py-0.5 rounded-full mt-1 uppercase">
                    {selectedPeriodText}
                </span>
            </div>

            <div className="flex items-start w-full px-3 md:px-5 pt-12 pb-8">
                {orderStatuses.map((status, index) => {
                    const count = orderCounts[status] ?? 0;
                    const isLast = index === orderStatuses.length - 1;
                    const labelContent = status === "Upcoming" ? "Upcoming" : status.replace(' & ', ' &\n');
                    const isTopLabel = index % 2 === 0;

                    return (
                        <React.Fragment key={status}>
                            <div className="flex flex-col items-center flex-1 min-w-0">
                                <button
                                    className="relative flex flex-col items-center w-full group"
                                    onClick={() => handleViewStatus(status)}
                                >
                                    {isTopLabel && (
                                        <span className="absolute bottom-full mb-2 text-center text-[10px] sm:text-xs text-muted-foreground font-semibold whitespace-pre-line leading-tight w-max">
                                            {labelContent}
                                        </span>
                                    )}
                                    <div className="bg-gradient-brand relative w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all duration-300 z-10 border-2 md:border-4 border-card shadow-md shadow-primary/20 group-hover:scale-110">
                                        <span className="text-xs sm:text-sm md:text-base font-bold text-white">
                                            {isDataVisible ? count : '∗'}
                                        </span>
                                    </div>
                                    {!isTopLabel && (
                                        <span className="absolute top-full mt-2 text-center text-[10px] sm:text-xs text-muted-foreground font-semibold whitespace-pre-line leading-tight w-max">
                                            {labelContent}
                                        </span>
                                    )}
                                </button>
                            </div>
                            {!isLast && (
                                <div className="flex-auto h-0.5 bg-border mt-4 sm:mt-5 -mx-1" />
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </Card>
    );
};
