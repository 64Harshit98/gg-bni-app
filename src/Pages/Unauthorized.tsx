// src/Pages/Auth/UnauthorizedPage.tsx

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context'; // Using your path alias
import { Permissions } from '../enums'; // Using your path alias
import { ROUTES } from '../constants/routes.constants';

// 1. Define the mapping between routes and their required permissions.
// This is the single source of truth for what pages are available.
const accessibleRoutes = [
    {
        name: 'Dashboard', description: 'View performance metrics and activity overview.', path: ROUTES.HOME, permission: Permissions.ViewDashboard, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>
        )
    },
    {
        name: 'Journal', description: 'Browse and filter all financial transactions.', path: ROUTES.JOURNAL, permission: Permissions.ViewTransactions, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
        )
    },
    {
        name: 'Create Sales', description: 'Generate new invoices and process customer orders.', path: ROUTES.SALES, permission: Permissions.CreateSales, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" /></svg>
        )
    },
    {
        name: 'Create Sales Return', description: 'Manage product returns and credit memos.', path: ROUTES.SALES_RETURN, permission: Permissions.CreateSalesReturn, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
        )
    },
    {
        name: 'Create Purchase', description: 'Raise purchase orders and manage vendors.', path: ROUTES.PURCHASE, permission: Permissions.CreatePurchase, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z" /></svg>
        )
    },
    {
        name: 'Create Purchase Return', description: 'Process vendor returns and debit notes.', path: ROUTES.PURCHASE_RETURN, permission: Permissions.CreatePurchaseReturn, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" /></svg>
        )
    },
    {
        name: 'Manage Payments', description: 'View and print QR codes for transactions.', path: ROUTES.PRINTQR, permission: Permissions.PrintQR, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 17.25h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" /></svg>
        )
    },
    {
        name: 'Add New Item', description: 'Register products and update inventory.', path: ROUTES.ITEM_ADD, permission: Permissions.ManageItems, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 12h4m-2-2v4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
        )
    },
    {
        name: 'Manage Item Groups', description: 'Organise items into categories and groups.', path: ROUTES.ITEM_GROUP, permission: Permissions.ManageItemGroup, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" /></svg>
        )
    },
    {
        name: 'Add New User', description: 'Create user accounts and assign roles.', path: ROUTES.USER_ADD, permission: Permissions.CreateUsers, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>
        )
    },
    {
        name: 'View Item Report', description: 'Analyse stock levels and item performance.', path: ROUTES.ITEM_REPORT, permission: Permissions.ViewItemReport, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6.75v6.75" /></svg>
        )
    },
    {
        name: 'View Sales Report', description: 'Track revenue trends and sales summaries.', path: ROUTES.SALES_REPORT, permission: Permissions.ViewSalesReport, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" /></svg>
        )
    },
    {
        name: 'View Purchase Report', description: 'Review procurement costs and vendor data.', path: ROUTES.PURCHASE_REPORT, permission: Permissions.ViewPurchaseReport, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>
        )
    },
    {
        name: 'View P&L Report', description: 'Examine profit, loss, and financial health.', path: ROUTES.PNL_REPORT, permission: Permissions.ViewPNLReport, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" /></svg>
        )
    },
    {
        name: 'Manage Permissions', description: 'Configure role access and user privileges.', path: '/admin/permissions', permission: Permissions.SetPermissions, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
        )
    },
    {
        name: 'Your Account', description: 'Update your profile, password and preferences.', path: ROUTES.ACCOUNT, permission: Permissions.ManageEditProfile, icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        )
    },
];

const UnauthorizedPage: React.FC = () => {
    const { hasPermission } = useAuth();
    const [showAll, setShowAll] = React.useState(false);

    // 2. Filter the routes to get only the ones the user can access.
    const allowedPages = accessibleRoutes.filter(route => hasPermission(route.permission));
    const VISIBLE_COUNT = 5;
    const visiblePages = showAll ? allowedPages : allowedPages.slice(0, VISIBLE_COUNT);
    const hasMore = allowedPages.length > VISIBLE_COUNT;
    return (
        <div className="flex flex-col md:flex-row h-screen overflow-hidden">
            {/* Left Side: Gradient Branding */}
            <div className="flex md:w-1/2 bg-gradient-to-br from-[#002B7F] via-blue-700 to-indigo-600 flex-col items-center justify-center px-8 py-10 md:p-12 text-white text-center relative overflow-hidden shrink-0">
                {/* Abstract glow backgrounds */}
                <div className="absolute -top-24 -left-24 w-96 h-96 bg-card/10 rounded-sm blur-[100px]" />
                <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-blue-400/20 rounded-sm blur-[100px]" />

                {/* Shield Icon */}
                <div className="mb-6 md:mb-8 relative">
                    <div
                        className="w-24 h-24 md:w-40 md:h-40 rounded-3xl flex items-center justify-center relative z-10"
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            boxShadow: '0 8px 32px 0 rgba(0,0,0,0.1)',
                        }}
                    >
                        <svg className="w-12 h-12 md:w-20 md:h-20 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 4a3 3 0 110 6 3 3 0 010-6zm0 14c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08A7.24 7.24 0 0112 19z" />
                        </svg>
                    </div>
                    <div className="absolute inset-0 bg-card/20 blur-3xl rounded-sm scale-50" />
                </div>

                <div className="relative z-10">
                    <h1 className="text-2xl md:text-4xl font-bold mb-3 tracking-tight">Access Denied</h1>
                    <p className="text-sm md:text-lg max-w-sm opacity-90 mx-auto leading-relaxed">
                        You don't have access to this page right now. Reach out to your shop owner or admin if you think this should be unlocked for you.
                    </p>
                </div>
            </div>

            {/* Right Side: Available Pages */}
            <div className="w-full md:w-1/2 bg-muted flex flex-col h-full overflow-y-auto">
                <div className="max-w-xl mx-auto w-full space-y-6 p-8 md:px-16 lg:px-24 py-10">
                    <div>
                        <h2 className="text-2xl font-semibold text-foreground">Available Pages</h2>
                        {hasMore && (
                            <p className="text-sm text-muted-foreground mt-1">
                                Showing {showAll ? allowedPages.length : VISIBLE_COUNT} of {allowedPages.length} pages
                            </p>
                        )}
                    </div>

                    {visiblePages.length > 0 ? (
                        <div className="space-y-3">
                            {visiblePages.map((page) => (
                                <Link
                                    key={page.path}
                                    to={page.path}
                                    className="flex items-center gap-4 p-4 bg-card hover:bg-muted rounded-xl border border-border hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group"
                                >
                                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors duration-200">
                                        {page.icon}
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <p className="text-sm font-semibold text-foreground">{page.name}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{page.description}</p>
                                    </div>
                                    <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                                    </svg>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No pages are accessible with your current permissions.</p>
                    )}

                    {hasMore && (
                        <button
                            onClick={() => setShowAll(prev => !prev)}
                            className="w-full py-3 rounded-sm border border-dashed border-blue-300 text-sm font-medium text-blue-600 hover:bg-blue-50 hover:border-blue-400 transition-all duration-200"
                        >
                            {showAll ? '↑ Show less' : `↓ Show ${allowedPages.length - VISIBLE_COUNT} more pages`}
                        </button>
                    )}

                    <div className="pt-2">
                        <Link
                            to={ROUTES.HOME}
                            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors group"
                        >
                            <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                            </svg>
                            Back to Safety
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UnauthorizedPage;
