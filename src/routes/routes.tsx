import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router-dom';
import MainLayout from '../app/MainLayout';
import CatalogueLayout from '../app/CatalougeLayout';
import { ROUTES } from '../constants/routes.constants';
import PermissionWrapper from '../context/PermissionWrapper';
import { RequireSubscription } from '../UseComponents/RequiredSubscription';
import Loading from '../Pages/Loading/Loading';
import GlobalError from '../Components/GlobalError';
import { AppRegistry } from './AppRegistry';
import AppGuard from '../guards/AppGuard';

// --- PUBLIC ROUTE IMPORTS ---
const Landing = lazy(() => import('../Pages/Auth/Landing'));
const Signup = lazy(() => import('../Pages/Auth/Signup'));
const BusInfo = lazy(() => import('../Pages/Auth/BusInfo'));
const ForgotPasswordPage = lazy(() => import('../Pages/Auth/ForgotPassword'));
const ResetPasswordPage = lazy(() => import('../Pages/Auth/ResetPassword'));
const DownloadBill = lazy(() => import('../Pages/Auth/DownloadBill'));
const SubscriptionPage = lazy(() => import('../Pages/Account/SubscriptionPage'));
const SuperAdminCompanies = lazy(() => import('../Pages/Account/SuperAdmin'));
const SharedProduct = lazy(() => import('../Catalogue/SharedProduct'));
const Catalogue = lazy(() => import('../Catalogue/SharedCatalouge'));
const CartPage = lazy(() => import('../Catalogue/CheckOut'));
const UnauthorizedPage = lazy(() => import('../Pages/Unauthorized'));
const SuperAdminHub = lazy(() => import('../Pages/Account/SuperAdminHub'))
const WebsiteLeads = lazy(() => import('../Pages/Account/WebsiteLeads'))
const SuperAdminSupportTicket = lazy(() => import('../Pages/Account/SuperAdminSupportTicket'))
const LeadPage = lazy(() => import('../Pages/Account/LeadPage'))
const AgentSignup = lazy(() => import('../Pages/Auth/AgentSignup'))
const PartnerDashboard = lazy(() => import('../Pages/PartnerDashboard'))
const AgentDashboard = lazy(() => import('../Pages/Account/AgentDashboard'))

const WALanding = lazy(() => import('../Pages/Additional/Whatsapp/WALanding'));
const WAPlan = lazy(() => import('../Pages/Additional/Whatsapp/WAPlan'));
const WADetails = lazy(() => import('../Pages/Additional/Whatsapp/WADetails'));
const WAVerification = lazy(() => import('../Pages/Additional/Whatsapp/WAVerification'));
const getSubdomain = () => {
  const hostname = window.location.hostname;
  const parts = hostname.split('.');

  // 1. Handle Localhost (usually just 'localhost')
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return null;
  }

  // 2. Identify the slug
  // For 'tenant.sellar.in', parts[0] is 'tenant'
  if (parts.length >= 3) {
    const slug = parts[0].toLowerCase();

    // 3. IGNORE SYSTEM SUBDOMAINS
    // If it's 'app' or 'www', it's NOT a merchant catalogue
    if (slug === 'www' || slug === 'app') {
      return null;
    }

    return slug;
  }

  return null;
};

const subdomain = getSubdomain();

const generateDynamicRoutes = (layoutType: 'MAIN' | 'CATALOGUE') => {
  return AppRegistry.filter((app) => app.layout === layoutType).map((app) => ({
    element: <AppGuard requiredPlans={app.requiredPlans} />,
    children: app.routes.map((route) => ({
      index: route.isIndex,
      path: route.isIndex ? undefined : route.path,
      element: <route.component />,
      handle: { requiredPermission: route.permission },
    })),
  }));
};

