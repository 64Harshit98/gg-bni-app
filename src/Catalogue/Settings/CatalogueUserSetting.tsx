import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { useAuth } from '../../context/auth-context';
import { Spinner } from '../../constants/Spinner';
import { Permissions, ROLES, State, Variant } from '../../enums'; // Import ROLES
import { CustomButton } from '../../Components';
import { Modal } from '../../constants/Modal';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AddUserModal } from '../../Components/AddUserModal';
import { ROUTES } from '../../constants/routes.constants';


const ROLE_PERMISSIONS_ROUTE = `${ROUTES.CHOME}/${ROUTES.CATA_PERMISSION_SETTING}`;

interface AppUser {
    uid: string;
    name?: string;
    email?: string;
    phoneNumber?: string;
    role?: string;
    companyId?: string;
    photoURL?: string;
    profilePicture?: string;
    lastLoginAt?: Date | null; // UI only: "Last active" column + "Never logged in" tile
}

// EditFormData now correctly includes 'name'
type EditFormData = {
    name?: string;
    phoneNumber?: string;
    role?: string;
};

type RoleFilter = 'all' | 'owner' | 'manager' | 'salesman' | 'review';

const getInitials = (name?: string): string => {
    if (!name) return '?';
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
};

// Avatar tints (orange primary-soft, success-soft, magenta-soft, warning-soft)
const AVATAR_COLORS: { bg: string; text: string }[] = [
    { bg: 'bg-[#ffedd9]', text: 'text-[#ea580c]' },
    { bg: 'bg-[#e9faef]', text: 'text-[#008236]' },
    { bg: 'bg-[#ffe8f8]', text: 'text-[#c4009a]' },
    { bg: 'bg-[#fff3dd]', text: 'text-[#bb4d00]' },
];

const avatarColor = (uid: string) =>
    AVATAR_COLORS[
    uid.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) %
    AVATAR_COLORS.length
    ];

