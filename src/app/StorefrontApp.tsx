import React, { Suspense } from 'react';
import { RouterProvider } from 'react-router-dom';
import ErrorBoundary from '../context/ErrorBoundary';
import { StorefrontAuthProvider } from '../context/StorefrontAuthProvider';
import { storefrontRouter } from '../routes/storefrontRoutes';
import StorefrontSkeleton from '../Catalogue/storefront/StorefrontSkeleton';

// The buyer-facing Catalogue Viewer on a merchant subdomain (<sub>.sellar.in).
// Kept separate from the merchant dashboard (AdminApp) so a buyer only
// downloads and runs what the storefront needs: no Redux store, no admin
// layouts, no Notification/Settings/CatalogueData providers, no auth
// handshake (see StorefrontAuthProvider) — and a crash in any of those can't
// take the storefront down with it.
const StorefrontApp: React.FC = () => (
  <ErrorBoundary>
    <React.StrictMode>
      <StorefrontAuthProvider>
        <Suspense fallback={<StorefrontSkeleton />}>
          <RouterProvider router={storefrontRouter} />
        </Suspense>
      </StorefrontAuthProvider>
    </React.StrictMode>
  </ErrorBoundary>
);

export default StorefrontApp;
