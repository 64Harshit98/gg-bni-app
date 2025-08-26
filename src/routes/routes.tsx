import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import MainLayout from '../app/MainLayout';
import { ROUTES } from '../constants/routes.constants';
import { AuthProvider } from '../context/Authcontext'; // Import AuthProvider
import ProtectedRoute from '../constants/ProtectedRoutes';
import PermissionWrapper from '../context/PermissionWrapper';
import { Permissions } from '../enums';

import Loading from '../Pages/Loading/Loading';
// Lazy load all the page components
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
const Payment = lazy(() => import('../Pages/Master/Payment'));
const Permissionsetting = lazy(() => import('../Pages/Settings/Permissionsetting'))
const UnauthorizedPage = lazy(() => import('../Pages/Unauthorized'))
const router = createBrowserRouter([
  {
    path: ROUTES.HOME,
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: (
          <PermissionWrapper requiredPermission={Permissions.ViewDashboard}>
            <Home />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.ACCOUNT.substring(1),
        element: (
          <PermissionWrapper requiredPermission={Permissions.ManageEditProfile}>
            <Account />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.EDIT_PROFILE,
        element: (
          <PermissionWrapper requiredPermission={Permissions.ManageEditProfile}>
            <EditProfile />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.JOURNAL.substring(1),
        element: (
          <PermissionWrapper requiredPermission={Permissions.ViewTransactions}>
            <Journal />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.MASTERS.substring(1),
        element: (
          <PermissionWrapper requiredPermission={Permissions.ManageUsers}>
            <Masters />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.SALES,
        element: (
          <PermissionWrapper requiredPermission={Permissions.CreateSales}>
            <Sales />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.SALES_RETURN,
        element: (
          <PermissionWrapper requiredPermission={Permissions.CreateSalesReturn}>
            <SalesReturn />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.PURCHASE,
        element: (
          <PermissionWrapper requiredPermission={Permissions.CreatePurchase}>
            <Purchase />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.PURCHASE_RETURN,
        element: (
          <PermissionWrapper requiredPermission={Permissions.CreatePurchaseReturn}>
            <PurchaseReturn />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.PAYMENT,
        element: (
          <PermissionWrapper requiredPermission={Permissions.ManagePayments}>
            <Payment />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.ITEM_ADD,
        element: (
          <PermissionWrapper requiredPermission={Permissions.ManageItems}>
            <ItemAdd />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.ITEM_GROUP,
        element: (
          <PermissionWrapper requiredPermission={Permissions.ManageItemGroup}>
            <ItemGroup />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.USER_ADD,
        element: (
          <PermissionWrapper requiredPermission={Permissions.CreateUsers}>
            <UserAdd />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.REPORTS.substring(1),
        element: (
          <PermissionWrapper requiredPermission={Permissions.ViewItemReport}>
            <Reports />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.ITEM_REPORT,
        element: (
          <PermissionWrapper requiredPermission={Permissions.ViewItemReport}>
            <ItemReport />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.SALES_REPORT,
        element: (
          <PermissionWrapper requiredPermission={Permissions.ViewSalesReport}>
            <SalesReport />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.PURCHASE_REPORT,
        element: (
          <PermissionWrapper requiredPermission={Permissions.ViewPurchaseReport}>
            <PurchaseReport />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.PNL_REPORT,
        element: (
          <PermissionWrapper requiredPermission={Permissions.ViewPNLReport}>
            <PnlReport />
          </PermissionWrapper>
        ),
      },
      {
        path: ROUTES.PERMSETTING,
        element: (
          <PermissionWrapper requiredPermission={Permissions.SetPermissions}>
            <Permissionsetting />
          </PermissionWrapper>
        ),
      },
    ],
  },
  {
    path: ROUTES.UNAUTHORIZED,
    element: <UnauthorizedPage />,
  },
  {
    path: ROUTES.LANDING,
    element: <Landing />,
  },
  {
    path: ROUTES.SIGNUP,
    element: <Signup />,
  },
  {
    path: ROUTES.BUSINESS_INFO,
    element: <BusInfo />,
  },
  {
    path: ROUTES.BUSINESS_ADDRESS,
    element: <BusAddress />,
  },
  {
    path: ROUTES.LOGIN,
    element: <Login />,
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
