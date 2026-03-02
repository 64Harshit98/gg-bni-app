import React, { useState, useMemo } from 'react';
//  BACKEND IMPORTS COMMENTED
// import { db } from '../../lib/Firebase';
// import { doc, getDoc, setDoc, collection } from 'firebase/firestore';

import { Cata_Permissions as Permissions } from '../../Catalogue/enum/cata_permissions.enum';
import { ROLES } from '../../enums';
// import Loading from '../../Pages/Loading/Loading';
import { useNavigate } from 'react-router';
// import { useAuth } from '../../context/auth-context';

type RolePermissionsMap = Record<string, Permissions[]>;

export const EXCLUDED_OWNER_PERMISSIONS: Permissions[] = [
    Permissions.ViewAttendance,
];

// SALESMAN safe permissions
const DEFAULT_PERMISSIONS_MAP: Record<string, Permissions[]> = {
    [ROLES.SALESMAN]: [
        Permissions.ViewDashboard,
        Permissions.ViewCatalogue,
        Permissions.ViewFilter,
        Permissions.ViewAttendance,
        Permissions.ViewOrderscard,
        Permissions.ViewSalesbarchart,
        Permissions.ViewTopSoldItems,
        Permissions.ViewTopCustomers,
        Permissions.CreateOrders,
        Permissions.CreateOrdersReturn,
    ],

    [ROLES.MANAGER]: [],

    [ROLES.OWNER]: Object.values(Permissions).filter(
        (permission) => !EXCLUDED_OWNER_PERMISSIONS.includes(permission)
    ),
};

export const getDefaultPermissions = (role: string): Permissions[] => {
    if (DEFAULT_PERMISSIONS_MAP[role]) {
        return DEFAULT_PERMISSIONS_MAP[role];
    }
    if (role === ROLES.OWNER) return Object.values(Permissions);
    return [];
};

export const getSafePermissionsToSave = (
    role: string,
    currentPermissions: Permissions[]
): Permissions[] => {
    if (role === ROLES.OWNER) {
        return currentPermissions.filter(
            (p) => !EXCLUDED_OWNER_PERMISSIONS.includes(p)
        );
    }
    return currentPermissions;
};

const permissionGroups = {
    dashboard: {
        title: 'Dashboard & General',
        permissions: [
            Permissions.ViewDashboard,
            Permissions.ViewHidebutton,
            Permissions.ViewFilter,
            Permissions.ViewOrderscard,
            Permissions.ViewSalesbarchart,
            Permissions.ViewPaymentmethods,
            Permissions.ViewTopSoldItems,
            Permissions.ViewTopSalesperson,
            Permissions.ViewTopCustomers,
            Permissions.ViewAttendance,
            Permissions.Viewrestockcard,
            Permissions.ViewCatalogue,
        ],
    },

    transactions: {
        title: 'Transactions',
        permissions: [
            Permissions.ViewFilterbutton,
            Permissions.ViewEditReturn,
            Permissions.CreateOrders,
            Permissions.CreateOrdersReturn,
            Permissions.PrintQR,
        ],
    },

    reports: {
        title: 'Reports',
        permissions: [
            Permissions.ViewReports,
            Permissions.ViewItemReport,
            Permissions.ViewSalesReport,
            Permissions.ViewPNLReport,
            Permissions.ViewDownloadPDF,
        ],
    },

    settings: {
        title: 'Settings & Billing',
        permissions: [
            Permissions.ChangeViewtype,
            Permissions.SalesmanwiseBilling,
            Permissions.RoundingOff,
            Permissions.ItemwiseDiscount,
            Permissions.LockDiscountPrice,
            Permissions.AllownegativeStock,
            Permissions.AllowDueBilling,
        ],
    },

    management: {
        title: 'Inventory & User Management',
        permissions: [
            Permissions.ManageItemGroup,
            Permissions.ManageItems,
            Permissions.ManageUsers,
            Permissions.ManageEditProfile,
            Permissions.CreateUsers,
            Permissions.SetPermissions,
        ],
    },
};

