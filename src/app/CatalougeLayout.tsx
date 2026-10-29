import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../Components/ui/button';
import { FloatingButton } from '../Components/FloatingButton';
import { ROUTES } from '../constants/routes.constants';
import { CatItems, CatMobileNavItems } from '../routes/CatalougeRoutes';
import { useAuth } from '../context/auth-context';
import sellarLogo from '../assets/sellar-logo-heading.png';
import { Share2, Store, Package, RotateCcw, Inbox, Wallet, UserPlus, Search, PackagePlus, LayoutTemplate } from "lucide-react";
import { useOrderSound } from '../Catalogue/hooks/useOrderSound';
import { useConfirmedOrdersCount } from '../Catalogue/hooks/useConfirmedOrdersCount';
import GlobalCatalogueModal from '../Components/CatalogueShareCard';
import { ExpenseModal } from '../Components/ExpenseModal';
import { AddUserModal } from '../Components/AddUserModal';
import { useExpenses } from '../Pages/Reports/ExpenseReport/useExpense';
// Add Firebase imports for fetching the subdomain
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useShopHours } from '../Pages/hooks/useShopHours';
import { ROLES } from '../enums';
import ShopClosingReminderModal from '../Components/ShopClosingReminderModal';
import ShowWrapper from '../context/ShowWrapper';
import { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';
//import { Permissions } from '../enums';
import { TutorialStep } from '../Components/TutorialStep';
import PosCataSwitcher from '../Components/PosCataSwitcher';
import NotificationBell from '../Components/NotificationBell';
import { Sidebar, type QuickAction } from '../Components/layout/SideBar';
import { Header } from '../Components/layout/Header';
import { CommandPalette, LAYOUT_ACTION_EVENT, type Destination, type LayoutAction } from '../Components/layout/CommandPalette';
import { SubscriptionBanner, useSubscriptionBanner } from '../Components/layout/SubscriptionBanner';

const CatalogueLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    //const isCatalogueHomePage = location.pathname === ROUTES.CHOME;
    const { currentUser } = useAuth();
    const banner = useSubscriptionBanner();

    const normPath = (p: string) => {
        const abs = p.startsWith('/') ? p : `${ROUTES.CHOME}/${p}`; // relative `to` ko absolute banao
        return abs.replace(/\/+$/, '') || '/';
    };
    const BANNER_LABEL = /^(home|dashboard|orders?|accounts?)$/i;
    const BANNER_PATHS = [
        ...CatItems
            .filter((i) => BANNER_LABEL.test(i.label))
            .map((i) => normPath(i.to)),
        '/accounts',        // Catalogue Account page, root level pe hai (catalogue-home ke andar nahi)
        ROUTES.ORDERDETAILS, // '/order-details', Orders page
        ROUTES.CHOME,        // Catalogue Home
    ];

    const currentPath = normPath(location.pathname);
    // Pages with a sticky Save bar at the bottom — the share FAB would sit on top of it
    const HIDE_SHARE_FAB_PATHS = [
        ROUTES.CATA_SALE_SETTING, ROUTES.CATA_BILL_SETTING, ROUTES.CATA_ITEM_SETTING,
        ROUTES.CATA_USER_SETTING, ROUTES.CATA_PERMISSION_SETTING,
        ROUTES.CATA_EDIT, ROUTES.CATA_STORE_PAGE, ROUTES.ADD_PRODUCT,
    ].map(normPath);
    const showShareFab = !HIDE_SHARE_FAB_PATHS.includes(currentPath)
        && !currentPath.startsWith(`${normPath(ROUTES.CATA_PRODUCT_PAGE)}/`); // product page builder (has its own Save bar)
    const showBanner =
        banner.visible && !!banner.tier && banner.days !== null && BANNER_PATHS.includes(currentPath);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [tutorialStep, setTutorialStep] = useState(-1);

    // Dashboard tutorial step 1 (POS/Catalogue switcher) is rendered here in the strip
    const [switcherStep, setSwitcherStep] = useState(-1);
    const isMobileView = window.innerWidth < 768;

    useEffect(() => {
        const onStepChange = (e: Event) => setSwitcherStep((e as CustomEvent).detail?.step ?? -1);
        window.addEventListener('tutorial_step_change', onStepChange);
        return () => window.removeEventListener('tutorial_step_change', onStepChange);
    }, []);

    const handleSwitcherNext = () => window.dispatchEvent(new Event('tutorial_switcher_next'));
    const handleSwitcherSkip = () => window.dispatchEvent(new Event('tutorial_switcher_skip'));

    useOrderSound(currentUser?.companyId);
    const confirmedCount = useConfirmedOrdersCount(currentUser?.companyId);

    // 1. New State for the Store Link (Fallback to old link just in case)
    const [storeLink, setStoreLink] = useState(`${window.location.origin}/catalogue/${currentUser?.companyId}`);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const { addExpense } = useExpenses(currentUser?.companyId, 'catalogue');

    // CommandPalette ke 'Add User' / 'Add Expense' layout-level modals yahin khulte hain
    useEffect(() => {
        const onAction = (e: Event) => {
            const action = (e as CustomEvent<LayoutAction>).detail;
            if (action === 'add-user') setIsAddUserModalOpen(true);
            if (action === 'add-expense') setIsExpenseModalOpen(true);
        };
        window.addEventListener(LAYOUT_ACTION_EVENT, onAction);
        return () => window.removeEventListener(LAYOUT_ACTION_EVENT, onAction);
    }, []);

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
    useEffect(() => {
        const checkTutorial = async () => {
            if (!currentUser?.companyId) return;
            try {
                const ref = doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial');
                const snap = await getDoc(ref);
                const settings = snap.exists() ? snap.data() : {};
                const catalogueDone = !!settings?.catalogueTutorialDone;
                const floatingDone = !!settings?.catalogueFloatingTutorialDone;

                if (catalogueDone && !floatingDone && window.innerWidth < 768) {
                    setTutorialStep(0);
                }
            } catch (e) {
                console.error('Error fetching catalogue floating tutorial:', e);
            }
        };

        checkTutorial();
        window.addEventListener("catalogue_tutorial_done", checkTutorial);
        return () => window.removeEventListener("catalogue_tutorial_done", checkTutorial);
    }, [currentUser]);

    const saveFloatingDone = async () => {
        if (!currentUser?.companyId) return;
        try {
            await setDoc(
                doc(db, 'companies', currentUser.companyId, 'settings', 'tutorial'),
                { catalogueFloatingTutorialDone: true },
                { merge: true }
            );
        } catch (e) {
            console.error('Error saving catalogue floating tutorial:', e);
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
            await setDoc(ref, { snoozeUntil: Date.now() + 15 * 60 * 1000 }, { merge: true });
        }
    };

    // 2. Fetch the custom subdomain on load
    useEffect(() => {
        const fetchStoreLink = async () => {
            if (!currentUser?.companyId) return;
            try {
                const docRef = doc(db, 'companies', currentUser.companyId);
                const snap = await getDoc(docRef);
                if (snap.exists() && snap.data().subdomain) {
                    setStoreLink(`https://${snap.data().subdomain}.sellar.in`);
                }
            } catch (error) {
                console.error("Error fetching store link:", error);
            }
        };
        fetchStoreLink();
    }, [currentUser]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo(0, 0);
        }
    }, [location.pathname]);

    const renderMobileNavLink = ({ to, icon, label, permission }: { to: string; icon: ReactNode; label: string; permission?: Cata_Permissions }) => {
        const link = (
            <NavLink
                key={to}
                to={to}
                end
                className={({ isActive }) =>
                    `flex-1 flex flex-col items-center justify-center gap-1 py-1 text-sm transition-colors duration-200 min-w-0 ${isActive
                        ? 'text-[#c2410c]'
                        : 'text-gray-500'
                    }`
                }
            >
                <div className="relative flex flex-col items-center gap-1">
                    <div className="flex-shrink-0 relative">
                        {icon}

                        {label === "Orders" && confirmedCount > 0 && (
                            <span className="absolute -top-2 -right-2 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-sm">
                                {confirmedCount}
                            </span>
                        )}
                    </div>

                    <span className="font-medium truncate text-[10px] sm:text-xs">
                        {label}
                    </span>
                </div>
            </NavLink>
        );
        return permission ? (
            <ShowWrapper key={to} requiredPermission={permission} mode="disable">
                {link}
            </ShowWrapper>
        ) : link;
    };

    const handleShare = () => {
        window.dispatchEvent(new CustomEvent("open-catalogue-share", {
            detail: { link: storeLink }
        }));
    };

    // Sidebar main nav (Orders pe red badge ke saath)
    const sidebarNavItems = CatItems.map((item) => ({
        ...item,
        badge: item.label === 'Orders' ? confirmedCount : undefined,
    }));

    // Sidebar quick actions
    const quickActions: QuickAction[] = [
        { key: 'catalog', to: `${ROUTES.CHOME}/${ROUTES.ORDER}`, icon: <Store className="size-4" />, label: 'Edit Catalog', permission: Cata_Permissions.ViewShop },
        { key: 'storepage', to: `${ROUTES.CHOME}/${ROUTES.CATA_STORE_PAGE}`, icon: <LayoutTemplate className="size-4" />, label: 'Store page', permission: Cata_Permissions.ManageEditProfile },
        { key: 'item', to: `${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`, icon: <PackagePlus className="size-4" />, label: 'Add Item', permission: Cata_Permissions.ManageItems },
        { key: 'requests', to: `${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`, icon: <Inbox className="size-4" />, label: 'Requests', permission: Cata_Permissions.ViewCatalogueRequests },
        { key: 'returns', to: `${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`, icon: <RotateCcw className="size-4" />, label: 'Orders Return', permission: Cata_Permissions.ViewOrdersReturn },
        { key: 'expense', icon: <Wallet className="size-4" />, label: 'Add Expense', permission: Cata_Permissions.ViewExpenseReport, onClick: () => setIsExpenseModalOpen(true) },
        { key: 'user', icon: <UserPlus className="size-4" />, label: 'Add User', permission: Cata_Permissions.ManageUserSettings, onClick: () => setIsAddUserModalOpen(true) },
        { key: 'share', icon: <Share2 className="size-4" />, label: 'Share', onClick: handleShare },
    ];

    // Search (Ctrl+K / mobile icon) me kya-kya milega
    const searchDestinations: Destination[] = [
        ...CatItems.map(({ to, label }) => ({ label, hint: 'Go to page', to })),
        { label: 'Edit Catalog', hint: 'Manage your catalogue', to: `${ROUTES.CHOME}/${ROUTES.ORDER}` },
        { label: 'Store page', hint: 'Edit what customers see first', to: `${ROUTES.CHOME}/${ROUTES.CATA_STORE_PAGE}` },
        { label: 'Add Item', hint: 'Add a new product', to: `${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}` },
        { label: 'Requests', hint: 'Catalogue requests', to: `${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}` },
        { label: 'Orders Return', hint: 'Returned orders', to: `${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}` },
    ];

    const fabActionClass = 'w-full mb-2 rounded-sm bg-white shadow-sm';
    const fabIconBadgeClass = 'w-10 h-10 rounded-full bg-[#ffedd5] text-[#c2410c] flex items-center justify-center';
    const fabLabelClass = 'text-[11px] font-medium text-gray-700';

    const MobileActions = () => (
        <>
            <ShowWrapper requiredPermission={Cata_Permissions.ViewShop}>
                <Button
                    variant="outline"
                    className={fabActionClass}
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER}`)}
                >
                    <span className={fabIconBadgeClass}><Store size={18} /></span>
                    <span className={fabLabelClass}>Catalog</span>
                </Button>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Cata_Permissions.ManageEditProfile}>
                <Button
                    variant="outline"
                    className={fabActionClass}
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.CATA_STORE_PAGE}`)}
                >
                    <span className={fabIconBadgeClass}><LayoutTemplate size={18} /></span>
                    <span className={fabLabelClass}>Store page</span>
                </Button>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Cata_Permissions.ManageItems}>
                <Button
                    variant="outline"
                    className={fabActionClass}
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`)}
                >
                    <span className={fabIconBadgeClass}><Package size={18} /></span>
                    <span className={fabLabelClass}>Item</span>
                </Button>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Cata_Permissions.ViewOrdersReturn}>
                <Button
                    variant="outline"
                    className={fabActionClass}
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`)}
                >
                    <span className={fabIconBadgeClass}><RotateCcw size={18} /></span>
                    <span className={fabLabelClass}>Returns</span>
                </Button>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueRequests}>
                <Button
                    variant="outline"
                    className={fabActionClass}
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`)}
                >
                    <span className={fabIconBadgeClass}><Inbox size={18} /></span>
                    <span className={fabLabelClass}>Requests</span>
                </Button>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Cata_Permissions.ViewExpenseReport}>
                <Button variant="outline" className={fabActionClass}
                    onClick={() => setIsExpenseModalOpen(true)}>
                    <span className={fabIconBadgeClass}><Wallet size={18} /></span>
                    <span className={fabLabelClass}>Expense</span>
                </Button>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Cata_Permissions.ManageUserSettings}>
                <Button variant="outline" className={fabActionClass}
                    onClick={() => setIsAddUserModalOpen(true)}>
                    <span className={fabIconBadgeClass}><UserPlus size={18} /></span>
                    <span className={fabLabelClass}>User</span>
                </Button>
            </ShowWrapper>
        </>
    );

    return (
        <div className="relative h-dvh w-screen flex flex-col md:flex-row overflow-hidden bg-gray-100 md:bg-[#fff5ec]">
            {showReminder && shopSettings && (
                <ShopClosingReminderModal
                    closeTime={shopSettings.closeTime}
                    onConfirmClose={handleConfirmClose}
                    onSnooze={handleSnooze}
                />
            )}
            {/* --- MOBILE TOP STRIP — Catalogue Home ka apna header hai, wahan hide --- */}
            <header className="md:hidden flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200 z-[140]">
                {/* Left: switcher */}
                <div className="shrink-0">
                    <TutorialStep
                        step={1}
                        currentStep={isMobileView ? switcherStep : -1}
                        text="Use this menu to switch between POS and Catalogue views."
                        onNext={handleSwitcherNext}
                        onSkip={handleSwitcherSkip}
                        mobileArrowAlign="left"
                    >
                        <div className="min-w-0">
                            <PosCataSwitcher current="CATALOG" />
                        </div>
                    </TutorialStep>
                </div>

                {/* Middle: logo takes remaining space, can shrink, never overlaps */}
                <div className="flex-1 min-w-0 flex justify-center">
                    <img
                        src={sellarLogo}
                        alt="Sellar Logo"
                        className="h-5 max-w-full object-contain"
                    />
                </div>

                {/* Right: actions */}
                <div className="flex shrink-0 items-center gap-1">
                    <button
                        type="button"
                        aria-label="Search"
                        onClick={() => setIsMobileSearchOpen(true)}
                        className="flex size-9 items-center justify-center rounded-sm text-slate-600 transition-colors active:bg-slate-100"
                    >
                        <Search size={20} />
                    </button>
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewNotification}>
                        <NotificationBell />
                    </ShowWrapper>
                </div>
            </header>
            {showBanner && (
                <SubscriptionBanner
                    variant="mobile" theme="cat"
                    days={banner.days!} endDate={banner.endDate} isTrial={banner.isTrial} tier={banner.tier!} onClose={banner.dismiss}
                />
            )}

            {/* --- DESKTOP SIDEBAR --- */}
            <Sidebar
                theme="orange"
                navItems={sidebarNavItems}
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
                            <PosCataSwitcher current="CATALOG" showCompany />
                        </div>
                    </TutorialStep>
                }
            />

            {/* --- MAIN CONTENT --- */}
            <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
                <Header
                    theme="orange"
                    navItems={CatItems}
                    userName={currentUser?.name}
                    destinations={searchDestinations}
                    notificationPermission={Cata_Permissions.ViewNotification}
                />
                {showBanner && (
                    <SubscriptionBanner
                        variant="desktop" theme="cat"
                        days={banner.days!} endDate={banner.endDate} isTrial={banner.isTrial} tier={banner.tier!} onClose={banner.dismiss}
                    />
                )}
                <div ref={scrollRef} className="flex-1 overflow-y-auto pb-20 md:pb-4 scroll-smooth">
                    <Suspense fallback={<div>Loading...</div>}>
                        <Outlet />
                    </Suspense>
                </div>

                {/* SHARE BUTTON (MOBILE) */}
                {showShareFab && (
                    <div className="md:hidden absolute bottom-20 right-4 z-50">
                        <button
                            onClick={handleShare}
                            className="bg-white border border-gray-300 shadow-md rounded-full p-3"
                        >
                            <Share2 size={20} />
                        </button>
                    </div>
                )}
            </main>

            {/* --- MOBILE BOTTOM NAV --- */}
            <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white z-40">
                <div className="flex justify-around items-center gap-2 px-2 pt-2 pb-3">
                    {CatMobileNavItems.slice(0, 2).map((item) => renderMobileNavLink(item))}

                    <div className="flex-1 flex justify-center">
                        <div className="-mt-7">
                            <TutorialStep
                                step={0}
                                currentStep={tutorialStep}
                                text="Tap here to quickly add Items, view Requests, and more!"
                                onNext={handleTutorialNext}
                                onSkip={handleTutorialSkip}
                                isLast={true}
                                position="top"
                            >
                                <FloatingButton className="static shadow-lg">
                                    <MobileActions />
                                </FloatingButton>
                            </TutorialStep>
                        </div>
                    </div>

                    {CatMobileNavItems.slice(2).map((item) => renderMobileNavLink(item))}
                </div>
            </nav>
            <GlobalCatalogueModal />
            <ExpenseModal
                isOpen={isExpenseModalOpen}
                onClose={() => setIsExpenseModalOpen(false)}
                onSave={data => addExpense(currentUser?.companyId!, data)}
                theme="orange"
                currentUserName={currentUser?.name || 'Unknown'}
            />
            <AddUserModal
                isOpen={isAddUserModalOpen}
                onClose={() => setIsAddUserModalOpen(false)}
                theme="orange"
            />
            <CommandPalette
                open={isMobileSearchOpen}
                onOpenChange={setIsMobileSearchOpen}
                destinations={searchDestinations}
            />
        </div>
    );
};

export default CatalogueLayout;