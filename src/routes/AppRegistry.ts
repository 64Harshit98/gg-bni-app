import { lazy } from 'react';
import { ROUTES } from '../constants/routes.constants';
import { Permissions, PLANS } from '../enums';
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
const WADetails = lazy(() => import('../Pages/Additional/Whatsapp/WADetails'));
const WAVerification = lazy(() => import('../Pages/Additional/Whatsapp/WAVerification'));
const WALanding = lazy(() => import('../Pages/Additional/Whatsapp/WALanding'));
const WAPlan = lazy(() => import('../Pages/Additional/Whatsapp/WAPlan'));
const AdditionalServices = lazy(() => import('../Pages/Account/AdditionalFeatures'));
const ItemReports = lazy(() => import('../Pages/Reports/Items'));
const RestockReportPage = lazy(() => import('../Pages/Reports/RestockReport'));
const TaxReport = lazy(() => import('../Pages/Reports/TaxReport'));
const CustomerReport = lazy(() => import('../Pages/Reports/CustomerReport'));
const PartyLedger = lazy(() => import('../Pages/Reports/PartyLedger'));
const ItemSoldReport = lazy(() => import('../Pages/Reports/ItemSoldReport'));

// --- CATALOGUE MODULE IMPORTS ---
const CHome = lazy(() => import('../Catalogue/CatalogueHome'));
const CatalogueAccounts = lazy(() => import('../Catalogue/CatalougeAccount'));
const OrderDetails = lazy(() => import('../Catalogue/Orders'));
const AddItem = lazy(() => import('../Catalogue/AddItem'));
const RequestPage = lazy(() => import('../Catalogue/RequestPage'));
const CatItemGroup = lazy(() => import('../Catalogue/ItemGroup'));
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
const CatalogueItemSetting = lazy(() => import('../Catalogue/Settings/CatalogueItemSetting'));
const CatalogueUserSetting = lazy(() => import('../Catalogue/Settings/CatalogueUserSetting'));
const CataloguePermissionSetting = lazy(() => import('../Catalogue/Settings/CataloguePermissionSetting'));
const Order = lazy(() => import('../Catalogue/Shop'));
const OrdersReturnPage = lazy(() => import('../Catalogue/OrdersReturn'));
const MyShop = lazy(() => import('../Catalogue/ShopItem'));
const Catasupport = lazy(() => import('../Catalogue/CatalogueSupport/CatalogueSupport'));

