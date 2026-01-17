import { Suspense } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../Components/ui/button';
import { FloatingButton } from '../Components/FloatingButton';
import { ROUTES } from '../constants/routes.constants';
import { Permissions } from '../enums';
import ShowWrapper from '../context/ShowWrapper';
import { CatItems } from '../routes/CatalougeRoutes';
import { useAuth } from '../context/auth-context';
import sellarLogo from '../assets/sellar-logo-heading.png';



const CatalogueLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const isActive = (path: string) => {
        if (location.pathname === path) return true;
        if (location.pathname.startsWith(path + '/')) return true;
        return false;
    };

    const MobileActions = () => (
        <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
            <Button
                variant="outline"
                className="w-full mb-2 rounded bg-white"
                onClick={() => navigate(`${ROUTES.ORDER}`)}
            >
                Shop
            </Button>
            <Button
                variant="outline"
                className="w-full mb-2 rounded bg-white"
                onClick={() => navigate(`${ROUTES.MYSHOP}`)}
            >
                Add Item
            </Button>
            <Button
                variant="outline"
                className="w-full mb-2 rounded bg-white"
                onClick={() => {
                    if (currentUser) {
                        navigate(`/catalogue/${currentUser.companyId}`);
                    } else {
                        console.error("User not loaded, cannot navigate.");
                    }
                }}
            >
                Catalogue
            </Button>
        </ShowWrapper>
    );

    const sidebarLinkClass = (path: string) => `flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-all ${
        isActive(path)
            ? 'bg-sky-50 text-sky-600 shadow-sm border border-sky-100'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
    }`;

    return (
        <div className="h-dvh w-screen flex flex-col md:flex-row overflow-hidden bg-gray-100">

            {/* --- DESKTOP SIDEBAR (Visible on md+) --- */}
            <aside className="hidden md:flex flex-col w-48 bg-white border-r border-slate-200 h-full flex-shrink-0 z-20">
                <div className="p-6 border-b border-slate-100">
                    <h1 className="text-xl font-bold text-slate-800"><img src={sellarLogo} alt="Sellar Logo" className="w-48" /></h1>
                </div>

                <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                    {/* Main Navigation */}
                    {CatItems.map(({ to, icon, label }) => (
                        <Link key={to} to={to} className={sidebarLinkClass(to)}>
                            <span className="text-lg">{icon}</span>
                            <span>{label}</span>
                        </Link>
                    ))}

                    {/* Quick Actions */}
                    <ShowWrapper requiredPermission={Permissions.ViewItemReport}>
                        <div className="pt-4 pb-2">
                            <div className="border-t border-dashed border-slate-200" />
                            <p className="px-4 pt-4 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Actions</p>
                        </div>

                        <Link to={ROUTES.ORDER} className={sidebarLinkClass(ROUTES.ORDER)}>
                            <span className="text-lg">+</span>
                            <span>Shop</span>
                        </Link>

                        <Link to={ROUTES.MYSHOP} className={sidebarLinkClass(ROUTES.MYSHOP)}>
                            <span className="text-lg">+</span>
                            <span>Add Item</span>
                        </Link>

                        {/* Dynamic Catalogue Link */}
                        <button
                            onClick={() => {
                                if (currentUser) navigate(`/catalogue/${currentUser.companyId}`);
                            }}
                            className={`w-full ${sidebarLinkClass('')} text-left`}
                        >
                            <span className="text-lg">+</span>
                            <span>Catalogue</span>
                        </button>
                    </ShowWrapper>
                </nav>
            </aside>

            {/* --- MAIN CONTENT AREA --- */}
            <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 pb-20 md:pb-4 scroll-smooth">
                    <Suspense fallback={<div>Loading...</div>}>
                        <Outlet />
                    </Suspense>
                </div>

                {/* --- FLOATING BUTTON (MOBILE ONLY) --- */}
                <div className="md:hidden absolute bottom-20 right-4 z-50">
                    <FloatingButton className="">
                        <MobileActions />
                    </FloatingButton>
                </div>
            </main>

            {/* --- MOBILE BOTTOM NAV (RESTORED ORIGINAL STYLE) --- */}
            <nav className="md:hidden fixed bottom-0 left-0 w-full border-t border-slate-200 bg-white z-40">
                <div className="flex justify-around items-center gap-2 px-2 pt-2 pb-3">
                    {CatItems.map(({ to, icon, label }) => (
                        <Link
                            key={to}
                            to={to}
                            className={`flex-1 flex flex-row items-center justify-center gap-1 py-2 rounded-sm text-sm transition-colors border border-[rgba(0,0,0,0.15)] duration-200 min-w-0 ${
                                isActive(to) ? 'bg-sky-500 text-white' : 'text-black-500 hover:bg-gray-100'
                            }`}
                        >
                            <div className="flex-shrink-0">{icon}</div>
                            <span className="font-medium truncate text-xs sm:text-sm">{label}</span>
                        </Link>
                    ))}
                </div>
            </nav>

        </div>
    );
};

export default CatalogueLayout;