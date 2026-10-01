import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase'; // adjust path if your db export differs
import { useAuth } from '../context/auth-context'; // adjust if your auth hook path/name differs
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../Components/ui/button';
import { Receipt, ShoppingCart, Package, ScanLine, UserPlus, Wallet, PackagePlus, Plus, Scan, Search } from 'lucide-react';
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
import PosCataSwitcher from '../Components/PosCataSwitcher';
import NotificationBell from '../Components/NotificationBell';
import { Sidebar, type QuickAction } from '../Components/layout/SideBar';
import { Header } from '../Components/layout/Header';
import { CommandPalette } from '../Components/layout/CommandPalette';
import { SubscriptionBanner, useSubscriptionBanner } from '../Components/layout/SubscriptionBanner';

const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tutorialStep, setTutorialStep] = useState(-1); // -1 = hidden by default

  // Dashboard tutorial step 1 (POS/Catalogue switcher)
  const [switcherStep, setSwitcherStep] = useState(-1);
  const isMobileView = window.innerWidth < 768;

  useEffect(() => {
    const onStepChange = (e: Event) => setSwitcherStep((e as CustomEvent).detail?.step ?? -1);
    window.addEventListener('tutorial_step_change', onStepChange);
    return () => window.removeEventListener('tutorial_step_change', onStepChange);
  }, []);

  const handleSwitcherNext = () => window.dispatchEvent(new Event('tutorial_switcher_next'));
  const handleSwitcherSkip = () => window.dispatchEvent(new Event('tutorial_switcher_skip'));

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const { currentUser } = useAuth();
  const banner = useSubscriptionBanner();
const showBanner = banner.visible && location.pathname === ROUTES.HOME;
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

    checkTutorial();
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
  const fabIconBadgeClass = 'w-10 h-10 rounded-sm bg-[#e6eeff] text-[#155dfc] flex items-center justify-center';
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
    `flex-1 flex flex-col items-center justify-center gap-1 py-1 text-sm transition-colors duration-200 min-w-0 ${isActive(path) ? 'text-sky-500' : 'text-gray-500'
    }`;

  const renderMobileNavLink = ({ to, icon, label, permission }: { to: string; icon: ReactNode; label: string; permission?: Permissions }) => {
    const link = (
      <Link
        key={to}
        to={to}
        className={mobileNavLinkClass(to)}
      >
        <div className="flex-shrink-0">{icon}</div>
        <span className="font-medium truncate text-[10px] sm:text-xs">{label}</span>
      </Link>
    );
    return permission ? (
      <ShowWrapper key={to} requiredPermission={permission} mode="disable">
        {link}
      </ShowWrapper>
    ) : link;
  };

  // Desktop sidebar quick actions
  const quickActions: QuickAction[] = [
    { key: 'sales', to: ROUTES.SALES, icon: <ShoppingCart className="size-4" />, label: 'Add Sales', permission: Permissions.CreateSales },
    { key: 'purchase', to: ROUTES.PURCHASE, icon: <PackagePlus className="size-4" />, label: 'Add Purchase', permission: Permissions.CreatePurchase },
    { key: 'item', to: ROUTES.ITEM_ADD, icon: <Plus className="size-4" />, label: 'Add Item', permission: Permissions.ManageItems },
    { key: 'barcode', to: ROUTES.PRINTQR, icon: <Scan className="size-4" />, label: 'Add Barcode', permission: Permissions.PrintQR },
    { key: 'user', icon: <UserPlus className="size-4" />, label: 'Add User', permission: Permissions.CreateUsers, onClick: () => setIsAddUserModalOpen(true) },
    { key: 'expense', icon: <Receipt className="size-4" />, label: 'Add Expense', permission: Permissions.ViewReports, onClick: () => setIsExpenseModalOpen(true) },
  ];

  return (
    <div className="relative h-dvh w-screen flex flex-col md:flex-row overflow-hidden bg-white">
      {/* Closing Reminder Modal */}
      {showReminder && shopSettings && (
        <ShopClosingReminderModal
          closeTime={shopSettings.closeTime}
          onConfirmClose={handleConfirmClose}
          onSnooze={handleSnooze}
        />
      )}

      {/* MOBILE HEADER (unchanged) */}
      <header className="md:hidden relative flex items-center justify-between px-3 py-2 bg-white border-b border-slate-200 z-[150]">
        <TutorialStep
          step={1}
          currentStep={isMobileView ? switcherStep : -1}
          text="Use this menu to switch between POS and Catalogue views."
          onNext={handleSwitcherNext}
          onSkip={handleSwitcherSkip}
          mobileArrowAlign="left"
        >
          <div>
            <PosCataSwitcher current="POS" />
          </div>
        </TutorialStep>
        <img
          src={sellarLogo}
          alt="Sellar Logo"
          className="h-6 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Search"
            onClick={() => setIsMobileSearchOpen(true)}
            className="flex size-9 items-center justify-center rounded-sm text-slate-600 transition-colors active:bg-slate-100"
          >
            <Search size={20} />
          </button>
          <ShowWrapper requiredPermission={Permissions.HiddenProFeatures}>
            <NotificationBell />
          </ShowWrapper>
        </div>
      </header>
      {showBanner && <SubscriptionBanner variant="mobile" days={banner.days!} urgent={banner.urgent} />}

      {/* DESKTOP SIDEBAR (new) */}
      <Sidebar
        navItems={navItems}
        quickActions={quickActions}
        userName={currentUser?.name}
        userRole={currentUser?.role}
        switcher={
          <TutorialStep
            step={1}
            currentStep={!isMobileView ? switcherStep : -1}
            text="Use this menu to switch between POS and Catalogue views."
            onNext={handleSwitcherNext}
            onSkip={handleSwitcherSkip}
          >
            <div>
              <PosCataSwitcher current="POS" showCompany />
            </div>
          </TutorialStep>
        }
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
        {/* DESKTOP TOP BAR + SEARCH (new) — renders on every page */}
        <Header navItems={navItems} userName={currentUser?.name} joinedBelow={showBanner} />
{showBanner && <SubscriptionBanner variant="desktop" days={banner.days!} urgent={banner.urgent} />}

        <div ref={scrollRef} className="flex-1 overflow-y-auto pb-16 md:pb-4 scroll-smooth">
          <Suspense fallback={<div>Loading...</div>}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* MOBILE BOTTOM NAV (unchanged) */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white z-40">
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
                <FloatingButton className="static">
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
        currentUserName={currentUser?.name || 'Unknown'}
      />
      <AddUserModal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
      />
      <CommandPalette open={isMobileSearchOpen} onOpenChange={setIsMobileSearchOpen} />
    </div>
  );
};

export default MainLayout;