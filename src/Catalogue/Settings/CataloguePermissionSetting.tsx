import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc, getDocs, setDoc, collection } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { ROLES, State } from '../../enums';
import { Cata_Permissions, migrateCataPermissions } from '../../Catalogue/enum/cata_permissions.enum';
import BackButton from '../../Components/BackButton';
import { Modal } from '../../constants/Modal';

const CATA_PERM_VALUES = Object.values(Cata_Permissions);

// --- DEFAULTS ---
export const getDefaultCataPermissions = (role: string): Cata_Permissions[] => {
    switch (role) {
        case ROLES.OWNER:
            return Object.values(Cata_Permissions);
        case ROLES.MANAGER:
            // Parity with the POS Manager defaults (DEFAULT_PERMISSIONS_MAP in
            // Permissionsetting.tsx): dashboard + account visibility, item
            // management, order handling (incl. returns), and the same
            // operational widgets (hide button, sales chart, notifications).
            return [
                Cata_Permissions.ViewCatalogueDashboard,
                Cata_Permissions.ViewCatalogueAccounts,
                Cata_Permissions.ViewCatalogueOrders,
                Cata_Permissions.ViewCatalogueRequests,
                Cata_Permissions.ViewCatalogueFilter,
                Cata_Permissions.ViewCatalogueHidebutton,
                Cata_Permissions.ViewCatalogueSalesbarchart,
                Cata_Permissions.ViewReports,
                Cata_Permissions.ManageItems,
                Cata_Permissions.ViewEditButton,
                Cata_Permissions.ViewShop,
                Cata_Permissions.ViewShopItems,
                Cata_Permissions.ViewOrdersReturn,
                Cata_Permissions.ViewNotification,
            ];
        case ROLES.SALESMAN:
            // Parity with the POS Salesman defaults: dashboard, create/view
            // sales (orders) and their returns, and account visibility —
            // nothing beyond day-to-day billing operations.
            return [
                Cata_Permissions.ViewCatalogueDashboard,
                Cata_Permissions.ViewCatalogueAccounts,
                Cata_Permissions.ViewCatalogueOrders,
                Cata_Permissions.ViewCatalogueFilter,
                Cata_Permissions.ViewOrdersReturn,
            ];
        default:
            return [];
    }
};

// --- GROUPS FOR UI ---
const cataPermissionGroups = {
    dashboard: {
        title: 'Dashboard & Widgets',
        permissions: [
            Cata_Permissions.ViewCatalogueDashboard,
            Cata_Permissions.ViewCatalogueFilter,
            Cata_Permissions.ViewCatalogueHidebutton,
            Cata_Permissions.ViewCatalogueSalesbarchart,
            Cata_Permissions.ViewTopSoldItems,
            Cata_Permissions.ViewNotification, // moved out of "ungrouped"
        ].filter(Boolean),
    },
    orders: {
        title: 'Orders, Shop & Requests',
        permissions: [
            Cata_Permissions.ViewCatalogueOrders,
            Cata_Permissions.ViewOrdersReturn,
            Cata_Permissions.ViewCatalogueRequests,
            Cata_Permissions.ViewShop,
            Cata_Permissions.ViewShopItems,
            Cata_Permissions.ViewEditButton,
        ].filter(Boolean),
    },
    reports: {
        title: 'Reports & Insights',
        permissions: [
            Cata_Permissions.ViewReports,
            Cata_Permissions.ViewItemReport,
            Cata_Permissions.ViewSalesReport,
            Cata_Permissions.ViewItemSoldReport,
            Cata_Permissions.ViewCustomerReport,
            Cata_Permissions.ViewPNLReport,
            Cata_Permissions.ViewExpenseReport,
            //Cata_Permissions.ViewUserReport,
            //Cata_Permissions.ViewTaxReport,
        ].filter(Boolean),
    },
    // NEW — pulled out of "reports"/"management": these are financial/account
    // records, not performance reports or generic settings.
    accounts: {
        title: 'Accounts & Finance',
        permissions: [
            Cata_Permissions.ViewCatalogueAccounts,
            Cata_Permissions.ViewPartyLedger,
        ].filter(Boolean),
    },
    // NEW — split out of the old "management" catch-all
    itemMaster: {
        title: 'Item & Master Management',
        permissions: [
            Cata_Permissions.ManageItems,
            Cata_Permissions.ManageItemSettings,
            Cata_Permissions.ManageMasters,
        ].filter(Boolean),
    },
    salesBilling: {
        title: 'Sales & Billing Settings',
        permissions: [
            Cata_Permissions.ManageSalesSettings,
            Cata_Permissions.ManageBillSettings,
        ].filter(Boolean),
    },
    userAccess: {
        title: 'User, Profile & Access',
        permissions: [
            Cata_Permissions.ManageEditProfile,
            //Cata_Permissions.ManageUserSettings,
            //Cata_Permissions.ManagePermissions,
        ].filter(Boolean),
    },
};

