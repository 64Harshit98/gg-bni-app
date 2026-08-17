import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc, collection } from 'firebase/firestore';
import { Permissions, PLANS, ROLES } from '../../enums';
import Loading from '../Loading/Loading';
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
    Permissions.CreateUsers
];

export const DEFAULT_PERMISSIONS_MAP = {
    [ROLES.SALESMAN]: [
        Permissions.ViewAttendance,
        Permissions.ViewDashboard,
        Permissions.CreateSales,
        Permissions.CreateSalesReturn,
        Permissions.ViewAccount
    ],
    [ROLES.MANAGER]: [
        Permissions.ViewDashboard,
        Permissions.ViewAttendance,
        Permissions.ViewAccount,
        Permissions.Viewrestockcard,
        Permissions.ViewTransactions,
        Permissions.PrintQR,
        Permissions.ManageItems,
        Permissions.ManageItemGroup,
        Permissions.CreateSales,
        Permissions.CreateSalesReturn,
        Permissions.CreatePurchase,
        Permissions.CreatePurchaseReturn,
        Permissions.HiddenProFeatures,
    ],
    [ROLES.OWNER]: Object.values(Permissions).filter(
        (permission) => !EXCLUDED_OWNER_PERMISSIONS.includes(permission)
    ),
};


const PERMISSION_DESCRIPTIONS: Partial<Record<Permissions, string>> = {
    [Permissions.ViewDashboard]: 'Access to the main dashboard overview and summary stats.',
    [Permissions.ViewCatalogue]: 'Browse the full product catalogue.',
    [Permissions.ViewFilter]: 'Use date and category filters on dashboard widgets.',
    [Permissions.ViewHidebutton]: 'Toggle visibility of sensitive data on dashboard cards.',
    [Permissions.ViewTopSalesperson]: 'See the top-performing salesperson widget.',
    [Permissions.ViewAttendance]: 'View staff check-in/check-out attendance records.',
    [Permissions.ViewSalescard]: 'See the today\'s sales summary card on dashboard.',
    [Permissions.ViewSalesbarchart]: 'See the sales bar chart on the dashboard.',
    [Permissions.Viewrestockcard]: 'See the low-stock/restock alert card on dashboard.',
    [Permissions.ViewTopSoldItems]: 'See the best-selling items widget on dashboard.',
    [Permissions.ViewTopCustomers]: 'See the top customers widget on dashboard.',
    [Permissions.CreateSales]: 'Process new sales transactions at the POS.',
    [Permissions.CreateSalesReturn]: 'Process refunds and returns on sales.',
    [Permissions.ViewTransactions]: 'Browse the full transaction history log.',
    [Permissions.ViewPaymentmethods]: 'View and select payment types during checkout.',
    [Permissions.ViewSalesReport]: 'Access the detailed sales report page.',
    [Permissions.ViewPNLReport]: 'Access the profit & loss report — contains sensitive financial data.',
    [Permissions.ViewPurchaseReport]: 'Access the purchase history report.',
    [Permissions.ViewItemReport]: 'Access per-item sales and stock reports.',
    [Permissions.CreatePurchase]: 'Create new purchase/stock-in orders from suppliers.',
    [Permissions.CreatePurchaseReturn]: 'Process returns on supplier purchases.',
    [Permissions.ManageItems]: 'Add, edit, and delete inventory items.',
    [Permissions.ManageItemGroup]: 'Create and manage item categories and groups.',
    [Permissions.PrintQR]: 'Print QR code labels for inventory items.',
    [Permissions.ViewAccount]: 'Access to the account/profile page.',
    [Permissions.ManageEditProfile]: 'Update own profile details such as name and photo.',
    [Permissions.SetPermissions]: 'Configure role-based permissions — high privilege action.',
    [Permissions.ManageUsers]: 'Add, edit, or deactivate staff user accounts.',
    [Permissions.CreateUsers]: 'Invite and create new staff accounts.',
    [Permissions.HiddenProFeatures]: 'Unlocks all advanced Pro-tier features across the app.',
    [Permissions.ViewReports]: 'Access the reports section in the navigation.',
    [Permissions.ViewFilterbutton]: 'Use date and category filters on dashboard widgets.',
    [Permissions.ViewPurchaseTransactions]: 'View the purchase-side transaction history.',
    [Permissions.ViewEditReturn]: 'View and edit processed return entries.',
    [Permissions.ViewDownloadPDF]: 'Download transaction receipts and reports as PDF.',
    [Permissions.SalesmanwiseBilling]: 'Assign a specific salesperson to each sale at billing.',
    [Permissions.ItemwiseDiscount]: 'Apply different discount rates per item in a sale.',
    [Permissions.PurchaseTaxtype]: 'Choose the tax type applied on purchase entries.',
    [Permissions.ViewAddons]: 'Access and manage addon/plugin features.',
    [Permissions.ChangeViewtype]: 'Switch between list and grid view on item screens.',
    [Permissions.RoundingOff]: 'Automatically round off the final bill amount.',
    [Permissions.LockDiscountPrice]: 'Prevent cashiers from manually editing discounted prices.',
    [Permissions.AllowDueBilling]: 'Allow saving a sale with a pending/due payment.',
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
            Permissions.SalesmanwiseBilling,
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
            Permissions.ManageItemGroup,
            Permissions.ViewCatalogue,
        ],
    },
    reports: {
        title: 'Reports',
        permissions: [
            Permissions.ViewReports,
            Permissions.ViewSalesReport,
            Permissions.ViewPNLReport,
            Permissions.ViewPurchaseReport,
            Permissions.ViewItemReport,
        ],
    },
    Settings: {
        title: 'Settings',
        permissions: [
            Permissions.SetPermissions,
            Permissions.ManageUsers,
        ],
    },

    Account: {
        title: 'Account',
        permissions: [
            Permissions.ManageEditProfile,
            Permissions.ViewAddons,
        ],
    },
    billing: {
        title: 'Billing & POS Behaviour',
        permissions: [
            Permissions.ItemwiseDiscount,
            Permissions.RoundingOff,
            Permissions.LockDiscountPrice,
            Permissions.AllowDueBilling,
            Permissions.ChangeViewtype,
            Permissions.ViewDownloadPDF,
            Permissions.ViewEditReturn,
            Permissions.ViewPurchaseTransactions,
        ],
    },
    stockControl: {
        title: 'Stock Control',
        permissions: [
            Permissions.AllownegativeStock,
            Permissions.PurchaseTaxtype,
        ],
    },
    userManagement: {
        title: 'User Management',
        permissions: [
            Permissions.CreateUsers,
            Permissions.ViewPaymentmethods,
            Permissions.ViewFilterbutton,
            Permissions.ViewAccount,
            Permissions.PrintQR,
            Permissions.ViewTransactions,
        ],
    },
};
const HIDDEN_FROM_UI_PERMISSIONS = [
    Permissions.HiddenProFeatures,
    Permissions.ViewPartnerDashboard,
];
const getUngroupedPermissions = (allPermissions: Permissions[]): Permissions[] => {
    const grouped = new Set<Permissions>();
    Object.values(permissionGroups).forEach(group => {
        group.permissions.forEach(perm => grouped.add(perm));
    });
    return allPermissions.filter(perm => !grouped.has(perm) && !HIDDEN_FROM_UI_PERMISSIONS.includes(perm));
};

