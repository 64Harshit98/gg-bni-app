// src/Pages/Auth/UnauthorizedPage.tsx

import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/auth-context'; // Using your path alias
import { Permissions } from '../enums'; // Using your path alias
import { ROUTES } from '../constants/routes.constants';

// 1. Define the mapping between routes and their required permissions.
// This is the single source of truth for what pages are available.
const accessibleRoutes = [
    { name: 'Dashboard', path: ROUTES.HOME, permission: Permissions.ViewDashboard },
    { name: 'Journal', path: ROUTES.JOURNAL, permission: Permissions.ViewTransactions },
    { name: 'Create Sales', path: ROUTES.SALES, permission: Permissions.CreateSales },
    { name: 'Create Sales Return', path: ROUTES.SALES_RETURN, permission: Permissions.CreateSalesReturn },
    { name: 'Create Purchase', path: ROUTES.PURCHASE, permission: Permissions.CreatePurchase },
    { name: 'Create Purchase Return', path: ROUTES.PURCHASE_RETURN, permission: Permissions.CreatePurchaseReturn },
    { name: 'Manage Payments', path: ROUTES.PAYMENT, permission: Permissions.ManagePayments },
    { name: 'Add New Item', path: ROUTES.ITEM_ADD, permission: Permissions.ManageItems },
    { name: 'Manage Item Groups', path: ROUTES.ITEM_GROUP, permission: Permissions.ManageItemGroup },
    { name: 'Add New User', path: ROUTES.USER_ADD, permission: Permissions.CreateUsers },
    { name: 'View Item Report', path: ROUTES.ITEM_REPORT, permission: Permissions.ViewItemReport },
    { name: 'View Sales Report', path: ROUTES.SALES_REPORT, permission: Permissions.ViewSalesReport },
    { name: 'View Purchase Report', path: ROUTES.PURCHASE_REPORT, permission: Permissions.ViewPurchaseReport },
    { name: 'View P&L Report', path: ROUTES.PNL_REPORT, permission: Permissions.ViewPNLReport },
    { name: 'Manage Permissions', path: '/admin/permissions', permission: Permissions.SetPermissions }, // Example for a new admin page
    { name: 'Your Account', path: ROUTES.ACCOUNT, permission: Permissions.ManageEditProfile },
];

const UnauthorizedPage: React.FC = () => {
    const { hasPermission } = useAuth();

    // 2. Filter the routes to get only the ones the user can access.
    const allowedPages = accessibleRoutes.filter(route => hasPermission(route.permission));

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4 text-center">
            <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
                <svg
                    className="mx-auto h-16 w-16 text-red-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                </svg>
                <h1 className="mt-4 text-3xl font-bold text-gray-800">Access Denied</h1>
                <p className="mt-2 text-gray-600">
                    Sorry, you do not have permission to view this page.
                </p>

                {allowedPages.length > 0 && (
                    <div className="mt-6">
                        <p className="font-semibold text-gray-700">However, you can access the following pages:</p>
                        <ul className="mt-3 space-y-2">
                            {allowedPages.map((page) => (
                                <li key={page.path}>
                                    <Link
                                        to={page.path}
                                        className="block w-full px-4 py-2 text-center text-blue-600 bg-blue-100 rounded-md hover:bg-blue-200 transition"
                                    >
                                        {page.name}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="mt-8">
                    <Link
                        to={ROUTES.HOME}
                        className="text-sm font-medium text-gray-500 hover:text-gray-700"
                    >
                        Go back to Dashboard
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default UnauthorizedPage;