// --- DESCRIPTIONS (shown under each row) ---
const CATA_PERMISSION_DESCRIPTIONS: Partial<Record<Cata_Permissions, string>> = {
    // Dashboard & Widgets
    [Cata_Permissions.ViewCatalogueDashboard]: 'Access the main catalogue dashboard.',
    [Cata_Permissions.ViewCatalogueFilter]: 'Use filters to narrow down catalogue data.',
    [Cata_Permissions.ViewCatalogueHidebutton]: 'Toggle visibility of sensitive data on the dashboard.',
    [Cata_Permissions.ViewCatalogueSalesbarchart]: 'View the sales bar chart widget on the dashboard.',
    [Cata_Permissions.ViewTopSoldItems]: 'View the list of top-selling items.',
    [Cata_Permissions.ViewNotification]: 'Receive and view catalogue-related notifications.',

    // Orders, Shop & Requests
    [Cata_Permissions.ViewCatalogueOrders]: 'View the list of orders placed through the catalogue.',
    [Cata_Permissions.ViewOrdersReturn]: 'View and manage returned orders.',
    [Cata_Permissions.ViewCatalogueRequests]: 'View incoming catalogue requests.',
    [Cata_Permissions.ViewShop]: 'View the shop section of the catalogue.',
    [Cata_Permissions.ViewShopItems]: 'View items listed in the shop.',
    [Cata_Permissions.ViewEditButton]: 'Allow editing of existing catalogue orders or entries.',

    // Reports & Insights
    [Cata_Permissions.ViewReports]: 'Access the reports section and its settings.',
    [Cata_Permissions.ViewItemReport]: 'View item-wise stock and performance reports.',
    [Cata_Permissions.ViewSalesReport]: 'View overall sales performance reports.',
    [Cata_Permissions.ViewItemSoldReport]: 'View reports on items sold over a period.',
    [Cata_Permissions.ViewCustomerReport]: 'View reports summarizing customer activity.',
    [Cata_Permissions.ViewPNLReport]: 'Access the profit & loss report (contains sensitive financial data).',
    [Cata_Permissions.ViewExpenseReport]: 'View reports on business expenses.',
    [Cata_Permissions.ViewUserReport]: 'View reports on user/staff activity.',
    [Cata_Permissions.ViewTaxReport]: 'View tax collected and payable reports.',

    // Accounts & Finance
    [Cata_Permissions.ViewCatalogueAccounts]: 'View company account details linked to the catalogue.',
    [Cata_Permissions.ViewPartyLedger]: 'View the transaction ledger for each party/customer.',

    // Item & Master Management
    [Cata_Permissions.ManageItems]: 'Add, edit, or remove items in the catalogue.',
    [Cata_Permissions.ManageItemSettings]: 'Configure item-related settings like pricing rules and units.',
    [Cata_Permissions.ManageMasters]: 'Manage master data such as categories, units, and brands.',

    // Sales & Billing Settings
    [Cata_Permissions.ManageSalesSettings]: 'Configure sales-related settings and defaults.',
    [Cata_Permissions.ManageBillSettings]: 'Configure billing format and invoice settings.',

    // User, Profile & Access
    [Cata_Permissions.ManageEditProfile]: 'Edit personal or company profile details.',
    [Cata_Permissions.ManageUserSettings]: 'Manage staff accounts and their basic settings.',
    [Cata_Permissions.ManagePermissions]: 'Configure role-based permissions — high privilege action.',
};
// --- DISPLAY LABELS (UI text override, enum value stays same for DB) ---
const CATA_PERMISSION_LABELS: Partial<Record<Cata_Permissions, string>> = {
    // Dashboard & widgets
    [Cata_Permissions.ViewCatalogueDashboard]: 'Open Catalogue dashboard',
    [Cata_Permissions.ViewCatalogueFilter]: 'Use dashboard filters',
    [Cata_Permissions.ViewCatalogueHidebutton]: 'Hide / show figures',
    [Cata_Permissions.ViewCatalogueSalesbarchart]: 'Sales chart',
    [Cata_Permissions.ViewTopSoldItems]: 'Top selling items',
    [Cata_Permissions.ViewNotification]: 'Notifications',
    // Orders, shop & requests
    [Cata_Permissions.ViewCatalogueOrders]: 'View orders',
    [Cata_Permissions.ViewOrdersReturn]: 'Order returns',
    [Cata_Permissions.ViewCatalogueRequests]: 'Customer requests',
    [Cata_Permissions.ViewShop]: 'View catalogue',
    [Cata_Permissions.ViewShopItems]: 'View catalogue items',
    [Cata_Permissions.ViewEditButton]: 'Edit orders',
    // Reports & insights
    [Cata_Permissions.ViewReports]: 'Open Reports & Settings tabs',
    [Cata_Permissions.ViewItemReport]: 'Item report',
    [Cata_Permissions.ViewSalesReport]: 'Sales report',
    [Cata_Permissions.ViewItemSoldReport]: 'Items sold report',
    [Cata_Permissions.ViewCustomerReport]: 'Customer report',
    [Cata_Permissions.ViewPNLReport]: 'Profit & loss',
    [Cata_Permissions.ViewExpenseReport]: 'Expense report',
    // Accounts & finance
    [Cata_Permissions.ViewCatalogueAccounts]: 'Accounts',
    [Cata_Permissions.ViewPartyLedger]: 'Party ledger',
    // Item & master management
    [Cata_Permissions.ManageItems]: 'Add, edit and delete items',
    [Cata_Permissions.ManageItemSettings]: 'Item settings',
    [Cata_Permissions.ManageMasters]: 'Masters',
    // Sales & billing settings
    [Cata_Permissions.ManageSalesSettings]: 'Sales settings',
    [Cata_Permissions.ManageBillSettings]: 'Bill settings',
    // User, profile & access
    [Cata_Permissions.ManageEditProfile]: 'Edit profile',
};
// Yeh permissions kabhi bhi UI me nahi dikhani (na kisi group me, na "Other Permissions" me)
const HIDDEN_CATA_PERMISSIONS = new Set<Cata_Permissions>([
    Cata_Permissions.ViewTaxReport,
    Cata_Permissions.ViewUserReport,
    Cata_Permissions.ManageUserSettings,
    Cata_Permissions.ManagePermissions,
]);

