import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button } from './ui/button';
import sellarLogo from '../assets/sellar-logo.png';
import {
  GOT_IT_HIDE_MS,
  INSTALL_AVAILABLE_EVENT,
  INSTALL_DONE_EVENT,
  NOT_NOW_HIDE_MS,
  SHOW_AFTER_MS,
  canOfferInstall,
  dismissInstallPrompt,
  getInstallMethod,
  promptInstall,
  type InstallMethod,
} from '../lib/pwaInstall';

const CONTENT: Record<InstallMethod, { text: string; steps?: ReactNode[] }> = {
  native: { text: 'Open Sellar from your home screen or desktop, like any other app.' },
  ios: {
    text: 'Add Sellar to your home screen in two steps:',
    steps: [
      'Tap the Share button (it may be under the ••• menu).',
      <>Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.</>,
    ],
  },
  'ios-needs-safari': { text: 'Open this page in Safari, then tap Share and Add to Home Screen.' },
  'mac-safari': {
    text: 'Add Sellar to your Dock in two steps:',
    steps: [
      <>In the menu bar, choose <strong>File</strong> then <strong>Add to Dock</strong>.</>,
      <>Click <strong>Add</strong>.</>,
    ],
  },
  'android-menu': {
    text: 'Add Sellar to your home screen in two steps:',
    steps: [
      'Open your browser menu (⋮ or ☰).',
      <>Tap <strong>Install</strong> or <strong>Add to Home screen</strong> (on Samsung Internet, <strong>Add page to</strong>).</>,
    ],
  },
  'use-other-browser': { text: 'Open this page in Chrome or Edge to install Sellar as an app.' },
  'in-app': { text: 'Open this page in your browser, such as Chrome or Safari, to install Sellar as an app.' },
};

interface InstallAppPromptProps {
  // True on pages or moments where the toast would get in the way.
  suppressed: boolean;
}

export const InstallAppPrompt = ({ suppressed }: InstallAppPromptProps) => {
  const [hasPromptEvent, setHasPromptEvent] = useState(() => !!window.__PWA_INSTALL_EVENT__);
  const [closed, setClosed] = useState(() => !canOfferInstall());
  const [delayPassed, setDelayPassed] = useState(false);

  useEffect(() => {
    const onAvailable = () => {
      setHasPromptEvent(true);
      setClosed(!canOfferInstall());
    };
    const onInstalled = () => setClosed(true);
    window.addEventListener(INSTALL_AVAILABLE_EVENT, onAvailable);
    window.addEventListener(INSTALL_DONE_EVENT, onInstalled);
    // The event may have landed after the first render read it but before
    // these listeners were attached; it only fires once per page load.
    if (window.__PWA_INSTALL_EVENT__) onAvailable();
    return () => {
      window.removeEventListener(INSTALL_AVAILABLE_EVENT, onAvailable);
      window.removeEventListener(INSTALL_DONE_EVENT, onInstalled);
    };
  }, []);

  const method = useMemo(
    () =>
      getInstallMethod({
        ua: navigator.userAgent,
        maxTouchPoints: navigator.maxTouchPoints,
        hasPromptEvent,
        isSecure: window.isSecureContext,
      }),
    [hasPromptEvent],
  );

  useEffect(() => {
    setDelayPassed(false);
    if (closed || suppressed || !method) return;
    const timer = setTimeout(() => setDelayPassed(true), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [closed, suppressed, method]);

  if (!method || closed || suppressed || !delayPassed) return null;

  const dismiss = (hideForMs: number) => {
    dismissInstallPrompt(hideForMs);
    setClosed(true);
  };

  const handleInstall = async () => {
    const outcome = await promptInstall();
    setHasPromptEvent(false);
    if (outcome === 'accepted') setClosed(true);
    else dismiss(NOT_NOW_HIDE_MS);
  };

  const { text, steps } = CONTENT[method];

  return (
    // Top centre, just below the header (53px on mobile, 61px on desktop).
    // z-[110]: under the mobile header/nav (z-[150]) and the FAB overlays (z-[120], z-[145]).
    <section
      aria-label="Install the Sellar app"
      aria-live="polite"
      className="fixed inset-x-3 top-[60px] z-[110] rounded-sm border border-slate-200 bg-white p-4 shadow-lg md:inset-x-0 md:top-[69px] md:mx-auto md:w-96"
    >
      <div className="flex gap-3">
        <img src={sellarLogo} alt="" className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Install the Sellar app</p>
          <p className="mt-0.5 text-sm text-slate-600">{text}</p>
          {steps && (
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-slate-600">
              {steps.map((step, index) => <li key={index}>{step}</li>)}
            </ol>
          )}
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        {method === 'native' ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => dismiss(NOT_NOW_HIDE_MS)}>Not now</Button>
            <Button size="sm" onClick={handleInstall}>Install</Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => dismiss(GOT_IT_HIDE_MS)}>Got it</Button>
        )}
      </div>
    </section>
  );
};