const CataloguePermissionSetting: React.FC = () => {
    const navigate = useNavigate();

    // AUTH DISABLED
    // const { currentUser } = useAuth();

    //  LOCAL MOCK STATE
    const [rolePermissions, setRolePermissions] =
        useState<RolePermissionsMap>({
            [ROLES.SALESMAN]: getDefaultPermissions(ROLES.SALESMAN),
        });

    const [loading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const ALL_ROLES = useMemo(() => Object.values(ROLES), []);

    // ONLY SALESMAN visible
    const VISIBLE_ROLES = useMemo(
        () => ALL_ROLES.filter((r) => r === ROLES.SALESMAN),
        [ALL_ROLES]
    );

    const [selectedRole, setSelectedRole] =
        useState<string>(ROLES.SALESMAN);

    //  FIRESTORE FETCH COMPLETELY DISABLED
    /*
    useEffect(() => {
      // backend disabled
    }, []);
    */

    const handlePermissionChange = (
        role: string,
        permission: Permissions,
        isChecked: boolean
    ) => {
        setRolePermissions((prev) => {
            const currentPermissions = prev[role] || [];

            if (isChecked) {
                return {
                    ...prev,
                    [role]: [...new Set([...currentPermissions, permission])],
                };
            } else {
                return {
                    ...prev,
                    [role]: currentPermissions.filter((p) => p !== permission),
                };
            }
        });
    };

    //  SAVE API DISABLED (FRONTEND ONLY)
    const handleSaveChanges = async (role: string) => {
        try {
            setSuccessMessage(`(Mock) Permissions for ${role} updated!`);
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            setError(`Failed to update permissions for ${role}.`);
        }
    };

    // if (loading) return <Loading />;
    if (loading) return null;

    return (
        <div className="bg-gray-100 min-h-screen mb-16">
            <div className="flex items-center justify-between p-2 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30 mb-4">
                <button
                    onClick={() => navigate(-1)}
                    className="rounded-full bg-gray-200 p-2 text-gray-700 hover:bg-gray-300"
                >
                    ✕
                </button>
                <h1 className="text-center text-2xl md:text-3xl font-bold text-gray-800">
                    Manage Permissions
                </h1>
            </div>

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

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 mx-4">
                    {error}
                </div>
            )}
            {successMessage && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 mx-4">
                    {successMessage}
                </div>
            )}

            <div className="px-4">
                <div className="bg-white p-4 rounded-lg shadow-md border border-gray-100">
                    <div className="flex justify-between items-center border-b pb-4 mb-6">
                        <h2 className="text-2xl font-semibold capitalize text-gray-800">
                            {selectedRole} Permissions
                        </h2>
                        <span className="px-3 py-1 text-xs font-semibold tracking-wide text-blue-800 bg-blue-100 rounded-sm">
                            {rolePermissions[selectedRole]?.length || 0} Active
                        </span>
                    </div>

                    <div className="space-y-6">
                        {Object.values(permissionGroups).map((group, index) => (
                            <fieldset
                                key={group.title}
                                className={`p-4 border border-gray-200 rounded-lg bg-gray-50/50 ${index > 0 ? 'pt-4' : ''
                                    }`}
                            >
                                <legend className="text-md font-bold text-gray-700 px-2 bg-white">
                                    {group.title}
                                </legend>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
                                    {group.permissions.map((permission) => (
                                        <label
                                            key={permission}
                                            className="flex items-center space-x-3 p-2 rounded transition hover:bg-white hover:shadow-sm cursor-pointer"
                                        >
                                            <input
                                                type="checkbox"
                                                className="h-5 w-5 rounded border-gray-300 text-sky-500"
                                                checked={
                                                    rolePermissions[selectedRole]?.includes(permission) ||
                                                    false
                                                }
                                                onChange={(e) =>
                                                    handlePermissionChange(
                                                        selectedRole,
                                                        permission,
                                                        e.target.checked
                                                    )
                                                }
                                            />
                                            <span className="text-sm text-gray-600 font-medium">
                                                {permission}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-4 text-center rounded-sm pt-4 sticky bottom-10 bg-transparent pb-4 mx-4">
                <button
                    onClick={() => handleSaveChanges(selectedRole)}
                    className="w-auto bg-sky-500 text-white font-bold py-3 px-4 rounded-sm hover:bg-blue-700"
                >
                    Save Changes for {selectedRole}
                </button>
            </div>
        </div>
    );
};

export default CataloguePermissionSetting;