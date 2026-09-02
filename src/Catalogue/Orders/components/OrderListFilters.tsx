import React from 'react';
import { FiSearch, FiX } from 'react-icons/fi';
import { IconFilter } from '../../../constants/Icons';
import { TutorialStep } from '../../../Components/TutorialStep';
import NotificationBell from '../../../Components/NotificationBell';
import ShowWrapper from '../../../context/ShowWrapper';
import { Cata_Permissions } from '../../enum/cata_permissions.enum';
import type { OrderStatus } from '../orders.types';

interface OrderListFiltersProps {
    // tutorial
    tutorialStep: number;
    next: (n: number) => void;
    skip: () => void;
    setTutorialRef: (index: number) => (el: HTMLElement | null) => void;

    // search
    showSearch: boolean;
    setShowSearch: (v: boolean) => void;
    searchQuery: string;
    setSearchQuery: (v: string) => void;

    // date filter
    dateDisplay: string;
    isFilterOpen: boolean;
    setIsFilterOpen: (v: boolean) => void;
    filterRef: React.RefObject<HTMLDivElement | null>;
    dateFilters: { label: string; value: string }[];
    activeDateFilter: string;
    handleDateFilterSelect: (value: string) => void;
    customDateRange: { start: string; end: string };
    setCustomDateRange: React.Dispatch<React.SetStateAction<{ start: string; end: string }>>;
    handleApplyCustomDate: () => void;

    // customer requests nav
    pendingRequestCount: number;
    onRequestsClick: () => void;

    // status stepper
    orderStatuses: OrderStatus[];
    activeStatusTab: OrderStatus;
    setActiveStatusTab: (status: OrderStatus) => void;
    statusCounts: Record<string, number>;

    // payment filter (Completed tab only)
    paymentFilter: 'paid' | 'unpaid';
    setPaymentFilter: (f: 'paid' | 'unpaid') => void;
}

