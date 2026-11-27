import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  FileJson,
  FileSpreadsheet,
  FileText,
  Hash,
  Landmark,
  Scale,
  Wallet,
} from 'lucide-react';
import BackButton from '../../Components/BackButton';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import { ROUTES } from '../../constants/routes.constants';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import CustomRangePanel from './SalesReportComponents/CustomRangePanel';
import { formatDateForInput, formatRangeLabel, parseInputDate } from './SalesReportComponents/salesReport.utils';
import useTaxReport from './TaxReportComponents/useTaxReport';
import { TAX_PRESETS, getTaxPresetRange } from './TaxReportComponents/taxReport.utils';
import TaxTable, { type TaxColumn } from './TaxReportComponents/TaxTable';
import TaxDownloadMenu, { type TaxDownloadOption } from './TaxReportComponents/TaxDownloadMenu';
import {
  buildMetrics,
  combineHsnRows,
  downloadGSTR1Json,
  downloadTaxReportExcel,
  getItems,
  gstr1JsonBlocker,
  posLabel,
  round2,
  toDateObj,
  type CatalogueLookup,
  type TaxDownloadType,
} from './TaxReportComponents/taxReportExport.utils';

/* ---------- formatting ---------- */
const inr = (v: number) =>
  `${v < 0 ? '-' : ''}₹${Math.abs(Number(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const inrRound = (v: number) => `₹${Math.round(Number(v) || 0).toLocaleString('en-IN')}`;
const fmtDate = (ts: any) =>
  toDateObj(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const sumOf = <T,>(rows: T[], pick: (r: T) => number) => round2(rows.reduce((s, r) => s + (Number(pick(r)) || 0), 0));

/* ---------- tabs ---------- */
type TabKey = 'SUMMARY' | 'GSTR-1' | 'GSTR-2' | 'GSTR-3B' | 'HSN' | 'SAC' | 'CMP-08' | 'GSTR-4A' | 'TRANSACTIONS';

const TAB_META: Record<TabKey, { label: string; hint: string }> = {
  SUMMARY: { label: 'Summary', hint: 'Tax collected, credit available and what you owe for the period' },
  'GSTR-1': { label: 'GSTR-1', hint: 'Outward supplies: B2B invoices, B2C summary and documents issued' },
  'GSTR-2': { label: 'Purchases (ITC)', hint: 'Purchase bills and the input tax credit they carry' },
  'GSTR-3B': { label: 'GSTR-3B', hint: 'Monthly summary return: Table 3.1 liability and Table 4 ITC' },
  HSN: { label: 'HSN summary', hint: 'GSTR-1 Table 12: goods sold, HSN and rate wise' },
  SAC: { label: 'SAC (services)', hint: 'GSTR-1 Table 12: services sold, SAC and rate wise' },
  'CMP-08': { label: 'CMP-08', hint: 'Quarterly composition tax statement' },
  'GSTR-4A': { label: 'GSTR-4A', hint: 'Inward supplies from registered suppliers' },
  TRANSACTIONS: { label: 'All bills', hint: 'Every sale and purchase in the period' },
};

const SCHEME_BADGE: Record<string, string> = {
  Regular: 'bg-blue-50 text-blue-700',
  Composition: 'bg-violet-50 text-violet-700',
  None: 'bg-slate-100 text-slate-600',
};

/* ---------- small layout pieces ---------- */
const SubSection: React.FC<{ title: string; meta?: string; first?: boolean; children: React.ReactNode }> = ({
  title,
  meta,
  first,
  children,
}) => (
  <div className={first ? '' : 'border-t border-line'}>
    <div className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {meta && <span className="shrink-0 text-xs text-slate-500">{meta}</span>}
    </div>
    {children}
  </div>
);

const TaxReport: React.FC = () => {
  const {
    salesData, purchaseData, gstScheme, merchantProfile, isLoading, isFetching, error,
    datePreset, setDatePreset, customStartDate, customEndDate, setCustomStartDate, setCustomEndDate,
    setAppliedFilters, appliedFilters, authLoading,
  } = useTaxReport();

  const { items: catalogueItems } = useCatalogueData();

  const [activeTab, setActiveTab] = useState<TabKey>('SUMMARY');
  const [isRangeOpen, setIsRangeOpen] = useState(false);
  const [hsnSupply, setHsnSupply] = useState<'ALL' | 'B2B' | 'B2C'>('ALL');
  const [feedback, setFeedback] = useState<{ type: State; message: string } | null>(null);

  const homeStateCode = merchantProfile.homeStateCode || '09';
  const compRate = merchantProfile.compositionRate || 1;

  // Sale lines rarely store hsnSac themselves — resolve it from the catalogue item, like the bill PDF does.
  const lookup = useMemo<CatalogueLookup>(() => {
    const m: CatalogueLookup = new Map();
    catalogueItems.forEach((i) => {
      const v = { hsn: i.hsnSac, unit: i.unit };
      if (i.id) m.set(String(i.id), v);
      if (i.firestoreDocId) m.set(String(i.firestoreDocId), v);
    });
    return m;
  }, [catalogueItems]);

  // The period the report is "for" — the filter's end date, falling back to today.
  const periodDate = useMemo(
    () => (appliedFilters?.end ? new Date(appliedFilters.end) : new Date()),
    [appliedFilters],
  );
  const rangeLabel = appliedFilters ? formatRangeLabel(appliedFilters.start, appliedFilters.end) : '';

  const availableTabs = useMemo<TabKey[]>(() => {
    if (gstScheme === 'Regular') return ['SUMMARY', 'GSTR-1', 'GSTR-3B', 'HSN', 'SAC', 'GSTR-2', 'TRANSACTIONS'];
    if (gstScheme === 'Composition') return ['SUMMARY', 'CMP-08', 'GSTR-4A', 'TRANSACTIONS'];
    return ['SUMMARY', 'TRANSACTIONS'];
  }, [gstScheme]);

  useEffect(() => {
    if (!availableTabs.includes(activeTab)) setActiveTab('SUMMARY');
  }, [availableTabs, activeTab]);

  // Single source of truth for every number shown on screen AND in every export.
  const metrics = useMemo(
    () => buildMetrics(salesData, purchaseData, gstScheme, homeStateCode, compRate, lookup),
    [salesData, purchaseData, gstScheme, homeStateCode, compRate, lookup],
  );

  const outputTax = metrics.igstOut + metrics.cgstOut + metrics.sgstOut;
  const compositionTax = metrics.salesTurnover * (compRate / 100);

  /* ---------- derived rows ---------- */
  const rateRows = useMemo(() => {
    const byRate = new Map<number, { rate: number; taxable: number; tax: number }>();
    const add = (rate: number, taxable: number, tax: number) => {
      const r = byRate.get(rate) || { rate, taxable: 0, tax: 0 };
      r.taxable += taxable;
      r.tax += tax;
      byRate.set(rate, r);
    };
    metrics.b2bInvoices.forEach((inv) => inv.rates.forEach((r) => add(r.rt, r.txval, r.tax)));
    metrics.b2csRows.forEach((r) => add(r.Rate, r['Taxable Value'], r.taxAmount));
    return Array.from(byRate.values()).sort((a, b) => a.rate - b.rate);
  }, [metrics]);

  const purchaseRows = useMemo(
    () =>
      purchaseData.map((p) => {
        const items = getItems(p, lookup);
        const taxable = items.reduce((s, i) => s + i.taxableAmount, 0);
        const tax = items.reduce(
          (s, i) => s + (i.taxAmount > 0 ? i.taxAmount : round2(i.taxableAmount * (i.taxRate / 100))),
          0,
        );
        return {
          id: p.id as string,
          date: p.createdAt,
          number: String(p.invoiceNumber || p.billNumber || '—'),
          party: String(p.partyName || '—'),
          gstin: String(p.partyGstin || ''),
          isRcm: !!p.isRcm,
          taxable: round2(taxable),
          tax: round2(tax),
          total: Number(p.finalAmount || p.grandTotal || p.totalAmount || 0),
        };
      }),
    [purchaseData, lookup],
  );

  const gstr4aRows = useMemo(() => purchaseRows.filter((r) => r.gstin.trim().length === 15), [purchaseRows]);

  const transactionRows = useMemo(
    () =>
      [
        ...salesData.map((s) => ({ ...s, docType: 'Sale' as const })),
        ...purchaseData.map((p) => ({ ...p, docType: 'Purchase' as const })),
      ].sort((a, b) => toDateObj(b.createdAt).getTime() - toDateObj(a.createdAt).getTime()),
    [salesData, purchaseData],
  );

  const hsnRows = useMemo(() => {
    const rows =
      hsnSupply === 'B2B' ? metrics.hsnB2bRows : hsnSupply === 'B2C' ? metrics.hsnB2cRows : combineHsnRows(metrics);
    return rows.filter((r: any) => (activeTab === 'SAC' ? r.isService : !r.isService));
  }, [metrics, hsnSupply, activeTab]);

  /* ---------- date filters ---------- */
  const handlePreset = (preset: string) => {
    const range = getTaxPresetRange(preset);
    if (!range) return;
    setDatePreset(preset);
    setIsRangeOpen(false);
    setCustomStartDate(formatDateForInput(range.start));
    setCustomEndDate(formatDateForInput(range.end));
    setAppliedFilters({ start: range.start.getTime(), end: range.end.getTime() });
  };

  const handleApplyCustomRange = (startValue: string, endValue: string) => {
    const start = parseInputDate(startValue);
    start.setHours(0, 0, 0, 0);
    const end = parseInputDate(endValue);
    end.setHours(23, 59, 59, 999);
    setDatePreset('custom');
    setCustomStartDate(startValue);
    setCustomEndDate(endValue);
    setAppliedFilters({ start: start.getTime(), end: end.getTime() });
    setIsRangeOpen(false);
  };

  /* ---------- downloads ---------- */
  const downloadOptions = useMemo<TaxDownloadOption[]>(() => {
    const register: TaxDownloadOption = {
      key: 'REGISTER', label: 'Sales & purchase register', hint: 'Every bill in the period (Excel)', icon: BookOpen,
    };
    if (gstScheme === 'Regular') {
      return [
        { key: 'GSTR-1-JSON', label: 'GSTR-1 JSON', hint: 'Upload to the GST portal / offline tool', icon: FileJson },
        { key: 'GSTR-1', label: 'GSTR-1 Excel', hint: 'b2b, b2cs, hsn, docs (GSTN template)', icon: FileSpreadsheet },
        { key: 'HSN', label: 'HSN summary', hint: 'Table 12, HSN and rate wise (Excel)', icon: Hash },
        { key: 'GSTR-3B', label: 'GSTR-3B summary', hint: 'Liability, ITC and net payable (Excel)', icon: FileText },
        register,
      ];
    }
    if (gstScheme === 'Composition') {
      return [
        { key: 'CMP-08', label: 'CMP-08 statement', hint: 'Quarterly composition tax (Excel)', icon: FileText },
        { key: 'GSTR-4A', label: 'GSTR-4A', hint: 'Inward supplies, registered suppliers (Excel)', icon: FileSpreadsheet },
        register,
      ];
    }
    return [register];
  }, [gstScheme]);

  const handleDownload = (type: TaxDownloadType) => {
    try {
      if (type === 'GSTR-1-JSON') {
        const blocker = gstr1JsonBlocker(merchantProfile, appliedFilters);
        if (blocker) {
          setFeedback({ type: State.ERROR, message: blocker });
          return;
        }
        downloadGSTR1Json(merchantProfile, metrics, periodDate);
        return;
      }
      downloadTaxReportExcel(type, {
        salesData, purchaseData, merchantProfile, metrics, periodDate, periodText: rangeLabel, lookup,
      });
    } catch (e) {
      console.error('Tax report download failed:', e);
      setFeedback({ type: State.ERROR, message: 'Could not create the file. Please try again.' });
    }
  };

  /* ---------- load states ---------- */
  if (isLoading || authLoading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-canvas text-sm text-slate-500">
        Loading tax report...
      </div>
    );
  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  const fetchingClass = isFetching ? 'pointer-events-none opacity-50' : '';
  const chipClass = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-sm border px-3.5 py-1.5 text-sm font-medium transition ${active
      ? 'border-slate-900 bg-slate-900 text-white'
      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
    }`;

  const businessName = merchantProfile.tradeName || merchantProfile.legalName || 'Your business';
  const gstinMissing = gstScheme !== 'None' && !merchantProfile.gstin;

  /* ---------- stat cards ---------- */
  const statCards =
    gstScheme === 'Composition'
      ? [
        { label: 'Sales turnover', value: inrRound(metrics.salesTurnover), hint: `${salesData.length} bills`, icon: ArrowUpRight, iconClass: 'bg-blue-50 text-blue-600', valueClass: 'text-blue-600' },
        { label: `Composition tax (${compRate}%)`, value: inrRound(compositionTax), hint: 'on total turnover', icon: Landmark, iconClass: 'bg-violet-50 text-violet-600', valueClass: 'text-slate-900' },
        { label: 'Reverse charge', value: inrRound(metrics.rcmLiability), hint: 'payable in cash', icon: ArrowDownLeft, iconClass: 'bg-orange-50 text-orange-600', valueClass: 'text-slate-900' },
        { label: 'Net payable', value: inrRound(Math.max(0, metrics.netPayable)), hint: 'ITC not allowed', icon: Wallet, iconClass: 'bg-green-50 text-green-600', valueClass: 'text-green-700' },
      ]
      : gstScheme === 'Regular'
        ? [
          { label: 'Sales turnover', value: inrRound(metrics.salesTurnover), hint: `${salesData.length} bills · ${inrRound(metrics.salesTaxable)} taxable`, icon: ArrowUpRight, iconClass: 'bg-blue-50 text-blue-600', valueClass: 'text-blue-600' },
          { label: 'Output GST', value: inrRound(outputTax), hint: `IGST ${inrRound(metrics.igstOut)} · CGST ${inrRound(metrics.cgstOut)} · SGST ${inrRound(metrics.sgstOut)}`, icon: Landmark, iconClass: 'bg-pink-50 text-pink-600', valueClass: 'text-slate-900' },
          { label: 'Input tax credit', value: inrRound(metrics.totalItc), hint: `${purchaseData.length} purchase bills`, icon: ArrowDownLeft, iconClass: 'bg-orange-50 text-orange-600', valueClass: 'text-slate-900' },
          metrics.netPayable >= 0
            ? { label: 'Net GST payable', value: inrRound(metrics.netPayable), hint: 'output + RCM − ITC', icon: Wallet, iconClass: 'bg-green-50 text-green-600', valueClass: 'text-green-700' }
            : { label: 'Credit carried forward', value: inrRound(-metrics.netPayable), hint: 'ITC exceeds output tax', icon: Wallet, iconClass: 'bg-green-50 text-green-600', valueClass: 'text-green-700' },
        ]
        : [
          { label: 'Sales turnover', value: inrRound(metrics.salesTurnover), hint: `${salesData.length} bills`, icon: ArrowUpRight, iconClass: 'bg-blue-50 text-blue-600', valueClass: 'text-blue-600' },
          { label: 'Purchases', value: inrRound(metrics.purchaseTurnover), hint: `${purchaseData.length} bills`, icon: ArrowDownLeft, iconClass: 'bg-orange-50 text-orange-600', valueClass: 'text-slate-900' },
        ];

  /* ---------- table column sets ---------- */
  const b2bColumns: TaxColumn<any>[] = [
    { key: 'inv', header: 'Invoice', render: (r) => <span className="font-semibold text-blue-600">{r['Invoice Number']}</span> },
    { key: 'date', header: 'Date', render: (r) => r['Invoice date'] },
    { key: 'gstin', header: 'GSTIN', render: (r) => <span className="font-mono text-xs">{r['GSTIN/UIN of Recipient']}</span> },
    { key: 'name', header: 'Receiver', render: (r) => r['Receiver Name'] || '—' },
    { key: 'pos', header: 'Place of supply', render: (r) => r['Place Of Supply'] },
    { key: 'rate', header: 'Rate', align: 'right', render: (r) => `${r.Rate}%` },
    { key: 'taxable', header: 'Taxable', align: 'right', render: (r) => inr(r['Taxable Value']), footer: inr(sumOf(metrics.b2bRows, (r: any) => r['Taxable Value'])) },
    { key: 'val', header: 'Invoice value', align: 'right', render: (r) => inr(r['Invoice Value']) },
  ];

  const b2csColumns: TaxColumn<any>[] = [
    { key: 'pos', header: 'Place of supply', render: (r) => r['Place Of Supply'], footer: 'Total' },
    { key: 'type', header: 'Supply', render: (r) => (r.isInterState ? 'Inter-state' : 'Intra-state') },
    { key: 'rate', header: 'Rate', align: 'right', render: (r) => `${r.Rate}%` },
    { key: 'taxable', header: 'Taxable', align: 'right', render: (r) => inr(r['Taxable Value']), footer: inr(sumOf(metrics.b2csRows, (r: any) => r['Taxable Value'])) },
    { key: 'tax', header: 'Tax', align: 'right', render: (r) => inr(r.taxAmount), footer: inr(sumOf(metrics.b2csRows, (r: any) => r.taxAmount)) },
  ];

  const docsColumns: TaxColumn<any>[] = [
    { key: 'nature', header: 'Nature of document', render: (r) => r['Nature of Document'] },
    { key: 'from', header: 'From', render: (r) => r['Sr. No. From'] },
    { key: 'to', header: 'To', render: (r) => r['Sr. No. To'] },
    { key: 'total', header: 'Total', align: 'right', render: (r) => r['Total Number'] },
    { key: 'cancel', header: 'Cancelled', align: 'right', render: (r) => r.Cancelled },
  ];

  const purchaseColumns: TaxColumn<(typeof purchaseRows)[number]>[] = [
    { key: 'date', header: 'Date', render: (r) => fmtDate(r.date), footer: 'Total' },
    { key: 'no', header: 'Bill no.', render: (r) => <span className="font-semibold text-blue-600">{r.number}</span> },
    { key: 'party', header: 'Supplier', render: (r) => r.party },
    { key: 'gstin', header: 'GSTIN', render: (r) => (r.gstin ? <span className="font-mono text-xs">{r.gstin}</span> : <span className="text-slate-400">Unregistered</span>) },
    {
      key: 'rcm', header: 'RCM', render: (r) =>
        r.isRcm ? <span className="rounded-sm bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700">RCM</span> : '—',
    },
    { key: 'taxable', header: 'Taxable', align: 'right', render: (r) => inr(r.taxable), footer: inr(sumOf(activeTab === 'GSTR-4A' ? gstr4aRows : purchaseRows, (r) => r.taxable)) },
    { key: 'tax', header: 'GST', align: 'right', render: (r) => inr(r.tax), footer: inr(sumOf(activeTab === 'GSTR-4A' ? gstr4aRows : purchaseRows, (r) => r.tax)) },
    { key: 'total', header: 'Bill total', align: 'right', render: (r) => inr(r.total), footer: inr(sumOf(activeTab === 'GSTR-4A' ? gstr4aRows : purchaseRows, (r) => r.total)) },
  ];

  const isSacTab = activeTab === 'SAC';
  const hsnColumns: TaxColumn<any>[] = [
    { key: 'hsn', header: isSacTab ? 'SAC' : 'HSN', render: (r) => <span className="font-mono font-semibold text-slate-900">{r.HSN}</span>, footer: 'Total' },
    { key: 'desc', header: 'Description', render: (r) => <span className="block max-w-[16rem] truncate" title={r.Description}>{r.Description}</span> },
    ...(!isSacTab
      ? [
        { key: 'uqc', header: 'UQC', render: (r: any) => r.UQC },
        { key: 'qty', header: 'Qty', align: 'right' as const, render: (r: any) => r['Total Quantity'].toLocaleString('en-IN') },
      ]
      : []),
    { key: 'rate', header: 'Rate', align: 'right', render: (r) => `${r.Rate}%` },
    { key: 'taxable', header: 'Taxable', align: 'right', render: (r) => inr(r['Taxable Value']), footer: inr(sumOf(hsnRows, (r: any) => r['Taxable Value'])) },
    { key: 'igst', header: 'IGST', align: 'right', render: (r) => inr(r['Integrated Tax Amount']), footer: inr(sumOf(hsnRows, (r: any) => r['Integrated Tax Amount'])) },
    { key: 'cgst', header: 'CGST', align: 'right', render: (r) => inr(r['Central Tax Amount']), footer: inr(sumOf(hsnRows, (r: any) => r['Central Tax Amount'])) },
    { key: 'sgst', header: 'SGST', align: 'right', render: (r) => inr(r['State/UT Tax Amount']), footer: inr(sumOf(hsnRows, (r: any) => r['State/UT Tax Amount'])) },
    { key: 'total', header: 'Total value', align: 'right', render: (r) => inr(r['Total Value']), footer: inr(sumOf(hsnRows, (r: any) => r['Total Value'])) },
  ];

  const hsnMissingColumns: TaxColumn<any>[] = [
    { key: 'desc', header: 'Item', render: (r) => r.Description },
    { key: 'supply', header: 'Supply', render: (r) => r.Supply },
    { key: 'rate', header: 'Rate', align: 'right', render: (r) => `${r.Rate}%` },
    { key: 'qty', header: 'Qty', align: 'right', render: (r) => r['Total Quantity'].toLocaleString('en-IN') },
    { key: 'taxable', header: 'Taxable', align: 'right', render: (r) => inr(r['Taxable Value']) },
  ];

  const rateColumns: TaxColumn<(typeof rateRows)[number]>[] = [
    { key: 'rate', header: 'GST rate', render: (r) => `${r.rate}%`, footer: 'Total' },
    { key: 'taxable', header: 'Taxable value', align: 'right', render: (r) => inr(r.taxable), footer: inr(sumOf(rateRows, (r) => r.taxable)) },
    { key: 'tax', header: 'Tax', align: 'right', render: (r) => inr(r.tax), footer: inr(sumOf(rateRows, (r) => r.tax)) },
  ];

  const txnColumns: TaxColumn<any>[] = [
    { key: 'date', header: 'Date', render: (r) => fmtDate(r.createdAt) },
    {
      key: 'type', header: 'Type', render: (r) => (
        <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${r.docType === 'Sale' ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-700'}`}>
          {r.docType}
        </span>
      ),
    },
    { key: 'no', header: 'Number', render: (r) => <span className="font-semibold text-blue-600">{r.invoiceNumber || r.billNumber || '—'}</span> },
    { key: 'party', header: 'Party', render: (r) => r.partyName || '—' },
    { key: 'gstin', header: 'GSTIN', render: (r) => (r.partyGstin ? <span className="font-mono text-xs">{r.partyGstin}</span> : '—') },
    { key: 'total', header: 'Total', align: 'right', render: (r) => inr(Number(r.finalAmount || r.grandTotal || r.totalAmount || 0)) },
  ];

  /* ---------- liability table (GSTR-3B style), used on Summary + GSTR-3B ---------- */
  const LiabilityTable: React.FC<{ full?: boolean }> = ({ full }) => {
    const netI = metrics.igstOut + metrics.rcmIgst - metrics.itcIgst;
    const netC = metrics.cgstOut + metrics.rcmCgst - metrics.itcCgst;
    const netS = metrics.sgstOut + metrics.rcmSgst - metrics.itcSgst;
    const rows: { label: string; taxable?: number; i: number; c: number; s: number; tone?: 'minus' | 'net' }[] = [
      { label: full ? '3.1(a) Outward taxable supplies' : 'Output tax on sales', taxable: metrics.salesTaxable, i: metrics.igstOut, c: metrics.cgstOut, s: metrics.sgstOut },
      { label: full ? '3.1(d) Inward supplies under RCM' : 'Reverse charge (RCM)', i: metrics.rcmIgst, c: metrics.rcmCgst, s: metrics.rcmSgst },
      { label: full ? '4(A)(5) Eligible ITC (all other)' : 'Less: input tax credit', i: metrics.itcIgst, c: metrics.itcCgst, s: metrics.itcSgst, tone: 'minus' },
      { label: 'Net payable', i: netI, c: netC, s: netS, tone: 'net' },
    ];
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-sunken text-[11px] uppercase tracking-wide text-blue-700/80">
            <tr>
              <th className="px-4 py-2.5 text-left font-semibold">Component</th>
              {full && <th className="px-4 py-2.5 text-right font-semibold">Taxable</th>}
              <th className="px-4 py-2.5 text-right font-semibold">IGST</th>
              <th className="px-4 py-2.5 text-right font-semibold">CGST</th>
              <th className="px-4 py-2.5 text-right font-semibold">SGST</th>
              <th className="px-4 py-2.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const net = r.tone === 'net';
              return (
                <tr key={r.label} className={`border-t ${net ? 'border-slate-200 bg-green-50 font-semibold' : 'border-line'}`}>
                  <td className={`whitespace-nowrap px-4 py-2.5 ${net ? 'text-green-800' : 'text-slate-700'}`}>{r.label}</td>
                  {full && <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">{r.taxable !== undefined ? inr(r.taxable) : ''}</td>}
                  {[r.i, r.c, r.s, r.i + r.c + r.s].map((v, idx) => (
                    <td
                      key={idx}
                      className={`whitespace-nowrap px-4 py-2.5 text-right tabular-nums ${net ? (v < 0 ? 'text-amber-700' : 'text-green-800') : r.tone === 'minus' ? 'text-slate-500' : 'text-slate-900'}`}
                    >
                      {r.tone === 'minus' && v > 0 ? `− ${inr(v)}` : inr(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {netI + netC + netS < 0 && (
          <p className="border-t border-line px-4 py-2.5 text-xs text-amber-700">
            Negative figures are unused input credit — they carry forward to the next period.
          </p>
        )}
      </div>
    );
  };

  /* ---------- render ---------- */
  return (
    <div className="min-h-screen bg-canvas px-3 pb-20 pt-3 md:px-6 md:pb-8 md:pt-5">
      {feedback && (
        <Modal type={feedback.type} message={feedback.message} onClose={() => setFeedback(null)} showConfirmButton={false} />
      )}

      {/* HEADER */}
      <header className="mb-4 flex items-center gap-2 md:gap-3">
        <div className="flex-shrink-0">
          <BackButton />
        </div>
        <div className="min-w-0 flex-1">
          <p className="hidden text-xs text-slate-500 md:block">Reports /</p>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Tax report</h1>
            <span className={`rounded-sm px-2 py-0.5 text-[11px] font-semibold ${SCHEME_BADGE[gstScheme]}`}>
              {gstScheme === 'None' ? 'GST off' : `${gstScheme} GST`}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500">{rangeLabel}</p>
        </div>

        {/* Desktop downloads */}
        <div className="hidden items-center gap-2 md:flex">
          {gstScheme === 'Regular' && (
            <button
              onClick={() => handleDownload('GSTR-1-JSON')}
              title="GSTR-1 JSON for the GST portal"
              className="inline-flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-400"
            >
              <FileJson size={15} className="text-blue-600" />
              GSTR-1 JSON
            </button>
          )}
          <TaxDownloadMenu options={downloadOptions} onSelect={handleDownload} />
        </div>

        {/* Mobile downloads */}
        <div className="flex items-center md:hidden">
          {gstScheme === 'Regular' && (
            <button
              onClick={() => handleDownload('GSTR-1-JSON')}
              aria-label="Download GSTR-1 JSON"
              className="rounded-sm p-2 text-slate-700 transition hover:bg-slate-200"
            >
              <FileJson size={20} />
            </button>
          )}
          <TaxDownloadMenu variant="icon" options={downloadOptions} onSelect={handleDownload} />
        </div>
      </header>

      {/* DATE FILTERS */}
      <div className="relative mb-4 flex items-center gap-3">
        <div className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TAX_PRESETS.map((p) => (
            <button key={p.value} onClick={() => handlePreset(p.value)} className={chipClass(datePreset === p.value)}>
              <span className="md:hidden">{p.shortLabel}</span>
              <span className="hidden md:inline">{p.label}</span>
            </button>
          ))}
          <button onClick={() => setIsRangeOpen((o) => !o)} className={`md:hidden ${chipClass(datePreset === 'custom')}`}>
            Custom
          </button>
        </div>
        <button
          onClick={() => setIsRangeOpen((o) => !o)}
          className={`hidden shrink-0 items-center gap-2 rounded-sm border bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition hover:border-slate-400 md:inline-flex ${datePreset === 'custom' ? 'border-slate-900' : 'border-slate-300'}`}
        >
          <CalendarDays size={15} className="text-slate-500" />
          {rangeLabel}
          <ChevronDown size={15} className="text-slate-500" />
        </button>
        {isRangeOpen && (
          <div className="absolute right-0 top-full z-30 mt-2 w-full md:w-80">
            <CustomRangePanel
              initialStart={customStartDate}
              initialEnd={customEndDate}
              onApply={handleApplyCustomRange}
              onCancel={() => setIsRangeOpen(false)}
            />
          </div>
        )}
      </div>

      {/* COMPANY DETAILS */}
      <section className="mb-4 rounded-sm border border-line bg-white p-3 shadow-card md:p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-blue-600">
            <Building2 size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{businessName}</p>
            {merchantProfile.legalName && merchantProfile.legalName !== businessName && (
              <p className="truncate text-xs text-slate-500">Legal name: {merchantProfile.legalName}</p>
            )}
            {merchantProfile.address && <p className="truncate text-xs text-slate-500">{merchantProfile.address}</p>}
          </div>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-3 text-xs md:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-slate-500">GSTIN</dt>
            <dd className={`truncate font-mono font-semibold ${merchantProfile.gstin ? 'text-slate-900' : 'text-amber-700'}`}>
              {merchantProfile.gstin || 'Not set'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500">State</dt>
            <dd className="truncate font-semibold text-slate-900">{posLabel(homeStateCode)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500">Scheme</dt>
            <dd className="truncate font-semibold text-slate-900">
              {gstScheme === 'Composition' ? `Composition · ${compRate}%` : gstScheme === 'None' ? 'GST off' : 'Regular'}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-slate-500">Return period</dt>
            <dd className="truncate font-semibold text-slate-900">{rangeLabel}</dd>
          </div>
        </dl>
        {gstinMissing && (
          <div className="mt-3 flex items-start gap-2 rounded-sm bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              Your GSTIN is not set, so downloads show "NOT PROVIDED" and the GSTR-1 JSON can't be made.{' '}
              <Link to={ROUTES.EDIT_PROFILE} className="font-semibold underline">Add it in your profile</Link>.
            </span>
          </div>
        )}
      </section>

      {/* SUMMARY CARDS */}
      <div className={`mb-4 grid grid-cols-2 gap-2.5 transition-opacity md:gap-4 ${statCards.length === 4 ? 'md:grid-cols-4' : 'md:grid-cols-2'} ${fetchingClass}`}>
        {statCards.map(({ label, value, hint, icon: Icon, iconClass, valueClass }) => (
          <div key={label} className="rounded-sm border border-line bg-white p-3 shadow-card md:p-4">
            <div className="flex items-center gap-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}>
                <Icon size={14} />
              </span>
              <span className="truncate text-xs font-medium text-slate-700 md:text-sm">{label}</span>
            </div>
            <p className={`mt-2 text-xl font-bold md:text-2xl ${valueClass}`}>{value}</p>
            <p title={hint} className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
          </div>
        ))}
      </div>

      {/* TABS */}
      <div className="mb-3 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {availableTabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={chipClass(activeTab === tab)}>
            {TAB_META[tab].label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <section className={`overflow-hidden rounded-sm border border-line bg-white shadow-card transition-opacity ${fetchingClass}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">{TAB_META[activeTab].label}</h2>
            <p className="text-xs text-slate-500">{TAB_META[activeTab].hint}</p>
          </div>
          {(activeTab === 'HSN' || activeTab === 'SAC') && (
            <div className="flex rounded-sm border border-slate-300 bg-white p-0.5 text-xs font-medium">
              {(['ALL', 'B2B', 'B2C'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setHsnSupply(s)}
                  className={`rounded-sm px-3 py-1 transition ${hsnSupply === s ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {s === 'ALL' ? 'All' : s}
                </button>
              ))}
            </div>
          )}
        </div>

        {activeTab === 'SUMMARY' && gstScheme === 'Regular' && (
          <>
            <SubSection title="GST liability" first>
              <LiabilityTable />
            </SubSection>
            <SubSection title="Sales by GST rate" meta={`${rateRows.length} ${rateRows.length === 1 ? 'rate' : 'rates'}`}>
              <TaxTable columns={rateColumns} rows={rateRows} rowKey={(r) => `rate_${r.rate}`} emptyText="No taxable sales in this period." showFooter />
            </SubSection>
          </>
        )}

        {activeTab === 'SUMMARY' && gstScheme === 'Composition' && (
          <div className="space-y-3 p-4 text-sm">
            {[
              { label: `Composition tax on turnover (${compRate}% of ${inrRound(metrics.salesTurnover)})`, value: compositionTax },
              { label: 'Reverse charge (RCM) payable', value: metrics.rcmLiability },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <span className="text-slate-700">{r.label}</span>
                <span className="font-semibold tabular-nums text-slate-900">{inr(r.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 rounded-sm bg-green-50 px-3 py-2.5">
              <span className="font-semibold text-green-800">Net payable</span>
              <span className="text-lg font-bold tabular-nums text-green-800">{inr(Math.max(0, metrics.netPayable))}</span>
            </div>
            <p className="text-xs text-slate-500">Composition dealers can't claim input tax credit, so purchases don't reduce this amount.</p>
          </div>
        )}

        {activeTab === 'SUMMARY' && gstScheme === 'None' && (
          <div className="flex items-start gap-3 p-4 text-sm text-slate-600">
            <Scale size={18} className="mt-0.5 shrink-0 text-slate-400" />
            <p>
              GST is turned off in Sales settings, so no tax is calculated. Turnover figures above are for your records;
              switch the GST scheme on to see GSTR-1, GSTR-3B and HSN reports.
            </p>
          </div>
        )}

        {activeTab === 'GSTR-1' && (
          <>
            <SubSection title="B2B invoices (registered buyers)" meta={`${metrics.b2bInvoices.length} invoices`} first>
              <TaxTable columns={b2bColumns} rows={metrics.b2bRows} rowKey={(r: any) => r._key} emptyText="No sales to GST-registered buyers in this period." showFooter />
            </SubSection>
            <SubSection title="B2C small (unregistered buyers)" meta="Grouped by place of supply and rate">
              <TaxTable columns={b2csColumns} rows={metrics.b2csRows} rowKey={(r: any) => `b2cs_${r['Place Of Supply']}_${r.Rate}`} emptyText="No B2C sales in this period." showFooter />
            </SubSection>
            <SubSection title="Documents issued">
              <TaxTable columns={docsColumns} rows={metrics.docsRows} rowKey={(_r, i) => `docs_${i}`} emptyText="No invoices issued in this period." />
            </SubSection>
          </>
        )}

        {(activeTab === 'GSTR-2' || activeTab === 'GSTR-4A') && (
          <TaxTable
            columns={purchaseColumns}
            rows={activeTab === 'GSTR-4A' ? gstr4aRows : purchaseRows}
            rowKey={(r) => r.id}
            emptyText={activeTab === 'GSTR-4A' ? 'No purchases from GST-registered suppliers in this period.' : 'No purchases in this period.'}
            showFooter
          />
        )}

        {activeTab === 'GSTR-3B' && <LiabilityTable full />}

        {activeTab === 'CMP-08' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sunken text-[11px] uppercase tracking-wide text-blue-700/80">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Description</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Value</th>
                  <th className="px-4 py-2.5 text-right font-semibold">IGST</th>
                  <th className="px-4 py-2.5 text-right font-semibold">CGST</th>
                  <th className="px-4 py-2.5 text-right font-semibold">SGST</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">1. Outward supplies</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(metrics.salesTurnover)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(0)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(compositionTax / 2)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(compositionTax / 2)}</td>
                </tr>
                <tr className="border-t border-line">
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">2. Inward supplies (RCM)</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">—</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(metrics.rcmIgst)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(metrics.rcmCgst)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(metrics.rcmSgst)}</td>
                </tr>
                <tr className="border-t border-slate-200 bg-green-50 font-semibold text-green-800">
                  <td className="whitespace-nowrap px-4 py-2.5">3. Tax payable (1 + 2)</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(metrics.salesTurnover)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(metrics.rcmIgst)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(compositionTax / 2 + metrics.rcmCgst)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{inr(compositionTax / 2 + metrics.rcmSgst)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {(activeTab === 'HSN' || activeTab === 'SAC') && (
          <>
            <TaxTable
              columns={hsnColumns}
              rows={hsnRows}
              rowKey={(r: any) => `${r.HSN}_${r.Rate}`}
              emptyText={isSacTab ? 'No services (SAC 99xx) sold in this period.' : 'No HSN-coded goods sold in this period.'}
              showFooter
            />
            {metrics.hsnMissingRows.length > 0 && (
              <details className="border-t border-line">
                <summary className="flex cursor-pointer list-none items-start gap-2 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    <b>{metrics.hsnMissingRows.length} sold {metrics.hsnMissingRows.length === 1 ? 'item has' : 'items have'} no HSN/SAC code</b>{' '}
                    ({inr(sumOf(metrics.hsnMissingRows, (r: any) => r['Taxable Value']))} taxable) and {metrics.hsnMissingRows.length === 1 ? 'is' : 'are'} left out of Table 12.
                    Add the HSN code on the item, then reload. <span className="underline">Show items</span>
                  </span>
                </summary>
                <TaxTable columns={hsnMissingColumns} rows={metrics.hsnMissingRows} rowKey={(_r, i) => `miss_${i}`} emptyText="" />
              </details>
            )}
          </>
        )}

        {activeTab === 'TRANSACTIONS' && (
          <TaxTable columns={txnColumns} rows={transactionRows} rowKey={(r: any) => `${r.docType}_${r.id}`} emptyText="No sales or purchases in this period." />
        )}
      </section>
    </div>
  );
};

export default TaxReport;
