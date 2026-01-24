import React, { useMemo } from 'react';
import FilterSelect from './SalesReportComponents/FilterSelect';
import { useNavigate } from 'react-router-dom';
import {
  formatDate,
  formatDateForInput,
} from './SalesReportComponents/salesReport.utils';
import useSalesReport from './SalesReportComponents/useSalesReport';
import { type SaleRecord } from './SalesReportComponents/salesReport.utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';

import { IconClose } from '../../constants/Icons';
import { getSalesColumns } from '../../constants/TableColoumns';
import ReportDetails from './SalesReportComponents/ReportDetails';

const SalesReport: React.FC = () => {
  const navigate = useNavigate();
  const {
    setDatePreset,
    setCustomStartDate,
    setCustomEndDate,
    customStartDate,
    customEndDate,
    setAppliedFilters,
    sortConfig,
    setSortConfig,
    appliedFilters,
    sales,
    isLoading,
    error,
    datePreset,
    isListVisible,
    setIsListVisible,
    authLoading,
  } = useSalesReport();

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const start = new Date();
    const end = new Date();
    switch (preset) {
      case 'today':
        break;
      case 'yesterday':
        start.setDate(start.getDate() - 1);
        end.setDate(end.getDate() - 1);
        break;
      case 'last7':
        start.setDate(start.getDate() - 6);
        break;
      case 'last30':
        start.setDate(start.getDate() - 29);
        break;
      case 'custom':
        return;
    }
    setCustomStartDate(formatDateForInput(start));
    setCustomEndDate(formatDateForInput(end));
  };

  const handleApplyFilters = () => {
    const start = customStartDate ? new Date(customStartDate) : new Date(0);
    start.setHours(0, 0, 0, 0);
    const end = customEndDate ? new Date(customEndDate) : new Date();
    end.setHours(23, 59, 59, 999);
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
  };

  const handleSort = (key: keyof SaleRecord) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const { filteredSales, summary } = useMemo(() => {
    if (!appliedFilters) {
      return {
        filteredSales: [],
        summary: {
          totalSales: 0,
          totalTransactions: 0,
          totalItemsSold: 0,
          averageSaleValue: 0,
        },
      };
    }

    const newFilteredSales = sales.filter(
      (sale) =>
        sale.createdAt >= appliedFilters.start &&
        sale.createdAt <= appliedFilters.end,
    );

    newFilteredSales.sort((a, b) => {
      const key = sortConfig.key;
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      if (key === 'items') {
        const totalItemsA = a.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        const totalItemsB = b.items.reduce(
          (sum, item) => sum + item.quantity,
          0,
        );
        return (totalItemsA - totalItemsB) * direction;
      }
      const valA = a[key] ?? '';
      const valB = b[key] ?? '';
      if (typeof valA === 'string' && typeof valB === 'string')
        return valA.localeCompare(valB) * direction;
      if (typeof valA === 'number' && typeof valB === 'number')
        return (valA - valB) * direction;
      return 0;
    });

    const totalSales = newFilteredSales.reduce(
      (acc, sale) => acc + sale.totalAmount,
      0,
    );
    const totalItemsSold = newFilteredSales.reduce(
      (acc, sale) => acc + sale.items.reduce((iAcc, i) => iAcc + i.quantity, 0),
      0,
    );
    const totalTransactions = newFilteredSales.length;
    const averageSaleValue =
      totalTransactions > 0 ? totalSales / totalTransactions : 0;

    return {
      filteredSales: newFilteredSales,
      summary: {
        totalSales,
        totalTransactions,
        totalItemsSold,
        averageSaleValue,
      },
    };
  }, [appliedFilters, sales, sortConfig]);

  const downloadAsPdf = () => {
    if (!appliedFilters) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Sales Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(
      `Date Range: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`,
      14,
      29,
    );
    autoTable(doc, {
      startY: 35,
      head: [['Date', 'Party Name', 'Items', 'Amount']],
      body: filteredSales.map((sale) => [
        formatDate(sale.createdAt),
        sale.partyName,
        sale.items.reduce((sum, i) => sum + i.quantity, 0),
        `₹ ${sale.totalAmount.toLocaleString('en-IN')}`,
      ]),
      foot: [
        [
          'Total',
          '',
          `${summary.totalItemsSold}`,
          `₹ ${summary.totalSales.toLocaleString('en-IN')}`,
        ],
      ],
      footStyles: { fontStyle: 'bold' },
    });
    doc.save(`sales_report_${formatDateForInput(new Date())}.pdf`);
  };

  const tableColumns = useMemo(() => getSalesColumns(), []);

  if (isLoading || authLoading)
    return <div className="p-4 text-center">Loading...</div>;
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Sales Report
        </h1>
        <button onClick={() => navigate(-1)} className="p-2">
          <IconClose width={20} height={20} />
        </button>
      </div>

      <div className="bg-white p-2 rounded-lg shadow-md mb-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <FilterSelect
            value={datePreset}
            onChange={(e) => handleDatePresetChange(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom</option>
          </FilterSelect>
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => {
                setCustomStartDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-md"
              placeholder="Start Date"
            />
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => {
                setCustomEndDate(e.target.value);
                setDatePreset('custom');
              }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-md"
              placeholder="End Date"
            />
          </div>
        </div>
        <button
          onClick={handleApplyFilters}
          className="w-full mt-2 px-3 py-1 bg-blue-600 text-white text-lg font-semibold rounded-lg shadow-sm hover:bg-blue-700"
        >
          Apply
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-2">
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Sales"
          value={`₹${Math.round(summary.totalSales || 0).toLocaleString('en-IN')}`}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Bills"
          value={summary.totalTransactions?.toString() || '0'}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Items Sold"
          value={summary.totalItemsSold?.toString() || '0'}
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Avg Sale Value"
          value={`₹${Math.round(summary.averageSaleValue || 0).toLocaleString('en-IN')}`}
        />
      </div>
      {/* 
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mb-2">
        <div className="lg:col-span-2">
          <TopEntitiesList 
             isDataVisible={true} 
             type="sales" 
             filters={appliedFilters} 
             titleOverride="Top 5 Customers"
          />
        </div>
        <PaymentChart isDataVisible={true} type="sales" filters={appliedFilters} />
      </div> */}

      <ReportDetails
        downloadAsPdf={downloadAsPdf}
        filteredSales
        isListVisible
        setIsListVisible={setIsListVisible}
      />

      {isListVisible && (
        <CustomTable<SaleRecord>
          data={filteredSales}
          columns={tableColumns}
          keyExtractor={(sale) => sale.id}
          sortConfig={sortConfig}
          onSort={handleSort}
          emptyMessage="No sales found for the selected period."
        />
      )}
    </div>
  );
};

export default SalesReport;
