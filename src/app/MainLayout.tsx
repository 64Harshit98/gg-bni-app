import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase'; // adjust path if your db export differs
import { useAuth } from '../context/auth-context'; // adjust if your auth hook path/name differs
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../Components/ui/button';
import { Receipt, ShoppingCart, Package, ScanLine, UserPlus, Wallet } from 'lucide-react';
import { navItems, mobileNavItems } from '../routes/bottomRoutes';
import { FloatingButton } from '../Components/FloatingButton';
import { ROUTES } from '../constants/routes.constants';
import { Permissions } from '../enums';
import ShowWrapper from '../context/ShowWrapper';
import sellarLogo from '../assets/sellar-logo-heading.png';
import { TutorialStep } from '../Components/TutorialStep';
import { ExpenseModal } from '../Components/ExpenseModal';
import { AddUserModal } from '../Components/AddUserModal';
import { useExpenses } from '../Pages/Reports/ExpenseReport/useExpense';
import { useShopHours } from '../Pages/hooks/useShopHours'; // already exists
import { ROLES } from '../enums';
import ShopClosingReminderModal from '../Components/ShopClosingReminderModal';


const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tutorialStep, setTutorialStep] = useState(-1); // -1 = hidden by default
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const { currentUser } = useAuth();
  const { addExpense } = useExpenses(currentUser?.companyId, 'pos');

  const { settings: shopSettings, isClosingSoon, shouldAutoClose, needsReset } = useShopHours(currentUser?.companyId);
  const isOwner =
    !!currentUser &&
    currentUser.companyId !== 'PARTNER_ACCOUNT' &&
    currentUser.role !== ROLES.SALESMAN &&
    currentUser.role !== ROLES.MANAGER;

  const [reminderDismissed, setReminderDismissed] = useState(false);

  const showReminder = isOwner && isClosingSoon && !reminderDismissed;

  // 1hr grace period after closing time expired with no owner action -> force-close for real.
  useEffect(() => {
    if (isOwner && shouldAutoClose && currentUser?.companyId) {
      const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'shop-hours');
      setDoc(ref, { forceClosed: true, snoozeUntil: null }, { merge: true }).catch((err) =>
        console.error('Failed to auto-close shop', err)
      );
    }
  }, [isOwner, shouldAutoClose, currentUser?.companyId]);

  // Back before today's closing time -> clear yesterday's close/snooze flags for a fresh cycle.
  useEffect(() => {
    if (isOwner && needsReset && currentUser?.companyId) {
      const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'shop-hours');
      setDoc(ref, { forceClosed: false, snoozeUntil: null }, { merge: true }).catch((err) =>
        console.error('Failed to reset shop-hours overrides', err)
      );
      setReminderDismissed(false);
    }
  }, [isOwner, needsReset, currentUser?.companyId]);

  const handleConfirmClose = async () => {
    if (currentUser?.companyId) {
      const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'shop-hours');
      await setDoc(ref, { forceClosed: true, snoozeUntil: null }, { merge: true });
    }
    setReminderDismissed(true);
  };

  const handleSnooze = async () => {
    if (currentUser?.companyId) {
      const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'shop-hours');
      await setDoc(ref, { snoozeUntil: Date.now() + 15 * 60 * 1000 }, { merge: true }); // 15 minutes
    }
  };

  useEffect(() => {
    const checkTutorial = async () => {
      if (!currentUser?.companyId) return;

      try {
        const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial');
        const snap = await getDoc(ref);
        const settings = snap.exists() ? snap.data() : {};
        const dashboardDone = !!settings?.dashboardTutorialDone;
        const floatingDone = !!settings?.floatingTutorialDone;

        // Wait for the dashboard tutorial to finish before showing the floating one
        if (dashboardDone && !floatingDone && window.innerWidth < 768) {
          setTutorialStep(0);
        }
      } catch (e) {
        console.error('Error fetching floating tutorial:', e);
        // don't force-show on error — avoids overlapping with dashboard tutorial
      }
    };

    // run once when user is available
    checkTutorial();

    // keep listening for dashboard completion
    window.addEventListener("dashboard_tutorial_done", checkTutorial);

    return () => window.removeEventListener("dashboard_tutorial_done", checkTutorial);
  }, [currentUser]);

  const saveFloatingDone = async () => {
    if (!currentUser?.companyId) return;
    try {
      await setDoc(
        doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial'),
        { floatingTutorialDone: true },
        { merge: true }
      );
    } catch (e) {
      console.error('Error saving floating tutorial:', e);
    }
  };

  const handleTutorialNext = async () => {
    await saveFloatingDone();
    setTutorialStep(-1);
  };

  const handleTutorialSkip = async () => {
    await saveFloatingDone();
    setTutorialStep(-1);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo(0, 0);
    }
  }, [location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const fabActionClass = 'w-full mb-2 rounded-sm bg-white shadow-sm';
  const fabIconBadgeClass = 'w-10 h-10 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center';
  const fabLabelClass = 'text-[11px] font-medium text-gray-700';

  const MobileActionButtons = () => (
    <>
      <ShowWrapper requiredPermission={Permissions.CreateSales}>
        <Button variant="outline" className={fabActionClass} onClick={() => navigate(ROUTES.SALES)}>
          <span className={fabIconBadgeClass}><Receipt size={18} /></span>
          <span className={fabLabelClass}>Sales</span>
        </Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.CreatePurchase}>
        <Button variant="outline" className={fabActionClass} onClick={() => navigate(ROUTES.PURCHASE)}>
          <span className={fabIconBadgeClass}><ShoppingCart size={18} /></span>
          <span className={fabLabelClass}>Purchase</span>
        </Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.ManageItems}>
        <Button variant="outline" className={fabActionClass} onClick={() => navigate(ROUTES.ITEM_ADD)}>
          <span className={fabIconBadgeClass}><Package size={18} /></span>
          <span className={fabLabelClass}>Item</span>
        </Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.PrintQR}>
        <Button variant="outline" className={fabActionClass} onClick={() => navigate(ROUTES.PRINTQR)}>
          <span className={fabIconBadgeClass}><ScanLine size={18} /></span>
          <span className={fabLabelClass}>Barcode</span>
        </Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.CreateUsers}>
        <Button variant="outline" className={fabActionClass} onClick={() => setIsAddUserModalOpen(true)}>
          <span className={fabIconBadgeClass}><UserPlus size={18} /></span>
          <span className={fabLabelClass}>User</span>
        </Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.ViewReports}>
        <Button variant="outline" className={fabActionClass} onClick={() => setIsExpenseModalOpen(true)}>
          <span className={fabIconBadgeClass}><Wallet size={18} /></span>
          <span className={fabLabelClass}>Expense</span>
        </Button>
      </ShowWrapper>
    </>
  );

  const mobileNavLinkClass = (path: string) =>
    `flex-1 flex flex-col items-center justify-center gap-1  rounded-sm text-sm transition-colors border border-[rgba(0,0,0,0.15)] duration-200 min-w-0 ${isActive(path) ? 'bg-sky-500 text-white' : 'text-black-500 hover:bg-gray-100'
    }`;

  const renderMobileNavLink = ({ to, icon, label, permission }: { to: string; icon: ReactNode; label: string; permission?: Permissions }) => {
    const link = (
      <Link key={to} to={to} className={mobileNavLinkClass(to)}>
        <div className="flex-shrink-0">{icon}</div>
        <span className="font-medium truncate text-[10px] sm:text-xs">{label}</span>
      </Link>
    );
    return permission ? <ShowWrapper key={to} requiredPermission={permission}>{link}</ShowWrapper> : link;
  };

  const sidebarLinkClass = (path: string) =>
    `flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-medium transition-all ${isActive(path)
      ? 'bg-sky-50 text-sky-600 shadow-sm border border-sky-100'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
    }`;

  return (
    <div className="h-dvh w-screen flex flex-col md:flex-row overflow-hidden bg-gray-100">
      {/* NEW: Closing Reminder Modal */}
      {showReminder && shopSettings && (
        <ShopClosingReminderModal
          closeTime={shopSettings.closeTime}
          onConfirmClose={handleConfirmClose}
          onSnooze={handleSnooze}
        />
      )}
      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex flex-col w-48 bg-white border-r border-slate-200 h-full flex-shrink-0 z-20">
        <div className="p-6 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-800">
            <img src={sellarLogo} alt="Sellar Logo" className="w-48" />
          </h1>
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map(({ to, icon, label }) => (
            <Link key={to} to={to} className={sidebarLinkClass(to)}>
              <span className="text-lg">{icon}</span>
              <span>{label}</span>
            </Link>
          ))}
          <div className="pt-4 pb-2">
            <div className="border-t border-slate-200" />
            <p className="px-4 pt-4 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Actions</p>
          </div>
          <ShowWrapper requiredPermission={Permissions.CreateSales}>
            <Link to={ROUTES.SALES} className={sidebarLinkClass(ROUTES.SALES)}><span className="text-lg">+</span><span>Add Sales</span></Link>
          </ShowWrapper>
          <ShowWrapper requiredPermission={Permissions.CreatePurchase}>
            <Link to={ROUTES.PURCHASE} className={sidebarLinkClass(ROUTES.PURCHASE)}><span className="text-lg">+</span><span>Add Purchase</span></Link>
          </ShowWrapper>
          <ShowWrapper requiredPermission={Permissions.ManageItems}>
            <Link to={ROUTES.ITEM_ADD} className={sidebarLinkClass(ROUTES.ITEM_ADD)}><span className="text-lg">+</span><span>Add Item</span></Link>
          </ShowWrapper>
          <ShowWrapper requiredPermission={Permissions.PrintQR}>
            <Link to={ROUTES.PRINTQR} className={sidebarLinkClass(ROUTES.PRINTQR)}><span className="text-lg">+</span><span>Add Barcode</span></Link>
          </ShowWrapper>
          <ShowWrapper requiredPermission={Permissions.CreateUsers}>
            <button onClick={() => setIsAddUserModalOpen(true)} className={sidebarLinkClass('')}><span className="text-lg">+</span><span>Add User</span></button>
          </ShowWrapper>
          <ShowWrapper requiredPermission={Permissions.ViewReports}>
            <button onClick={() => setIsExpenseModalOpen(true)} className={sidebarLinkClass('')}><span className="text-lg">+</span><span>Add Expense</span></button>
          </ShowWrapper>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto pb-20 md:pb-4 scroll-smooth">
          <Suspense fallback={<div>Loading...</div>}>
            <Outlet />
          </Suspense>
        </div>

      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full border-t border-slate-200 bg-white z-40">
        <div className="flex justify-around items-center gap-2 px-2 pt-2 pb-3">
          {mobileNavItems.slice(0, 2).map((item) => renderMobileNavLink(item))}

          <div className="flex-1 flex justify-center">
            <div className="-mt-7">
              <TutorialStep
                step={0}
                currentStep={tutorialStep}
                text="Tap here to quickly add Sales, Purchase, Items and more!"
                onNext={handleTutorialNext}
                onSkip={handleTutorialSkip}
                isLast={true}
                position="top"
              >
                <FloatingButton className="static shadow-lg">
                  <MobileActionButtons />
                </FloatingButton>
              </TutorialStep>
            </div>
          </div>

          {mobileNavItems.slice(2).map((item) => renderMobileNavLink(item))}
        </div>
      </nav>
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSave={data => addExpense(currentUser?.companyId!, data)}
      />
      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
      />
    </div>
  );
};

export default MainLayout;