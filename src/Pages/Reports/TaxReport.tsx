import React, { useMemo, useState } from 'react';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import { CustomTable } from '../../Components/CustomTable';
import { IconDownload } from '../../constants/Icons';
import BackButton from '../../Components/BackButton';
import FilterSelect from './SalesReportComponents/FilterSelect';
import useTaxReport from './TaxReportComponents/useTaxReport';
import { handleDatePresetChange, handleApplyFilters } from './TaxReportComponents/taxReport.utils';
import { buildMetrics, downloadTaxReportExcel } from './TaxReportComponents/taxReportExport.utils';

const TaxReport: React.FC = () => {
  const {
    navigate, salesData, purchaseData, gstScheme, merchantProfile, isLoading, error,
    datePreset, setDatePreset, customStartDate, customEndDate, setCustomStartDate, setCustomEndDate,
    setAppliedFilters, appliedFilters, authLoading,
  } = useTaxReport();

  const [activeTab, setActiveTab] = useState<string>('SUMMARY');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);

  const homeStateCode = merchantProfile?.homeStateCode || '09';
  const compRate = merchantProfile?.compositionRate || 1;

  // The period the report is "for" — driven by the filter's end date, falling back to today.
  const periodDate = useMemo(
    () => (appliedFilters?.end ? new Date(appliedFilters.end) : new Date()),
    [appliedFilters],
  );

  const availableTabs = useMemo(() => {
    if (gstScheme === 'Regular') return ['SUMMARY', 'GSTR-1', 'GSTR-2', 'GSTR-3B', 'TRANSACTIONS', 'HSN', 'SAC'];
    if (gstScheme === 'Composition') return ['SUMMARY', 'CMP-08', 'GSTR-4A', 'TRANSACTIONS'];
    return ['SUMMARY', 'TRANSACTIONS'];
  }, [gstScheme]);

  // Single source of truth for every number shown on screen AND in every Excel export.
  const metrics = useMemo(
    () => buildMetrics(salesData, purchaseData, gstScheme, homeStateCode, compRate),
    [salesData, purchaseData, gstScheme, homeStateCode, compRate],
  );

  const downloadOptions = useMemo(() => {
    if (gstScheme === 'Regular') {
      return [
        { key: 'GSTR-1', label: 'GSTR-1 (b2b, b2cs, HSN, docs)' },
        { key: 'GSTR-3B', label: 'GSTR-3B Summary' },
        { key: 'REGISTER', label: 'Sales & Purchase Register' },
      ] as const;
    }
    if (gstScheme === 'Composition') {
      return [
        { key: 'GSTR-4A', label: 'GSTR-4A (inward supplies)' },
        { key: 'CMP-08', label: 'CMP-08 Statement' },
        { key: 'REGISTER', label: 'Sales & Purchase Register' },
      ] as const;
    }
    return [{ key: 'REGISTER', label: 'Sales & Purchase Register' }] as const;
  }, [gstScheme]);

  const handleDownload = (reportType: (typeof downloadOptions)[number]['key']) => {
    downloadTaxReportExcel(reportType, {
      salesData, purchaseData,
      merchantProfile: {
        gstin: merchantProfile?.gstin || '',
        legalName: (merchantProfile as any)?.legalName,
        tradeName: (merchantProfile as any)?.tradeName,
        homeStateCode, compositionRate: compRate,
      },
      metrics, periodDate,
    });
    setDownloadMenuOpen(false);
  };

  if (isLoading || authLoading) return <div className="p-10 text-center text-gray-500">Loading Master Tax Suite...</div>;
  if (error) return <div className="p-10 text-center text-red-500">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 p-2 pb-16 text-gray-800">
      <div className="flex items-center justify-between pb-3 border-b bg-white p-3 rounded-sm shadow-sm mb-4">
        <BackButton className="rounded-full" onClick={() => navigate(-1)} />
        <h1 className="flex-1 text-center text-xl font-bold tracking-tight text-gray-900">Unified Reporting Vault</h1>
        <div className="w-9" />
      </div>

      <div className="bg-white p-3 rounded-sm shadow-sm mb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="w-full md:w-56">
            <FilterSelect value={datePreset} onChange={(e) => handleDatePresetChange(e.target.value, setDatePreset, setCustomStartDate, setCustomEndDate)}>
              <option value="thisMonth">This Month</option>
              <option value="lastMonth">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="custom">Custom Range</option>
            </FilterSelect>
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:flex-1 md:gap-3">
            <input type="date" value={customStartDate} onChange={(e) => { setCustomStartDate(e.target.value); setDatePreset('custom'); }} className="p-2 border rounded-sm text-sm md:flex-1" />
            <input type="date" value={customEndDate} onChange={(e) => { setCustomEndDate(e.target.value); setDatePreset('custom'); }} className="p-2 border rounded-sm text-sm md:flex-1" />
          </div>
        </div>
        <div className="mt-3">
          <button onClick={() => handleApplyFilters(customStartDate, customEndDate, setAppliedFilters)} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-sm transition shadow-sm">Apply</button>
        </div>
      </div>

      <div className="flex overflow-x-auto gap-1 border-b mb-4 bg-white p-1.5 rounded-sm shadow-sm scrollbar-none">
        {availableTabs.map((tab) => (
          <button
            key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-xs font-bold rounded-sm uppercase tracking-wider transition whitespace-nowrap ${activeTab === tab ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="bg-white p-4 rounded-sm shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-gray-500">{activeTab} Details</h2>

          <div className="relative">
            <button
              onClick={() => setDownloadMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-sm text-xs font-semibold hover:bg-green-700 shadow transition"
            >
              <IconDownload width={14} height={14} /> Download Excel Export
            </button>
            {downloadMenuOpen && (
              <div className="absolute right-0 mt-1 w-64 bg-white border rounded-sm shadow-lg z-100 overflow-hidden">
                {downloadOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => handleDownload(opt.key)}
                    className="block w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {activeTab === 'SUMMARY' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <CustomCard variant={CardVariant.Summary} title="Sales Turnover" value={`₹${metrics.salesTurnover.toLocaleString('en-IN')}`} />
              <CustomCard variant={CardVariant.Summary} title="Purchase Turnover" value={`₹${metrics.purchaseTurnover.toLocaleString('en-IN')}`} />
              {gstScheme !== 'None' && (
                <CustomCard
                  variant={CardVariant.Summary}
                  title="Tax Amount"
                  value={`₹${(metrics.igstOut + metrics.cgstOut + metrics.sgstOut).toLocaleString('en-IN')}`}
                />
              )}
              {gstScheme !== 'None' && (
                <CustomCard
                  variant={CardVariant.Summary}
                  title={gstScheme === 'Composition' ? 'ITC (Blocked)' : 'Input Credit'}
                  value={`₹${metrics.totalItc.toLocaleString('en-IN')}`}
                  className={gstScheme === 'Composition' ? 'opacity-40' : ''}
                />
              )}
            </div>

            {gstScheme !== 'None' && (
              <div className="bg-green-50 border border-green-100 rounded-sm p-4 flex flex-col justify-center items-center">
                <span className="text-xs font-extrabold text-green-800 uppercase">Net Liability Payable</span>
                <span className="text-2xl font-black text-green-700 mt-1">₹{Math.max(0, metrics.netPayable).toLocaleString('en-IN')}</span>
              </div>
            )}
          </div>
        )}

        {activeTab === 'GSTR-1' && (
          <div className="space-y-6">
            {/* B2B Section */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">B2B Invoices (Registered)</h3>
              <CustomTable
                data={metrics.b2bRows}
                columns={[
                  { accessor: 'Invoice Number', header: 'Inv No' },
                  { accessor: 'GSTIN/UIN of Recipient', header: 'GSTIN' },
                  { accessor: 'Invoice Value', header: 'Amount' },
                  { accessor: 'Rate', header: 'Rate %' },
                  { accessor: 'Taxable Value', header: 'Taxable' }
                ]}
                keyExtractor={(item: any) => item._key}
              />
            </div>

            {/* B2C Section */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">B2CS Supplies (Unregistered / Consumers)</h3>
              <CustomTable
                data={metrics.b2csRows}
                columns={[
                  { accessor: 'Place Of Supply', header: 'Place of Supply' },
                  { accessor: 'Rate', header: 'Rate %' },
                  { accessor: 'Taxable Value', header: 'Taxable Value' },
                  { accessor: 'Type', header: 'Type' }
                ]}
                keyExtractor={(item: any) => `b2cs_${item['Place Of Supply']}_${item['Rate']}`}
              />
            </div>
          </div>
        )}

        {(activeTab === 'GSTR-2' || activeTab === 'GSTR-4A') && (
          <CustomTable data={purchaseData} columns={[{ accessor: 'invoiceNumber', header: 'Bill No' }, { accessor: 'partyName', header: 'Vendor' }, { accessor: 'taxableAmount', header: 'Taxable' }, { accessor: 'taxAmount', header: 'GST Claimed' }]} keyExtractor={(item: any) => item.id} />
        )}

        {activeTab === 'GSTR-3B' && (
          <div className="overflow-x-auto">
            <table className="w-full border text-sm text-left">
              <thead className="bg-gray-50"><tr className="border-b"><th className="p-3">Filing Component</th><th className="p-3 text-right">IGST</th><th className="p-3 text-right">CGST</th><th className="p-3 text-right">SGST</th></tr></thead>
              <tbody className="divide-y">
                <tr><td className="p-3 font-medium">3.1(a) Outward Taxable Supplies</td><td className="p-3 text-right">₹{metrics.igstOut.toFixed(2)}</td><td className="p-3 text-right">₹{metrics.cgstOut.toFixed(2)}</td><td className="p-3 text-right">₹{metrics.sgstOut.toFixed(2)}</td></tr>
                <tr><td className="p-3 font-medium">3.1(d) Inward Supplies under RCM</td><td className="p-3 text-right">₹{metrics.rcmIgst.toFixed(2)}</td><td className="p-3 text-right">₹{metrics.rcmCgst.toFixed(2)}</td><td className="p-3 text-right">₹{metrics.rcmSgst.toFixed(2)}</td></tr>
                <tr><td className="p-3 font-medium">4(A)(5) Eligible ITC (other than RCM)</td><td className="p-3 text-right">₹{metrics.itcIgst.toFixed(2)}</td><td className="p-3 text-right">₹{metrics.itcCgst.toFixed(2)}</td><td className="p-3 text-right">₹{metrics.itcSgst.toFixed(2)}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'CMP-08' && (
          <div className="overflow-x-auto">
            <table className="w-full border text-sm text-left">
              <thead className="bg-gray-50"><tr className="border-b"><th className="p-3">Box Details</th><th className="p-3 text-right">Taxable Value</th><th className="p-3 text-right">CGST Payable</th><th className="p-3 text-right">SGST Payable</th></tr></thead>
              <tbody className="divide-y">
                <tr><td className="p-3">1. Outward supplies</td><td className="p-3 text-right">₹{metrics.salesTurnover.toFixed(2)}</td><td className="p-3 text-right">₹{((metrics.salesTurnover * (compRate / 100)) / 2).toFixed(2)}</td><td className="p-3 text-right">₹{((metrics.salesTurnover * (compRate / 100)) / 2).toFixed(2)}</td></tr>
                <tr><td className="p-3">2. Inward supplies (RCM)</td><td className="p-3 text-right">₹0.00</td><td className="p-3 text-right">₹{metrics.rcmCgst.toFixed(2)}</td><td className="p-3 text-right">₹{metrics.rcmSgst.toFixed(2)}</td></tr>
                <tr className="bg-green-50 font-bold"><td className="p-3">3. Net Tax Payable</td><td className="p-3 text-right">₹{metrics.salesTurnover.toFixed(2)}</td><td className="p-3 text-right">₹{(metrics.netPayable / 2).toFixed(2)}</td><td className="p-3 text-right">₹{(metrics.netPayable / 2).toFixed(2)}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'TRANSACTIONS' && (
          <CustomTable data={[...salesData.map((s) => ({ ...s, docType: 'Sale' })), ...purchaseData.map((p) => ({ ...p, docType: 'Purchase' }))]} columns={[{ accessor: 'docType', header: 'Type' }, { accessor: 'invoiceNumber', header: 'Number' }, { accessor: 'partyName', header: 'Party' }, { accessor: 'totalAmount', header: 'Total' }]} keyExtractor={(item: any) => item.id} />
        )}

        {activeTab === 'HSN' && (
          <CustomTable data={[...metrics.hsnB2bRows, ...metrics.hsnB2cRows].filter((r: any) => !r.isService)} columns={[{ accessor: 'HSN', header: 'HSN Code' }, { accessor: 'Description', header: 'Item details' }, { accessor: 'Total Quantity', header: 'Qty' }, { accessor: 'Taxable Value', header: 'Taxable' }, { accessor: 'Integrated Tax Amount', header: 'Tax' }]} keyExtractor={(item: any) => `${item.HSN}_${item['Taxable Value']}`} />
        )}

        {activeTab === 'SAC' && (
          <CustomTable data={[...metrics.hsnB2bRows, ...metrics.hsnB2cRows].filter((r: any) => r.isService)} columns={[{ accessor: 'HSN', header: 'SAC Code' }, { accessor: 'Description', header: 'Service name' }, { accessor: 'Taxable Value', header: 'Taxable' }, { accessor: 'Integrated Tax Amount', header: 'Tax' }]} keyExtractor={(item: any) => `${item.HSN}_${item['Taxable Value']}`} />
        )}
      </div>
    </div>
  );
};

export default TaxReport;