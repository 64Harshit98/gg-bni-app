import { Suspense, useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase'; // adjust path if your db export differs
import { useAuth } from '../context/auth-context'; // adjust if your auth hook path/name differs
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../Components/ui/button';
import { navItems } from '../routes/bottomRoutes';
import { Sidebar, type QuickAction } from '../Components/layout/Sidebar';
import { Header } from '../Components/layout/Header';
import { ShoppingCart, PackagePlus, Plus, Scan, UserPlus, Receipt } from 'lucide-react';
import { FloatingButton } from '../Components/FloatingButton';
import { Spinner } from '../Components/ui/spinner';
import { ROUTES } from '../constants/routes.constants';
import { Permissions } from '../enums';
import ShowWrapper from '../context/ShowWrapper';
import { TutorialStep } from '../Components/TutorialStep';
import { ExpenseModal } from '../Components/ExpenseModal';
import { useExpenses } from '@/features/expenses';
import { useShopHours } from '../Pages/hooks/useShopHours'; // already exists
import { ROLES } from '../enums';
import ShopClosingReminderModal from '../Components/ShopClosingReminderModal';


const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tutorialStep, setTutorialStep] = useState(-1); // -1 = hidden by default
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
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
        const done = snap.exists() && snap.data()?.floatingTutorialDone;

        if (!done && window.innerWidth < 768) {
          setTutorialStep(0);
        }
      } catch (e) {
        console.error('Error fetching floating tutorial:', e);
        if (window.innerWidth < 768) setTutorialStep(0);
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

  const quickActions: QuickAction[] = [
    { key: 'sales', to: ROUTES.SALES, icon: <ShoppingCart className="size-4" />, label: 'Add Sales' },
    { key: 'purchase', to: ROUTES.PURCHASE, icon: <PackagePlus className="size-4" />, label: 'Add Purchase', permission: Permissions.CreatePurchase },
    { key: 'item', to: ROUTES.ITEM_ADD, icon: <Plus className="size-4" />, label: 'Add Item', permission: Permissions.ManageItems },
    { key: 'barcode', to: ROUTES.PRINTQR, icon: <Scan className="size-4" />, label: 'Add Barcode', permission: Permissions.PrintQR },
    { key: 'user', to: ROUTES.USER_ADD, icon: <UserPlus className="size-4" />, label: 'Add User', permission: Permissions.CreateUsers },
    { key: 'expense', icon: <Receipt className="size-4" />, label: 'Add Expense', permission: Permissions.ViewReports, onClick: () => setIsExpenseModalOpen(true) },
  ];

  const MobileActionButtons = () => (
    <>
      <Button variant="outline" className="w-full mb-2 rounded-sm bg-card" onClick={() => navigate(ROUTES.SALES)}>Add Sales</Button>
      <ShowWrapper requiredPermission={Permissions.CreatePurchase}>
        <Button variant="outline" className="w-full mb-2 rounded-sm bg-card" onClick={() => navigate(ROUTES.PURCHASE)}>Add Purchase</Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.ManageItems}>
        <Button variant="outline" className="w-full mb-2 rounded-sm bg-card" onClick={() => navigate(ROUTES.ITEM_ADD)}>Add Item</Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.PrintQR}>
        <Button variant="outline" className="w-full mb-2 rounded-sm bg-card" onClick={() => navigate(ROUTES.PRINTQR)}>Add Barcode</Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.CreateUsers}>
        <Button variant="outline" className="w-full mb-2 rounded-sm bg-card" onClick={() => navigate(ROUTES.USER_ADD)}>Add User</Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.ViewReports}>
        <Button variant="outline" className="w-full mb-2 rounded-sm bg-card" onClick={() => setIsExpenseModalOpen(true)}>Add Expense</Button>
      </ShowWrapper>
    </>
  );

  return (
    <div className="aurora relative h-dvh w-screen flex flex-col md:flex-row overflow-hidden bg-background">
      {/* NEW: Closing Reminder Modal */}
      {showReminder && shopSettings && (
        <ShopClosingReminderModal
          closeTime={shopSettings.closeTime}
          onConfirmClose={handleConfirmClose}
          onSnooze={handleSnooze}
        />
      )}
      {/* DESKTOP SIDEBAR */}
      <Sidebar
        navItems={navItems}
        quickActions={quickActions}
        userName={currentUser?.name}
        userRole={currentUser?.role}
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
        <Header navItems={navItems} userName={currentUser?.name} />
        <div ref={scrollRef} className="flex-1 overflow-y-auto pb-20 md:pb-4 scroll-smooth">
          <Suspense fallback={<div className="flex h-full w-full items-center justify-center py-20"><Spinner size="xl" /></div>}>
            <Outlet />
          </Suspense>
        </div>

        {/* FLOATING BUTTON (MOBILE ONLY) */}
        <div className="md:hidden absolute bottom-20 right-4 z-50">
          <TutorialStep
            step={0}
            currentStep={tutorialStep}
            text="Tap here to quickly add Sales, Purchase, Items and more!"
            onNext={handleTutorialNext}
            onSkip={handleTutorialSkip}
            isLast={true}
            position="top"
          >
            <FloatingButton className="">
              <MobileActionButtons />
            </FloatingButton>
          </TutorialStep>
        </div>
      </main>

      {/* MOBILE BOTTOM NAV */}
      <nav className="glass md:hidden fixed bottom-3 left-3 right-3 z-40 rounded-2xl shadow-lg shadow-black/10">
        <div className="flex justify-around items-center gap-1 px-2 py-2">
          {navItems.map(({ to, icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive: active }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 min-w-0 ${active ? 'bg-gradient-brand text-white shadow-md shadow-primary/25' : 'text-muted-foreground hover:bg-accent'
                }`
              }
            >
              <div className="flex-shrink-0 [&>svg]:size-5">{icon}</div>
              <span className="truncate">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <ExpenseModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onSave={data => addExpense(currentUser?.companyId!, data)}
      />
    </div>
  );
};

export default MainLayout;