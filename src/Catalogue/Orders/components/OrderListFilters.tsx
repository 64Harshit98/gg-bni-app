import React from 'react';
import { FiSearch, FiX, FiChevronRight, FiMessageSquare, FiCalendar, FiFilter } from 'react-icons/fi';
import { IconFilter } from '../../../constants/Icons';
import { TutorialStep } from '../../../Components/TutorialStep';
//import NotificationBell from '../../../Components/NotificationBell';
//import ShowWrapper from '../../../context/ShowWrapper';
//import { Cata_Permissions } from '../../enum/cata_permissions.enum';
import type { OrderStatus } from '../orders.types';
import CustomRangePopover from './CustomRangePopover'; // path apne hisaab se

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

    // desktop (>=1024px) uses the SELLAR left-aligned page header
    isDesktop: boolean;
}

// UI-only: short "what to do here" hint under each stage name
const STAGE_HINTS: Record<string, string> = {
    Upcoming: 'New — confirm them',
    Confirmed: 'Pack and send',
    Packed: 'Ready to hand over',
    Completed: 'Delivered',
};

// UI-only: outlined 40px icon button used in the mobile header (search / filter)
const MOBILE_ICON_BTN = 'w-10 h-10 rounded-sm border border-[#f6e1d0] bg-white grid place-items-center text-slate-700 hover:bg-[#fff8f2] active:scale-95 transition';

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
    isDesktop,
}) => {
    // Shared by mobile + desktop headers
    const dateDropdown = isFilterOpen && (
        <div className="absolute top-full right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-sm shadow-xl z-[1000] border border-[#f6e1d0] p-2">
            <ul className="pb-1">
                {dateFilters.map((filter) => (
                    <li key={filter.value}>
                        <button
                            onClick={() => handleDateFilterSelect(filter.value)}
                            className={`w-full text-left px-3 py-2 text-sm rounded-sm transition ${activeDateFilter === filter.value
                                ? 'bg-[#ffedd5] text-[#9a3412] font-semibold'
                                : 'text-slate-700 hover:bg-[#fff8f2]'}`}
                        >
                            {filter.label}
                        </button>
                    </li>
                ))}
            </ul>
                        {activeDateFilter === 'custom' && (
                <CustomRangePopover
                    start={customDateRange.start}
                    end={customDateRange.end}
                    onChange={setCustomDateRange}
                    onApply={handleApplyCustomDate}
                    onCancel={() => setIsFilterOpen(false)}
                />
            )}
        </div>
    );

    return (
        <>
            {isDesktop ? (
                /* ───────── DESKTOP PAGE HEADER (SELLAR: title left, search + date range + Filter right) ───────── */
                <div className="bg-[#fff5ec] sticky top-0 z-[100] px-6 h-[72px] flex items-center">
                    <div className="flex items-center gap-4 w-full">
                        <div className="min-w-0">
                            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 leading-8">Orders</h1>
                            <TutorialStep
                                step={2}
                                currentStep={tutorialStep}
                                text="This shows the date range currently applied to your orders."
                                onNext={() => next(3)}
                                onSkip={skip}
                            >
                                <p className="text-[13px] text-slate-600 leading-5 truncate">
                                    Catalogue orders · {dateDisplay}
                                </p>
                            </TutorialStep>
                        </div>

                        <div className="ml-auto flex items-center gap-2">
                            <TutorialStep
                                step={1}
                                currentStep={tutorialStep}
                                text="Search orders by name, order ID, or phone."
                                onNext={() => next(2)}
                                onSkip={skip}
                            >
                                <label className="flex items-center gap-2 w-[280px] h-10 px-3 bg-white border border-[#f6e1d0] rounded-sm text-slate-400 focus-within:border-[#ea580c] focus-within:ring-2 focus-within:ring-[#ea580c]/20 transition">
                                    <FiSearch className="w-4 h-4 shrink-0" />
                                    <input
                                        type="text"
                                        placeholder="Search name, phone or order no."
                                        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-slate-800 placeholder:text-slate-400"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </label>
                            </TutorialStep>

                            {/* Date range chip + Filter button (both open the same date-filter dropdown) */}
                            <div className="relative flex items-center gap-2" ref={filterRef}>
                                <button
                                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                                    aria-label="Date range"
                                    className="h-10 px-4 rounded-sm border border-[#f6e1d0] bg-white text-slate-800 hover:bg-[#fff8f2] flex items-center gap-2 text-sm font-medium whitespace-nowrap transition active:scale-[0.98]"
                                >
                                    <FiCalendar className="w-4 h-4" />
                                    {dateDisplay}
                                </button>

                                <TutorialStep
                                    step={3}
                                    currentStep={tutorialStep}
                                    text="Use this filter to quickly jump to Today, Last 7 Days, Last 30 Days, and more."
                                    onNext={() => next(4)}
                                    onSkip={skip}
                                >
                                    <button
                                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                                        aria-label="Filter by date"
                                        className={`h-10 px-4 rounded-sm border border-[#f6e1d0] flex items-center gap-2 text-sm font-medium whitespace-nowrap transition active:scale-[0.98] ${isFilterOpen
                                            ? 'bg-[#ffedd5] text-[#9a3412]'
                                            : 'bg-white text-slate-800 hover:bg-[#fff8f2]'}`}
                                    >
                                        <FiFilter className="w-4 h-4" />
                                        Filter
                                    </button>
                                </TutorialStep>
                                {dateDropdown}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
            /* ───────── MOBILE PAGE HEADER (fixed 72px so the stage bar can stick right under it) ─────────
               SELLAR: title + date range left-aligned, outlined Search + Filter buttons on the right */
            <div className="bg-[#fff5ec] sticky top-0 z-[100] px-4 md:px-6 h-[72px] flex items-center">
                <div className="flex items-center w-full gap-2">
                    {/* Left: Title / search input + date range */}
                    <div className="flex-1 min-w-0 flex flex-col items-start justify-center">
                        {showSearch ? (
                            <input
                                type="text"
                                placeholder="Search name, phone or order no."
                                className="w-full h-9 px-3 text-sm text-slate-800 bg-white border border-[#f6e1d0] rounded-sm placeholder:text-slate-400 focus:border-[#ea580c] focus:ring-2 focus:ring-[#ea580c]/20 outline-none transition"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                autoFocus
                            />
                        ) : (
                            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-slate-900 leading-7">Orders</h1>
                        )}

                        <TutorialStep
                            step={2}
                            currentStep={tutorialStep}
                            text="This shows the date range currently applied to your orders."
                            onNext={() => next(3)}
                            onSkip={skip}
                        >
                            <div className="mt-0.5">
                                <span className="text-xs font-medium text-slate-500">
                                    {dateDisplay}
                                </span>
                            </div>
                        </TutorialStep>
                    </div>

                    {/* Right: Search */}
                    <TutorialStep
                        step={1}
                        currentStep={tutorialStep}
                        text="Tap the search icon to find orders by name, order ID, or phone."
                        onNext={() => next(2)}
                        onSkip={skip}
                    >
                        <button
                            onClick={() => setShowSearch(!showSearch)}
                            aria-label={showSearch ? 'Close search' : 'Search orders'}
                            className={MOBILE_ICON_BTN}
                        >
                            {showSearch ? <FiX className="w-5 h-5" /> : <FiSearch className="w-5 h-5" />}
                        </button>
                    </TutorialStep>

                    {/* Right: Filter */}
                    {/* <ShowWrapper requiredPermission={Cata_Permissions.ViewNotification}>
                        <div className="hidden sm:flex items-center justify-center border border-slate-300 rounded-sm bg-gray-100 shadow-sm">
                            <NotificationBell />
                        </div>
                    </ShowWrapper> */}
                    {/* //<CataShowWrapper permission={Cata_Permissions.ViewFilterbutton}> */}
                    <div className="relative" ref={filterRef}>
                        <TutorialStep
                            step={3}
                            currentStep={tutorialStep}
                            text="Use this filter to quickly jump to Today, Last 7 Days, Last 30 Days, and more."
                            onNext={() => next(4)}
                            onSkip={skip}
                        >
                            <button
                                onClick={() => setIsFilterOpen(!isFilterOpen)}
                                aria-label="Filter by date"
                                className={`${MOBILE_ICON_BTN} cursor-pointer ${isFilterOpen ? '!bg-[#ffedd5] text-[#c2410c]' : ''}`}
                            >
                                <IconFilter />
                            </button>
                        </TutorialStep>

                        {dateDropdown}
                    </div>
                    {/* </CataShowWrapper> */}
                </div>
            </div>
            )}

            {/* ───────── CUSTOMER REQUESTS CARD (scrolls away) ───────── */}
            <div className="px-3 md:px-6 pt-3 bg-[#fff5ec]">
                <div
                    onClick={onRequestsClick}
                    role="button"
                    className="flex items-center gap-3 rounded-sm cursor-pointer bg-white border border-[#f6e1d0] px-3 py-2.5 sm:px-4 sm:py-3 shadow-sm hover:bg-[#fff8f2] active:scale-[0.995] transition"
                >
                    {/* mobile: plain small icon · tablet/desktop: tinted icon box */}
                    <FiMessageSquare className="sm:hidden w-4 h-4 shrink-0 text-slate-600" />
                    <span className="hidden sm:grid w-9 h-9 rounded-sm place-items-center bg-[#ffedd5] text-[#9a3412] shrink-0">
                        <FiMessageSquare className="w-[18px] h-[18px]" />
                    </span>
                    <div className="flex-1 min-w-0">
                        <div className="text-[13px] sm:text-sm font-semibold text-slate-900">
                            {pendingRequestCount} customer request{pendingRequestCount === 1 ? '' : 's'}
                        </div>
                        <div className="hidden sm:block text-xs text-slate-500 truncate">
                            Items customers asked for that aren’t in your catalogue
                        </div>
                    </div>
                    <span className="sm:hidden text-xs font-medium text-[#c2410c]">View</span>
                    <span className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-[#9a3412] border border-[#f6e1d0] rounded-sm px-2.5 py-1.5 bg-white">
                        View requests <FiChevronRight className="w-3.5 h-3.5" />
                    </span>
                </div>
            </div>

            {/* ───────── STAGE TABS (sticky under the header) ───────── */}
            <div className="sticky top-[72px] z-[50] bg-[#fff5ec] px-3 md:px-6 pt-3 pb-2">
                <TutorialStep
                    step={4}
                    currentStep={tutorialStep}
                    text="Track your order here — from Upcoming to Confirmed, Packed, and Completed."
                    onNext={() => next(5)}
                    onSkip={skip}
                >
                    {/* mobile: compact horizontal chips (swipe) · md+: 4 equal cards with hint */}
                    <div
                        ref={setTutorialRef(4) as any}
                        className="flex gap-1.5 overflow-x-auto md:grid md:grid-cols-4 md:gap-2 md:overflow-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                        {orderStatuses.map((status) => {
                            const isActive = status === activeStatusTab;
                            const count = statusCounts[status] || 0;
                            const isHot = status === 'Upcoming' && count > 0;

                            return (
                                <button
                                    key={status}
                                    type="button"
                                    aria-pressed={isActive}
                                    onClick={() => setActiveStatusTab(status)}
                                    className={`flex-none md:flex-auto min-w-0 flex items-center gap-2 md:gap-3 rounded-sm text-left px-2.5 py-2 md:px-3 md:py-2.5 transition active:scale-[0.98] ${isActive
                                        ? 'bg-[#ffedd5] border-2 border-[#c2410c] px-[9px] py-[7px] md:px-[11px] md:py-[9px]'
                                        : 'bg-white border border-[#f6e1d0] hover:bg-[#fff8f2]'}`}
                                >
                                    <span
                                        className={`shrink-0 w-[26px] h-[26px] md:w-9 md:h-9 rounded-full grid place-items-center text-xs md:text-sm font-semibold ${isActive
                                            ? 'bg-[#c2410c] text-white'
                                            : isHot
                                                ? 'bg-[#f97316] text-white'
                                                : 'bg-[#fff8f2] text-slate-600'}`}
                                    >
                                        {count}
                                    </span>
                                    <span className="min-w-0">
                                        <span className={`block whitespace-nowrap md:truncate text-xs md:text-[13px] font-semibold ${isActive ? 'text-[#9a3412]' : 'text-slate-800'}`}>
                                            {status}
                                        </span>
                                        <span className="hidden md:block truncate text-[11px] text-slate-500">
                                            {STAGE_HINTS[status] ?? ''}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </TutorialStep>

                {/* Payment filter — sits inside the sticky block so no magic top offset is needed */}
                {activeStatusTab === 'Completed' && (
                    <div className="mt-2 flex p-1 bg-white rounded-sm border border-[#f6e1d0] w-full max-w-xs md:max-w-sm">
                        {(['unpaid', 'paid'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setPaymentFilter(f)}
                                className={`flex-1 py-1.5 text-xs font-semibold capitalize rounded-sm transition ${paymentFilter === f
                                    ? 'bg-[#c2410c] text-white shadow-sm'
                                    : 'text-slate-600 hover:bg-[#fff8f2]'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};