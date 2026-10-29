import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc, getDocs, setDoc, collection } from 'firebase/firestore';
import { Permissions, PLANS, ROLES } from '../../enums';
import { useAuth } from '../../context/auth-context';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import BackButton from '../../Components/BackButton';

type RolePermissionsMap = Record<string, Permissions[]>;

export const EXCLUDED_OWNER_PERMISSIONS = [
    Permissions.ViewAttendance,
];
export const BASIC_ALLOWED_PERMISSIONS = [
    Permissions.ViewDashboard,
    Permissions.ViewSalescard,
    Permissions.ManageEditProfile,
    Permissions.CreateSales,
    Permissions.ViewTransactions,
    Permissions.ViewHidebutton,
    Permissions.ViewFilter,
    Permissions.ViewSalesbarchart,
    Permissions.ViewPaymentmethods,
    Permissions.ViewReports,
    Permissions.ViewSalesReport,
    Permissions.CreateUsers,
    Permissions.ViewAccount,
    Permissions.ManageUsers,
    Permissions.ViewAttendance,
    Permissions.ManageSalesSetting,
    Permissions.AllowDueBilling,
];

export const DEFAULT_PERMISSIONS_MAP = {
    [ROLES.SALESMAN]: [
        Permissions.ViewAttendance,
        Permissions.ViewDashboard,
        Permissions.CreateSales,
        Permissions.CreateSalesReturn,
        Permissions.ViewAccount,
        Permissions.ViewCatalogue,
    ],
    [ROLES.MANAGER]: [
        Permissions.ViewDashboard,
        Permissions.ViewAttendance,
        Permissions.ViewAccount,
        Permissions.ManageItems,
        Permissions.Viewrestockcard,
        Permissions.ViewTransactions,
        Permissions.PrintQR,
        //Permissions.ManageItemGroup,
        Permissions.CreateSales,
        Permissions.CreateSalesReturn,
        Permissions.CreatePurchase,
        Permissions.CreatePurchaseReturn,
        Permissions.HiddenProFeatures,
        Permissions.ViewCatalogue,
    ],
    [ROLES.OWNER]: Object.values(Permissions).filter(
        (permission) => !EXCLUDED_OWNER_PERMISSIONS.includes(permission)
    ),
};


const PERMISSION_DESCRIPTIONS: Partial<Record<Permissions, string>> = {
    [Permissions.ViewDashboard]: 'Without this they land on Transactions.',
    [Permissions.ViewCatalogue]: 'Browse items and stock, read-only.',
    [Permissions.ViewFilter]: 'Today / week / month chips on Home.',
    [Permissions.ViewHidebutton]: 'The eye button that masks amounts.',
    [Permissions.ViewTopSalesperson]: 'Who sold the most.',
    [Permissions.ViewAttendance]: 'Who has checked in today.',
    [Permissions.ViewSalescard]: 'Total sales, bills and received.',
    [Permissions.ViewSalesbarchart]: 'Sales by day for the period.',
    [Permissions.Viewrestockcard]: 'Items at or below restock level.',
    [Permissions.ViewTopSoldItems]: 'Best sellers by quantity.',
    [Permissions.ViewTopCustomers]: 'Biggest buyers and their totals.',
    [Permissions.CreateSales]: 'New sale, collect payment, print or share bill.',
    [Permissions.CreateSalesReturn]: 'Take items back and refund or give credit.',
    [Permissions.ViewTransactions]: 'Browse the full transaction history log.',
    [Permissions.ViewPaymentmethods]: 'View and select payment types during checkout.',
    [Permissions.ViewSalesReport]: 'Every bill with totals.',
    [Permissions.ViewPNLReport]: 'Profit, margins and expenses.',
    [Permissions.ViewPurchaseReport]: 'Supplier bills and cost prices.',
    [Permissions.ViewItemReport]: 'Stock value and movement per item.',
    [Permissions.ViewItemSoldReport]: 'Quantity sold per item.',
    [Permissions.ViewCustomerReport]: 'Customers, spend and udhaar.',
    [Permissions.ViewExpenseReport]: 'Rent, salary and other expenses.',
    [Permissions.ViewPartyLedger]: 'Who owes whom, per party.',
    [Permissions.ViewTaxReport]: 'GST collected and paid.',
    [Permissions.ViewStockTransferReport]: 'Moves between godowns.',
    [Permissions.CreatePurchase]: 'Record supplier bills; shows cost prices.',
    [Permissions.CreatePurchaseReturn]: 'Send goods back and raise a debit note.',
    [Permissions.ManageItems]: 'Includes prices, groups and opening stock.',
    [Permissions.ManageItemGroup]: 'Create and manage item categories and groups.',
    [Permissions.PrintQR]: 'Print QR code labels for inventory items.',
    [Permissions.ViewAccount]: 'Access to the account/profile page.',
    [Permissions.ManageEditProfile]: 'Name, phone and password.',
    [Permissions.SetPermissions]: 'Configure role-based permissions — high privilege action.',
    [Permissions.ManageUsers]: 'Add, edit, or deactivate staff user accounts.',
    [Permissions.CreateUsers]: 'Invite and create new staff accounts.',
    [Permissions.HiddenProFeatures]: 'Unlocks all advanced Pro-tier features across the app.',
    [Permissions.ViewReports]: 'Needed for every report and setting below.',
    [Permissions.ViewFilterbutton]: 'Use date and category filters on dashboard widgets.',
    [Permissions.ViewPurchaseTransactions]: 'View the purchase-side transaction history.',
    [Permissions.ViewEditReturn]: 'View and edit processed return entries.',
    [Permissions.ViewDownloadPDF]: 'Download transaction receipts and reports as PDF.',
    [Permissions.SalesmanwiseBilling]: 'Assign a specific salesperson to each sale at billing.',
    [Permissions.ItemwiseDiscount]: 'Apply different discount rates per item in a sale.',
    [Permissions.PurchaseTaxtype]: 'Choose the tax type applied on purchase entries.',
    [Permissions.ViewAddons]: 'Browse paid add-ons (can\'t buy).',
    [Permissions.ChangeViewtype]: 'Switch between list and grid view on item screens.',
    [Permissions.RoundingOff]: 'Automatically round off the final bill amount.',
    [Permissions.LockDiscountPrice]: 'Prevent cashiers from manually editing discounted prices.',
    [Permissions.AllowDueBilling]: 'Allow saving a sale with a pending/due payment.',
    [Permissions.ManageSalesSetting]: 'Billing view, GST, discounts, vouchers.',
    [Permissions.ManagePurchaseSetting]: 'Purchase bill fields and rules.',
    [Permissions.ManageItemSetting]: 'Which item fields are required.',
    [Permissions.ManageBillSetting]: 'Printed bill layout and footer.',
};

