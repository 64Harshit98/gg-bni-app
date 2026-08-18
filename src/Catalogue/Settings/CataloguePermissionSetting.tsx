import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth } from '../../context/auth-context';
import { ROLES, State } from '../../enums';
import { Cata_Permissions } from '../../Catalogue/enum/cata_permissions.enum';
import BackButton from '../../Components/BackButton';
import { Modal } from '../../constants/Modal';

const CATA_PERM_VALUES = Object.values(Cata_Permissions);

// --- DEFAULTS ---
export const getDefaultCataPermissions = (role: string): Cata_Permissions[] => {
    switch (role) {
        case ROLES.OWNER:
            return Object.values(Cata_Permissions);
        case ROLES.MANAGER:
            return [
                Cata_Permissions.ViewCatalogueDashboard,
                Cata_Permissions.ViewCatalogueAccounts,
                Cata_Permissions.ViewCatalogueOrders,
                Cata_Permissions.ViewCatalogueRequests,
                Cata_Permissions.ViewCatalogueFilter,
                Cata_Permissions.ViewReports,
                Cata_Permissions.ManageItems,
                Cata_Permissions.ViewEditButton,
                Cata_Permissions.ViewShop,
                Cata_Permissions.ViewShopItems,
            ];
        case ROLES.SALESMAN:
            return [
                Cata_Permissions.ViewCatalogueDashboard,
                Cata_Permissions.ViewCatalogueOrders,
                Cata_Permissions.ViewCatalogueFilter,
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

// --- DESCRIPTIONS (Tooltips) ---
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
    [Cata_Permissions.ViewReports]: 'ViewReports & Settings',
    [Cata_Permissions.ViewShop]: 'View Catalog',
    [Cata_Permissions.ViewShopItems]: 'View Catalog Item',
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

const CataloguePermissionSetting: React.FC = () => {
    const { currentUser } = useAuth();
    const [rolePermissions, setRolePermissions] = useState<Record<string, Cata_Permissions[]>>({});
    const [loading, setLoading] = useState(true);
    const [selectedRole, setSelectedRole] = useState<string>(ROLES.SALESMAN);

    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [isResetOpen, setIsResetOpen] = useState(false);

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

            // 2. FETCH SALESMAN & MANAGER FOR UI
            const rolesToManage = [ROLES.SALESMAN, ROLES.MANAGER];
            const newMap: Record<string, Cata_Permissions[]> = {};

            for (const role of rolesToManage) {
                const docRef = doc(db, 'companies', companyId, 'cata_permissions', role);
                const snap = await getDoc(docRef);

                if (snap.exists()) {
                    newMap[role] = snap.data().allowedPermissions || [];
                } else {
                    newMap[role] = [];
                }
            }

            setRolePermissions(newMap);
            setLoading(false);
        };

        initializeAndFetchPermissions();
    }, [currentUser?.companyId]);

    // --- LOCAL STATE UPDATE (No longer auto-saves) ---
    const handlePermissionChange = (role: string, perm: Cata_Permissions, checked: boolean) => {
        const currentUI = rolePermissions[role] || [];
        const newCataloguePerms = checked
            ? [...new Set([...currentUI, perm])]
            : currentUI.filter(p => p !== perm);

        setRolePermissions(prev => ({ ...prev, [role]: newCataloguePerms }));
    };

    // --- MANUAL SAVE LOGIC ---
    const handleSaveChanges = async (role: string) => {
        if (!currentUser?.companyId) return;
        setSaveStatus('saving');

        try {
            const docRef = doc(db, 'companies', currentUser.companyId, 'cata_permissions', role);

            await setDoc(docRef, {
                allowedPermissions: rolePermissions[role] || [],
                role: role,
                companyId: currentUser.companyId
            }, { merge: true });

            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);

        } catch (error) {
            console.error("Save failed:", error);
            setSaveStatus('error');
        }
    };

    // --- RESET LOGIC ---
    const handleResetPermissions = async () => {
        if (!currentUser?.companyId) return;

        const defaults = getDefaultCataPermissions(selectedRole);

        // Update Local State
        setRolePermissions(prev => ({ ...prev, [selectedRole]: defaults }));
        setIsResetOpen(false);
        setSaveStatus('saving');

        // Save Defaults to Firebase Immediately
        try {
            const docRef = doc(db, 'companies', currentUser.companyId, 'cata_permissions', selectedRole);
            await setDoc(docRef, {
                allowedPermissions: defaults,
                role: selectedRole,
                companyId: currentUser.companyId
            }, { merge: true });

            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 3000);
        } catch (error) {
            console.error("Reset failed:", error);
            setSaveStatus('error');
        }
    };

    if (loading) return <div className="p-4">Loading permissions...</div>;

    return (
        <div className="p-4 bg-gray-50 min-h-screen pb-24">
            <div className="flex items-center justify-between mb-6 bg-white p-4 rounded shadow-sm sticky top-0 z-30">
                <div className="flex items-center gap-4">
                    <BackButton />
                    <h1 className="text-2xl font-bold text-gray-800">Catalogue Permissions</h1>
                </div>

                <div className="text-sm font-medium">
                    {saveStatus === 'saving' && <span className="text-[#F97316] animate-pulse">Saving changes...</span>}
                    {saveStatus === 'saved' && <span className="text-green-600">✓ All changes saved</span>}
                    {saveStatus === 'error' && <span className="text-red-500">❌ Error saving</span>}
                </div>
            </div>

            <div className="flex gap-2 mb-6 justify-center">
                <div className="bg-gray-200 p-1 rounded-lg inline-flex">
                    {[ROLES.SALESMAN, ROLES.MANAGER].map(role => (
                        <button
                            key={role}
                            onClick={() => setSelectedRole(role)}
                            className={`px-6 py-2 font-medium rounded transition-colors ${selectedRole === role
                                ? 'bg-white text-[#F97316] shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                                }`}
                        >
                            {role}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 max-w-7xl mx-auto">
                <div className="flex justify-between items-center border-b pb-4 mb-6">
                    <h2 className="text-xl font-semibold capitalize text-gray-800">
                        {selectedRole} Access
                    </h2>
                    <div className="flex items-center gap-3">
                        <span className="px-3 py-2 text-xs font-semibold tracking-wide text-orange-800 bg-orange-100 rounded-sm">
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
                    {/* Render Grouped Permissions */}
                    {Object.values(cataPermissionGroups).map((group, index) => {
                        if (group.permissions.length === 0) return null;
                        return (
                            <fieldset key={group.title} className={`p-4 border border-gray-200 rounded-lg bg-gray-50/50 ${index > 0 ? 'pt-4' : ''}`}>
                                <legend className="text-md font-bold text-gray-700 px-2 bg-white">{group.title}</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                                    {group.permissions.map((permission) => (
                                        <PermissionCheckbox
                                            key={permission}
                                            permission={permission as Cata_Permissions}
                                            isChecked={rolePermissions[selectedRole]?.includes(permission as Cata_Permissions) || false}
                                            onChange={(checked) => handlePermissionChange(selectedRole, permission as Cata_Permissions, checked)}
                                        />
                                    ))}
                                </div>
                            </fieldset>
                        );
                    })}

                    {/* Render Ungrouped Permissions */}
                    {ungroupedPermissions.length > 0 && (
                        <fieldset className="p-4 border border-gray-200 rounded-lg bg-gray-50/50">
                            <legend className="text-md font-bold text-gray-700 px-2 bg-white border border-gray-200 rounded shadow-sm">Other Permissions</legend>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                                {ungroupedPermissions.map((permission) => (
                                    <PermissionCheckbox
                                        key={permission}
                                        permission={permission}
                                        isChecked={rolePermissions[selectedRole]?.includes(permission) || false}
                                        onChange={(checked) => handlePermissionChange(selectedRole, permission, checked)}
                                    />
                                ))}
                            </div>
                        </fieldset>
                    )}
                </div>
            </div>

            {/* FLOATING SAVE BUTTON */}
            <div className="fixed inset-x-0 bottom-16 md:bottom-0 z-40 bg-transparent px-4 pb-2 md:p-4 pointer-events-none">
                <div className="max-w-2xl mx-auto flex justify-center gap-4 pointer-events-auto">
                    <button
                        onClick={() => handleSaveChanges(selectedRole)}
                        className="w-auto bg-[#F97316] text-white font-bold py-3 px-6 rounded-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 shadow-lg transition-transform active:scale-95"
                    >
                        Save Changes for {selectedRole}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- EXTRACTED CHECKBOX COMPONENT ---
const PermissionCheckbox = ({
    permission,
    isChecked,
    onChange
}: {
    permission: Cata_Permissions;
    isChecked: boolean;
    onChange: (checked: boolean) => void;
}) => {
    return (
        <label className="flex items-center space-x-3 p-2 rounded transition hover:bg-white hover:shadow-sm cursor-pointer">
            <div className="relative flex items-center">
                <input
                    type="checkbox"
                    className="peer h-5 w-5 appearance-none rounded border border-gray-300 transition-all checked:border-[#F97316] checked:bg-[#F97316] hover:shadow-sm"
                    checked={isChecked}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            </div>
            <div className="flex items-center gap-1.5">
                <span className="text-sm text-gray-600 select-none font-medium">
                    {CATA_PERMISSION_LABELS[permission] || permission}
                </span>
                {CATA_PERMISSION_DESCRIPTIONS[permission] && (
                    <div className="relative group">
                        <span className="flex items-center justify-center w-3 h-3 rounded-full border border-gray-500 text-gray-500 text-[8px] cursor-default select-none">
                            i
                        </span>
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 z-50 hidden group-hover:block w-52 bg-white border border-gray-400 rounded-md shadow-md px-3 py-2 text-[11px] text-gray-500 leading-snug pointer-events-none">
                            {CATA_PERMISSION_DESCRIPTIONS[permission]}
                        </div>
                    </div>
                )}
            </div>
        </label>
    );
};

export default CataloguePermissionSetting;