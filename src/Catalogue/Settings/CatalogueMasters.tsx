import { Link, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { ROUTES } from '../../constants/routes.constants';
import BackButton from '../../Components/BackButton';
import { useAuth } from '../../context/auth-context';
import { ROLES } from '../../enums';
import ShopHoursSettingPage from '../../Pages/Settings/ShopHoursSetting';
import { cn } from '../../lib/utils';
import {
  ShoppingCart,
  Receipt,
  Package,
  Users,
  ShieldCheck,
  Clock,
  ChevronRight,
  Settings2,
  X,
} from 'lucide-react';

interface SettingTileProps {
  to?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  description: string;
  badgeClass: string;
}

const SettingTile: React.FC<SettingTileProps> = ({ to, onClick, icon, label, description, badgeClass }) => {
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
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
    </>
  );

  const className = cn(
    'group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-border bg-card p-4 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );

  if (to) {
    return (
      <Link to={to} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(className, 'w-full')}>
      {content}
    </button>
  );
};

const CatalogueMasters = () => {
  const location = useLocation();
  const { currentUser } = useAuth();
  const [shopHoursOpen, setShopHoursOpen] = useState(false);

  const isDefaultMastersView =
    location.pathname === '/catalogue-home/cata-masters' || location.pathname === '/catalogue-home/cata-masters/';

  return (
    <div className="aurora flex min-h-screen flex-col bg-muted">
      <header className="glass sticky top-0 z-10 flex items-center gap-3 border-b border-border px-4 py-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Catalogue <span className="text-gradient">Settings</span>
          </h1>
          <p className="text-xs text-muted-foreground">Configure how your catalogue storefront works</p>
        </div>
        <span className="hidden size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs sm:flex">
          <Settings2 className="size-4" />
        </span>
      </header>

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 pb-16 md:px-8 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
        {isDefaultMastersView ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <SettingTile
              to={`${ROUTES.CHOME}/${ROUTES.CATA_SALE_SETTING}`}
              icon={<ShoppingCart />}
              label="Sales Setting"
              description="Discounts, invoice defaults & sales flow"
              badgeClass="bg-gradient-to-br from-primary/20 to-fuchsia-500/20 text-primary shadow-inner"
            />

            <SettingTile
              to={`${ROUTES.CHOME}/${ROUTES.CATA_BILL_SETTING}`}
              icon={<Receipt />}
              label="Bill Setting"
              description="Invoice format, printing & numbering"
              badgeClass="bg-gradient-to-br from-amber-500/25 to-orange-500/25 text-amber-600 shadow-inner dark:text-amber-400"
            />

            <SettingTile
              to={`${ROUTES.CHOME}/${ROUTES.CATA_ITEM_SETTING}`}
              icon={<Package />}
              label="Item Setting"
              description="Categories, units & stock rules"
              badgeClass="bg-gradient-to-br from-emerald-500/25 to-teal-500/25 text-emerald-600 shadow-inner dark:text-emerald-400"
            />

            <SettingTile
              to={`${ROUTES.CHOME}/${ROUTES.CATA_USER_SETTING}`}
              icon={<Users />}
              label="User Setting"
              description="Manage salesman & admin accounts"
              badgeClass="bg-gradient-to-br from-violet-500/25 to-fuchsia-500/25 text-violet-600 shadow-inner dark:text-violet-400"
            />

            <SettingTile
              to={`${ROUTES.CHOME}/${ROUTES.CATA_PERMISSION_SETTING}`}
              icon={<ShieldCheck />}
              label="Permission Setting"
              description="Control what your team can access"
              badgeClass="bg-gradient-to-br from-rose-500/25 to-pink-500/25 text-rose-600 shadow-inner dark:text-rose-400"
            />

            {currentUser?.role === ROLES.OWNER && (
              <SettingTile
                onClick={() => setShopHoursOpen(true)}
                icon={<Clock />}
                label="Shop Timing"
                description="Set your opening & closing hours"
                badgeClass="bg-gradient-to-br from-indigo-500/25 to-blue-500/25 text-indigo-600 shadow-inner dark:text-indigo-400"
              />
            )}
          </div>
        ) : (
          <div className="mt-2 flex min-h-[200px] items-center justify-center rounded-2xl border border-border bg-card p-6 shadow-sm">
            <Outlet />
          </div>
        )}
      </div>

      {/* Shop Hours Modal */}
      {shopHoursOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
          <div className="glass w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/25 to-blue-500/25 text-indigo-600 dark:text-indigo-400">
                  <Clock className="size-4" />
                </span>
                <h2 className="text-sm font-semibold text-foreground">Shop Timing</h2>
              </div>
              <button
                onClick={() => setShopHoursOpen(false)}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <ShopHoursSettingPage theme="orange" />
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogueMasters;
