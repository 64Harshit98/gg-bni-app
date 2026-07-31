import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { ROLES } from '../../enums';
import { Cata_Permissions } from '../../Catalogue/enum/cata_permissions.enum';

const CATA_PERM_VALUES = Object.values(Cata_Permissions);

/** Roles whose permissions are hand-managed through the UI (Owner is always full-access). */
export const MANAGED_CATA_ROLES = [ROLES.SALESMAN, ROLES.MANAGER] as const;

export type ManagedCataRole = (typeof MANAGED_CATA_ROLES)[number];

export type CataloguePermissionMap = Record<string, Cata_Permissions[]>;

/**
 * Ensures the Owner role document always contains every known permission.
 * Safe to call on every load — merges rather than overwrites.
 */
export async function syncOwnerCataloguePermissions(companyId: string): Promise<void> {
  try {
    const ownerRef = doc(db, 'companies', companyId, 'cata_permissions', ROLES.OWNER);
    await setDoc(
      ownerRef,
      {
        allowedPermissions: CATA_PERM_VALUES,
        role: ROLES.OWNER,
        companyId,
      },
      { merge: true },
    );
  } catch (error) {
    console.error('Failed to auto-sync Owner catalogue permissions', error);
    throw error;
  }
}

/** Fetches the allowed-permission list for each managed role (Salesman, Manager). */
export async function fetchCataloguePermissions(
  companyId: string,
  roles: readonly string[] = MANAGED_CATA_ROLES,
): Promise<CataloguePermissionMap> {
  try {
    const result: CataloguePermissionMap = {};

    for (const role of roles) {
      const docRef = doc(db, 'companies', companyId, 'cata_permissions', role);
      const snap = await getDoc(docRef);
      result[role] = snap.exists() ? (snap.data().allowedPermissions ?? []) : [];
    }

    return result;
  } catch (error) {
    console.error('Failed to fetch catalogue permissions', error);
    throw error;
  }
}

/** Persists the allowed-permission list for a single role. */
export async function saveCataloguePermissionsForRole(
  companyId: string,
  role: string,
  allowedPermissions: Cata_Permissions[],
): Promise<void> {
  try {
    const docRef = doc(db, 'companies', companyId, 'cata_permissions', role);
    await setDoc(
      docRef,
      {
        allowedPermissions,
        role,
        companyId,
      },
      { merge: true },
    );
  } catch (error) {
    console.error('Failed to save catalogue permissions', error);
    throw error;
  }
}
