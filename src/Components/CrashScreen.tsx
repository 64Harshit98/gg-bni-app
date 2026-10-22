import React, { useContext, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  House,
  LifeBuoy,
  MapPinOff,
  RotateCw,
  Sparkles,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { AuthContext } from '../context/auth-context';
import { PLANS } from '../enums';
import { ROUTES } from '../constants/routes.constants';
import { getSubdomain } from '../lib/subdomain';
import StatusShell, { RISE, STATUS_THEMES, StatusMark, riseDelay, statusButton, type StatusTone } from './StatusShell';

/**
 * Full-screen fallback when something breaks. Shared by the root ErrorBoundary
 * (outside the router and AuthProvider) and the router's GlobalError, so it
 * uses plain links and reads auth without requiring it.
 */
export type CrashKind = 'crash' | 'notFound' | 'update';

/** A lazy page chunk that no longer exists — the app was updated while open. */
export const isChunkLoadError = (error: unknown) => {
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('expected a javascript') ||
    message.includes('text/html')
  );
};

const describeError = (error: unknown): string => {
  if (!error) return 'No error message';
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'object' && 'status' in error) {
    const { status, statusText } = error as { status: number; statusText?: string };
    return `${status} ${statusText ?? ''}`.trim();
  }
  return String(error);
};

const CUSTOMER_PATH = /^\/(?:catalogue|checkout)\/([^/]+)/;

interface Copy {
  overline: string;
  title: string;
  body: string;
}

const COPY: Record<CrashKind, { owner: Copy; customer: Copy }> = {
  crash: {
    owner: {
      overline: 'Something went wrong',
      title: 'This screen stopped working',
      body: 'Anything you already saved is safe. Reload the page to pick up where you left off.',
    },
    customer: {
      overline: 'Something went wrong',
      title: "This page didn't load",
      body: 'Reload to try again. Your cart is saved on this device.',
    },
  },
  notFound: {
    owner: {
      overline: 'Page not found',
      title: "We couldn't find that page",
      body: 'The link may be old or typed wrong. Check the address, or go back to your home screen.',
    },
    customer: {
      overline: 'Page not found',
      title: "This page isn't here",
      body: 'The link may be old. Go back to the store to keep shopping.',
    },
  },
  update: {
    owner: {
      overline: 'Update ready',
      title: 'A new version of SELLAR is ready',
      body: 'Reload to start using it. Anything you already saved is safe.',
    },
    customer: {
      overline: 'Update ready',
      title: 'This store was just updated',
      body: 'Reload to see the latest version.',
    },
  },
};

const MARKS: Record<CrashKind, { icon: LucideIcon; tone: 'red' | 'slate' | 'blue' }> = {
  crash: { icon: AlertTriangle, tone: 'red' },
  notFound: { icon: MapPinOff, tone: 'slate' },
  update: { icon: Sparkles, tone: 'blue' },
};

interface CrashScreenProps {
  error?: unknown;
  /** Defaults to 'update' for stale-chunk errors, otherwise 'crash'. */
  kind?: CrashKind;
}

