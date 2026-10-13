export enum Cata_Permissions {

    ViewCatalogueDashboard = 'ViewCatalogueDashboard',
    ViewCatalogueAccounts = 'ViewCatalogueAccounts',
    ViewCatalogueOrders = 'ViewCatalogueOrders',
    ViewCatalogueRequests = 'ViewCatalogueRequests',
    ManageItems = 'ManageItem',
    ViewReports = 'ViewCatalogueReports',
    ViewItemReport = 'ViewCatalogueItemReport',
    ViewPartyLedger = 'ViewCataloguePartyLedger',
    ViewItemSoldReport = 'ViewCatalogueItemSoldReport',
    ViewSalesReport = 'ViewCatalogueSalesReport',
    ViewPNLReport = 'ViewCataloguePNLReport',
    ViewCustomerReport = 'ViewCatalogueCustomerReport',
    ViewUserReport = 'ViewUserReport',
    ViewTaxReport = 'ViewCatalogueTaxReport',
    ManageEditProfile = 'ManageCatalogueEditProfile',
    ManageMasters = 'ManageMasters',
    ManageSalesSettings = 'ManageSalesSettings',
    ManageBillSettings = 'ManageBillSettings',
    ManageItemSettings = 'ManageItemSettings',
    ManageUserSettings = 'ManageUserSettings',
    ManagePermissions = 'ManagePermissions',
    ViewShop = 'ViewShop',
    ViewOrdersReturn = 'ViewOrdersReturn',
    ViewShopItems = 'ViewShopItems',
    ViewExpenseReport = 'ViewCatalogueExpenseReport',
    ViewCatalogueHidebutton = 'ViewCatalogueHidebutton',
    ViewCatalogueFilter = 'ViewCatalogueFilter',
    ViewCatalogueSalesbarchart = 'ViewCatalogueSalesbarchart',
    ViewTopSoldItems = 'ViewCatalogueTopSoldItems',
    ViewEditButton = 'ViewEditButton',
    ViewNotification = 'ViewNotification',
}

// Maps old, no-longer-used permission string values to their current
// Cata_Permissions member. When a value is renamed here (e.g. to fix a
// collision with a core Permissions string, as with ManageItems below),
// add the old string here so companies with an already-saved
// cata_permissions/{role} doc self-heal instead of silently losing access
// to whatever the renamed permission gated (a tab/button vanishing).
const RENAMED_CATA_PERMISSION_VALUES: Record<string, Cata_Permissions> = {
    'ManageItems': Cata_Permissions.ManageItems, // -> 'ManageItem', collided with core Permissions.ManageItems
    'ViewReports': Cata_Permissions.ViewReports, // -> 'ViewCatalogueReports', collided with core Permissions.ViewReports
    'ViewItemReport': Cata_Permissions.ViewItemReport, // -> 'ViewCatalogueItemReport', collided with core Permissions.ViewItemReport
    'ViewPartyLedger': Cata_Permissions.ViewPartyLedger, // -> 'ViewCataloguePartyLedger', collided with core Permissions.ViewPartyLedger
    'ViewItemSoldReport': Cata_Permissions.ViewItemSoldReport, // -> 'ViewCatalogueItemSoldReport', collided with core Permissions.ViewItemSoldReport
    'ViewSalesReport': Cata_Permissions.ViewSalesReport, // -> 'ViewCatalogueSalesReport', collided with core Permissions.ViewSalesReport
    'ViewPNLReport': Cata_Permissions.ViewPNLReport, // -> 'ViewCataloguePNLReport', collided with core Permissions.ViewPNLReport
    'ViewCustomerReport': Cata_Permissions.ViewCustomerReport, // -> 'ViewCatalogueCustomerReport', collided with core Permissions.ViewCustomerReport
    'ViewTaxReport': Cata_Permissions.ViewTaxReport, // -> 'ViewCatalogueTaxReport', collided with core Permissions.ViewTaxReport
    'ManageEditProfile': Cata_Permissions.ManageEditProfile, // -> 'ManageCatalogueEditProfile', collided with core Permissions.ManageEditProfile
    'ViewExpenseReport': Cata_Permissions.ViewExpenseReport, // -> 'ViewCatalogueExpenseReport', collided with core Permissions.ViewExpenseReport
    'ViewTopSoldItems': Cata_Permissions.ViewTopSoldItems, // -> 'ViewCatalogueTopSoldItems', collided with core Permissions.ViewTopSoldItems
};

// Rewrites any legacy strings in a persisted allowedPermissions array to
// their current enum value and de-dupes. `changed` tells the caller
// whether the corrected list is worth writing back to Firestore.
export const migrateCataPermissions = (
    raw: unknown
): { permissions: Cata_Permissions[]; changed: boolean } => {
    const list = Array.isArray(raw) ? raw : [];
    let changed = false;

    const migrated = list.map((value) => {
        if (typeof value === 'string' && value in RENAMED_CATA_PERMISSION_VALUES) {
            changed = true;
            return RENAMED_CATA_PERMISSION_VALUES[value];
        }
        return value as Cata_Permissions;
    });

    const deduped = Array.from(new Set(migrated));
    if (deduped.length !== migrated.length) changed = true;

    return { permissions: deduped, changed };
};
