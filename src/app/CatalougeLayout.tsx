import { Suspense, useEffect, useRef, useState } from 'react'; // <-- Add useState
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'; // <-- Add useLocation
import { Button } from '../Components/ui/button';
import { FloatingButton } from '../Components/FloatingButton';
import { ROUTES } from '../constants/routes.constants';
import { CatItems } from '../routes/CatalougeRoutes';
import { useAuth } from '../context/auth-context';
import sellarLogo from '../assets/sellar-logo-heading.png';
import { Share2 } from "lucide-react"; // <-- Add Globe icon
import { useOrderSound } from '../Catalogue/hooks/useOrderSound';
import { useConfirmedOrdersCount } from '../Catalogue/hooks/useConfirmedOrdersCount';
import GlobalCatalogueModal from '../Components/CatalogueShareCard';
import { NotificationProvider } from '../context/NotificationContext';

// Add Firebase imports for fetching the subdomain
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/Firebase';

const CatalogueLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { currentUser } = useAuth();
    const scrollRef = useRef<HTMLDivElement>(null);
    useOrderSound(currentUser?.companyId);
    const confirmedCount = useConfirmedOrdersCount(currentUser?.companyId);

    // 1. New State for the Store Link (Fallback to old link just in case)
    const [storeLink, setStoreLink] = useState(`${window.location.origin}/catalogue/${currentUser?.companyId}`);

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

    const MobileActions = () => (
        <>
            <Button
                variant="outline"
                className="w-full mb-2 rounded bg-white"
                onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER}`)}
            >
                Edit Catalog
            </Button>
            <Button
                variant="outline"
                className="w-full mb-2 rounded bg-white"
                onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`)}
            >
                Add Item
            </Button>
            <Button
                variant="outline"
                className="w-full mb-2 rounded bg-white"
                onClick={() => navigate(`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`)}
            >
                Orders Return
            </Button>
        </>
    );

    return (
        <NotificationProvider>
        <div className="h-dvh w-screen flex flex-col md:flex-row overflow-hidden bg-gray-100">
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

                    <NavLink
                        to={`${ROUTES.CHOME}/${ROUTES.ORDER}`}
                        end
                        className={({ isActive }) => sidebarLinkClass(isActive)}
                    >
                        <span className="text-lg">+</span>
                        <span>Edit Catalog</span>
                    </NavLink>

                    <NavLink
                        to={`${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`}
                        end
                        className={({ isActive }) => sidebarLinkClass(isActive)}
                    >
                        <span className="text-lg">+</span>
                        <span>Add Item</span>
                    </NavLink>
                    {/* <NavLink
                            to={`${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`}
                            end
                            className={({ isActive }) => sidebarLinkClass(isActive)}
                        >
                            <span className="text-lg">+</span>
                            <span>Requests</span>
                        </NavLink> */}
                    <NavLink
                        to={`${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`}
                        end
                        className={({ isActive }) => sidebarLinkClass(isActive)}
                    >
                        <span className="text-lg">+</span>
                        <span>Orders Return</span>
                    </NavLink>

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

                {/* FLOATING BUTTON (MOBILE) */}
                <div className="md:hidden absolute bottom-36 right-4 z-50">
                    <button
                        onClick={handleShare}
                        className="bg-white border border-gray-300 shadow-md rounded-full p-3"
                    >
                        <Share2 size={20} />
                    </button>
                    <FloatingButton>
                        <MobileActions />
                    </FloatingButton>
                </div>
            </main>

            {/* --- MOBILE BOTTOM NAV --- */}
            <nav className="md:hidden fixed bottom-0 left-0 w-full border-t border-slate-200 bg-white z-40">
                <div className="flex justify-around items-center gap-2 px-2 pt-2 pb-3">
                    {CatItems.map(({ to, icon, label }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end
                            className={({ isActive }) =>
                                `flex-1 flex flex-row items-center justify-center gap-1 py-2 rounded-sm text-sm transition-colors border border-[rgba(0,0,0,0.15)] duration-200 min-w-0 ${isActive
                                    ? 'bg-[#F97316] text-white'
                                    : 'text-black-500 hover:bg-gray-100'
                                }`
                            }
                        >
                            <div className="relative flex items-center gap-1">
                                <div className="flex-shrink-0 relative">
                                    {icon}

                                    {label === "Orders" && confirmedCount > 0 && (
                                        <span className="absolute -top-2 -right-2 min-w-[16px] h-[16px] px-1 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full">
                                            {confirmedCount}
                                        </span>
                                    )}
                                </div>

                                <span className="font-medium truncate text-xs sm:text-sm">
                                    {label}
                                </span>
                            </div>
                        </NavLink>
                    ))}
                </div>
            </nav>
            <GlobalCatalogueModal />
        </div>
        </NotificationProvider>
    );
};

export default CatalogueLayout;