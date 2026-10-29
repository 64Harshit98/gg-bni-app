import React from 'react';
import { MotionConfig, type Variants } from 'framer-motion';
import sellarLogo from '../assets/sellar-logo-heading.png';

/**
 * Full-screen frame for status pages (crash, page not found, access denied):
 * a logo bar over the SELLAR canvas. POS screens are blue; Catalogue and the
 * customer storefront use the orange `sf-` tokens.
 * Works without a router or AuthProvider, so the root ErrorBoundary can use it.
 */
export type StatusTone = 'pos' | 'catalogue';

export const STATUS_THEMES = {
  pos: {
    canvas: 'bg-canvas',
    line: 'border-line',
    card: 'shadow-card',
    dots: 'bg-[radial-gradient(circle,rgb(37_99_235/0.14)_1px,transparent_1.5px)]',
    primaryBtn: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-blue-600',
    focus: 'focus-visible:outline-blue-600',
    link: 'text-blue-600 hover:text-blue-700',
    soft: 'bg-blue-50 text-blue-700',
    art: { ink: 'fill-blue-600', soft: 'fill-blue-50', mid: 'fill-blue-100', stroke: 'stroke-blue-600' },
  },
  catalogue: {
    canvas: 'bg-sf-canvas',
    line: 'border-sf-line',
    card: 'shadow-sf-card',
    dots: 'bg-[radial-gradient(circle,rgb(194_65_12/0.14)_1px,transparent_1.5px)]',
    primaryBtn: 'bg-sf-primary text-white hover:bg-sf-primary-hover focus-visible:outline-sf-primary',
    focus: 'focus-visible:outline-sf-primary',
    link: 'text-sf-primary hover:text-sf-primary-hover',
    soft: 'bg-sf-soft text-sf-soft-ink',
    art: { ink: 'fill-sf-primary', soft: 'fill-sf-soft', mid: 'fill-orange-200', stroke: 'stroke-sf-primary' },
  },
} as const;

const BTN_BASE =
  'inline-flex h-10 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium no-underline transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2';

export const statusButton = (tone: StatusTone, kind: 'primary' | 'secondary' | 'ghost') => {
  const theme = STATUS_THEMES[tone];
  if (kind === 'primary') return `${BTN_BASE} ${theme.primaryBtn}`;
  if (kind === 'secondary')
    return `${BTN_BASE} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 ${theme.focus}`;
  return `${BTN_BASE} text-slate-600 hover:bg-white/70 hover:text-slate-900 ${theme.focus}`;
};

/** Parent/child variants: children rise in one after another. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};
export const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 20 } },
};

interface StatusShellProps {
  tone: StatusTone;
  /** Right side of the logo bar — e.g. who is signed in, Sign out. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

const StatusShell: React.FC<StatusShellProps> = ({ tone, aside, children }) => {
  const theme = STATUS_THEMES[tone];
  return (
    // reducedMotion="user": loops and movement switch off when the phone asks for less motion.
    <MotionConfig reducedMotion="user">
      <div className={`fixed inset-0 z-50 flex flex-col overflow-y-auto font-poppins ${theme.canvas}`}>
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed inset-0 [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_70%_45%,black,transparent_65%)] ${theme.dots}`}
        />
        <header className={`sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-white/85 px-4 backdrop-blur md:px-6 ${theme.line}`}>
          <img src={sellarLogo} alt="SELLAR" className="h-5 w-auto md:h-6" />
          {aside && <div className="ml-auto flex min-w-0 items-center gap-2">{aside}</div>}
        </header>
        <main className="relative flex flex-1 items-start md:items-center">{children}</main>
      </div>
    </MotionConfig>
  );
};

export default StatusShell;
