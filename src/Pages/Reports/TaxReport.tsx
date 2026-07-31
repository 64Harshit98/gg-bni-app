import React, { useMemo, useState } from 'react';
import { ChevronDown, Download, Landmark, X } from 'lucide-react';

import { Button } from '../../Components/ui/button';
import { Input } from '../../Components/ui/input';
import { Spinner } from '../../Components/ui/spinner';
import { cn } from '../../lib/utils';
import { formatCurrency } from '../../utils/formatters';

import FilterSelect from './SalesReportComponents/FilterSelect';
import useTaxReport from './TaxReportComponents/useTaxReport';
import { handleDatePresetChange, handleApplyFilters } from './TaxReportComponents/taxReport.utils';
import { buildMetrics, downloadTaxReportExcel } from './TaxReportComponents/taxReportExport.utils';
import { TaxDataTable } from './TaxReportComponents/components/TaxDataTable';
import { TaxComplianceTable, type TaxComplianceRow } from './TaxReportComponents/components/TaxComplianceTable';
import { TaxSummaryPanel } from './TaxReportComponents/components/TaxSummaryPanel';
import type { TaxDocRecord } from '../../services/reports/taxReport.service';

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
        legalName: merchantProfile?.legalName,
        tradeName: merchantProfile?.tradeName,
        homeStateCode, compositionRate: compRate,
      },
      metrics, periodDate,
    });
    setDownloadMenuOpen(false);
  };

  const gstr3bRows: TaxComplianceRow[] = [
    { label: '3.1(a) Outward Taxable Supplies', values: [formatCurrency(metrics.igstOut), formatCurrency(metrics.cgstOut), formatCurrency(metrics.sgstOut)] },
    { label: '3.1(d) Inward Supplies under RCM', values: [formatCurrency(metrics.rcmIgst), formatCurrency(metrics.rcmCgst), formatCurrency(metrics.rcmSgst)] },
    { label: '4(A)(5) Eligible ITC (other than RCM)', values: [formatCurrency(metrics.itcIgst), formatCurrency(metrics.itcCgst), formatCurrency(metrics.itcSgst)] },
  ];

  const cmp08Rows: TaxComplianceRow[] = [
    { label: '1. Outward supplies', values: [formatCurrency(metrics.salesTurnover), formatCurrency((metrics.salesTurnover * (compRate / 100)) / 2), formatCurrency((metrics.salesTurnover * (compRate / 100)) / 2)] },
    { label: '2. Inward supplies (RCM)', values: [formatCurrency(0), formatCurrency(metrics.rcmCgst), formatCurrency(metrics.rcmSgst)] },
    { label: '3. Net Tax Payable', values: [formatCurrency(metrics.salesTurnover), formatCurrency(metrics.netPayable / 2), formatCurrency(metrics.netPayable / 2)], highlight: true },
  ];

  if (isLoading || authLoading) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-muted p-10 text-muted-foreground">
      <Spinner size="lg" />
      <p className="text-sm font-medium">Loading Master Tax Suite...</p>
    </div>
  );
  if (error) return (
    <div className="flex min-h-screen items-center justify-center bg-muted p-10 text-center text-destructive">
      {error}
    </div>
  );

  return (
    <div className="aurora min-h-screen bg-muted pb-16">
      {/* HEADER */}
      <header className="glass sticky top-0 z-20 flex items-center gap-3 border-b border-border px-4 py-3">
        <div className="rounded-2xl bg-gradient-to-br from-primary to-[oklch(0.6_0.22_330)] p-[3px] shadow-sm shadow-primary/20">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-gradient-brand text-white">
            <Landmark className="size-4" />
          </span>
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
            Unified Reporting <span className="text-gradient">Vault</span>
          </h1>
          <p className="text-xs text-muted-foreground">GSTR filings, liability, and compliance summaries</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Close">
          <X className="size-4" />
        </Button>
      </header>

      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-6 sm:px-6 lg:px-8">
        {/* FILTERS */}
        <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs sm:grid-cols-3">
          <FilterSelect
            label="Period"
            value={datePreset}
            onChange={(e) => handleDatePresetChange(e.target.value, setDatePreset, setCustomStartDate, setCustomEndDate)}
          >
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="quarter">Last Quarter</option>
            <option value="custom">Custom Range</option>
          </FilterSelect>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={customStartDate} onChange={(e) => { setCustomStartDate(e.target.value); setDatePreset('custom'); }} />
            <Input type="date" value={customEndDate} onChange={(e) => { setCustomEndDate(e.target.value); setDatePreset('custom'); }} />
          </div>
          <Button
            onClick={() => handleApplyFilters(customStartDate, customEndDate, setAppliedFilters)}
            className="w-full bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90"
          >
            Apply Scope
          </Button>
        </div>

        {/* TABS */}
        <div className="glass scrollbar-none flex gap-1 overflow-x-auto rounded-2xl p-1.5">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'whitespace-nowrap rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200',
                activeTab === tab
                  ? 'bg-gradient-brand text-white shadow-md shadow-primary/25'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-muted-foreground">{activeTab} Details</h2>

            <div className="relative">
              <Button
                size="sm"
                onClick={() => setDownloadMenuOpen((v) => !v)}
                className="gap-1.5 bg-success text-success-foreground shadow-sm hover:opacity-90"
              >
                <Download className="size-3.5" /> Download Excel Export
                <ChevronDown className="size-3.5" />
              </Button>
              {downloadMenuOpen && (
                <div className="absolute right-0 z-30 mt-1 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
                  {downloadOptions.map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => handleDownload(opt.key)}
                      className="block w-full px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-accent"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {activeTab === 'SUMMARY' && <TaxSummaryPanel metrics={metrics} gstScheme={gstScheme} />}

          {activeTab === 'GSTR-1' && (
            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">B2B Invoices (Registered)</h3>
                <TaxDataTable
                  data={metrics.b2bRows}
                  columns={[
                    { header: 'Inv No', accessor: 'Invoice Number' },
                    { header: 'GSTIN', accessor: 'GSTIN/UIN of Recipient' },
                    { header: 'Amount', accessor: 'Invoice Value', align: 'right' },
                    { header: 'Rate %', accessor: 'Rate', align: 'right' },
                    { header: 'Taxable', accessor: 'Taxable Value', align: 'right' },
                  ]}
                  keyExtractor={(item) => item._key as string}
                />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">B2CS Supplies (Unregistered / Consumers)</h3>
                <TaxDataTable
                  data={metrics.b2csRows}
                  columns={[
                    { header: 'Place of Supply', accessor: 'Place Of Supply' },
                    { header: 'Rate %', accessor: 'Rate', align: 'right' },
                    { header: 'Taxable Value', accessor: 'Taxable Value', align: 'right' },
                    { header: 'Type', accessor: 'Type' },
                  ]}
                  keyExtractor={(item) => `b2cs_${item['Place Of Supply']}_${item['Rate']}`}
                />
              </div>
            </div>
          )}

          {(activeTab === 'GSTR-2' || activeTab === 'GSTR-4A') && (
            <TaxDataTable
              data={purchaseData}
              columns={[
                { header: 'Bill No', accessor: 'invoiceNumber' },
                { header: 'Vendor', accessor: 'partyName' },
                { header: 'Taxable', accessor: 'taxableAmount', align: 'right' },
                { header: 'GST Claimed', accessor: 'taxAmount', align: 'right' },
              ]}
              keyExtractor={(item) => item.id as string}
            />
          )}

          {activeTab === 'GSTR-3B' && (
            <TaxComplianceTable labelHeader="Filing Component" columnHeaders={['IGST', 'CGST', 'SGST']} rows={gstr3bRows} />
          )}

          {activeTab === 'CMP-08' && (
            <TaxComplianceTable labelHeader="Box Details" columnHeaders={['Taxable Value', 'CGST Payable', 'SGST Payable']} rows={cmp08Rows} />
          )}

          {activeTab === 'TRANSACTIONS' && (
            <TaxDataTable<TaxDocRecord & { docType: string }>
              data={[
                ...salesData.map((s): TaxDocRecord & { docType: string } => ({ ...s, docType: 'Sale' })),
                ...purchaseData.map((p): TaxDocRecord & { docType: string } => ({ ...p, docType: 'Purchase' })),
              ]}
              columns={[
                { header: 'Type', accessor: 'docType' },
                { header: 'Number', accessor: 'invoiceNumber' },
                { header: 'Party', accessor: 'partyName' },
                { header: 'Total', accessor: 'totalAmount', align: 'right' },
              ]}
              keyExtractor={(item) => item.id as string}
            />
          )}

          {activeTab === 'HSN' && (
            <TaxDataTable
              data={[...metrics.hsnB2bRows, ...metrics.hsnB2cRows].filter((r) => !r.isService)}
              columns={[
                { header: 'HSN Code', accessor: 'HSN' },
                { header: 'Item details', accessor: 'Description' },
                { header: 'Qty', accessor: 'Total Quantity', align: 'right' },
                { header: 'Taxable', accessor: 'Taxable Value', align: 'right' },
                { header: 'Tax', accessor: 'Integrated Tax Amount', align: 'right' },
              ]}
              keyExtractor={(item) => `${item.HSN}_${item['Taxable Value']}`}
            />
          )}

          {activeTab === 'SAC' && (
            <TaxDataTable
              data={[...metrics.hsnB2bRows, ...metrics.hsnB2cRows].filter((r) => r.isService)}
              columns={[
                { header: 'SAC Code', accessor: 'HSN' },
                { header: 'Service name', accessor: 'Description' },
                { header: 'Taxable', accessor: 'Taxable Value', align: 'right' },
                { header: 'Tax', accessor: 'Integrated Tax Amount', align: 'right' },
              ]}
              keyExtractor={(item) => `${item.HSN}_${item['Taxable Value']}`}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TaxReport;
