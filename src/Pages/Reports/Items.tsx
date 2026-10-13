import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Pencil,
  ShoppingCart,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { ROUTES } from '../../constants/routes.constants';
import { useAuth } from '../../context/auth-context';
import { useCatalogueData } from '../../context/CatalogueDataContext';
import { Permissions } from '../../enums';
import {
  ITEM_ISSUES,
  averageMarginPercent,
  hasItemIssue,
  totalStock,
} from './ItemReportComponents/itemIssues';

interface HubCard {
  title: string;
  description: string;
  mobileDescription?: string;
  stat?: string;
  icon: LucideIcon;
  iconClass: string;
  to: string;
  /** Shortcut to a non-report page — tinted, and grouped apart on mobile. */
  isShortcut?: boolean;
}

const ItemReportsHub = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  // Items are already kept loaded app-wide, so these numbers cost no reads.
  const { items, itemsLoading } = useCatalogueData();

  const canViewReports = hasPermission(Permissions.ViewItemReport);
  const canManage = hasPermission(Permissions.ManageItems);

  const { avgMargin, issueCounts } = useMemo(
    () => ({
      avgMargin: averageMarginPercent(items),
      issueCounts: Object.fromEntries(
        ITEM_ISSUES.map(({ value }) => [
          value,
          items.filter((item) => hasItemIssue(item, value, totalStock(item))).length,
        ]),
      ) as Record<(typeof ITEM_ISSUES)[number]['value'], number>,
    }),
    [items],
  );

  const reportCards: HubCard[] = canViewReports
    ? [
        {
          title: 'Item report',
          description: 'Stock, MRP, cost and margin for every item',
          stat: itemsLoading
            ? '…'
            : `${items.length.toLocaleString('en-IN')} ${items.length === 1 ? 'item' : 'items'} · ${Math.round(avgMargin)}% avg margin`,
          icon: Tag,
          iconClass: 'bg-blue-50 text-blue-600',
          to: ROUTES.ITEM_REPORT,
        },
        {
          title: 'Item sold report',
          description: 'What sold, how many and for how much',
          stat: 'By period, best sellers first',
          icon: ShoppingCart,
          iconClass: 'bg-green-50 text-green-600',
          to: ROUTES.ITEM_SOLD_REPORT,
        },
      ]
    : [];

  const manageCard: HubCard | null = canManage
    ? {
        title: 'Manage items',
        description: 'Add, edit or delete items · not a report',
        mobileDescription: 'Add, edit or delete items',
        stat: 'Opens your item list',
        icon: Pencil,
        iconClass: 'bg-orange-50 text-orange-600',
        to: ROUTES.MANAGE_ITEMS,
        isShortcut: true,
      }
    : null;

  const renderCard = (card: HubCard, className = '') => {
    const Icon = card.icon;
    return (
      <Link
        key={card.title}
        to={card.to}
        className={`group flex items-center gap-3 rounded-sm border p-4 no-underline transition ${
          card.isShortcut
            ? 'border-line bg-sunken/80 hover:border-slate-300'
            : 'border-line bg-white shadow-card hover:border-slate-300'
        } ${className}`}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-sm ${card.iconClass}`}>
          <Icon size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">{card.title}</span>
          <span className="block text-xs text-slate-500">
            {card.mobileDescription ? (
              <>
                <span className="md:hidden">{card.mobileDescription}</span>
                <span className="hidden md:inline">{card.description}</span>
              </>
            ) : (
              card.description
            )}
          </span>
          {card.stat && (
            <span className={`mt-1 text-xs font-semibold text-blue-600 ${card.isShortcut ? 'hidden md:block' : 'block'}`}>
              {card.stat}
            </span>
          )}
        </span>
        <ChevronRight size={18} className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600" />
      </Link>
    );
  };

  const issuesWithItems = ITEM_ISSUES.filter(({ value }) => issueCounts[value] > 0);

  return (
    <div className="min-h-screen bg-canvas px-3 pb-20 pt-3 md:px-6 md:pb-8 md:pt-5">
      {/* HEADER */}
      <header className="mb-4 flex items-center gap-2 md:gap-3">
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-slate-700 transition hover:bg-slate-200 md:border md:border-slate-300 md:bg-white"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="hidden text-xs text-slate-500 md:block">Reports /</p>
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold text-slate-900 md:text-xl">Item reports</h1>
            <span className="hidden text-xs text-slate-500 md:inline">Reports about your products</span>
          </div>
          <p className="text-xs text-slate-500 md:hidden">Reports</p>
        </div>
      </header>

      {/* CARDS — desktop: one row; mobile: reports, then the shortcut on its own */}
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3 md:gap-4">
        {reportCards.map((card) => renderCard(card))}
        {manageCard && renderCard(manageCard, 'hidden md:flex')}
      </div>

      {manageCard && (
        <section className="mt-5 md:hidden">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Shortcut</h2>
          {renderCard(manageCard)}
        </section>
      )}

      {/* ITEMS THAT NEED A LOOK */}
      {canViewReports && !itemsLoading && (
        <div className="mt-4 hidden items-center gap-3 rounded-sm border border-line bg-white shadow-card px-4 py-3 md:flex">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-blue-50 text-blue-600">
            <AlertTriangle size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900">Items that need a look</p>
            <p className="text-xs text-slate-500">
              {issuesWithItems.length > 0
                ? 'Negative stock, missing MRP or missing cost price make reports wrong'
                : 'All good — no items with negative stock, missing MRP or missing cost price'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {ITEM_ISSUES.map(({ value, label }) => {
              const count = issueCounts[value];
              return (
                <button
                  key={value}
                  onClick={() => navigate(ROUTES.ITEM_REPORT, { state: { issue: value } })}
                  disabled={count === 0}
                  title={count === 0 ? `No items with ${label.toLowerCase()}` : `Show the ${count} items in the Item report`}
                  className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium transition ${
                    count > 0
                      ? 'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-400'
                      : 'cursor-default border-line bg-white text-slate-400'
                  }`}
                >
                  {label}
                  <span className={`rounded-sm px-1 text-[11px] font-semibold ${count > 0 ? 'bg-white text-amber-800' : 'text-slate-400'}`}>
                    {count.toLocaleString('en-IN')}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ItemReportsHub;
