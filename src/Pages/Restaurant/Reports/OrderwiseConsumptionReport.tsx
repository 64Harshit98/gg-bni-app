import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import {
  Calendar,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  IndianRupee,
  Layers,
  Percent,
  Receipt,
  RotateCcw,
  Search,
  Utensils,
} from 'lucide-react';
import BackButton from '../../../Components/BackButton';
import { useAuth } from '../../../context/auth-context';
import { useRestaurantData } from '../../../context/RestaurantDataContext';
import { db } from '../../../lib/Firebase';
import type { BaseUnit, ConsumptionLine } from '../../../lib/restaurant/types';
import { formatStock, round3 } from '../../../lib/restaurant/units';
import { formatQty3, r3 } from './stockSummary.utils';

type ActiveTab = 'orderwise' | 'materialwise';

interface SaleItemDoc {
  id?: string;
  productId?: string;
  name?: string;
  itemName?: string;
  quantity?: number;
  qty?: number;
  mrp?: number;
  price?: number;
  rawConsumption?: ConsumptionLine[];
}

interface SaleDoc {
  id: string;
  invoiceNumber?: string;
  billNo?: string;
  partyName?: string;
  totalAmount?: number;
  grandTotal?: number;
  createdAt?: unknown;
  items?: SaleItemDoc[];
}

interface BillConsumptionRow {
  saleId: string;
  invoiceNumber: string;
  createdAtMs: number;
  customerName: string;
  itemsSummary: string;
  billAmount: number;
  rawMaterialCost: number;
  foodCostPct: number;
  consumptions: {
    rawMaterialId: string;
    name: string;
    qty: number;
    unit: BaseUnit;
    unitCost: number;
    totalCost: number;
  }[];
}

interface MaterialAggRow {
  rawMaterialId: string;
  name: string;
  category: string;
  unit: BaseUnit;
  totalQty: number;
  formattedQty: string;
  avgUnitCost: number;
  totalCost: number;
  billCount: number;
}

