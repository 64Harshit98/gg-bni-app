import React, { useEffect, useMemo, useState } from 'react';
import { Search, Users, X } from 'lucide-react';
import { Spinner } from '../../Components/ui/spinner';
import { Button } from '../../Components/ui/button';
import { Input } from '../../Components/ui/input';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { handleDatePresetChange } from './PNLReportComponents/pnlReport.utils';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';
import useCustomerReport from './CustomerReportComponents/useCustomerReport';
import CustomerFilterBar from './CustomerReportComponents/CustomerFilterBar';
import CustomerSummaryCards from './CustomerReportComponents/CustomerSummaryCards';
import CustomerTable from './CustomerReportComponents/CustomerTable';
import {
  downloadCustomerReportExcel,
  downloadCustomerReportPdf,
  type CustomerRowWithCredit,
} from './CustomerReportComponents/customerReport.export';
import {
  subscribeToCustomerCreditBalances,
  type CustomerCreditMap,
} from '../../services/reports/customerReport.service';
import BackButton from '../../Components/BackButton';

const CustomerReport: React.FC = () => {
  const {
    navigate,
    sales,
    loading,
    error,
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
    handleSort,
    isDownloadModalOpen,
    setIsDownloadModalOpen,
    feedbackModal,
    setFeedbackModal,
    currentUser,
    setStartDate,
    setEndDate,
  } = useCustomerReport();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [customerCreditMap, setCustomerCreditMap] = useState<CustomerCreditMap>({});

  useEffect(() => {
    if (!currentUser?.companyId) {
      setCustomerCreditMap({});
      return;
    }

    return subscribeToCustomerCreditBalances(
      currentUser.companyId,
      setCustomerCreditMap,
      () => setCustomerCreditMap({}),
    );
  }, [currentUser?.companyId]);

  const { customerRows, summary } = useMemo(() => {
    if (!appliedFilters) {
      return {
        customerRows: [] as CustomerRowWithCredit[],
        summary: {
          totalCustomers: 0,
          totalBills: 0,
          totalSales: 0,
          totalDue: 0,
          averageSalePerCustomer: 0,
        },
      };
    }

    const start = appliedFilters.start
      ? new Date(appliedFilters.start).getTime()
      : 0;
    const end = appliedFilters.end
      ? new Date(appliedFilters.end).getTime()
      : Infinity;

    const newFilteredSales = sales.filter(
      (s) => s.createdAt.getTime() >= start && s.createdAt.getTime() <= end,
    );

    /* ---------- CUSTOMER AGGREGATION ---------- */
    const map = new Map<string, CustomerRowWithCredit>();

    newFilteredSales.forEach((sale) => {
      const key = sale.partyName;

      if (!map.has(key)) {
        map.set(key, {
          id: `${sale.partyName}-${sale.partyNumber || 'N/A'}`,
          customerName: sale.partyName,
          customerNumber: sale.partyNumber || 'N/A',
          totalBills: 0,
          totalSales: 0,
          totalDue: 0,
          creditNote: 0,
          sortKey: 'customerName',
        });
      }

      const row = map.get(key)!;

      if (!sale.isOpeningBalance) {
        row.totalBills += 1;
        row.totalSales += sale.totalAmount;
      }

      const due = sale.dueAmount || 0;
      if (due > 0) {
        row.totalDue += due;
      }
    });

    let customerRows = Array.from(map.values());
    customerRows = customerRows.map((row) => {
      const byNumber = customerCreditMap[`num:${row.customerNumber}`];
      const byName = customerCreditMap[`name:${row.customerName.toLowerCase()}`];
      const creditNote = byNumber ?? byName ?? 0;
      return { ...row, creditNote: Math.max(0, Number(creditNote || 0)) };
    });

    const trimmedQuery = searchQuery.toLowerCase().trim();
    if (trimmedQuery) {
      customerRows = customerRows.filter((c) =>
        c.customerName.toLowerCase().includes(trimmedQuery) ||
        c.customerNumber.toLowerCase().includes(trimmedQuery),
      );
    }

    if (sortConfig?.key) {
      customerRows.sort((a, b) => {
        const key = sortConfig.key as keyof CustomerRowWithCredit;

        const aValue = a[key];
        const bValue = b[key];

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          const comparison = aValue.localeCompare(bValue);
          return sortConfig.direction === 'asc' ? comparison : -comparison;
        }

        const numA = Number(aValue || 0);
        const numB = Number(bValue || 0);

        const comparison = numA - numB;
        return sortConfig.direction === 'asc' ? comparison : -comparison;
      });
    }

    /* ---------- SUMMARY METRICS ---------- */
    const totalCustomers = customerRows.length;
    const totalBills = newFilteredSales.filter((s) => !s.isOpeningBalance).length;
    const totalSales = newFilteredSales.reduce(
      (sum, s) => (s.isOpeningBalance ? sum : sum + s.totalAmount),
      0,
    );
    const totalDue = customerRows.reduce((sum, c) => sum + Math.max(0, c.totalDue), 0);

    const averageSalePerCustomer =
      totalCustomers > 0 ? totalSales / totalCustomers : 0;

    return {
      customerRows,
      summary: {
        totalCustomers,
        totalBills,
        totalSales,
        totalDue,
        averageSalePerCustomer,
      },
    };
  }, [sales, appliedFilters, searchQuery, customerCreditMap, sortConfig]);

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

  /* ---------- EXPORT HELPERS ---------- */
  const downloadAsExcel = () => {
    try {
      downloadCustomerReportExcel(customerRows, summary, startDate, endDate);
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

  const downloadAsPdf = async () => {
    try {
      await downloadCustomerReportPdf(customerRows, summary, startDate, endDate, currentUser?.companyId);
      setIsDownloadModalOpen(false);
      setFeedbackModal({
        isOpen: true,
        type: State.SUCCESS,
        message: 'PDF downloaded successfully!',
      });
    } catch (err) {
      console.error('PDF Generation Error:', err);
      setFeedbackModal({
        isOpen: true,
        type: State.ERROR,
        message: 'Failed to generate PDF.',
      });
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-muted-foreground">
        <Spinner size="lg" />
        <p className="text-sm font-medium">Loading report...</p>
      </div>
    );
  }
  if (error) {
    return <div className="p-4 text-center text-destructive">Error: {error}</div>;
  }
  if (!currentUser) {
    navigate('/login');
    return null;
  }

  return (
    <div className="aurora flex h-full w-full flex-col overflow-hidden bg-muted">
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

      <header className="glass mx-3 mt-3 flex flex-shrink-0 flex-col gap-3 rounded-2xl p-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <BackButton />
          <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px] shadow-sm shadow-primary/20">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-brand text-white">
              <Users className="size-4" />
            </span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
              Customer <span className="text-gradient">Report</span>
            </h1>
            <p className="text-xs text-muted-foreground">Track dues, sales &amp; credit notes by customer</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setShowSearch((v) => !v)}
            aria-label="Toggle search"
          >
            {showSearch ? <X className="size-4" /> : <Search className="size-4" />}
          </Button>
        </div>
      </header>

      <main className="w-full flex-grow space-y-4 overflow-y-auto p-4 sm:p-6">
        {showSearch && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by customer name or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="h-11 pl-9"
            />
          </div>
        )}

        <CustomerFilterBar
          datePreset={datePreset}
          onPresetChange={(value) =>
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
            setDatePreset('custom');
          }}
          onApply={handleApplyFilters}
        />

        <CustomerSummaryCards summary={summary} />

        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs transition-all duration-200 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-foreground">Report Details</h2>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsListVisible(!isListVisible)}>
                {isListVisible ? 'Hide List' : 'Show List'}
              </Button>
              <Button
                type="button"
                onClick={() =>
                  customerRows.length === 0
                    ? setFeedbackModal({ isOpen: true, type: State.INFO, message: 'No data.' })
                    : setIsDownloadModalOpen(true)
                }
                className="gap-1.5 bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90"
              >
                Download Report
              </Button>
            </div>
          </div>

          {isListVisible && (
            <div className="mt-4">
              <CustomerTable rows={customerRows} sortConfig={sortConfig} onSort={handleSort} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default CustomerReport;
