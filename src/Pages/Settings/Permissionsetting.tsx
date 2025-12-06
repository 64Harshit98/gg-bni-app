import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc, collection } from 'firebase/firestore';
import { Permissions, ROLES } from '../../enums';
import Loading from '../Loading/Loading';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/auth-context';

type RolePermissionsMap = Record<string, Permissions[]>;

// --- CONFIGURATION: 1. Permission Groups for UI ---
const permissionGroups = {
    dashboard: {
        title: 'Dashboard & General',
        permissions: [
            Permissions.ViewDashboard,
            Permissions.ViewTopSalesperson,
            Permissions.ViewAttendance,
            Permissions.ViewSalescard,
            Permissions.ViewSalesbarchart,
            Permissions.Viewrestockcard,
            Permissions.ViewTopSoldItems,
        ],
    },
    sales: {
        title: 'Sales & Reports',
        permissions: [
            Permissions.CreateSales,
            Permissions.CreateSalesReturn,
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
    admin: {
        title: 'Adder',
        permissions: [
            Permissions.ViewTransactions,
            Permissions.CreateUsers,
            Permissions.PrintQR,
        ],
    },
    Account: {
        title: 'Account',
        permissions: [
            Permissions.ManageEditProfile,
        ],
    },
};

// --- CONFIGURATION: 2. Ignored Permissions for Owner ---
const IGNORED_OWNER_PERMISSIONS = [
    Permissions.ViewAttendance,
];

// --- CONFIGURATION: 3. Default Forced Permissions ---
const DEFAULT_SALESMAN_PERMISSIONS = [
    Permissions.ViewAttendance,
    Permissions.ViewDashboard,
    Permissions.CreateSales,
    Permissions.CreateSalesReturn,
    Permissions.ManageEditProfile
];

const DEFAULT_MANAGER_PERMISSIONS = [
    Permissions.ViewDashboard,
    Permissions.ViewAttendance,
    Permissions.Viewrestockcard,
    Permissions.ViewTransactions,
    Permissions.PrintQR,
    Permissions.ManageItems,
    Permissions.ManageItemGroup,
    Permissions.CreateSales,
    Permissions.CreateSalesReturn,
    Permissions.CreatePurchase,
    Permissions.CreatePurchaseReturn,
];

const getUngroupedPermissions = (allPermissions: Permissions[]): Permissions[] => {
    const grouped = new Set<Permissions>();
    Object.values(permissionGroups).forEach(group => {
        group.permissions.forEach(perm => grouped.add(perm));
    });
    return allPermissions.filter(perm => !grouped.has(perm));
};

const ManagePermissionsPage: React.FC = () => {
    const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    const allPermissions = useMemo(() => Object.values(Permissions), []);
    
    // 1. ALL_ROLES: Used for the Background Sync logic (Includes Owner)
    const ALL_ROLES = useMemo(() => Object.values(ROLES), []);

    // 2. VISIBLE_ROLES: Used for the UI (Excludes Owner)
    const VISIBLE_ROLES = useMemo(() => ALL_ROLES.filter(r => r !== ROLES.OWNER), [ALL_ROLES]);

    const ungroupedPermissions = useMemo(() => getUngroupedPermissions(allPermissions), [allPermissions]);

    // Default to the first visible role (e.g., Manager)
    const [selectedRole, setSelectedRole] = useState<string>(VISIBLE_ROLES[0] || 'Manager');

    // --- EFFECT: Fetch and Enforce Permissions (Background Sync) ---
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

                // Iterate over ALL roles to ensure Owner is synced in DB, even if hidden in UI
                for (const role of ALL_ROLES) {
                    const docRef = doc(permissionsCollectionRef, role);
                    const docSnap = await getDoc(docRef);

                    let finalPermissions: Permissions[] = [];
                    let shouldUpdateDB = false;

                    // 1. OWNER LOGIC (All permissions minus ignored ones)
                    if (role === ROLES.OWNER) {
                        finalPermissions = allPermissions.filter(
                            perm => !IGNORED_OWNER_PERMISSIONS.includes(perm)
                        );
                        shouldUpdateDB = true; // Always force sync Owner
                    }

                    // 2. MANAGER LOGIC (Merge existing + Defaults)
                    else if (role === ROLES.MANAGER) {
                        const existing = docSnap.exists() ? (docSnap.data().allowedPermissions || []) : [];
                        finalPermissions = [...new Set([...existing, ...DEFAULT_MANAGER_PERMISSIONS])];
                        
                        if (!docSnap.exists() || finalPermissions.length !== existing.length) {
                            shouldUpdateDB = true;
                        }
                    }

                    // 3. SALESMAN LOGIC (Merge existing + Defaults)
                    else if (role === ROLES.SALESMAN) {
                        const existing = docSnap.exists() ? (docSnap.data().allowedPermissions || []) : [];
                        finalPermissions = [...new Set([...existing, ...DEFAULT_SALESMAN_PERMISSIONS])];

                        if (!docSnap.exists() || finalPermissions.length !== existing.length) {
                            shouldUpdateDB = true;
                        }
                    }

                    // 4. OTHER ROLES (Standard Fetch)
                    else {
                        if (docSnap.exists()) {
                            let data = docSnap.data().allowedPermissions || [];
                            if (typeof data === 'string') {
                                try { data = JSON.parse(data); } catch { data = []; }
                            }
                            finalPermissions = Array.isArray(data) ? data : [];
                        } else {
                            finalPermissions = [];
                            shouldUpdateDB = true;
                        }
                    }

                    // --- DB SYNC ---
                    if (shouldUpdateDB) {
                        await setDoc(docRef, {
                            allowedPermissions: finalPermissions,
                            companyId: companyId,
                            role: role
                        }, { merge: true });
                    }

                    // --- LOCAL STATE UPDATE ---
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
    }, [allPermissions, ALL_ROLES, currentUser?.companyId]);

    const handlePermissionChange = (role: string, permission: Permissions, isChecked: boolean) => {
        setRolePermissions(prev => {
            const currentPermissions = prev[role] || [];
            if (isChecked) {
                return {
                    ...prev,
                    [role]: [...new Set([...currentPermissions, permission])],
                };
            } else {
                return {
                    ...prev,
                    [role]: currentPermissions.filter(p => p !== permission),
                };
            }
        });
    };

    const handleSaveChanges = async (role: string) => {
        if (!currentUser?.companyId) {
            setError("Cannot save: User/Company not found.");
            return;
        }

        try {
            setSuccessMessage(null);
            setError(null);
            const permissionsToSave = rolePermissions[role] || [];

            const docRef = doc(db, 'companies', currentUser.companyId, 'permissions', role);
            await setDoc(docRef, { allowedPermissions: permissionsToSave }, { merge: true });

            setSuccessMessage(`Permissions for ${role} updated successfully!`);
            setTimeout(() => setSuccessMessage(null), 3000);

        } catch (err) {
            console.error("Error updating permissions:", err);
            setError(`Failed to update permissions for ${role}.`);
        }
    };

    if (loading) {
        return <Loading />;
    }

    return (
        <div className="bg-gray-100 min-h-screen mb-16">
            <div className="flex items-center justify-between p-2 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30 mb-4">
                <button
                    onClick={() => navigate(-1)}
                    className="rounded-full bg-gray-200 p-2 text-gray-700 transition hover:bg-gray-300"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                    </svg>
                </button>
                <h1 className="text-center text-2xl md:text-3xl font-bold text-gray-800">Manage Permissions</h1>
            </div>

            {/* --- Role Toggle Switch (Visible Roles Only) --- */}
            <div className="flex justify-center mb-6">
                <div className="bg-gray-200 p-1 rounded-lg inline-flex flex-wrap justify-center">
                    {VISIBLE_ROLES.map((role) => (
                        <button
                            key={role}
                            onClick={() => setSelectedRole(role)}
                            className={`px-6 py-2 rounded-md text-sm font-medium transition-all capitalize m-0.5 ${selectedRole === role
                                ? 'bg-white text-sky-500 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                                }`}
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
                        <h2 className="text-2xl font-semibold capitalize text-gray-800">{selectedRole} Permissions</h2>
                        <span className="px-3 py-1 text-xs font-semibold tracking-wide text-blue-800 bg-blue-100 rounded-sm">
                            {rolePermissions[selectedRole]?.length || 0} Active
                        </span>
                    </div>

                    <div className="space-y-6">
                        {Object.values(permissionGroups).map((group, index) => (
                            <fieldset key={group.title} className={`p-4 border border-gray-200 rounded-lg bg-gray-50/50 ${index > 0 ? 'pt-4' : ''}`}>
                                <legend className="text-md font-bold text-gray-700 px-2 bg-white">
                                    {group.title}
                                </legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                                    {group.permissions.map((permission) => (
                                        <label key={permission} className="flex items-center space-x-3 p-2 rounded transition hover:bg-white hover:shadow-sm cursor-pointer">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    className="peer h-5 w-5 appearance-none rounded border border-gray-300 transition-all checked:border-sky-500 checked:bg-sky-500 hover:shadow-sm"
                                                    checked={rolePermissions[selectedRole]?.includes(permission) || false}
                                                    onChange={(e) => handlePermissionChange(selectedRole, permission, e.target.checked)}
                                                />
                                                <svg className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" width="12" height="12">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                            </div>
                                            <span className="text-sm text-gray-600 select-none font-medium">{permission}</span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        ))}

                        {ungroupedPermissions.length > 0 && (
                            <fieldset className="p-4 border border-gray-200 rounded-lg bg-gray-50/50">
                                <legend className="text-md font-bold text-gray-700 px-2 bg-white border border-gray-200 rounded shadow-sm">Other</legend>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                                    {ungroupedPermissions.map((permission) => (
                                        <label key={permission} className="flex items-center space-x-3 p-2 rounded transition hover:bg-white hover:shadow-sm cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="h-5 w-5 rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                                                checked={rolePermissions[selectedRole]?.includes(permission) || false}
                                                onChange={(e) => handlePermissionChange(selectedRole, permission, e.target.checked)}
                                            />
                                            <span className="text-sm text-gray-600 font-medium">{permission}</span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        )}
                    </div>

                </div>
            </div>

            <div className="mt-4 text-center border rounded-sm pt-4 sticky bottom-10 bg-white pb-4 mx-4 shadow-lg z-20">
                <button
                    onClick={() => handleSaveChanges(selectedRole)}
                    className="bg-sky-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-lg transition-transform active:scale-95"
                >
                    Save Changes for {selectedRole}
                </button>
            </div>
        </div>
    );
};

export default ManagePermissionsPage;