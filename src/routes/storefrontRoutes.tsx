import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import GlobalError from '../Components/GlobalError';
import RootLayout from './RootLayout';

// Router for the public storefront on a merchant subdomain (<sub>.sellar.in).
// Lives apart from routes.tsx on purpose: that file statically pulls in the
// admin layouts, guards and app registry, none of which a buyer needs.
const StorePage = lazy(() => import('../Catalogue/storefront/StorePage'));
const CategoryPage = lazy(() => import('../Catalogue/storefront/CategoryPage'));
const CartPage = lazy(() => import('../Catalogue/CheckOut'));

export const storefrontRouter = createBrowserRouter([
  {
    path: '/',
    errorElement: <GlobalError />,
    element: <RootLayout />,
    children: [
      { index: true, element: <StorePage />, handle: { isPublic: true } },
      { path: 'checkout', element: <CartPage />, handle: { isPublic: true } },
      { path: ':groupId', element: <CategoryPage />, handle: { isPublic: true } },
      { path: ':groupId/:itemSlug', element: <CategoryPage />, handle: { isPublic: true } },
      { path: '*', element: <StorePage /> },
    ],
  },
]);
