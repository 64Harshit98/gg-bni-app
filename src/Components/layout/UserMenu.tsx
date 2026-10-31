import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { LogOut, UserCog, Sparkles } from 'lucide-react';

import ShowWrapper from '../../context/ShowWrapper';
import { Permissions } from '../../enums';
import { ROUTES } from '../../constants/routes.constants';
import { logoutUser } from '../../lib/AuthOperations';

export type Theme = 'sky' | 'orange';

export const THEMES: Record<Theme, {
  navActive: string; qaActive: string; qaIconActive: string; qaIconIdle: string;
  avatar: string; searchHover: string;
}> = {
  sky: {
    navActive: 'bg-blue-600 text-white shadow-md shadow-blue-600/25',
    qaActive: 'border-blue-200 bg-blue-50 text-slate-900',
    qaIconActive: 'bg-blue-100 text-blue-600',
    qaIconIdle: 'bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-600',
    avatar: 'bg-blue-600 ring-blue-600/20',
    searchHover: 'hover:border-blue-300',
  },
  orange: {
    navActive: 'bg-orange-700 text-white shadow-md shadow-orange-700/25',      // primary #c2410c
    qaActive: 'border-orange-200 bg-orange-100 text-orange-800',               // primary-soft #ffedd5 + soft-ink #9a3412
    qaIconActive: 'bg-orange-200 text-orange-800',
    qaIconIdle: 'bg-slate-100 text-slate-600 group-hover:bg-orange-100 group-hover:text-orange-800',
    avatar: 'bg-orange-700 ring-orange-700/20',
    searchHover: 'hover:border-orange-600',                                     // focus-ring #ea580c
  },
};

export function initials(name?: string) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, theme = 'sky' }: { name?: string; theme?: Theme }) {
  return (
    <span className={`flex size-8 shrink-0 items-center justify-center rounded-sm text-[11px] font-semibold text-white ring-2 ${THEMES[theme].avatar}`}>
      {initials(name)}
    </span>
  );
}

interface UserMenuProps {
  userName?: string;
  /** Button content (avatar / avatar + name) */
  children: ReactNode;
  buttonClassName?: string;
  /** Where the menu opens relative to the button */
  placement?: 'top-left' | 'bottom-right';
  /** 'sky' = POS, 'orange' = Catalogue */
  theme?: Theme;
  /** Optional overrides for the menu links */
  accountTo?: string;
  addonsTo?: string;
}

/** Small dependency-free dropdown (no shadcn dropdown-menu needed). */
export function UserMenu({
  userName,
  children,
  buttonClassName = '',
  placement = 'bottom-right',
  theme = 'sky',
  accountTo,
  addonsTo,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
const ref = useRef<HTMLDivElement>(null);
const btnRef = useRef<HTMLButtonElement>(null);
const menuRef = useRef<HTMLDivElement>(null);
const [coords, setCoords] = useState<{ top?: number; bottom?: number; left?: number; right?: number }>({});

// Button ki position se menu ke fixed coordinates nikalo
useLayoutEffect(() => {
  if (!open || !btnRef.current) return;
  const r = btnRef.current.getBoundingClientRect();
  setCoords(
    placement === 'top-left'
      ? { bottom: window.innerHeight - r.top + 8, left: r.left }
      : { top: r.bottom + 8, right: window.innerWidth - r.right }
  );
}, [open, placement]);

  useEffect(() => {
  if (!open) return;
  const onDown = (e: MouseEvent) => {
    const t = e.target as Node;
    if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
    setOpen(false);
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
  const close = () => setOpen(false);
  document.addEventListener('mousedown', onDown);
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', close); // fixed menu resize pe stale na ho
  return () => {
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', close);
  };
}, [open]);

  //const pos = placement === 'top-left' ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2';
  const item =
    'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100';

  const isCatalogue = theme === 'orange';
  const accountPath =
    accountTo ?? (isCatalogue ? ROUTES.CATALOGUE_ACCOUNTS : ROUTES.ACCOUNT);
  const addonsPath =
    addonsTo ??
    (isCatalogue
      ? `${ROUTES.CHOME}/${ROUTES.CATA_ADDITIONAL_SERVICES}`
      : ROUTES.ADDITIONAL_FEATURES);

  return (
    <div ref={ref} className="relative">
  <button ref={btnRef} type="button" onClick={() => setOpen((o) => !o)} className={buttonClassName}>
    {children}
  </button>

  {open &&
    createPortal(
      <div
        ref={menuRef}
        style={{ position: 'fixed', ...coords }}
        className="z-[1000] w-56 rounded-sm border border-slate-200 bg-white p-1.5 shadow-xl"
      >
          <p className="truncate px-3 py-2 text-xs font-medium text-slate-500">
            Signed in as {userName || 'Account'}
          </p>
          <div className="my-1 border-t border-slate-100" />
          <Link to={accountPath} onClick={() => setOpen(false)} className={item}>
            <UserCog className="size-4" /> Account
          </Link>
          <ShowWrapper requiredPermission={Permissions.ViewAddons}>
            <Link to={addonsPath} onClick={() => setOpen(false)} className={item}>
              <Sparkles className="size-4" /> Add-ons
            </Link>
          </ShowWrapper>
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void logoutUser();
            }}
            className={`${item} text-red-600 hover:bg-red-50`}
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}