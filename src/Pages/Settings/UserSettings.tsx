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
import { getFunctions, httpsCallable } from 'firebase/functions';
import BackButton from '../../Components/BackButton';


interface AppUser {
    uid: string;
    name?: string;
    email?: string;
    phoneNumber?: string;
    role?: string;
    companyId?: string;
    photoURL?: string;
    profilePicture?: string;
}

// EditFormData now correctly includes 'name'
type EditFormData = {
    name?: string;
    phoneNumber?: string;
    role?: string;
};
const getInitials = (name?: string): string => {
    if (!name) return '?';
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
};

const AVATAR_COLORS: { bg: string; text: string }[] = [
    { bg: 'bg-blue-100',   text: 'text-blue-700'   },
    { bg: 'bg-green-100',  text: 'text-green-700'  },
    { bg: 'bg-blue-100', text: 'text-blue-700' },
    { bg: 'bg-amber-100',  text: 'text-amber-700'  },
    { bg: 'bg-pink-100',   text: 'text-pink-700'   },
    { bg: 'bg-teal-100',   text: 'text-teal-700'   },
];

const avatarColor = (uid: string) =>
    AVATAR_COLORS[
        uid.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) %
        AVATAR_COLORS.length
    ];

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
                        photoURL: data.photoURL || '',
                        // ← Pick up the field saved by EditProfilePage
                        profilePicture: data.profilePicture || '',
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
    const handleDeleteUser = async (userToDelete: AppUser) => {
        // 1. Prevent deleting the currently logged-in owner
        if (userToDelete.uid === currentUser?.uid) {
            setModal({ message: "You cannot delete your own account from this screen.", type: State.ERROR });
            return;
        }

        // 2. Ask for confirmation
        const isConfirmed = window.confirm(`Are you absolutely sure you want to delete ${userToDelete.name}? This removes their login access permanently.`);
        if (!isConfirmed) return;

        if (!currentUser?.companyId) return;

        setIsSaving(true); // You can reuse isSaving, or create a specific isDeleting state
        setModal(null);

        try {
            // 3. Call your secure backend to delete the Auth record AND Firestore doc
            const functions = getFunctions();
            const deleteUserFunction = httpsCallable(functions, 'deleteUserAccount');

            await deleteUserFunction({
                targetUid: userToDelete.uid,
                companyId: currentUser.companyId
            });

            // 4. Update local state to remove the user from the UI immediately
            setUsers(prevUsers => prevUsers.filter(u => u.uid !== userToDelete.uid));

            setModal({ message: 'User deleted successfully.', type: State.SUCCESS });
        } catch (err) {
            console.error("Error deleting user:", err);
            setModal({ message: 'Failed to delete user. Ensure you have the right permissions.', type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
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
                <BackButton/>
                <h1 className="text-lg font-semibold text-gray-800 ml-2">Manage Users</h1>
                <CustomButton onClick={handleAddUser} variant={Variant.Save} className='flex justify-right ml-8'>
                    Add User
                </CustomButton>
            </div>


           <main className="flex-grow p-3 overflow-y-auto">
                {users.length === 0 ? (
                    <div className="text-center py-10 text-gray-500">No users found for this company.</div>
                ) : (
                    /* ── CHANGED: grid instead of space-y-2 list ── */
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {users.map((user) => {
                            const { bg, text } = avatarColor(user.uid);   // ← NEW
const avatarSrc = user.profilePicture || user.photoURL || '';
                            return (
                                <div key={user.uid} className="bg-white rounded-sm shadow border p-3 flex flex-col items-center">

                                    {editingUserId === user.uid ? (
                                        /* ── Edit form: logic unchanged, styling matches original ── */
                                        <div className="space-y-3 w-full">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                                                <input type="text" name="name" value={editFormData.name || ''} onChange={handleInputChange}
                                                    className="w-full p-2 border border-gray-300 rounded text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Phone Number</label>
                                                <input type="tel" name="phoneNumber" value={editFormData.phoneNumber || ''} onChange={handleInputChange}
                                                    className="w-full p-2 border border-gray-300 rounded text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Role</label>
                                                {user.role === ROLES.OWNER ? (
                                                    <input type="text" value={user.role || 'OWNER'} readOnly
                                                        className="w-full p-2 border border-gray-300 rounded text-sm bg-gray-200 cursor-not-allowed" />
                                                ) : (
                                                    <select name="role" value={editFormData.role || ''} onChange={handleInputChange}
                                                        className="w-full p-2 border border-gray-300 rounded text-sm bg-white">
                                                        <option value="" disabled>Select Role</option>
                                                        {availableRoles.map(role => (
                                                            <option key={role} value={role}>
                                                                {role.charAt(0).toUpperCase() + role.slice(1)}
                                                            </option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500">Email: {user.email || 'N/A'} (Not editable)</p>
                                            <div className="flex justify-end gap-2 mt-2">
                                                <CustomButton onClick={handleCancelEdit} variant={Variant.Transparent}>Cancel</CustomButton>
                                                <CustomButton onClick={handleSaveEdit} variant={Variant.Save} disabled={isSaving}>
                                                    {isSaving ? <Spinner /> : 'Save'}
                                                </CustomButton>
                                            </div>
                                        </div>
                                     ) : (
                                        <>
                                            {/* Avatar — uses profilePicture first, then photoURL, then initials */}
                                            {avatarSrc ? (
                                                <img
                                                    src={avatarSrc}
                                                    alt={user.name}
                                                    className="w-12 h-12 rounded-full object-cover mb-1.5 border border-gray-200"
                                                />
                                            ) : (
                                                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-1.5 text-base font-semibold ${bg} ${text}`}>
                                                    {getInitials(user.name)}
                                                </div>
                                            )}
 
                                            {/* Name */}
                                            <p className="font-semibold text-gray-900 text-xs text-center leading-tight truncate w-full">
                                                {user.name || 'No Name'}
                                            </p>
 
                                            {/* Role badge */}
                                            <span className={`mt-1 text-[10px] px-1.5 py-0.5 rounded-sm font-medium
                                                ${user.role === ROLES.OWNER
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-gray-100 text-gray-600'}`}>
                                                {user.role || 'No role'}
                                            </span>
 
                                            {/* Contact */}
                                            <div className="mt-1.5 w-full border-t border-gray-100 pt-1.5 space-y-0.5">
                                                <p className="text-[10px] text-gray-500 truncate text-center">{user.email || '—'}</p>
                                                <p className="text-[10px] text-gray-400 text-center">{user.phoneNumber || 'No phone'}</p>
                                            </div>
 
                                            {/* Actions */}
                                            <div className="flex gap-1.5 mt-2 w-full">
                                                <button
                                                    onClick={() => handleEditClick(user)}
                                                    className="flex-1 py-1 text-[10px] bg-white text-black border-2 border-gray-300 hover:bg-gray-100 rounded-sm">
                                                    Edit
                                                </button>
                                                {user.role !== ROLES.OWNER && (
                                                    <button
                                                        onClick={() => handleDeleteUser(user)}
                                                        disabled={isSaving}
                                                        className="flex-1 py-1 text-[10px] bg-white text-blue-600 border-2 border-blue-300 hover:bg-blue-50 hover:text-blue-700 rounded-sm">
                                                        Delete
                                                    </button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
};
 
export default ManageUsersPage;