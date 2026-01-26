import React, { useMemo } from 'react';
import { type TaxReportRow } from './TaxReportComponents/taxReport.utils';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import NoGstScheme from './TaxReportComponents/NoGstScheme';
import { IconClose, IconDownload } from '../../constants/Icons';
import { InfoTooltip } from '../../Components/InfoToolTip';
import {
  formatDate,
  formatDateForInput,
} from './SalesReportComponents/salesReport.utils';
import FilterSelect from './SalesReportComponents/FilterSelect';
import useTaxReport from './TaxReportComponents/useTaxReport';
import {
  handleDatePresetChange,
  handleApplyFilters,
} from './TaxReportComponents/taxReport.utils';

const TaxReport: React.FC = () => {
  const {
    navigate,
    salesData,
    purchaseData,
    gstScheme,
    compositionRate,
    setCompositionRate,
    isLoading,
    error,
    viewMode,
    setViewMode,
    datePreset,
    setDatePreset,
    customStartDate,
    customEndDate,
    appliedFilters,
    setCustomStartDate,
    setCustomEndDate,
    setAppliedFilters,
    authLoading,
  } = useTaxReport();

  const { summary, filteredSales, filteredPurchases } = useMemo(() => {
    if (!appliedFilters || gstScheme === 'None')
      return {
        filteredSales: [],
        filteredPurchases: [],
        summary: {
          outputTax: 0,
          inputTax: 0,
          netPayable: 0,
          totalSales: 0,
          totalPurchases: 0,
        },
      };

    const fSales = salesData.filter(
      (d) => d.date >= appliedFilters.start && d.date <= appliedFilters.end,
    );
    const fPurchases = purchaseData.filter(
      (d) => d.date >= appliedFilters.start && d.date <= appliedFilters.end,
    );

    const totalOutputTax = fSales.reduce((sum, row) => sum + row.totalTax, 0);
    const totalSalesVal = fSales.reduce((sum, row) => sum + row.totalAmount, 0);

    const totalInputTax = fPurchases.reduce(
      (sum, row) => sum + row.totalTax,
      0,
    );
    const totalPurchasesVal = fPurchases.reduce(
      (sum, row) => sum + row.totalAmount,
      0,
    );

    let netPayable = 0;

    if (gstScheme === 'Regular') {
      netPayable = totalOutputTax - totalInputTax;
    } else if (gstScheme === 'Composition') {
      netPayable = totalSalesVal * (compositionRate / 100);
    }

    return {
      filteredSales: fSales,
      filteredPurchases: fPurchases,
      summary: {
        outputTax: totalOutputTax,
        inputTax: totalInputTax,
        netPayable: netPayable,
        totalSales: totalSalesVal,
        totalPurchases: totalPurchasesVal,
      },
    };
  }, [appliedFilters, salesData, purchaseData, gstScheme, compositionRate]);

  const downloadAsPdf = () => {
    if (!appliedFilters || gstScheme === 'None') return;
    const doc = new jsPDF('landscape');

    doc.setFontSize(18);
    doc.text(`Tax Report (${gstScheme} Scheme)`, 14, 22);
    doc.setFontSize(11);
    doc.text(
      `Period: ${formatDate(appliedFilters.start)} to ${formatDate(appliedFilters.end)}`,
      14,
      29,
    );

    autoTable(doc, {
      startY: 35,
      head: [['Metric', 'Amount']],
      body: [
        ['Total Sales (Turnover)', `Rs. ${summary.totalSales.toFixed(2)}`],
        ['Total Purchases', `Rs. ${summary.totalPurchases.toFixed(2)}`],
        [
          gstScheme === 'Regular'
            ? 'Output Tax Collected'
            : 'Tax Liability (Composition)',
          `Rs. ${gstScheme === 'Regular' ? summary.outputTax.toFixed(2) : summary.netPayable.toFixed(2)}`,
        ],
        [
          'Input Tax Credit (ITC)',
          `Rs. ${summary.inputTax.toFixed(2)} ${gstScheme === 'Composition' ? '(Not Usable)' : ''}`,
        ],
        ['NET TAX PAYABLE', `Rs. ${summary.netPayable.toFixed(2)}`],
      ],
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
    });

    doc.save(`Tax_Report_${formatDateForInput(new Date())}.pdf`);
  };

  const tableColumns = useMemo(
    () => [
      {
        accessor: 'date',
        header: 'Date',
        render: (row: TaxReportRow) => formatDate(row.date),
      },
      { accessor: 'invoiceNumber', header: 'Inv No' },
      { accessor: 'partyName', header: 'Party' },
      { accessor: 'partyGstin', header: 'GSTIN' },
      {
        accessor: 'taxableAmount',
        header: 'Taxable',
        render: (row: TaxReportRow) => `₹${row.taxableAmount.toFixed(2)}`,
      },
      {
        accessor: 'totalTax',
        header: 'Tax',
        render: (row: TaxReportRow) => `₹${row.totalTax.toFixed(2)}`,
      },
      {
        accessor: 'totalAmount',
        header: 'Total',
        render: (row: TaxReportRow) => `₹${row.totalAmount.toFixed(2)}`,
      },
    ],
    [],
  );

  if (isLoading || authLoading)
    return (
      <div className="p-10 text-center text-gray-500">Loading Tax Data...</div>
    );
  if (error)
    return <div className="p-10 text-center text-red-500">{error}</div>;

  if (gstScheme === 'None') {
    return <NoGstScheme />;
  }

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16">
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-xl text-center font-bold text-gray-800">
          Tax Liability Report
        </h1>
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-gray-600 hover:bg-gray-200 rounded-full"
        >
          <IconClose width={20} height={20} />
        </button>
      </div>

      <div className="bg-white p-3 rounded-lg shadow-sm mb-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FilterSelect
            label="Period"
            value={datePreset}
            onChange={(e) =>
              handleDatePresetChange(
                e.target.value,
                setDatePreset,
                setCustomStartDate,
                setCustomEndDate,
              )
            }
          >
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="quarter">Last Quarter</option>
            <option value="custom">Custom Range</option>
          </FilterSelect>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-center font-medium text-gray-600 mb-1">
                From
              </label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => {
                  setCustomStartDate(e.target.value);
                  setDatePreset('custom');
                }}
                className="w-full p-2 text-sm bg-gray-50 border rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs text-center font-medium text-gray-600 mb-1">
                To
              </label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => {
                  setCustomEndDate(e.target.value);
                  setDatePreset('custom');
                }}
                className="w-full p-2 text-sm bg-gray-50 border rounded-md"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              onClick={() =>
                handleApplyFilters(
                  customStartDate,
                  customEndDate,
                  setAppliedFilters,
                )
              }
              className="w-full py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 transition"
            >
              Apply
            </button>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 p-3 rounded-md mb-4 flex flex-col md:flex-row justify-between items-center gap-2">
        <div className="text-sm text-blue-800">
          <span className="font-bold">Detected Scheme:</span> {gstScheme}
          {gstScheme === 'Composition' && (
            <span className="ml-2 text-xs text-gray-500">
              (Flat rate on turnover, No ITC)
            </span>
          )}
        </div>
        {gstScheme === 'Composition' && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Rate (%):</span>
            <input
              type="number"
              value={compositionRate}
              onChange={(e) => setCompositionRate(Number(e.target.value))}
              className="w-16 p-1 border rounded text-center text-sm"
            />
            <InfoTooltip text="Traders/Manufacturers: 1%, Restaurants: 5%" />
          </div>
        )}
      </div>

      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
        Turnover Overview
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Sales"
          value={`₹${summary.totalSales.toLocaleString('en-IN')}`}
          className="bg-white border-blue-200"
        />
        <CustomCard
          variant={CardVariant.Summary}
          title="Total Purchases"
          value={`₹${summary.totalPurchases.toLocaleString('en-IN')}`}
          className="bg-white border-orange-200"
        />
      </div>

      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">
        Tax Liability
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <CustomCard
          variant={CardVariant.Summary}
          title={
            gstScheme === 'Regular'
              ? 'Output Tax (Sales)'
              : 'Tax Liability (On Sales)'
          }
          value={`₹${(gstScheme === 'Regular' ? summary.outputTax : summary.netPayable).toLocaleString('en-IN')}`}
        />

        <div
          className={`relative ${gstScheme === 'Composition' ? 'opacity-60' : ''}`}
        >
          <CustomCard
            variant={CardVariant.Summary}
            title="Input Tax Credit (Purchases)"
            value={`₹${summary.inputTax.toLocaleString('en-IN')}`}
          />
          {gstScheme === 'Composition' && (
            <div className="absolute top-2 right-2 text-xs bg-gray-200 px-1 rounded">
              Not Usable
            </div>
          )}
        </div>

        <div className="bg-green-50 border border-green-200 rounded-xl p-4 shadow-sm flex flex-col justify-center items-center">
          <h3 className="text-sm font-medium text-green-800 uppercase tracking-wider">
            Net Tax Payable
          </h3>
          <p className="text-2xl font-bold text-green-700 mt-1">
            ₹{Math.max(0, summary.netPayable).toLocaleString('en-IN')}
          </p>
          {summary.netPayable < 0 && (
            <p className="text-xs text-green-600 mt-1">
              Credit Carried Forward: ₹
              {Math.abs(summary.netPayable).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-2 border-b">
        {['Summary', 'Sales', 'Purchases'].map((mode) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode as any)}
            className={`px-4 py-2 text-sm font-medium ${viewMode === mode ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {mode}
          </button>
        ))}
      </div>

      {viewMode === 'Summary' ? (
        <div className="bg-white p-6 rounded shadow-sm text-center text-gray-500 mt-4">
          <p>
            Select "Sales" or "Purchases" above to view detailed line items.
          </p>
          <button
            onClick={downloadAsPdf}
            className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-slate-800 text-white rounded hover:bg-slate-700"
          >
            <IconDownload width={16} height={16} /> Download PDF Summary
          </button>
        </div>
      ) : (
        <CustomTable<TaxReportRow>
          data={viewMode === 'Sales' ? filteredSales : filteredPurchases}
          columns={tableColumns as any}
          keyExtractor={(row) => row.id}
          emptyMessage={`No ${viewMode} records found.`}
        />
      )}
    </div>
  );
};

export default TaxReport;
