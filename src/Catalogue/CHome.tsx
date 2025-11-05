import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom'; // Added Link and useLocation
import { ROUTES } from '../constants/routes.constants';
import {
    FiDollarSign,
    FiShoppingCart,
    FiPackage,
    FiPlus,
    FiArchive,
} from 'react-icons/fi';

// --- Imports from old dashboard ---
import { db } from '../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/Auth-Context';
import { FilterProvider } from '../Components/Filter';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import { SiteItems } from '../routes/SiteRoutes';

/**
 * NOTE: You will need to install react-icons if you haven't:
 * npm install react-icons
 */

// --- Hook from old dashboard ---
const useBusinessName = (userId?: string) => {
    const [businessName, setBusinessName] = useState<string>('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!userId) { setLoading(false); return; }
        const fetchBusinessInfo = async () => {
            try {
                const docRef = doc(db, 'business_info', userId);
                const docSnap = await getDoc(docRef);
                setBusinessName(docSnap.exists() ? docSnap.data().businessName || 'Business' : 'Business');
            } catch (err) {
                setBusinessName('Business');
            } finally {
                setLoading(false);
            }
        };
        fetchBusinessInfo();
    }, [userId]);
    return { businessName, loading };
};


const HomePage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation(); // Added to find current path

    // --- State from old dashboard ---
    const { currentUser, loading: authLoading } = useAuth();
    const { businessName, loading: nameLoading } = useBusinessName(currentUser?.uid);
    const [isDataVisible, setIsDataVisible] = useState<boolean>(false);
    const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
    const isLoading = authLoading || nameLoading;

    // --- Placeholder data for dashboard stats ---
    const stats = {
        todaySales: 12500.75,
        todayPurchases: 4200.00,
        lowStockItems: 5,
    };

    const currentItem = SiteItems.find(item => item.to === location.pathname);
    const currentLabel = currentItem ? currentItem.label : "Menu";

    // --- Logic for Data Visibility ---
    const dataVisibilityClass = isDataVisible ? '' : 'blur-sm select-none';

    return (
        <FilterProvider>
            <div className="flex min-h-screen w-full flex-col bg-gray-100">

                {/* === HEADER (from old dashboard) === */}
                <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2 ">

                    {/* Left Path Dropdown */}
                    <div className="relative w-14 flex justify-start">
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="flex min-w-22 items-center justify-between gap-2 rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors" // Adjusted min-w and gap
                            title="Change Page"
                        >
                            <span className="font-medium">{currentLabel}</span>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className={`transition-transform ${isMenuOpen ? 'rotate-180' : 'rotate-0'}`}
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>

                        {isMenuOpen && (
                            <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-300 rounded-md shadow-lg z-10">
                                <ul className="py-1">

                                    {SiteItems.map(({ to, label }) => (
                                        <li key={to}>
                                            <Link
                                                to={to}
                                                onClick={() => setIsMenuOpen(false)}
                                                className={`flex w-full items-center gap-3 px-4 py-2 text-sm font-medium ${location.pathname === to
                                                    ? 'bg-gray-500 text-white'
                                                    : 'text-slate-700 hover:bg-gray-100'
                                                    }`}
                                            >
                                                {label}
                                            </Link>
                                        </li>
                                    ))}

                                </ul>
                            </div>
                        )}
                    </div>

                    {/* Center Title */}
                    <div className="flex-1 text-center">
                        {/* The h1 is here now */}
                        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
                        <p className="text-sm text-slate-500">{isLoading ? 'Loading...' : businessName}</p>
                    </div>

                    {/* Right-side Show/Hide Button */}
                    <div className="w-14 flex justify-end">
                        {/* You may need to adjust this permission */}
                        <ShowWrapper requiredPermission={Permissions.ViewSalescard}>
                            <button
                                onClick={() => setIsDataVisible(!isDataVisible)}
                                className="p-2 rounded-sm border border-slate-400 hover:bg-slate-200 transition-colors"
                                title={isDataVisible ? 'Hide Data' : 'Show Data'}
                            >
                                {isDataVisible ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></svg>
                                )}
                            </button>
                        </ShowWrapper>
                    </div>
                </header>

                {/* === MAIN CONTENT (from new file) === */}
                <main className="flex-grow overflow-y-auto p-4">
                    {/* The h1 was moved to the header */}

                    {/* === KEY STATS GRID === */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

                        {/* Today's Sales Card */}
                        <div className="bg-white p-4 rounded-lg shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-green-100 rounded-full">
                                <FiDollarSign className="h-6 w-6 text-green-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Today's Sales</p>
                                {/* Data is hidden/shown based on toggle state */}
                                <p className={`text-2xl font-bold text-gray-900 transition-all ${dataVisibilityClass}`}>
                                    ₹{stats.todaySales.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        {/* Today's Purchases Card */}
                        <div className="bg-white p-4 rounded-lg shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-blue-100 rounded-full">
                                <FiShoppingCart className="h-6 w-6 text-blue-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Today's Purchases</p>
                                {/* Data is hidden/shown based on toggle state */}
                                <p className={`text-2xl font-bold text-gray-900 transition-all ${dataVisibilityClass}`}>
                                    ₹{stats.todayPurchases.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        {/* Low Stock Items Card */}
                        <div className="bg-white p-4 rounded-lg shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-red-100 rounded-full">
                                <FiArchive className="h-6 w-6 text-red-600" />
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Low Stock Items</p>
                                {/* Data is hidden/shown based on toggle state */}
                                <p className={`text-2xl font-bold text-gray-900 transition-all ${dataVisibilityClass}`}>
                                    {stats.lowStockItems}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* === QUICK ACTIONS === */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <button
                            onClick={() => navigate(ROUTES.SALES)}
                            className="flex-1 bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg shadow-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                        >
                            <FiPlus className="h-5 w-5" />
                            New Sale
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.PURCHASE)}
                            className="flex-1 bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg shadow-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                        >
                            <FiShoppingCart className="h-5 w-5" />
                            New Purchase
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.ITEM_ADD)}
                            className="flex-1 bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg shadow-sm hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                        >
                            <FiPackage className="h-5 w-5" />
                            Add New Item
                        </button>
                    </div>
                </main>
            </div>
        </FilterProvider>
    );
};

export default HomePage;