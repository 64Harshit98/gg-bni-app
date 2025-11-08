import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { db } from '../lib/Firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/auth-context';
import { FilterProvider } from '../Components/Filter';
import ShowWrapper from '../context/ShowWrapper';
import { Permissions } from '../enums';
import { SiteItems } from '../routes/SiteRoutes';
import { OrderTimeline } from '../Components/OrderTimeline';
import { CompletedSalesCard } from '../Components/CatalougeSales'; // Assuming this is the correct path

// --- Custom Hook for Business Name ---
const useBusinessName = (userId?: string, companyId?: string) => { // <-- FIX: Added companyId
    const [businessName, setBusinessName] = useState<string>('');
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        // --- FIX: Wait for both userId AND companyId ---
        if (!userId || !companyId) {
            setLoading(false);
            return;
        }
        const fetchBusinessInfo = async () => {
            try {
                // --- FIX: Use the correct multi-tenant path ---
                // (Assumes business_info doc ID is the companyId, as set in your Cloud Function)
                const docRef = doc(db, 'companies', companyId, 'business_info', companyId);
                const docSnap = await getDoc(docRef);
                setBusinessName(docSnap.exists() ? docSnap.data().businessName || 'Business' : 'Business');
            } catch (err) {
                console.error("Error fetching business name:", err);
                setBusinessName('Business');
            } finally {
                setLoading(false);
            }
        };
        fetchBusinessInfo();
    }, [userId, companyId]); // <-- FIX: Add companyId dependency
    return { businessName, loading };
};


const HomePage: React.FC = () => {
    const location = useLocation();

    const { currentUser, loading: authLoading } = useAuth();

    // --- FIX: Pass companyId to the hook ---
    const { businessName, loading: nameLoading } = useBusinessName(currentUser?.uid, currentUser?.companyId);

    const [isDataVisible, setIsDataVisible] = useState<boolean>(true); // Default to visible
    const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
    const isLoading = authLoading || nameLoading;

    const currentItem = SiteItems.find(item => item.to === location.pathname);
    const currentLabel = currentItem ? currentItem.label : "Menu";

    // --- FIX: This class is no longer needed on the main container ---
    // const dataVisibilityClass = isDataVisible ? '' : 'blur-sm select-none';

    return (
        <FilterProvider>
            <div className="flex min-h-screen w-full flex-col bg-gray-100">

                {/* === HEADER === */}
                <header className="flex flex-shrink-0 items-center justify-between border-b border-slate-300 bg-gray-100 p-2 ">

                    {/* Left Path Dropdown */}
                    <div className="relative w-14 flex justify-start">
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="flex min-w-22 items-center justify-between gap-2 rounded-sm border border-slate-400 p-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
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
                        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
                        <p className="text-sm text-slate-500">{isLoading ? 'Loading...' : businessName}</p>
                    </div>

                    {/* Right-side Show/Hide Button */}
                    <div className="w-14 flex justify-end">
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

                {/* === MAIN CONTENT === */}
                <main className="flex-grow overflow-y-auto p-2">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">

                        <OrderTimeline isDataVisible={isDataVisible} />
                        <CompletedSalesCard isDataVisible={isDataVisible} />

                    </div>
                </main>
            </div>
        </FilterProvider>
    );
};

export default HomePage;