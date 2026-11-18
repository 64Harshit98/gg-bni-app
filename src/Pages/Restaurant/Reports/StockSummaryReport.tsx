import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  MapPin,
  Package,
  RotateCcw,
  Search,
} from 'lucide-react';
import BackButton from '../../../Components/BackButton';
import { useAuth } from '../../../context/auth-context';
import { useRestaurantData } from '../../../context/RestaurantDataContext';
import { fetchLedgerSince } from '../../../lib/restaurant/stockApi';
import {
  KITCHEN_ID,
  KITCHEN_NAME,
  type StockLedgerEntry,
} from '../../../lib/restaurant/types';
import { useGodowns } from '../../hooks/useStockTransfer';
import {
  computeStockSummary,
  formatQty3,
  r3,
  type StockSummaryRow,
  type UnitMode,
} from './stockSummary.utils';

const PAGE_SIZE = 100;

const toInputDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfDayMs = (yyyyMmDd: string): number =>
  new Date(`${yyyyMmDd}T00:00:00`).getTime();

const endOfDayMs = (yyyyMmDd: string): number =>
  new Date(`${yyyyMmDd}T23:59:59.999`).getTime();

const escapeCsv = (val: string | number): string => {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const StockSummaryReport: React.FC = () => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
  const { rawMaterials, categories, loading: rmLoading } = useRestaurantData();
  const { godowns } = useGodowns(companyId);

  const todayStr = useMemo(() => toInputDate(new Date()), []);

  // Filter state
  const [nameQuery, setNameQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [unitMode, setUnitMode] = useState<UnitMode>('purchase');
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [locationId, setLocationId] = useState<string>('all');
  const [page, setPage] = useState(1);

  // Ledger entries fetched from `fromMs` onward
  const [ledgerRows, setLedgerRows] = useState<StockLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // Per-row physical count ("Closing Summary") overrides keyed by `${rm.id}:${unitMode}:${locationId}`
  const [closingSummaryEdits, setClosingSummaryEdits] = useState<Record<string, string>>({});

  const fromMs = useMemo(() => startOfDayMs(fromDate || todayStr), [fromDate, todayStr]);
  const toMs = useMemo(() => endOfDayMs(toDate || todayStr), [toDate, todayStr]);

  useEffect(() => {
    if (!companyId || !fromMs || Number.isNaN(fromMs)) return;
    let cancelled = false;
    setLedgerLoading(true);
    fetchLedgerSince(companyId, fromMs)
      .then((rows) => {
        if (!cancelled) {
          setLedgerRows(rows);
          setLedgerLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch stock ledger for summary:', err);
        if (!cancelled) {
          setLedgerRows([]);
          setLedgerLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, fromMs]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    categories.forEach((c) => {
      if (c.name?.trim()) set.add(c.name.trim());
    });
    rawMaterials.forEach((rm) => {
      if (rm.category?.trim()) set.add(rm.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categories, rawMaterials]);

  const filteredRawMaterials = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return rawMaterials
      .filter((rm) => {
        if (q && !rm.name.toLowerCase().includes(q)) return false;
        if (
          categoryFilter !== 'all' &&
          (rm.category || '').trim().toLowerCase() !== categoryFilter.toLowerCase()
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rawMaterials, nameQuery, categoryFilter]);

  const summaryRows = useMemo<StockSummaryRow[]>(
    () =>
      computeStockSummary({
        rawMaterials: filteredRawMaterials,
        ledgerSinceFrom: ledgerRows,
        fromMs,
        toMs,
        locationId,
        unitMode,
      }),
    [filteredRawMaterials, ledgerRows, fromMs, toMs, locationId, unitMode],
  );

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1);
  }, [nameQuery, categoryFilter, unitMode, fromDate, toDate, locationId]);

  const totalRecords = summaryRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const endIdx = Math.min(startIdx + PAGE_SIZE, totalRecords);
  const pageRows = useMemo(
    () => summaryRows.slice(startIdx, endIdx),
    [summaryRows, startIdx, endIdx],
  );

  const editKey = (rmId: string) => `${rmId}:${unitMode}:${locationId}:${fromDate}:${toDate}`;

  const getClosingSummaryVal = (row: StockSummaryRow): number => {
    const k = editKey(row.rawMaterialId);
    if (k in closingSummaryEdits) {
      const parsed = parseFloat(closingSummaryEdits[k]);
      return Number.isFinite(parsed) ? r3(parsed) : 0;
    }
    return row.closingStock;
  };

  const getClosingSummaryDisplay = (row: StockSummaryRow): string => {
    const k = editKey(row.rawMaterialId);
    if (k in closingSummaryEdits) {
      return closingSummaryEdits[k];
    }
    return formatQty3(row.closingStock);
  };

  const handleClosingSummaryChange = (row: StockSummaryRow, value: string) => {
    const k = editKey(row.rawMaterialId);
    setClosingSummaryEdits((prev) => ({ ...prev, [k]: value }));
  };

  const handleClear = () => {
    setNameQuery('');
    setCategoryFilter('all');
    setUnitMode('purchase');
    setFromDate(todayStr);
    setToDate(todayStr);
    setLocationId('all');
    setClosingSummaryEdits({});
    setPage(1);
  };

  const handleExportCsv = () => {
    const headers = [
      'Raw Material',
      'Unit',
      'Opening (A)',
      'Purchase (B)',
      'Excess (C)',
      'Total In (A+B+C)',
      'Consumed (D)',
      'Wastage (E)',
      'Normal Loss (F)',
      'Transfer (G)',
      'Shortage (H)',
      'Production (I)',
      'Total Out',
      'Closing Stock',
      'Closing Summary',
      'Difference',
    ];

    const csvLines = [
      headers.map(escapeCsv).join(','),
      ...summaryRows.map((row) => {
        const physical = getClosingSummaryVal(row);
        const diff = r3(row.closingStock - physical);
        return [
          `${row.rawMaterialName} [${row.unitName}]`,
          row.unitName,
          formatQty3(row.opening),
          formatQty3(row.purchase),
          formatQty3(row.excess),
          formatQty3(row.totalIn),
          formatQty3(row.consumed),
          formatQty3(row.wastage),
          formatQty3(row.normalLoss),
          formatQty3(row.transfer),
          formatQty3(row.shortage),
          formatQty3(row.production),
          formatQty3(row.totalOut),
          formatQty3(row.closingStock),
          formatQty3(physical),
          formatQty3(diff),
        ]
          .map(escapeCsv)
          .join(',');
      }),
    ];

    const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock-summary-${fromDate}-to-${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = rmLoading || ledgerLoading;

  return (
    <div className="min-h-screen bg-[#eef2ff] font-poppins text-[#0f172b] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-[#dfe6fb] bg-white/95 backdrop-blur px-3 sm:px-6 py-3">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-lg sm:text-xl font-semibold text-[#0f172b]">
                Stock Summary Report
              </h1>
              <p className="text-xs text-[#5b6b86]">
                Opening, inward, consumption, wastage, transfers &amp; physical closing variance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={summaryRows.length === 0}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-xs font-medium text-[#0f172b] shadow-2xs transition hover:bg-[#eef2ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#155dfc]" />
              <span>Export CSV</span>
              <Download className="h-3.5 w-3.5 text-[#5b6b86]" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-3 sm:px-6 pt-4 space-y-4">
        {/* Filters */}
        <form
          onSubmit={(e) => e.preventDefault()}
          className="rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-2xs"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#5b6b86]">
            <Filter className="h-3.5 w-3.5 text-[#155dfc]" />
            <span>Search &amp; Filter</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {/* Raw Material */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6b86]">
                Raw Material
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b6b86]" />
                <input
                  type="text"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  placeholder="Raw material name..."
                  className="w-full rounded-sm border border-[#dfe6fb] bg-white py-2 pl-8 pr-3 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6b86]">
                Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-2 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
              >
                <option value="all">All</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Unit Type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6b86]">
                Unit Type
              </label>
              <select
                value={unitMode}
                onChange={(e) => setUnitMode(e.target.value as UnitMode)}
                className="w-full rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-2 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
              >
                <option value="purchase">Purchase Unit</option>
                <option value="base">Base Unit</option>
              </select>
            </div>

            {/* From Date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6b86]">
                From Date
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5b6b86]" />
                <input
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-sm border border-[#dfe6fb] bg-white py-2 pl-8 pr-2.5 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
                />
              </div>
            </div>

            {/* To Date */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6b86]">
                To Date
              </label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5b6b86]" />
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-sm border border-[#dfe6fb] bg-white py-2 pl-8 pr-2.5 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6b86]">
                Location
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b6b86]" />
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="w-full rounded-sm border border-[#dfe6fb] bg-white py-2 pl-8 pr-2.5 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
                >
                  <option value="all">All</option>
                  <option value={KITCHEN_ID}>{KITCHEN_NAME}</option>
                  {godowns.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#dfe6fb] pt-3">
            <div className="text-xs text-[#5b6b86]">
              {totalRecords > 0
                ? `Showing ${startIdx + 1} to ${endIdx} of ${totalRecords} records`
                : 'Showing 0 records'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-1.5 text-xs font-medium text-[#5b6b86] transition hover:bg-[#eef2ff] hover:text-[#0f172b]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
              <button
                type="submit"
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-[#155dfc] px-4 py-1.5 text-xs font-medium text-white shadow-2xs transition hover:bg-[#155dfc]/90"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Search</span>
              </button>
            </div>
          </div>
        </form>

        {/* Table */}
        <div className="overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-2xs">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-sm text-[#5b6b86]">
              Loading stock summary...
            </div>
          ) : pageRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Package className="h-10 w-10 text-[#5b6b86]/50 mb-2" />
              <p className="text-sm font-medium text-[#0f172b]">No records found</p>
              <p className="mt-1 text-xs text-[#5b6b86]">
                Adjust your search filters or date range.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1280px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#dfe6fb] bg-[#f8faff] text-[#0f172b]">
                      <th className="sticky left-0 z-10 bg-[#f8faff] py-3 px-3 font-semibold border-r border-[#dfe6fb]">
                        Raw Material
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Opening (A)
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Purchase (B)
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Excess (C)
                      </th>
                      <th className="bg-[#e6f4ff] py-3 px-2.5 text-right font-semibold whitespace-nowrap text-[#0f172b]">
                        Total
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Consumed (D)
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Wastage (E)
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Normal Loss (F)
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Transfer (G)
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Shortage (H)
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Production (I)
                      </th>
                      <th className="bg-[#e6f4ff] py-3 px-2.5 text-right font-semibold whitespace-nowrap text-[#0f172b]">
                        Total
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Closing Stock
                      </th>
                      <th className="py-3 px-2.5 text-right font-semibold whitespace-nowrap">
                        Closing Summary
                      </th>
                      <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                        Difference
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#dfe6fb]">
                    {pageRows.map((row) => {
                      const physical = getClosingSummaryVal(row);
                      const difference = r3(row.closingStock - physical);

                      return (
                        <tr
                          key={row.rawMaterialId}
                          className="group transition-colors hover:bg-[#eef2ff]/40"
                        >
                          <td className="sticky left-0 z-10 bg-white group-hover:bg-[#f5f8ff] py-2.5 px-3 font-medium text-[#0f172b] border-r border-[#dfe6fb] whitespace-nowrap">
                            <span>{row.rawMaterialName}</span>{' '}
                            <span className="text-[#5b6b86]">[{row.unitName}]</span>
                          </td>
                          <td className="py-2.5 px-2.5 text-right tabular-nums">
                            {formatQty3(row.opening)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right tabular-nums">
                            {formatQty3(row.purchase)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right tabular-nums">
                            {formatQty3(row.excess)}
                          </td>
                          <td className="bg-[#e6f4ff] py-2.5 px-2.5 text-right font-semibold tabular-nums text-[#0f172b]">
                            {formatQty3(row.totalIn)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right tabular-nums">
                            {formatQty3(row.consumed)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right tabular-nums">
                            {formatQty3(row.wastage)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right tabular-nums">
                            {formatQty3(row.normalLoss)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right tabular-nums">
                            {formatQty3(row.transfer)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right tabular-nums">
                            {formatQty3(row.shortage)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right tabular-nums">
                            {formatQty3(row.production)}
                          </td>
                          <td className="bg-[#e6f4ff] py-2.5 px-2.5 text-right font-semibold tabular-nums text-[#0f172b]">
                            {formatQty3(row.totalOut)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-semibold tabular-nums text-[#0f172b]">
                            {formatQty3(row.closingStock)}
                          </td>
                          <td className="py-2 px-2.5 text-right">
                            <input
                              type="number"
                              step="0.001"
                              aria-label={`Closing Summary for ${row.rawMaterialName}`}
                              value={getClosingSummaryDisplay(row)}
                              onChange={(e) =>
                                handleClosingSummaryChange(row, e.target.value)
                              }
                              className="w-24 rounded-sm border border-[#dfe6fb] bg-white px-2 py-1 text-right text-xs tabular-nums text-[#0f172b] outline-none transition focus:border-[#155dfc]"
                            />
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-semibold tabular-nums ${
                              difference !== 0 ? 'text-red-600' : 'text-[#0f172b]'
                            }`}
                          >
                            {formatQty3(difference)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe6fb] bg-[#f8faff] px-4 py-3 text-xs text-[#5b6b86]">
                <div>
                  Showing <strong className="text-[#0f172b]">{startIdx + 1}</strong> to{' '}
                  <strong className="text-[#0f172b]">{endIdx}</strong> of{' '}
                  <strong className="text-[#0f172b]">{totalRecords}</strong> records
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-1 text-xs font-medium text-[#0f172b] transition hover:bg-[#eef2ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Prev</span>
                  </button>
                  <span className="px-2 text-xs font-medium text-[#0f172b]">
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-1 text-xs font-medium text-[#0f172b] transition hover:bg-[#eef2ff] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span>Next</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default StockSummaryReport;
