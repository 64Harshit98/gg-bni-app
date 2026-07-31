import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Search, Plus, Pencil, Trash2, ShieldAlert } from 'lucide-react';

import { useAuth } from '../../context/auth-context';
import { ROUTES } from '../../constants/routes.constants';
import { Permissions, ROLES } from '../../enums';
import { toast } from '../../lib/toast';
import BackButton from '../../Components/BackButton';
import { Spinner } from '../../Components/ui/spinner';
import { Button } from '../../Components/ui/button';
import { Input } from '../../Components/ui/input';
import { Label } from '../../Components/ui/label';
import { Badge } from '../../Components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '../../Components/ui/avatar';
import { EmptyState } from '../../Components/ui/empty-state';
import { ConfirmDialog } from '../../Components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../Components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../Components/ui/select';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../Components/ui/table';
import { Pagination } from '../../Components/ui/pagination';
import { usePagination } from '../../hooks/usePagination';
import {
  fetchCompanyUsers,
  updateCompanyUser,
  deleteCompanyUser,
  type AppUser,
} from '../../services/settings/userSettings.service';

type EditFormData = {
  name?: string;
  phoneNumber?: string;
  role?: string;
};

const PAGE_SIZE = 10;

const getInitials = (name?: string): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const ManageUsersPage = () => {
  const navigate = useNavigate();
  const { currentUser, hasPermission, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({});
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const canManageUsers = hasPermission(Permissions.ManageUsers);

  // Convert ROLES enum object into an array for mapping in the dropdown
  const availableRoles = useMemo(() => Object.values(ROLES).filter((r) => r !== ROLES.OWNER), []);

  useEffect(() => {
    if (authLoading) {
      setIsLoading(true);
      return;
    }

    if (!currentUser || !currentUser.companyId) {
      setError('User or company information is missing.');
      setIsLoading(false);
      return;
    }

    if (!canManageUsers) {
      setError('You do not have permission to manage users.');
      setIsLoading(false);
      return;
    }

    const companyId = currentUser.companyId;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedUsers = await fetchCompanyUsers(companyId);
        setUsers(fetchedUsers);
      } catch (err) {
        console.error('Error fetching users:', err);
        setError('Failed to load user data. Please try again.');
        toast.error('Failed to load users.');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [currentUser, currentUser?.companyId, canManageUsers, authLoading]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.phoneNumber || '').includes(q),
    );
  }, [users, searchQuery]);

  const { currentPage, totalPages, pageItems, goToPage } = usePagination<AppUser>({
    totalItems: filteredUsers.length,
    pageSize: PAGE_SIZE,
  });
  const visibleUsers = pageItems(filteredUsers);

  const handleAddUser = () => {
    navigate(ROUTES.USER_ADD);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !currentUser?.companyId) return;

    if (deleteTarget.uid === currentUser?.uid) {
      toast.error('You cannot delete your own account from this screen.');
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);
    try {
      await deleteCompanyUser(currentUser.companyId, deleteTarget.uid);
      setUsers((prev) => prev.filter((u) => u.uid !== deleteTarget.uid));
      toast.success('User deleted successfully.');
    } catch (err) {
      console.error('Error deleting user:', err);
      toast.error('Failed to delete user. Ensure you have the right permissions.');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleEditClick = (user: AppUser) => {
    setEditingUser(user);
    setEditFormData({
      name: user.name || '',
      phoneNumber: user.phoneNumber || '',
      role: user.role || '',
    });
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setEditFormData({});
  };

  const handleSaveEdit = async () => {
    if (!editingUser || !currentUser?.companyId) {
      toast.error('Error: Cannot save. User or Company ID is missing.');
      return;
    }
    const companyId = currentUser.companyId;

    setIsSaving(true);
    try {
      const updateData = {
        name: editFormData.name?.trim() || '',
        phoneNumber: editFormData.phoneNumber?.trim() || '',
        role: editFormData.role?.trim() || '',
      };

      await updateCompanyUser(companyId, editingUser.uid, updateData);

      setUsers((prev) =>
        prev.map((user) => (user.uid === editingUser.uid ? { ...user, ...updateData } : user)),
      );

      toast.success('User updated successfully!');
      handleCancelEdit();
    } catch (err) {
      console.error('Error updating user:', err);
      toast.error('Failed to update user. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Spinner size="xl" />
        <p className="mt-4 text-muted-foreground">Loading users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <EmptyState
          icon={<ShieldAlert className="size-5" />}
          title={error}
          action={
            <Button variant="outline" onClick={() => navigate(-1)}>
              Go Back
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="aurora flex min-h-screen w-full flex-col bg-muted">
      <header className="glass sticky top-0 z-30 mx-3 mt-3 flex flex-shrink-0 items-center justify-between gap-3 rounded-2xl p-3 shadow-sm">
        <div className="flex items-center gap-3">
          <BackButton />
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-primary/25">
            <Users className="size-4" />
          </span>
          <div>
            <h1 className="text-base font-bold tracking-tight text-foreground md:text-lg">
              Manage <span className="text-gradient">Users</span>
            </h1>
            <p className="text-xs text-muted-foreground">{users.length} team member{users.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <Button onClick={handleAddUser} className="gap-1.5 bg-gradient-brand text-white shadow-md shadow-primary/20 hover:opacity-90">
          <Plus className="size-4" />
          <span className="hidden sm:inline">Add User</span>
        </Button>
      </header>

      <main className="w-full flex-grow overflow-y-auto p-3 sm:p-4 md:p-5">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, email or phone"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-11 pl-9"
            />
          </div>

          {filteredUsers.length === 0 ? (
            <EmptyState
              icon={<Users className="size-5" />}
              title="No users found"
              description={searchQuery ? 'Try a different search term.' : 'No users found for this company yet.'}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleUsers.map((user) => {
                    const avatarSrc = user.profilePicture || user.photoURL || '';
                    const isOwner = user.role === ROLES.OWNER;
                    return (
                      <TableRow key={user.uid}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={avatarSrc} alt={user.name} />
                              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-foreground">{user.name || 'No Name'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{user.email || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{user.phoneNumber || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={isOwner ? 'default' : 'secondary'}>{user.role || 'No role'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button variant="ghost" size="icon" onClick={() => handleEditClick(user)} title="Edit user">
                              <Pencil className="size-4" />
                            </Button>
                            {!isOwner && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteTarget(user)}
                                className="text-destructive hover:text-destructive"
                                title="Delete user"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                  totalItems={filteredUsers.length}
                  pageSize={PAGE_SIZE}
                />
              )}
            </>
          )}
        </div>
      </main>

      {/* Edit user dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) handleCancelEdit(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Email: {editingUser?.email || 'N/A'} (not editable)</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="edit-name" className="mb-1 block">Name</Label>
              <Input
                id="edit-name"
                value={editFormData.name || ''}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-phone" className="mb-1 block">Phone Number</Label>
              <Input
                id="edit-phone"
                type="tel"
                maxLength={10}
                value={editFormData.phoneNumber || ''}
                onChange={(e) => setEditFormData((prev) => ({ ...prev, phoneNumber: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-role" className="mb-1 block">Role</Label>
              {editingUser?.role === ROLES.OWNER ? (
                <Input id="edit-role" value={editingUser?.role || 'OWNER'} readOnly disabled />
              ) : (
                <Select
                  value={editFormData.role || ''}
                  onValueChange={(value) => setEditFormData((prev) => ({ ...prev, role: value }))}
                >
                  <SelectTrigger id="edit-role" className="w-full">
                    <SelectValue placeholder="Select Role" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role.charAt(0).toUpperCase() + role.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveEdit} disabled={isSaving} className="gap-2">
              {isSaving ? <Spinner size="sm" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        title="Delete user"
        description={`Are you sure you want to delete ${deleteTarget?.name || 'this user'}? This removes their login access permanently.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};

export default ManageUsersPage;
