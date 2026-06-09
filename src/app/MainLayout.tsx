import { Suspense, useEffect, useRef, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase'; // adjust path if your db export differs
import { useAuth } from '../context/auth-context'; // adjust if your auth hook path/name differs
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../Components/ui/button';
import { navItems } from '../routes/bottomRoutes';
import { FloatingButton } from '../Components/FloatingButton';
import { ROUTES } from '../constants/routes.constants';
import { Permissions } from '../enums';
import ShowWrapper from '../context/ShowWrapper';
import sellarLogo from '../assets/sellar-logo-heading.png';
import { TutorialStep } from '../Components/TutorialStep';
import { ExpenseModal } from '../Components/ExpenseModal';
import { useExpenses } from '../Pages/Reports/ExpenseReport/useExpense';

const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [tutorialStep, setTutorialStep] = useState(-1); // -1 = hidden by default
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const { currentUser } = useAuth();
  const { addExpense } = useExpenses(currentUser?.companyId, 'pos');

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

  const isActive = (path: string) => location.pathname === path;

  const MobileActionButtons = () => (
    <>
      <Button variant="outline" className="w-full mb-2 rounded-sm bg-white" onClick={() => navigate(ROUTES.SALES)}>Add Sales</Button>
      <ShowWrapper requiredPermission={Permissions.CreatePurchase}>
        <Button variant="outline" className="w-full mb-2 rounded-sm bg-white" onClick={() => navigate(ROUTES.PURCHASE)}>Add Purchase</Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.ManageItems}>
        <Button variant="outline" className="w-full mb-2 rounded-sm bg-white" onClick={() => navigate(ROUTES.ITEM_ADD)}>Add Item</Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.PrintQR}>
        <Button variant="outline" className="w-full mb-2 rounded-sm bg-white" onClick={() => navigate(ROUTES.PRINTQR)}>Add Barcode</Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.CreateUsers}>
        <Button variant="outline" className="w-full mb-2 rounded-sm bg-white" onClick={() => navigate(ROUTES.USER_ADD)}>Add User</Button>
      </ShowWrapper>
      <ShowWrapper requiredPermission={Permissions.ViewReports}>
        <Button variant="outline" className="w-full mb-2 rounded-sm bg-white" onClick={() => setIsExpenseModalOpen(true)}>Add Expense</Button>
      </ShowWrapper>
    </>
  );

  const sidebarLinkClass = (path: string) =>
    `flex items-center gap-3 px-4 py-3 rounded-sm text-sm font-medium transition-all ${isActive(path)
      ? 'bg-sky-50 text-sky-600 shadow-sm border border-sky-100'
      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
    }`;

  return (
    <div className="h-dvh w-screen flex flex-col md:flex-row overflow-hidden bg-gray-100">

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
          <Link to={ROUTES.SALES} className={sidebarLinkClass(ROUTES.SALES)}><span className="text-lg">+</span><span>Add Sales</span></Link>
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
            <Link to={ROUTES.USER_ADD} className={sidebarLinkClass(ROUTES.USER_ADD)}><span className="text-lg">+</span><span>Add User</span></Link>
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
      <nav className="md:hidden fixed bottom-0 left-0 w-full border-t border-slate-200 bg-white">
        <div className="flex justify-around items-center gap-2 px-2 pt-2 pb-3">
          {navItems.map(({ to, icon, label }) => (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-row items-center justify-center gap-1 py-2 rounded-sm text-sm transition-colors border border-[rgba(0,0,0,0.15)] duration-200 min-w-0 ${isActive(to) ? 'bg-sky-500 text-white' : 'text-black-500 hover:bg-gray-100'
                }`}
            >
              <div className="flex-shrink-0">{icon}</div>
              <span className="font-medium truncate text-xs sm:text-sm">{label}</span>
            </Link>
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