import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import MainLayout from '../app/MainLayout';
import { ROUTES } from '../constants/routes.constants';
import { AuthProvider } from '../context/Authcontext'; // Import AuthProvider
import ProtectedRoute from '../constants/ProtectedRoutes';

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

const router = createBrowserRouter([
  {
    path: ROUTES.HOME,
    element: (
      <ProtectedRoute>
        <MainLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <Home /> },
      {
        path: ROUTES.ACCOUNT.substring(1),
        element: <Account />,
        children: [{ path: ROUTES.EDIT_PROFILE, element: <EditProfile /> }],
      },

      { path: ROUTES.JOURNAL.substring(1), element: <Journal /> },
      {
        path: ROUTES.MASTERS.substring(1),
        element: <Masters />,
        children: [
          { path: ROUTES.SALES, element: <Sales /> },
          { path: ROUTES.SALES_RETURN, element: <SalesReturn /> },
          { path: ROUTES.PURCHASE, element: <Purchase /> },
          { path: ROUTES.PURCHASE_RETURN, element: <PurchaseReturn /> },
          { path: ROUTES.ITEM_ADD, element: <ItemAdd /> },
          { path: ROUTES.ITEM_GROUP, element: <ItemGroup /> },
          { path: ROUTES.USER_ADD, element: <UserAdd /> },
        ],
      },
      {
        path: ROUTES.REPORTS.substring(1),
        element: <Reports />,
        children: [
          { index: true, element: <Reports /> },
          { path: ROUTES.ITEM_REPORT, element: <ItemReport /> },
          { path: ROUTES.SALES_REPORT, element: <SalesReport /> },
          { path: ROUTES.PURCHASE_REPORT, element: <PurchaseReport /> },
          { path: ROUTES.PNL_REPORT, element: <PnlReport /> },
        ],
      },
    ],
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
