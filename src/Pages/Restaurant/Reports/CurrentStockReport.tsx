import React, { useMemo, useState } from 'react';
import {
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
import {
  KITCHEN_ID,
  KITCHEN_NAME,
  type RawMaterial,
} from '../../../lib/restaurant/types';
import {
  costPerPurchaseUnit,
  formatStock,
  round3,
} from '../../../lib/restaurant/units';
import { useGodowns } from '../../hooks/useStockTransfer';
import { currentStockAtLocation, formatQty3 } from './stockSummary.utils';

type StockLevelFilter = 'all' | 'low' | 'out' | 'in';
type StatusFilter = 'uptodate' | 'active' | 'inactive' | 'all';

const formatRupee3 = (val: number): string =>
  `₹ ${(Number(val) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  })}`;

const escapeCsv = (val: string | number): string => {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const CurrentStockReport: React.FC = () => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
  const { rawMaterials, categories, loading } = useRestaurantData();
  const { godowns } = useGodowns(companyId);

  // Filter form inputs
  const [nameQuery, setNameQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockLevel, setStockLevel] = useState<StockLevelFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('uptodate');
  const [locationId, setLocationId] = useState<string>('all');

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

  const rows = useMemo(() => {
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
        if (statusFilter === 'uptodate' || statusFilter === 'active') {
          if (!rm.active) return false;
        } else if (statusFilter === 'inactive') {
          if (rm.active) return false;
        }

        const stockBase = currentStockAtLocation(rm, locationId);
        const restock = Number(rm.restockLevel) || 0;

        if (stockLevel === 'low' && !(stockBase <= restock)) return false;
        if (stockLevel === 'out' && !(stockBase <= 0)) return false;
        if (stockLevel === 'in' && !(stockBase > 0)) return false;

        return true;
      })
      .map((rm: RawMaterial) => {
        const stockBase = currentStockAtLocation(rm, locationId);
        const avgCost = Number(rm.avgCost) || 0;
        const totalValue = avgCost > 0 ? round3(stockBase * avgCost) : 0;
        const { cost: purchaseUnitCost, unit: purchaseUnitLabel } = costPerPurchaseUnit(rm);
        return {
          rm,
          stockBase,
          stockText: formatStock(rm, stockBase),
          totalValue,
          avgCost,
          purchaseUnitCost,
          purchaseUnitLabel,
        };
      })
      .sort((a, b) => a.rm.name.localeCompare(b.rm.name));
  }, [rawMaterials, nameQuery, categoryFilter, statusFilter, locationId, stockLevel]);

  const grandTotal = useMemo(
    () => round3(rows.reduce((sum, r) => sum + r.totalValue, 0)),
    [rows],
  );

  const handleClear = () => {
    setNameQuery('');
    setCategoryFilter('all');
    setStockLevel('all');
    setStatusFilter('uptodate');
    setLocationId('all');
  };

  const handleExportCsv = () => {
    const locationLabel =
      locationId === 'all'
        ? 'All Locations'
        : locationId === KITCHEN_ID
          ? KITCHEN_NAME
          : godowns.find((g) => g.id === locationId)?.name || locationId;

    const headers = [
      'Raw Material',
      'Category',
      'Location',
      'Current Stock',
      'Base Qty',
      'Base Unit',
      'Avg Price',
      'Total Value (INR)',
    ];

    const csvLines = [
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => {
        const avgSubtitle =
          r.avgCost > 0
            ? `Avg. ₹ ${r.purchaseUnitCost} / ${r.purchaseUnitLabel}`
            : 'Avg. price not available';
        return [
          r.rm.name,
          r.rm.category || 'General',
          locationLabel,
          r.stockText,
          formatQty3(r.stockBase),
          r.rm.baseUnit,
          avgSubtitle,
          formatQty3(r.totalValue),
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
    a.download = `current-stock-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#eef2ff] font-poppins text-[#0f172b] pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-20 border-b border-[#dfe6fb] bg-white/95 backdrop-blur px-3 sm:px-6 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-lg sm:text-xl font-semibold text-[#0f172b]">
                Current Stock Report
              </h1>
              <p className="text-xs text-[#5b6b86]">
                Live raw material stock &amp; valuation across kitchen and godowns
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={rows.length === 0}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-xs font-medium text-[#0f172b] shadow-2xs transition hover:bg-[#eef2ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#155dfc]" />
              <span>Export CSV / Excel</span>
              <Download className="h-3.5 w-3.5 text-[#5b6b86]" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-3 sm:px-6 pt-4 space-y-4">
        {/* Filters Card */}
        <form
          onSubmit={(e) => e.preventDefault()}
          className="rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-2xs"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#5b6b86]">
            <Filter className="h-3.5 w-3.5 text-[#155dfc]" />
            <span>Filter Raw Materials</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Raw Material Search */}
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
                  placeholder="Search raw material..."
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

            {/* Stock Level */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6b86]">
                Stock Level
              </label>
              <select
                value={stockLevel}
                onChange={(e) => setStockLevel(e.target.value as StockLevelFilter)}
                className="w-full rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-2 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
              >
                <option value="all">All</option>
                <option value="low">Low (&lt;= Restock Level)</option>
                <option value="out">Out (&lt;= 0)</option>
                <option value="in">In stock (&gt; 0)</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6b86]">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="w-full rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-2 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
              >
                <option value="uptodate">Up to date</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </select>
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
                  <option value="all">All locations</option>
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
            <span className="text-xs text-[#5b6b86]">
              Showing <strong className="text-[#0f172b]">{rows.length}</strong> raw material
              {rows.length === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-1.5 text-xs font-medium text-[#5b6b86] transition hover:bg-[#eef2ff] hover:text-[#0f172b]"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Show All</span>
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

        {/* Table Card */}
        <div className="overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-2xs">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-[#5b6b86]">
              Loading current stock...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Package className="h-10 w-10 text-[#5b6b86]/50 mb-2" />
              <p className="text-sm font-medium text-[#0f172b]">No raw materials found</p>
              <p className="mt-1 text-xs text-[#5b6b86]">
                Try clearing filters or adding raw materials in Restaurant Inventory.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[#dfe6fb] bg-[#eef2ff]/70 text-[#0f172b]">
                    <th className="py-3 px-4 font-semibold">Raw Material</th>
                    <th className="py-3 px-4 font-semibold">Current Stock</th>
                    <th className="py-3 px-4 text-right font-semibold">
                      Total ({formatRupee3(grandTotal)})
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe6fb]">
                  {rows.map((r) => {
                    const isLow =
                      r.rm.restockLevel !== undefined &&
                      r.rm.restockLevel > 0 &&
                      r.stockBase <= r.rm.restockLevel &&
                      r.stockBase > 0;
                    const isOut = r.stockBase <= 0;

                    return (
                      <tr
                        key={r.rm.id}
                        className="transition-colors hover:bg-[#eef2ff]/40"
                      >
                        <td className="py-3 px-4 align-top">
                          <div className="font-medium text-[#0f172b]">{r.rm.name}</div>
                          {r.rm.category && (
                            <div className="mt-0.5 text-[11px] text-[#5b6b86]">
                              {r.rm.category}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 align-top">
                          <span
                            className={`inline-flex items-center gap-1.5 font-medium ${
                              isOut
                                ? 'text-red-600'
                                : isLow
                                  ? 'text-amber-600'
                                  : 'text-[#0f172b]'
                            }`}
                          >
                            {r.stockText}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right align-top">
                          <div className="font-semibold text-[#0f172b]">
                            {r.avgCost > 0 ? formatRupee3(r.totalValue) : '₹ 0.000'}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#5b6b86]">
                            {r.avgCost > 0
                              ? `Avg. ₹ ${r.purchaseUnitCost} / ${r.purchaseUnitLabel}`
                              : 'Avg. price not available'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CurrentStockReport;