export const OrderListFilters: React.FC<OrderListFiltersProps> = ({
    tutorialStep,
    next,
    skip,
    setTutorialRef,
    showSearch,
    setShowSearch,
    searchQuery,
    setSearchQuery,
    dateDisplay,
    isFilterOpen,
    setIsFilterOpen,
    filterRef,
    dateFilters,
    activeDateFilter,
    handleDateFilterSelect,
    customDateRange,
    setCustomDateRange,
    handleApplyCustomDate,
    pendingRequestCount,
    onRequestsClick,
    orderStatuses,
    activeStatusTab,
    setActiveStatusTab,
    statusCounts,
    paymentFilter,
    setPaymentFilter,
}) => {
    return (
        <>
            {/* --- 5. UPDATED HEADER (No Toggle) --- */}
            <div className="bg-white shadow-sm sticky top-0 z-[100] px-4 py-2">
                {/* Main Header Row */}
                <div className="flex items-center justify-between">
                    {/* Left: Search Icon - Changed w-10 to w-24 and added flex justify-start */}
                    <div className="w-24 flex justify-start">
                        <TutorialStep
                            step={1}
                            currentStep={tutorialStep}
                            text="Tap the search icon to find orders by name, order ID, or phone."
                            onNext={() => next(2)}
                            onSkip={skip}
                        >
                            <button onClick={() => setShowSearch(!showSearch)} className="text-slate-500">
                                {showSearch ? <FiX className="w-6 h-6" /> : <FiSearch className="w-6 h-6" />}
                            </button>
                        </TutorialStep>
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
                            <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
                        )}

                        {/* Date Filter - Just below Header */}
                        <TutorialStep
                            step={2}
                            currentStep={tutorialStep}
                            text="This shows the date range currently applied to your orders."
                            onNext={() => next(3)}
                            onSkip={skip}
                        >
                            <div className="mt-0.5">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    {dateDisplay}
                                </span>
                            </div>
                        </TutorialStep>
                    </div>

                    {/* Right: Notification Bell + Filter Icon */}
                    <div className="w-24 flex justify-end items-center gap-2">
                        <ShowWrapper requiredPermission={Cata_Permissions.ViewNotification}>
                            <div className="border border-slate-300 rounded-sm bg-gray-100 shadow-sm flex items-center justify-center">
                                <NotificationBell />
                            </div>
                        </ShowWrapper>
                        {/* //<CataShowWrapper permission={Cata_Permissions.ViewFilterbutton}> */}
                        <div className="relative" ref={filterRef}>
                            <TutorialStep
                                step={3}
                                currentStep={tutorialStep}
                                text="Use this filter to quickly jump to Today, Last 7 Days, Last 30 Days, and more."
                                onNext={() => next(4)}
                                onSkip={skip}
                            >
                                <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="text-slate-500 hover:text-slate-800 cursor-pointer">
                                    <IconFilter />
                                </button>
                            </TutorialStep>

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
                        {/* </CataShowWrapper> */}
                    </div>
                </div>
            </div>

            {/* --- 6. UPDATED STEPPER SECTION --- */}
            <div className={`bg-white shadow-sm sticky z-[50] border-b top-[72px]`}>

                {/* Request Page */}
                <div
                    onClick={onRequestsClick}
                    className="mx-3 mt-2 mb-2 rounded-sm cursor-pointer bg-white border border-slate-200 px-3 py-2 flex items-center justify-between shadow-sm hover:bg-slate-50 active:scale-[0.99] transition-all">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Customer Requests
                        </span>
                        <span className="text-xs font-black text-slate-800">
                            View All Requests →
                        </span>
                    </div>


                    <div className="min-w-[26px] h-[22px] px-2 flex items-center justify-center
                    text-[11px] font-black rounded-sm
                    bg-red-500 text-white">
                        {pendingRequestCount}
                    </div>
                </div>

                {/* ORDER TIMELINE */}
                <TutorialStep
                    step={4}
                    currentStep={tutorialStep}
                    text="Track your order here — from Upcoming to Confirmed, Packed, and Completed."
                    onNext={() => next(5)}
                    onSkip={skip}
                >
                    <div ref={setTutorialRef(4) as any} className="flex items-center w-full px-2 md:px-10 pt-9 pb-9 bg-white">
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
                                        <span
                                            className={`absolute ${index % 2 === 0 ? 'bottom-full mb-2' : 'top-full mt-2'
                                                } text-center text-[8px] sm:text-[10px] md:text-[11px] uppercase tracking-tighter ${isActive ? 'text-[#F97316] font-black' : 'text-gray-400 font-bold'} whitespace-nowrap`}
                                        >
                                            {status}
                                        </span>
                                        <div
                                            className={`relative w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center transition-all duration-300 z-10 ${status === "Upcoming"
                                                ? "bg-orange-500 text-white"
                                                : isCompleted || isActive
                                                    ? "bg-orange-500 text-white"
                                                    : "bg-gray-200 text-gray-500"
                                                } ${isActive ? "scale-110 shadow-md ring-2 ring-orange-100" : ""}`}
                                        >

                                            {/* {status === "Upcoming" ? (
                                        //     <span className="absolute px-1 py-[2px] text-[5px] font-black uppercase rounded-full bg-orange-100 text-[#F97316] border border-orange-300 whitespace-nowrap">
                                        //         Coming Soon
                                        //     </span>
                                        // ) : ( */}
                                            <span className="text-[10px] md:text-xs font-black">
                                                {count}
                                            </span>

                                        </div>
                                    </div>

                                    {index < orderStatuses.length - 1 && (
                                        <div
                                            className={`flex-auto h-0.5 md:h-1.5 transition-colors duration-500 ${index < activeIndex ? 'bg-[#F97316]' : 'bg-gray-200'
                                                }`}
                                        />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </TutorialStep>
            </div>
            {activeStatusTab === 'Completed' && (
                <div className="sticky top-[248px] z-[90] flex p-1 bg-white mx-4 mt-2 rounded-sm shadow-sm border border-slate-200 max-w-md md:mx-auto w-[92%]">
                    {(['unpaid', 'paid'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setPaymentFilter(f)}
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
        </>
    );
};
