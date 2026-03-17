import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import MainLayout from '../app/MainLayout';
import CatalogueLayout from '../app/CatalougeLayout';
import { ROUTES } from '../constants/routes.constants';
import { AuthProvider } from '../context/AuthContext';
import PermissionWrapper from '../context/PermissionWrapper';
import { Permissions } from '../enums';
import { RequireSubscription } from '../UseComponents/RequiredSubscription';
import LeadsPage from '../Pages/Reports/LeadPage';
import Loading from '../Pages/Loading/Loading';
import GlobalError from '../Components/GlobalError';
import OrdersReturnPage from '../Catalogue/OrdersReturn';
import CatalogueSalesSettings from '../Catalogue/Settings/CatalogueSalesSetting';
import CatalogueMasters from '../Catalogue/Settings/CatalogueMasters';
import CatalogueBillSetting from '../Catalogue/Settings/CatalogueBillSetting';
import CatalogueItemSetting from '../Catalogue/Settings/CatalogueItemSetting';
import CatalogueUserSetting from '../Catalogue/Settings/CatalogueUserSetting';
import CataloguePermissionSetting from '../Catalogue/Settings/CataloguePermissionSetting';
import CatalogueEditProfile from '../Catalogue/CatalogueEditProfile';
import RequestPage from '../Catalogue/RequestPage';
import CatalogueItemReport from '../Catalogue/CatalogueReports/CatalogueItemReport';
import CatalogueCustomerReport from '../Catalogue/CatalogueReports/CatalogueCustomerReport';
import CatalogueUserReport from '../Catalogue/CatalogueReports/CatalogueUserReport';
import CatalogueTaxReport from '../Catalogue/CatalogueReports/CatalogueTaxReport';
import CatalogueRegistration3 from '../Catalogue/Registration/CatalogueRegistration3';
import CatalogueRegistration2 from '../Catalogue/Registration/CatalogueRegistration2';
import WebsiteLeads from '../Pages/Account/WebsiteLeads';
// import SharedProduct from '../Catalogue/SharedProduct';

