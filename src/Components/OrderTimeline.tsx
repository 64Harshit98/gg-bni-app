import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes.constants';
import { useFilter } from './Filter';
import { Spinner } from '../constants/Spinner';
import type { OrderStatus } from '../Catalogue/Orders';
import { CatCard, CardHead, Ico, ICONS } from '../Components/ui/Catalogueui'

const orderStatuses: OrderStatus[] = ['Upcoming', 'Confirmed', 'Packed', 'Completed'];
const stageHint: Record<string, string> = {
    Upcoming: 'To confirm',
    Confirmed: 'To pack',
    Packed: 'Ready to send',
    Completed: 'Delivered',
};

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

    const handleViewStatus = (status: OrderStatus) => {
        navigate(ROUTES.ORDERDETAILS, {
            state: {
                defaultStatus: status,
                startDate: filters.startDate,
                endDate: filters.endDate
            }
        });
    };

    const handleViewAll = () => {
        navigate(ROUTES.ORDERDETAILS, {
            state: { startDate: filters.startDate, endDate: filters.endDate }
        });
    };

    if (loading) {
        return (
            <CatCard className="flex justify-center p-8">
                <Spinner />
            </CatCard>
        );
    }

    const toConfirm = orderCounts.Upcoming ?? 0;
    const toPack = orderCounts.Confirmed ?? 0;
    const waiting = toConfirm + toPack;
    // Packing comes first when there is something confirmed, otherwise confirm new orders
    const nextStatus: OrderStatus = toPack > 0 ? 'Confirmed' : 'Upcoming';

    return (
        <CatCard>
            <CardHead
                title="Order journey"
                sub="Where your orders are right now · tap a stage to open those orders"
                right={
                    <button
                        onClick={handleViewAll}
                        className="inline-flex h-8 items-center gap-2 whitespace-nowrap rounded-sm border border-slate-400 bg-white px-3 text-[13px] font-medium text-slate-900 transition-colors hover:bg-[#fff8f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600"
                    >
                        <Ico d={ICONS.orders} size={16} />
                        All orders
                    </button>
                }
            />

            <div className="mt-2 grid grid-cols-4">
                {orderStatuses.map((status, index) => {
                    const count = orderCounts[status] ?? 0;
                    const isLast = index === orderStatuses.length - 1;
                    // When figures are hidden, don't leak which stages are empty
                    const isActive = isDataVisible ? count > 0 : true;
                    const isDone = status === 'Completed';
                    const dotClass = isDone
                        ? 'border-transparent bg-[#e9faef] text-[#008236]'
                        : isActive
                            ? 'border-orange-700 bg-orange-700 text-white'
                            : 'border-[#f6e1d0] bg-[#fff8f2] text-slate-500';

                    return (
                        <button
                            key={status}
                            onClick={() => handleViewStatus(status)}
                            className={`group relative flex flex-col items-center gap-1.5 rounded-sm px-1.5 py-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 ${
                                !isLast
                                    ? "after:absolute after:h-0.5 after:bg-[#f6e1d0] after:content-[''] after:top-[23px] after:left-[calc(50%+22px)] after:right-[calc(-50%+22px)] sm:after:top-[26px] sm:after:left-[calc(50%+26px)] sm:after:right-[calc(-50%+26px)]"
                                    : ''
                            }`}
                        >
                            <span className={`relative z-10 grid h-[38px] w-[38px] place-items-center rounded-full border-2 text-[15px] font-semibold transition-transform group-hover:scale-105 sm:h-11 sm:w-11 sm:text-[17px] ${dotClass}`}>
                                {isDataVisible ? count : '∗'}
                            </span>
                            <b className="text-[13px] font-semibold text-slate-900">{status}</b>
                            <small className={`hidden text-[11px] leading-[14px] sm:block ${isActive && !isDone ? 'font-medium text-orange-700' : 'text-slate-500'}`}>
                                {stageHint[status]}
                            </small>
                        </button>
                    );
                })}
            </div>

            {/* Waiting-on-you bar */}
            <div className="mt-3.5 flex items-center gap-3 rounded-sm bg-orange-100 px-3 py-2.5 sm:px-3.5 sm:py-3">
                <Ico d={ICONS.clock} size={20} className="hidden text-orange-800 sm:block" />
                <span className="flex-1 text-xs text-slate-900 sm:text-[13px]">
                    {!isDataVisible ? (
                        <>Show figures to see what is waiting on you.</>
                    ) : waiting === 0 ? (
                        <><b>All caught up.</b> Nothing is waiting on you.</>
                    ) : (
                        <>
                            <b>{waiting} {waiting === 1 ? 'order is' : 'orders are'} waiting on you.</b>{' '}
                            <span className="hidden sm:inline">
                                Confirm {toConfirm} new {toConfirm === 1 ? 'order' : 'orders'} and pack {toPack} confirmed {toPack === 1 ? 'one' : 'ones'} so customers aren’t kept waiting.
                            </span>
                            <span className="sm:hidden">· {toConfirm} to confirm, {toPack} to pack</span>
                        </>
                    )}
                </span>
                {isDataVisible && waiting > 0 && (
                    <button
                        onClick={() => handleViewStatus(nextStatus)}
                        className="inline-flex h-8 items-center whitespace-nowrap rounded-sm bg-orange-700 px-3 text-[13px] font-medium text-white transition-colors hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2"
                    >
                        <span className="hidden sm:inline">{toPack > 0 ? 'Start packing' : 'Review orders'}</span>
                        <span className="sm:hidden">Open</span>
                    </button>
                )}
            </div>
        </CatCard>
    );
};