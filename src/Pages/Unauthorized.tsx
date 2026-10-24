import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ChevronRight,
  CircleUser,
  ClipboardList,
  FileText,
  FolderTree,
  House,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  Lock,
  LogOut,
  Package,
  PackagePlus,
  QrCode,
  ReceiptText,
  Redo2,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tag,
  TrendingUp,
  Undo2,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { Permissions, PLANS } from '../enums';
import { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';
import { ROUTES } from '../constants/routes.constants';
import { logoutUser } from '../lib/AuthOperations';
import StatusShell, { RISE, STATUS_THEMES, StatusMark, riseDelay, statusButton, type StatusTone } from '../Components/StatusShell';

// IconChip tones: sales blue, received/reports green, unpaid amber, people magenta, expenses red.
const CHIP = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  magenta: 'bg-pink-50 text-pink-600',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
} as const;

interface PageLink<P> {
  title: string;
  description: string;
  path: string;
  icon: LucideIcon;
  chip: keyof typeof CHIP;
  /** null = open to everyone signed in. */
  permission: P | null;
}

interface PageGroup<P> {
  title: string;
  pages: PageLink<P>[];
}

const C = (segment: string) => `${ROUTES.CHOME}/${segment}`;

const POS_PAGES: PageGroup<Permissions>[] = [
  {
    title: 'Daily work',
    pages: [
      { title: 'Home', description: "Today's sales, dues and activity", path: ROUTES.HOME, icon: LayoutDashboard, chip: 'blue', permission: Permissions.ViewDashboard },
      { title: 'Transactions', description: 'Every bill, return and payment', path: ROUTES.JOURNAL, icon: ReceiptText, chip: 'blue', permission: Permissions.ViewTransactions },
      { title: 'New sale', description: 'Make a bill for a customer', path: ROUTES.SALES, icon: ShoppingCart, chip: 'blue', permission: Permissions.CreateSales },
      { title: 'Sales return', description: 'Take items back on a bill', path: ROUTES.SALES_RETURN, icon: Undo2, chip: 'amber', permission: Permissions.CreateSalesReturn },
      { title: 'New purchase', description: 'Record a supplier bill', path: ROUTES.PURCHASE, icon: PackagePlus, chip: 'green', permission: Permissions.CreatePurchase },
      { title: 'Purchase return', description: 'Send items back to a supplier', path: ROUTES.PURCHASE_RETURN, icon: Redo2, chip: 'amber', permission: Permissions.CreatePurchaseReturn },
      { title: 'Payment QR', description: 'Show or print your UPI QR', path: ROUTES.PRINTQR, icon: QrCode, chip: 'green', permission: Permissions.PrintQR },
    ],
  },
  {
    title: 'Items',
    pages: [
      { title: 'Add item', description: 'Add a product to your stock', path: ROUTES.ITEM_ADD, icon: Package, chip: 'blue', permission: Permissions.ManageItems },
      { title: 'Item groups', description: 'Sort items into groups', path: ROUTES.ITEM_GROUP, icon: FolderTree, chip: 'blue', permission: Permissions.ManageItemGroup },
      { title: 'Manage items', description: 'Edit prices and stock together', path: ROUTES.MANAGE_ITEMS, icon: Tag, chip: 'blue', permission: Permissions.ManageItemGroup },
    ],
  },
  {
    title: 'Reports',
    pages: [
      { title: 'Reports', description: 'All reports in one place', path: ROUTES.REPORTS, icon: BarChart3, chip: 'green', permission: Permissions.ViewReports },
      { title: 'Sales report', description: 'Bills, payment modes, daily sales', path: ROUTES.SALES_REPORT, icon: FileText, chip: 'blue', permission: Permissions.ViewSalesReport },
      { title: 'Purchase report', description: 'Supplier bills, dues, GST input', path: ROUTES.PURCHASE_REPORT, icon: Package, chip: 'green', permission: Permissions.ViewPurchaseReport },
      { title: 'P&L report', description: 'Profit after cost and expenses', path: ROUTES.PNL_REPORT, icon: TrendingUp, chip: 'green', permission: Permissions.ViewPNLReport },
      { title: 'Item reports', description: 'Best sellers, slow movers, stock value', path: ROUTES.ITEM_REPORTS, icon: Tag, chip: 'blue', permission: Permissions.ViewItemReport },
    ],
  },
  {
    title: 'Team & account',
    pages: [
      { title: 'Add team member', description: 'Give staff their own login', path: ROUTES.USER_ADD, icon: UserPlus, chip: 'magenta', permission: Permissions.CreateUsers },
      { title: 'Permissions', description: 'Choose what each role can open', path: ROUTES.PERMSETTING, icon: ShieldCheck, chip: 'magenta', permission: Permissions.SetPermissions },
      { title: 'Account', description: 'Your profile, plan and settings', path: ROUTES.ACCOUNT, icon: CircleUser, chip: 'magenta', permission: Permissions.ViewAccount },
      { title: 'Help & support', description: 'Guides, and a way to reach us', path: ROUTES.SUPPORT_PAGE, icon: LifeBuoy, chip: 'slate', permission: null },
    ],
  },
];

