// Decides how this visitor can install the dashboard as an app. Only Chromium
// browsers can be triggered from code (beforeinstallprompt, captured early by
// the inline script in index.html); every other browser has to be walked
// through its own menu, or sent to a browser that can install at all.

import { safeGet, safeSet } from './safeStorage';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __PWA_INSTALL_EVENT__?: BeforeInstallPromptEvent | null;
  }
  interface Navigator {
    standalone?: boolean; // Safari only
  }
}

// Shared with the inline script in index.html.
export const INSTALL_AVAILABLE_EVENT = 'sellar:pwa-install-available';
export const INSTALL_DONE_EVENT = 'sellar:pwa-install-done';
const INSTALLED_KEY = 'sellar:pwa-installed';

const HIDDEN_UNTIL_KEY = 'sellar:pwa-install-hidden-until';
const DAY_MS = 24 * 60 * 60 * 1000;
// "Not now", or declining the browser's own prompt: ask again soon.
export const NOT_NOW_HIDE_MS = 2 * DAY_MS;
// "Got it" on the manual steps: we can't tell whether they went on to install,
// so a short window could keep prompting people who already have the app.
export const GOT_IT_HIDE_MS = 30 * DAY_MS;

export type InstallMethod =
  | 'native' // the browser's own install prompt, opened by our button
  | 'ios' // Share -> Add to Home Screen
  | 'ios-needs-safari' // iOS before 16.4 can only install from Safari
  | 'mac-safari' // File -> Add to Dock
  | 'android-menu' // the browser menu
  | 'use-other-browser' // this browser can't install; suggest one that can
  | 'in-app'; // an app's built-in browser (WhatsApp, Instagram...)

export interface InstallEnvironment {
  ua: string;
  maxTouchPoints: number;
  hasPromptEvent: boolean;
  isSecure: boolean;
}

const IN_APP_BROWSER = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|\bLine\/|Snapchat|MicroMessenger|LinkedInApp|; wv\)/i;
const IOS_NON_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo/;
const ANDROID_CHROME_LOOKALIKE = /SamsungBrowser|EdgA|OPR|OPX|UCBrowser|MiuiBrowser|HuaweiBrowser|VivoBrowser|HeyTapBrowser|YaBrowser|DuckDuckGo/;
const MAC_NON_SAFARI = /Chrome|Chromium|Edg|OPR|Firefox/;

const isBelowIOS164 = (ua: string): boolean => {
  const match = ua.match(/\bOS (\d+)_(\d+)/);
  if (!match) return false; // iPadOS reports as a Mac, with no iOS version
  const major = Number(match[1]);
  return major < 16 || (major === 16 && Number(match[2]) < 4);
};

export const getInstallMethod = ({
  ua,
  maxTouchPoints,
  hasPromptEvent,
  isSecure,
}: InstallEnvironment): InstallMethod | null => {
  if (!isSecure) return null;
  if (hasPromptEvent) return 'native';

  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);

  // Every real iOS browser keeps the "Safari/" token; embedded web views drop it.
  if (IN_APP_BROWSER.test(ua) || (isIOS && !/Safari\//.test(ua))) return 'in-app';

  if (isIOS) {
    return isBelowIOS164(ua) && IOS_NON_SAFARI.test(ua) ? 'ios-needs-safari' : 'ios';
  }

  if (/Android/i.test(ua)) {
    // Chrome without the event is left alone: it may already be installed, or
    // not have met Chrome's engagement rule yet, so steps could be wrong.
    const isChrome = /Chrome\//.test(ua) && !ANDROID_CHROME_LOOKALIKE.test(ua);
    return isChrome ? null : 'android-menu';
  }

  if (/Firefox\//.test(ua)) return 'use-other-browser';

  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !MAC_NON_SAFARI.test(ua)) {
    const version = ua.match(/Version\/(\d+)/);
    return version && Number(version[1]) >= 17 ? 'mac-safari' : null; // needs macOS 14 / Safari 17
  }

  return null;
};

export const SHOW_AFTER_MS = 1_000;

export const isStandalone = (): boolean =>
  navigator.standalone === true ||
  ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(
    (mode) => window.matchMedia(`(display-mode: ${mode})`).matches,
  );

export const isMarkedInstalled = (): boolean => safeGet(INSTALLED_KEY) !== null;

export const isDismissed = (now = Date.now()): boolean =>
  Number(safeGet(HIDDEN_UNTIL_KEY)) > now;

export const dismissInstallPrompt = (hideForMs: number, now = Date.now()): void => {
  safeSet(HIDDEN_UNTIL_KEY, String(now + hideForMs));
};

export const canOfferInstall = (): boolean =>
  !isStandalone() && !isMarkedInstalled() && !isDismissed();

export const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
  const event = window.__PWA_INSTALL_EVENT__;
  if (!event) return 'unavailable';
  window.__PWA_INSTALL_EVENT__ = null; // an event can only be prompted once

  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === 'accepted') safeSet(INSTALLED_KEY, '1');
    return outcome;
  } catch (error) {
    console.error('Install prompt failed:', error);
    return 'unavailable';
  }
};
