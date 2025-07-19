import { createBrowserRouter } from 'react-router-dom';
import MainLayout from '../app/MainLayout';
import Home from '../Pages/Home';
import Account from '../Pages/Account';
import Journal from '../Pages/Journal';
import Reports from '../Pages/Reports';
import Sales from '../Pages/Master/Sales';
import SalesReturn from '../Pages/Master/SalesReturn';
import Purchase from '../Pages/Master/Purchase';
import PurchaseReturn from '../Pages/Master/PurchaseReturn';
import ItemAdd from '../Pages/Master/ItemAdd';
import ItemGroup from '../Pages/Master/ItemGroup';
import UserAdd from '../Pages/Master/UserAdd';
import Masters from '../Pages/Masters';
import Payment from '../Pages/Master/Payment'; // Import the Payment component

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'account', element: <Account /> },
      { path: 'journal', element: <Journal /> },
      {
        path: 'masters',
        element: <Masters />,
        children: [
          { path: 'sales-page-1', element: <Sales /> },
          { path: 'sales-return-1', element: <SalesReturn /> },
          { path: 'purchase-page-1', element: <Purchase /> },
          { path: 'purchase-return-1', element: <PurchaseReturn /> },
          { path: 'item-add', element: <ItemAdd /> },
          { path: 'item-group', element: <ItemGroup /> },
          { path: 'user-add', element: <UserAdd /> },
        ],
      },
      { path: '/payment', element: <Payment />},
      { path: 'reports', element: <Reports /> },
    ],
  },
]);

export default router;