const CATALOGUE_PAGES: PageGroup<Cata_Permissions>[] = [
  {
    title: 'Orders',
    pages: [
      { title: 'Home', description: 'Orders, sales and top items', path: ROUTES.CHOME, icon: LayoutDashboard, chip: 'blue', permission: Cata_Permissions.ViewCatalogueDashboard },
      { title: 'Orders', description: 'Confirm, pack and deliver', path: C(ROUTES.ORDER), icon: ClipboardList, chip: 'blue', permission: Cata_Permissions.ViewShop },
      { title: 'Requests', description: 'New orders waiting for you', path: C(ROUTES.CATA_REQUEST), icon: Inbox, chip: 'amber', permission: Cata_Permissions.ViewCatalogueRequests },
      { title: 'Order returns', description: 'Items customers sent back', path: C(ROUTES.ORDER_RETURN), icon: Undo2, chip: 'amber', permission: Cata_Permissions.ViewOrdersReturn },
    ],
  },
  {
    title: 'Items & store',
    pages: [
      { title: 'Add product', description: 'Put a new product in your catalogue', path: C(ROUTES.ADD_PRODUCT), icon: Package, chip: 'blue', permission: Cata_Permissions.ManageItems },
      { title: 'Item groups', description: 'Sort products into groups', path: C(ROUTES.CAT_ITEM_GROUP), icon: FolderTree, chip: 'blue', permission: Cata_Permissions.ManageItems },
      { title: 'Store page', description: 'What customers see first', path: C(ROUTES.CATA_STORE_PAGE), icon: Store, chip: 'magenta', permission: Cata_Permissions.ManageEditProfile },
    ],
  },
  {
    title: 'Reports',
    pages: [
      { title: 'Reports', description: 'All catalogue reports', path: C(ROUTES.CATALOGUE_REPORTS), icon: BarChart3, chip: 'green', permission: Cata_Permissions.ViewReports },
      { title: 'Sales report', description: 'Orders and payments by day', path: C(ROUTES.CATALOGUE_SALES), icon: FileText, chip: 'blue', permission: Cata_Permissions.ViewSalesReport },
      { title: 'Party ledger', description: "Every party's balance and entries", path: C(ROUTES.CATALOGUE_PARTY_LEDGER), icon: BookOpen, chip: 'amber', permission: Cata_Permissions.ViewPartyLedger },
      { title: 'Expense report', description: 'Rent, salary and other spending', path: C(ROUTES.CATALOGUE_EXPENSE_REPORT), icon: Wallet, chip: 'red', permission: Cata_Permissions.ViewExpenseReport },
    ],
  },
  {
    title: 'Team & account',
    pages: [
      { title: 'Permissions', description: 'Choose what each role can open', path: C(ROUTES.CATA_PERMISSION_SETTING), icon: ShieldCheck, chip: 'magenta', permission: Cata_Permissions.ManagePermissions },
      { title: 'Account', description: 'Your profile, plan and settings', path: `/${ROUTES.CATALOGUE_ACCOUNTS}`, icon: CircleUser, chip: 'magenta', permission: Cata_Permissions.ViewCatalogueAccounts },
      { title: 'Help & support', description: 'Guides, and a way to reach us', path: C(ROUTES.CATA_SUPPORT), icon: LifeBuoy, chip: 'slate', permission: null },
    ],
  },
];

