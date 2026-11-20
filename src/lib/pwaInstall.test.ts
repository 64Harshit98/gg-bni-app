import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  GOT_IT_HIDE_MS,
  NOT_NOW_HIDE_MS,
  canOfferInstall,
  dismissInstallPrompt,
  getInstallMethod,
  isDismissed,
  isMarkedInstalled,
  isStandalone,
  promptInstall,
  type BeforeInstallPromptEvent,
  type InstallMethod,
} from './pwaInstall';

const UA = {
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  edgeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 EdgA/130.0.0.0',
  operaAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 OPR/85.0.0.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  webviewAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  instagramAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  chromeOldIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0.0.0 Mobile/15E148 Safari/604.1',
  safariOldIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
  webviewIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  safariOldMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15',
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  firefoxWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
};

const memoryStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getInstallMethod', () => {
  const cases: [string, string, number, InstallMethod | null][] = [
    ['Chrome on Android, no event yet', UA.chromeAndroid, 5, null],
    ['Samsung Internet', UA.samsung, 5, 'android-menu'],
    ['Edge on Android', UA.edgeAndroid, 5, 'android-menu'],
    ['Opera on Android', UA.operaAndroid, 5, 'android-menu'],
    ['Firefox on Android', UA.firefoxAndroid, 5, 'android-menu'],
    ['Android web view', UA.webviewAndroid, 5, 'in-app'],
    ['Instagram on Android', UA.instagramAndroid, 5, 'in-app'],
    ['Safari on iPhone', UA.safariIphone, 5, 'ios'],
    ['Chrome on iPhone', UA.chromeIphone, 5, 'ios'],
    ['Firefox on iPhone', UA.firefoxIphone, 5, 'ios'],
    ['Chrome on iOS below 16.4', UA.chromeOldIphone, 5, 'ios-needs-safari'],
    ['Safari on iOS below 16.4', UA.safariOldIphone, 5, 'ios'],
    ['iPhone web view', UA.webviewIphone, 5, 'in-app'],
    ['iPad reporting as a Mac', UA.safariMac, 5, 'ios'],
    ['Safari 17+ on Mac', UA.safariMac, 0, 'mac-safari'],
    ['Safari below 17 on Mac', UA.safariOldMac, 0, null],
    ['Chrome on Mac, no event yet', UA.chromeMac, 0, null],
    ['Chrome on Windows, no event yet', UA.chromeWindows, 0, null],
    ['Edge on Windows, no event yet', UA.edgeWindows, 0, null],
    ['Firefox on Windows', UA.firefoxWindows, 0, 'use-other-browser'],
  ];

  it.each(cases)('%s', (_name, ua, maxTouchPoints, expected) => {
    expect(getInstallMethod({ ua, maxTouchPoints, hasPromptEvent: false, isSecure: true })).toBe(expected);
  });

  it('uses the native prompt in any browser that fired the event', () => {
    for (const ua of [UA.chromeAndroid, UA.samsung, UA.edgeWindows]) {
      expect(getInstallMethod({ ua, maxTouchPoints: 5, hasPromptEvent: true, isSecure: true })).toBe('native');
    }
  });

  it('offers nothing outside a secure context', () => {
    expect(getInstallMethod({ ua: UA.safariIphone, maxTouchPoints: 5, hasPromptEvent: false, isSecure: false })).toBeNull();
  });
});

describe('dismissal window', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('hides for 2 days after Not now', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    expect(isDismissed(1_000)).toBe(false);
    dismissInstallPrompt(NOT_NOW_HIDE_MS, 1_000);
    expect(isDismissed(1_000 + 2 * DAY - 1)).toBe(true);
    expect(isDismissed(1_000 + 2 * DAY)).toBe(false);
  });

  it('hides for 30 days after Got it', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    dismissInstallPrompt(GOT_IT_HIDE_MS, 1_000);
    expect(isDismissed(1_000 + 30 * DAY - 1)).toBe(true);
    expect(isDismissed(1_000 + 30 * DAY)).toBe(false);
  });

  it('ignores a corrupted value', () => {
    const storage = memoryStorage();
    storage.setItem('sellar:pwa-install-hidden-until', 'not-a-number');
    vi.stubGlobal('localStorage', storage);
    expect(isDismissed()).toBe(false);
  });
});

describe('canOfferInstall', () => {
  const stubBrowser = (matchingMode: string | null, standalone = false) => {
    vi.stubGlobal('navigator', { standalone });
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({ matches: matchingMode !== null && query.includes(matchingMode) }),
    });
  };

  it('offers in a normal browser tab', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    stubBrowser(null);
    expect(isStandalone()).toBe(false);
    expect(canOfferInstall()).toBe(true);
  });

  it('does not offer inside the installed app', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    stubBrowser('standalone');
    expect(canOfferInstall()).toBe(false);
  });

  it('detects the installed app on iOS', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    stubBrowser(null, true);
    expect(isStandalone()).toBe(true);
  });

  it('does not offer once marked installed or dismissed', () => {
    const installed = memoryStorage();
    installed.setItem('sellar:pwa-installed', '1');
    vi.stubGlobal('localStorage', installed);
    stubBrowser(null);
    expect(isMarkedInstalled()).toBe(true);
    expect(canOfferInstall()).toBe(false);

    vi.stubGlobal('localStorage', memoryStorage());
    dismissInstallPrompt(NOT_NOW_HIDE_MS);
    expect(canOfferInstall()).toBe(false);
  });
});

describe('promptInstall', () => {
  const stubEvent = (outcome: 'accepted' | 'dismissed') => {
    const event = {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome }),
    } as unknown as BeforeInstallPromptEvent;
    const win: Pick<Window, '__PWA_INSTALL_EVENT__'> = { __PWA_INSTALL_EVENT__: event };
    vi.stubGlobal('window', win);
    vi.stubGlobal('localStorage', memoryStorage());
    return { event, win };
  };

  it('marks the app installed when accepted, and uses the event only once', async () => {
    const { event, win } = stubEvent('accepted');
    await expect(promptInstall()).resolves.toBe('accepted');
    expect(event.prompt).toHaveBeenCalledOnce();
    expect(win.__PWA_INSTALL_EVENT__).toBeNull();
    expect(isMarkedInstalled()).toBe(true);
    await expect(promptInstall()).resolves.toBe('unavailable');
  });

  it('does not mark the app installed when dismissed', async () => {
    stubEvent('dismissed');
    await expect(promptInstall()).resolves.toBe('dismissed');
    expect(isMarkedInstalled()).toBe(false);
  });

  it('reports unavailable when the prompt fails', async () => {
    const { event } = stubEvent('accepted');
    vi.mocked(event.prompt).mockRejectedValue(new Error('not allowed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(promptInstall()).resolves.toBe('unavailable');
    expect(isMarkedInstalled()).toBe(false);
  });
});