const getUngroupedPermissions = (allPermissions: Cata_Permissions[]): Cata_Permissions[] => {
    const grouped = new Set<Cata_Permissions>();
    Object.values(cataPermissionGroups).forEach(group => {
        group.permissions.forEach(perm => grouped.add(perm as Cata_Permissions));
    });
    return allPermissions.filter(perm => !grouped.has(perm) && !HIDDEN_CATA_PERMISSIONS.has(perm));
};

// ---------- UI-only helpers (Catalogue orange tokens) ----------
// primary #c2410c · hover #9a3412 · soft #ffedd5 · canvas #fff5ec · sunken #fff8f2 · border #f6e1d0 · warning #a16207

const PERMISSION_TAGS: Partial<Record<Cata_Permissions, string>> = {
    [Cata_Permissions.ViewPNLReport]: 'Shows profit',
};

// // Rows drawn indented under "Open Reports & Settings tabs" (indent only, no logic attached)
// const NESTED_PERMISSIONS: Cata_Permissions[] = [
//     Cata_Permissions.ViewItemReport,
//     Cata_Permissions.ViewSalesReport,
//     Cata_Permissions.ViewItemSoldReport,
//     Cata_Permissions.ViewCustomerReport,
//     Cata_Permissions.ViewPNLReport,
//     Cata_Permissions.ViewExpenseReport,
// ];

type GroupMeta = { title: string; navLabel: string; subtitle: string; tint: [string, string]; icon: string[] };

const TINT_ORANGE: [string, string] = ['bg-[#ffedd5]', 'text-[#9a3412]'];
const TINT_GREEN: [string, string] = ['bg-[#e9faef]', 'text-[#008236]'];
const TINT_AMBER: [string, string] = ['bg-[#fef6d7]', 'text-[#a16207]'];
const TINT_MAGENTA: [string, string] = ['bg-[#ffe8f8]', 'text-[#c4009a]'];

const GROUP_META: Record<string, GroupMeta> = {
    dashboard: {
        title: 'Dashboard & widgets',
        navLabel: 'Dashboard',
        subtitle: 'Cards and widgets on the dashboard',
        tint: TINT_ORANGE,
        icon: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'],
    },
    orders: {
        title: 'Orders, shop & requests',
        navLabel: 'Orders & shop',
        subtitle: 'Orders, returns, requests and the shop',
        tint: TINT_ORANGE,
        icon: [
            'M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6',
            'M9 18.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
            'M18 18.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
        ],
    },
    reports: {
        title: 'Reports & insights',
        navLabel: 'Reports',
        subtitle: 'Figures about the business',
        tint: TINT_GREEN,
        icon: ['M3 3v18h18', 'M8 16v-4M13 16V8M18 16v-6'],
    },
    accounts: {
        title: 'Accounts & finance',
        navLabel: 'Accounts',
        subtitle: 'Company accounts and party ledger',
        tint: TINT_AMBER,
        icon: ['M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6'],
    },
    itemMaster: {
        title: 'Item & master management',
        navLabel: 'Items & masters',
        subtitle: 'Items, item settings and masters',
        tint: TINT_AMBER,
        icon: ['M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z', 'M7.5 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'],
    },
    salesBilling: {
        title: 'Sales & billing settings',
        navLabel: 'Billing settings',
        subtitle: 'Sales defaults and bill format',
        tint: TINT_MAGENTA,
        icon: [
            'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12',
            'M16 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
            'M10 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
            'M18 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
        ],
    },
    userAccess: {
        title: 'User, profile & access',
        navLabel: 'Profile',
        subtitle: 'Their own profile',
        tint: TINT_MAGENTA,
        icon: ['M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M4 21a8 8 0 0 1 16 0'],
    },
};

