import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';
// ✅ CHANGED: Import the new ROLES enum
import { Permissions, ROLES } from '../../enums';
import Loading from '../../Pages/Loading/Loading';
import { useNavigate } from 'react-router';

type RolePermissionsMap = Record<string, Permissions[]>;

// ✅ CHANGED: This is no longer needed
// const APP_ROLES = ['owner', 'admin', 'member'];

const ManagePermissionsPage: React.FC = () => {
    const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const navigate = useNavigate();

    const allPermissions = useMemo(() => Object.values(Permissions), []);

    // ✅ CHANGED: Create the ROLES array from the enum and memoize it
    const APP_ROLES = useMemo(() => Object.values(ROLES), []);

    useEffect(() => {
        const fetchAndEnsurePermissions = async () => {
            try {
                const permissionsMap: RolePermissionsMap = {};

                for (const role of APP_ROLES) {
                    const docRef = doc(db, 'permissions', role);

                    // ✅ CHANGED: Use the enum for comparison
                    if (role === ROLES.OWNER) {
                        // --- Enforce Owner Permissions ---
                        permissionsMap[role] = allPermissions;

                        const docSnap = await getDoc(docRef);
                        const data = docSnap.data()?.allowedPermissions || [];

                        let dbPermissions = data;
                        if (typeof dbPermissions === 'string') {
                            try {
                                dbPermissions = JSON.parse(dbPermissions);
                            } catch {
                                dbPermissions = [];
                            }
                        }

                        if (!docSnap.exists() || dbPermissions.length !== allPermissions.length) {
                            await setDoc(docRef, { allowedPermissions: allPermissions });
                        }
                    } else {
                        // --- Fetch or Create Other ROLES ---
                        const docSnap = await getDoc(docRef);

                        if (docSnap.exists()) {
                            let permissionsData = docSnap.data().allowedPermissions || [];

                            if (typeof permissionsData === 'string') {
                                try {
                                    permissionsData = JSON.parse(permissionsData);
                                    if (!Array.isArray(permissionsData)) {
                                        permissionsData = [];
                                    }
                                } catch (e) {
                                    console.warn(`Could not parse 'allowedPermissions' for role ${docSnap.id}.`, e);
                                    permissionsData = [];
                                }
                            }
                            permissionsMap[role] = permissionsData;

                        } else {
                            permissionsMap[role] = [];
                            await setDoc(docRef, { allowedPermissions: [] });
                        }
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
        // ✅ CHANGED: Add APP_ROLES to the dependency array
    }, [allPermissions, APP_ROLES]);

    const handlePermissionChange = (role: string, permission: Permissions, isChecked: boolean) => {
        // ✅ CHANGED: Use the enum for comparison
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
        // ✅ CHANGED: Use the enum for comparison
        if (role === ROLES.OWNER) {
            setError("Cannot modify owner permissions.");
            return;
        }

        try {
            setSuccessMessage(null);
            setError(null);
            const permissionsToSave = rolePermissions[role] || [];
            const docRef = doc(db, 'permissions', role);

            await setDoc(docRef, { allowedPermissions: permissionsToSave });

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
        <div className="p-6 bg-gray-50 min-h-screen">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Manage Role Permissions</h1>
            <button
                onClick={() => navigate(-1)}
                className="rounded-full bg-gray-200 p-2 text-gray-700 transition hover:bg-gray-300"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                </svg>
            </button>

            {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
            {successMessage && <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">{successMessage}</div>}

            <div className="space-y-8">
                {APP_ROLES.map((role) => (
                    <div key={role} className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-2xl font-semibold mb-4 capitalize text-gray-700">{role}</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {allPermissions.map((permission) => (
                                <label key={permission} className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:bg-gray-200 disabled:cursor-not-allowed"
                                        checked={rolePermissions[role]?.includes(permission as Permissions) || false}
                                        onChange={(e) => handlePermissionChange(role, permission as Permissions, e.target.checked)}

                                        // ✅ CHANGED: Use the enum for comparison
                                        disabled={role === ROLES.OWNER}
                                    />
                                    <span className="text-gray-700">{permission}</span>
                                </label>
                            ))}
                        </div>

                        {/* ✅ CHANGED: Use the enum for comparison */}
                        {role === ROLES.OWNER && (
                            <p className="text-sm text-gray-500 italic mt-4">
                                The 'owner' role always has all permissions. This cannot be changed.
                            </p>
                        )}

                        <div className="mt-6 text-right">
                            <button
                                onClick={() => handleSaveChanges(role)}
                                className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"

                                // ✅ CHANGED: Use the enum for comparison
                                disabled={role === ROLES.OWNER}
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