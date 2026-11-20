// Bridge between the React app and the inline boot watchdog in index.html.
// The watchdog shows a "Couldn't load — Tap to retry" overlay if the app's
// code never starts, never renders, or crashes the page down to nothing — so
// every failure ends on a visible message instead of a blank white page.

declare global {
  interface Window {
    __APP_STARTED__?: boolean;
    __APP_BOOTED__?: boolean;
    __BOOT_FAIL__?: () => void;
    __BOOT_OK__?: () => void;
  }
}

// The app's code has loaded and is about to render. From here on, failed
// lazy chunks are the app's job (vite:preloadError listener, error
// boundaries), so the watchdog stops treating resource errors as fatal.
export const markAppStarted = (): void => {
  window.__APP_STARTED__ = true;
};

// React committed its first render. Also clears the watchdog's overlay in
// case a slow load had already tripped its timer.
export const markAppBooted = (): void => {
  window.__APP_BOOTED__ = true;
  window.__BOOT_OK__?.();
};

export const reportBootFailure = (): void => {
  window.__BOOT_FAIL__?.();
};