const OTHER_GROUP_META: GroupMeta = {
    title: 'Other',
    navLabel: 'Other',
    subtitle: 'Additional permissions',
    tint: TINT_ORANGE,
    icon: ['M5 12h.01M12 12h.01M19 12h.01'],
};

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

const getInitials = (name: string) =>
    name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';

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
const ICON_USERS = ['M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3'];

const CARD_CLASS =
    'bg-white border border-[#f6e1d0] rounded-sm shadow-[0_1px_2px_rgba(21,48,140,0.05),0_2px_6px_rgba(21,48,140,0.06)]';

interface CbProps {
    checked: boolean;
    label: string;
    onToggle: () => void;
}

// Custom checkbox (SELLAR .cb, Catalogue orange)
const Cb: React.FC<CbProps> = ({ checked, label, onToggle }) => (
    <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={`w-5 h-5 shrink-0 p-0 inline-grid place-items-center rounded-sm border-[1.5px] text-white transition-colors
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea580c]
            ${checked ? 'bg-[#c2410c] border-[#c2410c]' : 'bg-white border-[#7a8aa3]'}`}
    >
        {checked && <Ico paths={ICON_CHECK} size={13} strokeWidth={3} />}
    </button>
);

// Catalogue roles managed on this screen
const VISIBLE_ROLES: string[] = [ROLES.SALESMAN, ROLES.MANAGER];

