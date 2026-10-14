import React from 'react';
import { TutorialStep } from '../../Components/TutorialStep';

interface JournalTabsProps {
  tutorialStep: number;
  next: (n: number) => void;
  skip: () => void;
  activeType: 'Debit' | 'Credit';
  activeTab: 'Paid' | 'Unpaid';
  setActiveTab: (v: 'Paid' | 'Unpaid') => void;
  totalUnpaidAmount: number;
}

export const JournalTabs: React.FC<JournalTabsProps> = ({
  tutorialStep,
  next,
  skip,
  activeType,
  activeTab,
  setActiveTab,
  totalUnpaidAmount,
}) => {
  return (
    <>
      {/* Step 5 — Paid / Unpaid toggle */}
      <TutorialStep
        step={5}
        currentStep={tutorialStep}
        text="Toggle between Paid and Unpaid invoices. Unpaid shows your outstanding dues."
        onNext={() => next(6)}
        onSkip={skip}
      >
        <div role="tablist" className="flex gap-6 px-4 border-b border-[#dfe6fb] bg-white">
          {(['Paid', 'Unpaid'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`h-11 -mb-px text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'text-[#155dfc] border-[#155dfc]'
                  : 'text-[#45556c] border-transparent hover:text-[#0f172b]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </TutorialStep>

      {activeTab === 'Unpaid' && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[#fff3dd] border-b border-[#dfe6fb]">
          <span className="flex items-center gap-2 text-[13px] font-medium text-[#bb4d00]">
            <span className="w-1.5 h-1.5 rounded-sm bg-current" aria-hidden="true" />
            {activeType === 'Credit' ? 'Total receivables' : 'Total payables'}
          </span>
          <span className="text-[15px] font-semibold text-[#bb4d00] tabular-nums">
            {totalUnpaidAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}
          </span>
        </div>
      )}
    </>
  );
};