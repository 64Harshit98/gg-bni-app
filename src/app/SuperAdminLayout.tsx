import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutGrid, Building2, LineChart, MessageSquare, Ticket,
  Users, Tag, MessageCircle, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/auth-context';
import { ROUTES } from '../constants/routes.constants';
import { isSuperAdmin } from '../constants/superAdmin';
import Loading from '../Pages/Loading/Loading';
import { companyStatus, loadCompanies, loadTicketSummary } from '../Pages/Account/superAdmin/data';

const NAV_ITEMS = [
  { label: 'Dashboard', to: ROUTES.SUPER_ADMINHUB, icon: LayoutGrid, end: true },
  { label: 'Companies', to: ROUTES.SUPER_ADMIN, icon: Building2 },
  { label: 'App Leads', to: ROUTES.APP_LEADS, icon: LineChart },
  { label: 'Web Queries', to: ROUTES.WEBSITE_QUERY, icon: MessageSquare },
  { label: 'Support Tickets', to: ROUTES.SUPPORT_TICKET, icon: Ticket },
  { label: 'Agents & Partners', to: ROUTES.AGENT_DASHBOARD, icon: Users },
  { label: 'Coupon Codes', to: ROUTES.SUPER_ADMIN_COUPONS, icon: Tag },
  { label: 'WhatsApp Config', to: ROUTES.SUPER_ADMIN_WHATSAPP, icon: MessageCircle },
];

// Shell + access guard for every super-admin page. Pages rendered inside
// this layout can assume a signed-in super admin.
const SuperAdminLayout: React.FC = () => {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [badges, setBadges] = useState<Record<string, number>>({});

  // Close the mobile drawer after navigating.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Sidebar counts; the loaders are cached so this doesn't refetch on every page.
  const isAdmin = !!currentUser && isSuperAdmin(currentUser.uid);
  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([loadCompanies(), loadTicketSummary()]).then(([companies, tickets]) => {
      setBadges({
        [ROUTES.SUPER_ADMIN]: companies.filter(c => !c.isTestAccount && companyStatus(c) === 'expiring').length,
        [ROUTES.SUPPORT_TICKET]: tickets.open,
      });
    }).catch(err => console.error('Sidebar badge load failed:', err));
  }, [isAdmin, location.pathname]);

  if (loading) return <Loading />;

  if (!currentUser || !isSuperAdmin(currentUser.uid)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="text-5xl mb-3">⛔</div>
          <p className="text-red-500 font-bold text-xl">ACCESS DENIED</p>
        </div>
      </div>
    );
  }

  const initial = (currentUser.name || 'A').trim().charAt(0).toUpperCase();

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-5 pt-6 pb-5">
        <p className="text-2xl font-semibold tracking-wide text-blue-600 leading-none">SELLAR</p>
        <p className="text-[11px] font-semibold tracking-[0.15em] text-gray-500 mt-1">SUPER ADMIN</p>
      </div>

      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ label, to, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100'}`
            }
          >
            <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={1.8} />
            <span className="truncate flex-1">{label}</span>
            {!!badges[to] && (
              <span className={`text-[11px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center ${to === ROUTES.SUPPORT_TICKET ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                {badges[to]}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="m-3 p-3 rounded-lg bg-gray-50 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold shrink-0">
          {initial}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{currentUser.name || 'Admin'}</p>
          <p className="text-xs text-gray-500">Super admin</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 md:flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-60 shrink-0 bg-white border-r border-gray-200 sticky top-0 h-screen">
        {sidebar}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-white border-b border-gray-200 px-4 h-14">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-1.5 -ml-1.5 rounded-md text-gray-600 hover:bg-gray-100"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <p className="text-lg font-semibold tracking-wide text-blue-600">SELLAR</p>
        <p className="text-[10px] font-semibold tracking-[0.15em] text-gray-500 mt-0.5">SUPER ADMIN</p>
      </div>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button
              onClick={() => setDrawerOpen(false)}
              className="absolute top-4 right-3 p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
};

export default SuperAdminLayout;