const router = createBrowserRouter(
  subdomain
    ? [
      {
        path: '/',
        errorElement: <GlobalError />,
        element: <>
          <ScrollRestoration />
          <Outlet />
        </>,
        children: [
          { index: true, element: <Catalogue />, handle: { isPublic: true } },
          { path: 'checkout', element: <CartPage />, handle: { isPublic: true } },
          { path: ':groupId', element: <SharedProduct />, handle: { isPublic: true } },
          { path: '*', element: <Catalogue /> }
        ]
      }
    ]
    : [
      {
        path: '/',
        errorElement: <GlobalError />,
        element: (
          <>
            <ScrollRestoration />
            <Outlet />
          </>
        ),
        children: [

          // --- 1. LEGACY PUBLIC ROUTES (Completely outside permissions!) ---
          { path: 'catalogue/:companyId', element: <Catalogue />, handle: { isPublic: true } },
          { path: ':companyId/:groupId', element: <SharedProduct />, handle: { isPublic: true } },
          { path: 'checkout/:companyId', element: <CartPage />, handle: { isPublic: true } },


          // --- 2. PROTECTED ADMIN APP ---
          {
            element: <PermissionWrapper />, // <-- Permissions only wrap these children!
            children: [
              { path: ROUTES.LANDING, element: <Landing />, handle: { isPublic: true } },
              { path: '/download-bill/:companyId/:invoiceId', element: <DownloadBill />, handle: { isPublic: true } },
              { path: ROUTES.SIGNUP, element: <Signup />, handle: { isPublic: true } },
              { path: ROUTES.BUSINESS_INFO, element: <BusInfo />, handle: { isPublic: true } },
              { path: ROUTES.FORGOT_PASSWORD, element: <ForgotPasswordPage />, handle: { isPublic: true } },
              { path: ROUTES.RESET_PASSWORD, element: <ResetPasswordPage />, handle: { isPublic: true } },
              { path: ROUTES.SUPER_ADMIN, element: <SuperAdminCompanies /> },
              { path: ROUTES.SUBSCRIPTION_PAGE, element: <SubscriptionPage />, handle: { isPublic: false } },
              { path: ROUTES.SUPER_ADMINHUB, element: <SuperAdminHub /> },
              { path: ROUTES.SUPPORT_TICKET, element: <SuperAdminSupportTicket /> },
              { path: ROUTES.WEBSITE_QUERY, element: <WebsiteLeads /> },
              { path: ROUTES.APP_LEADS, element: <LeadPage /> },
              {
                children: [
                  { path: ROUTES.WHATSAPP_LANDING, element: <WALanding />, handle: { isPublic: false } },
                  { path: ROUTES.WHATSAPP_PLAN, element: <WAPlan />, handle: { isPublic: false } },
                  { path: ROUTES.WHATSAPP_DETAILS, element: <WADetails />, handle: { isPublic: false } },
                  { path: ROUTES.WHATSAPP_VERIFICATION, element: <WAVerification />, handle: { isPublic: false } },
                ],
              },
              // 2. PUBLIC/AUTH ROUTES (Standard pathing)
              {
                children: [
                  { path: ROUTES.LANDING, element: <Landing />, handle: { isPublic: true } },
                  { path: '/download-bill/:companyId/:invoiceId', element: <DownloadBill />, handle: { isPublic: true } },
                  { path: ROUTES.SIGNUP, element: <Signup />, handle: { isPublic: true } },
                  { path: ROUTES.BUSINESS_INFO, element: <BusInfo />, handle: { isPublic: true } },
                  { path: ROUTES.FORGOT_PASSWORD, element: <ForgotPasswordPage />, handle: { isPublic: true } },
                  { path: ROUTES.RESET_PASSWORD, element: <ResetPasswordPage />, handle: { isPublic: true } },
                  { path: ROUTES.SUPER_ADMIN, element: <SuperAdminCompanies /> },
                  { path: ROUTES.SUBSCRIPTION_PAGE, element: <SubscriptionPage />, handle: { isPublic: false } },
                  { path: ROUTES.SUPER_ADMINHUB, element: <SuperAdminHub /> },
                  { path: ROUTES.SUPPORT_TICKET, element: <SuperAdminSupportTicket /> },
                  { path: ROUTES.WEBSITE_QUERY, element: <WebsiteLeads /> },
                  { path: ROUTES.APP_LEADS, element: <LeadPage /> },
                  { path: ROUTES.AGENT_SIGNUP, element: <AgentSignup />, handle: { isPublic: true } },
                  { path: ROUTES.PARTNER_DASHBOARD, element: <PartnerDashboard /> },
                  { path: ROUTES.AGENT_DASHBOARD, element: <AgentDashboard /> },
                  { path: ROUTES.SUPER_ADMINHUB, element: <SuperAdminHub /> },
                  { path: ROUTES.SUPPORT_TICKET, element: <SuperAdminSupportTicket /> },
                  { path: ROUTES.WEBSITE_QUERY, element: <WebsiteLeads /> },
                  { path: ROUTES.APP_LEADS, element: <LeadPage /> },

                  {
                    children: [
                      { path: ROUTES.WHATSAPP_LANDING, element: <WALanding />, handle: { isPublic: false } },
                      { path: ROUTES.WHATSAPP_PLAN, element: <WAPlan />, handle: { isPublic: false } },
                      { path: ROUTES.WHATSAPP_DETAILS, element: <WADetails />, handle: { isPublic: false } },
                      { path: ROUTES.WHATSAPP_VERIFICATION, element: <WAVerification />, handle: { isPublic: false } },
                    ],
                  },
                ],
              },

              // PRIVATE/PROTECTED DASHBOARD ROUTES
              {
                element: <RequireSubscription />,
                children: [
                  { element: <MainLayout />, children: generateDynamicRoutes('MAIN') },
                  { element: <CatalogueLayout />, children: generateDynamicRoutes('CATALOGUE') },
                ],
              },

              { path: ROUTES.UNAUTHORIZED, element: <UnauthorizedPage /> },
            ],
          }
        ],
      }
    ]
);


const AppRouter: React.FC = () => {

  return (
    <Suspense fallback={<Loading />}>
      <RouterProvider router={router} />
    </Suspense>
  );
};

export default AppRouter;