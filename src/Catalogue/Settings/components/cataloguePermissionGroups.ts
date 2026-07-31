import { ROLES } from '../../../enums';
import { Cata_Permissions } from '../../../Catalogue/enum/cata_permissions.enum';

export const CATA_PERM_VALUES = Object.values(Cata_Permissions);

// --- DEFAULTS --------------------------------------------------------------

export const getDefaultCataPermissions = (role: string): Cata_Permissions[] => {
  switch (role) {
    case ROLES.OWNER:
      return Object.values(Cata_Permissions);
    case ROLES.MANAGER:
      return [
        Cata_Permissions.ViewCatalogueDashboard,
        Cata_Permissions.ViewCatalogueAccounts,
        Cata_Permissions.ViewCatalogueOrders,
        Cata_Permissions.ViewCatalogueRequests,
        Cata_Permissions.ViewCatalogueFilter,
        Cata_Permissions.ViewReports,
        Cata_Permissions.ManageItems,
        Cata_Permissions.ViewEditButton,
      ];
    case ROLES.SALESMAN:
      return [
        Cata_Permissions.ViewCatalogueDashboard,
        Cata_Permissions.ViewCatalogueOrders,
        Cata_Permissions.ViewCatalogueFilter,
      ];
    default:
      return [];
  }
};

export interface CataPermissionGroup {
  title: string;
  permissions: Cata_Permissions[];
}

// --- GROUPS FOR UI -----------------------------------------------------------

export const cataPermissionGroups: Record<string, CataPermissionGroup> = {
  dashboard: {
    title: 'Dashboard & Widgets',
    permissions: [
      Cata_Permissions.ViewCatalogueDashboard,
      Cata_Permissions.ViewCatalogueFilter,
      Cata_Permissions.ViewCatalogueHidebutton,
      Cata_Permissions.ViewCatalogueSalesbarchart,
      Cata_Permissions.ViewTopSoldItems,
    ],
  },
  orders: {
    title: 'Orders, Shop & Requests',
    permissions: [
      Cata_Permissions.ViewCatalogueOrders,
      Cata_Permissions.ViewOrdersReturn,
      Cata_Permissions.ViewCatalogueRequests,
      Cata_Permissions.ViewShop,
      Cata_Permissions.ViewShopItems,
      Cata_Permissions.ViewEditButton,
    ],
  },
  reports: {
    title: 'Reports',
    permissions: [
      Cata_Permissions.ViewReports,
      Cata_Permissions.ViewItemReport,
      Cata_Permissions.ViewSalesReport,
      Cata_Permissions.ViewItemSoldReport,
      Cata_Permissions.ViewCustomerReport,
      Cata_Permissions.ViewUserReport,
      Cata_Permissions.ViewPartyLedger,
      Cata_Permissions.ViewTaxReport,
      Cata_Permissions.ViewPNLReport,
      Cata_Permissions.ViewExpenseReport,
    ],
  },
  management: {
    title: 'Management & Settings',
    permissions: [
      Cata_Permissions.ViewCatalogueAccounts,
      Cata_Permissions.ManageItems,
      Cata_Permissions.ManageEditProfile,
      Cata_Permissions.ManageMasters,
      Cata_Permissions.ManageSalesSettings,
      Cata_Permissions.ManageBillSettings,
      Cata_Permissions.ManageItemSettings,
      Cata_Permissions.ManageUserSettings,
      Cata_Permissions.ManagePermissions,
    ],
  },
};

// --- DESCRIPTIONS (Tooltips) -------------------------------------------------

export const CATA_PERMISSION_DESCRIPTIONS: Partial<Record<Cata_Permissions, string>> = {
  [Cata_Permissions.ViewCatalogueDashboard]: 'Access the main catalogue dashboard.',
  [Cata_Permissions.ViewCatalogueHidebutton]: 'Toggle visibility of sensitive data on the dashboard.',
  [Cata_Permissions.ViewPNLReport]: 'Access the profit & loss report (contains sensitive financial data).',
  [Cata_Permissions.ManagePermissions]: 'Configure role-based permissions — high privilege action.',
  [Cata_Permissions.ViewEditButton]: 'Allow editing of existing catalogue orders or entries.',
};

export const getUngroupedPermissions = (allPermissions: Cata_Permissions[]): Cata_Permissions[] => {
  const grouped = new Set<Cata_Permissions>();
  Object.values(cataPermissionGroups).forEach((group) => {
    group.permissions.forEach((perm) => grouped.add(perm));
  });
  return allPermissions.filter((perm) => !grouped.has(perm));
};