const CataloguePermissionSetting: React.FC = () => {
    const { currentUser } = useAuth();
    const [rolePermissions, setRolePermissions] = useState<Record<string, Cata_Permissions[]>>({});
    // Last saved copy, used to show "Changed" cells and unsaved-change counts
    const [savedPermissions, setSavedPermissions] = useState<Record<string, Cata_Permissions[]>>({});
    const [loading, setLoading] = useState(true);
    const [selectedRole, setSelectedRole] = useState<string>(ROLES.SALESMAN);

    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [isResetOpen, setIsResetOpen] = useState(false);
    const [resetRoles, setResetRoles] = useState<string[]>([]);

    const [searchQuery, setSearchQuery] = useState('');
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const [activeSection, setActiveSection] = useState<string | null>(null);

    // Staff list (same source as Manage Users: companies/{companyId}/users)
    const [staff, setStaff] = useState<StaffMember[]>([]);

    const ungroupedPermissions = useMemo(() => getUngroupedPermissions(CATA_PERM_VALUES as Cata_Permissions[]), []);

    useEffect(() => {
        if (!currentUser?.companyId) return;

        const initializeAndFetchPermissions = async () => {
            const companyId = currentUser.companyId;

            // 1. AUTO-SAVE ALL PERMISSIONS FOR OWNER
            try {
                const ownerRef = doc(db, 'companies', companyId, 'cata_permissions', ROLES.OWNER);
                await setDoc(ownerRef, {
                    allowedPermissions: CATA_PERM_VALUES,
                    role: ROLES.OWNER,
                    companyId: companyId
                }, { merge: true });
            } catch (err) {
                console.error("Failed to auto-sync Owner permissions", err);
            }

            // 2. FETCH SALESMAN & MANAGER FOR UI (auto-provisioning defaults if missing)
            const rolesToManage = [ROLES.SALESMAN, ROLES.MANAGER];
            const newMap: Record<string, Cata_Permissions[]> = {};

            for (const role of rolesToManage) {
                const docRef = doc(db, 'companies', companyId, 'cata_permissions', role);
                const snap = await getDoc(docRef);

                if (snap.exists()) {
                    const data = snap.data();
                    const { permissions: migrated, changed: renamed } = migrateCataPermissions(data.allowedPermissions);
                    const roleDefaults = getDefaultCataPermissions(role);
                    // Purane docs (jisme syncedDefaults nahi hai) ke liye current defaults ko already-synced maano,
                    // taaki unki disable ki hui permissions wapas on na ho
                    const hasStamp = Array.isArray(data.syncedDefaults);
                    const alreadySynced: string[] = hasStamp ? data.syncedDefaults : roleDefaults;
                    const newDefaults = roleDefaults.filter(p => !alreadySynced.includes(p));
                    const merged = Array.from(new Set([...migrated, ...newDefaults]));
                    const changed = renamed || newDefaults.length > 0 || !hasStamp;
                    newMap[role] = merged;
                    if (changed) {
                        try {
                            await setDoc(docRef, { allowedPermissions: merged, syncedDefaults: roleDefaults }, { merge: true });
                        } catch (err) {
                            console.error(`Failed to persist synced catalogue permissions for ${role}`, err);
                        }
                    }
                } else {
                    // Doc missing (e.g. no user with this role has logged in yet,
                    // so AuthContext's ensureCataPermissionsExist never ran for it).
                    // Auto-provision it with role defaults so it isn't silently
                    // left out of `cata_permissions`, matching the Owner auto-sync above.
                    const defaults = getDefaultCataPermissions(role);
                    try {
                        await setDoc(docRef, {
                            allowedPermissions: defaults,
                            role: role,
                            companyId: companyId
                        }, { merge: true });
                    } catch (err) {
                        console.error(`Failed to auto-provision default ${role} permissions`, err);
                    }
                    newMap[role] = defaults;
                }
            }

            setRolePermissions(newMap);
            setSavedPermissions(newMap);
            setLoading(false);
        };

        initializeAndFetchPermissions();
    }, [currentUser?.companyId]);

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

    // --- LOCAL STATE UPDATE (No longer auto-saves) ---
    const handlePermissionChange = (role: string, perm: Cata_Permissions, checked: boolean) => {
        const currentUI = rolePermissions[role] || [];
        const newCataloguePerms = checked
            ? [...new Set([...currentUI, perm])]
            : currentUI.filter(p => p !== perm);

        setRolePermissions(prev => ({ ...prev, [role]: newCataloguePerms }));
    };

    // Select all / Clear all for one group of one role
    const handleToggleGroup = (role: string, perms: Cata_Permissions[], select: boolean) => {
        setRolePermissions(prev => {
            const current = prev[role] || [];
            return {
                ...prev,
                [role]: select
                    ? [...new Set([...current, ...perms])]
                    : current.filter(p => !perms.includes(p)),
            };
        });
    };

    // --- MANUAL SAVE LOGIC (one or more roles) ---
    const handleSaveChanges = async (roles: string | string[]) => {
        if (!currentUser?.companyId) return;
        const roleList = Array.isArray(roles) ? roles : [roles];
        setSaveStatus('saving');

        try {
            const nextSaved: Record<string, Cata_Permissions[]> = {};
            for (const role of roleList) {
                const docRef = doc(db, 'companies', currentUser.companyId, 'cata_permissions', role);

                await setDoc(docRef, {
                    allowedPermissions: rolePermissions[role] || [],
                    role: role,
                    companyId: currentUser.companyId
                }, { merge: true });
                nextSaved[role] = rolePermissions[role] || [];
            }
            setSavedPermissions(prev => ({ ...prev, ...nextSaved }));

            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);

        } catch (error) {
            console.error("Save failed:", error);
            setSaveStatus('error');
        }
    };

    const handleDiscard = (roles: string[]) => {
        setRolePermissions(prev => {
            const next = { ...prev };
            roles.forEach(role => { next[role] = savedPermissions[role] || []; });
            return next;
        });
    };

    const openReset = (roles: string[]) => {
        setResetRoles(roles);
        setIsResetOpen(true);
    };

    // --- RESET LOGIC ---
    const handleResetPermissions = async () => {
        if (!currentUser?.companyId) return;

        const roles = resetRoles;
        const defaultsByRole: Record<string, Cata_Permissions[]> = {};
        roles.forEach(role => { defaultsByRole[role] = getDefaultCataPermissions(role); });

        // Update Local State
        setRolePermissions(prev => ({ ...prev, ...defaultsByRole }));
        setIsResetOpen(false);
        setSaveStatus('saving');

        // Save Defaults to Firebase Immediately
        try {
            for (const role of roles) {
                const docRef = doc(db, 'companies', currentUser.companyId, 'cata_permissions', role);
                await setDoc(docRef, {
                    allowedPermissions: defaultsByRole[role],
                    role: role,
                    companyId: currentUser.companyId
                }, { merge: true });
            }
            setSavedPermissions(prev => ({ ...prev, ...defaultsByRole }));

            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (error) {
            console.error("Reset failed:", error);
            setSaveStatus('error');
        }
    };

    if (loading) return <div className="p-4">Loading permissions...</div>;

    // ---------- derived UI values ----------
    const has = (role: string, p: Cata_Permissions) => (rolePermissions[role] || []).includes(p);
    const wasSaved = (role: string, p: Cata_Permissions) => (savedPermissions[role] || []).includes(p);
    const isChanged = (role: string, p: Cata_Permissions) => has(role, p) !== wasSaved(role, p);
    const countOn = (role: string, perms: Cata_Permissions[]) => perms.filter(p => has(role, p)).length;
    const roleUserCount = (role: string) => staff.filter(s => sameRole(s.role, role)).length;

    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = (p: Cata_Permissions) =>
        !query ||
        (CATA_PERMISSION_LABELS[p] || String(p)).toLowerCase().includes(query) ||
        (CATA_PERMISSION_DESCRIPTIONS[p] || '').toLowerCase().includes(query);

    const allGroupsFull: { key: string; meta: GroupMeta; perms: Cata_Permissions[] }[] = [
        ...Object.entries(cataPermissionGroups).map(([key, g]) => ({
            key,
            meta: GROUP_META[key] || { ...OTHER_GROUP_META, title: g.title },
            perms: g.permissions as Cata_Permissions[],
        })).filter(g => g.perms.length > 0),
        ...(ungroupedPermissions.length > 0
            ? [{ key: 'other', meta: OTHER_GROUP_META, perms: ungroupedPermissions }]
            : []),
    ];
    const visibleAllPermissions = allGroupsFull.reduce<Cata_Permissions[]>((acc, g) => acc.concat(g.perms), []);
    const totalPermissions = visibleAllPermissions.length;

    const groupsView = allGroupsFull
        .map(g => ({ ...g, perms: g.perms.filter(matchesSearch) }))
        .filter(g => g.perms.length > 0);

    // Unsaved changes
    type Change = { role: string; permission: Cata_Permissions; added: boolean };
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
                .map(c => `${c.added ? '+' : '−'} ${CATA_PERMISSION_LABELS[c.permission] || c.permission}`)
                .join(' · ')
        )
        .join('   |   ');

    // ---------- shared row pieces ----------
    const renderName = (permission: Cata_Permissions) => {
        const tag = PERMISSION_TAGS[permission];
        const description = CATA_PERMISSION_DESCRIPTIONS[permission];
        return (
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[#0f172b]">{CATA_PERMISSION_LABELS[permission] || permission}</span>
                    {tag && (
                        <span className="text-[10px] font-medium px-2 py-px rounded-full bg-[#fef6d7] text-[#a16207]">{tag}</span>
                    )}
                </div>
                {description && <p className="text-xs text-[#5b6b86] mt-px">{description}</p>}
            </div>
        );
    };

    const renderCb = (role: string, permission: Cata_Permissions) => {
        const checked = has(role, permission);
        return (
            <Cb
                checked={checked}
                label={`${role}: ${CATA_PERMISSION_LABELS[permission] || permission}`}
                onToggle={() => handlePermissionChange(role, permission, !checked)}
            />
        );
    };

    const groupToggleLabel = (role: string, perms: Cata_Permissions[]) =>
        countOn(role, perms) === perms.length ? 'Clear all' : 'Select all';

    const searchField = (extra = '') => (
        <label className={`flex items-center gap-2 h-[38px] px-3 border border-[#7a8aa3] rounded-sm bg-white text-[#5b6b86] focus-within:ring-2 focus-within:ring-[#ea580c] ${extra}`}>
            <Ico paths={ICON_SEARCH} size={16} />
            <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Find a permission"
                className="flex-1 min-w-0 bg-transparent outline-none text-sm text-[#0f172b] placeholder:text-[#5b6b86]"
            />
        </label>
    );

    const statusPill = (
        <>
            {saveStatus === 'saving' && <span className="text-sm font-medium text-[#c2410c] animate-pulse whitespace-nowrap">Saving changes...</span>}
            {saveStatus === 'saved' && <span className="text-sm font-medium text-[#008236] whitespace-nowrap">All changes saved</span>}
            {saveStatus === 'error' && <span className="text-sm font-medium text-[#d5000c] whitespace-nowrap">Error saving</span>}
        </>
    );

    const emptySearch = groupsView.length === 0 && (
        <div className={`${CARD_CLASS} px-4 py-8 text-center text-sm text-[#5b6b86]`}>
            No permission matches “{searchQuery}”. Try a shorter word.
        </div>
    );

    return (
        <div className="bg-[#fff5ec] min-h-screen pb-44 md:pb-24 xl:pb-0">
            {/* ============ HEADER ============ */}
            <div className="bg-white border-b border-[#f6e1d0] sticky top-0 z-30">
                <div className="flex items-center gap-3 px-3 py-3 xl:px-6 xl:py-4">
                    <BackButton />
                    <div className="min-w-0">
                        <div className="hidden xl:block whitespace-nowrap text-xs text-[#5b6b86]">Catalogue / Settings /</div>
                        <h1 className="text-xl xl:text-[22px] font-semibold text-[#0f172b] leading-tight">Catalogue permissions</h1>
                        <div className="xl:hidden text-xs text-[#5b6b86]">Settings</div>
                    </div>
                    <span className="hidden xl:block self-end pb-1 text-xs text-[#5b6b86]">
                        What managers and salesmen can see and do in the Catalogue
                    </span>
                    <div className="ml-auto flex items-center gap-3">
                        {statusPill}
                        {searchField('hidden xl:flex w-[260px]')}
                        <button
                            type="button"
                            aria-label="Search permissions"
                            onClick={() => setShowMobileSearch(v => !v)}
                            className="xl:hidden w-10 h-10 inline-grid place-items-center rounded-sm text-[#0f172b] hover:bg-[#fff8f2]"
                        >
                            <Ico paths={ICON_SEARCH} />
                        </button>
                    </div>
                </div>
                {showMobileSearch && <div className="xl:hidden px-4 pb-3">{searchField()}</div>}
            </div>

            {/* ============ MOBILE / TABLET ============ */}
            <div className="xl:hidden max-w-2xl mx-auto">
                <div className="px-4 py-2.5 bg-white border-b border-[#f6e1d0]">
                    <div
                        role="group"
                        className="bg-[#fff8f2] border border-[#f6e1d0] p-[3px] rounded-sm grid gap-0.5"
                        style={{ gridTemplateColumns: `repeat(${VISIBLE_ROLES.length || 1}, minmax(0, 1fr))` }}
                    >
                        {VISIBLE_ROLES.map(role => (
                            <button
                                key={role}
                                type="button"
                                aria-pressed={selectedRole === role}
                                onClick={() => setSelectedRole(role)}
                                className={`py-2 rounded-sm text-sm font-medium capitalize transition-all ${selectedRole === role ? 'bg-white text-[#c2410c] shadow-sm' : 'text-[#45556c]'}`}
                            >
                                {role}{staff.length > 0 ? ` · ${roleUserCount(role)}` : ''}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="px-4 pt-3 grid gap-3">
                    {/* Progress card with Reset on the same row */}
                    <div className={`${CARD_CLASS} px-3.5 py-3 flex items-center gap-2.5`}>
                        <div className="flex-1 min-w-0">
                            <b className="text-sm font-semibold text-[#0f172b] capitalize">
                                {selectedRole} can do {countOn(selectedRole, visibleAllPermissions)} of {totalPermissions}
                            </b>
                            <div className="h-1.5 rounded-full bg-[#fff8f2] overflow-hidden mt-1.5">
                                <div
                                    className="h-full bg-[#c2410c] rounded-full"
                                    style={{ width: `${totalPermissions ? (countOn(selectedRole, visibleAllPermissions) / totalPermissions) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => openReset([selectedRole])}
                            className="h-8 px-3 rounded-sm text-[13px] font-medium text-[#5b6b86] hover:bg-[#fff8f2]"
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
                                        className="text-[11px] font-medium text-[#c2410c]"
                                    >
                                        {groupToggleLabel(selectedRole, perms)}
                                    </button>
                                </div>
                            </div>
                            {perms.map(p => (
                                <div
                                    key={p}
                                    className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-start px-3.5 py-2.5 border-t border-[#f6e1d0]
                                        ${isChanged(selectedRole, p) ? 'bg-[#ffedd5]' : p === Cata_Permissions.ViewReports ? 'bg-[#fff8f2]' : ''}`}
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
                                ${activeSection === key ? 'bg-[#ffedd5] text-[#9a3412]' : 'text-[#45556c] hover:bg-white'}`}
                        >
                            <Ico paths={meta.icon} size={16} />
                            {meta.navLabel}
                            <small className="ml-auto text-[11px] text-[#5b6b86]">{perms.length}</small>
                        </a>
                    ))}
                </nav>

                {/* Center: info + table */}
                <div className="grid gap-4 min-w-0">
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-sm bg-[#ffedd5] text-[#9a3412] text-[13px] leading-[19px]">
                        <span className="shrink-0"><Ico paths={ICON_SHIELD} size={16} /></span>
                        <span>Tick what each role can do in the Catalogue. Changes apply to everyone with that role the next time they open the app. The <b>Owner</b> always has everything.</span>
                    </div>

                    <div className={`${CARD_CLASS} overflow-x-auto`}>
                        <table className="w-full min-w-[520px] border-collapse">
                            <thead>
                                <tr>
                                    <th className="text-left text-[11px] font-semibold tracking-[0.06em] uppercase text-[#5b6b86] px-3.5 py-2.5 bg-[#fff8f2] border-b border-[#f6e1d0]">Permission</th>
                                    {VISIBLE_ROLES.map((role, i) => (
                                        <th key={role} className="w-28 text-center px-3.5 py-2.5 bg-[#fff8f2] border-b border-[#f6e1d0]">
                                            <div className="grid gap-0.5 justify-items-center">
                                                <span className={`inline-flex items-center h-[22px] px-2 rounded-full text-[11px] font-semibold tracking-[0.03em] uppercase ${i === 0 ? 'bg-[#ffedd5] text-[#9a3412]' : 'bg-white text-[#45556c] border border-[#f6e1d0]'}`}>
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
                                            <td className="bg-white px-3.5 pt-3.5 pb-2.5 border-b border-[#f6e1d0]">
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
                                                <td key={role} className="bg-white text-center px-3.5 pt-3.5 pb-2.5 border-b border-[#f6e1d0]">
                                                    <span className="block text-xs text-[#5b6b86] tabular-nums mb-1">
                                                        {countOn(role, perms)} of {perms.length}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleGroup(role, perms, countOn(role, perms) !== perms.length)}
                                                        className="text-[11px] font-medium text-[#c2410c] whitespace-nowrap"
                                                    >
                                                        {groupToggleLabel(role, perms)}
                                                    </button>
                                                </td>
                                            ))}
                                        </tr>
                                        {perms.map(p => (
                                            <tr key={p} className={p === Cata_Permissions.ViewReports ? '[&>td]:bg-[#fff8f2]' : ''}>
                                                <td className="px-3.5 py-2.5 border-b border-[#f6e1d0] align-middle">{renderName(p)}</td>
                                                {VISIBLE_ROLES.map(role => (
                                                    <td
                                                        key={role}
                                                        className={`text-center px-3.5 py-2.5 border-b border-[#f6e1d0] align-middle ${isChanged(role, p) ? '!bg-[#ffedd5]' : ''}`}
                                                    >
                                                        <div className="flex justify-center">{renderCb(role, p)}</div>
                                                        {isChanged(role, p) && (
                                                            <span className="block mt-[3px] text-[9px] font-semibold tracking-[0.06em] uppercase text-[#9a3412]">Changed</span>
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

                {/* Right: access at a glance, staff (below table on lg, sidebar on xl) */}
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
                                    <div className="h-1.5 rounded-full bg-[#fff8f2] overflow-hidden mt-1">
                                        <div className="h-full bg-[#c2410c] rounded-full" style={{ width: `${totalPermissions ? (on / totalPermissions) * 100 : 0}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                        <p className="text-xs text-[#5b6b86]">Owner always has everything.</p>
                    </div>

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
                                                className={`w-7 h-7 shrink-0 inline-grid place-items-center rounded-full text-[11px] font-semibold ${i === 0 ? 'bg-[#ffedd5] text-[#9a3412]' : 'bg-[#fff8f2] text-[#45556c]'}`}
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
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#c2410c]">
                            <Ico paths={ICON_USERS} size={16} /> Manage users →
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
                    theme="catalogue"
                />
            )}

            {/* ============ SAVE BAR ============ */}
            <div className="fixed inset-x-0 bottom-16 md:bottom-0 xl:sticky xl:bottom-0 z-40 bg-white border-t border-[#f6e1d0] shadow-[0_-6px_16px_rgba(21,48,140,0.06)] px-4 py-2.5 xl:px-6 xl:py-3">
                {/* Mobile */}
                <div className="xl:hidden max-w-2xl mx-auto flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${selectedChanges.length ? 'bg-[#c2410c]' : 'bg-[#f6e1d0]'}`} />
                    <span className="text-[13px] text-[#0f172b] flex-1 min-w-0 truncate">
                        <b>{selectedChanges.length ? `${selectedChanges.length} change${selectedChanges.length > 1 ? 's' : ''}` : 'No changes'}</b>{' '}
                        <span className="text-xs text-[#5b6b86] capitalize">for {selectedRole}</span>
                    </span>
                    <button
                        type="button"
                        disabled={!selectedChanges.length}
                        onClick={() => handleDiscard([selectedRole])}
                        className="h-9 px-3 rounded-sm text-[13px] font-medium text-[#45556c] hover:bg-[#fff8f2] disabled:opacity-40"
                    >
                        Discard
                    </button>
                    <button
                        type="button"
                        disabled={!selectedChanges.length}
                        onClick={() => handleSaveChanges(selectedRole)}
                        className="h-9 px-4 rounded-sm bg-[#c2410c] text-white text-[13px] font-medium hover:bg-[#9a3412] disabled:opacity-40 active:scale-95 transition-transform"
                    >
                        Save
                    </button>
                </div>

                {/* Desktop */}
                <div className="hidden xl:flex items-center gap-3">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${changes.length ? 'bg-[#c2410c]' : 'bg-[#f6e1d0]'}`} />
                    <b className="text-sm text-[#0f172b] whitespace-nowrap">
                        {changes.length ? `${changes.length} unsaved change${changes.length > 1 ? 's' : ''}` : 'No unsaved changes'}
                    </b>
                    {changes.length > 0 && <span className="text-xs text-[#5b6b86] truncate">{changeSummary}</span>}
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => openReset(VISIBLE_ROLES)}
                            className="h-10 px-4 rounded-sm text-sm font-medium text-[#45556c] hover:bg-[#fff8f2]"
                        >
                            Reset to default
                        </button>
                        <button
                            type="button"
                            disabled={!changes.length}
                            onClick={() => handleDiscard(changedRoles)}
                            className="h-10 px-4 rounded-sm text-sm font-medium text-[#45556c] hover:bg-[#fff8f2] disabled:opacity-40"
                        >
                            Discard
                        </button>
                        <button
                            type="button"
                            disabled={!changes.length}
                            onClick={() => handleSaveChanges(changedRoles)}
                            className="h-10 px-5 inline-flex items-center gap-2 rounded-sm bg-[#c2410c] text-white text-sm font-medium hover:bg-[#9a3412] disabled:opacity-40 active:scale-95 transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ea580c]"
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

export default CataloguePermissionSetting;