export interface AppRoute {
    path?: string;
    component: React.ElementType;
    permission: Permissions | null;
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
        requiredPlans: [PLANS.POS_BASIC, PLANS.POS_PRO, PLANS.ENTERPRISE],
        routes: [
            { component: Home, permission: Permissions.ViewDashboard, isIndex: true },
            { path: ROUTES.ACCOUNT.substring(1), component: Account, permission: Permissions.ManageEditProfile },
            { path: ROUTES.EDIT_PROFILE, component: EditProfile, permission: Permissions.ManageEditProfile },
            { path: ROUTES.JOURNAL.substring(1), component: Journal, permission: Permissions.ViewTransactions },
            { path: ROUTES.MASTERS.substring(1), component: Masters, permission: Permissions.ManageUsers },
            { path: ROUTES.SALES, component: Sales, permission: Permissions.CreateSales },
            { path: ROUTES.SALES_RETURN, component: SalesReturn, permission: Permissions.CreateSalesReturn },
            { path: ROUTES.PURCHASE, component: Purchase, permission: Permissions.CreatePurchase },
            { path: ROUTES.PURCHASE_RETURN, component: PurchaseReturn, permission: Permissions.CreatePurchaseReturn },
            { path: ROUTES.PRINTQR, component: PrintQR, permission: Permissions.PrintQR },
            { path: ROUTES.ITEM_ADD, component: ItemAdd, permission: Permissions.ManageItems },
            { path: ROUTES.ITEM_GROUP, component: ItemGroup, permission: Permissions.ManageItemGroup },
            { path: ROUTES.MANAGE_ITEMS, component: ManageItems, permission: Permissions.ManageItemGroup },
            { path: ROUTES.USER_ADD, component: UserAdd, permission: Permissions.CreateUsers },
            { path: ROUTES.REPORTS.substring(1), component: Reports, permission: Permissions.ViewItemReport },
            { path: ROUTES.ITEM_REPORT, component: ItemReport, permission: Permissions.ViewItemReport },
            { path: ROUTES.SALES_REPORT, component: SalesReport, permission: Permissions.ViewSalesReport },
            { path: ROUTES.PURCHASE_REPORT, component: PurchaseReport, permission: Permissions.ViewPurchaseReport },
            { path: ROUTES.PNL_REPORT, component: PnlReport, permission: Permissions.ViewPNLReport },
            { path: ROUTES.PERMSETTING, component: Permissionsetting, permission: null },
            { path: ROUTES.SALESETTING, component: SalesSettingsPage, permission: null },
            { path: ROUTES.PURCHASESETTING, component: PurchaseSettingsPage, permission: null },
            { path: ROUTES.USERSETTING, component: UserSetting, permission: null },
            { path: ROUTES.ITEMSETTING, component: ItemSetting, permission: null },
            { path: ROUTES.BILLSETTING, component: BillSettings, permission: null },
            { path: ROUTES.SUPPORT_PAGE, component: SupportPage, permission: null },
            { path: ROUTES.WHATSAPP_DETAILS, component: WADetails, permission: Permissions.ViewItemReport },
            { path: ROUTES.WHATSAPP_VERIFICATION, component: WAVerification, permission: Permissions.ViewItemReport },
            { path: ROUTES.WHATSAPP_LANDING, component: WALanding, permission: Permissions.ViewItemReport },
            { path: ROUTES.WHATSAPP_PLAN, component: WAPlan, permission: Permissions.ViewItemReport },
            { path: ROUTES.ADDITIONAL_FEATURES, component: AdditionalServices, permission: Permissions.ViewItemReport },

            { path: ROUTES.ITEM_REPORTS, component: ItemReports, permission: Permissions.ViewItemReport },
            { path: ROUTES.RESTOCK_REPORT, component: RestockReportPage, permission: Permissions.ViewItemReport },
            { path: ROUTES.TAX_REPORT, component: TaxReport, permission: Permissions.ViewItemReport },
            { path: ROUTES.CUSTOMER_REPORT, component: CustomerReport, permission: Permissions.ViewItemReport },
            { path: ROUTES.PARTY_LEDGER, component: PartyLedger, permission: Permissions.ViewPurchaseReport },
            { path: ROUTES.ITEM_SOLD_REPORT, component: ItemSoldReport, permission: Permissions.ViewItemReport },
        ],
    },
    {
        id: 'catalogue',
        name: 'Online Store Catalogue',
        layout: 'CATALOGUE',
        requiredPlans: [PLANS.CATALOGUE_BASIC, PLANS.CATALOGUE_PRO, PLANS.ENTERPRISE],
        routes: [
            { path: ROUTES.CHOME, component: CHome, permission: null },
            { path: ROUTES.CATALOGUE_ACCOUNTS, component: CatalogueAccounts, permission: null },
            { path: ROUTES.ORDERDETAILS, component: OrderDetails, permission: null },
            { path: ROUTES.ADD_PRODUCT, component: AddItem, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`, component: RequestPage, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CAT_ITEM_GROUP}`, component: CatItemGroup, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_REPORTS}`, component: CatalogueReports, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_SALES}`, component: CatalogueSales, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_PNL_REPORT}`, component: CatalogueProfitLoss, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_ITEM_REPORT}`, component: CatalogueItemReport, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_CUSTOMER_REPORT}`, component: CatalogueCustomerReport, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_USER_REPORT}`, component: CatalogueUserReport, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATALOGUE_TAX_REPORT}`, component: CatalogueTaxReport, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_EDIT}`, component: CatalogueEditProfile, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_MASTERS}`, component: CatalogueMasters, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_SALE_SETTING}`, component: CatalogueSalesSettings, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_BILL_SETTING}`, component: CatalogueBillSetting, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_ITEM_SETTING}`, component: CatalogueItemSetting, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_USER_SETTING}`, component: CatalogueUserSetting, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_PERMISSION_SETTING}`, component: CataloguePermissionSetting, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.ORDER}`, component: Order, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.ORDER_RETURN}`, component: OrdersReturnPage, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.MYSHOP}/:groupId`, component: MyShop, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.ADD_PRODUCT}`, component: AddItem, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_REQUEST}`, component: RequestPage, permission: null },
            { path: `${ROUTES.CHOME}/${ROUTES.CATA_SUPPORT}`, component: Catasupport, permission: null },

        ],
    }
];