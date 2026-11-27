import { useCallback, useSyncExternalStore } from 'react';

const LARGE_SCREEN_QUERY = '(min-width: 768px)'; // Tailwind `md` = tablet + desktop
const LOCALE = 'en-IN';

export const formatNumber = (
    value: number | string | null | undefined,
    minDecimals = 0,
    maxDecimals = minDecimals,
    group = true
): string => {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    return safe.toLocaleString(LOCALE, {
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
        useGrouping: group,
    });
};

const subscribe = (cb: () => void) => {
    const mql = window.matchMedia(LARGE_SCREEN_QUERY);
    mql.addEventListener('change', cb);
    return () => mql.removeEventListener('change', cb);
};
const getSnapshot = () => window.matchMedia(LARGE_SCREEN_QUERY).matches;
const getServerSnapshot = () => false;

export const useIsLargeScreen = () =>
    useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

/**
 * fmt(value, minDecimals?, maxDecimals?)
 * Commas on tablet/desktop, plain digits on phone.
 */
export const useFormatNumber = () =>
    useCallback(
        (value: number | string | null | undefined, minDecimals = 0, maxDecimals = minDecimals) =>
            formatNumber(value, minDecimals, maxDecimals, true),
        []
    );