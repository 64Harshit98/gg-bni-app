import React, { useState, useEffect, useRef } from 'react';
import { TutorialStep } from '../../../Components/TutorialStep';
import { Permissions } from '../../../enums/permissions.enum';
import ShowWrapper from '../../../context/ShowWrapper';
import { ROUTES } from '../../../constants/routes.constants';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/auth-context';
import { ROLES } from '../../../enums';

export interface JournalSummary {
  total: number;
  received: number;
  unpaid: number;
  count: number;
  unpaidCount: number;
}

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

  // Summary strip (derived from the filtered list)
  summary: JournalSummary;
}

const iconProps = {
  className: 'w-4 h-4 shrink-0',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const SearchGlyph = ({ big }: { big?: boolean }) => (
  <svg {...iconProps} className={big ? 'w-5 h-5 shrink-0' : 'w-4 h-4 shrink-0'}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);
const CloseGlyph = () => (
  <svg {...iconProps} className="w-5 h-5 shrink-0"><path d="M18 6 6 18M6 6l12 12" /></svg>
);
const CalendarGlyph = () => (
  <svg {...iconProps}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
);
const ChevronGlyph = ({ open }: { open?: boolean }) => (
  <svg {...iconProps} className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}><path d="m6 9 6 6 6-6" /></svg>
);
const FilterGlyph = ({ big }: { big?: boolean }) => (
  <svg {...iconProps} className={big ? 'w-5 h-5 shrink-0 lg:w-4 lg:h-4' : 'w-4 h-4 shrink-0'}><path d="M3 5h18l-7 8v6l-4 2v-8z" /></svg>
);
const UsersGlyph = () => (
  <svg {...iconProps}><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></svg>
);
const PlusGlyph = () => (
  <svg {...iconProps}><path d="M12 5v14M5 12h14" /></svg>
);

const inr0 = (n: number) =>
  n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]';
// Phone: pill chip · Desktop: 40px outlined button
const CHIP =
  `inline-flex items-center gap-2 whitespace-nowrap border font-medium transition-colors h-[34px] px-3.5 text-[13px] rounded-full lg:h-10 lg:px-3 lg:text-sm lg:rounded-lg ${FOCUS}`;