// UI-only: plain display names
const PERMISSION_LABELS: Partial<Record<Permissions, string>> = {
    // Home dashboard
    [Permissions.ViewDashboard]: 'Open Home dashboard',
    [Permissions.ViewFilter]: 'Change date range',
    [Permissions.ViewHidebutton]: 'Hide / show figures',
    [Permissions.ViewSalescard]: 'Sales total card',
    [Permissions.ViewSalesbarchart]: 'Sales chart',
    [Permissions.ViewTopSalesperson]: 'Top salespeople',
    [Permissions.ViewTopSoldItems]: 'Top selling items',
    [Permissions.ViewTopCustomers]: 'Top customers',
    [Permissions.Viewrestockcard]: 'Restock card',
    [Permissions.ViewAttendance]: 'Attendance card',
    // Sales
    [Permissions.CreateSales]: 'Create sale bills',
    [Permissions.CreateSalesReturn]: 'Create sales returns',
    // Purchases
    [Permissions.CreatePurchase]: 'Create purchase bills',
    [Permissions.CreatePurchaseReturn]: 'Create purchase returns',
    // Items & inventory
    [Permissions.ManageItems]: 'Add, edit and delete items',
    [Permissions.ViewCatalogue]: 'Open catalogue',
    // Reports
    [Permissions.ViewReports]: 'Open Reports & Settings tabs',
    [Permissions.ViewSalesReport]: 'Sales report',
    [Permissions.ViewPurchaseReport]: 'Purchase report',
    [Permissions.ViewPNLReport]: 'Profit & loss',
    [Permissions.ViewItemReport]: 'Item report',
    [Permissions.ViewItemSoldReport]: 'Items sold report',
    [Permissions.ViewCustomerReport]: 'Customer report',
    [Permissions.ViewExpenseReport]: 'Expense report',
    [Permissions.ViewPartyLedger]: 'Party ledger',
    [Permissions.ViewTaxReport]: 'Tax report',
    [Permissions.ViewStockTransferReport]: 'Stock transfer report',
    // Settings
    [Permissions.ManageSalesSetting]: 'Sales settings',
    [Permissions.ManagePurchaseSetting]: 'Purchase settings',
    [Permissions.ManageItemSetting]: 'Item settings',
    [Permissions.ManageBillSetting]: 'Bill settings',
    // Account
    [Permissions.ManageEditProfile]: 'Edit own profile',
    [Permissions.ViewAddons]: 'See add-ons',
};

// UI-only: small warning chips next to sensitive permissions
const PERMISSION_TAGS: Partial<Record<Permissions, string>> = {
    [Permissions.CreatePurchase]: 'Shows cost prices',
    [Permissions.ViewPurchaseReport]: 'Shows cost prices',
    [Permissions.ViewItemReport]: 'Shows cost prices',
    [Permissions.ViewPNLReport]: 'Shows profit',
};

// UI-only: rows drawn indented under "Open Reports & Settings tabs" (no logic attached)
const NESTED_PERMISSIONS: Permissions[] = [
    Permissions.ViewSalesReport,
    Permissions.ViewPurchaseReport,
    Permissions.ViewPNLReport,
    Permissions.ViewItemReport,
    Permissions.ViewItemSoldReport,
    Permissions.ViewCustomerReport,
    Permissions.ViewExpenseReport,
    Permissions.ViewPartyLedger,
    Permissions.ViewTaxReport,
    Permissions.ViewStockTransferReport,
    Permissions.ManageSalesSetting,
    Permissions.ManagePurchaseSetting,
    Permissions.ManageItemSetting,
    Permissions.ManageBillSetting,
];

// UI-only: SELLAR group header meta. tint = [chip bg, chip text]
const GROUP_META: Record<string, { title: string; navLabel: string; subtitle: string; tint: [string, string]; icon: string[] }> = {
    dashboard: {
        title: 'Home dashboard',
        navLabel: 'Home',
        subtitle: 'Which cards they see on Home',
        tint: ['bg-[#e6eeff]', 'text-[#155dfc]'],
        icon: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
    },
    sales: {
        title: 'Sales',
        navLabel: 'Sales',
        subtitle: 'Billing at the counter',
        tint: ['bg-[#e6eeff]', 'text-[#155dfc]'],
        icon: ['M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M14 3v5h5M9 13h6M9 17h4'],
    },
    purchases: {
        title: 'Purchases',
        navLabel: 'Purchases',
        subtitle: 'Stock coming in from suppliers',
        tint: ['bg-[#e9faef]', 'text-[#008236]'],
        icon: ['M21 8 12 3 3 8v8l9 5 9-5z', 'M3 8l9 5 9-5M12 13v8'],
    },
    inventory: {
        title: 'Items & inventory',
        navLabel: 'Items & inventory',
        subtitle: 'Your item list',
        tint: ['bg-[#fff3dd]', 'text-[#bb4d00]'],
        icon: ['M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z', 'M7.5 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'],
    },
    reports: {
        title: 'Reports',
        navLabel: 'Reports',
        subtitle: 'Figures about the business',
        tint: ['bg-[#e9faef]', 'text-[#008236]'],
        icon: ['M3 3v18h18', 'M8 16v-4M13 16V8M18 16v-6'],
    },
    settingsAccess: {
        title: 'Settings',
        navLabel: 'Settings',
        subtitle: 'Change how the shop works — needs Reports & Settings tab',
        tint: ['bg-[#ffe8f8]', 'text-[#c4009a]'],
        icon: [
            'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12',
            'M16 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
            'M10 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
            'M18 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
        ],
    },
    Account: {
        title: 'Account',
        navLabel: 'Account',
        subtitle: 'Their own profile and extras',
        tint: ['bg-[#ffe8f8]', 'text-[#c4009a]'],
        icon: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21a8 8 0 0 1 16 0'],
    },
};

const OTHER_GROUP_META = {
    title: 'Other',
    navLabel: 'Other',
    subtitle: 'Additional permissions',
    tint: ['bg-[#e6eeff]', 'text-[#155dfc]'] as [string, string],
    icon: ['M5 12h.01M12 12h.01M19 12h.01'],
};

export const getDefaultPermissions = (role: string): Permissions[] => {
    // @ts-ignore - allows string indexing if ROLES enum types mismatch slightly
    if (DEFAULT_PERMISSIONS_MAP[role]) {
        // @ts-ignore
        return DEFAULT_PERMISSIONS_MAP[role];
    }
    if (role === ROLES.OWNER) return Object.values(Permissions);
    return [];
};

export const getSafePermissionsToSave = (
    role: string,
    currentPermissions: Permissions[],
    userPlan: string
): Permissions[] => {

    let safePermissions = currentPermissions;

    if (userPlan === PLANS.POS_BASIC) {
        safePermissions = safePermissions.filter(p => BASIC_ALLOWED_PERMISSIONS.includes(p));
    }

    if (role === ROLES.OWNER) {
        return safePermissions.filter(p => !EXCLUDED_OWNER_PERMISSIONS.includes(p));
    }

    return safePermissions;
};

