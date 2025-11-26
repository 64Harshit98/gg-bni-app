import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';
import { Spinner } from '../../constants/Spinner';
import { Permissions, ROLES, State, Variant } from '../../enums'; // Import ROLES
import { CustomButton } from '../../Components';
import { Modal } from '../../constants/Modal';


interface AppUser {
    uid: string;
    name?: string;
    email?: string;
    phoneNumber?: string;
    role?: string;
    companyId?: string;
}

// EditFormData now correctly includes 'name'
type EditFormData = {
    name?: string;
    phoneNumber?: string;
    role?: string;
};

const ManageUsersPage: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser, hasPermission, loading: authLoading } = useAuth();
    const [users, setUsers] = useState<AppUser[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState<EditFormData>({});

    const canManageUsers = hasPermission(Permissions.ManageUsers);

    // Convert ROLES enum object into an array for mapping in the dropdown
    const availableRoles = useMemo(() => Object.values(ROLES).filter(r => r !== ROLES.OWNER), []);

    useEffect(() => {
        if (authLoading) {
            setIsLoading(true);
            return;
        }

        if (!currentUser || !currentUser.companyId) {
            setError("User or company information is missing.");
            setIsLoading(false);
            return;
        }

        if (!canManageUsers) {
            setError("You do not have permission to manage users.");
            setIsLoading(false);
            return;
        }


        const fetchUsers = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // --- FIX: Use the correct multi-tenant path ---
                const usersCollectionRef = collection(db, 'companies', currentUser.companyId, 'users');

                // --- FIX: No 'where' clause for companyId is needed ---
                const q = query(usersCollectionRef);

                const querySnapshot = await getDocs(q);
                const fetchedUsers: AppUser[] = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    fetchedUsers.push({
                        uid: doc.id,
                        name: data.name || '',
                        email: data.email || '',
                        phoneNumber: data.phoneNumber || '',
                        role: data.role || '',
                        companyId: data.companyId || '',
                    } as AppUser);
                });
                setUsers(fetchedUsers);
            } catch (err) {
                console.error("Error fetching users:", err);
                setError("Failed to load user data. Please try again.");
                setModal({ message: "Failed to load users.", type: State.ERROR });
            } finally {
                setIsLoading(false);
            }
        };

        fetchUsers();
    }, [currentUser, currentUser?.companyId, canManageUsers, authLoading, navigate]);

    const handleAddUser = () => {
        navigate(ROUTES.USER_ADD);
    };

    const handleEditClick = (user: AppUser) => {
        setEditingUserId(user.uid);
        // --- FIX: Pre-fill the 'name' field as well ---
        setEditFormData({
            name: user.name || '',
            phoneNumber: user.phoneNumber || '',
            role: user.role || '',
        });
    };

    const handleCancelEdit = () => {
        setEditingUserId(null);
        setEditFormData({});
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setEditFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveEdit = async () => {
        // --- FIX: Add guard for companyId ---
        if (!editingUserId || !currentUser?.companyId) {
            setModal({ message: 'Error: Cannot save. User or Company ID is missing.', type: State.ERROR });
            return;
        }
        const companyId = currentUser.companyId;

        setIsSaving(true);
        setModal(null);
        try {
            // --- FIX: Use the correct multi-tenant path ---
            const userDocRef = doc(db, 'companies', companyId, 'users', editingUserId);

            const updateData: Partial<AppUser> = {
                name: editFormData.name?.trim() || '',
                phoneNumber: editFormData.phoneNumber?.trim() || '',
                role: editFormData.role?.trim() || '',
            };

            await updateDoc(userDocRef, updateData);

            setUsers(prevUsers => prevUsers.map(user =>
                user.uid === editingUserId ? { ...user, ...updateData } : user
            ));

            setModal({ message: 'User updated successfully!', type: State.SUCCESS });
            handleCancelEdit();

        } catch (err) {
            console.error("Error updating user:", err);
            setModal({ message: 'Failed to update user. Please try again.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };


    if (isLoading) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center">
                <Spinner />
                <p className="mt-4 text-gray-600">Loading users...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center text-red-600">
                <p>{error}</p>
                <CustomButton onClick={() => navigate(-1)} variant={Variant.Outline} className="mt-4">
                    Go Back
                </CustomButton>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 w-full mb-15">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <div className="flex items-center justify-between p-3 bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
                <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-900 p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </button>
                <h1 className="text-lg font-semibold text-gray-800">Manage Users</h1>
                <CustomButton onClick={handleAddUser} variant={Variant.Save} className='flex justify-right ml-15'>
                    Add User
                </CustomButton>
            </div>


            <main className="flex-grow p-2 overflow-y-auto">
                {users.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">No users found for this company.</div>
                ) : (
                    <div className="space-y-2">
                        {users.map((user) => (
                            <div key={user.uid} className="bg-white rounded-lg shadow border p-2">
                                {editingUserId === user.uid ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label htmlFor={`name-${user.uid}`} className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                                            <input
                                                type="text"
                                                id={`name-${user.uid}`}
                                                name="name"
                                                value={editFormData.name || ''}
                                                onChange={handleInputChange}
                                                className="w-full p-2 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor={`phoneNumber-${user.uid}`} className="block text-xs font-medium text-gray-500 mb-1">Phone Number</label>
                                            <input
                                                type="tel"
                                                id={`phoneNumber-${user.uid}`}
                                                name="phoneNumber"
                                                value={editFormData.phoneNumber || ''}
                                                onChange={handleInputChange}
                                                className="w-full p-2 border border-gray-300 rounded text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label htmlFor={`role-${user.uid}`} className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                                            {/* --- DROPDOWN FIELD --- */}
                                            {/* If the current user being edited is the OWNER, lock the role */}
                                            {user.role === ROLES.OWNER ? (
                                                <input
                                                    type="text"
                                                    value={user.role || 'OWNER'}
                                                    readOnly
                                                    className="w-full p-2 border border-gray-300 rounded text-sm bg-gray-200 cursor-not-allowed"
                                                />
                                            ) : (
                                                <select
                                                    id={`role-${user.uid}`}
                                                    name="role"
                                                    value={editFormData.role || ''}
                                                    onChange={handleInputChange}
                                                    className="w-full p-2 border border-gray-300 rounded text-sm bg-white"
                                                >
                                                    <option value="" disabled>Select Role</option>
                                                    {availableRoles.map(role => (
                                                        <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
                                                    ))}
                                                </select>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500">Email: {user.email || 'N/A'} (Not editable)</p>
                                        <div className="flex justify-end gap-2 mt-2">
                                            <CustomButton onClick={handleCancelEdit} variant={Variant.Transparent} >Cancel</CustomButton>
                                            <CustomButton onClick={handleSaveEdit} variant={Variant.Save} disabled={isSaving}>
                                                {isSaving ? <Spinner /> : 'Save'}
                                            </CustomButton>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex justify-between items-center p-2">
                                        <div>
                                            <p className="font-semibold text-gray-900">{user.name || 'No Name Provided'}</p>
                                            <p className="text-sm text-gray-600">{user.email || 'No Email'}</p>
                                            <p className="text-sm text-gray-600">Phone: {user.phoneNumber || 'Not Provided'}</p>
                                            <p className="text-xs text-gray-500 mt-1">Role: {user.role || 'Not Assigned'}</p>
                                        </div>
                                        <button onClick={() => handleEditClick(user)} className='flex p-2 justify-right bg-white text-black border border-gray-300 hover:bg-gray-100 border-2 rounded-sm '>
                                            Edit
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default ManageUsersPage;