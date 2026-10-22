// utils/permissionSync.ts
import { db } from '../lib/Firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getDefaultPermissions } from '../Pages/Settings/Permissionsetting';

export const syncCompanyPermissions = async (
    companyId: string,
    role: string,
    existingFromDb: any[],
    docExists: boolean,
    syncedDefaults?: any[]   // NEW: doc ka syncedDefaults field (caller se pass hoga)
) => {
    const defaults = getDefaultPermissions(role);
    if (docExists) {
        // Sirf nayi defaults merge hongi; purane docs (stamp nahi) me current defaults ko already-synced maano
        const hasStamp = Array.isArray(syncedDefaults);
        const alreadySynced: any[] = hasStamp ? syncedDefaults! : defaults;
        const newDefaults = defaults.filter(p => !alreadySynced.includes(p));
        const merged = Array.from(new Set([...(existingFromDb || []), ...newDefaults]));
        const changed = newDefaults.length > 0 || !hasStamp;

        if (changed) {
            const docRef = doc(db, 'companies', companyId, 'permissions', role);
            try {
                await setDoc(docRef, {
    allowedPermissions: defaults,
    syncedDefaults: defaults,
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