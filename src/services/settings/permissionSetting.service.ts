/**
 * Data-access + domain logic layer for the role Permissions settings page.
 * Wraps the Firestore reads/writes and the permission-group/plan-gating
 * business rules previously defined directly inside
 * `Pages/Settings/Permissionsetting.tsx` behind small, typed functions.
 */
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/Firebase';
import { Permissions, PLANS, ROLES } from '../../enums';

export type RolePermissionsMap = Record<string, Permissions[]>;

export const EXCLUDED_OWNER_PERMISSIONS = [Permissions.ViewAttendance];

export const BASIC_ALLOWED_PERMISSIONS = [
  Permissions.ViewDashboard,
  Permissions.ViewSalescard,
  Permissions.ManageEditProfile,
  Permissions.CreateSales,
  Permissions.ViewTransactions,
  Permissions.ViewHidebutton,
  Permissions.ViewFilter,
  Permissions.ViewSalesbarchart,
  Permissions.ViewPaymentmethods,
  Permissions.ViewReports,
  Permissions.ViewSalesReport,
  Permissions.CreateUsers,
];

export const DEFAULT_PERMISSIONS_MAP: Record<string, Permissions[]> = {
  [ROLES.SALESMAN]: [
    Permissions.ViewAttendance,
    Permissions.ViewDashboard,
    Permissions.CreateSales,
    Permissions.CreateSalesReturn,
    Permissions.ViewAccount,
  ],
  [ROLES.MANAGER]: [
    Permissions.ViewDashboard,
    Permissions.ViewAttendance,
    Permissions.ViewAccount,
    Permissions.Viewrestockcard,
    Permissions.ViewTransactions,
    Permissions.PrintQR,
    Permissions.ManageItems,
    Permissions.ManageItemGroup,
    Permissions.CreateSales,
    Permissions.CreateSalesReturn,
    Permissions.CreatePurchase,
    Permissions.CreatePurchaseReturn,
    Permissions.HiddenProFeatures,
  ],
  [ROLES.OWNER]: Object.values(Permissions).filter(
    (permission) => !EXCLUDED_OWNER_PERMISSIONS.includes(permission),
  ),
};

export const PERMISSION_DESCRIPTIONS: Partial<Record<Permissions, string>> = {
  [Permissions.ViewDashboard]: 'Access to the main dashboard overview and summary stats.',
  [Permissions.ViewCatalogue]: 'Browse the full product catalogue.',
  [Permissions.ViewFilter]: 'Use date and category filters on dashboard widgets.',
  [Permissions.ViewHidebutton]: 'Toggle visibility of sensitive data on dashboard cards.',
  [Permissions.ViewTopSalesperson]: 'See the top-performing salesperson widget.',
  [Permissions.ViewAttendance]: 'View staff check-in/check-out attendance records.',
  [Permissions.ViewSalescard]: "See the today's sales summary card on dashboard.",
  [Permissions.ViewSalesbarchart]: 'See the sales bar chart on the dashboard.',
  [Permissions.Viewrestockcard]: 'See the low-stock/restock alert card on dashboard.',
  [Permissions.ViewTopSoldItems]: 'See the best-selling items widget on dashboard.',
  [Permissions.ViewTopCustomers]: 'See the top customers widget on dashboard.',
  [Permissions.CreateSales]: 'Process new sales transactions at the POS.',
  [Permissions.CreateSalesReturn]: 'Process refunds and returns on sales.',
  [Permissions.ViewTransactions]: 'Browse the full transaction history log.',
  [Permissions.ViewPaymentmethods]: 'View and select payment types during checkout.',
  [Permissions.ViewSalesReport]: 'Access the detailed sales report page.',
  [Permissions.ViewPNLReport]: 'Access the profit & loss report — contains sensitive financial data.',
  [Permissions.ViewPurchaseReport]: 'Access the purchase history report.',
  [Permissions.ViewItemReport]: 'Access per-item sales and stock reports.',
  [Permissions.CreatePurchase]: 'Create new purchase/stock-in orders from suppliers.',
  [Permissions.CreatePurchaseReturn]: 'Process returns on supplier purchases.',
  [Permissions.ManageItems]: 'Add, edit, and delete inventory items.',
  [Permissions.ManageItemGroup]: 'Create and manage item categories and groups.',
  [Permissions.PrintQR]: 'Print QR code labels for inventory items.',
  [Permissions.ViewAccount]: 'Access to the account/profile page.',
  [Permissions.ManageEditProfile]: 'Update own profile details such as name and photo.',
  [Permissions.SetPermissions]: 'Configure role-based permissions — high privilege action.',
  [Permissions.ManageUsers]: 'Add, edit, or deactivate staff user accounts.',
  [Permissions.CreateUsers]: 'Invite and create new staff accounts.',
  [Permissions.HiddenProFeatures]: 'Unlocks all advanced Pro-tier features across the app.',
  [Permissions.ViewReports]: 'Access the reports section in the navigation.',
  [Permissions.ViewFilterbutton]: 'Use date and category filters on dashboard widgets.',
  [Permissions.ViewPurchaseTransactions]: 'View the purchase-side transaction history.',
  [Permissions.ViewEditReturn]: 'View and edit processed return entries.',
  [Permissions.ViewDownloadPDF]: 'Download transaction receipts and reports as PDF.',
  [Permissions.SalesmanwiseBilling]: 'Assign a specific salesperson to each sale at billing.',
  [Permissions.ItemwiseDiscount]: 'Apply different discount rates per item in a sale.',
  [Permissions.PurchaseTaxtype]: 'Choose the tax type applied on purchase entries.',
  [Permissions.ViewAddons]: 'Access and manage addon/plugin features.',
  [Permissions.ChangeViewtype]: 'Switch between list and grid view on item screens.',
  [Permissions.RoundingOff]: 'Automatically round off the final bill amount.',
  [Permissions.LockDiscountPrice]: 'Prevent cashiers from manually editing discounted prices.',
  [Permissions.AllowDueBilling]: 'Allow saving a sale with a pending/due payment.',
};

