import React, { useMemo, useState } from 'react';
import { BarChart3, Download, Eye, EyeOff, Search } from 'lucide-react';

import { State } from '../../enums';
import { Button } from '../../Components/ui/button';
import { Spinner } from '../../Components/ui/spinner';
import BackButton from '../../Components/BackButton';
import { Modal } from '../../constants/Modal';
import { useExpenses } from '@/features/expenses';

import { usePnlReport, usePnlStates } from './PNLReportComponents/usePnlReport';
import { type TransactionDetail, handleDatePresetChange } from './PNLReportComponents/pnlReport.utils';
import { downloadPnlPdf, downloadPnlExcel, type PnlSummary } from './PNLReportComponents/pnlReport.downloads';
import { PnlFilterBar } from './PNLReportComponents/components/PnlFilterBar';
import { PnlSummaryCards } from './PNLReportComponents/components/PnlSummaryCards';
import { PnlTransactionsTable } from './PNLReportComponents/components/PnlTransactionsTable';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';

const PnlReportPage: React.FC = () => {
  const {
    navigate,
    currentUser,
    authLoading,
    datePreset,
    setDatePreset,
    startDate,
    endDate,
    appliedFilters,
    setAppliedFilters,
    isListVisible,
    setIsListVisible,
    sortConfig,
    setSortConfig,
    setStartDate,
    setEndDate,
  } = usePnlStates();

  const {
    sales,
    loading: dataLoading,
    error,
  } = usePnlReport(currentUser?.companyId);
  const { expenses: posExpenses } = useExpenses(currentUser?.companyId, 'pos');
  const { expenses: catExpenses } = useExpenses(currentUser?.companyId, 'catalogue');
  const expenses = useMemo(() => [...posExpenses, ...catExpenses], [posExpenses, catExpenses]);

  /* ---------- LOCAL STATES ---------- */
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
  });

  /* ---------- FILTER + SUMMARY ---------- */
  const { pnlSummary, filteredTransactions } = useMemo<{
    pnlSummary: PnlSummary;
    filteredTransactions: TransactionDetail[];
  }>(() => {
    const startTimestamp = appliedFilters?.start
      ? new Date(appliedFilters.start).getTime()
      : 0;
    const endTimestamp = appliedFilters?.end
      ? new Date(appliedFilters.end).getTime()
      : Infinity;

    const filteredSales = sales.filter(
      (s) =>
        s.createdAt.getTime() >= startTimestamp &&
        s.createdAt.getTime() <= endTimestamp,
    );

    const totalExpenses = expenses
      .filter((e) => e.date >= startTimestamp && e.date <= endTimestamp)
      .reduce((sum, e) => sum + e.amount, 0);

    const salesTransactions: TransactionDetail[] = filteredSales.map((s) => {
      const cogs = s.costOfGoodsSold ?? 0;
      // If cogs is 0 but totalAmount > 0, we know there's a data entry error
      const isMissingCost = cogs === 0 && s.totalAmount > 0;

      return {
        ...s,
        type: 'Revenue' as const,
        costOfGoodsSold: cogs,
        profit: s.totalAmount - cogs,
        isWarning: isMissingCost, // styled in PnlTransactionsTable
      };
    });

    const searchTerm = searchQuery.trim().toLowerCase();
    const invoiceFilteredTransactions = searchTerm
      ? salesTransactions.filter((t) =>
        (t.invoiceNumber || '').toLowerCase().includes(searchTerm),
      )
      : salesTransactions;

    invoiceFilteredTransactions.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = (a[key] as unknown) ?? (typeof a[key] === 'number' ? 0 : '');
      const valB = (b[key] as unknown) ?? (typeof b[key] === 'number' ? 0 : '');

      if (valA instanceof Date && valB instanceof Date) {
        return (valA.getTime() - valB.getTime()) * direction;
      }
      if (typeof valA === 'number' && typeof valB === 'number') {
        return (valA - valB) * direction;
      }
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * direction;
      }
      return 0;
    });

    return {
      pnlSummary: {
        totalRevenue: invoiceFilteredTransactions.reduce(
          (sum, t) => sum + t.totalAmount,
          0,
        ),
        totalCost: invoiceFilteredTransactions.reduce(
          (sum, t) => sum + (t.costOfGoodsSold || 0),
          0,
        ),
        totalExpenses,
        grossProfit:
          invoiceFilteredTransactions.reduce(
            (sum, t) => sum + (t.profit || 0),
            0,
          ) - totalExpenses,
        grossProfitPercentage:
          invoiceFilteredTransactions.reduce((sum, t) => sum + t.totalAmount, 0) > 0
            ? (invoiceFilteredTransactions.reduce(
              (sum, t) => sum + (t.profit || 0),
              0,
            ) /
              invoiceFilteredTransactions.reduce(
                (sum, t) => sum + t.totalAmount,
                0,
              )) *
            100
            : 0,
      },
      filteredTransactions: invoiceFilteredTransactions,
    };
  }, [sales, expenses, appliedFilters, sortConfig, searchQuery]);

  /* ---------- SORT ---------- */
  const handleSort = (key: keyof TransactionDetail) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  /* ---------- APPLY FILTER ---------- */
  const handleApplyFilters = () => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    setAppliedFilters({
      start: start.toISOString(),
      end: end.toISOString(),
    });
  };

  /* ---------- DOWNLOADS ---------- */
  const downloadAsPdf = async () => {
    try {
      await downloadPnlPdf({
        pnlSummary,
        filteredTransactions,
        appliedFilters,
        startDate,
        endDate,
        companyId: currentUser?.companyId,
      });
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setFeedbackModal({ isOpen: true, type: State.ERROR, message: 'Failed to generate PDF.' });
    }
  };

  const downloadAsExcel = () => {
    try {
      downloadPnlExcel({
        pnlSummary,
        filteredTransactions,
        appliedFilters,
        startDate,
        endDate,
        companyId: currentUser?.companyId,
      });
      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'Excel downloaded successfully!',
      });
    } catch {
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate Excel file.',
      });
    }
  };

  if (authLoading || dataLoading)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted p-10 text-muted-foreground">
        <Spinner size="lg" />
        <p className="text-sm font-medium">Loading Report...</p>
      </div>
    );
  if (error)
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4 text-center text-destructive">
        Error: {error}
      </div>
    );
  if (!currentUser) {
    navigate('/login');
    return null;
  }

  return (
    <div className="aurora min-h-screen bg-muted pb-16">
      {feedbackModal.isOpen && (
        <Modal
          type={feedbackModal.type}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal((p) => ({ ...p, isOpen: false }))}
          showConfirmButton={false}
        />
      )}

      <DownloadChoiceModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        onDownloadPdf={downloadAsPdf}
        onDownloadExcel={downloadAsExcel}
      />

      {/* HEADER */}
      <header className="glass sticky top-0 z-20 flex items-center gap-3 border-b border-border px-4 py-3">
        <BackButton />
        <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px] shadow-sm shadow-primary/20">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-brand text-white">
            <BarChart3 className="size-4" />
          </span>
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
            Profit &amp; Loss <span className="text-gradient">Report</span>
          </h1>
          <p className="text-xs text-muted-foreground">Revenue, cost of goods, and expenses for any period</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setShowSearch(true)} aria-label="Search by invoice">
          <Search className="size-4" />
        </Button>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-6 sm:px-6 lg:px-8">
        <PnlFilterBar
          datePreset={datePreset}
          onDatePresetChange={(value) =>
            handleDatePresetChange(value, setDatePreset, setStartDate, setEndDate)
          }
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={(value) => {
            setStartDate(value);
            setDatePreset('custom');
          }}
          onEndDateChange={(value) => {
            setEndDate(value);
            setDatePreset('');
          }}
          onApply={handleApplyFilters}
          showSearch={showSearch}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onCloseSearch={() => setShowSearch(false)}
        />

        <PnlSummaryCards summary={pnlSummary} />

        {/* DETAILS */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs md:flex-row md:items-center md:justify-between">
          <h2 className="w-full text-center text-lg font-semibold text-foreground md:w-auto md:text-left">
            Report Details
          </h2>
          <div className="flex w-full justify-between gap-3 md:w-auto md:justify-end">
            <Button variant="secondary" onClick={() => setIsListVisible(!isListVisible)} className="gap-1.5">
              {isListVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {isListVisible ? 'Hide List' : 'Show List'}
            </Button>
            <Button
              onClick={() => {
                if (filteredTransactions.length === 0) {
                  setFeedbackModal({
                    isOpen: true,
                    type: State.INFO,
                    message: 'No data available to download.',
                  });
                } else {
                  setIsDownloadModalOpen(true);
                }
              }}
              className="gap-1.5 bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90"
            >
              <Download className="size-4" />
              Download Report
            </Button>
          </div>
        </div>

        {isListVisible && (
          <PnlTransactionsTable
            transactions={filteredTransactions}
            summary={pnlSummary}
            sortConfig={sortConfig}
            onSort={handleSort}
          />
        )}
      </div>
    </div>
  );
};

export default PnlReportPage;