const permissionGroups = {
    dashboard: {
        title: 'Dashboard & General',
        permissions: [
            Permissions.ViewDashboard,
            Permissions.ViewFilter,
            Permissions.ViewHidebutton,
            Permissions.ViewTopSalesperson,
            Permissions.ViewAttendance,
            Permissions.ViewSalescard,
            Permissions.ViewSalesbarchart,
            Permissions.Viewrestockcard,
            Permissions.ViewTopSoldItems,
            Permissions.ViewTopCustomers,

        ],
    },
    sales: {
        title: 'Sales',
        permissions: [
            Permissions.CreateSales,
            Permissions.CreateSalesReturn,
            //Permissions.SalesmanwiseBilling,
        ],
    },
    purchases: {
        title: 'Purchases',
        permissions: [
            Permissions.CreatePurchase,
            Permissions.CreatePurchaseReturn,
        ],
    },
    inventory: {
        title: 'Inventory Management',
        permissions: [
            Permissions.ManageItems,
            //Permissions.ManageItemGroup,
            Permissions.ViewCatalogue,
        ],
    },
    reports: {
        title: 'Report and Insight',
        permissions: [
            Permissions.ViewReports,
            Permissions.ViewSalesReport,
            Permissions.ViewPNLReport,
            Permissions.ViewPurchaseReport,
            Permissions.ViewItemReport,
            Permissions.ViewItemSoldReport,
            Permissions.ViewCustomerReport,
            Permissions.ViewExpenseReport,
            Permissions.ViewPartyLedger,
            Permissions.ViewTaxReport,
            Permissions.ViewStockTransferReport,
        ],
    },
    settingsAccess: {
        title: 'Settings Access',
        permissions: [
            Permissions.ManageSalesSetting,
            Permissions.ManagePurchaseSetting,
            Permissions.ManageItemSetting,
            Permissions.ManageBillSetting,
        ],
    },

    Account: {
        title: 'Account & Management',
        permissions: [
            Permissions.ManageEditProfile,
            Permissions.ViewAddons,
            //Permissions.CreateUsers,
        ],
    },
    // billing: {
    //     title: 'Billing & POS Behaviour',
    //     permissions: [
    //         Permissions.ItemwiseDiscount,
    //         Permissions.RoundingOff,
    //         Permissions.LockDiscountPrice,
    //         Permissions.AllowDueBilling,
    //         //Permissions.ChangeViewtype,
    //         //Permissions.ViewDownloadPDF,
    //         Permissions.ViewEditReturn,
    //         //Permissions.ViewPurchaseTransactions,
    //     ],
    // },
    // stockControl: {
    //     title: 'Stock Control',
    //     permissions: [
    //         Permissions.AllownegativeStock,
    //         Permissions.PurchaseTaxtype,
    //     ],
    // },
    // userManagement: {
    //     title: 'User Management',
    //     permissions: [
    //         //Permissions.ViewPaymentmethods,
    //         //Permissions.ViewFilterbutton,
    //         Permissions.ViewAccount,
    //         //Permissions.PrintQR,
    //         //Permissions.ViewTransactions,
    //     ],
    // },
};
const HIDDEN_FROM_UI_PERMISSIONS = [
    Permissions.HiddenProFeatures,
    Permissions.ViewPartnerDashboard,
    Permissions.SetPermissions,
    Permissions.ManageUsers,
    Permissions.ViewTransactions,
    Permissions.ViewFilterbutton,
    Permissions.PrintQR,
    Permissions.ViewPaymentmethods,
    Permissions.AllownegativeStock,
    Permissions.PurchaseTaxtype,
    Permissions.ViewDownloadPDF,
    Permissions.ViewPurchaseTransactions,
    Permissions.SalesmanwiseBilling,
    Permissions.ChangeViewtype,
    Permissions.ViewEditReturn,
    Permissions.LockDiscountPrice,
    Permissions.AllowDueBilling,
    Permissions.ItemwiseDiscount,
    Permissions.RoundingOff,
    Permissions.ViewAccount,
    Permissions.CreateUsers,
    Permissions.ManageItemGroup,
];
const getUngroupedPermissions = (allPermissions: Permissions[]): Permissions[] => {
    const grouped = new Set<Permissions>();
    Object.values(permissionGroups).forEach(group => {
        group.permissions.forEach(perm => grouped.add(perm));
    });
    return allPermissions.filter(perm => !grouped.has(perm) && !HIDDEN_FROM_UI_PERMISSIONS.includes(perm));
};

// ---------- UI-only helpers ----------

type GroupMeta = { title: string; navLabel: string; subtitle: string; tint: [string, string]; icon: string[] };

// Staff shown in the right panel (Manager / Salesman lists)
interface StaffMember {
    id: string;
    name: string;
    role: string;
    lastActive?: string;
}

