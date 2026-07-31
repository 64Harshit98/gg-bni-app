import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, ShieldAlert, Users } from 'lucide-react';

import BackButton from '../../Components/BackButton';
import { Badge } from '../../Components/ui/badge';
import { Button } from '../../Components/ui/button';
import { EmptyState } from '../../Components/ui/empty-state';
import { Pagination } from '../../Components/ui/pagination';
import { Spinner as ModernSpinner } from '../../Components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../Components/ui/table';
import { useAuth } from '../../context/auth-context';
import { Permissions, ROLES } from '../../enums';
import { usePagination } from '../../hooks/usePagination';
import { toast } from '../../lib/toast';
import {
  type CompanyUser,
  type CompanyUserUpdate,
  fetchCompanyUsers,
  updateCompanyUser,
} from '../../services/settings/catalogueUserSetting.service';
import { EditUserDialog } from './components/EditUserDialog';

const PAGE_SIZE = 10;

const CatalogueUserSetting: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, hasPermission, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<CompanyUser | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false);

  const canManageUsers = hasPermission(Permissions.ManageUsers);

  // Convert ROLES enum object into an array for mapping in the dropdown
  const availableRoles = useMemo(() => Object.values(ROLES).filter((r) => r !== ROLES.OWNER), []);

  const { currentPage, totalPages, pageItems, goToPage } = usePagination<CompanyUser>({
    totalItems: users.length,
    pageSize: PAGE_SIZE,
  });
  const pagedUsers = pageItems(users);

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

    let cancelled = false;
    const companyId = currentUser.companyId;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const fetchedUsers = await fetchCompanyUsers(companyId);
        if (!cancelled) setUsers(fetchedUsers);
      } catch (err) {
        console.error('Error fetching users:', err);
        if (!cancelled) {
          setError('Failed to load user data. Please try again.');
          toast.error('Failed to load users.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [currentUser, currentUser?.companyId, canManageUsers, authLoading]);

  const handleEditClick = (user: CompanyUser) => {
    setEditingUser(user);
    setIsEditDialogOpen(true);
  };

  const handleEditDialogOpenChange = (open: boolean) => {
    if (isSaving) return;
    setIsEditDialogOpen(open);
    if (!open) setEditingUser(null);
  };

  const handleSaveEdit = async (data: CompanyUserUpdate) => {
    if (!editingUser || !currentUser?.companyId) {
      toast.error('Error: Cannot save. User or Company ID is missing.');
      return;
    }

    setIsSaving(true);
    try {
      await updateCompanyUser(currentUser.companyId, editingUser.uid, data);

      setUsers((prevUsers) =>
        prevUsers.map((user) => (user.uid === editingUser.uid ? { ...user, ...data } : user)),
      );

      toast.success('User updated successfully!');
      setIsEditDialogOpen(false);
      setEditingUser(null);
    } catch (err) {
      console.error('Error updating user:', err);
      toast.error('Failed to update user. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <ModernSpinner size="xl" />
        <p className="text-muted-foreground">Loading users...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
        <EmptyState
          icon={<ShieldAlert className="size-5" />}
          title="Unable to load users"
          description={error}
          className="max-w-md"
        />
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="aurora flex min-h-screen w-full flex-col bg-muted">
      <header className="glass sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 p-3 md:p-4">
        <BackButton />
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-primary/20">
            <Users className="size-4" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
              Manage <span className="text-gradient">Users</span>
            </h1>
            <p className="text-xs text-muted-foreground">View and edit staff access for your company</p>
          </div>
        </div>
      </header>

      <main className="w-full flex-grow overflow-y-auto p-3 sm:p-4 md:p-5">
        {users.length === 0 ? (
          <EmptyState
            icon={<Users className="size-5" />}
            title="No users found"
            description="No users found for this company."
            className="mx-auto max-w-lg"
          />
        ) : (
          <div className="mx-auto max-w-5xl space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedUsers.map((user) => (
                  <TableRow key={user.uid}>
                    <TableCell className="font-medium text-foreground">
                      {user.name || 'No Name Provided'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.email || 'No Email'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.phoneNumber || 'Not Provided'}
                    </TableCell>
                    <TableCell>
                      {user.role ? (
                        <Badge variant={user.role === ROLES.OWNER ? 'default' : 'secondary'}>{user.role}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not Assigned</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleEditClick(user)}>
                        <Pencil className="size-3.5" />
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={goToPage}
                totalItems={users.length}
                pageSize={PAGE_SIZE}
              />
            )}
          </div>
        )}
      </main>

      <EditUserDialog
        open={isEditDialogOpen}
        onOpenChange={handleEditDialogOpenChange}
        user={editingUser}
        availableRoles={availableRoles}
        saving={isSaving}
        onSave={handleSaveEdit}
      />
    </div>
  );
};

export default CatalogueUserSetting;
