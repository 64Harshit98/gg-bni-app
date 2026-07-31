import { Suspense, useEffect, useRef, useState } from 'react'; // <-- Add useState
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'; // <-- Add useLocation
import { Button } from '../Components/ui/button';
import { Sidebar, type QuickAction } from '../Components/layout/Sidebar';
import { Header } from '../Components/layout/Header';
import { FloatingButton } from '../Components/FloatingButton';
import { ROUTES } from '../constants/routes.constants';
import { CatItems } from '../routes/CatalougeRoutes';
import { useAuth } from '../context/auth-context';
import { Share2, FilePlus2, PackagePlus, Undo2, Inbox, Receipt } from 'lucide-react';
import { useOrderSound } from '../Catalogue/hooks/useOrderSound';
import { useConfirmedOrdersCount } from '../Catalogue/hooks/useConfirmedOrdersCount';
import GlobalCatalogueModal from '../Components/CatalogueShareCard';
import { ExpenseModal } from '../Components/ExpenseModal';
import { useExpenses } from '@/features/expenses';
// Add Firebase imports for fetching the subdomain
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';
import { useShopHours } from '../Pages/hooks/useShopHours';
import { ROLES } from '../enums';
import ShopClosingReminderModal from '../Components/ShopClosingReminderModal';
import ShowWrapper from '../context/ShowWrapper';
import { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';
import { Spinner } from '../Components/ui/spinner';

const CatalogueLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();
    const scrollRef = useRef<HTMLDivElement>(null);
    useOrderSound(currentUser?.companyId);
    const confirmedCount = useConfirmedOrdersCount(currentUser?.companyId);

    // 1. New State for the Store Link (Fallback to old link just in case)
    const [storeLink, setStoreLink] = useState(`${window.location.origin}/catalogue/${currentUser?.companyId}`);
    const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
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

    // 3. Pass the dynamic link into the Custom Event!
    const handleShare = () => {
        window.dispatchEvent(new CustomEvent("open-catalogue-share", {
            detail: { link: storeLink }
        }));
    };

    const navItems = CatItems.map((item) => ({
        ...item,
        badge: item.label === 'Orders' ? confirmedCount : undefined,
    }));

    const quickActions: QuickAction[] = [
        { key: 'edit-catalog', to: `${ROUTES.CHOME}/${ROUTES.ORDER}`, icon: <FilePlus2 className="size-4" />, label: 'Edit Catalog', permission: Cata_Permissions.ViewShop },
        { key: 'add-item', to: `${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`, icon: <PackagePlus className="size-4" />, label: 'Add Item', permission: Cata_Permissions.ManageItems },
        { key: 'requests', to: `${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`, icon: <Inbox className="size-4" />, label: 'Requests', permission: Cata_Permissions.ViewCatalogueRequests },
        { key: 'orders-return', to: `${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`, icon: <Undo2 className="size-4" />, label: 'Orders Return', permission: Cata_Permissions.ViewOrdersReturn },
        { key: 'add-expense', icon: <Receipt className="size-4" />, label: 'Add Expense', permission: Cata_Permissions.ViewExpenseReport, onClick: () => setIsExpenseModalOpen(true) },
        { key: 'share', icon: <Share2 className="size-4" />, label: 'Share', onClick: handleShare },
    ];

    const MobileActions = () => (
        <>
            <ShowWrapper requiredPermission={Cata_Permissions.ViewShop}>
                <Button
                    variant="outline"
                    className="w-full mb-2 rounded bg-card"
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER}`)}
                >
                    Edit Catalog
                </Button>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Cata_Permissions.ManageItems}>
                <Button
                    variant="outline"
                    className="w-full mb-2 rounded bg-card"
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`)}
                >
                    Add Item
                </Button>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Cata_Permissions.ViewOrdersReturn}>
                <Button
                    variant="outline"
                    className="w-full mb-2 rounded bg-card"
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`)}
                >
                    Orders Return
                </Button>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Cata_Permissions.ViewCatalogueRequests}>
                <Button
                    variant="outline"
                    className="w-full mb-2 rounded bg-card"
                    onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`)}
                >
                    Requests
                </Button>
            </ShowWrapper>
            <ShowWrapper requiredPermission={Cata_Permissions.ViewExpenseReport}>
                <Button variant="outline" className="w-full mb-2 rounded bg-card"
                    onClick={() => setIsExpenseModalOpen(true)}>
                    Add Expense
                </Button>
            </ShowWrapper>
        </>
    );

    return (
        <div className="aurora relative h-dvh w-screen flex flex-col md:flex-row overflow-hidden bg-background">
            {showReminder && shopSettings && (
                <ShopClosingReminderModal
                    closeTime={shopSettings.closeTime}
                    onConfirmClose={handleConfirmClose}
                    onSnooze={handleSnooze}
                />
            )}
            {/* --- DESKTOP SIDEBAR --- */}
            <Sidebar
                navItems={navItems}
                quickActions={quickActions}
                userName={currentUser?.name}
                userRole={currentUser?.role}
            />

            {/* --- MAIN CONTENT --- */}
            <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
                <Header navItems={navItems} userName={currentUser?.name} />
                <div ref={scrollRef} className="flex-1 overflow-y-auto pb-20 md:pb-4 scroll-smooth">
                    <Suspense fallback={<div className="flex h-full w-full items-center justify-center"><Spinner size="xl" /></div>}>
                        <Outlet />
                    </Suspense>
                </div>

                {/* FLOATING BUTTON (MOBILE) */}
                <div className="md:hidden absolute bottom-36 right-4 z-50">
                    <button
                        onClick={handleShare}
                        className="bg-card border border-border shadow-md rounded-full p-3"
                    >
                        <Share2 size={20} />
                    </button>
                    <FloatingButton>
                        <MobileActions />
                    </FloatingButton>
                </div>
            </main>

            {/* --- MOBILE BOTTOM NAV --- */}
            <nav className="glass md:hidden fixed bottom-3 left-3 right-3 z-40 rounded-2xl shadow-lg shadow-black/10">
                <div className="flex justify-around items-center gap-1 px-2 py-2">
                    {navItems.map(({ to, icon, label, badge }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end
                            className={({ isActive: active }) =>
                                `relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 min-w-0 ${active ? 'bg-gradient-brand text-white shadow-md shadow-primary/25' : 'text-muted-foreground hover:bg-accent'
                                }`
                            }
                        >
                            <div className="relative flex-shrink-0 [&>svg]:size-5">
                                {icon}
                                {!!badge && (
                                    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[9px] font-bold bg-destructive text-destructive-foreground rounded-full">
                                        {badge}
                                    </span>
                                )}
                            </div>
                            <span className="truncate">{label}</span>
                        </NavLink>
                    ))}
                </div>
            </nav>
            <GlobalCatalogueModal />
            <ExpenseModal
                isOpen={isExpenseModalOpen}
                onClose={() => setIsExpenseModalOpen(false)}
                onSave={data => addExpense(currentUser?.companyId!, data)}
            />
        </div>
    );
};

export default CatalogueLayout;