import { useEffect, useState } from 'react';
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

const ONE_HOUR_MS = 60 * 60 * 1000;

export const useShopHours = (companyId: string | undefined): UseShopHoursResult => {
  const [settings, setSettings] = useState<ShopHoursSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWithinShopHours, setIsWithinShopHours] = useState(true);
  const [isClosingSoon, setIsClosingSoon] = useState(false);
  const [shouldAutoClose, setShouldAutoClose] = useState(false);
  const [needsReset, setNeedsReset] = useState(false);

  // Listen to the settings doc
  useEffect(() => {
    if (!companyId) {
      setLoading(false);
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
        setLoading(false);
      },
      (err) => {
        console.error('useShopHours: failed to listen to shop-hours doc', err);
        // Fail-open: if we can't read settings, don't lock people out
        setSettings(getDefaultShopHoursSettings());
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [companyId]);

  // Re-evaluate the current time check every 30s, and whenever settings change
  useEffect(() => {
    if (!settings) return;

    const evaluate = () => {
      if (!settings.enabled) {
        setIsWithinShopHours(true);
        setIsClosingSoon(false);
        setShouldAutoClose(false);
        setNeedsReset(false);
        return;
      }

      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const openMinutes = toMinutes(settings.openTime);
      const closeMinutes = toMinutes(settings.closeTime);

      // Overnight ranges (e.g. 20:00 -> 02:00): keep the old simple behaviour,
      // no closing-reminder flow for these.
      if (openMinutes >= closeMinutes) {
        const within = nowMinutes >= openMinutes || nowMinutes < closeMinutes;
        setIsWithinShopHours(within);
        setIsClosingSoon(false);
        setShouldAutoClose(false);
        setNeedsReset(false);
        return;
      }

      if (nowMinutes < closeMinutes) {
        // Before today's closing time - covers "before opening" and "currently open".
        setIsWithinShopHours(nowMinutes >= openMinutes);
        setIsClosingSoon(false);
        setShouldAutoClose(false);
        // Yesterday's close/snooze flags are stale once we're back before closing time.
        setNeedsReset(!!settings.forceClosed || !!settings.snoozeUntil);
        return;
      }

      // Past today's closing time.
      setNeedsReset(false);

      if (settings.forceClosed) {
        setIsWithinShopHours(false);
        setIsClosingSoon(false);
        setShouldAutoClose(false);
        return;
      }

      const closingTimestampToday = new Date();
      closingTimestampToday.setHours(Math.floor(closeMinutes / 60), closeMinutes % 60, 0, 0);
      const elapsedSinceClose = now.getTime() - closingTimestampToday.getTime();

      if (elapsedSinceClose >= ONE_HOUR_MS) {
        // 1hr grace period over, owner never confirmed - force it now.
        setIsWithinShopHours(false);
        setIsClosingSoon(false);
        setShouldAutoClose(true);
        return;
      }

      setShouldAutoClose(false);

      if (settings.snoozeUntil && now.getTime() < settings.snoozeUntil) {
        // Snoozing - stay open, reminder hidden.
        setIsWithinShopHours(true);
        setIsClosingSoon(false);
        return;
      }

      // Past closing time, not force-closed, no active snooze -> show the reminder.
      setIsWithinShopHours(true);
      setIsClosingSoon(true);
    };

    evaluate();
    const interval = setInterval(evaluate, 30 * 1000);
    return () => clearInterval(interval);
  }, [settings]);

  return { settings, isWithinShopHours, isClosingSoon, shouldAutoClose, needsReset, loading };
};