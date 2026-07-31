import React, { useMemo, useState } from 'react';
import { PackageSearch } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { Button } from '../../Components/ui/button';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import DownloadChoiceModal from './ItemReportComponents/DownloadChoiceModal';

import useRestockReport from './RestockReportComponents/useRestockReport';
import {
  filterBySearch,
  calculateSummary,
} from './RestockReportComponents/restockReport.utils';
import {
  downloadRestockReportExcel,
  downloadRestockReportPdf,
  type RestockActiveFilter,
} from './RestockReportComponents/restockReport.export';
import RestockSummaryCards from './RestockReportComponents/RestockSummaryCards';
import RestockFilterBar from './RestockReportComponents/RestockFilterBar';
import RestockTable from './RestockReportComponents/RestockTable';
import BackButton from '../../Components/BackButton';

const RestockReportPage: React.FC = () => {
  const { currentUser } = useAuth();
  const { items: inventoryItems, loading, error } = useRestockReport();
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [activeFilter, setActiveFilter] = useState<RestockActiveFilter>('all');
  const [isListVisible, setIsListVisible] = useState(true);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState({
    isOpen: false,
    type: State.INFO,
    message: '',
  });

  const displayedItems = useMemo(() => {
    const filtered = filterBySearch(inventoryItems, searchTerm).filter((item) => {
      const stock = item.stock ?? 0;
      if (activeFilter === 'urgent') return stock <= 0;
      if (activeFilter === 'low') return stock > 0 && stock < item.restockQuantity;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const stockA = a.stock ?? 0;
      const stockB = b.stock ?? 0;
      if (stockA <= 0 && stockB > 0) return -1;
      if (stockB <= 0 && stockA > 0) return 1;
      return sortOrder === 'asc' ? stockA - stockB : stockB - stockA;
    });
  }, [inventoryItems, searchTerm, sortOrder, activeFilter]);

  const { totalItemsToRestock, outOfStockCount, estimatedCostToRestock } =
    useMemo(() => calculateSummary(displayedItems), [displayedItems]);

  /* ---------- DOWNLOAD HANDLERS ---------- */
  const downloadAsPdf = async () => {
    await downloadRestockReportPdf(displayedItems, activeFilter, outOfStockCount, currentUser?.companyId);
    setIsDownloadModalOpen(false);
  };

  const downloadAsExcel = () => {
    try {
      downloadRestockReportExcel(
        displayedItems,
        activeFilter,
        outOfStockCount,
        totalItemsToRestock,
        estimatedCostToRestock,
      );
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

  if (error) {
    return <div className="p-8 text-center text-destructive">{error}</div>;
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
              <PackageSearch className="size-4" />
            </span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
              Restock <span className="text-gradient">Report</span>
            </h1>
            <p className="text-xs text-muted-foreground">Products at or below their restock threshold</p>
          </div>
        </div>
      </header>

      <main className="w-full flex-grow space-y-4 overflow-y-auto p-4 sm:p-6">
        <RestockSummaryCards
          loading={loading}
          totalItemsToRestock={totalItemsToRestock}
          outOfStockCount={outOfStockCount}
          estimatedCostToRestock={estimatedCostToRestock}
        />

        <RestockFilterBar
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          activeFilter={activeFilter}
          onActiveFilterChange={setActiveFilter}
        />

        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs transition-all duration-200 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-foreground">Report Details</h2>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setIsListVisible((prev) => !prev)}>
                {isListVisible ? 'Hide List' : 'Show List'}
              </Button>
              <Button
                type="button"
                disabled={displayedItems.length === 0}
                onClick={() => {
                  if (displayedItems.length === 0) {
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
                Download Report
              </Button>
            </div>
          </div>

          {isListVisible && (
            <div className="mt-4">
              <RestockTable
                items={displayedItems}
                loading={loading}
                sortOrder={sortOrder}
                onToggleSortOrder={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default RestockReportPage;
