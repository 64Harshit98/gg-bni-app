import { useEffect, useRef, useState, type ReactNode } from 'react';
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
    navActive: 'bg-orange-500 text-white shadow-md shadow-orange-500/25',
    qaActive: 'border-orange-200 bg-orange-50 text-slate-900',
    qaIconActive: 'bg-orange-100 text-orange-600',
    qaIconIdle: 'bg-slate-100 text-slate-600 group-hover:bg-orange-100 group-hover:text-orange-600',
    avatar: 'bg-orange-500 ring-orange-500/20',
    searchHover: 'hover:border-orange-300',
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
}

/** Small dependency-free dropdown (no shadcn dropdown-menu needed). */
export function UserMenu({ userName, children, buttonClassName = '', placement = 'bottom-right' }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pos = placement === 'top-left' ? 'bottom-full left-0 mb-2' : 'top-full right-0 mt-2';
  const item =
    'flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100';

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={buttonClassName}>
        {children}
      </button>

      {open && (
        <div className={`absolute z-[300] w-56 rounded-sm border border-slate-200 bg-white p-1.5 shadow-xl ${pos}`}>
          <p className="truncate px-3 py-2 text-xs font-medium text-slate-500">
            Signed in as {userName || 'Account'}
          </p>
          <div className="my-1 border-t border-slate-100" />
          <Link to={ROUTES.ACCOUNT} onClick={() => setOpen(false)} className={item}>
            <UserCog className="size-4" /> Account
          </Link>
          <ShowWrapper requiredPermission={Permissions.ViewAddons}>
            <Link to={ROUTES.ADDITIONAL_FEATURES} onClick={() => setOpen(false)} className={item}>
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
        </div>
      )}
    </div>
  );
}