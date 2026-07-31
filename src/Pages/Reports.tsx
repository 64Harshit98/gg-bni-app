import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  Calculator,
  FileText,
  PackagePlus,
  PieChart,
  Receipt,
  ShoppingCart,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { ROUTES } from '../constants/routes.constants';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import BackButton from '../Components/BackButton';
import { cn } from '../lib/utils';

interface ReportTileProps {
  to?: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  badgeClass: string;
  comingSoon?: boolean;
}

const ReportTile: React.FC<ReportTileProps> = ({ to, icon, label, description, badgeClass, comingSoon }) => {
  const content = (
    <>
      <span
        className={cn(
          'relative flex size-11 shrink-0 items-center justify-center rounded-xl [&>svg]:size-5',
          badgeClass,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{label}</p>
          {comingSoon && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Coming soon
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
      </div>
    </>
  );

  if (comingSoon || !to) {
    return (
      <div className="relative flex cursor-not-allowed items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-border bg-card/60 p-4 text-left opacity-70">
        {content}
      </div>
    );
  }

  return (
    <Link
      to={to}
      className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {content}
    </Link>
  );
};

const Reports = () => {
  const location = useLocation();
  const isDefaultReportsView =
    location.pathname === '/reports' || location.pathname === '/reports/';

  return (
    <div className="aurora flex min-h-screen flex-col bg-background">
      <header className="glass sticky top-0 z-10 flex items-center gap-3 border-b border-border px-4 py-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Business <span className="text-gradient">Reports</span>
          </h1>
          <p className="text-xs text-muted-foreground">Sales, inventory & financial insights, all in one place</p>
        </div>
        <span className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs sm:flex">
          <BarChart3 className="size-4" />
        </span>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 pb-16 md:px-8 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        {isDefaultReportsView ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ShowWrapper requiredPermission={Permissions.ViewSalesReport}>
              <ReportTile
                to={ROUTES.SALES_REPORT}
                icon={<Receipt />}
                label="Sales Report"
                description="Revenue, orders & sales trends"
                badgeClass="bg-gradient-to-br from-primary/20 to-fuchsia-500/20 text-primary shadow-inner"
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPurchaseReport}>
              <ReportTile
                to={ROUTES.PURCHASE_REPORT}
                icon={<ShoppingCart />}
                label="Purchase Report"
                description="Vendor purchases & stock inflow"
                badgeClass="bg-gradient-to-br from-sky-500/25 to-cyan-500/25 text-sky-600 shadow-inner dark:text-sky-400"
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
              <ReportTile
                to={ROUTES.ITEM_REPORTS}
                icon={<PackagePlus />}
                label="Item Reports"
                description="Pricing, margins & item performance"
                badgeClass="bg-gradient-to-br from-emerald-500/25 to-teal-500/25 text-emerald-600 shadow-inner dark:text-emerald-400"
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <ReportTile
                to={ROUTES.PNL_REPORT}
                icon={<PieChart />}
                label="P&L Report"
                description="Profit & loss across your business"
                badgeClass="bg-gradient-to-br from-violet-500/25 to-fuchsia-500/25 text-violet-600 shadow-inner dark:text-violet-400"
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <ReportTile
                to={ROUTES.EXPENSE_REPORT}
                icon={<Wallet />}
                label="Expense Report"
                description="Track spending & business expenses"
                badgeClass="bg-gradient-to-br from-amber-500/25 to-orange-500/25 text-amber-600 shadow-inner dark:text-amber-400"
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <ReportTile
                to={ROUTES.CUSTOMER_REPORT}
                icon={<Users />}
                label="Customer Report"
                description="Customer activity & outstanding dues"
                badgeClass="bg-gradient-to-br from-rose-500/25 to-pink-500/25 text-rose-600 shadow-inner dark:text-rose-400"
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <ReportTile
                to={ROUTES.PARTY_LEDGER}
                icon={<BookOpen />}
                label="Party Ledger"
                description="Running account balances per party"
                badgeClass="bg-gradient-to-br from-indigo-500/25 to-blue-500/25 text-indigo-600 shadow-inner dark:text-indigo-400"
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <ReportTile
                comingSoon
                icon={<UserCog />}
                label="User Report"
                description="Staff performance & attendance"
                badgeClass="bg-muted text-muted-foreground"
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <ReportTile
                comingSoon
                icon={<PackagePlus />}
                label="Restock Report"
                description="Low-stock & reorder recommendations"
                badgeClass="bg-muted text-muted-foreground"
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <ReportTile
                comingSoon
                icon={<Calculator />}
                label="Galla Hisaab Tool"
                description="Daily cash reconciliation"
                badgeClass="bg-muted text-muted-foreground"
              />
            </ShowWrapper>

            <ShowWrapper requiredPermission={Permissions.ViewPNLReport}>
              <ReportTile
                comingSoon
                icon={<FileText />}
                label="Tax Report"
                description="GST & tax filing summaries"
                badgeClass="bg-muted text-muted-foreground"
              />
            </ShowWrapper>
          </div>
        ) : (
          <div className="mt-2 flex min-h-[200px] items-center justify-center rounded-2xl border border-border bg-card p-6 shadow-sm">
            <Outlet />
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