const CHIP_LIGHT = `${CHIP} border-[#7a8aa3] bg-white text-[#45556c] lg:text-[#0f172b] hover:bg-[#f5f7ff]`;
const CHIP_DARK_ON_PHONE = `${CHIP} border-[#0f172b] bg-[#0f172b] text-white lg:border-[#7a8aa3] lg:bg-white lg:text-[#0f172b] lg:hover:bg-[#f5f7ff]`;

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
  summary,
}) => {
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const isOwner = currentUser?.role === ROLES.OWNER;
  const isSales = activeType === 'Credit';

  // Custom range: edit as a draft, commit only on Apply
  const [draft, setDraft] = useState({ start: '', end: '' });
  const dateWrapRef = useRef<HTMLDivElement | null>(null);
  const canApply = !!draft.start && !!draft.end;

  const openCustom = () => {
    setDraft({ start: customStartDate, end: customEndDate });
    setShowCustomPicker(true);
  };

  const applyCustom = () => {
    if (!canApply) return;
    const [s, e] = draft.start <= draft.end ? [draft.start, draft.end] : [draft.end, draft.start];
    setCustomStartDate(s);
    setCustomEndDate(e);
    setActiveDateFilter('custom');
    setShowCustomPicker(false);
  };

  useEffect(() => {
    if (!showCustomPicker) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (dateWrapRef.current && !dateWrapRef.current.contains(e.target as Node)) setShowCustomPicker(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCustomPicker(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showCustomPicker]);

  const searchInput = (autoFocus?: boolean) => (
    <label className="flex items-center gap-2 h-10 px-3 w-full lg:w-[380px] border border-[#7a8aa3] rounded-sm bg-white text-[#5b6b86] focus-within:outline focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[#155dfc]">
      <SearchGlyph />
      <input
        type="text"
        placeholder="Search bill no., customer or phone"
        className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[#0f172b] placeholder:text-[#5b6b86]"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        autoFocus={autoFocus}
      />
    </label>
  );

  return (
    <>
      {/*
        One flex-wrap container; `order-*` rearranges it per breakpoint.

        Phone  : [Title ........ 🔍 ⛉]
                 [search field (when open)]
                 [Sales | Purchase]
                 [date chip] [Party ledger chip]
        Desktop: [Title ............ Party ledger | New sale]
                 [Sales | Purchase] [search] [date] [Filters]
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3 lg:gap-y-0 px-4 lg:px-6 pt-4 lg:pt-6">
        {/* Title */}
        <div className="order-1 flex-1 min-w-0">
          <h1 className="text-xl lg:text-2xl leading-8 font-semibold text-[#0f172b]">Transactions</h1>
          <p className="text-xs leading-[18px] text-[#45556c]">Every sale and purchase bill</p>
        </div>

        {/* Phone only: search icon (Step 1) */}
        <div className="order-2 lg:hidden -mr-2">
          <TutorialStep
            step={1}
            currentStep={tutorialStep}
            text="Tap the search icon to find invoices by name, number, or phone."
            onNext={() => next(2)}
            onSkip={skip}
            mobileArrowAlign="left"
          >
            <button
              type="button"
              onClick={() => setShowSearch(!showSearch)}
              aria-label={showSearch ? 'Close search' : 'Search'}
              className={`w-10 h-10 inline-flex items-center justify-center rounded-sm text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b] transition-colors ${FOCUS}`}
            >
              {showSearch ? <CloseGlyph /> : <SearchGlyph big />}
            </button>
          </TutorialStep>
        </div>

        {/* Filters (Step 3): icon on phone, outlined button with label on desktop */}
        <div ref={filterRef} className="order-3 lg:order-8 relative -mr-2 lg:mr-0">
          <TutorialStep
            step={3}
            currentStep={tutorialStep}
            text="Use this filter to quickly jump to Today, Last 7 Days, Last 30 Days, and more."
            onNext={() => next(4)}
            onSkip={skip}
          >
            <button
              type="button"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              aria-label="Filters"
              className={`inline-flex items-center justify-center gap-2 h-10 w-10 rounded-sm text-[#45556c] hover:bg-[#f5f7ff] hover:text-[#0f172b] transition-colors lg:w-auto lg:px-3 lg:border lg:border-[#7a8aa3] lg:bg-white lg:text-sm lg:font-medium lg:text-[#0f172b] ${FOCUS}`}
            >
              <FilterGlyph big />
              <span className="hidden lg:inline">Filters</span>
            </button>
          </TutorialStep>

          {isFilterOpen && (
            <div className="absolute top-full right-0 mt-2 z-50 w-64 bg-white border border-[#dfe6fb] rounded-sm shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] overflow-hidden">
              <ul className="p-1">
                {dateFilters.map((filter) => (
                  filter.value !== 'custom' && (
                    <li key={filter.value}>
                      <button
                        type="button"
                        onClick={() => { handleDateFilterSelect(filter.value); setIsFilterOpen(false); }}
                        className={`w-full text-left px-3 h-10 rounded-sm text-sm ${activeDateFilter === filter.value ? 'bg-[#e6eeff] text-[#155dfc] font-medium' : 'text-[#0f172b] hover:bg-[#f5f7ff]'}`}
                      >
                        {filter.label}
                      </button>
                    </li>
                  )
                ))}
                <li>
                  <button
                    type="button"
                    onClick={() => { setIsFilterOpen(false); openCustom(); }}
                    className={`w-full text-left px-3 h-10 rounded-sm text-sm ${activeDateFilter === 'custom' ? 'bg-[#e6eeff] text-[#155dfc] font-medium' : 'text-[#0f172b] hover:bg-[#f5f7ff]'}`}
                  >
                    Custom range
                  </button>
                </li>
              </ul>
            </div>
          )}
        </div>

        {/* Phone only: search field, shown when the icon is tapped */}
        {showSearch && (
          <div className="order-4 basis-full lg:hidden">
            {searchInput(true)}
          </div>
        )}

        {/* Desktop only: spacer that starts the second row */}
        <div className="hidden lg:block lg:order-4 basis-full h-4" aria-hidden="true" />

        {/* Sales / Purchase (Step 4) */}
        <div className="order-5 basis-full lg:basis-auto">
          <TutorialStep
            step={4}
            currentStep={tutorialStep}
            text="Switch between Sales (money received) and Purchase (money spent) transactions here."
            onNext={() => next(5)}
            onSkip={skip}
          >
            <div role="group" className="flex gap-0.5 p-[3px] bg-[#f5f7ff] border border-[#dfe6fb] rounded-[11px] w-full lg:w-[240px]">
              <button
                type="button"
                aria-pressed={activeType === 'Credit'}
                onClick={() => setActiveType('Credit')}
                className={`flex-1 h-9 rounded-sm text-sm font-medium transition-colors ${
                  activeType === 'Credit' ? 'bg-[#0f172b] text-white' : 'text-[#45556c] hover:bg-white'
                }`}
              >
                Sales
              </button>
              <button
                type="button"
                aria-pressed={activeType === 'Debit'}
                onClick={() => setActiveType('Debit')}
                disabled={!hasPermission(Permissions.HiddenProFeatures)}
                className={`flex-1 h-9 rounded-sm text-sm font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                  activeType === 'Debit' ? 'bg-[#0f172b] text-white' : 'text-[#45556c] hover:bg-white'
                }`}
              >
                {hasPermission(Permissions.HiddenProFeatures) ? 'Purchase' : '🔒 Purchase'}
              </button>
            </div>
          </TutorialStep>
        </div>

        {/* Desktop only: always-visible search field (Step 1) */}
        <div className="hidden lg:block lg:order-6">
          <TutorialStep
            step={1}
            currentStep={tutorialStep}
            text="Tap the search icon to find invoices by name, number, or phone."
            onNext={() => next(2)}
            onSkip={skip}
          >
            {searchInput()}
          </TutorialStep>
        </div>

        {/* Date range (Step 2): dark chip on phone, outlined button on desktop */}
        <div className="order-6 lg:order-7">
          <TutorialStep
            step={2}
            currentStep={tutorialStep}
            text="Tap the date to pick a custom range for your transactions."
            onNext={() => next(3)}
            onSkip={skip}
          >
                        <div
              ref={(el) => { dateWrapRef.current = el; setTutorialRef(2)(el); }}
              className="relative"
            >
              <button
                type="button"
                aria-pressed={showCustomPicker}
                aria-expanded={showCustomPicker}
                onClick={() => (showCustomPicker ? setShowCustomPicker(false) : openCustom())}
                className={CHIP_DARK_ON_PHONE}
              >
                <CalendarGlyph />
                {selectedPeriodText}
                <ChevronGlyph open={showCustomPicker} />
              </button>

                            {showCustomPicker && (
                <div className="absolute top-full left-0 z-50 mt-1.5 w-[328px] max-w-[calc(100vw-2rem)] rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-[0_10px_28px_rgba(21,48,140,0.14),0_2px_6px_rgba(21,48,140,0.08)] cursor-default">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid gap-1.5 text-[13px] font-medium text-[#45556c]">
                      From
                      <input
                        type="date"
                        value={draft.start}
                        onChange={(e) => setDraft((d) => ({ ...d, start: e.target.value }))}
                        className="h-10 w-full min-w-0 rounded-sm border border-[#7a8aa3] bg-white px-3 text-sm text-[#0f172b] outline-none focus-visible:ring-2 focus-visible:ring-[#155dfc]"
                      />
                    </label>
                    <label className="grid gap-1.5 text-[13px] font-medium text-[#45556c]">
                      To
                      <input
                        type="date"
                        value={draft.end}
                        onChange={(e) => setDraft((d) => ({ ...d, end: e.target.value }))}
                        className="h-10 w-full min-w-0 rounded-sm border border-[#7a8aa3] bg-white px-3 text-sm text-[#0f172b] outline-none focus-visible:ring-2 focus-visible:ring-[#155dfc]"
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowCustomPicker(false)}
                      className="h-10 rounded-sm border border-[#dfe6fb] bg-white px-4 text-sm font-medium text-[#45556c] transition-colors hover:bg-[#f5f7ff] hover:text-[#0f172b]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={applyCustom}
                      disabled={!canApply}
                      className="h-10 rounded-sm bg-[#0f172b] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1d2a44] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          </TutorialStep>
        </div>

        {/* Party ledger: chip under the toggle on phone, header button on desktop */}
        <div className="order-7 lg:order-2 empty:hidden ">
          <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
            <button type="button" onClick={() => navigate(ROUTES.PARTY_LEDGER)} className={CHIP_LIGHT}>
              <UsersGlyph />
              Party ledger
            </button>
          </ShowWrapper>
        </div>

        {/* Desktop only: New sale (primary) */}
        <div className="hidden lg:block lg:order-3">
          <button
            type="button"
            onClick={() => navigate(ROUTES.SALES)}
            className={`inline-flex items-center gap-2 h-10 px-4 rounded-sm bg-[#155dfc] hover:bg-[#1447e6] text-white text-sm font-medium whitespace-nowrap transition-colors ${FOCUS}`}
          >
            <PlusGlyph />
            New sale
          </button>
        </div>
      </div>

      {/* ── Summary strip: total · received · unpaid (owner only) ── */}
      {isOwner && (
      <div className="mx-4 lg:mx-6 mt-4 grid grid-cols-3 bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)] overflow-hidden">
        <div className="flex flex-col gap-0.5 px-3 py-2.5 lg:px-5 lg:py-3.5 border-r border-[#dfe6fb] min-w-0">
          <span className="text-xs text-[#45556c]">{isSales ? 'Total sales' : 'Total purchases'}</span>
          <b className="text-[15px] lg:text-xl leading-[22px] lg:leading-7 font-semibold text-[#0f172b] tabular-nums truncate">{inr0(summary.total)}</b>
          <span className="text-xs text-[#5b6b86]">{summary.count} {summary.count === 1 ? 'bill' : 'bills'}</span>
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2.5 lg:px-5 lg:py-3.5 border-r border-[#dfe6fb] min-w-0">
          <span className="text-xs text-[#45556c]">{isSales ? 'Received' : 'Paid'}</span>
          <b className="text-[15px] lg:text-xl leading-[22px] lg:leading-7 font-semibold text-[#008236] tabular-nums truncate">{inr0(summary.received)}</b>
          <span className="text-xs text-[#5b6b86]">{summary.count - summary.unpaidCount} {summary.count - summary.unpaidCount === 1 ? 'bill' : 'bills'}</span>
        </div>
        <div className="flex flex-col gap-0.5 px-3 py-2.5 lg:px-5 lg:py-3.5 min-w-0">
          <span className="text-xs text-[#45556c]">Unpaid</span>
          <b className="text-[15px] lg:text-xl leading-[22px] lg:leading-7 font-semibold text-[#bb4d00] tabular-nums truncate">{inr0(summary.unpaid)}</b>
          <span className="text-xs text-[#5b6b86]">{summary.unpaidCount} {summary.unpaidCount === 1 ? 'bill' : 'bills'}</span>
        </div>
      </div>
      )}
    </>
  );
};