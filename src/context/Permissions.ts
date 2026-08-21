// utils/permissionSync.ts
import { db } from '../lib/Firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getDefaultPermissions } from '../Pages/Settings/Permissionsetting';

export const syncCompanyPermissions = async (companyId: string, role: string, existingFromDb: any[], docExists: boolean) => {
    const defaults = getDefaultPermissions(role);

    // If a permissions document already exists for this role, auto-merge in
    // any default permission it's still missing (e.g. a new capability added
    // to the role's defaults after this doc was first created) instead of
    // requiring the Owner to manually hit Reset + Save. This does mean a
    // permission an Owner explicitly unchecked, but which is still part of
    // the role's defaults, will come back on next login — that trade-off is
    // intentional so plan/permission rollouts reach existing companies
    // automatically.
    if (docExists) {
        const merged = Array.from(new Set([...(existingFromDb || []), ...defaults]));
        const changed = merged.length !== (existingFromDb || []).length;

        if (changed) {
            const docRef = doc(db, 'companies', companyId, 'permissions', role);
            try {
                await setDoc(docRef, {
                    allowedPermissions: merged,
                    lastAutoSync: new Date()
                }, { merge: true });
                console.log(`✅ Auto-synced new default permissions for ${role}`);
            } catch (err) {
                console.error(`Failed to auto-sync permissions for ${role}`, err);
            }
        }

        return merged;
    }

    // Document doesn't exist yet (first-ever login for this role) — seed it with defaults.
    const docRef = doc(db, 'companies', companyId, 'permissions', role);
    await setDoc(docRef, {
        allowedPermissions: defaults,
        lastAutoSync: new Date()
    }, { merge: true });
    console.log(`✅ Initialized default permissions for ${role}`);

    return defaults;
};