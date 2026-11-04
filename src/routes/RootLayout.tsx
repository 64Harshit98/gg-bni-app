import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation } from 'react-router-dom';
import { logAnalyticsEvent } from '../lib/Firebase';

// Shared root route element for both the admin app (routes.tsx) and the
// public storefront (storefrontRoutes.tsx): scroll restoration + an
// analytics page_view on every navigation.
const RootLayout: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    logAnalyticsEvent('page_view', {
      page_path: location.pathname + location.search,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [location]);

  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
};

export default RootLayout;