const WebsiteLeadsDashboard = lazy(() => import('../Pages/Account/WebsiteLeads'));
const Home = lazy(() => import('../Pages/Home'));
const Account = lazy(() => import('../Pages/Account'));
const Journal = lazy(() => import('../Pages/Journal'));
const Reports = lazy(() => import('../Pages/Reports'));
const Masters = lazy(() => import('../Pages/Masters'));
const Sales = lazy(() => import('../Pages/Master/Sales'));
const SalesReturn = lazy(() => import('../Pages/Master/SalesReturn'));
const Purchase = lazy(() => import('../Pages/Master/Purchase'));
const PurchaseReturn = lazy(() => import('../Pages/Master/PurchaseReturn'));
const ItemAdd = lazy(() => import('../Pages/Master/ItemAdd'));
const CartPage = lazy(() => import('../Catalogue/CheckOut'))
const ItemGroup = lazy(() => import('../Pages/Master/ItemGroup'));
const UserAdd = lazy(() => import('../Pages/Master/UserAdd'));
const Landing = lazy(() => import('../Pages/Auth/Landing'));
const Signup = lazy(() => import('../Pages/Auth/Signup'));
const EditProfile = lazy(() => import('../Pages/Account/EditProfile'));
const ShopSetup2 = lazy(() => import('../Pages/Auth/ShopSetup2'));
const ItemReport = lazy(() => import('../Pages/Reports/ItemReport'));
const SalesReport = lazy(() => import('../Pages/Reports/SalesReport'));
const PurchaseReport = lazy(() => import('../Pages/Reports/PurchaseReport'));
const PnlReport = lazy(() => import('../Pages/Reports/PNLReport'));
const BusInfo = lazy(() => import('../Pages/Auth/BusInfo'));
const Shopsetup = lazy(() => import('../Pages/Auth/ShopSetup'));
const PrintQR = lazy(() => import('../Pages/Master/PrintQR'));
const Permissionsetting = lazy(
  () => import('../Pages/Settings/Permissionsetting'),
);
const UnauthorizedPage = lazy(() => import('../Pages/Unauthorized'));
const SalesSettingsPage = lazy(() => import('../Pages/Settings/SalesSetting'));
const PurchaseSettingsPage = lazy(
  () => import('../Pages/Settings/Purchasesetting'),
);
const CHome = lazy(() => import('../Catalogue/CatalogueHome'));
const MyShop = lazy(() => import('../Catalogue/ShopItem'));
const UserSetting = lazy(() => import('../Pages/Settings/UserSettings'));
const ItemSetting = lazy(() => import('../Pages/Settings/ItemSetting'));
const Order = lazy(() => import('../Catalogue/Shop'));
const OrderDetails = lazy(() => import('../Catalogue/Orders'));
const Catalogue = lazy(() => import('../Catalogue/SharedCatalouge'));
const SharedProduct = lazy(() => import('../Catalogue/SharedProduct'));
const CatalogueAccounts = lazy(() => import('../Catalogue/CatalougeAccount'));
const CatItemGroup = lazy(() => import('../Catalogue/ItemGroup'));
const AddItem = lazy(() => import('../Catalogue/AddItem'));
const CatalogueReports = lazy(() => import('../Catalogue/CatalogueReports/CatalogueReports'));
const CatalogueSales = lazy(() => import('../Catalogue/CatalogueReports/CatalogueSalesReport'));
const CatalogueProfitLoss = lazy(() => import('../Catalogue/CatalogueReports/CatalogueProfitLossReport'));
const SuperAdminCompanies = lazy(() => import('../Pages/Account/SuperAdmin'));
const SubscriptionPage = lazy(
  () => import('../Pages/Account/SubscriptionPage'),
);
const SupportPage = lazy(() => import('../Pages/Account/SupportPage'));
const ForgotPasswordPage = lazy(() => import('../Pages/Auth/ForgotPassword'));
const ResetPasswordPage = lazy(() => import('../Pages/Auth/ResetPassword'));
const RestockReportPage = lazy(() => import('../Pages/Reports/RestockReport'));
const TaxReport = lazy(() => import('../Pages/Reports/TaxReport'));
const CustomerReport = lazy(() => import('../Pages/Reports/CustomerReport'));
const DownloadBill = lazy(() => import('../Pages/Auth/DownloadBill'));
const BillSettings = lazy(() => import('../Pages/Settings/BillSetting'));
const AdditionalServices = lazy(() => import('../Pages/Account/AdditionalFeatures'));
const WAVerification = lazy(() => import('../Pages/Additional/Whatsapp/WAVerification'));
const WADetails = lazy(() => import('../Pages/Additional/Whatsapp/WADetails'));
const WALanding = lazy(() => import('../Pages/Additional/Whatsapp/WALanding'));
const WAPlan = lazy(() => import('../Pages/Additional/Whatsapp/WAPlan'));
const ItemSoldReport = lazy(() => import('../Pages/Reports/ItemSoldReport'));
const ItemReports = lazy(() => import('../Pages/Reports/Items'));
const ManageItems = lazy(() => import('../Pages/Master/ManageItems'));
const PartyLedger = lazy(() => import('../Pages/Reports/PartyLedger'));

