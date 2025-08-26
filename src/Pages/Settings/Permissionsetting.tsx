// src/Pages/Admin/ManagePermissionsPage.tsx

import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { Permissions } from '../../enums';
import Loading from '../../Pages/Loading/Loading';
import { useNavigate } from 'react-router';

type RolePermissionsMap = Record<string, Permissions[]>;

const ManagePermissionsPage: React.FC = () => {
    const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const navigate = useNavigate();

    const allPermissions = Object.values(Permissions);

    useEffect(() => {
        const fetchPermissions = async () => {
            try {
                const permissionsCollectionRef = collection(db, 'permissions');
                const querySnapshot = await getDocs(permissionsCollectionRef);

                const fetchedPermissions: RolePermissionsMap = {};
                querySnapshot.forEach((doc) => {
                    let permissionsData = doc.data().allowedPermissions || [];

                    // ✅ ADD THIS SAFETY CHECK
                    // If the data is a string, try to parse it as a JSON array.
                    if (typeof permissionsData === 'string') {
                        try {
                            permissionsData = JSON.parse(permissionsData);
                            if (!Array.isArray(permissionsData)) {
                                permissionsData = []; // Default to empty if not a valid array
                            }
                        } catch (e) {
                            console.warn(`Could not parse 'allowedPermissions' for role ${doc.id}.`, e);
                            permissionsData = []; // Default to empty on error
                        }
                    }

                    fetchedPermissions[doc.id] = permissionsData;
                });

                setRolePermissions(fetchedPermissions);
            } catch (err) {
                console.error("Error fetching permissions:", err);
                setError("Failed to load permissions.");
            } finally {
                setLoading(false);
            }
        };

        fetchPermissions();
    }, []);

    // ... (the rest of your component remains the same)
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
                {Object.keys(rolePermissions).map((role) => (
                    <div key={role} className="bg-white p-6 rounded-lg shadow-md">
                        <h2 className="text-2xl font-semibold mb-4 capitalize text-gray-700">{role}</h2>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                            {allPermissions.map((permission) => (
                                <label key={permission} className="flex items-center space-x-3">
                                    <input
                                        type="checkbox"
                                        className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        checked={rolePermissions[role]?.includes(permission as Permissions) || false}
                                        onChange={(e) => handlePermissionChange(role, permission as Permissions, e.target.checked)}
                                    />
                                    <span className="text-gray-700">{permission}</span>
                                </label>
                            ))}
                        </div>
                        <div className="mt-6 text-right">
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
