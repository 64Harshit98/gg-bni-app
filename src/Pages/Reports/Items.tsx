import { Link } from 'react-router-dom';
import { FileText, Package, ShoppingBag } from 'lucide-react';
import { ROUTES } from '../../constants/routes.constants';
import ShowWrapper from '../../context/ShowWrapper';
import { Permissions } from '../../enums';
import BackButton from '../../Components/BackButton';
import { cn } from '../../lib/utils';

interface ItemReportTileProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  badgeClass: string;
}

const ItemReportTile: React.FC<ItemReportTileProps> = ({ to, icon, label, description, badgeClass }) => (
  <Link
    to={to}
    className={cn(
      'group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    )}
  >
    <span
      className={cn(
        'relative flex size-11 shrink-0 items-center justify-center rounded-xl [&>svg]:size-5',
        badgeClass,
      )}
    >
      {icon}
    </span>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
    </div>
  </Link>
);

const Items = () => {
  return (
    <div className="aurora flex min-h-screen flex-col bg-background">
      <header className="glass sticky top-0 z-10 flex items-center gap-3 border-b border-border px-4 py-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Item <span className="text-gradient">Reports</span>
          </h1>
          <p className="text-xs text-muted-foreground">Inventory pricing, stock &amp; sales breakdowns</p>
        </div>
        <span className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs sm:flex">
          <Package className="size-4" />
        </span>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 pb-16 md:px-8 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
            <ItemReportTile
              to={ROUTES.ITEM_REPORT}
              icon={<Package />}
              label="Item Report"
              description="Pricing, margins & stock across your catalogue"
              badgeClass="bg-gradient-to-br from-primary/20 to-fuchsia-500/20 text-primary shadow-inner"
            />
          </ShowWrapper>

          <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
            <ItemReportTile
              to={ROUTES.MANAGE_ITEMS}
              icon={<ShoppingBag />}
              label="Manage Items"
              description="Review, edit & clean up your item catalogue"
              badgeClass="bg-gradient-to-br from-sky-500/25 to-cyan-500/25 text-sky-600 shadow-inner dark:text-sky-400"
            />
          </ShowWrapper>

          <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
            <ItemReportTile
              to={ROUTES.ITEM_SOLD_REPORT}
              icon={<FileText />}
              label="Item Sold Report"
              description="Track what's selling and how much"
              badgeClass="bg-gradient-to-br from-emerald-500/25 to-teal-500/25 text-emerald-600 shadow-inner dark:text-emerald-400"
            />
          </ShowWrapper>
        </div>
      </div>
    </div>
  );
};

export default Items;
