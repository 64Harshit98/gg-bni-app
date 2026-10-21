import React from 'react';
import type { LucideIcon } from 'lucide-react';
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
    primaryBtn: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-blue-600',
    secondaryBtn: 'focus-visible:outline-blue-600',
    link: 'text-blue-600 hover:text-blue-700',
    soft: 'bg-blue-50 text-blue-700',
  },
  catalogue: {
    canvas: 'bg-sf-canvas',
    line: 'border-sf-line',
    card: 'shadow-sf-card',
    primaryBtn: 'bg-sf-primary text-white hover:bg-sf-primary-hover focus-visible:outline-sf-primary',
    secondaryBtn: 'focus-visible:outline-sf-primary',
    link: 'text-sf-primary hover:text-sf-primary-hover',
    soft: 'bg-sf-soft text-sf-soft-ink',
  },
} as const;

const BTN_BASE =
  'inline-flex h-10 items-center justify-center gap-2 rounded-sm px-4 text-sm font-medium no-underline transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2';

export const statusButton = (tone: StatusTone, kind: 'primary' | 'secondary' | 'ghost') => {
  const theme = STATUS_THEMES[tone];
  if (kind === 'primary') return `${BTN_BASE} ${theme.primaryBtn}`;
  if (kind === 'secondary')
    return `${BTN_BASE} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 ${theme.secondaryBtn}`;
  return `${BTN_BASE} text-slate-600 hover:bg-white/70 hover:text-slate-900 ${theme.secondaryBtn}`;
};

/** Content rises in one after another; `step` sets the order. */
export const RISE = 'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-500';
export const riseDelay = (step: number): React.CSSProperties => ({
  animationDelay: `${step * 70}ms`,
  animationFillMode: 'both',
});

const MARK_TONES = {
  red: { chip: 'bg-red-50 text-red-600', ring: 'ring-red-200' },
  amber: { chip: 'bg-amber-50 text-amber-700', ring: 'ring-amber-200' },
  blue: { chip: 'bg-blue-50 text-blue-600', ring: 'ring-blue-200' },
  orange: { chip: 'bg-sf-soft text-sf-primary', ring: 'ring-orange-200' },
  slate: { chip: 'bg-slate-100 text-slate-600', ring: 'ring-slate-200' },
} as const;

/** The large icon chip at the top of a status page, with a slow pulse ring. */
export const StatusMark: React.FC<{ icon: LucideIcon; tone: keyof typeof MARK_TONES }> = ({ icon: Icon, tone }) => (
  <span className={`relative inline-flex h-12 w-12 items-center justify-center rounded-sm ${MARK_TONES[tone].chip}`}>
    <span
      aria-hidden="true"
      className={`absolute inset-0 rounded-sm ring-1 motion-safe:animate-ping ${MARK_TONES[tone].ring}`}
      style={{ animationDuration: '2.6s' }}
    />
    <Icon size={24} strokeWidth={1.75} aria-hidden="true" />
  </span>
);

interface StatusShellProps {
  tone: StatusTone;
  /** Right side of the logo bar — e.g. who is signed in, Sign out. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}

const StatusShell: React.FC<StatusShellProps> = ({ tone, aside, children }) => {
  const theme = STATUS_THEMES[tone];
  return (
    <div className={`fixed inset-0 z-50 flex flex-col overflow-y-auto font-poppins ${theme.canvas}`}>
      <header className={`sticky top-0 z-10 flex h-14 shrink-0 items-center gap-3 border-b bg-white/85 px-4 backdrop-blur md:px-6 ${theme.line}`}>
        <img src={sellarLogo} alt="SELLAR" className="h-5 w-auto md:h-6" />
        {aside && <div className="ml-auto flex min-w-0 items-center gap-2">{aside}</div>}
      </header>
      <main className="flex flex-1 items-start md:items-center">{children}</main>
    </div>
  );
};

export default StatusShell;
