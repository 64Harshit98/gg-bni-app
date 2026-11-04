import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/Firebase';

export interface ShopHoursSettings {
  enabled: boolean;
  openTime: string;  // "HH:mm" 24-hour format, e.g. "10:00"
  closeTime: string; // "HH:mm" 24-hour format, e.g. "21:00"
  forceClosed?: boolean;     // owner clicked "Close Now", or 1hr grace period expired
  snoozeUntil?: number | null; // epoch ms; while now < this, reminder stays hidden
}

interface UseShopHoursResult {
  settings: ShopHoursSettings | null;
  isWithinShopHours: boolean;
  isClosingSoon: boolean;     // true = show the reminder modal RIGHT NOW
  shouldAutoClose: boolean;   // true = 1hr grace expired, caller should persist forceClosed
  needsReset: boolean;        // true = caller should clear forceClosed/snoozeUntil (fresh day)
  loading: boolean;
}

export const getDefaultShopHoursSettings = (): ShopHoursSettings => ({
  enabled: false,
  openTime: '10:00',
  closeTime: '21:00',
  forceClosed: false,
  snoozeUntil: null,
});
// Parses "HH:mm" into total minutes since midnight
const toMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
interface ShopStatus {
  isWithinShopHours: boolean;
  isClosingSoon: boolean;
  shouldAutoClose: boolean;
  needsReset: boolean;
}

const computeShopStatus = (settings: ShopHoursSettings | null, now: Date): ShopStatus => {
  const open: ShopStatus = {
    isWithinShopHours: true,
    isClosingSoon: false,
    shouldAutoClose: false,
    needsReset: false,
  };

  if (!settings || !settings.enabled) return open;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = toMinutes(settings.openTime);
  const closeMinutes = toMinutes(settings.closeTime);

  // Overnight ranges (e.g. 20:00 -> 02:00): simple behaviour, no reminder flow.
  if (openMinutes >= closeMinutes) {
    return {
      ...open,
      isWithinShopHours: nowMinutes >= openMinutes || nowMinutes < closeMinutes,
    };
  }

  if (nowMinutes < closeMinutes) {
    // Before today's closing time - covers "before opening" and "currently open".
    return {
      ...open,
      isWithinShopHours: nowMinutes >= openMinutes,
      // Yesterday's close/snooze flags are stale once we're back before closing time.
      needsReset: !!settings.forceClosed || !!settings.snoozeUntil,
    };
  }

  // Past today's closing time.
  if (settings.forceClosed) {
    return { ...open, isWithinShopHours: false };
  }

  const closingTimestampToday = new Date(now);
  closingTimestampToday.setHours(Math.floor(closeMinutes / 60), closeMinutes % 60, 0, 0);
  const elapsedSinceClose = now.getTime() - closingTimestampToday.getTime();

  if (elapsedSinceClose >= ONE_HOUR_MS) {
    // 1hr grace period over, owner never confirmed - force it now.
    return { ...open, isWithinShopHours: false, shouldAutoClose: true };
  }

  if (settings.snoozeUntil && now.getTime() < settings.snoozeUntil) {
    // Snoozing - stay open, reminder hidden.
    return open;
  }

  // Past closing time, not force-closed, no active snooze -> show the reminder.
  return { ...open, isClosingSoon: true };
};
const ONE_HOUR_MS = 60 * 60 * 1000;

export const useShopHours = (companyId: string | undefined): UseShopHoursResult => {
    const [settings, setSettings] = useState<ShopHoursSettings | null>(null);
  // Track WHICH companyId the loaded settings belong to. Loading is derived
  // from this, so there's never a render where companyId is set but loading
  // is false and settings haven't arrived.
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined);

    useEffect(() => {
    if (!companyId) {
      setSettings(null);
      setLoadedFor(undefined);
      return;
    }

    const ref = doc(db, 'companies', companyId, 'settings', 'shop-hours');
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as ShopHoursSettings;
          setSettings({
            enabled: data.enabled ?? false,
            openTime: data.openTime ?? '10:00',
            closeTime: data.closeTime ?? '21:00',
            forceClosed: data.forceClosed ?? false,
            snoozeUntil: data.snoozeUntil ?? null,
          });
        } else {
          setSettings(getDefaultShopHoursSettings());
        }
        setLoadedFor(companyId);
      },
      (err) => {
        console.error('useShopHours: failed to listen to shop-hours doc', err);
        // Fail-open: if we can't read settings, don't lock people out
        setSettings(getDefaultShopHoursSettings());
        setLoadedFor(companyId);
      }
    );

    return () => unsubscribe();
  }, [companyId]);

    // Ticks every 30s to force a re-render so the time check is re-run.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Derived during render: no frame with stale "open" values.
  // `tick` is read so the memo recomputes on every interval.
  const status = useMemo(
    () => computeShopStatus(settings, new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, tick]
  );

  // Loading until settings for THIS companyId have actually arrived.
  const loading = !!companyId && loadedFor !== companyId;

    return {
    settings,
    isWithinShopHours: status.isWithinShopHours,
    isClosingSoon: status.isClosingSoon,
    shouldAutoClose: status.shouldAutoClose,
    needsReset: status.needsReset,
    loading,
  };
};