const ALL_PAGES = [...POS_PAGES, ...CATALOGUE_PAGES].flatMap<PageLink<unknown>>((g) => g.pages);

const initials = (name?: string) =>
  (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

const UnauthorizedPage: React.FC = () => {
  const { currentUser, hasPermission, hasCataloguePermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const path = location.pathname.replace(/\/+$/, '') || '/';
  const isCatalogueOnly = currentUser?.plan === PLANS.CATALOGUE_PRO || currentUser?.plan === PLANS.CALC_CATALOG;
  const inCatalogue =
    isCatalogueOnly || path.startsWith(ROUTES.CHOME) || path === `/${ROUTES.CATALOGUE_ACCOUNTS}`;
  const tone: StatusTone = inCatalogue ? 'catalogue' : 'pos';
  const theme = STATUS_THEMES[tone];

  // Name the page they tried to open, if we know it.
  const requested =
    path === ROUTES.UNAUTHORIZED ? null : (ALL_PAGES.find((p) => p.path === path)?.title ?? path);

  // Only pages this user can open, minus the one that just refused them.
  const allowed: PageGroup<unknown>[] = inCatalogue
    ? CATALOGUE_PAGES.map((g) => ({
        title: g.title,
        pages: g.pages.filter((p) => p.permission === null || hasCataloguePermission(p.permission)),
      }))
    : POS_PAGES.map((g) => ({
        title: g.title,
        pages: g.pages.filter((p) => p.permission === null || hasPermission(p.permission)),
      }));
  const groups = allowed
    .map((g) => ({ ...g, pages: g.pages.filter((p) => p.path !== path) }))
    .filter((g) => g.pages.length > 0);

  const openCount = groups.reduce((sum, g) => sum + g.pages.length, 0);
  const allPages = groups.flatMap((g) => g.pages);
  const homePath = inCatalogue ? ROUTES.CHOME : ROUTES.HOME;
  const homeLink = allPages.find((p) => p.path === homePath) ?? allPages.find((p) => p.permission !== null) ?? allPages[0];

  const canSetPermissions = inCatalogue
    ? hasCataloguePermission(Cata_Permissions.ManagePermissions)
    : hasPermission(Permissions.SetPermissions);
  const permissionsPath = inCatalogue ? C(ROUTES.CATA_PERMISSION_SETTING) : ROUTES.PERMSETTING;

  const handleSignOut = async () => {
    try {
      await logoutUser();
      navigate(ROUTES.LANDING, { replace: true });
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  let step = 0;

  return (
    <StatusShell
      tone={tone}
      aside={
        <>
          {currentUser && (
            <span className="hidden min-w-0 items-center gap-2 sm:flex">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-pink-50 text-xs font-semibold text-pink-700">
                {initials(currentUser.name)}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-sm font-medium text-slate-900">{currentUser.name}</span>
                <span className="block text-[11px] text-slate-500">{currentUser.role}</span>
              </span>
            </span>
          )}
          <button type="button" onClick={handleSignOut} className={`${statusButton(tone, 'ghost')} h-9 px-3`}>
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </>
      }
    >
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12 md:px-6 md:py-14">
        {/* Why, and what to do */}
        <section className="md:sticky md:top-24 md:self-start">
          <div className={RISE} style={riseDelay(step++)}>
            <StatusMark icon={Lock} tone="amber" />
          </div>
          <p className={`mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${RISE}`} style={riseDelay(step++)}>
            Access denied
          </p>
          <h1
            className={`mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 md:text-[28px] md:leading-tight ${RISE}`}
            style={riseDelay(step++)}
          >
            You don't have access to this page
          </h1>
          <p className={`mt-3 max-w-[46ch] text-sm leading-relaxed text-slate-600 md:text-base ${RISE}`} style={riseDelay(step++)}>
            {canSetPermissions
              ? 'Your role doesn’t have this page turned on. You can change that in Permissions.'
              : 'Your role doesn’t have this page turned on. Ask your shop owner to turn it on for you in Permissions.'}
          </p>

          {requested && (
            <div className={`mt-4 flex flex-wrap items-center gap-2 text-xs ${RISE}`} style={riseDelay(step++)}>
              <span className="text-slate-500">You tried to open</span>
              <span className={`max-w-full truncate rounded-sm px-2 py-1 font-medium ${theme.soft}`}>{requested}</span>
            </div>
          )}

          <div className={`mt-7 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center ${RISE}`} style={riseDelay(step++)}>
            {homeLink && (
              <Link to={homeLink.path} className={`${statusButton(tone, 'primary')} w-full sm:w-auto`}>
                <House size={16} aria-hidden="true" />
                {homeLink.path === homePath ? 'Go to home' : `Open ${homeLink.title.toLowerCase()}`}
              </Link>
            )}
            {canSetPermissions ? (
              <Link to={permissionsPath} className={`${statusButton(tone, 'secondary')} w-full sm:w-auto`}>
                <ShieldCheck size={16} aria-hidden="true" />
                Open permissions
              </Link>
            ) : (
              location.key !== 'default' && (
                <button type="button" onClick={() => navigate(-1)} className={`${statusButton(tone, 'secondary')} w-full sm:w-auto`}>
                  <ArrowLeft size={16} aria-hidden="true" />
                  Go back
                </button>
              )
            )}
          </div>
        </section>

        {/* Pages they can open */}
        <section aria-labelledby="open-pages">
          <div className={`mb-3 flex items-baseline gap-2 ${RISE}`} style={riseDelay(2)}>
            <h2 id="open-pages" className="text-base font-semibold text-slate-900">
              Pages you can open
            </h2>
            {openCount > 0 && (
              <span className="text-xs text-slate-500">
                {openCount} {openCount === 1 ? 'page' : 'pages'}
              </span>
            )}
          </div>

          {openCount === 0 ? (
            <div className={`flex flex-col items-center rounded-sm border bg-white px-6 py-10 text-center ${theme.line} ${theme.card} ${RISE}`} style={riseDelay(3)}>
              <Lock size={28} strokeWidth={1.75} className="text-slate-400" aria-hidden="true" />
              <strong className="mt-3 text-sm font-semibold text-slate-900">No pages are turned on for you yet</strong>
              <p className="mt-1 max-w-[36ch] text-xs leading-relaxed text-slate-500">
                Ask your shop owner to give your role at least one page in Permissions.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map((group, gi) => (
                <div key={group.title}>
                  <h3
                    className={`mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${RISE}`}
                    style={riseDelay(3 + gi)}
                  >
                    {group.title}
                  </h3>
                  <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    {group.pages.map((page, pi) => {
                      const Icon = page.icon;
                      return (
                        <li key={page.path} className={RISE} style={riseDelay(4 + gi + pi)}>
                          <Link
                            to={page.path}
                            className={`group flex h-full items-center gap-3 rounded-sm border bg-white p-3.5 no-underline transition hover:-translate-y-px hover:border-slate-300 active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 ${theme.line} ${theme.card} ${theme.secondaryBtn}`}
                          >
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${CHIP[page.chip]}`}>
                              <Icon size={18} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-900">{page.title}</span>
                              <span className="block truncate text-xs text-slate-500">{page.description}</span>
                            </span>
                            <ChevronRight
                              size={16}
                              className="shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600"
                              aria-hidden="true"
                            />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </StatusShell>
  );
};

export default UnauthorizedPage;