const router = createBrowserRouter([
  {
    element: <PermissionWrapper />,
    errorElement: <GlobalError />,
    children: [
      {
        children: [
          {
            path: ROUTES.LANDING,
            element: <Landing />,
            handle: { isPublic: true },
          },
          {
            path: '/download-bill/:companyId/:invoiceId',
            element: <DownloadBill />,
            handle: { isPublic: true },
          },
          {
            path: '/super-admin',
            element: <SuperAdminCompanies />,
          },
          {
            path: ROUTES.SIGNUP,
            element: <Signup />,
            handle: { isPublic: true },
          },
          {
            path: ROUTES.BUSINESS_INFO,
            element: <BusInfo />,
            handle: { isPublic: true },
          },
          {
            path: ROUTES.SHOP_SETUP,
            element: <Shopsetup />,
            handle: { isPublic: true },
          },
          {
            path: ROUTES.SHOP_SETUP2,
            element: <ShopSetup2 />,
            handle: { isPublic: true },
          },
          {
            path: ROUTES.FORGOT_PASSWORD,
            element: <ForgotPasswordPage />,
            handle: { isPublic: true },
          },
          {
            path: ROUTES.RESET_PASSWORD,
            element: <ResetPasswordPage />,
            handle: { isPublic: true },
          },
          {
            path: ROUTES.SUBSCRIPTION_PAGE,
            element: <SubscriptionPage />,
            handle: { isPublic: false },
          },
        ],
      },
      {
        element: <RequireSubscription />, // 2. Checks Subscription Status
        children: [
          {
            path: ROUTES.HOME,
            element: <MainLayout />,
            handle: { requiredPermission: Permissions.ViewDashboard },
            children: [
              {
                index: true,
                element: <Home />,
                handle: { requiredPermission: Permissions.ViewDashboard },
              },
              {
                path: ROUTES.ACCOUNT.substring(1),
                element: <Account />,
                handle: { requiredPermission: Permissions.ManageEditProfile },
              },
              {
                path: ROUTES.EDIT_PROFILE,
                element: <EditProfile />,
                handle: { requiredPermission: Permissions.ManageEditProfile },
              },
              {
                path: ROUTES.JOURNAL.substring(1),
                element: <Journal />,
                handle: { requiredPermission: Permissions.ViewTransactions },
              },
              {
                path: ROUTES.MASTERS.substring(1),
                element: <Masters />,
                handle: { requiredPermission: Permissions.ManageUsers },
              },
              {
                path: ROUTES.SALES,
                element: <Sales />,
                handle: { requiredPermission: Permissions.CreateSales },
              },
              {
                path: ROUTES.SALES_RETURN,
                element: <SalesReturn />,
                handle: { requiredPermission: Permissions.CreateSalesReturn },
              },
              {
                path: ROUTES.PURCHASE,
                element: <Purchase />,
                handle: { requiredPermission: Permissions.CreatePurchase },
              },
              {
                path: ROUTES.PURCHASE_RETURN,
                element: <PurchaseReturn />,
                handle: {
                  requiredPermission: Permissions.CreatePurchaseReturn,
                },
              },
              {
                path: ROUTES.PRINTQR,
                element: <PrintQR />,
                handle: { requiredPermission: Permissions.PrintQR },
              },
              {
                path: ROUTES.ITEM_ADD,
                element: <ItemAdd />,
                handle: { requiredPermission: Permissions.ManageItems },
              },
              {
                path: ROUTES.ITEM_GROUP,
                element: <ItemGroup />,
                handle: { requiredPermission: Permissions.ManageItemGroup },
              },
              {
                path: ROUTES.MANAGE_ITEMS,
                element: <ManageItems />,
                handle: { requiredPermission: Permissions.ManageItemGroup },
              },
              {
                path: ROUTES.USER_ADD,
                element: <UserAdd />,
                handle: { requiredPermission: Permissions.CreateUsers },
              },
              {
                path: ROUTES.WHATSAPP_DETAILS,
                element: <WADetails />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.WHATSAPP_VERIFICATION,
                element: <WAVerification />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.WHATSAPP_LANDING,
                element: <WALanding />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.WHATSAPP_PLAN,
                element: <WAPlan />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: 'website-leads', // Access this via yourdomain.com/website-leads
                element: <WebsiteLeads />,
                handle: { requiredPermission: Permissions.ViewDashboard }, // Keeping it accessible to those who see the dashboard
              },
              {
                path: ROUTES.ADDITIONAL_FEATURES,
                element: <AdditionalServices />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.REPORTS.substring(1),
                element: <Reports />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.ITEM_REPORTS,
                element: <ItemReports />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.ITEM_SOLD_REPORT,
                element: <ItemSoldReport />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.ITEM_REPORT,
                element: <ItemReport />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.RESTOCK_REPORT,
                element: <RestockReportPage />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.TAX_REPORT,
                element: <TaxReport />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.CUSTOMER_REPORT,
                element: <CustomerReport />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: "/leads",
                element: <LeadsPage />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.SALES_REPORT,
                element: <SalesReport />,
                handle: { requiredPermission: Permissions.ViewSalesReport },
              },
              {
                path: ROUTES.PURCHASE_REPORT,
                element: <PurchaseReport />,
                handle: { requiredPermission: Permissions.ViewPurchaseReport },
              },
              {
                path: ROUTES.PARTY_LEDGER,
                element: <PartyLedger />,
                handle: { requiredPermission: Permissions.ViewPurchaseReport },
              },
              {
                path: ROUTES.PNL_REPORT,
                element: <PnlReport />,
                handle: { requiredPermission: Permissions.ViewPNLReport },
              },
              {
                path: ROUTES.PERMSETTING,
                element: <Permissionsetting />,
                handle: { requiredPermission: null },
              },
              {
                path: ROUTES.SALESETTING,
                element: <SalesSettingsPage />,
                handle: { requiredPermission: null },
              },
              {
                path: ROUTES.PURCHASESETTING,
                element: <PurchaseSettingsPage />,
                handle: { requiredPermission: null },
              },
              {
                path: ROUTES.USERSETTING,
                element: <UserSetting />,
                handle: { requiredPermission: null },
              },
              {
                path: ROUTES.ITEMSETTING,
                element: <ItemSetting />,
                handle: { requiredPermission: null },
              },
              {
                path: ROUTES.BILLSETTING,
                element: <BillSettings />,
                handle: { requiredPermission: null },
              },
              {
                path: ROUTES.SUPPORT_PAGE,
                element: <SupportPage />,
                handle: { requiredPermission: null },
              },
            ],
          },
        ],
      },
      {
        path: ROUTES.CHOME,
        element: <CatalogueLayout />,
        handle: { requiredPermission: null },
        children: [
          {
            index: true,
            element: <CHome />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATALOGUE_ACCOUNTS,
            element: <CatalogueAccounts />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATA_REGISTER,
            element: <CatalogueRegistration3 />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATA_COMINGSOON,
            element: <CatalogueRegistration2 />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.ORDERDETAILS,
            element: <OrderDetails />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.ADD_PRODUCT,
            element: <AddItem />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATA_REQUEST,
            element: <RequestPage />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CAT_ITEM_GROUP,
            element: <CatItemGroup />,
            handle: { requiredPermission: null },
          },
          {
            path: `${ROUTES.MYSHOP}/:groupId`,
            element: <MyShop />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.ORDER,
            element: <Order />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.ORDER_RETURN,
            element: <OrdersReturnPage />
          },
          {
            path: ROUTES.CATALOGUE_REPORTS,
            element: <CatalogueReports />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATALOGUE_SALES,
            element: <CatalogueSales />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATALOGUE_PNL_REPORT,
            element: <CatalogueProfitLoss />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATALOGUE_ITEM_REPORT,
            element: <CatalogueItemReport />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATALOGUE_CUSTOMER_REPORT,
            element: <CatalogueCustomerReport />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATALOGUE_USER_REPORT,
            element: <CatalogueUserReport />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATALOGUE_TAX_REPORT,
            element: <CatalogueTaxReport />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATA_EDIT,
            element: <CatalogueEditProfile />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATA_MASTERS,
            element: <CatalogueMasters />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATA_SALE_SETTING,
            element: <CatalogueSalesSettings />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATA_BILL_SETTING,
            element: <CatalogueBillSetting />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATA_ITEM_SETTING,
            element: <CatalogueItemSetting />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATA_USER_SETTING,
            element: <CatalogueUserSetting />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.CATA_PERMISSION_SETTING,
            element: <CataloguePermissionSetting />,
            handle: { requiredPermission: null },
          },
        ],
      },
      {
        path: `/product/:companyId/:groupId`,
        element: <SharedProduct />,
        handle: { requiredPermission: null },
      },
      {
        path: `/catalogue/:companyId`,
        element: <Catalogue />,
        handle: { requiredPermission: null },
      },
      {
        path: `/checkout/:companyId`,
        element: <CartPage />,
        handle: { requiredPermission: null }
      },
      {
        path: ROUTES.UNAUTHORIZED,
        element: <UnauthorizedPage />,
      },
    ],
  },
]);
const AppRouter: React.FC = () => {
  return (
    <AuthProvider>
      <Suspense fallback={<Loading />}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  );
};

export default AppRouter;