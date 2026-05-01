import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import useUserReport from './UserReportComponents/useUserReport';

// ─── Donut Chart ───────────────────────────────────────────────────────────────
const DonutChart: React.FC<{ cash: number; upi: number; card: number; total: number }> = ({
  cash, upi, card, total,
}) => {
  if (total === 0) {
    return (
      <svg width={140} height={140} viewBox="0 0 140 140" className="flex-shrink-0">
        <circle cx={70} cy={70} r={52} fill="none" stroke="#e5e7eb" strokeWidth={20} />
        <circle cx={70} cy={70} r={40} fill="white" />
        <text x={70} y={75} textAnchor="middle" fill="#9ca3af" fontSize={12} fontFamily="sans-serif">No data</text>
      </svg>
    );
  }
  const r = 52;
  const circ = 2 * Math.PI * r;
  const cardArc = (card / total) * circ;
  const upiArc  = (upi  / total) * circ;
  const cashArc = (cash / total) * circ;
  return (
    <svg width={140} height={140} viewBox="0 0 140 140" className="flex-shrink-0">
      <circle cx={70} cy={70} r={r} fill="none" stroke="#2563eb" strokeWidth={20}
        strokeDasharray={`${cardArc} ${circ - cardArc}`} strokeDashoffset={0}
        transform="rotate(-90 70 70)" />
      <circle cx={70} cy={70} r={r} fill="none" stroke="#6b7280" strokeWidth={20}
        strokeDasharray={`${upiArc} ${circ - upiArc}`} strokeDashoffset={-cardArc}
        transform="rotate(-90 70 70)" />
      <circle cx={70} cy={70} r={r} fill="none" stroke="#d1d5db" strokeWidth={20}
        strokeDasharray={`${cashArc} ${circ - cashArc}`} strokeDashoffset={-(cardArc + upiArc)}
        transform="rotate(-90 70 70)" />
      <circle cx={70} cy={70} r={40} fill="white" />
      <text x={70} y={66} textAnchor="middle" fill="#6b7280" fontSize={9} fontFamily="sans-serif" letterSpacing={1}>NET REV</text>
      <text x={70} y={82} textAnchor="middle" fill="#111827" fontSize={15} fontWeight={700} fontFamily="sans-serif">
        Rs.{(total / 1000).toFixed(1)}k
      </text>
    </svg>
  );
};

// ─── Efficiency Ring ───────────────────────────────────────────────────────────
const EfficiencyRing: React.FC<{ score: number }> = ({ score }) => {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width={140} height={140} viewBox="0 0 140 140">
      <circle cx={70} cy={70} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={12} />
      <circle cx={70} cy={70} r={r} fill="none" stroke="white" strokeWidth={12}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 70 70)" />
      <text x={70} y={65} textAnchor="middle" fill="white" fontSize={30} fontWeight={700} fontFamily="sans-serif">{score}</text>
      <text x={70} y={82} textAnchor="middle" fill="rgba(255,255,255,0.75)" fontSize={10} fontFamily="sans-serif" letterSpacing={1}>PERCENTILE</text>
    </svg>
  );
};
// ─── Empty / No-data state ────────────────────────────────────────────────────
const EmptyState: React.FC = () => (
  <div className="bg-white rounded-sm shadow-md p-10 text-center text-gray-400 mb-2">
    <p className="text-4xl mb-2">📊</p>
    <p className="font-semibold text-gray-600">No data for this period</p>
    <p className="text-sm mt-1">Select a date range and press Apply to load the report.</p>
  </div>
);

