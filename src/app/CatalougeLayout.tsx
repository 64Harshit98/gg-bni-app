import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react'; // <-- Add useState
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'; // <-- Add useLocation
import { Button } from '../Components/ui/button';
import { FloatingButton } from '../Components/FloatingButton';
import { ROUTES } from '../constants/routes.constants';
import { CatItems, CatMobileNavItems } from '../routes/CatalougeRoutes';
import { useAuth } from '../context/auth-context';
import sellarLogo from '../assets/sellar-logo-heading.png';
import { Share2, Store, Package, RotateCcw, Inbox, Wallet, UserPlus } from "lucide-react"; // <-- Add Globe icon
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
import { TutorialStep } from '../Components/TutorialStep';

const CatalogueLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [tutorialStep, setTutorialStep] = useState(-1);
    useOrderSound(currentUser?.companyId);
    const confirmedCount = useConfirmedOrdersCount(currentUser?.companyId);

    // 1. New State for the Store Link (Fallback to old link just in case)
    const [storeLink, setStoreLink] = useState(`${window.location.origin}/catalogue/${currentUser?.companyId}`);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
    const { addExpense } = useExpenses(currentUser?.companyId, 'catalogue');

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
                    `flex-1 flex flex-col items-center justify-center gap-1 rounded-sm text-sm transition-colors border border-[rgba(0,0,0,0.15)] duration-200 min-w-0 ${isActive
                        ? 'bg-[#F97316] text-white'
                        : 'text-black-500 hover:bg-gray-100'
                    }`
                }
            >
                <div className="relative flex flex-col items-center gap-1">
                    <div className="flex-shrink-0 relative">
                        {icon}

                        {label === "Orders" && confirmedCount > 0 && (
                            <span className="absolute -top-2 -right-2 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full">
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
        return permission ? <ShowWrapper key={to} requiredPermission={permission}>{link}</ShowWrapper> : link;
    };

    const sidebarLinkClass = (isActive: boolean) =>
        `flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all ${isActive
            ? 'bg-orange-50 text-[#F97316] shadow-sm border border-orange-100'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
        }`;

    // 3. Pass the dynamic link into the Custom Event!
    const handleShare = () => {
        window.dispatchEvent(new CustomEvent("open-catalogue-share", {
            detail: { link: storeLink }
        }));
    };

    const fabActionClass = 'w-full mb-2 rounded-sm bg-white shadow-sm';
    const fabIconBadgeClass = 'w-10 h-10 rounded-full bg-orange-100 text-[#F97316] flex items-center justify-center';
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
        <div className="h-dvh w-screen flex flex-col md:flex-row overflow-hidden bg-gray-100">
            {showReminder && shopSettings && (
                <ShopClosingReminderModal
                    closeTime={shopSettings.closeTime}
                    onConfirmClose={handleConfirmClose}
                    onSnooze={handleSnooze}
                />
            )}
            {/* --- DESKTOP SIDEBAR --- */}
            <aside className="hidden md:flex flex-col w-48 bg-white border-r border-slate-200 h-full flex-shrink-0 z-20">
                <div className="p-6 border-b border-slate-100">
                    <img src={sellarLogo} alt="Sellar Logo" className="w-48" />
                </div>

                <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                    {/* MAIN NAV */}
                    {CatItems.map(({ to, icon, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end
                            className={({ isActive }) => sidebarLinkClass(isActive)}
                        >
                            <span className="text-lg">{icon}</span>

                            <div className="flex items-center justify-between w-full">
                                <span>{label}</span>

                                {label === "Orders" && confirmedCount > 0 && (
                                    <span className="ml-2 px-2 py-[2px] text-[10px] font-bold bg-red-500 text-white rounded-full">
                                        {confirmedCount}
                                    </span>
                                )}
                            </div>
                        </NavLink>
                    ))}

                    {/* QUICK ACTIONS */}
                    <div className="pt-4 pb-2">
                        <div className="border-t border-dashed border-slate-200" />
                        <p className="px-4 pt-4 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Quick Actions
                        </p>
                    </div>
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewShop}>
                        <NavLink
                            to={`${ROUTES.CHOME}/${ROUTES.ORDER}`}
                            end
                            className={({ isActive }) => sidebarLinkClass(isActive)}
                        >
                            <span className="text-lg">+</span>
                            <span>Edit Catalog</span>
                        </NavLink>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Cata_Permissions.ManageItems}>
                        <NavLink
                            to={`${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`}
                            end
                            className={({ isActive }) => sidebarLinkClass(isActive)}
                        >
                            <span className="text-lg">+</span>
                            <span>Add Item</span>
                        </NavLink>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueRequests}>
                        <NavLink
                            to={`${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`}
                            end
                            className={({ isActive }) => sidebarLinkClass(isActive)}
                        >
                            <span className="text-lg">+</span>
                            <span>Requests</span>
                        </NavLink>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewOrdersReturn}>
                        <NavLink
                            to={`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`}
                            end
                            className={({ isActive }) => sidebarLinkClass(isActive)}
                        >
                            <span className="text-lg">+</span>
                            <span>Orders Return</span>
                        </NavLink>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Cata_Permissions.ViewExpenseReport}>
                        <button
                            onClick={() => setIsExpenseModalOpen(true)}
                            className={sidebarLinkClass(false)}
                        >
                            <span className="text-lg">+</span>
                            <span>Add Expense</span>
                        </button>
                    </ShowWrapper>
                    <ShowWrapper requiredPermission={Cata_Permissions.ManageUserSettings}>
                        <button
                            onClick={() => setIsAddUserModalOpen(true)}
                            className={sidebarLinkClass(false)}
                        >
                            <span className="text-lg">+</span>
                            <span>Add User</span>
                        </button>
                    </ShowWrapper>
                    <button
                        onClick={handleShare}
                        className={sidebarLinkClass(false)} // same design, no active
                    >
                        <Share2 size={18} />
                        <span>Share</span>
                    </button>
                </nav>
            </aside>

            {/* --- MAIN CONTENT --- */}
            <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
                <div ref={scrollRef} className="flex-1 overflow-y-auto pb-20 md:pb-4 scroll-smooth">
                    <Suspense fallback={<div>Loading...</div>}>
                        <Outlet />
                    </Suspense>
                </div>

                {/* SHARE BUTTON (MOBILE) */}
                <div className="md:hidden absolute bottom-20 right-4 z-50">
                    <button
                        onClick={handleShare}
                        className="bg-white border border-gray-300 shadow-md rounded-full p-3"
                    >
                        <Share2 size={20} />
                    </button>
                </div>
            </main>

            {/* --- MOBILE BOTTOM NAV --- */}
            <nav className="md:hidden fixed bottom-0 left-0 w-full border-t border-slate-200 bg-white z-40">
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
            />
            <AddUserModal
                isOpen={isAddUserModalOpen}
                onClose={() => setIsAddUserModalOpen(false)}
            />
        </div>
    );
};

export default CatalogueLayout;