const toDate = (v: any): Date | null => {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const formatLastActive = (d?: Date | null, isSelf?: boolean): string | null => {
    if (isSelf) return 'Now';
    if (!d) return null;
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} h ago`;
    if (hrs < 48) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const sameRole = (a?: string, b?: string) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();

const Ico: React.FC<{ paths: string[]; size?: number; strokeWidth?: number }> = ({ paths, size = 18, strokeWidth = 1.8 }) => (
    <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
);

const ICON_SEARCH = ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'm20 20-3.5-3.5'];
const ICON_CHECK = ['M5 12.5l4.5 4.5L19 7'];
const ICON_SHIELD = ['M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z', 'm9 12 2 2 4-4'];
const ICON_LOCK = ['M7 11h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2z', 'M8 11V7a4 4 0 0 1 8 0v4'];
const ICON_USERS = ['M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3'];

const CARD_CLASS =
    'bg-white border border-[#dfe6fb] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]';

// ---------- loading skeleton: same frame as the page, grey blocks for the data ----------
const Bone: React.FC<{ className?: string }> = ({ className = '' }) => (
    <span aria-hidden="true" className={`block rounded-sm bg-[#e4e9f7] motion-safe:animate-pulse ${className}`} />
);

const SkeletonRow: React.FC<{ cells: number; wide?: boolean }> = ({ cells, wide }) => (
    <div className="flex items-center gap-3 px-3.5 py-3 border-t border-[#dfe6fb]">
        <div className="flex-1 min-w-0 grid gap-1.5">
            <Bone className={`h-3.5 ${wide ? 'w-2/5' : 'w-1/3'}`} />
            <Bone className={`h-2.5 ${wide ? 'w-3/5' : 'w-1/2'}`} />
        </div>
        {Array.from({ length: cells }, (_, i) => (
            <span key={i} className="w-28 shrink-0 flex justify-center max-xl:w-auto">
                <Bone className="h-5 w-5" />
            </span>
        ))}
    </div>
);

const SkeletonSection: React.FC<{ rows: number; cells: number }> = ({ rows, cells }) => (
    <div>
        <div className="flex items-center gap-3 px-3.5 py-3">
            <Bone className="h-8 w-8 shrink-0" />
            <div className="flex-1 grid gap-1.5">
                <Bone className="h-4 w-32" />
                <Bone className="h-2.5 w-48 max-xl:hidden" />
            </div>
            {Array.from({ length: cells }, (_, i) => (
                <span key={i} className="w-28 shrink-0 grid justify-items-center gap-1.5 max-xl:w-auto">
                    <Bone className="h-2.5 w-10" />
                    <Bone className="h-2.5 w-12" />
                </span>
            ))}
        </div>
        {Array.from({ length: rows }, (_, i) => (
            <SkeletonRow key={i} cells={cells} wide={i % 2 === 0} />
        ))}
    </div>
);

const PermissionsSkeleton: React.FC = () => (
    <div className="bg-[#eef2ff] min-h-screen pb-24 xl:pb-0" aria-busy="true">
        <span className="sr-only" role="status">Loading permissions…</span>

        {/* Header — real, so Back works while the data loads */}
        <div className="bg-white border-b border-[#dfe6fb] sticky top-0 z-30">
            <div className="flex items-center gap-3 px-3 py-3 xl:px-6 xl:py-4">
                <BackButton />
                <div className="min-w-0">
                    <div className="hidden xl:block whitespace-nowrap text-xs text-[#5b6b86]">Settings / Manage users /</div>
                    <h1 className="text-xl xl:text-[22px] font-semibold text-[#0f172b] leading-tight">Permissions</h1>
                    <div className="xl:hidden text-xs text-[#5b6b86]">Settings</div>
                </div>
                <span className="hidden xl:block self-end pb-1 text-xs text-[#5b6b86]">
                    What managers and salesmen can see and do
                </span>
                <Bone className="hidden xl:block ml-auto h-[38px] w-[260px]" />
            </div>
        </div>

        {/* Mobile / tablet */}
        <div className="xl:hidden max-w-2xl mx-auto">
            <div className="px-4 py-2.5 bg-white border-b border-[#dfe6fb]">
                <Bone className="h-10 w-full" />
            </div>
            <div className="px-4 pt-3 grid gap-3">
                <div className={`${CARD_CLASS} px-3.5 py-3 grid gap-2`}>
                    <Bone className="h-4 w-44" />
                    <Bone className="h-1.5 w-full" />
                </div>
                {[3, 4, 2].map((rows, i) => (
                    <div key={i} className={`${CARD_CLASS} overflow-hidden`}>
                        <SkeletonSection rows={rows} cells={1} />
                    </div>
                ))}
            </div>
        </div>

        {/* Desktop */}
        <div className="hidden xl:grid grid-cols-[184px_minmax(0,1fr)_264px] gap-5 px-6 py-5 items-start">
            <div className="grid gap-1.5">
                {Array.from({ length: 6 }, (_, i) => (
                    <Bone key={i} className="h-8 w-full" />
                ))}
            </div>

            <div className="grid gap-4 min-w-0">
                <Bone className="h-10 w-full !bg-[#e6eeff]" />
                <div className={`${CARD_CLASS} overflow-hidden`}>
                    <div className="flex items-center gap-3 px-3.5 py-3 bg-[#f5f7ff]">
                        <Bone className="h-2.5 w-20 flex-1 max-w-20" />
                        <span className="flex-1" />
                        {[0, 1].map(i => (
                            <span key={i} className="w-28 shrink-0 flex justify-center">
                                <Bone className="h-[22px] w-20" />
                            </span>
                        ))}
                    </div>
                    <SkeletonSection rows={3} cells={2} />
                    <div className="border-t border-[#dfe6fb]">
                        <SkeletonSection rows={2} cells={2} />
                    </div>
                </div>
            </div>

            <div className="grid gap-3">
                <div className={`${CARD_CLASS} px-4 py-3.5 grid gap-3`}>
                    <Bone className="h-4 w-32" />
                    {[0, 1].map(i => (
                        <div key={i} className="grid gap-1.5">
                            <Bone className="h-3 w-full" />
                            <Bone className="h-1.5 w-full" />
                        </div>
                    ))}
                </div>
                <div className={`${CARD_CLASS} px-4 py-3.5 grid gap-3`}>
                    {[0, 1, 2].map(i => (
                        <div key={i} className="flex items-center gap-2.5">
                            <Bone className="h-8 w-8 shrink-0" />
                            <div className="flex-1 grid gap-1.5">
                                <Bone className="h-3 w-3/4" />
                                <Bone className="h-2.5 w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
);

const getInitials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';

interface CbProps {
    checked: boolean;
    disabled?: boolean;
    locked?: boolean;
    label: string;
    title?: string;
    onToggle: () => void;
}

// Custom checkbox (SELLAR .cb)
const Cb: React.FC<CbProps> = ({ checked, disabled, locked, label, title, onToggle }) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        title={title}
        disabled={disabled}
        onClick={onToggle}
        className={`w-5 h-5 shrink-0 p-0 inline-grid place-items-center rounded-sm border-[1.5px] text-white transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]
            ${locked
                ? 'bg-[#f5f7ff] border-[#dfe6fb] text-[#5b6b86] cursor-not-allowed'
                : checked
                    ? 'bg-[#155dfc] border-[#155dfc]'
                    : 'bg-white border-[#7a8aa3]'}
            ${disabled && !locked ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
        {checked && <Ico paths={ICON_CHECK} size={13} strokeWidth={3} />}
    </button>
);

const ManagePermissionsPage: React.FC = () => {
    const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>({});
    // Last saved copy, used to show "Changed" cells and unsaved-change counts
    const [savedPermissions, setSavedPermissions] = useState<RolePermissionsMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const { currentUser } = useAuth();
    const currentPlan = currentUser?.plan || PLANS.POS_BASIC;
    const isBasicPlan = currentPlan === PLANS.POS_BASIC;

    const [isResetOpen, setIsResetOpen] = useState(false);
    const [resetRoles, setResetRoles] = useState<string[]>([]);

    const [searchQuery, setSearchQuery] = useState('');
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const [activeSection, setActiveSection] = useState<string | null>(null);

    // Staff list (same source as Manage Users: companies/{companyId}/users)
    const [staff, setStaff] = useState<StaffMember[]>([]);

    const ALL_ROLES = useMemo(() => Object.values(ROLES), []);

    // Define all roles you want to hide from this management screen
    const EXCLUDED_ROLES_FROM_UI = [ROLES.OWNER, ROLES.AGENCY, ROLES.AGENT];

    const VISIBLE_ROLES = useMemo(() => {
        return ALL_ROLES.filter(r => !EXCLUDED_ROLES_FROM_UI.includes(r));
    }, [ALL_ROLES]);

    const allPermissions = useMemo(() => Object.values(Permissions), []);
    const ungroupedPermissions = useMemo(() => getUngroupedPermissions(allPermissions), [allPermissions]);

    const [selectedRole, setSelectedRole] = useState<string>(VISIBLE_ROLES[0] || 'Manager');

    const handleResetPermissions = () => {
        setRolePermissions(prev => {
            const next = { ...prev };
            resetRoles.forEach(role => { next[role] = getDefaultPermissions(role); });
            return next;
        });
        setIsResetOpen(false);
    };

    const openReset = (roles: string[]) => {
        setResetRoles(roles);
        setIsResetOpen(true);
    };

    useEffect(() => {
        if (!currentUser?.companyId) {
            setLoading(false);
            return;
        }
        const companyId = currentUser.companyId;


        const fetchAndEnsurePermissions = async () => {
            try {
                const permissionsMap: RolePermissionsMap = {};
                const permissionsCollectionRef = collection(db, 'companies', companyId, 'permissions');

                for (const role of ALL_ROLES) {
                    const docRef = doc(permissionsCollectionRef, role);
                    const docSnap = await getDoc(docRef);

                    let finalPermissions: Permissions[] = [];
                    let shouldUpdateDB = false;

                    if (docSnap.exists()) {
                        let storedData = docSnap.data().allowedPermissions || [];
                        if (typeof storedData === 'string') {
                            try { storedData = JSON.parse(storedData); } catch { storedData = []; }
                        }

                        if (role === ROLES.OWNER) {
                            finalPermissions = getSafePermissionsToSave(role, Object.values(Permissions), currentPlan);
                            shouldUpdateDB = true;
                        } else {
                            // Sirf nayi defaults merge hongi (jo syncedDefaults me nahi hain),
                            // taaki user ki disable ki hui permission wapas na aaye.
                            const defaults = getDefaultPermissions(role);
                            const stamp = docSnap.data().syncedDefaults;
                            const hasStamp = Array.isArray(stamp);
                            // Purane docs (stamp nahi) ke liye current defaults ko already-synced maano
                            const alreadySynced: string[] = hasStamp ? stamp : defaults;
                            const newDefaults = defaults.filter(p => !alreadySynced.includes(p));
                            const merged = Array.from(new Set([...storedData, ...newDefaults]));
                            if (newDefaults.length > 0 || !hasStamp) shouldUpdateDB = true;
                            finalPermissions = getSafePermissionsToSave(role, merged, currentPlan);
                        }
                    } else {
                        console.warn(`No permissions for ${role}, using defaults.`);
                        const defaults = getDefaultPermissions(role);
                        finalPermissions = getSafePermissionsToSave(role, defaults, currentPlan);
                        shouldUpdateDB = true;
                    }

                    if (shouldUpdateDB) {
                        await setDoc(docRef, {
                            allowedPermissions: finalPermissions,
                            syncedDefaults: getDefaultPermissions(role),
                            companyId: companyId,
                            role: role
                        }, { merge: true });
                    }

                    permissionsMap[role] = finalPermissions;
                }

                setRolePermissions(permissionsMap);
                setSavedPermissions(permissionsMap);
            } catch (err) {
                console.error("Error fetching permissions:", err);
                setError("Failed to load permissions.");
            } finally {
                setLoading(false);
            }
        };

        fetchAndEnsurePermissions();
    }, [ALL_ROLES, currentUser?.companyId]);

    // Read-only fetch of company users for the right panel / role counts
    useEffect(() => {
        if (!currentUser?.companyId) return;
        const companyId = currentUser.companyId;
        const fetchStaff = async () => {
            try {
                const snap = await getDocs(collection(db, 'companies', companyId, 'users'));
                const list: StaffMember[] = [];
                snap.forEach((d) => {
                    const data = d.data();
                    list.push({
                        id: d.id,
                        name: data.name || data.email || 'No Name',
                        role: data.role || '',
                        lastActive:
                            formatLastActive(toDate(data.lastLoginAt ?? data.lastActive), d.id === currentUser?.uid) ?? 'Never',
                    });
                });
                setStaff(list);
            } catch (err) {
                console.error('Error fetching staff:', err);
            }
        };
        fetchStaff();
    }, [currentUser?.companyId, currentUser?.uid]);

    // Highlight the left-nav item of the section being read
    useEffect(() => {
        if (loading) return;
        const els = Array.from(document.querySelectorAll('[data-perm-section]'));
        if (!els.length) return;
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setActiveSection((entry.target as HTMLElement).dataset.permSection || null);
                    }
                });
            },
            { rootMargin: '-15% 0px -75% 0px' }
        );
        els.forEach(el => observer.observe(el));
        return () => observer.disconnect();
    }, [loading, searchQuery]);

    const handlePermissionChange = (role: string, permission: Permissions, isChecked: boolean) => {
        setRolePermissions(prev => {
            const currentPermissions = prev[role] || [];
            if (isChecked) {
                return { ...prev, [role]: [...new Set([...currentPermissions, permission])] };
            } else {
                return { ...prev, [role]: currentPermissions.filter(p => p !== permission) };
            }
        });
    };

    // Select all / Clear all for one group of one role (skips plan-locked rows)
    const handleToggleGroup = (role: string, perms: Permissions[], select: boolean) => {
        setRolePermissions(prev => {
            const current = prev[role] || [];
            const eligible = perms.filter(p => !(isBasicPlan && !BASIC_ALLOWED_PERMISSIONS.includes(p)));
            if (select) {
                const masterOn = perms.includes(Permissions.ViewReports) || current.includes(Permissions.ViewReports);
                const toAdd = eligible.filter(p => !(NESTED_PERMISSIONS.includes(p) && !masterOn));
                return { ...prev, [role]: [...new Set([...current, ...toAdd])] };
            }
            return { ...prev, [role]: current.filter(p => !eligible.includes(p)) };
        });
    };

    const handleSaveChanges = async (roles: string | string[]) => {
        if (!currentUser?.companyId) return;
        const roleList = Array.isArray(roles) ? roles : [roles];

        try {
            setSuccessMessage(null); setError(null);

            const nextSaved: RolePermissionsMap = {};
            for (const role of roleList) {
                const rawPermissions = rolePermissions[role] || [];
                const permissionsToSave = getSafePermissionsToSave(role, rawPermissions, currentPlan);

                const docRef = doc(db, 'companies', currentUser.companyId, 'permissions', role);
                await setDoc(docRef, { allowedPermissions: permissionsToSave }, { merge: true });
                nextSaved[role] = rawPermissions;
            }
            setSavedPermissions(prev => ({ ...prev, ...nextSaved }));
            setSuccessMessage(`Permissions for ${roleList.join(' & ')} updated successfully!`);
            setTimeout(() => setSuccessMessage(null), 3000);

        } catch (err) {
            console.error("Error updating permissions:", err);
            setError(`Failed to update permissions for ${roleList.join(' & ')}.`);
        }
    };

    const handleDiscard = (roles: string[]) => {
        setRolePermissions(prev => {
            const next = { ...prev };
            roles.forEach(role => { next[role] = savedPermissions[role] || []; });
            return next;
        });
    };

    if (loading) return <PermissionsSkeleton />;

    // ---------- derived UI values ----------
    const has = (role: string, p: Permissions) => (rolePermissions[role] || []).includes(p);
    const wasSaved = (role: string, p: Permissions) => (savedPermissions[role] || []).includes(p);
    const isChanged = (role: string, p: Permissions) => has(role, p) !== wasSaved(role, p);
    const countOn = (role: string, perms: Permissions[]) => perms.filter(p => has(role, p)).length;
    const roleUserCount = (role: string) => staff.filter(s => sameRole(s.role, role)).length;

    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = (p: Permissions) =>
        !query ||
        (PERMISSION_LABELS[p] || String(p)).toLowerCase().includes(query) ||
        (PERMISSION_DESCRIPTIONS[p] || '').toLowerCase().includes(query);

    const allGroupsFull: { key: string; meta: GroupMeta; perms: Permissions[] }[] = [
        ...Object.entries(permissionGroups).map(([key, g]) => ({
            key,
            meta: GROUP_META[key] || { ...OTHER_GROUP_META, title: g.title },
            perms: g.permissions as Permissions[],
        })),
        ...(ungroupedPermissions.length > 0
            ? [{ key: 'other', meta: OTHER_GROUP_META as GroupMeta, perms: ungroupedPermissions }]
            : []),
    ];
    const visibleAllPermissions = allGroupsFull.reduce<Permissions[]>((acc, g) => acc.concat(g.perms), []);
    const totalPermissions = visibleAllPermissions.length;

    const groupsView = allGroupsFull
        .map(g => ({ ...g, perms: g.perms.filter(matchesSearch) }))
        .filter(g => g.perms.length > 0);

    // Unsaved changes
    type Change = { role: string; permission: Permissions; added: boolean };
    const changes: Change[] = [];
    VISIBLE_ROLES.forEach(role => {
        visibleAllPermissions.forEach(p => {
            if (isChanged(role, p)) changes.push({ role, permission: p, added: has(role, p) });
        });
    });
    const changedRoles = VISIBLE_ROLES.filter(r => changes.some(c => c.role === r));
    const selectedChanges = changes.filter(c => c.role === selectedRole);
    const changeSummary = changedRoles
        .map(role =>
            `${role}: ` +
            changes
                .filter(c => c.role === role)
                .map(c => `${c.added ? '+' : '−'} ${PERMISSION_LABELS[c.permission] || c.permission}`)
                .join(' · ')
        )
        .join('   |   ');

    const reportsOffEverywhere = VISIBLE_ROLES.every(r => !has(r, Permissions.ViewReports));

    // ---------- shared row pieces ----------
    const renderName = (permission: Permissions) => {
        const lockedByPlan = isBasicPlan && !BASIC_ALLOWED_PERMISSIONS.includes(permission);
        const tag = PERMISSION_TAGS[permission];
        const description = PERMISSION_DESCRIPTIONS[permission];
        const nested = NESTED_PERMISSIONS.includes(permission);
        return (
            <div className={nested ? 'relative pl-[22px]' : ''}>
                {nested && (
                    <span className="absolute left-1.5 -top-1 w-[9px] h-[13px] border-l-[1.5px] border-b-[1.5px] border-[#7a8aa3] rounded-bl" />
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[#0f172b]">{PERMISSION_LABELS[permission] || permission}</span>
                    {tag && (
                        <span className="text-[10px] font-medium px-2 py-px rounded-full bg-[#fff3dd] text-[#bb4d00]">{tag}</span>
                    )}
                    {lockedByPlan && (
                        <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded w-max border border-orange-200">
                            UPGRADE REQUIRED
                        </span>
                    )}
                </div>
                {description && <p className="text-xs text-[#5b6b86] mt-px">{description}</p>}
            </div>
        );
    };

    const renderCb = (role: string, permission: Permissions) => {
        const lockedByPlan = isBasicPlan && !BASIC_ALLOWED_PERMISSIONS.includes(permission);
        const checked = has(role, permission);
        const blockedByReports =
            NESTED_PERMISSIONS.includes(permission) && !has(role, Permissions.ViewReports) && !checked;
        return (
            <Cb
                checked={checked}
                locked={lockedByPlan}
                disabled={lockedByPlan || blockedByReports}
                label={`${role}: ${PERMISSION_LABELS[permission] || permission}`}
                title={lockedByPlan ? 'Upgrade to Pro/Enterprise to unlock' : blockedByReports ? 'Turn on "Open Reports & Settings tabs" first' : undefined}
                onToggle={() => handlePermissionChange(role, permission, !checked)}
            />
        );
    };

    const groupToggleLabel = (role: string, perms: Permissions[]) =>
        countOn(role, perms) === perms.length ? 'Clear all' : 'Select all';

    const searchField = (extra = '') => (
        <label className={`flex items-center gap-2 h-[38px] px-3 border border-[#7a8aa3] rounded-sm bg-white text-[#5b6b86] ${extra}`}>
            <Ico paths={ICON_SEARCH} size={16} />
            <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find a permission"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[#0f172b] placeholder:text-[#5b6b86]"
            />
        </label>
    );

    const messages = (
        <>
            {error && <div className="px-3 py-2.5 rounded-sm bg-[#ffeef0] text-[#d5000c] text-[13px] font-medium">{error}</div>}
            {successMessage && <div className="px-3 py-2.5 rounded-sm bg-[#e9faef] text-[#008236] text-[13px] font-medium">{successMessage}</div>}
        </>
    );

    const emptySearch = groupsView.length === 0 && (
        <div className={`${CARD_CLASS} px-4 py-8 text-center text-sm text-[#5b6b86]`}>
            No permission matches “{searchQuery}”. Try a shorter word.
        </div>
    );

    return (
        <div className="bg-[#eef2ff] min-h-screen pb-44 md:pb-24 xl:pb-0">
            {/* ============ HEADER ============ */}
            <div className="bg-white border-b border-[#dfe6fb] sticky top-0 z-30">
                <div className="flex items-center gap-3 px-3 py-3 xl:px-6 xl:py-4">
                    <BackButton />
                    <div className="min-w-0">
                        <div className="hidden xl:block whitespace-nowrap text-xs text-[#5b6b86]">Settings / Manage users /</div>
                        <h1 className="text-xl xl:text-[22px] font-semibold text-[#0f172b] leading-tight">Permissions</h1>
                        <div className="xl:hidden text-xs text-[#5b6b86]">Settings</div>
                    </div>
                    <span className="hidden xl:block self-end pb-1 text-xs text-[#5b6b86]">
                        What managers and salesmen can see and do
                    </span>
                    {searchField('hidden xl:flex ml-auto w-[260px]')}
                    <button
                        type="button"
                        aria-label="Search permissions"
                        onClick={() => setShowMobileSearch(v => !v)}
                        className="xl:hidden ml-auto w-10 h-10 inline-grid place-items-center rounded-sm text-[#0f172b] hover:bg-[#f5f7ff]"
                    >
                        <Ico paths={ICON_SEARCH} />
                    </button>
                </div>
                {showMobileSearch && <div className="xl:hidden px-4 pb-3">{searchField()}</div>}
            </div>

            {/* ============ MOBILE / TABLET ============ */}
            <div className="xl:hidden max-w-2xl mx-auto">
                <div className="px-4 py-2.5 bg-white border-b border-[#dfe6fb]">
                    <div
                        role="group"
                        className="bg-[#f5f7ff] border border-[#dfe6fb] p-[3px] rounded-sm grid gap-0.5"
                        style={{ gridTemplateColumns: `repeat(${VISIBLE_ROLES.length || 1}, minmax(0, 1fr))` }}
                    >
                        {VISIBLE_ROLES.map(role => (
                            <button
                                key={role}
                                type="button"
                                aria-pressed={selectedRole === role}
                                onClick={() => setSelectedRole(role)}
                                className={`py-2 rounded-sm text-sm font-medium capitalize transition-all ${selectedRole === role ? 'bg-white text-[#155dfc] shadow-sm' : 'text-[#45556c]'}`}
                            >
                                {role}{staff.length > 0 ? ` · ${roleUserCount(role)}` : ''}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="px-4 pt-3 grid gap-3">
                    {messages}

                    {/* Progress card with Reset on the same row */}
                    <div className={`${CARD_CLASS} px-3.5 py-3 flex items-center gap-2.5`}>
                        <div className="flex-1 min-w-0">
                            <b className="text-sm font-semibold text-[#0f172b] capitalize">
                                {selectedRole} can do {countOn(selectedRole, visibleAllPermissions)} of {totalPermissions}
                            </b>
                            <div className="h-1.5 rounded-full bg-[#f5f7ff] overflow-hidden mt-1.5">
                                <div
                                    className="h-full bg-[#155dfc] rounded-full"
                                    style={{ width: `${totalPermissions ? (countOn(selectedRole, visibleAllPermissions) / totalPermissions) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => openReset([selectedRole])}
                            className="h-8 px-3 rounded-sm text-[13px] font-medium text-[#5b6b86] hover:bg-[#f5f7ff]"
                        >
                            Reset
                        </button>
                    </div>

                    {groupsView.map(({ key, meta, perms }) => (
                        <section key={key} data-perm-section={key} className={`${CARD_CLASS} overflow-hidden`}>
                            <div className="flex items-center gap-3 px-3.5 py-3">
                                <span className={`w-8 h-8 shrink-0 inline-grid place-items-center rounded-sm ${meta.tint[0]} ${meta.tint[1]}`}>
                                    <Ico paths={meta.icon} />
                                </span>
                                <b className="flex-1 min-w-0 text-[15px] font-semibold text-[#0f172b]">{meta.title}</b>
                                <div className="text-right">
                                    <span className="block text-xs text-[#5b6b86] tabular-nums">{countOn(selectedRole, perms)} of {perms.length}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleToggleGroup(selectedRole, perms, countOn(selectedRole, perms) !== perms.length)}
                                        className="text-[11px] font-medium text-[#155dfc]"
                                    >
                                        {groupToggleLabel(selectedRole, perms)}
                                    </button>
                                </div>
                            </div>
                            {perms.map(p => (
                                <div
                                    key={p}
                                    className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-start px-3.5 py-2.5 border-t border-[#dfe6fb]
                                        ${isChanged(selectedRole, p) ? 'bg-[#e6eeff]' : p === Permissions.ViewReports ? 'bg-[#f5f7ff]' : ''}`}
                                >
                                    {renderName(p)}
                                    <div className="pt-0.5">{renderCb(selectedRole, p)}</div>
                                </div>
                            ))}
                        </section>
                    ))}
                    {emptySearch}
                </div>
            </div>

            {/* ============ DESKTOP ============ */}
            {/* lg (1024–1279): table full width, side cards below it. xl (1280+): 3 columns. */}
            <div className="hidden xl:grid grid-cols-1 xl:grid-cols-[184px_minmax(0,1fr)_264px] gap-5 px-4 xl:px-6 py-5 items-start">
                {/* Left: section nav (xl only) */}
                <nav className="hidden xl:grid sticky top-24 gap-0.5">
                    {groupsView.map(({ key, meta, perms }) => (
                        <a
                            key={key}
                            href={`#perm-sec-${key}`}
                            aria-current={activeSection === key ? 'true' : 'false'}
                            onClick={(e) => {
                                e.preventDefault();
                                setActiveSection(key);
                                document.getElementById(`perm-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-sm text-[13px] font-medium no-underline transition-colors
                                ${activeSection === key ? 'bg-[#e6eeff] text-[#155dfc]' : 'text-[#45556c] hover:bg-white'}`}
                        >
                            <Ico paths={meta.icon} size={16} />
                            {meta.navLabel}
                            <small className="ml-auto text-[11px] text-[#5b6b86]">{perms.length}</small>
                        </a>
                    ))}
                </nav>

                {/* Center: info + table */}
                <div className="grid gap-4 min-w-0">
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-sm bg-[#e6eeff] text-[#155dfc] text-[13px] leading-[19px]">
                        <span className="shrink-0"><Ico paths={ICON_SHIELD} size={16} /></span>
                        <span>Tick what each role can do. Changes apply to everyone with that role the next time they open the app. The <b>Owner</b> always has everything.</span>
                    </div>
                    {messages}

                    <div className={`${CARD_CLASS} overflow-x-auto`}>
                        <table className="w-full min-w-[520px] border-collapse">
                            <thead>
                                <tr>
                                    <th className="text-left text-[11px] font-semibold tracking-[0.06em] uppercase text-[#5b6b86] px-3.5 py-2.5 bg-[#f5f7ff] border-b border-[#dfe6fb]">Permission</th>
                                    {VISIBLE_ROLES.map((role, i) => (
                                        <th key={role} className="w-28 text-center px-3.5 py-2.5 bg-[#f5f7ff] border-b border-[#dfe6fb]">
                                            <div className="grid gap-0.5 justify-items-center">
                                                <span className={`inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold tracking-[0.03em] uppercase ${i === 0 ? 'bg-[#e6eeff] text-[#155dfc]' : 'bg-white text-[#45556c] border border-[#dfe6fb]'}`}>
                                                    {role}
                                                </span>
                                                {staff.length > 0 && (
                                                    <span className="text-xs font-normal normal-case tracking-normal text-[#5b6b86]">
                                                        {roleUserCount(role)} users
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {groupsView.map(({ key, meta, perms }) => (
                                    <React.Fragment key={key}>
                                        <tr id={`perm-sec-${key}`} data-perm-section={key} className="scroll-mt-24">
                                            <td className="bg-white px-3.5 pt-3.5 pb-2.5 border-b border-[#dfe6fb]">
                                                <div className="flex items-center gap-3">
                                                    <span className={`w-8 h-8 shrink-0 inline-grid place-items-center rounded-sm ${meta.tint[0]} ${meta.tint[1]}`}>
                                                        <Ico paths={meta.icon} />
                                                    </span>
                                                    <div>
                                                        <b className="text-[15px] font-semibold text-[#0f172b]">{meta.title}</b>
                                                        <small className="block text-xs text-[#5b6b86]">{meta.subtitle}</small>
                                                    </div>
                                                </div>
                                            </td>
                                            {VISIBLE_ROLES.map(role => (
                                                <td key={role} className="bg-white text-center px-3.5 pt-3.5 pb-2.5 border-b border-[#dfe6fb]">
                                                    <span className="block text-xs text-[#5b6b86] tabular-nums mb-1">
                                                        {countOn(role, perms)} of {perms.length}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleGroup(role, perms, countOn(role, perms) !== perms.length)}
                                                        className="text-[11px] font-medium text-[#155dfc] whitespace-nowrap"
                                                    >
                                                        {groupToggleLabel(role, perms)}
                                                    </button>
                                                </td>
                                            ))}
                                        </tr>
                                        {perms.map(p => (
                                            <tr key={p} className={p === Permissions.ViewReports ? '[&>td]:bg-[#f5f7ff]' : ''}>
                                                <td className="px-3.5 py-2.5 border-b border-[#dfe6fb] align-middle">{renderName(p)}</td>
                                                {VISIBLE_ROLES.map(role => (
                                                    <td
                                                        key={role}
                                                        className={`text-center px-3.5 py-2.5 border-b border-[#dfe6fb] align-middle ${isChanged(role, p) ? '!bg-[#e6eeff]' : ''}`}
                                                    >
                                                        <div className="flex justify-center">{renderCb(role, p)}</div>
                                                        {isChanged(role, p) && (
                                                            <span className="block mt-[3px] text-[9px] font-semibold tracking-[0.06em] uppercase text-[#155dfc]">Changed</span>
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {emptySearch}
                </div>

                {/* Right: access at a glance, staff, note (below table on lg, sidebar on xl) */}
                <aside className="grid gap-3 grid-cols-2 xl:grid-cols-1 items-start xl:sticky xl:top-24">
                    <div className={`${CARD_CLASS} px-4 py-3.5 grid gap-2.5`}>
                        <b className="text-sm font-semibold text-[#0f172b]">Access at a glance</b>
                        {VISIBLE_ROLES.map(role => {
                            const on = countOn(role, visibleAllPermissions);
                            return (
                                <div key={role}>
                                    <div className="flex justify-between text-[13px] text-[#0f172b]">
                                        <span className="capitalize">{role}</span>
                                        <span className="tabular-nums"><b>{on}</b> of {totalPermissions}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-[#f5f7ff] overflow-hidden mt-1">
                                        <div className="h-full bg-[#155dfc] rounded-full" style={{ width: `${totalPermissions ? (on / totalPermissions) * 100 : 0}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                        <p className="text-xs text-[#5b6b86]">
                            {reportsOffEverywhere ? 'Neither role can open reports yet. ' : ''}
                            Owner always has all {totalPermissions}.
                        </p>
                    </div>

                    {(
                        <div className={`${CARD_CLASS} px-4 py-3.5 grid gap-2.5`}>
                            {VISIBLE_ROLES.map((role, i) => {
                                const members = staff.filter(s => sameRole(s.role, role));
                                return (
                                    <div key={role} className="grid gap-2">
                                        <b className={`text-sm font-semibold text-[#0f172b] capitalize ${i > 0 ? 'mt-1' : ''}`}>
                                            {role}s <span className="text-xs font-normal text-[#5b6b86]">· {members.length}</span>
                                        </b>
                                        {members.length === 0 && (
                                            <span className="text-xs text-[#5b6b86]">No {role.toLowerCase()}s added yet.</span>
                                        )}
                                        {members.map(m => (
                                            <div key={m.id} className="flex items-center gap-2.5 text-[13px] text-[#0f172b]">
                                                <span
                                                    className={`w-7 h-7 shrink-0 inline-grid place-items-center rounded-full text-[11px] font-semibold ${i === 0 ? 'bg-[#e6eeff] text-[#155dfc]' : 'bg-[#f5f7ff] text-[#45556c]'}`}
                                                >
                                                    {getInitials(m.name)}
                                                </span>
                                                <span className="truncate">{m.name}</span>
                                                {m.lastActive && <span className="ml-auto text-xs text-[#5b6b86] whitespace-nowrap">{m.lastActive}</span>}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#155dfc]">
                                <Ico paths={ICON_USERS} size={16} /> Manage users →
                            </span>
                        </div>
                    )}

                    <div className="col-span-2 xl:col-span-1 flex items-start gap-2 px-3 py-2.5 rounded-sm bg-[#fff3dd] text-[#bb4d00] text-xs leading-[18px]">
                        <span className="mt-0.5 shrink-0"><Ico paths={ICON_LOCK} size={16} /></span>
                        <span>
                            <b>Reports</b> and <b>Settings</b> only work when “Open Reports & Settings tabs” is ticked — the rows under it are greyed out until then.
                        </span>
                    </div>
                </aside>
            </div>

            {/* ============ MODAL ============ */}
            {isResetOpen && (
                <Modal
                    message={`Are you sure you want to reset ${resetRoles.join(' & ')} permissions to default? This cannot be undone.`}
                    type={State.ERROR}
                    showConfirmButton={true}
                    onConfirm={handleResetPermissions}
                    onClose={() => setIsResetOpen(false)}
                />
            )}

            {/* ============ SAVE BAR ============ */}
            <div className="fixed inset-x-0 bottom-16 md:bottom-0 xl:sticky xl:bottom-0 z-40 bg-white border-t border-[#dfe6fb] shadow-[0_-6px_16px_rgba(21,48,140,0.06)] px-4 py-2.5 xl:px-6 xl:py-3">
                {/* Mobile */}
                <div className="xl:hidden max-w-2xl mx-auto flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${selectedChanges.length ? 'bg-[#155dfc]' : 'bg-[#dfe6fb]'}`} />
                    <span className="text-[13px] text-[#0f172b] flex-1 min-w-0 truncate">
                        <b>{selectedChanges.length ? `${selectedChanges.length} change${selectedChanges.length > 1 ? 's' : ''}` : 'No changes'}</b>{' '}
                        <span className="text-xs text-[#5b6b86] capitalize">for {selectedRole}</span>
                    </span>
                    <button
                        type="button"
                        disabled={!selectedChanges.length}
                        onClick={() => handleDiscard([selectedRole])}
                        className="h-9 px-3 rounded-sm text-[13px] font-medium text-[#45556c] hover:bg-[#f5f7ff] disabled:opacity-40"
                    >
                        Discard
                    </button>
                    <button
                        type="button"
                        disabled={!selectedChanges.length}
                        onClick={() => handleSaveChanges(selectedRole)}
                        className="h-9 px-4 rounded-sm bg-[#155dfc] text-white text-[13px] font-medium hover:bg-[#1447e6] disabled:opacity-40 active:scale-95 transition-transform"
                    >
                        Save
                    </button>
                </div>

                {/* Desktop */}
                <div className="hidden xl:flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${changes.length ? 'bg-[#155dfc]' : 'bg-[#dfe6fb]'}`} />
                    <b className="text-sm text-[#0f172b] whitespace-nowrap">
                        {changes.length ? `${changes.length} unsaved change${changes.length > 1 ? 's' : ''}` : 'No unsaved changes'}
                    </b>
                    {changes.length > 0 && <span className="text-xs text-[#5b6b86] truncate">{changeSummary}</span>}
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => openReset(VISIBLE_ROLES)}
                            className="h-10 px-4 rounded-sm text-sm font-medium text-[#45556c] hover:bg-[#f5f7ff]"
                        >
                            Reset to default
                        </button>
                        <button
                            type="button"
                            disabled={!changes.length}
                            onClick={() => handleDiscard(changedRoles)}
                            className="h-10 px-4 rounded-sm text-sm font-medium text-[#45556c] hover:bg-[#f5f7ff] disabled:opacity-40"
                        >
                            Discard
                        </button>
                        <button
                            type="button"
                            disabled={!changes.length}
                            onClick={() => handleSaveChanges(changedRoles)}
                            className="h-10 px-5 inline-flex items-center gap-2 rounded-sm bg-[#155dfc] text-white text-sm font-medium hover:bg-[#1447e6] disabled:opacity-40 active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#155dfc]"
                        >
                            <Ico paths={ICON_CHECK} size={16} strokeWidth={2.5} />
                            Save changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ManagePermissionsPage;