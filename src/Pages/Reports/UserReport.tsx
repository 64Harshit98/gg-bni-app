import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Lock } from 'lucide-react';
import { CustomCard } from '../../Components/CustomCard';
import { CardVariant } from '../../enums';
import useUserReport from './UserReportComponents/useUserReport';
import BackButton from '../../Components/BackButton';
import { Spinner } from '../../Components/ui/spinner';
import { Button } from '../../Components/ui/button';
import { Input } from '../../Components/ui/input';
import { EmptyState } from '../../Components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../Components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../Components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../../Components/ui/table';
import DonutChart from './UserReportComponents/DonutChart';
import EfficiencyRing from './UserReportComponents/EfficiencyRing';

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
  if (authLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Spinner size="lg" />
        <p className="text-sm font-medium">Loading...</p>
      </div>
    );
  }
  if (!currentUser || currentUser.role !== 'Owner') {
    return (
      <div className="aurora flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
          <EmptyState
            icon={<Lock />}
            title="Access Restricted"
            description="This report is only accessible to the business Owner."
            action={
              <Button onClick={() => navigate(-1)} className="mt-1">
                Go Back
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-center text-destructive">
        {error}
      </div>
    );
  }

  // ── Date preset handler ───────────────────────────────────────────────────
  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    const start = new Date();
    const end = new Date();
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
    <div className="aurora min-h-screen bg-background pb-16">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="glass sticky top-0 z-10 flex items-center gap-3 border-b border-border px-4 py-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            User <span className="text-gradient">Report</span>
          </h1>
          <p className="text-xs text-muted-foreground">Staff performance &amp; attendance</p>
        </div>
        <span className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs sm:flex">
          <BarChart3 className="size-4" />
        </span>
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        {/* ── STAFF SELECTOR ─────────────────────────────────────────────────── */}
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-sm font-bold text-white">
              {selectedStaff
                ? selectedStaff.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                : '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {selectedStaff?.name ?? 'Select a staff member'}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {selectedStaff?.role ?? '—'}
              </p>
            </div>
          </div>

          {staffLoading ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Spinner size="sm" />
              Loading staff...
            </span>
          ) : (
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger size="sm" className="w-40 flex-shrink-0 bg-muted">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {staffList.map((s) => (
                  <SelectItem key={s.uid} value={s.uid}>
                    {s.name} ({s.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* ── DATE FILTER ──────────────────────────────────────────────────── */}
        <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <div className="grid grid-cols-1 gap-3">
            <Select value={datePreset} onValueChange={handleDatePresetChange}>
              <SelectTrigger className="w-full bg-muted">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last7">Last 7 Days</SelectItem>
                <SelectItem value="last30">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            <div className="grid grid-cols-2 gap-4">
              <Input
                type="date"
                value={customStartDate}
                onChange={(e) => { setCustomStartDate(e.target.value); setDatePreset('custom'); }}
              />
              <Input
                type="date"
                value={customEndDate}
                onChange={(e) => { setCustomEndDate(e.target.value); setDatePreset('custom'); }}
              />
            </div>
          </div>

          <div className="mt-3 flex justify-center">
            <Button onClick={handleApplyFilters} className="w-full md:w-fit md:px-10">
              Apply
            </Button>
          </div>
        </div>

        {/* Loading spinner */}
        {isLoading && (
          <div className="mb-4 flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-6 text-center text-muted-foreground shadow-xs">
            <Spinner size="default" />
            <span>Loading report data...</span>
          </div>
        )}

        {/* No filters applied yet */}
        {!isLoading && !appliedFilters && (
          <EmptyState
            className="rounded-2xl border-border bg-card"
            icon={<BarChart3 />}
            title="No data for this period"
            description="Select a date range and press Apply to load the report."
          />
        )}

        {/* Data loaded */}
        {!isLoading && appliedFilters && summary && (
          <>
            {/* ── KPI CARDS ──────────────────────────────────────────────────── */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CustomCard className="py-10" variant={CardVariant.Summary} title="Total Sales"
                value={`Rs.${Math.round(summary.totalSales).toLocaleString('en-IN')}`} />
              <CustomCard className="py-10" variant={CardVariant.Summary} title="Total Orders"
                value={summary.totalOrders.toString()} />
              <CustomCard className="py-10" variant={CardVariant.Summary} title="Avg Order Value"
                value={`Rs.${summary.avgOrderValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
              <CustomCard className="py-10" variant={CardVariant.Summary} title="Items Sold"
                value={summary.itemsSold.toString()} />
            </div>

            {/* Date range info strip */}
            <div className="mb-4 flex items-center justify-between rounded-2xl border border-info/20 bg-info/10 px-4 py-2">
              <p className="text-xs font-semibold tracking-wide text-info">SHOWING DATA FOR</p>
              <p className="text-xs font-bold text-info">{dateRangeLabel}</p>
            </div>

            {/* ── TABS ───────────────────────────────────────────────────────── */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'items')} className="mb-4">
              <TabsList className="w-full sm:w-fit">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="items">Top Items</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 flex flex-col gap-3">
                {/* ROW 1: Efficiency + Attendance */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {/* Efficiency */}
                  <div className="flex flex-col items-center rounded-2xl bg-primary p-4 text-center shadow-xs">
                    <p className="mb-3 text-[11px] font-semibold tracking-widest text-primary-foreground/70">
                      STAFF EFFICIENCY RATING
                    </p>
                    <EfficiencyRing score={summary.efficiencyScore} />
                    <p className="mt-3 text-lg font-bold text-primary-foreground">
                      {summary.efficiencyScore >= 90
                        ? 'Excellent Performance'
                        : summary.efficiencyScore >= 70
                        ? 'Good Performance'
                        : 'Needs Improvement'}
                    </p>
                    <p className="mt-1 text-xs text-primary-foreground/70">
                      Based on sales output and active time
                    </p>
                    <div className="mt-4 grid w-full grid-cols-2 gap-2">
                      <div className="rounded-xl bg-black/10 px-3 py-2">
                        <p className="text-[10px] font-semibold tracking-widest text-primary-foreground/60">EFFICIENCY</p>
                        <p className="text-xl font-bold text-primary-foreground">{summary.efficiencyPct}%</p>
                      </div>
                      <div className="rounded-xl bg-black/10 px-3 py-2">
                        <p className="text-[10px] font-semibold tracking-widest text-primary-foreground/60">ACTIVE TIME</p>
                        <p className="text-xl font-bold text-primary-foreground">{summary.activeTime}</p>
                      </div>
                    </div>
                  </div>

                  {/* Attendance */}
                  <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-base font-semibold text-foreground">Attendance Log</h2>
                      {summary.lateLogin && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                          ⚠ LATE LOGIN
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'CLOCK IN', val: summary.clockIn },
                        { label: 'CLOCK OUT', val: summary.clockOut },
                        { label: 'WORKING HOURS', val: summary.workingHours },
                        { label: 'ATTENDANCE %', val: `${summary.attendancePct}%`, highlight: true },
                      ].map((item) => (
                        <div key={item.label} className="rounded-xl bg-muted px-3 py-2.5">
                          <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">{item.label}</p>
                          <p className={`mt-0.5 text-xl font-bold ${item.highlight ? 'text-primary' : 'text-foreground'}`}>
                            {item.val}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Velocity */}
                    <div className="mt-3 border-t border-border pt-3">
                      <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Daily Velocity</h3>
                      <div className="space-y-2.5">
                        <div>
                          <div className="mb-1 flex justify-between">
                            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">SALES / HR</span>
                            <span className="text-sm font-bold text-foreground">Rs.{Number(summary.salesPerHr).toLocaleString('en-IN')}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.min(100, (summary.salesPerHr / 1000) * 100)}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <div className="mb-1 flex justify-between">
                            <span className="text-[10px] font-semibold tracking-widest text-muted-foreground">ORDERS / HR</span>
                            <span className="text-sm font-bold text-foreground">{summary.ordersPerHr}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-muted-foreground/50"
                              style={{ width: `${Math.min(100, (summary.ordersPerHr / 30) * 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ROW 2: Payments */}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {/* Payment Methods */}
                  <div className="rounded-2xl border border-border bg-card p-4 shadow-xs">
                    <h2 className="mb-3 text-base font-semibold text-foreground">Payment Methods</h2>
                    <div className="flex items-center gap-4">
                      <DonutChart
                        cash={summary.payments.cash}
                        upi={summary.payments.upi}
                        card={summary.payments.card}
                        total={summary.paymentTotal}
                      />
                      <div className="flex flex-1 flex-col gap-3">
                        {[
                          { label: 'Card', amount: summary.payments.card, dot: 'bg-primary' },
                          { label: 'UPI', amount: summary.payments.upi, dot: 'bg-muted-foreground/60' },
                          { label: 'Cash', amount: summary.payments.cash, dot: 'bg-muted-foreground/30' },
                        ].map((pm) => {
                          const pct = summary.paymentTotal > 0
                            ? Math.round((pm.amount / summary.paymentTotal) * 100)
                            : 0;
                          return (
                            <div key={pm.label} className="flex items-center gap-2">
                              <span className={`size-2.5 flex-shrink-0 rounded-full ${pm.dot}`} />
                              <div className="flex-1">
                                <div className="flex items-baseline justify-between">
                                  <span className="text-xs text-muted-foreground">{pm.label} ({pct}%)</span>
                                  <span className="text-sm font-semibold text-foreground">
                                    Rs.{pm.amount.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
                      <div className="text-center">
                        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">DISCOUNTS</p>
                        <p className="mt-0.5 font-bold text-foreground">Rs.{summary.discounts.toFixed(2)}</p>
                      </div>
                      <div className="border-x border-border text-center">
                        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">REFUNDS</p>
                        <p className="mt-0.5 font-bold text-destructive">Rs.{summary.refunds.toFixed(2)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground">RETURNS</p>
                        <p className="mt-0.5 font-bold text-foreground">{summary.returns} items</p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="items" className="mt-4">
                {/* ── TOP ITEMS TAB ──────────────────────────────────────────────── */}
                <div className="rounded-2xl border border-border bg-card shadow-xs">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h2 className="text-base font-semibold text-foreground">Top Selling Items</h2>
                    <span className="rounded-full border border-info/20 bg-info/10 px-2 py-0.5 text-[10px] font-semibold text-info">
                      {dateRangeLabel}
                    </span>
                  </div>

                  {topItems.length === 0 ? (
                    <EmptyState
                      className="border-none"
                      title="No items sold"
                      description="No items were sold in this period."
                    />
                  ) : (
                    <Table containerClassName="border-none rounded-none">
                      <TableHeader>
                        <TableRow>
                          <TableHead>#</TableHead>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Qty Sold</TableHead>
                          <TableHead>Revenue</TableHead>
                          <TableHead>Avg / Item</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topItems.map((item, i) => (
                          <TableRow key={item.name}>
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-semibold text-foreground">{item.name}</TableCell>
                            <TableCell className="text-muted-foreground">{item.qty}</TableCell>
                            <TableCell className="font-bold text-primary">Rs.{item.revenue.toFixed(2)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              Rs.{item.qty > 0 ? (item.revenue / item.qty).toFixed(2) : '0.00'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                      <TableFooter>
                        <TableRow className="bg-primary hover:bg-primary">
                          <TableCell colSpan={2} className="font-bold text-primary-foreground">Total</TableCell>
                          <TableCell className="font-bold text-primary-foreground">
                            {topItems.reduce((a, i) => a + i.qty, 0)}
                          </TableCell>
                          <TableCell className="font-bold text-primary-foreground">
                            Rs.{topItems.reduce((a, i) => a + i.revenue, 0).toFixed(2)}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    </Table>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </div>
  );
};

export default UserReport;
