import React from 'react';
import { Provider } from 'react-redux';
import { SettingsProvider } from '../context/SettingsContext';
import { CatalogueDataProvider } from '../context/CatalogueDataContext';
import { AuthProvider } from '../context/AuthContext';
import { store } from '../store/store';
import AppRouter from '../routes/routes';
import ErrorBoundary from '../context/ErrorBoundary';
import { NotificationProvider } from '../context/NotificationContext';
import { ShopHoursGuard } from '../context/ShopHoursGuard';

// The merchant dashboard (app.sellar.in): full provider tree. Loaded by
// src/main.tsx only when the visitor is NOT on a merchant storefront
// subdomain — buyers get the much lighter StorefrontApp instead.
const AdminApp: React.FC = () => (
  <ErrorBoundary>
    <React.StrictMode>
      <Provider store={store}>
        <AuthProvider>
          <ShopHoursGuard>
            <NotificationProvider>
              <SettingsProvider>
                <CatalogueDataProvider>
                  <AppRouter />
                </CatalogueDataProvider>
              </SettingsProvider>
            </NotificationProvider>
          </ShopHoursGuard>
        </AuthProvider>
      </Provider>
    </React.StrictMode>
  </ErrorBoundary>
);

export default AdminApp;
