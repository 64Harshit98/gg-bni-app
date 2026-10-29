import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Check, Copy, House, LifeBuoy, RotateCw } from 'lucide-react';
import { AuthContext } from '../context/auth-context';
import { PLANS } from '../enums';
import { ROUTES } from '../constants/routes.constants';
import { getSubdomain } from '../lib/subdomain';
import StatusShell, { STATUS_THEMES, rise, stagger, statusButton, type StatusTone } from './StatusShell';
import { BrokenBillArt, CompassArt, UpdateArt } from './StatusArt';

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
const UPDATE_SECONDS = 8;
/** Time for the torn bill to snap back together before the reload. */
const MEND_MS = 750;

const COPY: Record<CrashKind, { owner: [string, string]; customer: [string, string] }> = {
  crash: {
    owner: ['Something broke on this screen', 'Your saved work is safe.'],
    customer: ["This page didn't load", 'Your cart is saved on this device.'],
  },
  notFound: {
    owner: ['Page not found', 'The link may be old or mistyped.'],
    customer: ["This page isn't here", 'The link may be old.'],
  },
  update: {
    owner: ['New version ready', 'Your saved work is safe.'],
    customer: ['This store was just updated', 'Reload to see the latest version.'],
  },
};

interface CrashScreenProps {
  error?: unknown;
  /** Defaults to 'update' for stale-chunk errors, otherwise 'crash'. */
  kind?: CrashKind;
}

const CrashScreen: React.FC<CrashScreenProps> = ({ error, kind: kindProp }) => {
  const auth = useContext(AuthContext);
  const currentUser = auth?.currentUser ?? null;
  const [mended, setMended] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [secondsLeft, setSecondsLeft] = useState(UPDATE_SECONDS);

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
  const showSupport = kind === 'crash' && !isCustomer && Boolean(currentUser);

  const [title, line] = COPY[kind][isCustomer ? 'customer' : 'owner'];

  const reload = () => {
    if (mended) return;
    setMended(true);
    window.setTimeout(() => window.location.reload(), kind === 'crash' ? MEND_MS : 0);
  };

  // Update: count down, then reload on our own — the old page can't load anyway.
  useEffect(() => {
    if (kind !== 'update') return;
    const tick = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    const done = window.setTimeout(() => window.location.reload(), UPDATE_SECONDS * 1000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
    };
  }, [kind]);

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
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed'); // clipboard blocked — show the text instead
    }
  };

  const art =
    kind === 'crash' ? (
      <BrokenBillArt tone={tone} mended={mended} />
    ) : kind === 'notFound' ? (
      <CompassArt tone={tone} />
    ) : (
      <div className="relative mx-auto max-w-[240px]">
        <UpdateArt tone={tone} seconds={UPDATE_SECONDS} />
      </div>
    );

  return (
    <StatusShell tone={tone}>
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="mx-auto grid w-full max-w-5xl items-center gap-4 px-4 py-8 md:grid-cols-2 md:gap-12 md:px-6 md:py-12"
      >
        <motion.div variants={rise} className="mx-auto w-full max-w-[280px] md:order-last md:max-w-[420px]">
          {art}
        </motion.div>

        <motion.div variants={stagger} className="text-center md:text-left">
          <motion.h1 variants={rise} className="text-2xl font-semibold tracking-tight text-slate-900 md:text-[32px] md:leading-tight">
            {title}
          </motion.h1>
          <motion.p variants={rise} className="mt-2 text-sm text-slate-600 md:text-base">
            {kind === 'update' ? (
              <>
                Reloading in <span className="font-semibold tabular-nums text-slate-900">{secondsLeft}s</span>. {line}
              </>
            ) : (
              line
            )}
          </motion.p>

          <motion.div variants={rise} className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center md:justify-start">
            {kind !== 'notFound' && (
              <button type="button" onClick={reload} disabled={mended} className={`${statusButton(tone, 'primary')} w-full disabled:opacity-90 sm:w-auto`}>
                <motion.span
                  className="inline-flex"
                  animate={mended ? { rotate: 360 } : { rotate: 0 }}
                  transition={mended ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : { duration: 0 }}
                >
                  <RotateCw size={16} aria-hidden="true" />
                </motion.span>
                {mended ? 'Reloading…' : kind === 'update' ? 'Reload now' : 'Reload page'}
              </button>
            )}
            {kind !== 'update' && (
              <a href={homeHref} className={`${statusButton(tone, kind === 'notFound' ? 'primary' : 'secondary')} w-full sm:w-auto`}>
                <House size={16} aria-hidden="true" />
                {isCustomer ? 'Back to the store' : 'Go to home'}
              </a>
            )}
            {kind === 'notFound' && window.history.length > 1 && (
              <button type="button" onClick={() => window.history.back()} className={`${statusButton(tone, 'secondary')} w-full sm:w-auto`}>
                <ArrowLeft size={16} aria-hidden="true" />
                Go back
              </button>
            )}
          </motion.div>

          {showSupport && (
            <motion.div variants={rise} className="mt-5 flex flex-wrap items-center justify-center gap-1 md:justify-start">
              <button type="button" onClick={copyDetails} className={`${statusButton(tone, 'ghost')} h-8 px-2.5 text-xs`}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={copyState === 'copied' ? 'done' : 'copy'}
                    className="inline-flex"
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.4, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  >
                    {copyState === 'copied' ? <Check size={14} className="text-green-600" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  </motion.span>
                </AnimatePresence>
                <span aria-live="polite">{copyState === 'copied' ? 'Copied' : 'Copy error'}</span>
              </button>
              <span className="h-4 w-px bg-slate-300" aria-hidden="true" />
              <a href={supportHref} className={`${statusButton(tone, 'ghost')} h-8 px-2.5 text-xs`}>
                <LifeBuoy size={14} aria-hidden="true" />
                Support
              </a>
            </motion.div>
          )}

          <AnimatePresence>
            {copyState === 'failed' && (
              <motion.pre
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className={`mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-sm border bg-white p-3 text-left font-mono text-[11px] leading-relaxed text-slate-700 ${theme.line}`}
              >
                {details}
              </motion.pre>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </StatusShell>
  );
};

export default CrashScreen;