const ManagePermissionsPage: React.FC = () => {
    const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const { currentUser } = useAuth();
    const currentPlan = currentUser?.plan || PLANS.POS_BASIC;
    const isBasicPlan = currentPlan === PLANS.POS_BASIC;

    const [isResetOpen, setIsResetOpen] = useState(false);

    // NEW: tooltip state for tap-based info icons (mobile-safe)
const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

useEffect(() => {
    if (!activeTooltip) return;
    const closeTooltip = () => setActiveTooltip(null);
    document.addEventListener('click', closeTooltip);
    return () => document.removeEventListener('click', closeTooltip);
}, [activeTooltip]);
    const handleResetPermissions = () => {
        const defaults = getDefaultPermissions(selectedRole);
        setRolePermissions(prev => ({
            ...prev,
            [selectedRole]: defaults,
        }));
        setIsResetOpen(false);
    };

    const ALL_ROLES = useMemo(() => Object.values(ROLES), []);

    // Define all roles you want to hide from this management screen
    const EXCLUDED_ROLES_FROM_UI = [ROLES.OWNER, ROLES.AGENCY, ROLES.AGENT];

    const VISIBLE_ROLES = useMemo(() => {
        return ALL_ROLES.filter(r => !EXCLUDED_ROLES_FROM_UI.includes(r));
    }, [ALL_ROLES]);

    const allPermissions = useMemo(() => Object.values(Permissions), []);
    const ungroupedPermissions = useMemo(() => getUngroupedPermissions(allPermissions), [allPermissions]);

    const [selectedRole, setSelectedRole] = useState<string>(VISIBLE_ROLES[0] || 'Manager');


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
                            // FIX: Stop merging defaults here. Just use the stored data!
                            // This ensures unchecked permissions stay unchecked.
                            finalPermissions = getSafePermissionsToSave(role, storedData, currentPlan);
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
                            companyId: companyId,
                            role: role
                        }, { merge: true });
                    }

                    permissionsMap[role] = finalPermissions;
                }

                setRolePermissions(permissionsMap);
            } catch (err) {
                console.error("Error fetching permissions:", err);
                setError("Failed to load permissions.");
            } finally {
                setLoading(false);
            }
        };

        fetchAndEnsurePermissions();
    }, [ALL_ROLES, currentUser?.companyId]);

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

    const handleSaveChanges = async (role: string) => {
        if (!currentUser?.companyId) return;

        try {
            setSuccessMessage(null); setError(null);

            const rawPermissions = rolePermissions[role] || [];
            const permissionsToSave = getSafePermissionsToSave(role, rawPermissions, currentPlan);

            const docRef = doc(db, 'companies', currentUser.companyId, 'permissions', role);
            await setDoc(docRef, { allowedPermissions: permissionsToSave }, { merge: true });

            setSuccessMessage(`Permissions for ${role} updated successfully!`);
            setTimeout(() => setSuccessMessage(null), 3000);

        } catch (err) {
            console.error("Error updating permissions:", err);
            setError(`Failed to update permissions for ${role}.`);
        }
    };

    if (loading) return <Loading />;

    return (
        <div className="bg-gray-100 min-h-screen mb-16">
            <div className="flex items-center justify-between p-2 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30 mb-4">
                <BackButton />
                <h1 className="text-center text-2xl md:text-3xl font-bold text-gray-800">Manage Permissions</h1>
            </div>

            <div className="flex justify-center mb-6">
                <div className="bg-gray-200 p-1 rounded-lg inline-flex flex-wrap justify-center">
                    {VISIBLE_ROLES.map((role) => (
                        <button
                            key={role}
                            onClick={() => setSelectedRole(role)}
                            className={`px-6 py-2 rounded-md text-sm font-medium transition-all capitalize m-0.5 ${selectedRole === role ? 'bg-white text-blue-500 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                            {role}
                        </button>
                    ))}
                </div>
            </div>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 mx-4">{error}</div>}
            {successMessage && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 mx-4">{successMessage}</div>}

            <div className="px-4">
                <div className="bg-white p-4 rounded-lg shadow-md border border-gray-100">
                    <div className="flex justify-between items-center border-b pb-4 mb-6">
                        <h2 className="text-2xl font-semibold capitalize text-gray-800">
                            {selectedRole} Permissions
                        </h2>
                        <div className="flex items-center gap-3">
                            <span className="px-3 py-2 text-xs font-semibold tracking-wide text-blue-800 bg-blue-100 rounded-sm">
                                {rolePermissions[selectedRole]?.length || 0} Active
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsResetOpen(true)}
                                className="text-xs text-red-600 hover:text-red-800 font-bold px-3.5 py-1 rounded-sm bg-red-50 hover:bg-red-100 transition-colors border border-red-100"
                            >
                                Reset to Default
                            </button>
                        </div>
                    </div>

                    {isResetOpen && (
                        <Modal
                            message={`Are you sure you want to reset ${selectedRole} permissions to default? This cannot be undone.`}
                            type={State.ERROR}
                            showConfirmButton={true}
                            onConfirm={handleResetPermissions}
                            onClose={() => setIsResetOpen(false)}
                        />
                    )}


                    <div className="space-y-6">
                        {Object.values(permissionGroups).map((group, index) => (
                            <fieldset key={group.title} className={`p-4 border border-gray-200 rounded-lg bg-gray-50/50 ${index > 0 ? 'pt-4' : ''}`}>
                                <legend className="text-md font-bold text-gray-700 px-2 bg-white">{group.title}</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                                    {group.permissions.map((permission) => {
                                        const isLockedByPlan = isBasicPlan && !BASIC_ALLOWED_PERMISSIONS.includes(permission);

                                        return (
                                            <label
                                                key={permission}
                                                className={`flex items-center space-x-3 p-2 rounded transition 
                ${isLockedByPlan ? 'opacity-60 cursor-not-allowed bg-gray-50' : 'hover:bg-white hover:shadow-sm cursor-pointer'}`
                                                }
                                                title={isLockedByPlan ? "Upgrade to Pro/Enterprise to unlock" : ""}
                                            >
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        disabled={isLockedByPlan}
                                                        className="peer h-5 w-5 appearance-none rounded border border-gray-300 transition-all checked:border-blue-500 checked:bg-blue-600 hover:shadow-sm disabled:bg-gray-200 disabled:border-gray-300"
                                                        checked={rolePermissions[selectedRole]?.includes(permission) || false}
                                                        onChange={(e) => handlePermissionChange(selectedRole, permission, e.target.checked)}
                                                    />
                                                    <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm text-gray-600 select-none font-medium">
                                                        {permission}
                                                    </span>
                                                    {PERMISSION_DESCRIPTIONS[permission] && (
                                                        <div className="relative">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setActiveTooltip(prev => prev === permission ? null : permission);
                                                                }}
                                                                className="flex items-center justify-center w-4 h-4 rounded-full border border-gray-500 text-gray-500 text-[8px] cursor-pointer select-none"
                                                            >
                                                                i
                                                            </button>
                                                            {activeTooltip === permission && (
                                                                <div className="absolute right-0 sm:left-5 sm:right-auto top-full sm:top-1/2 mt-2 sm:mt-0 sm:-translate-y-1/2 z-50 w-48 max-w-[70vw] bg-white border border-gray-400 rounded-md shadow-lg px-3 py-2 text-[11px] text-gray-500 leading-snug">
                                                                    {PERMISSION_DESCRIPTIONS[permission]}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                    {isLockedByPlan && (
                                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded w-max border border-orange-200">
                                                            UPGRADE REQUIRED
                                                        </span>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </fieldset>
                        ))}
                        {ungroupedPermissions.length > 0 && (
                            <fieldset className="p-4 border border-gray-200 rounded-lg bg-gray-50/50">
                                <legend className="text-md font-bold text-gray-700 px-2 bg-white border border-gray-200 rounded shadow-sm">Other</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                                    {ungroupedPermissions.map((permission) => {
                                        const isLockedByPlan = isBasicPlan && !BASIC_ALLOWED_PERMISSIONS.includes(permission);
                                        return (
                                            <label
                                                key={permission}
                                                className={`flex items-center space-x-3 p-2 rounded transition 
                ${isLockedByPlan ? 'opacity-60 cursor-not-allowed bg-gray-50' : 'hover:bg-white hover:shadow-sm cursor-pointer'}`
                                                }
                                                title={isLockedByPlan ? "Upgrade to Pro/Enterprise to unlock" : ""}
                                            >
                                                <div className="relative flex items-center">
                                                    <input
                                                        type="checkbox"
                                                        disabled={isLockedByPlan}
                                                        className="peer h-5 w-5 appearance-none rounded border border-gray-300 transition-all checked:border-blue-500 checked:bg-blue-600 hover:shadow-sm disabled:bg-gray-200 disabled:border-gray-300"
                                                        checked={rolePermissions[selectedRole]?.includes(permission) || false}
                                                        onChange={(e) => handlePermissionChange(selectedRole, permission, e.target.checked)}
                                                    />
                                                    <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-sm text-gray-600 select-none font-medium">
                                                        {permission}
                                                    </span>
                                                    {PERMISSION_DESCRIPTIONS[permission] && (
                                                        <div className="relative group">
                                                            <span className="flex items-center justify-center w-3 h-3 rounded-full border border-gray-500 text-gray-500 text-[8px] cursor-default select-none">
                                                                i
                                                            </span>
                                                            <div className="absolute left-5 top-1/2 -translate-y-1/2 z-50 hidden group-hover:block w-52 bg-white border border-gray-400 rounded-md shadow-md px-3 py-2 text-[11px] text-gray-500 leading-snug pointer-events-none">
                                                                {PERMISSION_DESCRIPTIONS[permission]}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {isLockedByPlan && (
                                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded w-max border border-orange-200">
                                                            UPGRADE REQUIRED
                                                        </span>
                                                    )}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </fieldset>
                        )}
                    </div>
                </div>
            </div>

            <div className="fixed inset-x-0 bottom-16 md:bottom-0 z-40 bg-transparent px-4 pb-2 md:p-4 pointer-events-none">
                <div className="max-w-2xl mx-auto flex justify-center gap-4 pointer-events-auto">
                    <button
                        onClick={() => handleSaveChanges(selectedRole)}
                        className="w-auto bg-blue-600 text-white font-bold py-3 px-4 rounded-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-lg transition-transform active:scale-95"
                    >
                        Save Changes for {selectedRole}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManagePermissionsPage;