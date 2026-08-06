import { lazy } from 'react';
import { ROUTES } from '../constants/routes.constants';
import { Permissions, PLANS } from '../enums';
import { Cata_Permissions } from '../Catalogue/enum/cata_permissions.enum';
// --- MAIN MODULE IMPORTS ---
const Home = lazy(() => import('../Pages/Home'));
const Account = lazy(() => import('../Pages/Account'));
const EditProfile = lazy(() => import('../Pages/Account/EditProfile'));
const Journal = lazy(() => import('../Pages/Journal'));
const Masters = lazy(() => import('../Pages/Masters'));
const Sales = lazy(() => import('../Pages/Master/Sales'));
const SalesReturn = lazy(() => import('../Pages/Master/SalesReturn'));
const Purchase = lazy(() => import('../Pages/Master/Purchase'));
const PurchaseReturn = lazy(() => import('../Pages/Master/PurchaseReturn'));
const PrintQR = lazy(() => import('../Pages/Master/PrintQR'));
const ItemAdd = lazy(() => import('../Pages/Master/ItemAdd'));
const ItemGroup = lazy(() => import('../Pages/Master/ItemGroup'));
const ManageItems = lazy(() => import('../Pages/Master/ManageItems'));
const UserAdd = lazy(() => import('../Pages/Master/UserAdd'));
const Reports = lazy(() => import('../Pages/Reports'));
const ItemReport = lazy(() => import('../Pages/Reports/ItemReport'));
const SalesReport = lazy(() => import('../Pages/Reports/SalesReport'));
const PurchaseReport = lazy(() => import('../Pages/Reports/PurchaseReport'));
const PnlReport = lazy(() => import('../Pages/Reports/PNLReport'));
const Permissionsetting = lazy(() => import('../Pages/Settings/Permissionsetting'));
const SalesSettingsPage = lazy(() => import('../Pages/Settings/SalesSetting'));
const PurchaseSettingsPage = lazy(() => import('../Pages/Settings/Purchasesetting'));
const UserSetting = lazy(() => import('../Pages/Settings/UserSettings'));
const ItemSetting = lazy(() => import('../Pages/Settings/ItemSetting'));
const BillSettings = lazy(() => import('../Pages/Settings/BillSetting'));
const SupportPage = lazy(() => import('../Pages/Account/SupportPage'));
const AdditionalServices = lazy(() => import('../Pages/Account/AdditionalFeatures'));
const ItemReports = lazy(() => import('../Pages/Reports/Items'));
const RestockReportPage = lazy(() => import('../Pages/Reports/RestockReport'));
const TaxReport = lazy(() => import('../Pages/Reports/TaxReport'));
const CustomerReport = lazy(() => import('../Pages/Reports/CustomerReport'));
const PartyLedger = lazy(() => import('../Pages/Reports/PartyLedger'));
const GallaHisaabTool = lazy(() => import('../Pages/Reports/GallaHisaabTool'))
const ItemSoldReport = lazy(() => import('../Pages/Reports/ItemSoldReport'));
const ExpenseReport = lazy(() => import('../Pages/Reports/ExpenseReport'));
import UserReport from '../Pages/Reports/UserReport';
const StockTransferReport = lazy(() => import('../Pages/Reports/StockTransferReport'));

// --- CATALOGUE MODULE IMPORTS ---
const CHome = lazy(() => import('../Catalogue/CatalogueHome'));
const CatalogueAccounts = lazy(() => import('../Catalogue/CatalougeAccount'));
const OrderDetails = lazy(() => import('../Catalogue/Orders'));
const RequestPage = lazy(() => import('../Catalogue/RequestPage'));
const CatalogueReports = lazy(() => import('../Catalogue/CatalogueReports/CatalogueReports'));
const CatalogueSales = lazy(() => import('../Catalogue/CatalogueReports/CatalogueSalesReport'));
const CatalogueProfitLoss = lazy(() => import('../Catalogue/CatalogueReports/CatalogueProfitLossReport'));
const CatalogueItemReport = lazy(() => import('../Catalogue/CatalogueReports/CatalogueItemReport'));
const CatalogueCustomerReport = lazy(() => import('../Catalogue/CatalogueReports/CatalogueCustomerReport'));
const CatalogueUserReport = lazy(() => import('../Catalogue/CatalogueReports/CatalogueUserReport'));
const CatalogueTaxReport = lazy(() => import('../Catalogue/CatalogueReports/CatalogueTaxReport'));
const CatalogueEditProfile = lazy(() => import('../Catalogue/CatalogueEditProfile'));
const CatalogueMasters = lazy(() => import('../Catalogue/Settings/CatalogueMasters'));
const CatalogueSalesSettings = lazy(() => import('../Catalogue/Settings/CatalogueSalesSetting'));
const CatalogueBillSetting = lazy(() => import('../Catalogue/Settings/CatalogueBillSetting'));
const CatalogueUserSetting = lazy(() => import('../Catalogue/Settings/CatalogueUserSetting'));
const CataloguePermissionSetting = lazy(() => import('../Catalogue/Settings/CataloguePermissionSetting'));
const Order = lazy(() => import('../Catalogue/Shop'));
const OrdersReturnPage = lazy(() => import('../Catalogue/OrdersReturn'));
const MyShop = lazy(() => import('../Catalogue/ShopItem'));
const Catasupport = lazy(() => import('../Catalogue/CatalogueSupport/CatalogueSupport'));
const CatlogueItems = lazy(() => import('../Catalogue/CatalogueReports/CatalogueItems')); // catalogue items
const CataloguePartyLedger = lazy(() => import('../Catalogue/CatalogueReports/CataloguePartyLedger')); // catalogue party ledger
const CatlogueManageItems = lazy(() => import('../Catalogue/CatalogueReports/CatalogueManageItems'));
const CatlogueSoldReport = lazy(() => import('../Catalogue/CatalogueReports/CatalogueSoldReport'));
const CatalogueAdditionalServices = lazy(() => import('../Catalogue/CatalogueAdditionalServices'));
const CatalogueExpenseReport = lazy(() => import('../Catalogue/CatalogueReports/CatalogueExpenseReport'));
const CatalogueStockTransferReport = lazy(() => import('../Catalogue/CatalogueReports/CatalogueStockTransferReportPage'));
const PosItemSettingWrapper = (props: any) => (
    <ItemSetting {...props} theme="blue" />
);

const CatalogueItemSettingWrapper = (props: any) => (
    <ItemSetting {...props} theme="orange" />
);
const PosItemAddWrapper = (props: any) => (
    <ItemAdd
        {...props}
        theme="blue"
        routes={{ itemAdd: ROUTES.ITEM_ADD, itemGroup: ROUTES.ITEM_GROUP }}
    />
);

const CatalogueItemAddWrapper = (props: any) => (
    <ItemAdd
        {...props}
        theme="orange"
        routes={{
            itemAdd: `${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`,
            itemGroup: `${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`
        }}
    />
);
const PosItemGroupWrapper = (props: any) => (
    <ItemGroup
        {...props}
        routes={{
            addItem: ROUTES.ITEM_ADD,
            itemGroups: ROUTES.ITEM_GROUP,
        }}
        theme={{
            primaryBg: 'bg-sky-500',
            primaryHoverBg: 'hover:bg-blue-700',
            primaryDisabledBg: 'disabled:bg-blue-300',
            primaryText: 'text-blue-900',
            primaryHoverText: 'hover:text-blue-600',
            primaryBorder: 'border-blue-500',
            focusRing: 'focus:ring-blue-500',
            deleteButtonBg: 'bg-red-500',
            deleteButtonHoverBg: 'hover:bg-red-600',
            editIconText: 'text-blue-600',
            editIconHoverText: 'hover:text-blue-800',
        }}
    />
);

const CatalogueItemGroupWrapper = (props: any) => (
    <ItemGroup
        {...props}
        routes={{
            addItem: `${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`,
            itemGroups: `${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`,
        }}
        theme={{
            primaryBg: 'bg-[#F97316]',
            primaryHoverBg: 'hover:bg-[#ea580c]',
            primaryDisabledBg: 'disabled:bg-[#F97316]/40',
            primaryText: 'text-[#F97316]',
            primaryHoverText: 'hover:text-[#F97316]',
            primaryBorder: 'border-[#F97316]',
            focusRing: 'focus:ring-[#F97316]',
            deleteButtonBg: 'bg-orange-400',
            deleteButtonHoverBg: 'hover:bg-orange-500',
            editIconText: 'text-[#F97316]',
            editIconHoverText: 'hover:text-orange-700',
        }}
    />
);

export interface AppRoute {
    path?: string;
    component: React.ElementType;
    permission: Permissions | Cata_Permissions | null;
    isIndex?: boolean;
}

export interface AppModule {
    id: string;
    name: string;
    layout: 'MAIN' | 'CATALOGUE';
    requiredPlans: string[];
    routes: AppRoute[];
}

export const AppRegistry: AppModule[] = [
    {
        id: 'pos',
        name: 'Point of Sale & Billing',
        layout: 'MAIN',
        requiredPlans: [PLANS.POS_BASIC, PLANS.POS_PRO, PLANS.ENTERPRISE, PLANS.CALC_CATALOG],
        routes: [
            { component: Home, permission: Permissions.ViewDashboard, isIndex: true },
            { path: ROUTES.ACCOUNT.substring(1), component: Account, permission: Permissions.ViewAccount },
            { path: ROUTES.EDIT_PROFILE, component: EditProfile, permission: Permissions.ManageEditProfile },
            { path: ROUTES.JOURNAL.substring(1), component: Journal, permission: Permissions.ViewTransactions },
            { path: ROUTES.MASTERS.substring(1), component: Masters, permission: Permissions.ViewReports },
            { path: ROUTES.SALES, component: Sales, permission: Permissions.CreateSales },
            { path: ROUTES.SALES_RETURN, component: SalesReturn, permission: Permissions.CreateSalesReturn },
            { path: ROUTES.PURCHASE, component: Purchase, permission: Permissions.CreatePurchase },
            { path: ROUTES.PURCHASE_RETURN, component: PurchaseReturn, permission: Permissions.CreatePurchaseReturn },
            { path: ROUTES.PRINTQR, component: PrintQR, permission: Permissions.PrintQR },
            { path: ROUTES.ITEM_ADD, component: PosItemAddWrapper, permission: Permissions.ManageItems },
            { path: ROUTES.ITEM_GROUP, component: PosItemGroupWrapper, permission: Permissions.ManageItemGroup },
            { path: ROUTES.MANAGE_ITEMS, component: ManageItems, permission: Permissions.ManageItemGroup },
            { path: ROUTES.USER_ADD, component: UserAdd, permission: Permissions.CreateUsers },
            { path: ROUTES.REPORTS.substring(1), component: Reports, permission: Permissions.ViewReports },
            { path: ROUTES.ITEM_REPORT, component: ItemReport, permission: Permissions.ViewItemReport },
            { path: ROUTES.SALES_REPORT, component: SalesReport, permission: Permissions.ViewSalesReport },
            { path: ROUTES.PURCHASE_REPORT, component: PurchaseReport, permission: Permissions.ViewPurchaseReport },
            { path: ROUTES.PNL_REPORT, component: PnlReport, permission: Permissions.ViewPNLReport },
            { path: ROUTES.PERMSETTING, component: Permissionsetting, permission: null },
            { path: ROUTES.SALESETTING, component: SalesSettingsPage, permission: null },
            { path: ROUTES.PURCHASESETTING, component: PurchaseSettingsPage, permission: null },
            { path: ROUTES.USERSETTING, component: UserSetting, permission: Permissions.ManageUsers },
            { path: ROUTES.ITEMSETTING, component: PosItemSettingWrapper, permission: null },
            { path: ROUTES.BILLSETTING, component: BillSettings, permission: null },
            { path: ROUTES.SUPPORT_PAGE, component: SupportPage, permission: null },
            { path: ROUTES.ADDITIONAL_FEATURES, component: AdditionalServices, permission: Permissions.ViewItemReport },

            { path: ROUTES.ITEM_REPORTS, component: ItemReports, permission: Permissions.ViewItemReport },
            { path: ROUTES.RESTOCK_REPORT, component: RestockReportPage, permission: Permissions.ViewItemReport },
            { path: ROUTES.TAX_REPORT, component: TaxReport, permission: Permissions.ViewItemReport },
            { path: ROUTES.CUSTOMER_REPORT, component: CustomerReport, permission: Permissions.ViewItemReport },
            { path: ROUTES.PARTY_LEDGER, component: PartyLedger, permission: Permissions.ViewPurchaseReport },
            { path: ROUTES.GALLA_HISAAB_TOOL, component: GallaHisaabTool, permission: Permissions.ViewPurchaseReport },
            { path: ROUTES.ITEM_SOLD_REPORT, component: ItemSoldReport, permission: Permissions.ViewItemReport },
            { path: ROUTES.USER_REPORT, component: UserReport, permission: Permissions.ViewItemReport },
            { path: ROUTES.EXPENSE_REPORT, component: ExpenseReport, permission: Permissions.ViewReports },
            { path: ROUTES.STOCK_TRANSFER, component: StockTransferReport, permission: Permissions.ViewReports },
        ],
    },
    {
        id: 'catalogue',
        name: 'Online Store Catalogue',
        layout: 'CATALOGUE',
        requiredPlans: [PLANS.CALC_CATALOG, PLANS.CATALOGUE_PRO, PLANS.ENTERPRISE],
        routes: [
            { path: ROUTES.CHOME, component: CHome, permission: Cata_Permissions.ViewCatalogueDashboard },
            { path: ROUTES.CATALOGUE_ACCOUNTS, component: CatalogueAccounts, permission: Cata_Permissions.ViewCatalogueAccounts },
            { path: ROUTES.ORDERDETAILS, component: OrderDetails, permission: Cata_Permissions.ViewCatalogueOrders },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`, component: RequestPage, permission: Cata_Permissions.ViewCatalogueRequests },
            { path: `${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`, component: CatalogueItemGroupWrapper, permission: Cata_Permissions.ManageItems },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_REPORTS}`, component: CatalogueReports, permission: Cata_Permissions.ViewReports },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_ITEMS}`, component: CatlogueItems, permission: Cata_Permissions.ViewItemReport },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_PARTY_LEDGER}`, component: CataloguePartyLedger, permission: Cata_Permissions.ViewPartyLedger },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_MANAGE_ITEMS}`, component: CatlogueManageItems, permission: Cata_Permissions.ManageItems },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_SOLD_REPORT}`, component: CatlogueSoldReport, permission: Cata_Permissions.ViewItemSoldReport },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_SALES}`, component: CatalogueSales, permission: Cata_Permissions.ViewSalesReport },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_PNL_REPORT}`, component: CatalogueProfitLoss, permission: Cata_Permissions.ViewPNLReport },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_ITEM_REPORT}`, component: CatalogueItemReport, permission: Cata_Permissions.ViewItemReport },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_CUSTOMER_REPORT}`, component: CatalogueCustomerReport, permission: Cata_Permissions.ViewCustomerReport },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_USER_REPORT}`, component: CatalogueUserReport, permission: Cata_Permissions.ViewUserReport },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_TAX_REPORT}`, component: CatalogueTaxReport, permission: Cata_Permissions.ViewTaxReport },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_EDIT}`, component: CatalogueEditProfile, permission: Cata_Permissions.ManageEditProfile },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_MASTERS}`, component: CatalogueMasters, permission: Cata_Permissions.ManageMasters },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_SALE_SETTING}`, component: CatalogueSalesSettings, permission: Cata_Permissions.ManageSalesSettings },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_BILL_SETTING}`, component: CatalogueBillSetting, permission: Cata_Permissions.ManageBillSettings },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_ITEM_SETTING}`, component: CatalogueItemSettingWrapper, permission: Cata_Permissions.ManageItemSettings },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_USER_SETTING}`, component: CatalogueUserSetting, permission: Cata_Permissions.ManageUserSettings },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_PERMISSION_SETTING}`, component: CataloguePermissionSetting, permission: Cata_Permissions.ManagePermissions },
            { path: `${ROUTES.CHOME}/${ROUTES.ORDER}`, component: Order, permission: Cata_Permissions.ViewShop },
            { path: `${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`, component: OrdersReturnPage, permission: Cata_Permissions.ViewOrdersReturn },
            { path: `${ROUTES.CHOME}/${ROUTES.MYSHOP}/:groupId`, component: MyShop, permission: Cata_Permissions.ViewShopItems },
            { path: `${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`, component: CatalogueItemAddWrapper, permission: Cata_Permissions.ManageItems },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_SUPPORT}`, component: Catasupport, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_ADDITIONAL_SERVICES}`, component: CatalogueAdditionalServices, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_EXPENSE_REPORT}`, component: CatalogueExpenseReport, permission: Cata_Permissions.ViewExpenseReport },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_STOCK_TRANSFER}`, component: CatalogueStockTransferReport, permission: Cata_Permissions.ViewReports },

        ],
    }
];