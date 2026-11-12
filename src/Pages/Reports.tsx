import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  Banknote,
  BookOpen,
  ChevronRight,
  FileText,
  History,
  Package,
  Receipt,
  Search,
  Tag,
  TrendingUp,
  Truck,
  User,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '../constants/routes.constants';
import { useAuth } from '../context/auth-context';
import BackButton from '../Components/BackButton';
import { Permissions } from '../enums';
import { useReportsOverview } from './Reports/useReportsOverview';

interface ReportCard {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
  /** Route to open; omit for a "Soon" card. */
  to?: string;
  permission?: Permissions;
  stat?: string;
}

const formatRupees = (value: number) =>
  `${value < 0 ? '−' : ''}₹${Math.abs(Math.round(value)).toLocaleString('en-IN')}`;
const plural = (n: number, word: string, many = `${word}s`) =>
  `${n.toLocaleString('en-IN')} ${n === 1 ? word : many}`;

const Reports = () => {
  const location = useLocation();
  const isDefaultReportsView =
    location.pathname === '/reports' || location.pathname === '/reports/';

  const { hasPermission } = useAuth();
  const { can, stats, ready } = useReportsOverview();
  const [query, setQuery] = useState('');

  // A stat shows "…" until its data has loaded.
  const statIf = (isReady: boolean, text: string) => (isReady ? text : '…');

  const sections: { title: string; cards: ReportCard[] }[] = [
    {
      title: 'Sales & customers',
      cards: [
        {
          title: 'Sales report',
          description: 'Bills, payment modes, daily sales',
          icon: FileText,
          iconClass: 'bg-blue-50 text-blue-600',
          to: ROUTES.SALES_REPORT,
          permission: Permissions.ViewSalesReport,
          stat: statIf(ready.sales, `${formatRupees(stats.sales.total)} · 30 days`),
        },
        {
          title: 'Customer report',
          description: 'Top customers, visits, udhaar',
          icon: Users,
          iconClass: 'bg-pink-50 text-pink-600',
          to: ROUTES.CUSTOMER_REPORT,
          permission: Permissions.ViewCustomerReport,
          stat: statIf(ready.parties, plural(stats.customers, 'customer')),
        },
        {
          title: 'Party ledger',
          description: "Every party's balance and entries",
          icon: BookOpen,
          iconClass: 'bg-orange-50 text-orange-600',
          to: ROUTES.PARTY_LEDGER,
          permission: Permissions.ViewPartyLedger,
          stat: statIf(ready.parties, `${formatRupees(stats.dueToYou)} due to you`),
        },
      ],
    },
    {
      title: 'Purchases & stock',
      cards: [
        {
          title: 'Purchase report',
          description: 'Supplier bills, dues, GST input',
          icon: Package,
          iconClass: 'bg-green-50 text-green-600',
          to: ROUTES.PURCHASE_REPORT,
          permission: Permissions.ViewPurchaseReport,
          stat: statIf(ready.purchases, `${formatRupees(stats.purchases.total)} · 30 days`),
        },
        {
          title: 'Item reports',
          description: 'Best sellers, slow movers, stock value',
          icon: Tag,
          iconClass: 'bg-blue-50 text-blue-600',
          to: ROUTES.ITEM_REPORTS,
          permission: Permissions.ViewItemReport,
          stat: statIf(ready.items, plural(stats.items, 'item')),
        },
        {
          title: 'Stock transfer report',
          description: 'Moves between your stores',
          icon: Truck,
          iconClass: 'bg-pink-50 text-pink-600',
          to: ROUTES.STOCK_TRANSFER,
          permission: Permissions.ViewStockTransferReport,
          stat: statIf(ready.transfers, `${stats.transfersThisMonth.toLocaleString('en-IN')} this month`),
        },
        {
          title: 'Restock report',
          description: 'What to reorder, and how much',
          icon: History,
          iconClass: 'bg-slate-100 text-slate-500',
        },
      ],
    },
    {
      title: 'Money & compliance',
      cards: [
        {
          title: 'P&L report',
          description: 'Profit after cost and expenses',
          icon: TrendingUp,
          iconClass: 'bg-green-50 text-green-600',
          to: ROUTES.PNL_REPORT,
          permission: Permissions.ViewPNLReport,
          stat: statIf(ready.profit, `${formatRupees(stats.profit.net)} net profit`),
        },
        {
          title: 'Expense report',
          description: 'Rent, salary and other spending',
          icon: Wallet,
          iconClass: 'bg-red-50 text-red-600',
          to: ROUTES.EXPENSE_REPORT,
          permission: Permissions.ViewExpenseReport,
          stat: statIf(ready.expenses, `${formatRupees(stats.expenses.total)} · ${plural(stats.expenses.entries, 'entry', 'entries')}`),
        },
        {
          title: 'Tax report',
          description: 'GSTR-1 / 3B ready summaries',
          icon: Receipt,
          iconClass: 'bg-slate-100 text-slate-500',
        },
        {
          title: 'User report',
          description: 'Sales and activity per staff',
          icon: User,
          iconClass: 'bg-slate-100 text-slate-500',
        },
        {
          title: 'Galla hisaab tool',
          description: 'Count the cash drawer, match with sales',
          icon: Banknote,
          iconClass: 'bg-slate-100 text-slate-500',
        },
      ],
    },
  ];

  const q = query.trim().toLowerCase();
  const visibleSections = sections
    .map((section) => ({
      ...section,
      cards: section.cards.filter(
        (card) =>
          (!card.permission || hasPermission(card.permission)) &&
          (!q || `${card.title} ${card.description}`.toLowerCase().includes(q)),
      ),
    }))
    .filter((section) => section.cards.length > 0);

  const kpis = [
    can.sales && {
      label: 'Sales',
      value: statIf(ready.sales, formatRupees(stats.sales.total)),
      hint: plural(stats.sales.bills, 'bill'),
      icon: FileText,
      iconClass: 'bg-blue-50 text-blue-600',
    },
    can.purchases && {
      label: 'Purchases',
      value: statIf(ready.purchases, formatRupees(stats.purchases.total)),
      hint: plural(stats.purchases.bills, 'bill'),
      icon: Package,
      iconClass: 'bg-green-50 text-green-600',
    },
    can.expenses && {
      label: 'Expenses',
      value: statIf(ready.expenses, formatRupees(stats.expenses.total)),
      hint: plural(stats.expenses.entries, 'entry', 'entries'),
      icon: Wallet,
      iconClass: 'bg-red-50 text-red-600',
    },
    can.pnl && {
      label: 'Net profit',
      shortLabel: 'Profit',
      value: statIf(ready.profit, formatRupees(stats.profit.net)),
      hint: `${Math.round(stats.profit.margin)}% margin`,
      icon: TrendingUp,
      iconClass: 'bg-indigo-50 text-indigo-600',
    },
  ].filter(Boolean) as {
    label: string;
    shortLabel?: string;
    value: string;
    hint: string;
    icon: LucideIcon;
    iconClass: string;
  }[];

  if (!isDefaultReportsView) {
    return (
      <div className="flex flex-col w-full min-h-full bg-canvas">
        <div className="sticky top-0 z-10 flex items-center px-2 h-14 bg-white border-b border-line flex-shrink-0">
          <BackButton />
        </div>
        <div className="flex-1 p-4">
          <div className="bg-white p-2 md:p-6 rounded-sm shadow-md min-h-[200px]">
            <Outlet />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-canvas">
      {/* HEADER */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-white border-b border-line">
        <div className="flex items-center gap-3 px-2 h-14 md:h-auto md:px-6 md:py-3.5">
          <div className="flex-shrink-0">
            <BackButton />
          </div>
          <div className="flex min-w-0 flex-1 items-baseline gap-3">
            <h1 className="m-0 text-lg leading-6 md:text-[22px] md:leading-[30px] font-semibold text-slate-900">Reports</h1>
            <span className="hidden text-xs text-slate-500 md:inline">Numbers below are for the last 30 days</span>
            <span className="ml-auto text-xs text-slate-500 md:hidden">Last 30 days</span>
          </div>
          <div className="relative hidden w-72 md:block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a report"
              className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* BODY (padding yahan shift hua hai, pehle outer div pe tha) */}
      <div className="flex-1 px-3 pb-20 pt-4 md:px-6 md:pb-8 md:pt-5">
        {/* HEADLINE NUMBERS */}
        {kpis.length > 0 && (
          <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
            {kpis.map(({ label, shortLabel, value, hint, icon: Icon, iconClass }) => (
              <div key={label} className="min-w-0 rounded-sm border border-line bg-white shadow-card p-3 md:p-4">
                <div className="flex items-center gap-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}>
                    <Icon size={14} />
                  </span>
                  <span className="truncate text-xs font-medium text-slate-700 md:text-sm">
                    {shortLabel ? (
                      <>
                        <span className="md:hidden">{shortLabel}</span>
                        <span className="hidden md:inline">{label}</span>
                      </>
                    ) : (
                      label
                    )}
                  </span>
                </div>
                <p className="mt-2 truncate text-xl font-bold text-slate-900 md:text-2xl">{value}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
              </div>
            ))}
          </div>
        )}

        {/* REPORT GROUPS */}
        {visibleSections.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-500">No reports match “{query}”.</p>
        )}
        <div className="space-y-5">
          {visibleSections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-2 flex items-baseline gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:text-sm md:normal-case md:tracking-normal md:text-slate-900">
                  {section.title}
                </span>
                <span className="hidden text-xs text-slate-400 md:inline">{plural(section.cards.length, 'report')}</span>
              </h2>
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {section.cards.map((card) => {
                  const Icon = card.icon;
                  const body = (
                    <>
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm ${card.iconClass}`}>
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-semibold ${card.to ? 'text-slate-900' : 'text-slate-500'}`}>
                          {card.title}
                        </span>
                        <span className="block truncate text-xs text-slate-500">{card.description}</span>
                        {card.stat && <span className="mt-1 block text-xs font-semibold text-blue-600">{card.stat}</span>}
                      </span>
                    </>
                  );

                  return card.to ? (
                    <Link
                      key={card.title}
                      to={card.to}
                      className="group flex items-center gap-3 rounded-sm border border-line bg-white shadow-card p-4 no-underline transition hover:border-slate-300"
                    >
                      {body}
                      <ChevronRight size={18} className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
                    </Link>
                  ) : (
                    <div
                      key={card.title}
                      aria-disabled="true"
                      className="flex cursor-not-allowed items-center gap-3 rounded-sm border border-line bg-sunken p-4"
                    >
                      {body}
                      <span className="shrink-0 rounded-sm bg-blue-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-700">
                        Soon
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Reports;
