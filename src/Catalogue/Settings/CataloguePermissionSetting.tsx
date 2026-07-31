import React, { useState, useEffect, useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/auth-context';
import { ROLES } from '../../enums';
import { Cata_Permissions } from '../../Catalogue/enum/cata_permissions.enum';
import BackButton from '../../Components/BackButton';
import { Spinner as ModernSpinner } from '../../Components/ui/spinner';
import { Button } from '../../Components/ui/button';
import { Badge } from '../../Components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '../../Components/ui/tabs';
import { ConfirmDialog } from '../../Components/ui/confirm-dialog';
import { toast } from '../../lib/toast';
import {
  fetchCataloguePermissions,
  saveCataloguePermissionsForRole,
  syncOwnerCataloguePermissions,
  type CataloguePermissionMap,
} from '../../services/settings/cataloguePermissionSetting.service';
import {
  CATA_PERM_VALUES,
  cataPermissionGroups,
  getDefaultCataPermissions,
  getUngroupedPermissions,
} from './components/cataloguePermissionGroups';
import { CataloguePermissionGroupTable } from './components/CataloguePermissionGroupTable';

// Re-exported so existing consumers (e.g. AuthContext) keep working unchanged.
export { getDefaultCataPermissions };

const MANAGED_ROLES = [ROLES.SALESMAN, ROLES.MANAGER];

const CataloguePermissionSetting: React.FC = () => {
  const { currentUser } = useAuth();
  const [rolePermissions, setRolePermissions] = useState<CataloguePermissionMap>({});
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<string>(ROLES.SALESMAN);

  const [isSaving, setIsSaving] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);

  const ungroupedPermissions = useMemo(
    () => getUngroupedPermissions(CATA_PERM_VALUES as Cata_Permissions[]),
    [],
  );

  useEffect(() => {
    if (!currentUser?.companyId) return;
    let cancelled = false;
    const companyId = currentUser.companyId;

    const initializeAndFetchPermissions = async () => {
      try {
        // Always keep the Owner role fully-permissioned.
        await syncOwnerCataloguePermissions(companyId);
      } catch {
        // Non-fatal — already logged by the service layer.
      }

      try {
        const map = await fetchCataloguePermissions(companyId, MANAGED_ROLES);
        if (!cancelled) setRolePermissions(map);
      } catch (error) {
        console.error('Failed to load catalogue permissions:', error);
        if (!cancelled) toast.error('Failed to load permissions.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initializeAndFetchPermissions();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.companyId]);

  const handlePermissionChange = (role: string, perm: Cata_Permissions, checked: boolean) => {
    const currentUI = rolePermissions[role] || [];
    const next = checked ? [...new Set([...currentUI, perm])] : currentUI.filter((p) => p !== perm);
    setRolePermissions((prev) => ({ ...prev, [role]: next }));
  };

  const handleSaveChanges = async (role: string) => {
    if (!currentUser?.companyId) return;
    setIsSaving(true);

    try {
      await saveCataloguePermissionsForRole(currentUser.companyId, role, rolePermissions[role] || []);
      toast.success(`Permissions saved for ${role}.`);
    } catch (error) {
      console.error('Save failed:', error);
      toast.error('Failed to save permissions. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPermissions = async () => {
    if (!currentUser?.companyId) return;

    const defaults = getDefaultCataPermissions(selectedRole);
    setRolePermissions((prev) => ({ ...prev, [selectedRole]: defaults }));

    try {
      await saveCataloguePermissionsForRole(currentUser.companyId, selectedRole, defaults);
      toast.success(`${selectedRole} permissions reset to default.`);
    } catch (error) {
      console.error('Reset failed:', error);
      toast.error('Failed to reset permissions. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <ModernSpinner size="xl" />
        <p className="text-muted-foreground">Loading permissions...</p>
      </div>
    );
  }

  const activeCount = rolePermissions[selectedRole]?.length || 0;

  return (
    <div className="aurora flex min-h-screen w-full flex-col bg-muted pb-24">
      <header className="glass sticky top-0 z-30 flex items-center gap-3 border-b border-border/60 p-3 md:p-4">
        <BackButton />
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-white shadow-md shadow-primary/20">
            <ShieldCheck className="size-4" />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground md:text-xl">
              Catalogue <span className="text-gradient">Permissions</span>
            </h1>
            <p className="text-xs text-muted-foreground">Control what your team can access</p>
          </div>
        </div>
      </header>

      <main className="w-full flex-grow overflow-y-auto p-3 pb-28 sm:p-4 md:p-5 md:pb-24">
        <div className="mx-auto max-w-4xl space-y-5">
          <Tabs value={selectedRole} onValueChange={setSelectedRole}>
            <TabsList>
              {MANAGED_ROLES.map((role) => (
                <TabsTrigger key={role} value={role}>
                  {role}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
            <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
              <h2 className="text-lg font-semibold text-foreground capitalize">{selectedRole} Access</h2>
              <div className="flex items-center gap-3">
                <Badge variant="secondary">{activeCount} Active</Badge>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsResetOpen(true)}
                  className="text-destructive hover:text-destructive"
                >
                  Reset to Default
                </Button>
              </div>
            </div>

            <ConfirmDialog
              open={isResetOpen}
              onOpenChange={setIsResetOpen}
              title={`Reset ${selectedRole} permissions?`}
              description={`This will restore ${selectedRole} to the default permission set. This cannot be undone.`}
              confirmLabel="Reset"
              variant="destructive"
              onConfirm={handleResetPermissions}
            />

            <div className="space-y-5">
              {Object.values(cataPermissionGroups).map((group) => (
                <CataloguePermissionGroupTable
                  key={group.title}
                  title={group.title}
                  permissions={group.permissions}
                  checkedPermissions={rolePermissions[selectedRole] || []}
                  onChange={(perm, checked) => handlePermissionChange(selectedRole, perm, checked)}
                />
              ))}

              <CataloguePermissionGroupTable
                title="Other Permissions"
                permissions={ungroupedPermissions}
                checkedPermissions={rolePermissions[selectedRole] || []}
                onChange={(perm, checked) => handlePermissionChange(selectedRole, perm, checked)}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Sticky save bar */}
      <div className="pointer-events-none fixed inset-x-0 bottom-16 z-40 px-4 pb-2 md:bottom-0 md:p-4">
        <div className="pointer-events-auto mx-auto flex max-w-2xl justify-center">
          <Button
            onClick={() => handleSaveChanges(selectedRole)}
            disabled={isSaving}
            size="lg"
            className="min-w-[170px] gap-2 bg-gradient-brand text-white shadow-lg shadow-primary/25 hover:opacity-90"
          >
            {isSaving ? <ModernSpinner size="sm" /> : null}
            {isSaving ? 'Saving...' : `Save Changes for ${selectedRole}`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CataloguePermissionSetting;