export interface PermissionGroup {
  title: string;
  permissions: Permissions[];
}

export const PERMISSION_GROUPS: Record<string, PermissionGroup> = {
  dashboard: {
    title: 'Dashboard & General',
    permissions: [
      Permissions.ViewDashboard,
      Permissions.ViewFilter,
      Permissions.ViewHidebutton,
      Permissions.ViewTopSalesperson,
      Permissions.ViewAttendance,
      Permissions.ViewSalescard,
      Permissions.ViewSalesbarchart,
      Permissions.Viewrestockcard,
      Permissions.ViewTopSoldItems,
      Permissions.ViewTopCustomers,
    ],
  },
  sales: {
    title: 'Sales',
    permissions: [Permissions.CreateSales, Permissions.CreateSalesReturn, Permissions.SalesmanwiseBilling],
  },
  purchases: {
    title: 'Purchases',
    permissions: [Permissions.CreatePurchase, Permissions.CreatePurchaseReturn],
  },
  inventory: {
    title: 'Inventory Management',
    permissions: [Permissions.ManageItems, Permissions.ManageItemGroup, Permissions.ViewCatalogue],
  },
  reports: {
    title: 'Reports',
    permissions: [
      Permissions.ViewReports,
      Permissions.ViewSalesReport,
      Permissions.ViewPNLReport,
      Permissions.ViewPurchaseReport,
      Permissions.ViewItemReport,
    ],
  },
  Settings: {
    title: 'Settings',
    permissions: [Permissions.SetPermissions, Permissions.ManageUsers],
  },
  Account: {
    title: 'Account',
    permissions: [Permissions.ManageEditProfile, Permissions.ViewAddons],
  },
  billing: {
    title: 'Billing & POS Behaviour',
    permissions: [
      Permissions.ItemwiseDiscount,
      Permissions.RoundingOff,
      Permissions.LockDiscountPrice,
      Permissions.AllowDueBilling,
      Permissions.ChangeViewtype,
      Permissions.ViewDownloadPDF,
      Permissions.ViewEditReturn,
      Permissions.ViewPurchaseTransactions,
    ],
  },
  stockControl: {
    title: 'Stock Control',
    permissions: [Permissions.AllownegativeStock, Permissions.PurchaseTaxtype],
  },
  userManagement: {
    title: 'User Management',
    permissions: [
      Permissions.CreateUsers,
      Permissions.ViewPaymentmethods,
      Permissions.ViewFilterbutton,
      Permissions.ViewAccount,
      Permissions.PrintQR,
      Permissions.ViewTransactions,
    ],
  },
};