// ─── Main Component ────────────────────────────────────────────────────────────
const UserReport: React.FC = () => {
  const navigate = useNavigate();

  const {
    currentUser,
    authLoading,
    staffList,
    selectedUserId,
    setSelectedUserId,
    staffLoading,
    datePreset,
    setDatePreset,
    customStartDate,
    setCustomStartDate,
    customEndDate,
    setCustomEndDate,
    appliedFilters,
    setAppliedFilters,
    summary,
    topItems,
    isLoading,
    error,
    formatDateForInput,
  } = useUserReport();

  const [activeTab, setActiveTab] = useState<'overview' | 'items'>('overview');

  // ── Owner guard ───────────────────────────────────────────────────────────
  if (authLoading) return <div className="p-8 text-center text-gray-500">Loading...</div>;
  if (!currentUser || currentUser.role !== 'Owner') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-sm shadow-md p-8 text-center max-w-sm">
          <p className="text-4xl mb-3">🔒</p>
          <p className="font-bold text-gray-800 text-lg">Access Restricted</p>
          <p className="text-sm text-gray-500 mt-1">
            This report is only accessible to the business Owner.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="mt-5 px-6 py-2 bg-blue-600 text-white font-semibold rounded-sm hover:bg-blue-700 transition"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (error) return <div className="p-4 text-center text-red-500">{error}</div>;

  // ── Date preset handler ───────────────────────────────────────────────────
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const start = new Date();
    const end   = new Date();
    switch (preset) {
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

  const dateRangeLabel = appliedFilters
    ? `${new Date(appliedFilters.start).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(appliedFilters.end).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : '—';

  const selectedStaff = staffList.find((s) => s.uid === selectedUserId);

  return (
    <div className="min-h-screen bg-gray-100 p-2 pb-16 md:p-6 md:pb-16">

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 border-b mb-2">
        <h1 className="flex-1 text-2xl text-center font-bold text-gray-800">
          User Report
        </h1>
        <button
          onClick={() => navigate(-1)}
          className="absolute flex items-center gap-2 rounded-full p-4 bg-gray-200 text-gray-500 hover:text-gray-900 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>
      </div>

      {/* ── STAFF SELECTOR ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-sm shadow-md px-4 py-3 mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-sm bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {selectedStaff
              ? selectedStaff.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
              : '?'}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 text-sm truncate">
              {selectedStaff?.name ?? 'Select a staff member'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {selectedStaff?.role ?? '—'}
            </p>
          </div>
        </div>

        {staffLoading ? (
          <p className="text-xs text-gray-400">Loading staff...</p>
        ) : (
          <select
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            className="text-xs border border-gray-200 px-2.5 py-1.5 rounded-sm bg-gray-50 outline-none focus:ring-2 ring-blue-400 flex-shrink-0"
          >
            {staffList.map((s) => (
              <option key={s.uid} value={s.uid}>
                {s.name} ({s.role})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── DATE FILTER — exact PurchaseReport pattern ──────────────────────── */}
      <div className="bg-white p-4 rounded-sm shadow-md mb-2">
        <div className="grid grid-cols-1 gap-3">
          <select
            value={datePreset}
            onChange={(e) => handleDatePresetChange(e.target.value)}
            className="w-full p-2 text-sm bg-gray-50 border rounded-sm outline-none focus:ring-2 ring-blue-400"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom</option>
          </select>

          <div className="grid grid-cols-2 gap-4">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => { setCustomStartDate(e.target.value); setDatePreset('custom'); }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-sm"
            />
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => { setCustomEndDate(e.target.value); setDatePreset('custom'); }}
              className="w-full p-2 text-sm bg-gray-50 border rounded-sm"
            />
          </div>
        </div>

        <div className="flex justify-center mt-2">
          <button
            onClick={handleApplyFilters}
            className="w-full md:w-fit mt-2 px-10 py-2 bg-blue-600 text-white text-lg font-semibold rounded-sm hover:bg-blue-700"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Loading spinner */}
      {isLoading && (
        <div className="bg-white rounded-sm shadow-md p-6 text-center text-gray-500 mb-2">
          Loading report data...
        </div>
      )}

      {/* No filters applied yet */}
      {!isLoading && !appliedFilters && <EmptyState />}

      {/* Data loaded */}
      {!isLoading && appliedFilters && summary && (
        <>
          {/* ── KPI CARDS ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 mb-2">
            <CustomCard className="py-10" variant={CardVariant.Summary} title="Total Sales"
              value={`Rs.${Math.round(summary.totalSales).toLocaleString('en-IN')}`} />
            <CustomCard className="py-10" variant={CardVariant.Summary} title="Total Orders"
              value={summary.totalOrders.toString()} />
            <CustomCard className="py-10" variant={CardVariant.Summary} title="Avg Order Value"
              value={`Rs.${summary.avgOrderValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}/>
            <CustomCard className="py-10" variant={CardVariant.Summary} title="Items Sold"
              value={summary.itemsSold.toString()} />
          </div>

          {/* Date range info strip */}
          <div className="bg-blue-50 border border-blue-100 rounded-sm px-4 py-2 mb-2 flex items-center justify-between">
            <p className="text-xs text-blue-500 font-semibold tracking-wide">SHOWING DATA FOR</p>
            <p className="text-xs font-bold text-blue-700">{dateRangeLabel}</p>
          </div>

          {/* ── TABS ───────────────────────────────────────────────────────── */}
          <div className="bg-white rounded-sm shadow-md mb-2 flex border-b">
            {(['overview', 'items'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2.5 text-sm font-semibold transition ${
                  activeTab === tab
                    ? 'text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab === 'overview' ? 'Overview' : 'Top Items'}
              </button>
            ))}
          </div>

          {activeTab === 'overview' ? (
            <>
              {/* ROW 1: Efficiency + Attendance */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">

                {/* Efficiency */}
                <div className="bg-blue-600 rounded-sm shadow-md p-4 flex flex-col items-center text-center">
                  <p className="text-[11px] tracking-widest text-blue-200 font-semibold mb-3">
                    STAFF EFFICIENCY RATING
                  </p>
                  <EfficiencyRing score={summary.efficiencyScore} />
                  <p className="text-white font-bold text-lg mt-3">
                    {summary.efficiencyScore >= 90
                      ? 'Excellent Performance'
                      : summary.efficiencyScore >= 70
                      ? 'Good Performance'
                      : 'Needs Improvement'}
                  </p>
                  <p className="text-blue-200 text-xs mt-1">
                    Based on sales output and active time
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-4 w-full">
                    <div className="bg-blue-700 rounded-sm px-3 py-2">
                      <p className="text-[10px] text-blue-300 tracking-widest font-semibold">EFFICIENCY</p>
                      <p className="text-white font-bold text-xl">{summary.efficiencyPct}%</p>
                    </div>
                    <div className="bg-blue-700 rounded-sm px-3 py-2">
                      <p className="text-[10px] text-blue-300 tracking-widest font-semibold">ACTIVE TIME</p>
                      <p className="text-white font-bold text-xl">{summary.activeTime}</p>
                    </div>
                  </div>
                </div>

                {/* Attendance */}
                <div className="bg-white rounded-sm shadow-md p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-semibold text-gray-700">Attendance Log</h2>
                    {summary.lateLogin && (
                      <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-sm">
                        ⚠ LATE LOGIN
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { label: 'CLOCK IN',      val: summary.clockIn },
                      { label: 'CLOCK OUT',     val: summary.clockOut },
                      { label: 'WORKING HOURS', val: summary.workingHours },
                      { label: 'ATTENDANCE %',  val: `${summary.attendancePct}%`, highlight: true },
                    ].map((item) => (
                      <div key={item.label} className="bg-gray-50 rounded-sm px-3 py-2.5">
                        <p className="text-[10px] text-gray-400 tracking-widest font-semibold">{item.label}</p>
                        <p className={`font-bold text-xl mt-0.5 ${item.highlight ? 'text-blue-600' : 'text-gray-800'}`}>
                          {item.val}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Velocity */}
                  <div className="mt-3 border-t pt-3">
                    <h3 className="text-sm font-semibold text-gray-600 mb-2">Daily Velocity</h3>
                    <div className="space-y-2.5">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-[10px] text-gray-400 tracking-widest font-semibold">SALES / HR</span>
                          <span className="text-sm font-bold text-gray-800">Rs.{Number(summary.salesPerHr).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-sm"
                            style={{ width: `${Math.min(100, (summary.salesPerHr / 1000) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="text-[10px] text-gray-400 tracking-widest font-semibold">ORDERS / HR</span>
                          <span className="text-sm font-bold text-gray-800">{summary.ordersPerHr}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-sm overflow-hidden">
                          <div
                            className="h-full bg-gray-400 rounded-sm"
                            style={{ width: `${Math.min(100, (summary.ordersPerHr / 30) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ROW 2: Payments + Coming Soon cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">

                {/* Payment Methods */}
                <div className="bg-white rounded-sm shadow-md p-4">
                  <h2 className="text-base font-semibold text-gray-700 mb-3">Payment Methods</h2>
                  <div className="flex items-center gap-4">
                    <DonutChart
                      cash={summary.payments.cash}
                      upi={summary.payments.upi}
                      card={summary.payments.card}
                      total={summary.paymentTotal}
                    />
                    <div className="flex flex-col gap-3 flex-1">
                      {[
                        { label: 'Card', amount: summary.payments.card, dot: 'bg-blue-600' },
                        { label: 'UPI',  amount: summary.payments.upi,  dot: 'bg-gray-500' },
                        { label: 'Cash', amount: summary.payments.cash, dot: 'bg-gray-300' },
                      ].map((pm) => {
                        const pct = summary.paymentTotal > 0
                          ? Math.round((pm.amount / summary.paymentTotal) * 100)
                          : 0;
                        return (
                          <div key={pm.label} className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${pm.dot}`} />
                            <div className="flex-1">
                              <div className="flex justify-between items-baseline">
                                <span className="text-xs text-gray-500">{pm.label} ({pct}%)</span>
                                <span className="text-sm font-semibold text-gray-800">
                                  Rs.{pm.amount.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-4 border-t pt-3">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 tracking-widest font-semibold">DISCOUNTS</p>
                      <p className="font-bold text-gray-800 mt-0.5">Rs.{summary.discounts.toFixed(2)}</p>
                    </div>
                    <div className="text-center border-x">
                      <p className="text-[10px] text-gray-400 tracking-widest font-semibold">REFUNDS</p>
                      <p className="font-bold text-red-500 mt-0.5">Rs.{summary.refunds.toFixed(2)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 tracking-widest font-semibold">RETURNS</p>
                      <p className="font-bold text-gray-800 mt-0.5">{summary.returns} items</p>
                    </div>
                  </div>
                </div>

                {/* Week Trend + Top Performer — Coming Soon */}
                {/* <div className="flex flex-col gap-2">
                  <div className="relative bg-white rounded-sm shadow-md p-4 flex-1 overflow-hidden" style={{ minHeight: 120 }}>
                    <ComingSoon label="Weekly Trend — Coming Soon" />
                    <h2 className="text-base font-semibold text-gray-300">Weekly Sales Trend</h2>
                    <div className="flex items-end gap-1.5 mt-2 opacity-20" style={{ height: 60 }}>
                      {[40, 60, 45, 80, 70, 90, 35].map((h, i) => (
                        <div key={i} className="flex-1 bg-blue-200 rounded-t-sm" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                  <div className="relative bg-blue-600 rounded-sm shadow-md p-4 overflow-hidden">
                    <ComingSoon label="Top Performer — Coming Soon" />
                    <div className="flex items-center gap-4 opacity-20">
                      <div className="w-14 h-14 rounded-sm border-2 border-white/40 flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-xl">#1</span>
                      </div>
                      <div>
                        <p className="text-white font-bold">Top Performer</p>
                        <p className="text-blue-200 text-xs mt-0.5">Coming soon</p>
                      </div>
                    </div>
                  </div>
                </div> */}
              </div>

              {/* ROW 3: Smart Alerts (real data) */}
              {/* <div className="bg-white p-4 rounded-sm shadow-md mb-2">
                <h2 className="text-base font-semibold text-gray-700 mb-3">Smart Alerts</h2>
                <div className="flex flex-col gap-2">
                  {alerts.map((alert) => {
                    const s = ALERT_STYLES[alert.level];
                    return (
                      <div key={alert.id} className={`border-l-4 rounded-sm px-3 py-2.5 ${s.border} ${s.bg}`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${s.badge}`}>
                            {alert.level}
                          </span>
                          <span className="text-[11px] text-gray-400">{alert.time}</span>
                        </div>
                        <p className="text-sm font-semibold text-gray-800">{alert.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{alert.description}</p>
                      </div>
                    );
                  })}
                </div>
              </div> */}
            </>
          ) : (
            /* ── TOP ITEMS TAB ──────────────────────────────────────────────── */
            <div className="bg-white rounded-sm shadow-md mb-2 overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-700">Top Selling Items</h2>
                <span className="text-[10px] font-semibold text-blue-500 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-sm">
                  {dateRangeLabel}
                </span>
              </div>

              {topItems.length === 0 ? (
                <p className="p-6 text-center text-gray-400 text-sm">
                  No items sold in this period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        {['#', 'Item Name', 'Qty Sold', 'Revenue', 'Avg / Item'].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 text-[10px] text-gray-400 font-semibold tracking-widest uppercase">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map((item, i) => (
                        <tr key={item.name} className="border-b last:border-0 hover:bg-gray-50 transition">
                          <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                          <td className="px-4 py-3 font-semibold text-gray-800">{item.name}</td>
                          <td className="px-4 py-3 text-gray-600">{item.qty}</td>
                          <td className="px-4 py-3 font-bold text-blue-600">Rs.{item.revenue.toFixed(2)}</td>
                          <td className="px-4 py-3 text-gray-500">
                            Rs.{item.qty > 0 ? (item.revenue / item.qty).toFixed(2) : '0.00'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-blue-600">
                        <td colSpan={2} className="px-4 py-2.5 text-white font-bold">Total</td>
                        <td className="px-4 py-2.5 text-white font-bold">
                          {topItems.reduce((a, i) => a + i.qty, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-white font-bold">
                          Rs.{topItems.reduce((a, i) => a + i.revenue, 0).toFixed(2)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default UserReport;