const CrashScreen: React.FC<CrashScreenProps> = ({ error, kind: kindProp }) => {
  const auth = useContext(AuthContext);
  const currentUser = auth?.currentUser ?? null;
  const [copied, setCopied] = useState(false);

  const kind: CrashKind = kindProp ?? (isChunkLoadError(error) ? 'update' : 'crash');
  const path = window.location.pathname;
  const customerMatch = path.match(CUSTOMER_PATH);
  const isCustomer = Boolean(getSubdomain()) || Boolean(customerMatch);

  const isCatalogueUser = currentUser?.plan === PLANS.CATALOGUE_PRO || currentUser?.plan === PLANS.CALC_CATALOG;
  const tone: StatusTone = isCustomer || path.startsWith(ROUTES.CHOME) || isCatalogueUser ? 'catalogue' : 'pos';
  const theme = STATUS_THEMES[tone];

  const homeHref = isCustomer
    ? customerMatch
      ? `/catalogue/${customerMatch[1]}`
      : '/'
    : !currentUser
      ? ROUTES.LANDING
      : isCatalogueUser
        ? ROUTES.CHOME
        : ROUTES.HOME;
  const supportHref = tone === 'catalogue' ? `${ROUTES.CHOME}/${ROUTES.CATA_SUPPORT}` : ROUTES.SUPPORT_PAGE;

  const copy = COPY[kind][isCustomer ? 'customer' : 'owner'];
  const mark = MARKS[kind];

  const details = useMemo(
    () =>
      [
        `Page: ${path}`,
        `Time: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
        `Error: ${describeError(error)}`,
      ].join('\n'),
    [error, path],
  );

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the details stay visible for a screenshot.
    }
  };

  const steps: { icon: LucideIcon; title: string; text: string }[] =
    kind === 'notFound'
      ? [
          { icon: MapPinOff, title: 'Check the address', text: 'A missing letter or an old bookmark is the usual cause.' },
          { icon: House, title: 'Start from home', text: 'Open the page again from the menu.' },
        ]
      : [
          { icon: RotateCw, title: 'Reload the page', text: 'Most problems clear up after a reload.' },
          { icon: WifiOff, title: 'Check your internet', text: 'A weak signal can stop a screen from loading.' },
          ...(!isCustomer && currentUser
            ? [{ icon: LifeBuoy, title: 'Tell us about it', text: 'Copy the details below and send them to support.' }]
            : []),
        ];

  const reloadButton = (
    <button type="button" onClick={() => window.location.reload()} className={`${statusButton(tone, 'primary')} w-full sm:w-auto`}>
      <RotateCw size={16} aria-hidden="true" />
      {kind === 'update' ? 'Reload now' : 'Reload page'}
    </button>
  );
  const homeButton = (primary: boolean) => (
    <a href={homeHref} className={`${statusButton(tone, primary ? 'primary' : 'secondary')} w-full sm:w-auto`}>
      <House size={16} aria-hidden="true" />
      {isCustomer ? 'Back to the store' : 'Go to home'}
    </a>
  );

  return (
    <StatusShell tone={tone}>
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] md:items-center md:gap-12 md:px-6 md:py-16">
        {/* Message and actions */}
        <section>
          <div className={RISE} style={riseDelay(0)}>
            <StatusMark icon={mark.icon} tone={tone === 'catalogue' && kind === 'update' ? 'orange' : mark.tone} />
          </div>
          <p className={`mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 ${RISE}`} style={riseDelay(1)}>
            {copy.overline}
          </p>
          <h1
            className={`mt-1.5 text-2xl font-semibold tracking-tight text-slate-900 md:text-[28px] md:leading-tight ${RISE}`}
            style={riseDelay(2)}
          >
            {copy.title}
          </h1>
          <p className={`mt-3 max-w-[46ch] text-sm leading-relaxed text-slate-600 md:text-base ${RISE}`} style={riseDelay(3)}>
            {copy.body}
          </p>

          <div className={`mt-7 flex flex-col gap-2.5 sm:flex-row sm:items-center ${RISE}`} style={riseDelay(4)}>
            {kind === 'notFound' ? (
              <>
                {homeButton(true)}
                {window.history.length > 1 && (
                  <button type="button" onClick={() => window.history.back()} className={`${statusButton(tone, 'secondary')} w-full sm:w-auto`}>
                    <ArrowLeft size={16} aria-hidden="true" />
                    Go back
                  </button>
                )}
              </>
            ) : (
              <>
                {reloadButton}
                {homeButton(false)}
              </>
            )}
          </div>

          {!isCustomer && currentUser && kind !== 'update' && (
            <p className={`mt-6 text-sm text-slate-500 ${RISE}`} style={riseDelay(5)}>
              Still stuck?{' '}
              <a href={supportHref} className={`font-medium underline-offset-2 hover:underline ${theme.link}`}>
                Contact support
              </a>
            </p>
          )}
        </section>

        {/* What to try, and details for support */}
        {kind !== 'update' && (
          <aside className={`rounded-sm border bg-white ${theme.line} ${theme.card} ${RISE}`} style={riseDelay(4)}>
            <h2 className="px-4 pt-4 text-sm font-semibold text-slate-900 md:px-5 md:pt-5">Things to try</h2>
            <ol className="mt-3 space-y-3.5 px-4 pb-4 md:px-5 md:pb-5">
              {steps.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-slate-600">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">
                      <span className="sr-only">Step {i + 1}: </span>
                      {title}
                    </span>
                    <span className="block text-xs leading-relaxed text-slate-500">{text}</span>
                  </span>
                </li>
              ))}
            </ol>

            {kind === 'crash' && !isCustomer && (
              <details className={`group border-t ${theme.line}`}>
                <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-medium text-slate-600 hover:text-slate-900 md:px-5 [&::-webkit-details-marker]:hidden">
                  Details for support
                  <ChevronDown size={14} className="ml-auto transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="px-4 pb-4 md:px-5">
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700">
                    {details}
                  </pre>
                  <button type="button" onClick={copyDetails} className={`${statusButton(tone, 'secondary')} mt-2.5 h-8 px-3 text-xs`}>
                    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                    <span aria-live="polite">{copied ? 'Copied' : 'Copy details'}</span>
                  </button>
                </div>
              </details>
            )}
          </aside>
        )}
      </div>
    </StatusShell>
  );
};

export default CrashScreen;
