import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import MainLayout from '../app/MainLayout';
import { ROUTES } from '../constants/routes.constants';
import { AuthProvider } from '../context/Authcontext';
import PermissionWrapper from '../context/PermissionWrapper';
import { Permissions } from '../enums';

import Loading from '../Pages/Loading/Loading';

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
const Login = lazy(() => import('../Pages/Auth/Login'));
const ItemReport = lazy(() => import('../Pages/Reports/ItemReport'));
const SalesReport = lazy(() => import('../Pages/Reports/SalesReport'));
const PurchaseReport = lazy(() => import('../Pages/Reports/PurchaseReport'));
const PnlReport = lazy(() => import('../Pages/Reports/PNLReport'));
const BusInfo = lazy(() => import('../Pages/Auth/BusInfo'));
const BusAddress = lazy(() => import('../Pages/Auth/BusAddress'));
const PrintQR = lazy(() => import('../Pages/Master/PrintQR'));
const Permissionsetting = lazy(() => import('../Pages/Settings/Permissionsetting'));
const UnauthorizedPage = lazy(() => import('../Pages/Unauthorized'));
const SalesSettingsPage = lazy(() => import('../Pages/Settings/SalesSetting'));
const PurchaseSettingsPage = lazy(() => import('../Pages/Settings/Purchasesetting'));
const History = lazy(() => import('../UseComponents/historypage'));
const CHome = lazy(() => import('../Catalogue/CHome'));
const MyShop = lazy(() => import('../Catalogue/MyShop'));
const UserSetting = lazy(() => import('../Pages/Settings/UserSettings'));
const ItemSetting = lazy(() => import('../Pages/Settings/ItemSetting'));

const router = createBrowserRouter([
  {
    element: <PermissionWrapper />,
    children: [
      {
        children: [
          {
            path: ROUTES.LANDING,
            element: <Landing />,
            handle: { isPublic: true },
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
            path: ROUTES.BUSINESS_ADDRESS,
            element: <BusAddress />,
            handle: { isPublic: true },
          },
          {
            path: ROUTES.LOGIN,
            element: <Login />,
            handle: { isPublic: true },
          },
        ],
      },
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
            handle: { requiredPermission: Permissions.ManagePayments },
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
            handle: { requiredPermission: Permissions.SetPermissions },
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
            path: ROUTES.CHOME,
            element: <CHome />,
            handle: { requiredPermission: null },
          },
          {
            path: ROUTES.MYSHOP,
            element: <MyShop />,
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
        ],
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
