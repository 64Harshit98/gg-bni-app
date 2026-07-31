import React from 'react';
import ReactDOM from 'react-dom/client';
import { SettingsProvider } from './context/SettingsContext';
import { Provider } from 'react-redux';
import { AuthProvider } from './context/AuthContext';
import { store } from './store/store';
import AppRouter from '../src/routes/routes';
import './global.css';
import ErrorBoundary from './context/ErrorBoundary';
import { NotificationProvider } from './context/NotificationContext';
import { ShopHoursGuard } from './context/ShopHoursGuard';
import { ThemeProvider } from './context/ThemeProvider';
import { QueryProvider } from './app/providers/QueryProvider';
import { Toaster } from './Components/ui/sonner';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <React.StrictMode>
      <ThemeProvider defaultTheme="light">
        <QueryProvider>
          <Provider store={store}>
            <AuthProvider>
              <ShopHoursGuard>
                <NotificationProvider>
                  <SettingsProvider>
                    <AppRouter />
                    <Toaster />
                  </SettingsProvider>
                </NotificationProvider>
              </ShopHoursGuard>
            </AuthProvider>
          </Provider>
        </QueryProvider>
      </ThemeProvider>
    </React.StrictMode>
  </ErrorBoundary>
);
