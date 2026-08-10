import React from 'react';
import { CustomToggle, CustomToggleItem } from '../../../Components/CustomToggle';
import { CustomButton } from '../../../Components/CustomButton';
import { Variant } from '../../../enums';
import { IconChevronDown, IconClose, IconFilter, IconSearch } from '../../../constants/Icons';
import { TutorialStep } from '../../../Components/TutorialStep';
import { Permissions } from '../../../enums/permissions.enum';
import ShowWrapper from '../../../context/ShowWrapper';
import NotificationBell from '../../../Components/NotificationBell';

interface JournalListFiltersProps {
  // tutorial
  tutorialStep: number;
  next: (n: number) => void;
  skip: () => void;
  setTutorialRef: (index: number) => (el: HTMLElement | null) => void;

  // filter dropdown
  filterRef: React.RefObject<HTMLDivElement | null>;
  isFilterOpen: boolean;
  setIsFilterOpen: (v: boolean) => void;
  dateFilters: { label: string; value: string }[];
  activeDateFilter: string;
  setActiveDateFilter: (v: string) => void;
  handleDateFilterSelect: (value: string) => void;

  // search
  showSearch: boolean;
  setShowSearch: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;

  // date label / custom picker
  selectedPeriodText: string;
  showCustomPicker: boolean;
  setShowCustomPicker: (v: boolean) => void;
  customStartDate: string;
  setCustomStartDate: (v: string) => void;
  customEndDate: string;
  setCustomEndDate: (v: string) => void;

  // Sales/Purchase toggle
  activeType: 'Debit' | 'Credit';
  setActiveType: (v: 'Debit' | 'Credit') => void;
  hasPermission: (perm: Permissions) => boolean;

  // Paid/Unpaid toggle
  activeTab: 'Paid' | 'Unpaid';
  setActiveTab: (v: 'Paid' | 'Unpaid') => void;

  // Total receivables/payables banner
  totalUnpaidAmount: number;
}

