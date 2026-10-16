import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  FileText,
  History,
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
import { ROUTES } from '../../constants/routes.constants';
import BackButton from '../../Components/BackButton';
import { useCatalogueReportsOverview } from './useCatalogueReportsOverview';

interface ReportCard {
  title: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
  /** Route to open; omit for a "Soon" card. */
  to?: string;
  stat?: string;
}

const formatRupees = (value: number) =>
  `${value < 0 ? '−' : ''}₹${Math.abs(Math.round(value)).toLocaleString('en-IN')}`;
const plural = (n: number, word: string, many = `${word}s`) =>
  `${n.toLocaleString('en-IN')} ${n === 1 ? word : many}`;

const Reports = () => {
  const location = useLocation();
  const isDefaultReportsView =
    location.pathname === `${ROUTES.CHOME}/${ROUTES.CATALOGUE_REPORTS}` || location.pathname === `${ROUTES.REPORTS}/`;

  const { stats, ready } = useCatalogueReportsOverview();
  const [query, setQuery] = useState('');

  // A stat shows "…" until its data has loaded.
  const statIf = (isReady: boolean, text: string) => (isReady ? text : '…');

  const sections: { title: string; cards: ReportCard[] }[] = [
    {
      title: 'Sales & customers',
      cards: [
        {
          title: 'Sales report',
          description: 'Orders, top customers, daily sales',
          icon: FileText,
          iconClass: 'bg-blue-50 text-blue-600',
          to: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_SALES}`,
          stat: statIf(ready.sales, `${formatRupees(stats.sales.total)} · 30 days`),
        },
        {
          title: 'Customer report',
          description: 'Top customers, visits, udhaar',
          icon: Users,
          iconClass: 'bg-pink-50 text-pink-600',
          to: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_CUSTOMER_REPORT}`,
          stat: statIf(ready.customers, `${plural(stats.customers, 'customer')} · 30 days`)
        },
        {
          title: 'Party ledger',
          description: "Every party's balance and entries",
          icon: BookOpen,
          iconClass: 'bg-orange-50 text-orange-700',
          to: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_PARTY_LEDGER}`,
          stat: statIf(ready.parties, `${formatRupees(stats.dueToYou)} due to you`),
        },
      ],
    },
    {
      title: 'Stock',
      cards: [
        {
          title: 'Item report',
          description: 'Best sellers, slow movers, stock value',
          icon: Tag,
          iconClass: 'bg-blue-50 text-blue-600',
          to: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_ITEMS}`,
          stat: statIf(ready.items, plural(stats.items, 'item')),
        },
        {
          title: 'Stock transfer report',
          description: 'Moves between your stores',
          icon: Truck,
          iconClass: 'bg-pink-50 text-pink-600',
          to: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_STOCK_TRANSFER}`,
          stat: statIf(ready.transfers, `${plural(stats.transfersThisMonth, 'transfer')} this month`),
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
          to: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_PNL_REPORT}`,
          stat: statIf(ready.profit, `${formatRupees(stats.profit.net)} net profit`),
        },
        {
          title: 'Expense report',
          description: 'Rent, salary and other spending',
          icon: Wallet,
          iconClass: 'bg-red-50 text-red-600',
          to: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_EXPENSE_REPORT}`,
          stat: statIf(
            ready.expenses,
            `${formatRupees(stats.expenses.total)} · ${plural(stats.expenses.entries, 'entry', 'entries')}`,
          ),
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
      ],
    },
  ];

  const q = query.trim().toLowerCase();
  const visibleSections = sections
    .map((section) => ({
      ...section,
      cards: section.cards.filter(
        (card) => !q || `${card.title} ${card.description}`.toLowerCase().includes(q),
      ),
    }))
    .filter((section) => section.cards.length > 0);

  const kpis = [
    {
      label: 'Sales',
      value: statIf(ready.sales, formatRupees(stats.sales.total)),
      hint: plural(stats.sales.bills, 'order'),
      icon: FileText,
      iconClass: 'bg-blue-50 text-blue-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Expenses',
      value: statIf(ready.expenses, formatRupees(stats.expenses.total)),
      hint: plural(stats.expenses.entries, 'entry', 'entries'),
      icon: Wallet,
      iconClass: 'bg-red-50 text-red-600',
      valueClass: 'text-slate-900',
    },
    {
      label: 'Profit',
      value: statIf(ready.profit, formatRupees(stats.profit.net)),
      hint: ready.profit ? `${stats.profit.margin.toFixed(1)}% margin` : '…',
      icon: TrendingUp,
      iconClass: 'bg-green-50 text-green-600',
      valueClass: ready.profit && stats.profit.net < 0 ? 'text-red-600' : 'text-green-700',
    },
    {
      label: 'Items',
      value: statIf(ready.items, stats.items.toLocaleString('en-IN')),
      hint: 'in catalogue',
      icon: Tag,
      iconClass: 'bg-orange-50 text-orange-600',
      valueClass: 'text-slate-900',
    },
  ];

  if (!isDefaultReportsView) {
    return (
      <div className="flex flex-col w-full min-h-full bg-[#fff5ec] font-poppins">
        <div className="relative flex items-center p-4 bg-white border-b border-[#f6e1d0] shadow-sm flex-shrink-0">
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
    <div className="flex flex-col w-full min-h-full bg-[#fff5ec] font-poppins">
      {/* HEADER */}
      <div className="relative flex items-center gap-3 p-4 bg-white border-b border-[#f6e1d0] shadow-sm flex-shrink-0">
        <BackButton />
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-xl font-bold text-slate-900 m-0">Reports</h1>
          <span className="hidden text-xs text-slate-500 md:inline">Numbers below are for the last 30 days</span>
        </div>
        <div className="relative ml-auto hidden w-72 md:block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a report"
            className="w-full rounded-sm border border-slate-300 bg-white py-2 pl-9 pr-8 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-600 focus:ring-2 focus:ring-orange-100"
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

      <div className="flex-1 px-3 pb-20 pt-4 md:px-6 md:pb-8 md:pt-5">
        {/* HEADLINE NUMBERS */}
        <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-4">
          {kpis.map(({ label, value, hint, icon: Icon, iconClass }) => (
            <div key={label} className="min-w-0 rounded-sm border border-[#f6e1d0] bg-white shadow-card p-3 md:p-4">
              <div className="flex items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm md:h-7 md:w-7 ${iconClass}`}>
                  <Icon size={14} />
                </span>
                <span className="truncate text-xs font-medium text-slate-700 md:text-sm">{label}</span>
              </div>
              <p className="mt-2 truncate text-xl font-bold text-slate-900 md:text-2xl">{value}</p>
              <p className="mt-0.5 truncate text-[11px] text-slate-500 md:text-xs">{hint}</p>
            </div>
          ))}
        </div>

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
                        {card.stat && (
                          <span className="mt-1 block text-xs font-semibold text-orange-700">{card.stat}</span>
                        )}
                      </span>
                    </>
                  );

                  return card.to ? (
                    <Link
                      key={card.title}
                      to={card.to}
                      className="group flex items-center gap-3 rounded-sm border border-[#f6e1d0] bg-white shadow-card p-4 no-underline transition hover:border-slate-300"
                    >
                      {body}
                      <ChevronRight size={18} className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
                    </Link>
                  ) : (
                    <div
                      key={card.title}
                      aria-disabled="true"
                      className="flex cursor-not-allowed items-center gap-3 rounded-sm border border-[#f6e1d0] bg-[#fff8f2] p-4"
                    >
                      {body}
                      <span className="shrink-0 rounded-sm bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-800">
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