export const HIDDEN_FROM_UI_PERMISSIONS = [Permissions.HiddenProFeatures, Permissions.ViewPartnerDashboard];

/** Permissions that exist in the enum but aren't assigned to any visible group (rendered under "Other"). */
export const getUngroupedPermissions = (allPermissions: Permissions[]): Permissions[] => {
  const grouped = new Set<Permissions>();
  Object.values(PERMISSION_GROUPS).forEach((group) => {
    group.permissions.forEach((perm) => grouped.add(perm));
  });
  return allPermissions.filter((perm) => !grouped.has(perm) && !HIDDEN_FROM_UI_PERMISSIONS.includes(perm));
};

/** Default permission set for a role, falling back to "everything" for Owner and "nothing" otherwise. */
export const getDefaultPermissions = (role: string): Permissions[] => {
  if (DEFAULT_PERMISSIONS_MAP[role]) {
    return DEFAULT_PERMISSIONS_MAP[role];
  }
  if (role === ROLES.OWNER) return Object.values(Permissions);
  return [];
};

/** Filters a permission list down to what the role/plan combination is actually allowed to have. */
export const getSafePermissionsToSave = (
  role: string,
  currentPermissions: Permissions[],
  userPlan: string,
): Permissions[] => {
  let safePermissions = currentPermissions;

  if (userPlan === PLANS.POS_BASIC) {
    safePermissions = safePermissions.filter((p) => BASIC_ALLOWED_PERMISSIONS.includes(p));
  }

  if (role === ROLES.OWNER) {
    return safePermissions.filter((p) => !EXCLUDED_OWNER_PERMISSIONS.includes(p));
  }

  return safePermissions;
};

/**
 * Loads (and, for any role missing a doc, creates) the allowed-permissions
 * doc for every role, applying plan-based gating along the way. Mirrors the
 * previous inline effect exactly: Owner's stored permissions are always
 * re-derived from the full permission set (never merged from what's saved).
 */
export async function fetchAndEnsureRolePermissions(
  companyId: string,
  roles: string[],
  currentPlan: string,
): Promise<RolePermissionsMap> {
  try {
    const permissionsMap: RolePermissionsMap = {};
    const permissionsCollectionRef = collection(db, 'companies', companyId, 'permissions');

    for (const role of roles) {
      const docRef = doc(permissionsCollectionRef, role);
      const docSnap = await getDoc(docRef);

      let finalPermissions: Permissions[] = [];
      let shouldUpdateDB = false;

      if (docSnap.exists()) {
        let storedData: unknown = docSnap.data().allowedPermissions || [];
        if (typeof storedData === 'string') {
          try {
            storedData = JSON.parse(storedData);
          } catch {
            storedData = [];
          }
        }

        if (role === ROLES.OWNER) {
          finalPermissions = getSafePermissionsToSave(role, Object.values(Permissions), currentPlan);
          shouldUpdateDB = true;
        } else {
          // Don't merge in defaults here — use the stored data as-is, so
          // unchecked permissions stay unchecked.
          finalPermissions = getSafePermissionsToSave(role, storedData as Permissions[], currentPlan);
        }
      } else {
        const defaults = getDefaultPermissions(role);
        finalPermissions = getSafePermissionsToSave(role, defaults, currentPlan);
        shouldUpdateDB = true;
      }

      if (shouldUpdateDB) {
        await setDoc(docRef, { allowedPermissions: finalPermissions, companyId, role }, { merge: true });
      }

      permissionsMap[role] = finalPermissions;
    }

    return permissionsMap;
  } catch (error) {
    console.error('permissionSetting.service: failed to fetch/ensure role permissions', error);
    throw error;
  }
}

/** Persists the (plan-filtered) allowed-permissions list for a single role. */
export async function saveRolePermissions(
  companyId: string,
  role: string,
  permissions: Permissions[],
  currentPlan: string,
): Promise<Permissions[]> {
  try {
    const permissionsToSave = getSafePermissionsToSave(role, permissions, currentPlan);
    const docRef = doc(db, 'companies', companyId, 'permissions', role);
    await setDoc(docRef, { allowedPermissions: permissionsToSave }, { merge: true });
    return permissionsToSave;
  } catch (error) {
    console.error('permissionSetting.service: failed to save role permissions', error);
    throw error;
  }
}
