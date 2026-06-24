import React, { useEffect, useState, type ReactNode } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/Firebase';
import { useAuth } from './auth-context';
import { useShopHours } from '../Pages/hooks/useShopHours';
import { ROLES } from '../enums';
import ShopClosedScreen from '../Pages/ShopClosed/ShopClosedScreen';

export const ShopHoursGuard: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser, loading: authLoading } = useAuth();
  const { settings, isWithinShopHours, loading: hoursLoading } = useShopHours(
    currentUser?.companyId !== 'PARTNER_ACCOUNT' ? currentUser?.companyId : undefined
  );
  const [forcedClosed, setForcedClosed] = useState(false);

  const isRestrictedRole =
    !!currentUser &&
    currentUser.companyId !== 'PARTNER_ACCOUNT' &&
    (currentUser.role === ROLES.SALESMAN || currentUser.role === ROLES.MANAGER);

  useEffect(() => {
    if (authLoading || hoursLoading) return;
    if (!isRestrictedRole) {
      return;
    }
    if (!settings?.enabled) {
      setForcedClosed(false);
      return;
    }

    if (!isWithinShopHours) {
      // Mark closed immediately for instant UI feedback, then sign out.
      setForcedClosed(true);
      signOut(auth).catch((err) => {
        console.error('ShopHoursGuard: failed to sign out after hours', err);
      });
    } else {
      setForcedClosed(false);
    }
  }, [authLoading, hoursLoading, isRestrictedRole, settings?.enabled, isWithinShopHours]);

 if (forcedClosed) {
    return (
      <ShopClosedScreen
        openTime={settings?.openTime ?? '10:00'}
        closeTime={settings?.closeTime ?? '21:00'}
      />
    );
  }

  return <>{children}</>;
};

export default ShopHoursGuard;