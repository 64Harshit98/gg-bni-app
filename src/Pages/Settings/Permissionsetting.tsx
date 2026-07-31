import React, { useState, useEffect, useMemo } from 'react';
import { Shield, RotateCcw, LayoutGrid } from 'lucide-react';
import { Permissions, PLANS, ROLES } from '../../enums';
import Loading from '../Loading/Loading';
import { useAuth } from '../../context/auth-context';
import { Modal } from '../../constants/Modal';
import { State } from '../../enums';
import BackButton from '../../Components/BackButton';
import { Button } from '../../Components/ui/button';
import { Spinner } from '../../Components/ui/spinner';
import { ConfirmDialog } from '../../Components/ui/confirm-dialog';
import { cn } from '../../lib/utils';
import {
    fetchAndEnsureRolePermissions,
    saveRolePermissions,
    getDefaultPermissions,
    getSafePermissionsToSave,
    getUngroupedPermissions,
    PERMISSION_GROUPS,
    PERMISSION_DESCRIPTIONS,
    BASIC_ALLOWED_PERMISSIONS,
    EXCLUDED_OWNER_PERMISSIONS,
    DEFAULT_PERMISSIONS_MAP,
    type RolePermissionsMap,
} from '../../services/settings/permissionSetting.service';
import { PermissionGroupTable } from './components/PermissionGroupTable';

// Re-exported so existing consumers (e.g. `context/Permissions.ts`) that
// import these from this module path keep working unchanged.
export {
    getDefaultPermissions,
    getSafePermissionsToSave,
    BASIC_ALLOWED_PERMISSIONS,
    EXCLUDED_OWNER_PERMISSIONS,
    DEFAULT_PERMISSIONS_MAP,
};