// ---------- display-only helpers ----------
const toDate = (v: any): Date | null => {
    if (!v) return null;
    if (typeof v.toDate === 'function') return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const roleKind = (role?: string): 'owner' | 'manager' | 'salesman' | 'other' => {
    if (role === ROLES.OWNER) return 'owner';
    const r = (role || '').toLowerCase();
    if (r.includes('manager')) return 'manager';
    if (r.includes('sales')) return 'salesman';
    return 'other';
};

const roleBadgeTone = (role?: string): string => {
    const k = roleKind(role);
    if (k === 'owner') return 'bg-[#0f172b] text-white';
    if (k === 'manager') return 'bg-[#ffedd9] text-[#ea580c]';
    return 'bg-[#fff7f0] text-[#45556c]';
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

// Edit-user modal: display-only role info
const ROLE_DESC: Record<string, string> = {
    manager: 'Orders, items & reports',
    salesman: 'Orders & returns',
};
// Catalogue default access (same list as AddUserModal, orange theme)
type Kind = 'manager' | 'salesman';
const BOTH: Kind[] = ['salesman', 'manager'];
const MANAGER_ONLY: Kind[] = ['manager'];
const NONE: Kind[] = [];
const OWNER_FULL_ACCESS = 'Full access to all catalogue features';
const ACCESS_ITEMS: { label: string; roles: Kind[] }[] = [
    { label: 'Dashboard & filters', roles: BOTH },
    { label: 'Orders', roles: BOTH },
    { label: 'Orders return', roles: BOTH },
    { label: 'Requests', roles: MANAGER_ONLY },
    { label: 'View & edit catalog', roles: MANAGER_ONLY },
    { label: 'Manage items', roles: MANAGER_ONLY },
    { label: 'Reports', roles: MANAGER_ONLY },
    { label: 'Settings & users', roles: NONE },
];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

// ---------- tiny inline icons (design stroke style) ----------
const Icon: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = 'w-4 h-4' }) => (
    <svg
        className={`flex-none ${className}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
    >
        {children}
    </svg>
);
const IconBack = ({ className }: { className?: string }) => <Icon className={className ?? 'w-5 h-5'}><path d="M15 18l-6-6 6-6" /></Icon>;
const IconSearch = ({ className }: { className?: string }) => <Icon className={className}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
const IconUsers = ({ className }: { className?: string }) => <Icon className={className}><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3" /></Icon>;
const IconAddUser = ({ className }: { className?: string }) => <Icon className={className}><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6" /></Icon>;
const IconShield = ({ className }: { className?: string }) => <Icon className={className}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></Icon>;
const IconCart = ({ className }: { className?: string }) => <Icon className={className}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h9.6a1 1 0 0 0 1-.8L21 7H6" /></Icon>;
const IconClock = ({ className }: { className?: string }) => <Icon className={className}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
const IconPencil = ({ className }: { className?: string }) => <Icon className={className}><path d="M17 3l4 4L8 20H4v-4z" /></Icon>;
const IconMore = ({ className }: { className?: string }) => <Icon className={className}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></Icon>;
const IconTrash = ({ className }: { className?: string }) => <Icon className={className}><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v5M14 11v5" /></Icon>;
const IconUser = ({ className }: { className?: string }) => <Icon className={className}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>;
const IconLock = ({ className }: { className?: string }) => <Icon className={className}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Icon>;
const IconKey = ({ className }: { className?: string }) => <Icon className={className}><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3M14 9l2 2" /></Icon>;
const IconClose = ({ className }: { className?: string }) => <Icon className={className}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const IconCheck = ({ className }: { className?: string }) => <Icon className={className}><path d="M5 12.5l4.5 4.5L19 7" /></Icon>;

// ---------- shared class strings (orange theme) ----------
const CARD = 'bg-white border border-[#f3e1d2] rounded-sm shadow-[0_1px_2px_rgba(140,70,21,0.05),0_2px_6px_rgba(140,70,21,0.06)]';
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-sm bg-[#ea580c] text-white text-sm font-medium whitespace-nowrap hover:bg-[#c2410c] disabled:opacity-45 disabled:cursor-not-allowed';
const BTN_SECONDARY_SM = 'inline-flex items-center justify-center gap-2 h-8 px-3 rounded-sm border border-[#7a8aa3] bg-white text-[#0f172b] text-[13px] font-medium whitespace-nowrap hover:bg-[#fff7f0] disabled:opacity-45 disabled:cursor-not-allowed';
const BTN_GHOST_ICON_SM = 'inline-flex items-center justify-center w-8 h-8 rounded-sm text-[#45556c] hover:bg-[#fff7f0] hover:text-[#0f172b]';
const FIELD_WRAP = 'flex items-center gap-2 h-9 px-3 border border-[#7a8aa3] rounded-sm bg-white text-[#5b6b86] focus-within:ring-2 focus-within:ring-[#ea580c]';

const CatalogueUserSetting: React.FC = () => {
    const navigate = useNavigate();
    const { currentUser, hasPermission, loading: authLoading } = useAuth();
    const [users, setUsers] = useState<AppUser[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);

    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState<EditFormData>({});
    const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

    // UI-only state (filters / search / ⋯ menu)
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showMobileSearch, setShowMobileSearch] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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

        fetchUsers();
    }, [currentUser, currentUser?.companyId, canManageUsers, authLoading, navigate]);

    const fetchUsers = async () => {
        if (!currentUser?.companyId) return;
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
                    // UI only — change the field name here if your users doc stores it differently
                    lastLoginAt: toDate(data.lastLoginAt ?? data.lastActive),
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

    const handleAddUser = () => {
        setIsAddUserModalOpen(true);
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

    // ---------- derived display data (no data changes) ----------
    const flags = useMemo(() => {
        const map = new Map<string, string>();
        const firstNameCount: Record<string, number> = {};
        users.forEach(u => {
            const f = (u.name || '').trim().split(' ')[0].toLowerCase();
            if (f) firstNameCount[f] = (firstNameCount[f] || 0) + 1;
        });
        users.forEach(u => {
            const f = (u.name || '').trim().split(' ')[0].toLowerCase();
            if (!EMAIL_RE.test(u.email || '')) map.set(u.uid, 'Email looks invalid — can’t log in / reset');
            else if ((u.name || '').includes('@')) map.set(u.uid, 'Name is an email address');
            else if (f && firstNameCount[f] > 1) map.set(u.uid, 'Same first name as another user');
        });
        return map;
    }, [users]);

    const counts = useMemo(() => ({
        all: users.length,
        owner: users.filter(u => roleKind(u.role) === 'owner').length,
        manager: users.filter(u => roleKind(u.role) === 'manager').length,
        salesman: users.filter(u => roleKind(u.role) === 'salesman').length,
        neverLoggedIn: users.filter(u => !u.lastLoginAt && u.uid !== currentUser?.uid).length,
        flagged: flags.size,
    }), [users, flags, currentUser?.uid]);

    const filteredUsers = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return users.filter(u => {
            if (roleFilter === 'review') {
                if (!flags.has(u.uid)) return false;
            } else if (roleFilter !== 'all' && roleKind(u.role) !== roleFilter) {
                return false;
            }
            if (!term) return true;
            return (
                (u.name || '').toLowerCase().includes(term) ||
                (u.email || '').toLowerCase().includes(term) ||
                (u.phoneNumber || '').toLowerCase().includes(term)
            );
        });
    }, [users, roleFilter, searchTerm, flags]);

    // ---------- render helpers ----------
    const renderAvatar = (user: AppUser) => {
        const { bg, text } = avatarColor(user.uid);
        const avatarSrc = user.profilePicture || user.photoURL || '';
        return avatarSrc ? (
            <img src={avatarSrc} alt={user.name} className="w-9 h-9 rounded-full object-cover border border-[#f3e1d2] flex-none" />
        ) : (
            <span className={`w-9 h-9 rounded-full flex-none flex items-center justify-center text-[13px] font-semibold ${bg} ${text}`}>
                {getInitials(user.name)}
            </span>
        );
    };

    const renderBadge = (user: AppUser, small = false) => (
        <span className={`flex-none inline-flex items-center rounded-sm font-semibold uppercase whitespace-nowrap ${small ? 'h-[18px] px-2 text-[9px] tracking-wide' : 'h-[22px] px-2 text-[11px] tracking-[.03em]'} ${roleBadgeTone(user.role)}`}>
            {user.role || 'No role'}
        </span>
    );

    const renderMenu = (user: AppUser, includeEdit: boolean) => {
        const canDelete = user.role !== ROLES.OWNER;
        if (!includeEdit && !canDelete) return null;
        const isOpen = openMenuId === user.uid;
        return (
            <div className="relative">
                <button
                    aria-label="More"
                    onClick={() => setOpenMenuId(isOpen ? null : user.uid)}
                    className={BTN_GHOST_ICON_SM}>
                    <IconMore />
                </button>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />
                        <div className="absolute right-0 top-9 w-[200px] z-30 bg-white border border-[#f3e1d2] rounded-sm p-1.5 grid shadow-[0_10px_28px_rgba(140,70,21,0.14),0_2px_6px_rgba(140,70,21,0.08)]">
                            {includeEdit && (
                                <button
                                    onClick={() => { setOpenMenuId(null); handleEditClick(user); }}
                                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-sm text-[13px] text-[#0f172b] hover:bg-[#fff7f0] text-left">
                                    <IconPencil />Edit
                                </button>
                            )}
                            {canDelete && (
                                <button
                                    onClick={() => { setOpenMenuId(null); handleDeleteUser(user); }}
                                    disabled={isSaving}
                                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-sm text-[13px] text-[#d5000c] hover:bg-[#ffeef0] text-left disabled:opacity-45 disabled:cursor-not-allowed">
                                    <IconTrash />Delete
                                </button>
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    };

    // Edit user pop-up: centered modal on desktop, bottom sheet on mobile
    const renderEditModal = () => {
        const user = users.find(u => u.uid === editingUserId);
        if (!user) return null;

        const isOwnerUser = user.role === ROLES.OWNER;
        const isSelf = user.uid === currentUser?.uid;
        const last = formatLastActive(user.lastLoginAt, isSelf);
        const selKind = roleKind(editFormData.role);
        const selLabel = editFormData.role ? cap(editFormData.role) : 'this role';
        const warn = flags.get(user.uid);
        const { bg, text } = avatarColor(user.uid);
        const avatarSrc = user.profilePicture || user.photoURL || '';

        const labelCls = 'flex items-center gap-1 text-[13px] font-medium text-[#0f172b] mb-1.5';
        const fieldWrap = 'flex items-center gap-2 h-10 px-3 border border-[#7a8aa3] rounded-sm bg-white text-[#5b6b86] focus-within:ring-2 focus-within:ring-[#ea580c]';
        const inputBare = 'flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-[#0f172b]';

        return (
            <div className="fixed inset-0 z-40 flex items-end lg:items-start justify-center lg:pt-[72px]">
                <div className="absolute inset-0 bg-[#0f172b]/50" onClick={handleCancelEdit} />
                <div
                    role="dialog"
                    aria-label={`Edit user ${user.name || ''}`}
                    className="relative w-full lg:w-[900px] lg:max-w-[calc(100vw-32px)] max-h-[92vh] lg:max-h-[calc(100vh-96px)] flex flex-col bg-white rounded-sm lg:rounded-sm shadow-[0_10px_28px_rgba(140,70,21,0.14),0_2px_6px_rgba(140,70,21,0.08)]">

                    {/* grab handle (mobile sheet) */}
                    <div className="lg:hidden mx-auto mt-2 h-1 w-10 rounded-sm bg-[#f3e1d2]" />

                    {/* Header */}
                    <div className="flex items-center gap-3 px-4 lg:px-6 pt-3 lg:pt-5 pb-4 border-b border-[#f3e1d2]">
                        {avatarSrc ? (
                            <img src={avatarSrc} alt={user.name} className="w-11 h-11 rounded-full object-cover border border-[#f3e1d2] flex-none" />
                        ) : (
                            <span className={`w-11 h-11 rounded-full flex-none flex items-center justify-center text-[15px] font-semibold ${bg} ${text}`}>
                                {getInitials(user.name)}
                            </span>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className="text-xs leading-[18px] text-[#5b6b86]">Edit user</div>
                            <h2 className="text-lg leading-6 font-semibold truncate">{user.name || 'No Name'}</h2>
                            <div className="flex items-center gap-1.5 mt-1 min-w-0">
                                {renderBadge(user, true)}
                                <span className="text-xs text-[#5b6b86] truncate">
                                    Last active: {last ? last.toLowerCase() : 'never logged in'}
                                </span>
                            </div>
                        </div>
                        <button aria-label="Close" onClick={handleCancelEdit} className={BTN_GHOST_ICON_SM}>
                            <IconClose className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-4 lg:py-5 grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 content-start">
                        {/* LEFT: details */}
                        <div className="grid gap-4 content-start min-w-0">
                            <label className="block">
                                <span className={labelCls}>Full name <em className="not-italic text-[#d5000c]">*</em></span>
                                <div className={fieldWrap}>
                                    <IconUser />
                                    <input type="text" name="name" value={editFormData.name || ''} onChange={handleInputChange} className={inputBare} />
                                </div>
                                {warn && <small className="block mt-1 text-xs text-[#bb4d00]">{warn}</small>}
                            </label>

                            <label className="block">
                                <span className={labelCls}>Phone number <em className="not-italic text-[#d5000c]">*</em></span>
                                <div className={fieldWrap}>
                                    <span className="text-xs text-[#5b6b86]">+91</span>
                                    <input type="tel" name="phoneNumber" value={editFormData.phoneNumber || ''} onChange={handleInputChange} maxLength={10} className={inputBare} />
                                </div>
                            </label>

                            <div>
                                <span className={labelCls}>Login email</span>
                                <div className="flex items-center gap-2 h-10 px-3 rounded-sm bg-[#fff1e6] text-sm text-[#0f172b] min-w-0">
                                    <IconLock className="w-4 h-4 text-[#5b6b86]" />
                                    <span className="truncate">{user.email || 'N/A'}</span>
                                    <span className="ml-auto flex-none text-xs text-[#5b6b86]">can’t be changed</span>
                                </div>
                                <small className="hidden lg:block mt-1 text-xs text-[#5b6b86]">To use a different email, add a new user and remove this one.</small>
                            </div>

                            <div>
                                <span className={labelCls}>Role</span>
                                {isOwnerUser ? (
                                    <div className="h-10 px-3 flex items-center rounded-sm bg-[#fff1e6] text-sm text-[#5b6b86] cursor-not-allowed">
                                        {user.role || 'OWNER'}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        {availableRoles.map(role => {
                                            const kind = roleKind(role);
                                            const selected = editFormData.role === role;
                                            const n = kind === 'manager' ? counts.manager : kind === 'salesman' ? counts.salesman : 0;
                                            return (
                                                <button
                                                    key={role}
                                                    type="button"
                                                    aria-pressed={selected}
                                                    onClick={() => setEditFormData(prev => ({ ...prev, role }))}
                                                    className={`text-left p-2.5 rounded-sm border grid gap-0.5 ${selected ? 'border-[#ea580c] bg-[#ffedd9]' : 'border-[#7a8aa3] bg-white hover:bg-[#fff7f0]'}`}>
                                                    <b className={`text-[13px] ${selected ? 'text-[#ea580c]' : 'text-[#0f172b]'}`}>{cap(role)}</b>
                                                    <small className="text-[11px] leading-4 text-[#45556c]">
                                                        {ROLE_DESC[kind] || 'Custom role'}{n ? ` · ${n} ${n === 1 ? 'user' : 'users'}` : ''}
                                                    </small>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* RIGHT: permissions + account */}
                        <div className="grid gap-4 content-start min-w-0">
                            {/* What the role can do — desktop only (matches design) */}
                            <div className="hidden lg:block">
                                <span className={labelCls}>What a {selLabel} can do</span>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 p-3 rounded-sm bg-[#ffedd9]/60 text-xs">
                                    {isOwnerUser ? (
                                        <span className="col-span-2 flex items-center gap-1.5 text-slate-700">
                                            <IconCheck className="w-3.5 h-3.5 text-green-600" />
                                            {OWNER_FULL_ACCESS}
                                        </span>
                                    ) : (
                                        ACCESS_ITEMS.map(({ label, roles }) => {
                                            const ok = (selKind === 'manager' || selKind === 'salesman') && roles.includes(selKind);
                                            return (
                                                <span key={label} className={`flex items-center gap-1.5 min-w-0 ${ok ? 'text-slate-700' : 'text-slate-400'}`}>
                                                    {ok ? <IconCheck className="w-3.5 h-3.5 text-green-600" /> : <IconClose className="w-3.5 h-3.5 text-red-500" />}
                                                    <span className="truncate">{label}</span>
                                                </span>
                                            );
                                        })
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => navigate(ROLE_PERMISSIONS_ROUTE)}
                                    className="mt-1.5 text-xs font-medium text-[#ea580c]">
                                    Change role permissions →
                                </button>
                            </div>

                            <div>
                                <span className={labelCls}>Account</span>
                                <div className="border border-[#f3e1d2] rounded-sm divide-y divide-[#f3e1d2]">
                                    {/* UI only — no backend wired yet */}
                                    <div className="flex items-center gap-3 p-3 opacity-60" title="Coming soon">
                                        <IconKey className="w-[18px] h-[18px] text-[#45556c]" />
                                        <div className="flex-1 min-w-0">
                                            <b className="block text-[13px]">Reset password</b>
                                            <small className="block text-xs text-[#5b6b86]">Send a new password on WhatsApp</small>
                                        </div>
                                        <button type="button" disabled className={BTN_SECONDARY_SM}>Send</button>
                                    </div>
                                    {/* UI only — no backend wired yet */}
                                    <div className="flex items-center gap-3 p-3 opacity-60" title="Coming soon">
                                        <IconLock className="w-[18px] h-[18px] text-[#45556c]" />
                                        <div className="flex-1 min-w-0">
                                            <b className="block text-[13px]">Can log in</b>
                                            <small className="block text-xs text-[#5b6b86]">Turn off to block access but keep their bills</small>
                                        </div>
                                        <button type="button" role="switch" aria-checked="true" disabled
                                            className="relative flex-none w-10 h-6 rounded-full bg-[#ea580c] cursor-not-allowed">
                                            <span className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-white" />
                                        </button>
                                    </div>
                                    {/* Remove user → existing handleDeleteUser */}
                                    {!isOwnerUser && (
                                        <div className="flex items-center gap-3 p-3">
                                            <IconTrash className="w-[18px] h-[18px] text-[#d5000c]" />
                                            <div className="flex-1 min-w-0">
                                                <b className="block text-[13px] text-[#d5000c]">Remove user</b>
                                                <small className="block text-xs text-[#5b6b86]">Their past bills stay in reports</small>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteUser(user)}
                                                disabled={isSaving}
                                                className="h-8 px-3 rounded-sm text-[13px] font-medium text-[#d5000c] hover:bg-[#ffeef0] disabled:opacity-45 disabled:cursor-not-allowed">
                                                Remove
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-2 px-4 lg:px-6 py-3 lg:py-3.5 border-t border-[#f3e1d2] bg-[#fff7f0] rounded-sm">
                        <button
                            onClick={handleCancelEdit}
                            className="hidden lg:inline-flex items-center h-10 px-4 rounded-sm text-sm font-medium text-[#45556c] hover:bg-white">
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveEdit}
                            disabled={isSaving}
                            className={`w-full lg:w-auto ${BTN_PRIMARY}`}>
                            {isSaving ? <Spinner /> : <><IconCheck />Save changes</>}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const searchField = (extra = '') => (
        <label className={`${FIELD_WRAP} ${extra}`}>
            <IconSearch />
            <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name, email or phone"
                className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm text-[#0f172b] placeholder:text-[#5b6b86]"
            />
        </label>
    );

    const reviewNote = counts.flagged > 0 && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-sm bg-[#fff3dd] text-[#bb4d00] text-[13px] leading-[19px]">
            <IconUsers />
            {/* desktop copy */}
            <span className="hidden lg:block flex-1 min-w-0">
                <b>{counts.flagged} {counts.flagged === 1 ? 'account looks' : 'accounts look'} like test data</b> — invalid email, an email used as the name, or two users sharing a first name.
            </span>
            {/* mobile copy */}
            <span className="lg:hidden flex-1 min-w-0">
                <b>{counts.flagged} look like test accounts</b> ·{' '}
                <button className="underline" onClick={() => setRoleFilter(roleFilter === 'review' ? 'all' : 'review')}>
                    {roleFilter === 'review' ? 'Show all' : 'Review'}
                </button>
            </span>
            <button
                onClick={() => setRoleFilter(roleFilter === 'review' ? 'all' : 'review')}
                className={`hidden lg:inline-flex flex-none ${BTN_SECONDARY_SM}`}>
                {roleFilter === 'review' ? 'Show all' : `Review ${counts.flagged}`}
            </button>
        </div>
    );

    const emptyState = (
        <div className="text-center py-10 text-sm text-[#5b6b86]">
            {users.length === 0 ? 'No users found for this company.' : 'No users match this filter.'}
        </div>
    );

    if (isLoading) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center bg-[#fff7f0]">
                <Spinner />
                <p className="mt-4 text-sm text-[#45556c]">Loading users...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col min-h-screen items-center justify-center bg-[#fff7f0] text-[#d5000c]">
                <p className="text-sm">{error}</p>
                <CustomButton onClick={() => navigate(-1)} variant={Variant.Outline} className="mt-4">
                    Go Back
                </CustomButton>
            </div>
        );
    }

    const chips: { key: RoleFilter; label: string; count: number }[] = [
        { key: 'all', label: 'All', count: counts.all },
        { key: 'manager', label: 'Managers', count: counts.manager },
        { key: 'salesman', label: 'Salesmen', count: counts.salesman },
    ];
    const segs: { key: RoleFilter; label: string; count: number }[] = [
        { key: 'all', label: 'All', count: counts.all },
        { key: 'owner', label: 'Owner', count: counts.owner },
        { key: 'manager', label: 'Managers', count: counts.manager },
        { key: 'salesman', label: 'Salesmen', count: counts.salesman },
    ];

    const kpis = [
        { label: 'Users', value: counts.all, sub: 'who can log in', icon: <IconUsers className="w-[18px] h-[18px]" />, tint: 'bg-[#ffe8f8] text-[#c4009a]' },
        { label: 'Managers', value: counts.manager, sub: `+ ${counts.owner} owner${counts.owner === 1 ? '' : 's'}`, icon: <IconShield className="w-[18px] h-[18px]" />, tint: 'bg-[#ffedd9] text-[#ea580c]' },
        { label: 'Salesmen', value: counts.salesman, sub: 'billing only', icon: <IconCart className="w-[18px] h-[18px]" />, tint: 'bg-[#ffedd9] text-[#ea580c]' },
        { label: 'Never logged in', value: counts.neverLoggedIn, sub: 'since added', icon: <IconClock className="w-[18px] h-[18px]" />, tint: 'bg-[#fff3dd] text-[#bb4d00]' },
    ];

    return (
        <div className="flex flex-col min-h-screen bg-[#fff7f0] w-full max-w-full mb-15 text-[#0f172b] overflow-x-clip">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}
            <AddUserModal
                isOpen={isAddUserModalOpen}
                onClose={() => setIsAddUserModalOpen(false)}
                onUserAdded={fetchUsers}
                theme="orange"
            />
            {renderEditModal()}

            {/* ================= MOBILE HEADER ================= */}
            <header className="lg:hidden flex items-center gap-2 h-14 px-2 bg-white border-b border-[#f3e1d2] sticky top-0 z-10">
                <button aria-label="Back" onClick={() => navigate(-1)}
                    className="inline-grid place-items-center w-10 h-10 rounded-sm text-[#45556c] hover:bg-[#fff7f0]">
                    <IconBack />
                </button>
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-semibold leading-6 truncate">Manage users</h1>
                    <p className="text-xs leading-4 text-[#5b6b86]">{counts.all} {counts.all === 1 ? 'user' : 'users'}</p>
                </div>
                <button aria-label="Search" onClick={() => setShowMobileSearch(s => !s)}
                    className="inline-grid place-items-center w-10 h-10 rounded-sm text-[#45556c] hover:bg-[#fff7f0]">
                    <IconSearch className="w-5 h-5" />
                </button>
                {/* Add user — right-most end of the header, after the search icon */}
                <button aria-label="Add user" onClick={handleAddUser}
                    className={`${BTN_PRIMARY} h-9 px-3 text-[13px] gap-1.5 mr-1`}>
                    <IconAddUser />Add user
                </button>
            </header>

            {/* ================= DESKTOP HEADER ================= */}
            <header className="hidden lg:flex items-center gap-3 px-6 py-3.5 bg-white border-b border-[#f3e1d2] sticky top-0 z-10">
                <button aria-label="Back" onClick={() => navigate(-1)}
                    className="inline-grid place-items-center w-10 h-10 rounded-sm border border-[#7a8aa3] bg-white text-[#45556c] hover:bg-[#fff7f0]">
                    <IconBack />
                </button>
                <div>
                    <div className="text-xs leading-[18px] text-[#5b6b86]">Settings /</div>
                    <h1 className="text-[22px] leading-[30px] font-semibold">Manage users</h1>
                </div>
                <span className="hidden xl:block text-xs leading-[18px] text-[#5b6b86] self-end pb-1">People who can log in to your store</span>
                <button onClick={handleAddUser} className={`ml-auto ${BTN_PRIMARY}`}>
                    <IconAddUser />Add user
                </button>
            </header>

            {/* ================= MOBILE BODY ================= */}
            <main className="lg:hidden flex-grow w-full max-w-3xl mx-auto min-w-0 p-4 grid grid-cols-[minmax(0,1fr)] gap-2.5 content-start">
                {showMobileSearch && searchField('w-full')}
                <div className="flex gap-2 overflow-x-auto flex-nowrap">
                    {chips.map(c => (
                        <button
                            key={c.key}
                            aria-pressed={roleFilter === c.key}
                            onClick={() => setRoleFilter(c.key)}
                            className={`inline-flex items-center gap-1.5 h-[34px] px-3.5 rounded-sm border text-[13px] font-medium whitespace-nowrap ${roleFilter === c.key ? 'bg-[#0f172b] border-[#0f172b] text-white' : 'bg-white border-[#7a8aa3] text-[#45556c]'}`}>
                            {c.label} {c.count}
                        </button>
                    ))}
                </div>
                {reviewNote}
                <div className={`${CARD} overflow-visible min-w-0`}>
                    {filteredUsers.length === 0 ? emptyState : (
                        <div className="divide-y divide-[#f3e1d2]">
                            {filteredUsers.map(user => (
                                <div key={user.uid} className="first:rounded-sm last:rounded-sm">
                                    <div className="flex items-center gap-3 px-3.5 py-2.5">
                                        {renderAvatar(user)}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-medium truncate">{user.name || 'No Name'}</p>
                                                {renderBadge(user, true)}
                                            </div>
                                            <p className="text-xs leading-[18px] text-[#5b6b86] truncate">
                                                {user.email || '—'} · {user.phoneNumber || 'No phone'}
                                            </p>
                                            {flags.has(user.uid) && (
                                                <span className="block text-[11px] font-medium text-[#bb4d00]">{flags.get(user.uid)}</span>
                                            )}
                                        </div>
                                        {renderMenu(user, true)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* ================= DESKTOP BODY ================= */}
            <div className="hidden lg:grid flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] min-h-0 min-w-0">
                <div className="p-5 flex flex-col gap-4 min-w-0">
                    {/* KPI tiles */}
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3.5">
                        {kpis.map(k => (
                            <div key={k.label} className={`${CARD} p-4 flex flex-col gap-1 min-w-0`}>
                                <div className="flex items-center gap-3 mb-1 text-[13px] font-medium text-[#45556c] min-w-0">
                                    <span className={`w-8 h-8 flex-none inline-grid place-items-center rounded-sm ${k.tint}`}>{k.icon}</span>
                                    <span className="truncate">{k.label}</span>
                                </div>
                                <div className="text-[28px] leading-9 font-semibold tracking-[-.02em] tabular-nums">{k.value}</div>
                                <div className="text-xs leading-[18px] text-[#5b6b86]">{k.sub}</div>
                            </div>
                        ))}
                    </div>

                    {reviewNote}

                    {/* Users table card */}
                    <div className={`${CARD} overflow-visible`}>
                        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-[#f3e1d2] rounded-sm">
                            <div className="inline-flex flex-none p-[3px] gap-0.5 bg-[#fff7f0] border border-[#f3e1d2] rounded-sm" role="group">
                                {segs.map(s => (
                                    <button
                                        key={s.key}
                                        aria-pressed={roleFilter === s.key}
                                        onClick={() => setRoleFilter(s.key)}
                                        className={`h-7 px-3 rounded-sm text-xs font-medium ${roleFilter === s.key ? 'bg-white text-[#ea580c] shadow-[0_1px_2px_rgba(140,70,21,0.05),0_2px_6px_rgba(140,70,21,0.06)]' : 'text-[#45556c]'}`}>
                                        {s.label} {s.count}
                                    </button>
                                ))}
                            </div>
                            {searchField('ml-auto w-60 max-w-full')}
                        </div>

                        {filteredUsers.length === 0 ? emptyState : (
                            <table className="w-full table-fixed border-collapse [&>tbody>tr:last-child>td]:border-b-0 [&>tbody>tr:last-child>td:first-child]:rounded-bl-sm [&>tbody>tr:last-child>td:last-child]:rounded-br-sm">
                                <colgroup>
                                    <col />
                                    <col className="w-[116px]" />
                                    <col className="w-[27%]" />
                                    <col className="w-[124px]" />
                                    <col className="w-[150px]" />
                                </colgroup>
                                <thead>
                                    <tr>
                                        {['User', 'Role', 'Login & phone', 'Last active', ''].map(h => (
                                            <th key={h} className="text-left text-[11px] font-semibold tracking-[.06em] uppercase text-[#5b6b86] px-3.5 py-2.5 bg-[#fff7f0] border-b border-[#f3e1d2] whitespace-nowrap overflow-hidden">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map(user => {
                                        const isSelf = user.uid === currentUser?.uid;
                                        const last = formatLastActive(user.lastLoginAt, isSelf);
                                        return (
                                            <tr key={user.uid} className="group">
                                                <td className="px-3.5 py-3 border-b border-[#f3e1d2] align-middle overflow-hidden group-hover:bg-[#fff7f0]">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        {renderAvatar(user)}
                                                        <div className="min-w-0">
                                                            <div className="text-[13px] font-semibold truncate">{user.name || 'No Name'}</div>
                                                            {flags.has(user.uid) && (
                                                                <span className="block text-[11px] font-medium text-[#bb4d00] truncate">{flags.get(user.uid)}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3.5 py-3 border-b border-[#f3e1d2] align-middle overflow-hidden group-hover:bg-[#fff7f0]">{renderBadge(user)}</td>
                                                <td className="px-3.5 py-3 border-b border-[#f3e1d2] align-middle text-[13px] overflow-hidden group-hover:bg-[#fff7f0]">
                                                    <div className="truncate">{user.email || '—'}</div>
                                                    <div className="text-xs leading-[18px] text-[#5b6b86] truncate">{user.phoneNumber || 'No phone'}</div>
                                                </td>
                                                <td className="px-3.5 py-3 border-b border-[#f3e1d2] align-middle text-[13px] overflow-hidden group-hover:bg-[#fff7f0]">
                                                    <div className="truncate">{last ?? <span className="text-[#5b6b86]">Never logged in</span>}</div>
                                                </td>
                                                <td className="px-3.5 py-3 border-b border-[#f3e1d2] align-middle text-right whitespace-nowrap group-hover:bg-[#fff7f0]">
                                                    <div className="inline-flex items-center gap-1">
                                                        {isSelf && <span className="text-xs text-[#5b6b86] mr-1">You</span>}
                                                        <button onClick={() => handleEditClick(user)} className={BTN_SECONDARY_SM}>
                                                            <IconPencil />Edit
                                                        </button>
                                                        {renderMenu(user, false)}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* Roles side panel */}
                <aside className="bg-white border-t xl:border-t-0 xl:border-l border-[#f3e1d2] p-5 flex flex-col gap-4 min-w-0 content-start">
                    <h2 className="text-base font-semibold">Roles</h2>
                    <div className="grid gap-2.5 lg:grid-cols-3 xl:grid-cols-1">
                        <div className="p-3 px-3.5 border border-[#f3e1d2] rounded-sm grid gap-1">
                            <span className="justify-self-start inline-flex items-center h-[22px] px-2 rounded-sm text-[11px] font-semibold tracking-[.03em] bg-[#0f172b] text-white">OWNER</span>
                            <div className="text-xs leading-[18px] text-[#45556c]">Everything, including plans, users and deleting data.</div>
                        </div>
                        <div className="p-3 px-3.5 border border-[#f3e1d2] rounded-sm grid gap-1">
                            <span className="justify-self-start inline-flex items-center h-[22px] px-2 rounded-sm text-[11px] font-semibold tracking-[.03em] bg-[#ffedd9] text-[#ea580c]">MANAGER</span>
                            <div className="text-xs leading-[18px] text-[#45556c]">Billing, purchases, items, reports and settings. Can't manage users or plans.</div>
                        </div>
                        <div className="p-3 px-3.5 border border-[#f3e1d2] rounded-sm grid gap-1">
                            <span className="justify-self-start inline-flex items-center h-[22px] px-2 rounded-sm text-[11px] font-semibold tracking-[.03em] bg-[#fff7f0] text-[#45556c]">SALESMAN</span>
                            <div className="text-xs leading-[18px] text-[#45556c]">Create bills and collect payments. Can't see profit or delete bills.</div>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate(ROLE_PERMISSIONS_ROUTE)}
                        className="self-start inline-flex items-center gap-2 text-[13px] font-medium text-[#ea580c]">
                        <IconShield />Change what each role can do →
                    </button>
                </aside>
            </div>
        </div>
    );
};

export default CatalogueUserSetting;