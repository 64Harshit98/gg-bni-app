import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';

import ShowWrapper from '../../context/ShowWrapper';
import { Permissions } from '../../enums';
import NotificationBell from '../NotificationBell';
import { CommandPalette, type Destination } from './CommandPalette';
import { Avatar, UserMenu, THEMES, type Theme } from './UserMenu';

interface NavItem {
  to: string;
  icon: ReactNode;
  label: string;
}

interface HeaderProps {
  navItems: NavItem[];
  userName?: string;
  theme?: Theme;
  destinations?: Destination[];
  /** Permission that shows the notification bell */
  notificationPermission?: any;
  joinedBelow?: boolean; 
}

export function Header({
  navItems,
  userName,
  theme = 'sky',
  destinations,
  notificationPermission = Permissions.HiddenProFeatures,
}: HeaderProps) {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const path = location.pathname;
  const pageLabel =
    navItems.find((n) => n.to === path)?.label ??
    navItems.find((n) => n.to !== '/' && path.startsWith(n.to))?.label ??
    'Sellar';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <header className="sticky top-0 z-30 mx-3 mt-3 hidden shrink-0 items-center gap-3 ${joinedBelow ? 'rounded-t-sm' : 'rounded-sm'} border border-slate-200/80 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-md md:flex">
        <p className="min-w-0 truncate text-sm font-semibold text-slate-800">{pageLabel}</p>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className={`ml-4 flex max-w-sm flex-1 items-center gap-2 rounded-sm border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500 transition-colors ${THEMES[theme].searchHover} hover:text-slate-800`}
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">Search pages &amp; actions…</span>
          <kbd className="ml-auto shrink-0 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium">
            Ctrl K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <ShowWrapper requiredPermission={notificationPermission}>
            <NotificationBell />
          </ShowWrapper>

          <UserMenu userName={userName} placement="bottom-right" buttonClassName="flex items-center rounded-sm">
            <Avatar name={userName} theme={theme} />
          </UserMenu>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} destinations={destinations} />
    </>
  );
}