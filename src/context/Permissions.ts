// utils/permissionSync.ts
import { db } from '../lib/Firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getDefaultPermissions } from '../Pages/Settings/Permissionsetting';

export const syncCompanyPermissions = async (companyId: string, role: string, existingFromDb: any[], docExists: boolean) => {
    // If a permissions document already exists for this role, trust it as-is.
    // Do NOT re-merge code defaults — that would silently re-enable permissions
    // an owner/manager explicitly disabled.
    if (docExists) {
        return existingFromDb;
    }

    // Document doesn't exist yet (first-ever login for this role) — seed it with defaults.
    const defaults = getDefaultPermissions(role);
    const docRef = doc(db, 'companies', companyId, 'permissions', role);
    await setDoc(docRef, {
        allowedPermissions: defaults,
        lastAutoSync: new Date()
    }, { merge: true });
    console.log(`✅ Initialized default permissions for ${role}`);

    return defaults;
};