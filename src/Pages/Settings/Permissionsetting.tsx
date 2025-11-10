import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/Firebase';
import { doc, getDoc, setDoc, collection } from 'firebase/firestore';
import { Permissions, ROLES } from '../../enums';
import Loading from '../Loading/Loading';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/auth-context';

type RolePermissionsMap = Record<string, Permissions[]>;

// --- 1. Define Permission Groups ---
// (This structure will be used to render the groups inside each card)
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
            Permissions.ManagePayments,
        ],
    },
    Account: {
        title: 'Account',
        permissions: [
            Permissions.ManageEditProfile,
        ],
    },
};

// Function to get all permissions not in the defined groups
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
    // --- FIX: Filter out the Owner role from the list ---
    const APP_ROLES = useMemo(() => Object.values(ROLES).filter(role => role !== ROLES.OWNER), []);
    const ungroupedPermissions = useMemo(() => getUngroupedPermissions(allPermissions), [allPermissions]);

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

                // Now only fetches for non-owner roles
                for (const role of APP_ROLES) {
                    const docRef = doc(permissionsCollectionRef, role);
                    const docSnap = await getDoc(docRef);

                    if (docSnap.exists()) {
                        let permissionsData = docSnap.data().allowedPermissions || [];
                        if (typeof permissionsData === 'string') {
                            try {
                                permissionsData = JSON.parse(permissionsData);
                                if (!Array.isArray(permissionsData)) permissionsData = [];
                            } catch (e) {
                                permissionsData = [];
                            }
                        }
                        permissionsMap[role] = permissionsData;
                    } else {
                        // Create a new (empty) permission document
                        permissionsMap[role] = [];
                        await setDoc(docRef, {
                            allowedPermissions: [],
                            companyId: companyId,
                            role: role
                        });
                    }
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
    }, [allPermissions, APP_ROLES, currentUser?.companyId]); // APP_ROLES is stable

    const handlePermissionChange = (role: string, permission: Permissions, isChecked: boolean) => {
        // Owner role is already filtered from the UI, but this is a good safety check
        if (role === ROLES.OWNER) {
            return;
        }

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
        if (role === ROLES.OWNER) {
            setError("Cannot modify owner permissions.");
            return;
        }

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
        <div className="p-2 bg-gray-50 min-h-screen mb-16">
            <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Manage Permissions</h1>
                <button
                    onClick={() => navigate(-1)}
                    className="rounded-full bg-gray-200 p-2 text-gray-700 transition hover:bg-gray-300"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                    </svg>
                </button>
            </div>
            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
            {successMessage && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">{successMessage}</div>}

            <div className="space-y-8 mt-4">
                {/* --- FIX: Map over the filtered APP_ROLES --- */}
                {APP_ROLES.map((role) => (
                    <div key={role} className="bg-white p-2 rounded-lg shadow-md">
                        <h2 className="text-2xl font-semibold mb-6 capitalize text-gray-700 border-b pb-4">{role}</h2>

                        {/* --- FIX: Render permission groups *inside* the role card --- */}
                        <div className="space-y-6">
                            {Object.values(permissionGroups).map((group, index) => (
                                <fieldset key={group.title} className={`p-4 border rounded-lg ${index > 0 ? 'pt-1' : ''}`}>
                                    <legend className="text-lg font-medium text-gray-900 mb-1 ">{group.title}</legend>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3">
                                        {group.permissions.map((permission) => (
                                            <label key={permission} className="flex items-center space-x-3 p-1 rounded hover:bg-gray-50">
                                                <input
                                                    type="checkbox"
                                                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    checked={rolePermissions[role]?.includes(permission) || false}
                                                    onChange={(e) => handlePermissionChange(role, permission, e.target.checked)}
                                                />
                                                <span className="text-gray-700 truncate">{permission}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            ))}

                            {ungroupedPermissions.length > 0 && (
                                <fieldset className="p-4 border rounded-lg pt-4">
                                    <legend className="text-lg font-medium text-gray-900 mb-3 px-2">Other</legend>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                                        {ungroupedPermissions.map((permission) => (
                                            <label key={permission} className="flex items-center space-x-3 p-1 rounded hover:bg-gray-50">
                                                <input
                                                    type="checkbox"
                                                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    checked={rolePermissions[role]?.includes(permission) || false}
                                                    onChange={(e) => handlePermissionChange(role, permission, e.target.checked)}
                                                />
                                                <span className="text-gray-700 truncate">{permission}</span>
                                            </label>
                                        ))}
                                    </div>
                                </fieldset>
                            )}
                        </div>

                        <div className="mt-6 text-right border-t pt-4">
                            <button
                                onClick={() => handleSaveChanges(role)}
                                className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                                Save Changes for {role}
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ManagePermissionsPage;