export const JournalListFilters: React.FC<JournalListFiltersProps> = ({
  tutorialStep,
  next,
  skip,
  setTutorialRef,
  filterRef,
  isFilterOpen,
  setIsFilterOpen,
  dateFilters,
  activeDateFilter,
  setActiveDateFilter,
  handleDateFilterSelect,
  showSearch,
  setShowSearch,
  searchQuery,
  setSearchQuery,
  selectedPeriodText,
  showCustomPicker,
  setShowCustomPicker,
  customStartDate,
  setCustomStartDate,
  customEndDate,
  setCustomEndDate,
  activeType,
  setActiveType,
  hasPermission,
  activeTab,
  setActiveTab,
  totalUnpaidAmount,
}) => {
  return (
    <>
      {/* Row 1: Title + Filter icon */}
      <div className="flex items-center justify-between px-4 pt-2 relative">
        {/* Filter + notification block moved OUTSIDE the flex-1 container, at the true top-right of header */}
        <div
          ref={filterRef}
          className="absolute top-4 right-4 flex items-center gap-2 z-30"
        >
          <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
            <div className="border border-slate-300 rounded-sm bg-gray-100 shadow-sm flex items-center justify-center">
              <NotificationBell />
            </div>
          </ShowWrapper>

          <TutorialStep
            step={3}
            currentStep={tutorialStep}
            text="Use this filter to quickly jump to Today, Last 7 Days, Last 30 Days, and more."
            onNext={() => next(4)}
            onSkip={skip}
          >
            <button
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="text-slate-500 hover:text-slate-800 transition-colors"
            >
              <IconFilter />
            </button>
          </TutorialStep>

          {isFilterOpen && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-sm shadow-lg z-50 border overflow-hidden">
              <ul className="py-1">
                {dateFilters.map((filter) => (
                  filter.value !== 'custom' && (
                    <li key={filter.value}>
                      <button
                        onClick={() => { handleDateFilterSelect(filter.value); setIsFilterOpen(false); }}
                        className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === filter.value ? 'bg-slate-100 text-slate-900' : 'text-slate-700'} hover:bg-slate-50`}
                      >
                        {filter.label}
                      </button>
                    </li>
                  )
                ))}
                <li>
                  <button
                    onClick={() => { setActiveDateFilter('custom'); setIsFilterOpen(false); setShowCustomPicker(true); }}
                    className={`w-full text-left px-4 py-2 text-sm ${activeDateFilter === 'custom' ? 'bg-slate-100 text-slate-900' : 'text-slate-700'} hover:bg-slate-50`}
                  >
                    Custom Range
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center relative">
          <h1 className="text-2xl font-bold text-slate-800">Transactions</h1>

          {/* Step 2 — date label */}
          <TutorialStep
            step={2}
            currentStep={tutorialStep}
            text="Tap the date to pick a custom range for your transactions."
            onNext={() => next(3)}
            onSkip={skip}
          >
            <div
              ref={setTutorialRef(2) as any}
              className="flex items-center w-full relative"
            >
              <TutorialStep
                step={1}
                currentStep={tutorialStep}
                text="Tap the search icon to find invoices by name, number, or phone."
                onNext={() => next(2)}
                onSkip={skip}
                mobileArrowAlign="left"
              >
                <button
                  onClick={() => setShowSearch(!showSearch)}
                  className="text-slate-500 hover:text-slate-800 transition-colors ml-0 -mt-1"
                >
                  <span className="relative -top-1">
                    {showSearch ? <IconClose /> : <IconSearch />}
                  </span>
                </button>
              </TutorialStep>

              <div
                onClick={() => {
                  if (showCustomPicker) {
                    setShowCustomPicker(false);
                  } else {
                    setShowCustomPicker(true);
                    setActiveDateFilter('custom');
                  }
                }}
                className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 cursor-pointer hover:bg-gray-200 px-3 py-1 rounded-sm transition-colors select-none"
              >
                <p className='text-center text-sm font-light text-slate-600'>{selectedPeriodText}</p>
                <IconChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${showCustomPicker ? 'rotate-180' : ''}`} />
              </div>

            </div>
          </TutorialStep>

          {showCustomPicker && (
            <div className="absolute top-full bg-white shadow-xl border border-gray-200 rounded-sm p-4 z-50 min-w-[300px] flex flex-col gap-4 animate-in fade-in zoom-in duration-200 cursor-default">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col">
                  <label className="text-center text-xs font-semibold text-gray-500 mb-1">From</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => { setCustomStartDate(e.target.value); setActiveDateFilter('custom'); }}
                    className="border border-gray-300 rounded-sm px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-center text-xs font-semibold text-gray-500 mb-1">To</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => { setCustomEndDate(e.target.value); setActiveDateFilter('custom'); }}
                    className="border border-gray-300 rounded-sm px-2 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div className="flex justify-center text-center border-t border-gray-100 -mt-2 -mb-2">
                <button
                  onClick={() => setShowCustomPicker(false)}
                  className="flex-grow bg-black text-white text-sm px-4 py-2 rounded-sm hover:bg-gray-800 transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
          {/* Inserted search input below the date line */}
          {showSearch && (
            <div className="mt-1 w-full max-w-md px-4">
              <input
                type="text"
                placeholder="Search by Invoice, Name, or Phone..."
                className="w-full text-base font-light p-1 border-b-2 border-slate-300 focus:border-slate-800 outline-none transition-colors bg-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
          )}
        </div>
      </div>

      {/* Step 4 — Sales / Purchase toggle */}
      <TutorialStep
        step={4}
        currentStep={tutorialStep}
        text="Switch between Sales (money received) and Purchase (money spent) transactions here."
        onNext={() => next(5)}
        onSkip={skip}
      >
        <div className="flex justify-center border-b border-gray-500 p-2 mb-2">
          <CustomButton variant={Variant.Transparent} active={activeType === 'Credit'} onClick={() => setActiveType('Credit')}>Sales</CustomButton>
          <CustomButton
            variant={Variant.Transparent}
            active={activeType === 'Debit'} onClick={() => setActiveType('Debit')}
            disabled={!hasPermission(Permissions.HiddenProFeatures)}  // Optional: style it differently if locked
            className={!hasPermission(Permissions.HiddenProFeatures) ? 'opacity-50 cursor-not-allowed' : ''}
          >
            {hasPermission(Permissions.HiddenProFeatures) ? 'Purchase' : '🔒 Purchase'}
          </CustomButton>
        </div>
      </TutorialStep>

      {/* Step 5 — Paid / Unpaid toggle */}
      <TutorialStep
        step={5}
        currentStep={tutorialStep}
        text="Toggle between Paid and Unpaid invoices. Unpaid shows your outstanding dues."
        onNext={() => next(6)}
        onSkip={skip}
      >
        <CustomToggle>
          <CustomToggleItem className="mr-2" onClick={() => setActiveTab('Paid')} data-state={activeTab === 'Paid' ? 'on' : 'off'}>Paid</CustomToggleItem>
          <CustomToggleItem onClick={() => setActiveTab('Unpaid')} data-state={activeTab === 'Unpaid' ? 'on' : 'off'}>Unpaid</CustomToggleItem>
        </CustomToggle>
      </TutorialStep>

      {activeTab === 'Unpaid' && (
        <div className="mx-2 mt-2 p-2 bg-red-50 border border-red-200 rounded-sm flex justify-between items-center shadow-sm animate-in fade-in slide-in-from-top-2">
          <div>
            <p className="text-sm text-red-600 font-bold tracking-wider">
              {activeType === 'Credit' ? 'Total Receivables : ' : 'Total Payables : '}
              {totalUnpaidAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
            </p>
          </div>
        </div>
      )}
    </>
  );
};
