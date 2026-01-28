import React, { useMemo } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import { IconClose } from '../../constants/Icons';
import { getPnlColumns } from '../../constants/TableColoumns';
import FilterSelect from './SalesReportComponents/FilterSelect';
import { usePnlReport, usePnlStates } from './PNLReportComponents/usePnlReport';
import { type TransactionDetail } from './PNLReportComponents/pnlReport.utils';
import { formatDate } from './PNLReportComponents/pnlReport.utils';
import { handleDatePresetChange } from './PNLReportComponents/pnlReport.utils';

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

  const { pnlSummary, filteredTransactions } = useMemo(() => {
    const startTimestamp = appliedFilters.start
      ? new Date(appliedFilters.start).getTime()
      : 0;
    const endTimestamp = appliedFilters.end
      ? new Date(appliedFilters.end).getTime()
      : Infinity;
    const filteredSales = sales.filter(
      (s) =>
        s.createdAt.getTime() >= startTimestamp &&
        s.createdAt.getTime() <= endTimestamp,
    );

    const totalRevenue = filteredSales.reduce(
      (sum, sale) => sum + sale.totalAmount,
      0,
    );
    const totalCostOfGoodsSold = filteredSales.reduce(
      (sum, sale) => sum + (sale.costOfGoodsSold || 0),
      0,
    );
    const grossProfit = totalRevenue - totalCostOfGoodsSold;
    const grossProfitPercentage =
      totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    const salesTransactions: TransactionDetail[] = filteredSales.map((s) => ({
      ...s,
      type: 'Revenue' as const,
      profit: s.totalAmount - (s.costOfGoodsSold || 0),
    }));

    salesTransactions.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valA = (a[key] as any) ?? (typeof a[key] === 'number' ? 0 : '');
      const valB = (b[key] as any) ?? (typeof b[key] === 'number' ? 0 : '');
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
        totalRevenue,
        totalCost: totalCostOfGoodsSold,
        grossProfit,
        grossProfitPercentage,
      },
      filteredTransactions: salesTransactions,
    };
  }, [sales, appliedFilters, sortConfig]);

  const handleSort = (key: keyof TransactionDetail) => {
    setSortConfig((prevConfig) => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === 'asc'
          ? 'desc'
          : 'asc',
    }));
  };

  const handleApplyFilters = () => {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: start.toISOString(), end: end.toISOString() });
  };

  const selectedPeriodText = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = {
      day: 'numeric',
      month: 'short',
    };
    const format = (dateStr: string) =>
      new Date(dateStr).toLocaleDateString('en-IN', options);

    if (!appliedFilters.start || !appliedFilters.end)
      return 'Loading period...';

    const start = format(appliedFilters.start);
    const end = format(appliedFilters.end);

    if (start === end) return `For ${start}`;
    return `From ${start} to ${end}`;
  }, [appliedFilters]);

  const handleDownloadPdf = () => {
    const doc = new jsPDF();
    const { totalRevenue, totalCost, grossProfit, grossProfitPercentage } =
      pnlSummary;

    doc.setFontSize(18);
    doc.text('Profit & Loss Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(selectedPeriodText, 14, 30);

    const summaryY = 45;
    autoTable(doc, {
      startY: summaryY,
      body: [
        [
          'Total Sales:',
          `₹${totalRevenue.toLocaleString('en-IN')}`,
          'Gross Profit / Loss:',
          `₹${grossProfit.toLocaleString('en-IN')}`,
        ],
        [
          'Total Cost:',
          `₹${totalCost.toLocaleString('en-IN')}`,
          'Gross Profit %:',
          `${grossProfitPercentage.toFixed(2)}%`,
        ],
      ],
      theme: 'plain',
      styles: { fontSize: 10 },
      columnStyles: {
        0: { fontStyle: 'bold' },
        2: { fontStyle: 'bold' },
      },
    });

    const tableHead = [['Date', 'Invoice', 'Sales', 'Cost', 'Profit']];
    const tableBody = filteredTransactions.map((t) => [
      formatDate(t.createdAt),
      t.invoiceNumber,
      `₹${t.totalAmount.toLocaleString('en-IN')}`,
      `₹${(t.costOfGoodsSold || 0).toLocaleString('en-IN')}`,
      `₹${(t.profit || 0).toLocaleString('en-IN')}`,
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: tableHead,
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`PNL-Report-${startDate}-to-${endDate}.pdf`);
  };

  const tableColumns = useMemo(() => getPnlColumns(), []);

  if (authLoading || dataLoading) {
    return <div className="p-4 text-center">Loading Report...</div>;
  }
  if (error) {
    return <div className="p-4 text-center text-red-500">Error: {error}</div>;
  }
  if (!currentUser) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-2">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Profit & Loss Report
        </h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md mb-2">
        <FilterSelect
          value={datePreset}
          onChange={(e) =>
            handleDatePresetChange(
              e.target.value,
              setDatePreset,
              setStartDate,
              setEndDate,
            )
          }
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="last7">Last 7 Days</option>
          <option value="last30">Last 30 Days</option>
          <option value="custom">Custom</option>
        </FilterSelect>
        <div className="grid grid-cols-2 sm:grid-cols-2 gap-2 mt-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setDatePreset('custom');
            }}
            className="w-full p-2 text-sm bg-gray-50 border border-gray-300 rounded-md"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setDatePreset('custom');
            }}
            className="w-full p-2 text-sm bg-gray-50 border border-gray-300 rounded-md"
          />
        </div>
        <button
          onClick={handleApplyFilters}
          className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg shadow-sm hover:bg-blue-700 transition"
        >
          Apply
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-2 gap-2">
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Sales"
          value={`₹${pnlSummary.totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          valueClassName="text-blue-600 text-3xl"
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Cost"
          value={`₹${pnlSummary.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          valueClassName="text-red-600 text-3xl"
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Profit / Loss"
          value={`₹${pnlSummary.grossProfit.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          valueClassName={
            pnlSummary.grossProfit >= 0
              ? 'text-green-600 text-3xl'
              : 'text-red-600 text-3xl'
          }
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Gross Profit %"
          value={`${Math.round(pnlSummary.grossProfitPercentage).toFixed(0)}%`}
          valueClassName={
            pnlSummary.grossProfit >= 0
              ? 'text-green-600 text-3xl'
              : 'text-red-600 text-3xl'
          }
        />
      </div>

      <div className="bg-white p-4 rounded-lg shadow-md flex justify-between items-center mt-2">
        <h2 className="text-lg font-semibold text-gray-700">P&L Details</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsListVisible(!isListVisible)}
            className="px-4 py-2 bg-slate-200 text-slate-800 font-semibold rounded-md hover:bg-slate-300 transition"
          >
            {isListVisible ? 'Hide List' : 'Show List'}
          </button>
          <button
            onClick={handleDownloadPdf}
            className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition"
          >
            Download as PDF
          </button>
        </div>
      </div>

      {isListVisible && (
        <CustomTable<TransactionDetail>
          data={filteredTransactions}
          columns={tableColumns}
          keyExtractor={(item) => item.id}
          sortConfig={sortConfig}
          onSort={handleSort}
          emptyMessage="No transactions found for this period."
        />
      )}
    </div>
  );
};

export default PnlReportPage;
