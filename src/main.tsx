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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <React.StrictMode>
      <Provider store={store}>
        <AuthProvider>
          <NotificationProvider>
            <SettingsProvider>
              <AppRouter />
            </SettingsProvider>
          </NotificationProvider>
        </AuthProvider>
      </Provider>
    </React.StrictMode>
  </ErrorBoundary>
);