const toInputDate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toMillis = (val: unknown): number => {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  if (
    typeof val === 'object' &&
    val !== null &&
    'toMillis' in val &&
    typeof (val as { toMillis: () => number }).toMillis === 'function'
  ) {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (
    typeof val === 'object' &&
    val !== null &&
    'seconds' in val &&
    typeof (val as { seconds: number }).seconds === 'number'
  ) {
    return (val as { seconds: number }).seconds * 1000;
  }
  const parsed = Number(val);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDateTime = (ms: number): string => {
  if (!ms) return '—';
  const d = new Date(ms);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCurrency2 = (val: number): string =>
  `₹${(Number(val) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatCurrency3 = (val: number): string =>
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

const OrderwiseConsumptionReport: React.FC = () => {
  const { currentUser } = useAuth();
  const companyId = currentUser?.companyId;
  const { rawMaterials, rawMaterialMap } = useRestaurantData();

  const todayStr = useMemo(() => toInputDate(new Date()), []);
  const [fromDate, setFromDate] = useState(todayStr);
  const [toDate, setToDate] = useState(todayStr);
  const [rawMaterialFilter, setRawMaterialFilter] = useState('all');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('orderwise');
  const [expandedBills, setExpandedBills] = useState<Record<string, boolean>>({});

  const [sales, setSales] = useState<SaleDoc[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId || !fromDate || !toDate) return;
    let cancelled = false;
    setLoading(true);

    const startMs = new Date(`${fromDate}T00:00:00`).getTime();
    const endMs = new Date(`${toDate}T23:59:59.999`).getTime();
    const startTs = Timestamp.fromMillis(startMs);
    const endTs = Timestamp.fromMillis(endMs);

    const salesRef = collection(db, 'companies', companyId, 'sales');
    const salesQ = query(
      salesRef,
      where('createdAt', '>=', startTs),
      where('createdAt', '<=', endTs),
    );

    getDocs(salesQ)
      .then((snap) => {
        if (cancelled) return;
        const list: SaleDoc[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SaleDoc, 'id'>),
        }));
        setSales(list);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load sales for consumption report:', err);
        if (!cancelled) {
          setSales([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, fromDate, toDate]);

  // Build Order-wise rows
  const orderRows = useMemo<BillConsumptionRow[]>(() => {
    const invQ = invoiceSearch.trim().toLowerCase();

    return sales
      .map((sale): BillConsumptionRow => {
        const invoiceNumber =
          sale.invoiceNumber || sale.billNo || sale.id.slice(0, 8).toUpperCase();
        const createdAtMs = toMillis(sale.createdAt);
        const customerName = sale.partyName?.trim() || 'Walk-in';
        const billAmount = r3(Number(sale.totalAmount ?? sale.grandTotal) || 0);
        const items = Array.isArray(sale.items) ? sale.items : [];

        const itemsSummary = items
          .map((it) => {
            const name = it.name || it.itemName || 'Item';
            const q = Number(it.quantity ?? it.qty) || 1;
            return `${q}x ${name}`;
          })
          .join(', ');

        // Aggregate rawConsumption per rawMaterialId within this bill
        const byRm = new Map<
          string,
          {
            rawMaterialId: string;
            name: string;
            qty: number;
            unit: BaseUnit;
            totalCost: number;
          }
        >();

        items.forEach((it) => {
          const lines = Array.isArray(it.rawConsumption) ? it.rawConsumption : [];
          lines.forEach((line) => {
            if (!line || !line.rawMaterialId) return;
            if (
              rawMaterialFilter !== 'all' &&
              line.rawMaterialId !== rawMaterialFilter
            ) {
              return;
            }
            const qty = Number(line.qty) || 0;
            const unitCost = Number(line.unitCost) || 0;
            const lineCost = qty * unitCost;
            const existing = byRm.get(line.rawMaterialId);
            if (existing) {
              existing.qty = r3(existing.qty + qty);
              existing.totalCost = r3(existing.totalCost + lineCost);
            } else {
              byRm.set(line.rawMaterialId, {
                rawMaterialId: line.rawMaterialId,
                name:
                  line.name ||
                  rawMaterialMap.get(line.rawMaterialId)?.name ||
                  line.rawMaterialId,
                qty: r3(qty),
                unit: line.unit || 'PC',
                totalCost: r3(lineCost),
              });
            }
          });
        });

        const consumptions = Array.from(byRm.values()).map((c) => ({
          ...c,
          unitCost: c.qty > 0 ? r3(c.totalCost / c.qty) : 0,
        }));

        const rawMaterialCost = r3(
          consumptions.reduce((s, c) => s + c.totalCost, 0),
        );
        const foodCostPct =
          billAmount > 0 ? round3((rawMaterialCost / billAmount) * 100) : 0;

        return {
          saleId: sale.id,
          invoiceNumber,
          createdAtMs,
          customerName,
          itemsSummary: itemsSummary || '—',
          billAmount,
          rawMaterialCost,
          foodCostPct,
          consumptions,
        };
      })
      .filter((row) => {
        if (
          invQ &&
          !row.invoiceNumber.toLowerCase().includes(invQ) &&
          !row.itemsSummary.toLowerCase().includes(invQ) &&
          !row.customerName.toLowerCase().includes(invQ)
        ) {
          return false;
        }
        if (rawMaterialFilter !== 'all' && row.consumptions.length === 0) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [sales, invoiceSearch, rawMaterialFilter, rawMaterialMap]);

  // Build Raw Material-wise aggregated rows across filtered bills
  const materialRows = useMemo<MaterialAggRow[]>(() => {
    const map = new Map<
      string,
      {
        rawMaterialId: string;
        name: string;
        unit: BaseUnit;
        totalQty: number;
        totalCost: number;
        bills: Set<string>;
      }
    >();

    orderRows.forEach((bill) => {
      bill.consumptions.forEach((c) => {
        const cur = map.get(c.rawMaterialId);
        if (cur) {
          cur.totalQty = r3(cur.totalQty + c.qty);
          cur.totalCost = r3(cur.totalCost + c.totalCost);
          cur.bills.add(bill.saleId);
        } else {
          map.set(c.rawMaterialId, {
            rawMaterialId: c.rawMaterialId,
            name: c.name,
            unit: c.unit,
            totalQty: r3(c.qty),
            totalCost: r3(c.totalCost),
            bills: new Set([bill.saleId]),
          });
        }
      });
    });

    return Array.from(map.values())
      .map((entry): MaterialAggRow => {
        const rm = rawMaterialMap.get(entry.rawMaterialId);
        const formattedQty = rm
          ? formatStock(rm, entry.totalQty)
          : `${formatQty3(entry.totalQty)} ${entry.unit}`;
        return {
          rawMaterialId: entry.rawMaterialId,
          name: rm?.name || entry.name,
          category: rm?.category || 'General',
          unit: entry.unit,
          totalQty: entry.totalQty,
          formattedQty,
          avgUnitCost: entry.totalQty > 0 ? r3(entry.totalCost / entry.totalQty) : 0,
          totalCost: entry.totalCost,
          billCount: entry.bills.size,
        };
      })
      .sort((a, b) => b.totalCost - a.totalCost);
  }, [orderRows, rawMaterialMap]);

  // Summary KPIs
  const kpis = useMemo(() => {
    const billCount = orderRows.length;
    const totalSales = r3(orderRows.reduce((s, r) => s + r.billAmount, 0));
    const totalRmCost = r3(orderRows.reduce((s, r) => s + r.rawMaterialCost, 0));
    const foodCostPct =
      totalSales > 0 ? round3((totalRmCost / totalSales) * 100) : 0;
    return { billCount, totalSales, totalRmCost, foodCostPct };
  }, [orderRows]);

  const toggleExpand = (saleId: string) => {
    setExpandedBills((prev) => ({ ...prev, [saleId]: !prev[saleId] }));
  };

  const handleClear = () => {
    setFromDate(todayStr);
    setToDate(todayStr);
    setRawMaterialFilter('all');
    setInvoiceSearch('');
    setExpandedBills({});
  };

  const handleExportCsv = () => {
    if (activeTab === 'orderwise') {
      const headers = [
        'Invoice No',
        'Date & Time',
        'Customer',
        'Items Summary',
        'Bill Amount (INR)',
        'Raw Material Cost (INR)',
        'Food Cost %',
        'Raw Materials Consumed',
      ];
      const lines = [
        headers.map(escapeCsv).join(','),
        ...orderRows.map((r) => {
          const rmDetails = r.consumptions
            .map((c) => `${c.name}: ${formatQty3(c.qty)} ${c.unit} (₹${formatQty3(c.totalCost)})`)
            .join(' | ');
          return [
            r.invoiceNumber,
            formatDateTime(r.createdAtMs),
            r.customerName,
            r.itemsSummary,
            r.billAmount.toFixed(2),
            formatQty3(r.rawMaterialCost),
            `${r.foodCostPct.toFixed(2)}%`,
            rmDetails,
          ]
            .map(escapeCsv)
            .join(',');
        }),
      ];
      const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orderwise-consumption-${fromDate}-to-${toDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = [
        'Raw Material',
        'Category',
        'Bills Count',
        'Consumed Stock',
        'Base Quantity',
        'Base Unit',
        'Avg Unit Cost (INR)',
        'Total Cost (INR)',
      ];
      const lines = [
        headers.map(escapeCsv).join(','),
        ...materialRows.map((m) =>
          [
            m.name,
            m.category,
            m.billCount,
            m.formattedQty,
            formatQty3(m.totalQty),
            m.unit,
            formatQty3(m.avgUnitCost),
            formatQty3(m.totalCost),
          ]
            .map(escapeCsv)
            .join(','),
        ),
      ];
      const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `raw-material-consumption-${fromDate}-to-${toDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="min-h-screen bg-[#eef2ff] font-poppins text-[#0f172b] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-[#dfe6fb] bg-white/95 backdrop-blur px-3 sm:px-6 py-3">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BackButton />
            <div>
              <h1 className="text-lg sm:text-xl font-semibold text-[#0f172b]">
                Order-wise Consumption Report
              </h1>
              <p className="text-xs text-[#5b6b86]">
                Recipe raw-material consumption, cost &amp; food cost % per invoice
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={
                activeTab === 'orderwise'
                  ? orderRows.length === 0
                  : materialRows.length === 0
              }
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-sm border border-[#dfe6fb] bg-white px-3 py-2 text-xs font-medium text-[#0f172b] shadow-2xs transition hover:bg-[#eef2ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#155dfc]" />
              <span>Export CSV</span>
              <Download className="h-3.5 w-3.5 text-[#5b6b86]" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-3 sm:px-6 pt-4 space-y-4">
        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#5b6b86]">Bills</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#eef2ff] text-[#155dfc]">
                <Receipt className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold text-[#0f172b]">
              {kpis.billCount.toLocaleString('en-IN')}
            </div>
            <p className="mt-0.5 text-[11px] text-[#5b6b86]">Invoices in selected range</p>
          </div>

          <div className="rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#5b6b86]">Total Sales</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-emerald-50 text-emerald-600">
                <IndianRupee className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold text-[#0f172b]">
              {formatCurrency2(kpis.totalSales)}
            </div>
            <p className="mt-0.5 text-[11px] text-[#5b6b86]">Gross invoice amount</p>
          </div>

          <div className="rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#5b6b86]">
                Total Raw Material Cost
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-amber-50 text-amber-600">
                <Utensils className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold text-[#0f172b]">
              {formatCurrency3(kpis.totalRmCost)}
            </div>
            <p className="mt-0.5 text-[11px] text-[#5b6b86]">Consumed ingredients cost</p>
          </div>

          <div className="rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#5b6b86]">Food Cost %</span>
              <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-blue-50 text-[#155dfc]">
                <Percent className="h-4 w-4" />
              </span>
            </div>
            <div className="mt-2 text-xl sm:text-2xl font-bold text-[#0f172b]">
              {kpis.foodCostPct.toFixed(2)}%
            </div>
            <p className="mt-0.5 text-[11px] text-[#5b6b86]">Raw material cost / sales</p>
          </div>
        </div>

        {/* Filters */}
        <form
          onSubmit={(e) => e.preventDefault()}
          className="rounded-sm border border-[#dfe6fb] bg-white p-4 shadow-2xs"
        >
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#5b6b86]">
            <Filter className="h-3.5 w-3.5 text-[#155dfc]" />
            <span>Filters</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

            {/* Raw Material Filter */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6b86]">
                Raw Material
              </label>
              <select
                value={rawMaterialFilter}
                onChange={(e) => setRawMaterialFilter(e.target.value)}
                className="w-full rounded-sm border border-[#dfe6fb] bg-white px-2.5 py-2 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
              >
                <option value="all">All Raw Materials</option>
                {rawMaterials
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      {rm.name} ({rm.baseUnit})
                    </option>
                  ))}
              </select>
            </div>

            {/* Invoice Search */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6b86]">
                Invoice / Item Search
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5b6b86]" />
                <input
                  type="text"
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder="Search invoice no, item, customer..."
                  className="w-full rounded-sm border border-[#dfe6fb] bg-white py-2 pl-8 pr-3 text-xs text-[#0f172b] outline-none transition focus:border-[#155dfc]"
                />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#dfe6fb] pt-3">
            {/* Tabs */}
            <div className="inline-flex rounded-sm border border-[#dfe6fb] bg-[#eef2ff] p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('orderwise')}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === 'orderwise'
                    ? 'bg-[#155dfc] text-white shadow-2xs'
                    : 'text-[#5b6b86] hover:text-[#0f172b]'
                }`}
              >
                <Receipt className="h-3.5 w-3.5" />
                <span>Order-wise ({orderRows.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('materialwise')}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === 'materialwise'
                    ? 'bg-[#155dfc] text-white shadow-2xs'
                    : 'text-[#5b6b86] hover:text-[#0f172b]'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Raw Material-wise ({materialRows.length})</span>
              </button>
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
            </div>
          </div>
        </form>

        {/* Tab Content */}
        <div className="overflow-hidden rounded-sm border border-[#dfe6fb] bg-white shadow-2xs">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-sm text-[#5b6b86]">
              Loading sales &amp; consumption data...
            </div>
          ) : activeTab === 'orderwise' ? (
            orderRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                <Receipt className="h-10 w-10 text-[#5b6b86]/50 mb-2" />
                <p className="text-sm font-medium text-[#0f172b]">No orders found</p>
                <p className="mt-1 text-xs text-[#5b6b86]">
                  No sales bills match the selected date range and filters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-[#dfe6fb] bg-[#f8faff] text-[#0f172b]">
                      <th className="w-10 py-3 px-3" />
                      <th className="py-3 px-3 font-semibold whitespace-nowrap">
                        Invoice No
                      </th>
                      <th className="py-3 px-3 font-semibold whitespace-nowrap">
                        Date / Time
                      </th>
                      <th className="py-3 px-3 font-semibold">Items Summary</th>
                      <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                        Bill Amount
                      </th>
                      <th className="py-3 px-3 text-right font-semibold whitespace-nowrap">
                        Raw Material Cost
                      </th>
                      <th className="py-3 px-4 text-right font-semibold whitespace-nowrap">
                        Food Cost %
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#dfe6fb]">
                    {orderRows.map((bill) => {
                      const isExpanded = !!expandedBills[bill.saleId];
                      return (
                        <React.Fragment key={bill.saleId}>
                          <tr
                            onClick={() => toggleExpand(bill.saleId)}
                            className="cursor-pointer transition-colors hover:bg-[#eef2ff]/40"
                          >
                            <td className="py-3 px-3 text-center text-[#5b6b86]">
                              {isExpanded ? (
                                <ChevronDown className="inline h-4 w-4 text-[#155dfc]" />
                              ) : (
                                <ChevronRight className="inline h-4 w-4" />
                              )}
                            </td>
                            <td className="py-3 px-3 font-semibold text-[#155dfc] whitespace-nowrap">
                              {bill.invoiceNumber}
                            </td>
                            <td className="py-3 px-3 text-[#5b6b86] whitespace-nowrap">
                              {formatDateTime(bill.createdAtMs)}
                            </td>
                            <td className="py-3 px-3 max-w-md truncate text-[#0f172b]">
                              {bill.itemsSummary}
                            </td>
                            <td className="py-3 px-3 text-right font-medium tabular-nums">
                              {formatCurrency2(bill.billAmount)}
                            </td>
                            <td className="py-3 px-3 text-right font-semibold tabular-nums text-[#0f172b]">
                              {formatCurrency3(bill.rawMaterialCost)}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums">
                              <span
                                className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold ${
                                  bill.foodCostPct > 40
                                    ? 'bg-red-50 text-red-600'
                                    : bill.foodCostPct > 0
                                      ? 'bg-blue-50 text-[#155dfc]'
                                      : 'bg-slate-100 text-[#5b6b86]'
                                }`}
                              >
                                {bill.foodCostPct.toFixed(2)}%
                              </span>
                            </td>
                          </tr>

                          {isExpanded && (
                            <tr className="bg-[#f8faff]">
                              <td colSpan={7} className="p-3 sm:px-8">
                                {bill.consumptions.length === 0 ? (
                                  <p className="text-xs text-[#5b6b86] italic">
                                    No recipe raw-material consumption recorded on this bill.
                                  </p>
                                ) : (
                                  <div className="overflow-x-auto rounded-sm border border-[#dfe6fb] bg-white">
                                    <table className="w-full text-left text-xs">
                                      <thead>
                                        <tr className="border-b border-[#dfe6fb] bg-[#eef2ff]/60 text-[#5b6b86]">
                                          <th className="py-2 px-3 font-semibold">
                                            Raw Material
                                          </th>
                                          <th className="py-2 px-3 text-right font-semibold">
                                            Qty Consumed
                                          </th>
                                          <th className="py-2 px-3 text-right font-semibold">
                                            Unit Cost
                                          </th>
                                          <th className="py-2 px-3 text-right font-semibold">
                                            Total Cost
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-[#dfe6fb]">
                                        {bill.consumptions.map((c) => {
                                          const rm = rawMaterialMap.get(c.rawMaterialId);
                                          const prettyQty = rm
                                            ? formatStock(rm, c.qty)
                                            : `${formatQty3(c.qty)} ${c.unit}`;
                                          return (
                                            <tr key={c.rawMaterialId}>
                                              <td className="py-2 px-3 font-medium text-[#0f172b]">
                                                {c.name}
                                              </td>
                                              <td className="py-2 px-3 text-right tabular-nums">
                                                {prettyQty}{' '}
                                                <span className="text-[11px] text-[#5b6b86]">
                                                  ({formatQty3(c.qty)} {c.unit})
                                                </span>
                                              </td>
                                              <td className="py-2 px-3 text-right tabular-nums text-[#5b6b86]">
                                                ₹ {formatQty3(c.unitCost)} / {c.unit}
                                              </td>
                                              <td className="py-2 px-3 text-right font-semibold tabular-nums text-[#0f172b]">
                                                {formatCurrency3(c.totalCost)}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : materialRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Layers className="h-10 w-10 text-[#5b6b86]/50 mb-2" />
              <p className="text-sm font-medium text-[#0f172b]">
                No raw material consumption recorded
              </p>
              <p className="mt-1 text-xs text-[#5b6b86]">
                Sales bills in this range did not consume any recipe raw materials.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-[#dfe6fb] bg-[#f8faff] text-[#0f172b]">
                    <th className="py-3 px-4 font-semibold">Raw Material</th>
                    <th className="py-3 px-3 font-semibold">Category</th>
                    <th className="py-3 px-3 text-right font-semibold">Bills</th>
                    <th className="py-3 px-3 text-right font-semibold">
                      Consumed Quantity
                    </th>
                    <th className="py-3 px-3 text-right font-semibold">
                      Avg. Unit Cost
                    </th>
                    <th className="py-3 px-4 text-right font-semibold">
                      Total Cost
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dfe6fb]">
                  {materialRows.map((m) => (
                    <tr
                      key={m.rawMaterialId}
                      className="transition-colors hover:bg-[#eef2ff]/40"
                    >
                      <td className="py-3 px-4 font-medium text-[#0f172b]">{m.name}</td>
                      <td className="py-3 px-3 text-[#5b6b86]">{m.category}</td>
                      <td className="py-3 px-3 text-right tabular-nums">{m.billCount}</td>
                      <td className="py-3 px-3 text-right font-medium tabular-nums text-[#0f172b]">
                        <div>{m.formattedQty}</div>
                        <div className="text-[11px] text-[#5b6b86]">
                          {formatQty3(m.totalQty)} {m.unit}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums text-[#5b6b86]">
                        ₹ {formatQty3(m.avgUnitCost)} / {m.unit}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold tabular-nums text-[#0f172b]">
                        {formatCurrency3(m.totalCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderwiseConsumptionReport;