const ManagePermissionsPage: React.FC = () => {
    const [rolePermissions, setRolePermissions] = useState<RolePermissionsMap>({});
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [modal, setModal] = useState<{ message: string; type: State } | null>(null);
    const { currentUser } = useAuth();
    const currentPlan = currentUser?.plan || PLANS.POS_BASIC;
    const isBasicPlan = currentPlan === PLANS.POS_BASIC;

    const [isResetOpen, setIsResetOpen] = useState(false);

    const ALL_ROLES = useMemo(() => Object.values(ROLES), []);

    // Roles hidden from this management screen entirely.
    const EXCLUDED_ROLES_FROM_UI = useMemo(() => [ROLES.OWNER, ROLES.AGENCY, ROLES.AGENT] as string[], []);

    const VISIBLE_ROLES = useMemo(
        () => ALL_ROLES.filter((r) => !EXCLUDED_ROLES_FROM_UI.includes(r)),
        [ALL_ROLES, EXCLUDED_ROLES_FROM_UI],
    );

    const allPermissions = useMemo(() => Object.values(Permissions), []);
    const ungroupedPermissions = useMemo(() => getUngroupedPermissions(allPermissions), [allPermissions]);

    const [selectedRole, setSelectedRole] = useState<string>(VISIBLE_ROLES[0] || 'Manager');

    useEffect(() => {
        if (!currentUser?.companyId) {
            setLoading(false);
            return;
        }
        const companyId = currentUser.companyId;

        const load = async () => {
            try {
                const permissionsMap = await fetchAndEnsureRolePermissions(companyId, ALL_ROLES, currentPlan);
                setRolePermissions(permissionsMap);
            } catch (err) {
                console.error('Error fetching permissions:', err);
                setModal({ message: 'Failed to load permissions.', type: State.ERROR });
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [ALL_ROLES, currentUser?.companyId, currentPlan]);

    const handlePermissionChange = (role: string, permission: Permissions, isChecked: boolean) => {
        setRolePermissions((prev) => {
            const currentPermissions = prev[role] || [];
            if (isChecked) {
                return { ...prev, [role]: [...new Set([...currentPermissions, permission])] };
            }
            return { ...prev, [role]: currentPermissions.filter((p) => p !== permission) };
        });
    };

    const handleResetPermissions = () => {
        const defaults = getDefaultPermissions(selectedRole);
        setRolePermissions((prev) => ({ ...prev, [selectedRole]: defaults }));
        setIsResetOpen(false);
    };

    const handleSaveChanges = async (role: string) => {
        if (!currentUser?.companyId) return;

        setIsSaving(true);
        try {
            const rawPermissions = rolePermissions[role] || [];
            const permissionsToSave = await saveRolePermissions(currentUser.companyId, role, rawPermissions, currentPlan);
            setRolePermissions((prev) => ({ ...prev, [role]: permissionsToSave }));
            setModal({ message: `Permissions for ${role} updated successfully!`, type: State.SUCCESS });
        } catch (err) {
            console.error('Error updating permissions:', err);
            setModal({ message: `Failed to update permissions for ${role}.`, type: State.ERROR });
        } finally {
            setIsSaving(false);
        }
    };

    const isLocked = (permission: Permissions) => isBasicPlan && !BASIC_ALLOWED_PERMISSIONS.includes(permission);

    if (loading) return <Loading />;

    return (
        <div className="aurora relative min-h-screen bg-background pb-28">
            {modal && <Modal message={modal.message} onClose={() => setModal(null)} type={modal.type} />}

            <ConfirmDialog
                open={isResetOpen}
                onOpenChange={setIsResetOpen}
                title={`Reset ${selectedRole} permissions?`}
                description="This restores the default permission set for this role. This cannot be undone until you save again."
                confirmLabel="Reset"
                variant="destructive"
                onConfirm={handleResetPermissions}
            />

            <header className="glass sticky top-0 z-20 flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                    <BackButton />
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-sm shadow-primary/20">
                        <Shield className="size-4" />
                    </span>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
                            Manage <span className="text-gradient">Permissions</span>
                        </h1>
                        <p className="text-xs text-muted-foreground">Control what each staff role can see and do</p>
                    </div>
                </div>

                <div className="glass inline-flex flex-wrap items-center gap-1 self-start rounded-2xl p-1 shadow-sm md:self-auto">
                    {VISIBLE_ROLES.map((role) => (
                        <button
                            key={role}
                            type="button"
                            onClick={() => setSelectedRole(role)}
                            aria-current={selectedRole === role ? 'page' : undefined}
                            className={cn(
                                'rounded-xl px-3.5 py-2 text-sm font-semibold capitalize transition-all duration-200 active:scale-[0.98]',
                                selectedRole === role
                                    ? 'bg-gradient-brand text-white shadow-md shadow-primary/25'
                                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                            )}
                        >
                            {role}
                        </button>
                    ))}
                </div>
            </header>

            <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
                    <div className="flex items-center gap-2">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-info/20 text-primary shadow-inner">
                            <LayoutGrid className="size-4" />
                        </span>
                        <div>
                            <h2 className="text-base font-semibold capitalize text-foreground">{selectedRole} Permissions</h2>
                            <p className="text-xs text-muted-foreground">
                                {rolePermissions[selectedRole]?.length || 0} of {allPermissions.length} permissions active
                            </p>
                        </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setIsResetOpen(true)} className="gap-1.5 text-destructive hover:text-destructive">
                        <RotateCcw className="size-3.5" />
                        Reset to Default
                    </Button>
                </div>

                {Object.values(PERMISSION_GROUPS).map((group) => (
                    <PermissionGroupTable
                        key={group.title}
                        title={group.title}
                        permissions={group.permissions}
                        descriptions={PERMISSION_DESCRIPTIONS}
                        selectedPermissions={rolePermissions[selectedRole] || []}
                        isLocked={isLocked}
                        onToggle={(permission, checked) => handlePermissionChange(selectedRole, permission, checked)}
                    />
                ))}

                {ungroupedPermissions.length > 0 && (
                    <PermissionGroupTable
                        title="Other"
                        permissions={ungroupedPermissions}
                        descriptions={PERMISSION_DESCRIPTIONS}
                        selectedPermissions={rolePermissions[selectedRole] || []}
                        isLocked={isLocked}
                        onToggle={(permission, checked) => handlePermissionChange(selectedRole, permission, checked)}
                    />
                )}
            </main>

            <div className="fixed inset-x-0 bottom-16 z-40 bg-transparent px-4 pb-2 md:bottom-0 md:p-4">
                <div className="mx-auto flex max-w-2xl justify-center gap-4">
                    <Button
                        onClick={() => handleSaveChanges(selectedRole)}
                        disabled={isSaving}
                        size="lg"
                        className="min-w-[220px] gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/20 hover:opacity-90"
                    >
                        {isSaving && <Spinner size="sm" />}
                        {isSaving ? 'Saving...' : `Save Changes for ${selectedRole}`}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ManagePermissionsPage;
