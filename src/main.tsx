import React from 'react';
import ReactDOM from 'react-dom/client';
import { SettingsProvider } from './context/SettingsContext';
import { Provider } from 'react-redux';
import { AuthProvider } from './context/AuthContext';
import { store } from './store/store';
import AppRouter from '../src/routes/routes';
import './global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <AuthProvider>
        <SettingsProvider>
          <AppRouter />
        </SettingsProvider>
      </AuthProvider>
    </Provider>
  </React.StrictMode>,
);
