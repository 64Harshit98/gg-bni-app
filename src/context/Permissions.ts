// utils/permissionSync.ts
import { db } from '../lib/Firebase';
import { doc, setDoc } from 'firebase/firestore';
import { getDefaultPermissions } from '../Pages/Settings/Permissionsetting';

export const syncCompanyPermissions = async (companyId: string, role: string, existingFromDb: any[]) => {
    // 1. Get current code defaults for this role
    const defaults = getDefaultPermissions(role);

    // 2. Merge (Code Defaults + Database Customizations)
    const merged = Array.from(new Set([...defaults, ...existingFromDb]));

    // 3. Only update Firestore if there is a change (new permissions added to code)
    if (merged.length !== existingFromDb.length) {
        const docRef = doc(db, 'companies', companyId, 'permissions', role);
        await setDoc(docRef, {
            allowedPermissions: merged,
            lastAutoSync: new Date()
        }, { merge: true });
        console.log(`✅ Auto-synced new permissions for ${role}`);
    }

    return merged;
};