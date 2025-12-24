import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import MainLayout from '../app/MainLayout';
import CatalogueLayout from '../app/CatalougeLayout';
import { ROUTES } from '../constants/routes.constants';
import { AuthProvider } from '../context/AuthContext';
import PermissionWrapper from '../context/PermissionWrapper';
import { Permissions } from '../enums';
import { RequireSubscription } from '../UseComponents/RequiredSubscription';

import Loading from '../Pages/Loading/Loading';
import GlobalError from '../Components/GlobalError';

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
const Permissionsetting = lazy(() => import('../Pages/Settings/Permissionsetting'));
const UnauthorizedPage = lazy(() => import('../Pages/Unauthorized'));
const SalesSettingsPage = lazy(() => import('../Pages/Settings/SalesSetting'));
const PurchaseSettingsPage = lazy(() => import('../Pages/Settings/Purchasesetting'));
const History = lazy(() => import('../UseComponents/historypage'));
const CHome = lazy(() => import('../Catalogue/CatalogueHome'));
const MyShop = lazy(() => import('../Catalogue/MyShop'));
const UserSetting = lazy(() => import('../Pages/Settings/UserSettings'));
const ItemSetting = lazy(() => import('../Pages/Settings/ItemSetting'));
const Order = lazy(() => import('../Catalogue/OrderingPage'));
const OrderDetails = lazy(() => import('../Catalogue/Orders'));
const Catalogue = lazy(() => import('../Catalogue/SharedCatalouge'));
const CatalogueAccounts = lazy(() => import('../Catalogue/CatalougeAccount'));
const CatalogueReports = lazy(() => import('../Catalogue/CatalogueReports/CatalogueReports'));
const CatalogueSales = lazy(() => import('../Catalogue/CatalogueReports/CatalogueSalesReport'));
const SuperAdminCompanies = lazy(() => import('../Pages/Account/SuperAdmin'));
const SubscriptionPage = lazy(() => import('../Pages/Account/SubscriptionPage'));
const SupportPage = lazy(() => import('../Pages/Account/SupportPage'));
const ForgotPasswordPage = lazy(() => import('../Pages/Auth/ForgotPassword'));
const ResetPasswordPage = lazy(() => import('../Pages/Auth/ResetPassword'));


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
            path: "/super-admin",
            element: <SuperAdminCompanies />
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
                handle: { requiredPermission: Permissions.CreatePurchaseReturn },
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
                path: ROUTES.USER_ADD,
                element: <UserAdd />,
                handle: { requiredPermission: Permissions.CreateUsers },
              },
              {
                path: ROUTES.REPORTS.substring(1),
                element: <Reports />,
                handle: { requiredPermission: Permissions.ViewItemReport },
              },
              {
                path: ROUTES.ITEM_REPORT,
                element: <ItemReport />,
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
                path: ROUTES.HISTORY,
                element: <History />,
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
            path: ROUTES.ORDERDETAILS,
            element: <OrderDetails />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.MYSHOP,
            element: <MyShop />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.ORDER,
            element: <Order />,
            handle: { requiredPermission: null },
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
        ],
      },
      {
        path: `/catalogue/:companyId`,
        element: <Catalogue />,
        handle: { requiredPermission: null },
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
