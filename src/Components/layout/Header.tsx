import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Bell, LogOut, Search, Sparkles, UserCog } from 'lucide-react';

import { Avatar, AvatarFallback } from '@/Components/ui/avatar';
import { ThemeToggle } from '@/Components/ui/theme-toggle';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/Components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/Components/ui/dropdown-menu';
import ShowWrapper from '../../context/ShowWrapper';
import { Permissions } from '../../enums';
import { ROUTES } from '../../constants/routes.constants';
import { logoutUser } from '../../lib/AuthOperations';
import { CommandPalette } from './CommandPalette';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

interface HeaderProps {
  navItems: NavItem[];
  userName?: string;
}

function initials(name?: string) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '');
}

export function Header({ navItems, userName }: HeaderProps) {
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const pageLabel =
    navItems.find((n) => n.to === location.pathname)?.label ??
    (location.pathname === ROUTES.EDIT_PROFILE ? 'Edit Profile' : 'Sellar');

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
      <header className="glass sticky top-0 z-30 mx-3 mt-3 hidden shrink-0 items-center gap-3 rounded-2xl px-4 py-3 shadow-sm md:flex">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{pageLabel}</p>
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="ml-4 flex flex-1 max-w-sm items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">Search pages &amp; actions…</span>
          <kbd className="ml-auto shrink-0 rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Notifications"
                className="relative flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Bell className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">Notifications</p>
              </div>
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                You're all caught up.
              </div>
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="AI assistant"
                title="AI assistant — coming soon"
                className="flex size-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <Sparkles className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-4 text-sm text-muted-foreground">
              The AI assistant is coming in a future update.
            </PopoverContent>
          </Popover>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ml-1 flex items-center rounded-full">
                <Avatar className="size-8 ring-2 ring-primary/20">
                  <AvatarFallback className="bg-gradient-brand text-[11px] font-semibold text-white">
                    {initials(userName).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Signed in as {userName || 'Account'}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to={ROUTES.ACCOUNT} className="flex items-center gap-2">
                  <UserCog className="size-4" /> Account
                </Link>
              </DropdownMenuItem>
              <ShowWrapper requiredPermission={Permissions.ViewAddons}>
                <DropdownMenuItem asChild>
                  <Link to={ROUTES.ADDITIONAL_FEATURES} className="flex items-center gap-2">
                    <Sparkles className="size-4" /> Add-ons
                  </Link>
                </DropdownMenuItem>
              </ShowWrapper>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  void logoutUser();
                }}
                className="flex items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </>
  );
}
